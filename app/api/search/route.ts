import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { rateLimit } from '@/lib/rateLimiter';
import postgres from 'postgres';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------
export interface NameSearchResult {
  id: string;
  name: string;
  primary_meaning: string;
  contextual_meaning: string | null;
  vibe_tags: string[];
  ethnicity_tribe: string | null;
}

// -----------------------------------------------------------------------
// DB client — created lazily, reused across requests in the same instance
// -----------------------------------------------------------------------
function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set.');
  }
  return postgres(process.env.DATABASE_URL, {
    ssl: 'require',
    max: 3,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}

// -----------------------------------------------------------------------
// POST /api/search
//
// Request body:  { query: string }
// Response:      { results: NameSearchResult[], query: string }
// -----------------------------------------------------------------------
export async function POST(request: Request) {
  let query = '';

  try {
    // ------------------------------------------------------------------
    // 1. Content-Type guard
    // ------------------------------------------------------------------
    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return NextResponse.json(
        { error: 'Content-Type must be application/json.' },
        { status: 415 }
      );
    }

    // ------------------------------------------------------------------
    // 2. Authentication — require a valid Supabase session
    // ------------------------------------------------------------------
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required. Please sign in.' },
        { status: 401 }
      );
    }

    // ------------------------------------------------------------------
    // 3. Rate limiting — 20 requests per user per minute (search is cheaper)
    // ------------------------------------------------------------------
    const headersList = await headers();
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      user.id;

    if (!rateLimit(ip, 20, 60_000)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    // ------------------------------------------------------------------
    // 4. Parse & validate body
    // ------------------------------------------------------------------
    const body = await request.json();
    query = (body?.query ?? '').trim();

    if (!query) {
      return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    }
    if (query.length > 200) {
      return NextResponse.json(
        { error: 'Query must be 200 characters or fewer.' },
        { status: 400 }
      );
    }

    if (!process.env.QWEN_API_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error: QWEN_API_KEY missing.' },
        { status: 500 }
      );
    }

    // ------------------------------------------------------------------
    // 5. Embed the user query with Qwen text-embedding-v3
    //    Dimensions: 1024 — matches the DB vector(1024) column
    // ------------------------------------------------------------------
    const qwen = new OpenAI({
      apiKey: process.env.QWEN_API_KEY!,
      baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });

    const embeddingResponse = await qwen.embeddings.create({
      model: 'text-embedding-v3',
      input: query,
      dimensions: 1024,
    });

    const embeddingValues = embeddingResponse.data?.[0]?.embedding;
    if (!embeddingValues || embeddingValues.length !== 1024) {
      throw new Error(
        `Invalid embedding from Qwen API. Expected 1024 values, got ${embeddingValues?.length ?? 0}.`
      );
    }

    // pgvector expects a string formatted as '[0.1, 0.2, ...]'
    const embeddingString = `[${embeddingValues.join(',')}]`;

    // ------------------------------------------------------------------
    // 6. Call match_names DB function
    // ------------------------------------------------------------------
    const sql = getDb();

    try {
      const results = await sql<NameSearchResult[]>`
        SELECT id, name, primary_meaning, contextual_meaning, vibe_tags, ethnicity_tribe
        FROM match_names(
          ${embeddingString}::vector,
          ${0.4}::float,
          ${8}::int
        )
      `;

      return NextResponse.json({ query, results });
    } finally {
      await sql.end();
    }

  } catch (error: unknown) {
    console.error('[/api/search] Error:', error);

    const isRateLimit =
      (error as { status?: number })?.status === 429 ||
      (error instanceof Error && error.message.includes('429'));

    if (isRateLimit) {
      return NextResponse.json(
        { error: 'Embedding service rate limited. Please try again shortly.' },
        { status: 429 }
      );
    }

    const message =
      error instanceof Error ? error.message : 'Semantic search failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
