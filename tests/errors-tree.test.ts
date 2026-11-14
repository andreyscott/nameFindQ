import { describe, it, expect, vi } from 'vitest';
import { AiError } from '../lib/ai/qwen';
import { apiErrorResponse } from '../lib/apiError';
import { buildFallbackTree, mapDbToTree, isSufficient, type DbNameRow } from '../lib/tree';

describe('apiErrorResponse', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  it('maps an AI rate limit to 503 without leaking the provider message', () => {
    const r = apiErrorResponse(new AiError('rate_limited', 'qwen-plus HTTP 429: secret provider text'), 'T');
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('ai_busy');
    expect(JSON.stringify(r.body)).not.toContain('secret');
    expect(r.body.errorId).toMatch(/^[0-9a-f]{8}$/);
  });
  it('maps a timeout to 504', () => {
    expect(apiErrorResponse(new AiError('timeout', 'x'), 'T').status).toBe(504);
  });
  it('maps invalid output to 502', () => {
    expect(apiErrorResponse(new AiError('invalid_output', 'x'), 'T').body.code).toBe('ai_unavailable');
  });
  it('hides unknown errors (e.g. DB messages) behind a generic 500', () => {
    const r = apiErrorResponse(new Error('relation "names" does not exist'), 'T');
    expect(r.status).toBe(500);
    expect(r.body.error).not.toMatch(/relation|names/);
  });
});

const row = (over: Partial<DbNameRow> = {}): DbNameRow => ({
  id: '1', source: 'seed', linguistic_root: 'Ada (daughter) + Eze (king)', primary_meaning: 'Daughter of the king',
  contextual_meaning: 'Given to a girl born into a royal or noble family in Igboland.', region_origin: 'Nigeria',
  ethnicity_tribe: 'Igbo', etymology: null, ...over,
});

describe('buildFallbackTree', () => {
  it('never invents variants', () => {
    const t = buildFallbackTree('ada', null);
    expect(t.branches).toEqual([]);
    expect(t.source).toBe('fallback');
    expect(t.name).toBe('Ada');
  });
  it('says plainly when no etymology is documented', () => {
    expect(buildFallbackTree('zed', null).primary_context).toMatch(/don't have a documented etymology/i);
  });
  it('uses real DB fields when available', () => {
    const t = buildFallbackTree('adaeze', row());
    expect(t.root_label).toBe('Ada (daughter) + Eze (king)');
    expect(t.tribe).toBe('Igbo');
  });
});

describe('mapDbToTree', () => {
  it('uses only recorded related variants', () => {
    const t = mapDbToTree('Adaeze', row({ etymology: { related_variants: ['Ada', 'Eze'] } }));
    expect(t.branches.map((b) => b.name)).toEqual(['Ada', 'Eze']);
    expect(t.branches.every((b) => b.variant_type === 'Related form')).toBe(true);
  });
  it('does not pad with made-up names', () => {
    expect(mapDbToTree('Adaeze', row()).branches).toEqual([]);
  });
});

describe('isSufficient', () => {
  it('requires recorded variants so the tree has real branches', () => {
    expect(isSufficient(row())).toBe(false);
    expect(isSufficient(row({ etymology: { related_variants: ['Ada'] } }))).toBe(true);
  });
});
