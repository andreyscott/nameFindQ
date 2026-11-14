import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/admin';
import { rateLimit } from '@/lib/rateLimiter';
import { chatJSON, AiError } from '@/lib/ai/qwen';
import { NameResultSchema, type NameResponse } from '@/lib/ai/schemas';

// ── Request schema ───────────────────────────────────────────────────────────
const RequestSchema = z.object({
  query: z.string().trim().min(1, 'Query is required.').max(300, 'Query must be 300 characters or fewer.'),
  type: z.enum(['vibe', 'blend']).default('vibe'),
});

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are an expert onomastic historian and linguistic analyst specializing in global name origins.

Your ONLY output must be a single valid JSON object — no markdown, no code fences, no explanation.

Required JSON structure:
{
  "query_tags": ["UPPERCASE_TAG_1", "UPPERCASE_TAG_2", "UPPERCASE_TAG_3"],
  "results": [
    {
      "name": "The name",
      "primary_meaning": "The literal translation or core meaning",
      "contextual_meaning": "Cultural context — when or why this name is given",
      "region_origin": "Geographic origin e.g. Nigeria (South West)",
      "ethnicity_tribe": "Cultural group e.g. Yoruba, Hebrew, Latin",
      "linguistic_root": "Root morphemes e.g. El (God) + Daniel (Judge)",
      "gender": "Masculine, Feminine, or Neutral",
      "pronunciation": "Phonetic pronunciation",
      "etymology_node": {
        "era": "Historical period e.g. Biblical Era, Pre-colonial",
        "historical_context": "1-2 sentences on historical usage"
      }
    }
  ]
}

