import type { ZodType } from 'zod';

/**
 * lib/ai/qwen.ts
 *
 * The single way this app talks to Alibaba DashScope (Qwen).
 *  - chatJSON(): JSON-mode chat completion validated against a zod schema
 *  - embed():    text-embedding-v3 vector (1024 dims)
 *
 * Cost/latency policy: try at most two models (cheapest first), one attempt
 * each, inside a shared time budget. A 429 stops immediately.
 */

export type AiErrorKind = 'config' | 'rate_limited' | 'timeout' | 'invalid_output' | 'unavailable';

export class AiError extends Error {
  constructor(public kind: AiErrorKind, message: string) {
    super(message);
    this.name = 'AiError';
  }
}

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
// The current workspace key only has qwen-turbo access (see commit 649fc4d),
// so the cheapest model goes first. Override with QWEN_CHAT_MODELS.
const DEFAULT_MODELS = ['qwen-turbo', 'qwen-plus'];
const MAX_MODELS = 2;
const DEFAULT_BUDGET_MS = 20_000;

function config() {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) throw new AiError('config', 'QWEN_API_KEY is not set');
  const baseURL = (process.env.QWEN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const models = (process.env.QWEN_CHAT_MODELS?.split(',').map((m) => m.trim()).filter(Boolean) ??
    DEFAULT_MODELS).slice(0, MAX_MODELS);
  return { apiKey, baseURL, models: models.length ? models : DEFAULT_MODELS };
}

/** Parse model text into JSON: tolerates code fences and surrounding prose. */
export function parseModelJSON(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end <= start) return undefined;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return undefined;
    }
  }
}

function isAbort(err: unknown): boolean {
  const name = (err as { name?: string })?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

export interface ChatJSONOptions<T> {
  schema: ZodType<T>;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  budgetMs?: number;
}

export interface ChatJSONResult<T> {
  data: T;
  model: string;
  totalTokens?: number;
}

export async function chatJSON<T>(opts: ChatJSONOptions<T>): Promise<ChatJSONResult<T>> {
  const { apiKey, baseURL, models } = config();
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS);
  let lastKind: AiErrorKind = 'unavailable';
  let lastMessage = 'no model attempted';

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining <= 500) {
      lastKind = 'timeout';
      lastMessage = 'time budget exhausted';
      break;
    }

    let res: Response;
    try {
      res = await fetch(`${baseURL}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: opts.system },
            { role: 'user', content: opts.user },
          ],
          temperature: opts.temperature ?? 0.6,
          max_tokens: opts.maxTokens ?? 1500,
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(remaining),
      });
    } catch (err) {
      if (isAbort(err)) throw new AiError('timeout', `${model} timed out`);
      lastKind = 'unavailable';
      lastMessage = `${model} network error: ${(err as Error)?.message}`;
      console.warn(`[ai] ${lastMessage}`);
      continue;
    }

    const json = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
      usage?: { total_tokens?: number };
      error?: { message?: string };
      message?: string;
    } | null;

    if (res.status === 429) throw new AiError('rate_limited', `${model} rate limited`);

    if (!res.ok) {
      lastKind = 'unavailable';
      lastMessage = `${model} HTTP ${res.status}: ${json?.error?.message ?? json?.message ?? ''}`;
      console.warn(`[ai] ${lastMessage}`);
      continue;
    }

    const content = json?.choices?.[0]?.message?.content ?? '';
    const parsed = opts.schema.safeParse(parseModelJSON(content));
    if (parsed.success) {
      return { data: parsed.data, model, totalTokens: json?.usage?.total_tokens };
    }
    lastKind = 'invalid_output';
    lastMessage = `${model} returned output that failed validation`;
    console.warn(`[ai] ${lastMessage}: ${parsed.error.issues.slice(0, 3).map((i) => i.path.join('.') + ' ' + i.message).join('; ')}`);
  }

  throw new AiError(lastKind, lastMessage);
}

export const EMBEDDING_DIMS = 1024;

export async function embed(text: string, timeoutMs = 12_000): Promise<number[]> {
  const { apiKey, baseURL } = config();
  let res: Response;
  try {
    res = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'text-embedding-v3', input: text, dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isAbort(err)) throw new AiError('timeout', 'embedding timed out');
    throw new AiError('unavailable', `embedding network error: ${(err as Error)?.message}`);
  }
  if (res.status === 429) throw new AiError('rate_limited', 'embedding rate limited');
  const json = (await res.json().catch(() => null)) as { data?: { embedding?: number[] }[] } | null;
  if (!res.ok) throw new AiError('unavailable', `embedding HTTP ${res.status}`);
  const vec = json?.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length !== EMBEDDING_DIMS) {
    throw new AiError('invalid_output', `expected ${EMBEDDING_DIMS}-dim embedding, got ${vec?.length ?? 0}`);
  }
  return vec;
}
