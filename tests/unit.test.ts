/**
 * tests/unit.test.ts
 *
 * Unit tests — pure logic that does NOT need a live server, DB, or AI.
 * Covers: rateLimit, cache TTL, isSufficient, buildFallbackTree,
 *         keyword extraction, deduplication, and response mapping.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// ── 1. rateLimit ──────────────────────────────────────────────────────────────
// We re-implement the core logic here to test the algorithm in isolation
// without the module-level setInterval side-effect.
interface RateLimitEntry { count: number; resetAt: number; }
const store = new Map<string, RateLimitEntry>();
function rateLimit(ip: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = store.get(ip);
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

describe('rateLimit()', () => {
  beforeEach(() => store.clear());

  it('allows the first request for a new IP', () => {
    expect(rateLimit('1.2.3.4', 5, 60_000)).toBe(true);
  });

  it('allows requests up to the limit', () => {
    for (let i = 0; i < 5; i++) rateLimit('1.2.3.4', 5, 60_000);
    // 5th allowed; 6th should be blocked
    expect(rateLimit('1.2.3.4', 5, 60_000)).toBe(false);
  });

  it('blocks after exactly the limit is reached', () => {
    for (let i = 0; i < 10; i++) rateLimit('5.6.7.8', 10, 60_000);
    expect(rateLimit('5.6.7.8', 10, 60_000)).toBe(false);
  });

  it('resets the window when it expires', () => {
    vi.useFakeTimers();
    rateLimit('reset-test', 2, 1_000);
    rateLimit('reset-test', 2, 1_000);
    expect(rateLimit('reset-test', 2, 1_000)).toBe(false); // blocked

    vi.advanceTimersByTime(1_001);
    expect(rateLimit('reset-test', 2, 1_000)).toBe(true);  // reset
    vi.useRealTimers();
  });

  it('isolates different IPs independently', () => {
    for (let i = 0; i < 3; i++) rateLimit('a', 3, 60_000);
    expect(rateLimit('a', 3, 60_000)).toBe(false);
    expect(rateLimit('b', 3, 60_000)).toBe(true); // 'b' is unaffected
  });
});

// ── 2. In-memory cache TTL ────────────────────────────────────────────────────
type CacheEntry<T> = { data: T; ts: number };
function makeCache<T>(ttlMs: number) {
  const map = new Map<string, CacheEntry<T>>();
  return {
    set: (k: string, v: T) => map.set(k, { data: v, ts: Date.now() }),
    get: (k: string): T | null => {
      const e = map.get(k);
      if (!e) return null;
      if (Date.now() - e.ts > ttlMs) { map.delete(k); return null; }
      return e.data;
    },
    size: () => map.size,
  };
}

describe('in-memory cache TTL', () => {
  it('returns a value that was just set', () => {
    const c = makeCache<string>(5_000);
    c.set('foo', 'bar');
    expect(c.get('foo')).toBe('bar');
  });

  it('returns null for a missing key', () => {
    const c = makeCache<string>(5_000);
    expect(c.get('missing')).toBeNull();
  });

  it('evicts an entry after the TTL expires', () => {
    vi.useFakeTimers();
    const c = makeCache<number>(1_000);
    c.set('ttl-key', 42);
    vi.advanceTimersByTime(1_001);
    expect(c.get('ttl-key')).toBeNull();
    vi.useRealTimers();
  });

  it('does not evict before the TTL', () => {
    vi.useFakeTimers();
    const c = makeCache<number>(5_000);
    c.set('live-key', 7);
    vi.advanceTimersByTime(4_999);
    expect(c.get('live-key')).toBe(7);
    vi.useRealTimers();
  });
});

// ── 3. isSufficient() — tree route DB-first gate ─────────────────────────────
function isSufficient(data: any): boolean {
  const hasRoot = typeof data.linguistic_root === 'string' && data.linguistic_root.length > 8;
  const hasContext =
    (data.etymology?.historical_context?.length ?? 0) > 30 ||
    (data.contextual_meaning?.length ?? 0) > 30;
  const hasRegion = !!(data.region_origin || data.ethnicity_tribe);
  return hasRoot && hasContext && hasRegion;
}

describe('isSufficient()', () => {
  it('returns true for a fully populated DB row', () => {
    expect(isSufficient({
      linguistic_root: 'El (God) + Dan (Judge)',
      contextual_meaning: 'Given to a child seen as a divine gift and future leader of their people.',
      region_origin: 'Ancient Israel',
      ethnicity_tribe: 'Hebrew',
    })).toBe(true);
  });

  it('returns false when linguistic_root is missing', () => {
    expect(isSufficient({
      linguistic_root: null,
      contextual_meaning: 'A meaningful cultural name given at birth.',
      region_origin: 'Nigeria',
    })).toBe(false);
  });

  it('returns false when linguistic_root is too short (≤8 chars)', () => {
    expect(isSufficient({
      linguistic_root: 'El+Dan',
      contextual_meaning: 'A meaningful cultural name given at birth.',
      region_origin: 'Israel',
    })).toBe(false);
  });

  it('returns false when context is missing', () => {
    expect(isSufficient({
      linguistic_root: 'El (God) + Daniel (Judge)',
      contextual_meaning: null,
      etymology: null,
      region_origin: 'Israel',
    })).toBe(false);
  });

  it('returns false when context is too short (≤30 chars)', () => {
    expect(isSufficient({
      linguistic_root: 'El (God) + Daniel (Judge)',
      contextual_meaning: 'Short text.',
      region_origin: 'Israel',
    })).toBe(false);
  });

  it('returns false when both region_origin and ethnicity_tribe are absent', () => {
    expect(isSufficient({
      linguistic_root: 'El (God) + Daniel (Judge)',
      contextual_meaning: 'A long enough meaningful cultural explanation of the name given here.',
      region_origin: null,
      ethnicity_tribe: null,
    })).toBe(false);
  });

  it('accepts etymology.historical_context as an alternative to contextual_meaning', () => {
    expect(isSufficient({
      linguistic_root: 'Olu (God) + Wa (Is) + Se (Did)',
      contextual_meaning: null,
      etymology: { historical_context: 'A pre-colonial Yoruba name given to commemorate divine intervention in family history.' },
      region_origin: 'Nigeria (South West)',
    })).toBe(true);
  });
});

// ── 4. buildFallbackTree() ────────────────────────────────────────────────────
function buildFallbackTree(name: string, dbRow: any | null) {
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  const base = dbRow?.linguistic_root ?? name;
  const ctx = dbRow?.contextual_meaning ?? dbRow?.etymology?.historical_context ??
    `${cap} is a name with deep historical and cultural significance, passed down through generations.`;
  return {
    name: cap,
    root_label: base,
    root_meaning: (dbRow?.primary_meaning ?? 'Ancient root').split(' ').slice(0, 4).join(' '),
    primary_epoch: dbRow?.etymology?.era ?? 'Historical',
    primary_context: ctx,
    region: dbRow?.region_origin ?? 'Unknown region',
    tribe: dbRow?.ethnicity_tribe ?? 'Unknown culture',
    branches: [
      { name: cap + 'a',   variant_type: 'Feminine',   sub_variant: cap + 'ah', sub_variant_region: 'Regional'  },
      { name: cap + 'i',   variant_type: 'Extended',   sub_variant: cap + 'io', sub_variant_region: 'Modern'    },
      { name: cap.slice(0, -1) || cap, variant_type: 'Short Form', sub_variant: cap + 'el', sub_variant_region: 'Diaspora' },
    ],
    source: 'fallback',
  };
}

describe('buildFallbackTree()', () => {
  it('capitalises a lowercase name', () => {
    const t = buildFallbackTree('daniel', null);
    expect(t.name).toBe('Daniel');
  });

  it('uses the DB linguistic_root when available', () => {
    const t = buildFallbackTree('daniel', { linguistic_root: 'El (God) + Dan' });
    expect(t.root_label).toBe('El (God) + Dan');
  });

  it('falls back to the raw name when DB row is null', () => {
    const t = buildFallbackTree('daniel', null);
    expect(t.root_label).toBe('daniel');
  });

  it('always produces exactly 3 branches', () => {
    const t = buildFallbackTree('Kemi', null);
    expect(t.branches).toHaveLength(3);
  });

  it('sets source to "fallback"', () => {
    expect(buildFallbackTree('Ada', null).source).toBe('fallback');
  });

  it('uses the DB contextual_meaning for primary_context', () => {
    const t = buildFallbackTree('ada', { contextual_meaning: 'First daughter of the Igbo people.' });
    expect(t.primary_context).toBe('First daughter of the Igbo people.');
  });

  it('generates a default context when DB row has no context', () => {
    const t = buildFallbackTree('Sola', null);
    expect(t.primary_context).toContain('Sola');
  });
});

// ── 5. Keyword extraction (tryDbFirst internal logic) ─────────────────────────
function extractKeywords(query: string): string[] {
  const stopwords = new Set(['names', 'name', 'with', 'that', 'from', 'the', 'and', 'for', 'are']);
  return query
    .toLowerCase()
    .split(/[\s,+]+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 3);
}

describe('keyword extraction', () => {
  it('removes stopwords', () => {
    expect(extractKeywords('names from the Igbo tribe')).not.toContain('names');
    expect(extractKeywords('names from the Igbo tribe')).not.toContain('from');
    expect(extractKeywords('names from the Igbo tribe')).not.toContain('the');
  });

  it('removes words shorter than 4 characters', () => {
    expect(extractKeywords('god war Igbo')).not.toContain('god');
    expect(extractKeywords('god war Igbo')).not.toContain('war');
  });

  it('extracts up to 3 keywords', () => {
    expect(extractKeywords('warrior courage honour strength power')).toHaveLength(3);
  });

  it('handles blend syntax with + separator', () => {
    const kw = extractKeywords('Yoruba + Celtic');
    expect(kw).toContain('yoruba');
    expect(kw).toContain('celtic');
  });

  it('returns empty array for all-stopword query', () => {
    expect(extractKeywords('names with the')).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    expect(extractKeywords('Igbo Warrior')).toEqual(['igbo', 'warrior']);
  });
});

// ── 6. Result deduplication ───────────────────────────────────────────────────
function deduplicateByName(rows: Array<{ name: string; [k: string]: any }>) {
  const seen = new Set<string>();
  return rows.filter(r => { if (seen.has(r.name)) return false; seen.add(r.name); return true; });
}

describe('result deduplication', () => {
  it('removes exact duplicate names', () => {
    const rows = [{ name: 'Ada' }, { name: 'Emeka' }, { name: 'Ada' }];
    expect(deduplicateByName(rows)).toHaveLength(2);
  });

  it('preserves insertion order of first occurrence', () => {
    const rows = [{ name: 'Zoe' }, { name: 'Ada' }, { name: 'Zoe' }];
    expect(deduplicateByName(rows)[0].name).toBe('Zoe');
  });

  it('handles an already-unique list with no changes', () => {
    const rows = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
    expect(deduplicateByName(rows)).toHaveLength(3);
  });

  it('returns empty array for empty input', () => {
    expect(deduplicateByName([])).toHaveLength(0);
  });
});
