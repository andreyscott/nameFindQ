import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimiter';
import { getQwenClient } from '@/lib/qwenClient';

// ── Schema ────────────────────────────────────────────────────────────────────
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

type NameResponse = z.infer<typeof NameResultSchema>;

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

Return 5 name results for vibe or semantic queries, and 3 for blend queries.`;

// ── In-memory result cache (1 hour TTL) ──────────────────────────────────────
const cache = new Map<string, { data: NameResponse; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCached(key: string): NameResponse | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

// ── DB-first lookup — returns results from Supabase if rich enough ────────────
// Fires only for vibe/semantic modes (blend always needs AI synthesis).
// Matches against primary_meaning, contextual_meaning, and ethnicity_tribe.
async function tryDbFirst(
  supabase: Awaited<ReturnType<typeof createClient>>,
  query: string,
  type: string
): Promise<NameResponse | null> {
  if (type === 'blend') return null; // Synthesized names always need AI

  // Extract meaningful keywords (skip stopwords and short words)
  const stopwords = new Set(['names', 'name', 'with', 'that', 'from', 'the', 'and', 'for', 'are']);
  const keywords = query
    .toLowerCase()
    .split(/[\s,+]+/)
    .filter(w => w.length > 3 && !stopwords.has(w))
    .slice(0, 3);

  if (keywords.length === 0) return null;

  // Run keyword searches in parallel for speed
  const searches = keywords.map(kw =>
    supabase
      .from('names')
      .select('name, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe, linguistic_root, gender, pronunciation, etymology, vibe_tags')
      .or(`primary_meaning.ilike.%${kw}%,contextual_meaning.ilike.%${kw}%,ethnicity_tribe.ilike.%${kw}%`)
      .limit(5)
  );

  const settled = await Promise.all(searches);

  // Merge and deduplicate by name
  const seen = new Set<string>();
  const merged: any[] = [];
  for (const { data } of settled) {
    for (const row of data ?? []) {
      if (!seen.has(row.name)) {
        seen.add(row.name);
        merged.push(row);
      }
    }
  }

  // Need at least 3 results to be useful
  if (merged.length < 3) return null;

  const results = merged.slice(0, 5).map((r: any) => ({
    name: r.name,
    primary_meaning: r.primary_meaning ?? '',
    contextual_meaning: r.contextual_meaning ?? undefined,
    region_origin: r.region_origin ?? undefined,
    ethnicity_tribe: r.ethnicity_tribe ?? undefined,
    linguistic_root: r.linguistic_root ?? undefined,
    gender: r.gender ?? undefined,
    pronunciation: r.pronunciation ?? undefined,
    etymology_node: r.etymology ?? undefined,
    short_meaning: r.primary_meaning ?? '',
  }));

  return {
    query_tags: keywords.map(k => k.toUpperCase()),
    results,
  };
}

// ── User prompt builder ───────────────────────────────────────────────────────
function buildUserPrompt(query: string, type: string): string {
  if (type === 'blend') {
    return `Blend query: "${query}". Merge phonetic and semantic qualities of both roots into 3 synthesized name variations with full etymologies.`;
  }
  return `Vibe query: "${query}". Return the 5 best matching names (real or synthesized) with etymologies and migration data.`;
}

// ── Lazy admin client — created only when a DB write is needed ────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _admin: any = null;
function getAdmin(): any {
  if (!_admin && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    _admin = createAdminClient<any, any>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _admin;
}

// ── POST /api/namefind ────────────────────────────────────────────────────────
export async function POST(request: Request) {
  let currentQuery = 'Unknown';
  let currentType = 'vibe';

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
    const body = await request.json();
    currentQuery = (body.query || '').trim();
    currentType = body.type || 'vibe';

    if (!currentQuery) return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    if (currentQuery.length > 300) return NextResponse.json({ error: 'Query must be 300 characters or fewer.' }, { status: 400 });
    if (!process.env.QWEN_API_KEY) return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });

    // 5. In-memory cache
    const cacheKey = `${currentType}::${currentQuery.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) return NextResponse.json(cached);

    // 6. ── DB-first lookup ─────────────────────────────────────────────────
    // Avoids AI call entirely when we already have matching names in Supabase.
    const dbResult = await tryDbFirst(supabase, currentQuery, currentType);
    if (dbResult) {
      console.log(`[Namefind] DB-first hit for query: "${currentQuery}" (${dbResult.results.length} results)`);
      cache.set(cacheKey, { data: dbResult, ts: Date.now() });
      return NextResponse.json(dbResult);
    }

    // 7. ── Call Qwen with retry + 25s timeout ─────────────────────────────
    // temperature 0.7 is Qwen's recommended range for structured JSON generation.
    // top_p is omitted — combining it with temperature can cause empty output on Qwen.
    // Fallback: if qwen-max returns the empty-output error, retry with qwen-plus.
    const qwen = getQwenClient();
    const userPrompt = buildUserPrompt(currentQuery, currentType);
    const MODELS = ['qwen-max', 'qwen-plus'] as const;
    let rawText = '';
    let lastError = '';

    outer: for (const model of MODELS) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25_000);

        try {
          const completion = await qwen.chat.completions.create(
            {
              model,
              messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.7,
            },
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          rawText = completion.choices[0]?.message?.content ?? '';
          if (rawText) break outer; // success — exit both loops
          lastError = 'Empty response from model';
        } catch (err: any) {
          clearTimeout(timeoutId);
          const isAbort = err.name === 'AbortError' || err.code === 'ERR_CANCELED';
          lastError = isAbort ? 'Request timed out after 25s' : (err.message ?? 'Unknown error');
          console.warn(`[Namefind] ${model} attempt ${attempt}/2 failed — ${lastError}`);
          if (attempt < 2) await new Promise(r => setTimeout(r, 1_000));
        }
      }
      if (!rawText) console.warn(`[Namefind] ${model} exhausted — trying next model.`);
    }

    if (!rawText) throw new Error(`Qwen unavailable after ${MAX_RETRIES} attempts: ${lastError}`);

    // 8. Parse
    const cleanedText = rawText.replace(/```json\n?|```/g, '').trim();
    const data = JSON.parse(cleanedText);

    if (!data.query_tags || !Array.isArray(data.results)) {
      throw new Error('Qwen returned an incomplete data structure.');
    }

    // Backward-compat alias
    data.results = data.results.map((r: any) => ({
      ...r,
      short_meaning: r.primary_meaning || r.short_meaning || '',
    }));

    cache.set(cacheKey, { data, ts: Date.now() });

    // 9. ── Upsert into Supabase (fire-and-forget) ──────────────────────────
    // Uses upsert + onConflict so re-querying the same names enriches existing
    // rows instead of creating duplicates.
    const admin = getAdmin();
    if (admin) {
      const namesToUpsert = data.results.map((r: any) => ({
        name: r.name,
        primary_meaning: r.primary_meaning || '',
        contextual_meaning: r.contextual_meaning || null,
        region_origin: r.region_origin || null,
        ethnicity_tribe: r.ethnicity_tribe || null,
        linguistic_root: r.linguistic_root || null,
        gender: r.gender || null,
        pronunciation: r.pronunciation || null,
        vibe_tags: data.query_tags || [],
        etymology: r.etymology_node || null,
      }));

      admin
        .from('names')
        .upsert(namesToUpsert, { onConflict: 'name', ignoreDuplicates: false })
        .then(({ error }: any) => {
          if (error) console.error('[Namefind] Supabase upsert error:', error.message);
          else console.log(`[Namefind] Upserted ${namesToUpsert.length} names to DB`);
        });
    } else {
      console.warn('[Namefind] SUPABASE_SERVICE_ROLE_KEY missing — skipping DB write.');
    }

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Namefind] Error:', { query: currentQuery, message: error?.message });

    // Graceful degradation on Qwen rate-limit
    if (
      error?.status === 429 ||
      error?.response?.status === 429 ||
      error?.message?.includes('429')
    ) {
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
      { error: error?.message || 'Failed to process onomastic request.' },
      { status: 500 }
    );
  }
}
