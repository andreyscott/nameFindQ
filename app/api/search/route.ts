import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { z } from 'zod';
import { consumeRequest, consumeAiBudget, subjectFor, quotaDeniedResponse } from '@/lib/quota';
import { getClientIp } from '@/lib/clientIp';
import { embed, AiError } from '@/lib/ai/qwen';
import postgres from 'postgres';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface NameSearchResult {
  id: string;
  name: string;
  primary_meaning: string;
  contextual_meaning: string | null;
  vibe_tags: string[];
  ethnicity_tribe: string | null;
}

const RequestSchema = z.object({
  query: z.string().trim().min(1, 'Query is required.').max(200, 'Query must be 200 characters or fewer.'),
});

// ── Module-level postgres singleton ──────────────────────────────────────────
// Created once per serverless instance; avoids pool creation overhead on
// every request that the previous getDb() + sql.end() pattern caused.
let _sql: ReturnType<typeof postgres> | null = null;

function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL environment variable is not set.');
    }
    _sql = postgres(process.env.DATABASE_URL, {
      ssl: 'require',
      max: 3,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return _sql;
}

// ── Embedding cache (1 hour TTL) ──────────────────────────────────────────────
// Embeddings are deterministic — the same query always produces the same vector.
// Caching eliminates duplicate Qwen API calls for repeated searches.
const embeddingCache = new Map<string, { vec: number[]; ts: number }>();
const EMBEDDING_TTL = 60 * 60 * 1000;

function getCachedEmbedding(query: string): number[] | null {
  const key = query.toLowerCase().trim();
  const entry = embeddingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > EMBEDDING_TTL) {
    embeddingCache.delete(key);
    return null;
  }
  return entry.vec;
}

function setCachedEmbedding(query: string, vec: number[]): void {
  embeddingCache.set(query.toLowerCase().trim(), { vec, ts: Date.now() });
}

// ── POST /api/search ──────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let query = '';

  try {
    // 1. Content-Type guard
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    }

    // 2. Parse & validate body
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    query = parsed.data.query;

    // 3. Shared quota (counts toward the same daily "search" allowance as Vibe/Blend)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const quota = await consumeRequest('search', subjectFor(user?.id, getClientIp(request.headers)));
    if (!quota.allowed) {
      const denied = quotaDeniedResponse(quota, !!user);
      return NextResponse.json(denied.body, { status: denied.status });
    }

    // 5. ── Embedding — check cache before calling API ───────────────────────
    let embeddingValues = getCachedEmbedding(query);

    if (!embeddingValues) {
      if (!(await consumeAiBudget())) {
        return NextResponse.json(
          { error: 'Namefinder has reached its daily AI limit. Please try again tomorrow.', code: 'ai_budget' },
          { status: 503 }
        );
      }
      embeddingValues = await embed(query);
      setCachedEmbedding(query, embeddingValues);
    } else {
      console.log(`[Search] Embedding cache hit for: "${query}"`);
    }

    // 6. Vector similarity search via pgvector
    const embeddingString = `[${embeddingValues.join(',')}]`;
    const sql = getSql(); // Reuse module-level singleton — no pool creation cost

    const results = await sql<NameSearchResult[]>`
      SELECT id, name, primary_meaning, contextual_meaning, vibe_tags, ethnicity_tribe
      FROM match_names(
        ${embeddingString}::vector,
        ${0.4}::float,
        ${8}::int
      )
    `;

    return NextResponse.json(
      { query, results },
      { headers: { 'X-Quota-Limit': String(quota.limit), 'X-Quota-Remaining': String(quota.remaining) } }
    );

  } catch (error: unknown) {
    console.error('[Search] Error:', { query, message: (error as Error)?.message });

    const isRateLimit =
      error instanceof AiError && error.kind === 'rate_limited';

    if (isRateLimit) {
      return NextResponse.json(
        { error: 'Embedding service rate limited. Please try again shortly.' },
        { status: 429 }
      );
    }

    const message = error instanceof Error ? error.message : 'Semantic search failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
