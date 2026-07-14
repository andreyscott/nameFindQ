/**
 * tests/logic.test.ts
 *
 * Logic & error-path tests — validates error handling, edge cases,
 * schema validation, API response shapes, and failure resilience.
 * No live network calls — all external dependencies are mocked.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ── 1. Zod schema validation (mirrors NameResultSchema in route) ──────────────
const NameResultSchema = z.object({
  query_tags: z.array(z.string()),
  results: z.array(
    z.object({
      name: z.string(),
      primary_meaning: z.string(),
      contextual_meaning: z.string().optional(),
      region_origin: z.string().optional(),
      ethnicity_tribe: z.string().optional(),
      linguistic_root: z.string().optional(),
      gender: z.string().optional(),
      pronunciation: z.string().optional(),
      etymology_node: z.any().optional(),
    })
  ),
});

describe('NameResultSchema validation', () => {
  it('accepts a fully valid AI response', () => {
    const valid = {
      query_tags: ['BIBLICAL', 'HEBREW', 'MASCULINE'],
      results: [
        {
          name: 'Daniel',
          primary_meaning: 'God is my judge',
          contextual_meaning: 'Given to prophets and leaders in the Hebrew tradition.',
          region_origin: 'Ancient Israel',
          ethnicity_tribe: 'Hebrew',
          linguistic_root: 'El (God) + Dan (Judge)',
          gender: 'Masculine',
          pronunciation: 'DAN-yel',
          etymology_node: { era: 'Biblical Era', historical_context: 'First attested in the Book of Daniel.' },
        },
      ],
    };
    expect(() => NameResultSchema.parse(valid)).not.toThrow();
  });

  it('rejects a response with missing query_tags', () => {
    const bad = { results: [{ name: 'Ada', primary_meaning: 'First daughter' }] };
    expect(() => NameResultSchema.parse(bad)).toThrow();
  });

  it('rejects a response where results is not an array', () => {
    const bad = { query_tags: ['IGBO'], results: 'not an array' };
    expect(() => NameResultSchema.parse(bad)).toThrow();
  });

  it('rejects a result item with missing primary_meaning', () => {
    const bad = { query_tags: ['IGBO'], results: [{ name: 'Ada' }] };
    expect(() => NameResultSchema.parse(bad)).toThrow();
  });

  it('accepts results with only required fields (optional fields absent)', () => {
    const minimal = {
      query_tags: ['TEST'],
      results: [{ name: 'Zara', primary_meaning: 'Radiance' }],
    };
    expect(() => NameResultSchema.parse(minimal)).not.toThrow();
  });

  it('rejects an empty results array as still schema-valid (no min constraint)', () => {
    // Schema does not enforce minimum results — that is handled by route logic
    const empty = { query_tags: ['EMPTY'], results: [] };
    expect(() => NameResultSchema.parse(empty)).not.toThrow();
  });
});

// ── 2. JSON parse resilience ──────────────────────────────────────────────────
function parseAiJson(raw: string): any {
  const cleaned = raw.replace(/```json\n?|```/g, '').trim();
  return JSON.parse(cleaned);
}

describe('AI JSON response parsing', () => {
  it('parses clean JSON', () => {
    const raw = '{"query_tags":["A"],"results":[]}';
    expect(parseAiJson(raw)).toEqual({ query_tags: ['A'], results: [] });
  });

  it('strips markdown code fences before parsing', () => {
    const raw = '```json\n{"query_tags":["B"],"results":[]}\n```';
    expect(parseAiJson(raw)).toEqual({ query_tags: ['B'], results: [] });
  });

  it('throws SyntaxError on malformed JSON', () => {
    expect(() => parseAiJson('not valid json')).toThrow(SyntaxError);
  });

  it('throws SyntaxError on truncated JSON', () => {
    expect(() => parseAiJson('{"query_tags":["A"],"results":[{')).toThrow(SyntaxError);
  });

  it('throws on empty string', () => {
    expect(() => parseAiJson('')).toThrow();
  });
});

// ── 3. Route input validation edge cases ──────────────────────────────────────
function validateQuery(query: string): string | null {
  if (!query || query.trim().length === 0) return 'Query is required.';
  if (query.length > 300) return 'Query must be 300 characters or fewer.';
  return null;
}

describe('query input validation', () => {
  it('returns null for a valid query', () => {
    expect(validateQuery('Igbo warrior names')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(validateQuery('')).toBe('Query is required.');
  });

  it('rejects a whitespace-only string', () => {
    expect(validateQuery('   ')).toBe('Query is required.');
  });

  it('rejects a query exceeding 300 characters', () => {
    expect(validateQuery('a'.repeat(301))).toBe('Query must be 300 characters or fewer.');
  });

  it('accepts a query of exactly 300 characters', () => {
    expect(validateQuery('a'.repeat(300))).toBeNull();
  });
});

// ── 4. Rate limit error message surface ───────────────────────────────────────
function buildErrorResponse(status: number, message: string) {
  return { error: message, status };
}

describe('error response builder', () => {
  it('includes the message in the error object', () => {
    const r = buildErrorResponse(429, 'Too many requests. Please wait.');
    expect(r.error).toBe('Too many requests. Please wait.');
    expect(r.status).toBe(429);
  });

  it('uses 401 for auth errors', () => {
    const r = buildErrorResponse(401, 'Authentication required. Please sign in.');
    expect(r.status).toBe(401);
  });

  it('uses 500 for internal errors', () => {
    const r = buildErrorResponse(500, 'Server configuration error.');
    expect(r.status).toBe(500);
  });
});

// ── 5. TreeData structure validation ─────────────────────────────────────────
const TreeDataSchema = z.object({
  name: z.string().min(1),
  root_label: z.string().min(1),
  root_meaning: z.string().min(1),
  primary_epoch: z.string().min(1),
  primary_context: z.string().min(1),
  region: z.string().min(1),
  tribe: z.string().min(1),
  branches: z.array(z.object({
    name: z.string().min(1),
    variant_type: z.enum(['Direct', 'Extended', 'Feminine', 'Short Form', 'Modern']),
    sub_variant: z.string(),
    sub_variant_region: z.string(),
  })).length(3),
  narrative: z.string().min(1),
  source: z.enum(['db', 'ai', 'fallback']),
});

describe('TreeData structure', () => {
  const validTree = {
    name: 'Daniel',
    root_label: 'El (God) + Dan (Judge)',
    root_meaning: 'God is my judge',
    primary_epoch: 'Biblical Era, Ancient Hebrew',
    primary_context: 'A prophetic name from the Hebrew Bible, given to one of the great prophets.',
    region: 'Ancient Israel',
    tribe: 'Hebrew',
    branches: [
      { name: 'Daniyel', meaning: 'Archaic Hebrew form', variant_type: 'Direct', sub_variant: 'Daniyel', sub_variant_region: 'Ancient Hebrew' },
      { name: 'Daniele', meaning: 'Italian Romance variant', variant_type: 'Extended', sub_variant: 'Dani', sub_variant_region: 'Romance' },
      { name: 'Daniela', meaning: 'Feminine form', variant_type: 'Feminine', sub_variant: 'Dani', sub_variant_region: 'Modern English' },
    ],
    narrative: 'Daniel originates from the Hebrew prophetic tradition.',
    source: 'ai' as const,
  };

  it('validates a correctly shaped AI tree response', () => {
    expect(() => TreeDataSchema.parse(validTree)).not.toThrow();
  });

  it('rejects a tree with fewer than 3 branches', () => {
    const bad = { ...validTree, branches: validTree.branches.slice(0, 2) };
    expect(() => TreeDataSchema.parse(bad)).toThrow();
  });

  it('rejects an invalid variant_type', () => {
    const bad = {
      ...validTree,
      branches: [
        ...validTree.branches.slice(0, 2),
        { ...validTree.branches[2], variant_type: 'Invalid' },
      ],
    };
    expect(() => TreeDataSchema.parse(bad)).toThrow();
  });

  it('rejects a tree with an empty name', () => {
    expect(() => TreeDataSchema.parse({ ...validTree, name: '' })).toThrow();
  });

  it('rejects an unknown source value', () => {
    expect(() => TreeDataSchema.parse({ ...validTree, source: 'unknown' })).toThrow();
  });

  it('accepts source "fallback"', () => {
    expect(() => TreeDataSchema.parse({ ...validTree, source: 'fallback' })).not.toThrow();
  });

  it('accepts source "db"', () => {
    expect(() => TreeDataSchema.parse({ ...validTree, source: 'db' })).not.toThrow();
  });
});

// ── 6. Qwen error detection logic ────────────────────────────────────────────
function isQwenRateLimit(err: any): boolean {
  return (
    err?.status === 429 ||
    err?.response?.status === 429 ||
    (typeof err?.message === 'string' && err.message.includes('429'))
  );
}

function isTimeout(err: any): boolean {
  return err?.name === 'AbortError' || err?.code === 'ERR_CANCELED';
}

describe('Qwen error detection', () => {
  it('detects 429 by status property', () => {
    expect(isQwenRateLimit({ status: 429 })).toBe(true);
  });

  it('detects 429 nested inside response object', () => {
    expect(isQwenRateLimit({ response: { status: 429 } })).toBe(true);
  });

  it('detects 429 in error message string', () => {
    expect(isQwenRateLimit({ message: 'Request failed with status 429' })).toBe(true);
  });

  it('returns false for non-rate-limit errors', () => {
    expect(isQwenRateLimit({ status: 500, message: 'Server error' })).toBe(false);
  });

  it('detects AbortError as a timeout', () => {
    expect(isTimeout({ name: 'AbortError' })).toBe(true);
  });

  it('detects ERR_CANCELED (Node fetch) as a timeout', () => {
    expect(isTimeout({ code: 'ERR_CANCELED' })).toBe(true);
  });

  it('returns false for a non-timeout error', () => {
    expect(isTimeout({ name: 'SyntaxError' })).toBe(false);
  });
});

// ── 7. Backward-compat alias (short_meaning) ──────────────────────────────────
function addShortMeaningAlias(results: any[]): any[] {
  return results.map(r => ({
    ...r,
    short_meaning: r.primary_meaning || r.short_meaning || '',
  }));
}

describe('short_meaning alias', () => {
  it('copies primary_meaning into short_meaning', () => {
    const r = addShortMeaningAlias([{ name: 'Ada', primary_meaning: 'First daughter' }]);
    expect(r[0].short_meaning).toBe('First daughter');
  });

  it('preserves existing short_meaning when primary_meaning is absent', () => {
    const r = addShortMeaningAlias([{ name: 'Zara', primary_meaning: '', short_meaning: 'Brightness' }]);
    expect(r[0].short_meaning).toBe('Brightness');
  });

  it('sets empty string when both are absent', () => {
    const r = addShortMeaningAlias([{ name: 'X' }]);
    expect(r[0].short_meaning).toBe('');
  });

  it('does not overwrite other fields', () => {
    const r = addShortMeaningAlias([{ name: 'Emeka', primary_meaning: 'Great deeds', region_origin: 'Nigeria' }]);
    expect(r[0].name).toBe('Emeka');
    expect(r[0].region_origin).toBe('Nigeria');
  });
});
