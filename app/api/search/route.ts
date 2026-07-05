import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { rateLimit } from '@/lib/rateLimiter';
import { getQwenClient } from '@/lib/qwenClient';
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

    // 2. Auth
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Authentication required. Please sign in.' }, { status: 401 });
    }

    // 3. Rate limit (60 req/min per user)
    if (!rateLimit(user.id, 60, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
    }

    // 4. Parse & validate body
    const body = await request.json();
    query = (body?.query ?? '').trim();
    if (!query) return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    if (query.length > 200) return NextResponse.json({ error: 'Query must be 200 characters or fewer.' }, { status: 400 });
    if (!process.env.QWEN_API_KEY) return NextResponse.json({ error: 'Server configuration error: QWEN_API_KEY missing.' }, { status: 500 });

    // 5. ── Embedding — check cache before calling API ───────────────────────
    let embeddingValues = getCachedEmbedding(query);

    if (!embeddingValues) {
      const qwen = getQwenClient();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12_000);

      try {
        const embeddingResponse = await qwen.embeddings.create(
          { model: 'text-embedding-v3', input: query, dimensions: 1024 },
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        embeddingValues = embeddingResponse.data?.[0]?.embedding ?? null;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err.name === 'AbortError' || err.code === 'ERR_CANCELED';
        console.error(`[Search] Embedding failed: ${isAbort ? 'timeout (12s)' : err.message}`);
        throw err;
      }

      if (!embeddingValues || embeddingValues.length !== 1024) {
        throw new Error(`Invalid embedding from Qwen API. Expected 1024 values, got ${embeddingValues?.length ?? 0}.`);
      }

      // Cache the embedding — deterministic for this query string
      setCachedEmbedding(query, embeddingValues);
      console.log(`[Search] Embedding computed and cached for: "${query}"`);
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

    return NextResponse.json({ query, results });

  } catch (error: unknown) {
    console.error('[Search] Error:', { query, message: (error as Error)?.message });

    const isRateLimit =
      (error as { status?: number })?.status === 429 ||
      (error instanceof Error && error.message.includes('429'));

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
