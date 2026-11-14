import { describe, it, expect, vi, afterEach } from 'vitest';
import { LIMITS, subjectFor, consumeRequest, consumeAiBudget, type QuotaRpc } from '../lib/quota';
import { getClientIp } from '../lib/clientIp';

const allow = (counts: number[]): ReturnType<QuotaRpc> => Promise.resolve({ allowed: true, blocked: null, counts });
const block = (blocked: number, counts: number[]): ReturnType<QuotaRpc> =>
  Promise.resolve({ allowed: false, blocked, counts });

afterEach(() => vi.unstubAllEnvs());

describe('subjectFor', () => {
  it('uses the user id when signed in', () => {
    expect(subjectFor('u-1', '1.2.3.4')).toEqual({ kind: 'user', key: 'user:u-1' });
  });
  it('hashes the IP for anonymous visitors (no raw IP stored)', () => {
    const s = subjectFor(null, '1.2.3.4');
    expect(s.kind).toBe('anon');
    expect(s.key).toMatch(/^ip:[0-9a-f]{32}$/);
    expect(s.key).not.toContain('1.2.3.4');
    expect(subjectFor(null, '1.2.3.4').key).toBe(s.key);
  });
});

describe('consumeRequest', () => {
  it('checks burst then the daily bucket with the anon limit', async () => {
    const rpc = vi.fn<QuotaRpc>().mockReturnValue(allow([1, 1]));
    const res = await consumeRequest('search', subjectFor(null, '9.9.9.9'), rpc);
    const buckets = rpc.mock.calls[0][0];
    expect(buckets.map((b) => b.windowSeconds)).toEqual([60, 86_400]);
    expect(buckets[0].limit).toBe(LIMITS.burstPerMinute);
    expect(buckets[1].limit).toBe(LIMITS.search.anon);
    expect(buckets[1].bucket).toMatch(/^search:ip:/);
    expect(res).toEqual({ allowed: true, limit: LIMITS.search.anon, remaining: LIMITS.search.anon - 1 });
  });

  it('uses the signed-in limit for users', async () => {
    const rpc = vi.fn<QuotaRpc>().mockReturnValue(allow([1, 7]));
    const res = await consumeRequest('search', subjectFor('u-1', 'x'), rpc);
    expect(rpc.mock.calls[0][0][1].limit).toBe(LIMITS.search.user);
    expect(res.remaining).toBe(LIMITS.search.user - 7);
  });

  it('reports the daily limit when it is exceeded', async () => {
    const rpc = vi.fn<QuotaRpc>().mockReturnValue(block(2, [1, 6]));
    const res = await consumeRequest('search', subjectFor(null, 'ip'), rpc);
    expect(res).toMatchObject({ allowed: false, reason: 'daily', remaining: 0 });
  });

  it('reports burst when the per-minute limit is exceeded', async () => {
    const rpc = vi.fn<QuotaRpc>().mockReturnValue(block(1, [11]));
    const res = await consumeRequest('tree', subjectFor('u', 'ip'), rpc);
    expect(res).toMatchObject({ allowed: false, reason: 'burst' });
  });

  it('fails closed in production when the quota store is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const res = await consumeRequest('search', subjectFor(null, 'ip'), () => Promise.resolve(null));
    expect(res).toMatchObject({ allowed: false, reason: 'unavailable' });
  });

  it('fails open in development when the quota store is unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const res = await consumeRequest('search', subjectFor(null, 'ip'), () => Promise.resolve(null));
    expect(res.allowed).toBe(true);
  });
});

describe('consumeAiBudget', () => {
  it('uses a single global daily bucket', async () => {
    const rpc = vi.fn<QuotaRpc>().mockReturnValue(allow([3]));
    expect(await consumeAiBudget(rpc)).toBe(true);
    expect(rpc.mock.calls[0][0]).toEqual([{ bucket: 'ai:global', windowSeconds: 86_400, limit: LIMITS.globalAiPerDay }]);
  });
  it('returns false once the global budget is spent', async () => {
    expect(await consumeAiBudget(() => block(1, [1001]))).toBe(false);
  });
});

describe('getClientIp', () => {
  const h = (o: Record<string, string>) => new Headers(o);

  it('on Vercel, trusts x-real-ip over a spoofable x-forwarded-for', () => {
    vi.stubEnv('VERCEL', '1');
    expect(getClientIp(h({ 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '6.6.6.6, 5.5.5.5' }))).toBe('5.5.5.5');
  });

  it('honours TRUSTED_IP_HEADER (e.g. on Alibaba FC)', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUSTED_IP_HEADER', 'x-client-ip');
    expect(getClientIp(h({ 'x-client-ip': '7.7.7.7', 'x-forwarded-for': '1.1.1.1' }))).toBe('7.7.7.7');
  });

  it('otherwise takes the right-most x-forwarded-for hop (not client-controlled)', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUSTED_IP_HEADER', '');
    expect(getClientIp(h({ 'x-forwarded-for': '6.6.6.6, 8.8.8.8' }))).toBe('8.8.8.8');
  });

  it('falls back to "unknown"', () => {
    vi.stubEnv('VERCEL', '');
    vi.stubEnv('TRUSTED_IP_HEADER', '');
    expect(getClientIp(h({}))).toBe('unknown');
  });
});
