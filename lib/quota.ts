import { createHash } from 'node:crypto';
import { getAdminClient } from '@/utils/supabase/admin';

/**
 * Shared quotas backed by the Supabase `api_usage` table and the
 * `consume_quota()` RPC (supabase/migrations/20261114000200_api_usage.sql).
 * Works the same on Vercel and Alibaba FC because no state lives in memory.
 *
 * Tune the numbers here.
 */
export const LIMITS = {
  /** Vibe, Blend and Semantic searches per day. */
  search: { anon: 5, user: 50 },
  /** Etymology tree lookups per day (name pages load one automatically). */
  tree: { anon: 10, user: 100 },
  /** Requests per minute per visitor across all AI features. */
  burstPerMinute: 10,
  /** Real model calls per day across the whole site — the cost kill switch. */
  globalAiPerDay: 1000,
} as const;

export type Feature = 'search' | 'tree';

export interface Subject {
  kind: 'user' | 'anon';
  key: string;
}

export interface QuotaBucket {
  bucket: string;
  windowSeconds: number;
  limit: number;
}

/** null = the quota store could not be reached. `blocked` is 1-based. */
export type QuotaRpc = (
  buckets: QuotaBucket[]
) => Promise<{ allowed: boolean; blocked: number | null; counts: number[] } | null>;

export interface QuotaResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reason?: 'burst' | 'daily' | 'unavailable';
}

const DAY = 86_400;
const MINUTE = 60;

export function subjectFor(userId: string | null | undefined, ip: string): Subject {
  if (userId) return { kind: 'user', key: `user:${userId}` };
  const salt = process.env.QUOTA_SALT ?? 'namefinder';
  const hash = createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
  return { kind: 'anon', key: `ip:${hash}` };
}

export const supabaseQuotaRpc: QuotaRpc = async (buckets) => {
  const admin = getAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc('consume_quota', {
    p_buckets: buckets.map((b) => b.bucket),
    p_windows: buckets.map((b) => b.windowSeconds),
    p_limits: buckets.map((b) => b.limit),
  });
  if (error || !data) {
    console.error('[quota] consume_quota failed:', error?.message ?? 'no data');
    return null;
  }
  return data as { allowed: boolean; blocked: number | null; counts: number[] };
};

function storeUnavailable(limit: number): QuotaResult {
  if (process.env.NODE_ENV === 'production') {
    return { allowed: false, limit, remaining: 0, reason: 'unavailable' };
  }
  console.warn('[quota] store unavailable — allowing request (development only)');
  return { allowed: true, limit, remaining: limit };
}

/** Counts one request against the visitor's burst and daily limits. */
export async function consumeRequest(
  feature: Feature,
  subject: Subject,
  rpc: QuotaRpc = supabaseQuotaRpc
): Promise<QuotaResult> {
  const limit = LIMITS[feature][subject.kind];
  const result = await rpc([
    { bucket: `burst:${subject.key}`, windowSeconds: MINUTE, limit: LIMITS.burstPerMinute },
    { bucket: `${feature}:${subject.key}`, windowSeconds: DAY, limit },
  ]);
  if (!result) return storeUnavailable(limit);

  if (!result.allowed) {
    return { allowed: false, limit, remaining: 0, reason: result.blocked === 1 ? 'burst' : 'daily' };
  }
  const used = result.counts[1] ?? 0;
  return { allowed: true, limit, remaining: Math.max(limit - used, 0) };
}

/** Counts one real model call against the site-wide daily budget. */
export async function consumeAiBudget(rpc: QuotaRpc = supabaseQuotaRpc): Promise<boolean> {
  const result = await rpc([{ bucket: 'ai:global', windowSeconds: DAY, limit: LIMITS.globalAiPerDay }]);
  if (!result) return storeUnavailable(LIMITS.globalAiPerDay).allowed;
  return result.allowed;
}

/** Standard JSON body + status for a denied request. */
export function quotaDeniedResponse(q: QuotaResult, signedIn: boolean) {
  if (q.reason === 'unavailable') {
    return { status: 503, body: { error: 'Search is temporarily unavailable. Please try again shortly.', code: 'unavailable' } };
  }
  if (q.reason === 'burst') {
    return { status: 429, body: { error: 'Too many requests. Please wait a minute and try again.', code: 'burst' } };
  }
  return {
    status: 429,
    body: {
      error: signedIn
        ? `You've reached today's limit of ${q.limit}. Please come back tomorrow.`
        : `You've used your ${q.limit} free searches for today. Sign in for more.`,
      code: 'quota_exceeded',
      signedIn,
      limit: q.limit,
    },
  };
}
