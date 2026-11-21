/**
 * Tests for lib/ai/qwen.ts (chatJSON / embed) and lib/ai/schemas.ts.
 * These import the production modules directly; fetch is stubbed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { chatJSON, embed, AiError, parseModelJSON } from '../lib/ai/qwen';
import { NameResultSchema, TreeAISchema } from '../lib/ai/schemas';

const okBody = (content: string) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }], usage: { total_tokens: 42 } }),
});
const errBody = (status: number, message = 'err') => ({
  ok: false,
  status,
  json: async () => ({ error: { message } }),
});

const Simple = z.object({ a: z.number() });

beforeEach(() => {
  process.env.QWEN_API_KEY = 'test-key';
  process.env.QWEN_BASE_URL = 'https://example.test/v1';
  delete process.env.QWEN_CHAT_MODELS;
});
afterEach(() => vi.unstubAllGlobals());

describe('parseModelJSON', () => {
  it('parses plain JSON', () => expect(parseModelJSON('{"a":1}')).toEqual({ a: 1 }));
  it('strips markdown fences', () => expect(parseModelJSON('```json\n{"a":1}\n```')).toEqual({ a: 1 }));
  it('extracts the object from surrounding prose', () =>
    expect(parseModelJSON('Here you go: {"a":1} hope it helps')).toEqual({ a: 1 }));
  it('returns undefined for garbage', () => expect(parseModelJSON('not json')).toBeUndefined());
});

describe('chatJSON', () => {
  it('returns validated data from the first model', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatJSON({ schema: Simple, system: 's json', user: 'u' });
    expect(res.data).toEqual({ a: 1 });
    expect(res.model).toBe('qwen-flash');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends json response_format and max_tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okBody('{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);
    await chatJSON({ schema: Simple, system: 's json', user: 'u', maxTokens: 500 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.test/v1/chat/completions');
    const body = JSON.parse(init.body);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_tokens).toBe(500);
    expect(init.headers.Authorization).toBe('Bearer test-key');
  });

  it('falls through to the next model when output fails validation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okBody('{"a":"wrong"}'))
      .mockResolvedValueOnce(okBody('{"a":2}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatJSON({ schema: Simple, system: 's', user: 'u' });
    expect(res.data).toEqual({ a: 2 });
    expect(res.model).toBe('qwen-plus');
  });

  it('falls through when a model is not accessible (403)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errBody(403)).mockResolvedValueOnce(okBody('{"a":3}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatJSON({ schema: Simple, system: 's', user: 'u' });
    expect(res.data).toEqual({ a: 3 });
  });

  it('falls through to the next model when one is rate limited (429)', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(errBody(429)).mockResolvedValueOnce(okBody('{"a":4}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatJSON({ schema: Simple, system: 's', user: 'u' });
    expect(res.data).toEqual({ a: 4 });
    expect(res.model).toBe('qwen-plus');
  });

  it('throws rate_limited when every model is rate limited', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errBody(429));
    vi.stubGlobal('fetch', fetchMock);
    await expect(chatJSON({ schema: Simple, system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'rate_limited',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws invalid_output when every model returns bad data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okBody('nope')));
    const err = await chatJSON({ schema: Simple, system: 's', user: 'u' }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe('invalid_output');
  });

  it('throws unavailable when every model errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errBody(500)));
    await expect(chatJSON({ schema: Simple, system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'unavailable',
    });
  });

  it('maps an aborted request to timeout', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(chatJSON({ schema: Simple, system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('falls through to the next model when the first one times out', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const fetchMock = vi.fn().mockRejectedValueOnce(abort).mockResolvedValueOnce(okBody('{"a":5}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatJSON({ schema: Simple, system: 's', user: 'u' });
    expect(res.data).toEqual({ a: 5 });
    expect(res.model).toBe('qwen-plus');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('caps the first attempt so a slow model cannot eat the whole budget', async () => {
    const timeouts: number[] = [];
    const spy = vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms: number) => {
      timeouts.push(ms);
      return new AbortController().signal;
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okBody('{"a":1}')));
    await chatJSON({ schema: Simple, system: 's', user: 'u', budgetMs: 40_000 });
    spy.mockRestore();
    expect(timeouts[0]).toBeLessThan(40_000);
  });

  it('respects QWEN_CHAT_MODELS', async () => {
    process.env.QWEN_CHAT_MODELS = 'qwen-max';
    const fetchMock = vi.fn().mockResolvedValue(okBody('{"a":1}'));
    vi.stubGlobal('fetch', fetchMock);
    const res = await chatJSON({ schema: Simple, system: 's', user: 'u' });
    expect(res.model).toBe('qwen-max');
  });

  it('throws config error when the key is missing', async () => {
    delete process.env.QWEN_API_KEY;
    await expect(chatJSON({ schema: Simple, system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'config',
    });
  });
});

describe('embed', () => {
  it('returns a 1024-dim vector', async () => {
    const vec = Array.from({ length: 1024 }, () => 0.1);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ embedding: vec }] }) })
    );
    expect(await embed('hello')).toHaveLength(1024);
  });

  it('rejects a wrong-sized vector', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: [{ embedding: [1, 2] }] }) })
    );
    await expect(embed('hello')).rejects.toMatchObject({ kind: 'invalid_output' });
  });
});

describe('NameResultSchema', () => {
  const valid = {
    query_tags: ['RIVER'],
    results: [{ name: 'Odo', primary_meaning: 'River', gender: null, etymology_node: { era: 'Pre-colonial' } }],
  };
  it('accepts a valid payload and normalizes null to undefined', () => {
    const r = NameResultSchema.parse(valid);
    expect(r.results[0].gender).toBeUndefined();
  });
  it('rejects an empty results list', () => {
    expect(NameResultSchema.safeParse({ ...valid, results: [] }).success).toBe(false);
  });
  it('rejects absurdly long fields', () => {
    const long = { ...valid, results: [{ name: 'x'.repeat(200), primary_meaning: 'y' }] };
    expect(NameResultSchema.safeParse(long).success).toBe(false);
  });
  it('drops results beyond the cap', () => {
    const many = { ...valid, results: Array.from({ length: 20 }, (_, i) => ({ name: `N${i}`, primary_meaning: 'm' })) };
    expect(NameResultSchema.parse(many).results.length).toBeLessThanOrEqual(8);
  });
});

describe('TreeAISchema', () => {
  const branch = (variant_type: string) => ({
    name: 'Lucian', meaning: 'Of light', variant_type, sub_variant: 'Luciano', sub_variant_region: 'Romance',
  });
  const valid = {
    root_label: '*leuk-', root_meaning: 'Light', primary_epoch: 'PIE', primary_context: 'ctx',
    region: 'Italy', tribe: 'Latin', narrative: 'n',
    branches: [branch('Direct'), branch('Extended'), branch('Feminine')],
  };
  it('accepts a valid tree', () => expect(TreeAISchema.safeParse(valid).success).toBe(true));
  it('rejects fewer than 3 branches', () =>
    expect(TreeAISchema.safeParse({ ...valid, branches: valid.branches.slice(0, 2) }).success).toBe(false));
  it('rejects an unknown variant_type', () =>
    expect(TreeAISchema.safeParse({ ...valid, branches: [branch('Weird'), branch('Direct'), branch('Direct')] }).success).toBe(false));
  it('rejects empty strings', () => expect(TreeAISchema.safeParse({ ...valid, root_label: '' }).success).toBe(false));
});