Return 5 name results for vibe queries, and 3 for blend queries.`;

// ── In-memory result cache (1 hour TTL) ──────────────────────────────────────
const cache = new Map<string, { data: NameResponse; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string): NameResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

interface NameRow {
  name: string;
  primary_meaning: string | null;
  contextual_meaning: string | null;
  region_origin: string | null;
  ethnicity_tribe: string | null;
  linguistic_root: string | null;
  gender: string | null;
  pronunciation: string | null;
  etymology: { era?: string; historical_context?: string } | null;
}

// ── DB-first lookup — returns results from Supabase if rich enough ────────────
// Blend always needs AI synthesis. Matches primary_meaning, contextual_meaning
// and ethnicity_tribe.
async function tryDbFirst(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  type: 'vibe' | 'blend'
): Promise<NameResponse | null> {
  if (type === 'blend') return null;

  const stopwords = new Set(['names', 'name', 'with', 'that', 'from', 'the', 'and', 'for', 'are']);
  const keywords = query
    .toLowerCase()
    .split(/[\s,+]+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 3);

  if (keywords.length === 0) return null;

  const searches = keywords.map(kw =>
    supabase
      .from('names')
      .select('name, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe, linguistic_root, gender, pronunciation, etymology')
      .or(`primary_meaning.ilike.%${kw}%,contextual_meaning.ilike.%${kw}%,ethnicity_tribe.ilike.%${kw}%`)
      .limit(5)
  );

  const settled = await Promise.all(searches);

  const seen = new Set<string>();
  const merged: NameRow[] = [];
  for (const { data } of settled) {
    for (const row of (data ?? []) as NameRow[]) {
      if (!seen.has(row.name)) {
        seen.add(row.name);
        merged.push(row);
      }
    }
  }

  if (merged.length < 3) return null;

  return {
    query_tags: keywords.map(k => k.toUpperCase()),
    results: merged.slice(0, 5).map((r) => ({
      name: r.name,
      primary_meaning: r.primary_meaning ?? '',
      contextual_meaning: r.contextual_meaning ?? undefined,
      region_origin: r.region_origin ?? undefined,
      ethnicity_tribe: r.ethnicity_tribe ?? undefined,
      linguistic_root: r.linguistic_root ?? undefined,
      gender: r.gender ?? undefined,
      pronunciation: r.pronunciation ?? undefined,
      etymology_node: r.etymology
        ? { era: r.etymology.era, historical_context: r.etymology.historical_context }
        : undefined,
    })),
  };
}

// ── User prompt builder ───────────────────────────────────────────────────────
function buildUserPrompt(query: string, type: 'vibe' | 'blend'): string {
  if (type === 'blend') {
    return `Blend query: "${query}". Merge phonetic and semantic qualities of both roots into 3 synthesized name variations with full etymologies.`;
  }
  return `Vibe query: "${query}". Return the 5 best matching names (real or synthesized) with etymologies and migration data.`;
}

// Backward-compat alias consumed by the results page.
function withShortMeaning(data: NameResponse) {
  return { ...data, results: data.results.map(r => ({ ...r, short_meaning: r.primary_meaning })) };
}

// ── POST /api/namefind ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let currentQuery = 'Unknown';

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

    // 3. Rate limit (30 req/min per user)
    if (!rateLimit(user.id, 30, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Please wait a moment and try again.' }, { status: 429 });
    }

    // 4. Parse & validate body
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    const { query, type } = parsed.data;
    currentQuery = query;

    // 5. In-memory cache
    const cacheKey = `${type}::${query.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json(withShortMeaning(cached));

    // 6. DB-first lookup
    const dbResult = await tryDbFirst(supabase, query, type);
    if (dbResult) {
      cache.set(cacheKey, { data: dbResult, ts: Date.now() });
      return NextResponse.json(withShortMeaning(dbResult));
    }

    // 7. AI (validated)
    const { data, model } = await chatJSON({
      schema: NameResultSchema,
      system: SYSTEM_PROMPT,
      user: buildUserPrompt(query, type),
      maxTokens: 1800,
    });
    console.log(`[Namefind] ${model} answered (${data.results.length} results)`);
    cache.set(cacheKey, { data, ts: Date.now() });

    // 8. Upsert into Supabase (fire-and-forget)
    const admin = getAdminClient();
    if (admin) {
      const namesToUpsert = data.results.map((r) => ({
        name: r.name,
        primary_meaning: r.primary_meaning,
        contextual_meaning: r.contextual_meaning ?? null,
        region_origin: r.region_origin ?? null,
        ethnicity_tribe: r.ethnicity_tribe ?? null,
        linguistic_root: r.linguistic_root ?? null,
        gender: r.gender ?? null,
        pronunciation: r.pronunciation ?? null,
        vibe_tags: data.query_tags,
        etymology: r.etymology_node ?? null,
      }));

      admin
        .from('names')
        .upsert(namesToUpsert, { onConflict: 'name', ignoreDuplicates: false })
        .then(({ error }) => {
          if (error) console.error('[Namefind] Supabase upsert error:', error.message);
        });
    } else {
      console.warn('[Namefind] SUPABASE_SERVICE_ROLE_KEY missing — skipping DB write.');
    }

    return NextResponse.json(withShortMeaning(data));

  } catch (error: unknown) {
    console.error('[Namefind] Error:', { query: currentQuery, message: (error as Error)?.message });

    // Graceful degradation on Qwen rate-limit (replaced in F6)
    if (error instanceof AiError && error.kind === 'rate_limited') {
      const q = currentQuery || 'Unknown';
      const cap = q.charAt(0).toUpperCase() + q.slice(1);
      return NextResponse.json({
        query_tags: ['RATE_LIMITED', q.toUpperCase()],
        results: [
          { name: cap, short_meaning: 'Quota reached — please try again shortly.', primary_meaning: 'Quota reached — please try again shortly.' },
          { name: cap + 'ian', short_meaning: 'Variant placeholder', primary_meaning: 'Variant placeholder' },
        ],
      });
    }

    return NextResponse.json(
      { error: (error as Error)?.message || 'Failed to process onomastic request.' },
      { status: 500 }
    );
  }
}
