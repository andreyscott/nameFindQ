import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { headers } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { rateLimit } from '@/lib/rateLimiter';

// ----------------------------------------------------------------------
// SCHEMA DEFINITION
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// SYSTEM PROMPT — Onomastic Expert Core
// ----------------------------------------------------------------------
const SYSTEM_PROMPT = `You are the "Namefind" system core: an elite onomastic expert, linguistic historian, and aesthetic synthesizer.

You deeply analyze phonetic resonance, etymological roots, and historical migration paths of names.

RULES:
- Always respond with ONLY a valid JSON object — no markdown, no code fences, no explanation outside the JSON.
- Use exactly this structure:

{
  "query_tags": ["TAG_ONE", "TAG_TWO", "TAG_THREE"],
  "results": [
    {
      "name": "string — the primary name result",
      "primary_meaning": "string — literal translation (e.g. 'God has done it')",
      "contextual_meaning": "string — when/how it is given (e.g. 'Used when a child is born after a long wait')",
      "region_origin": "string — geographic data (e.g. 'Nigeria (South West)')",
      "ethnicity_tribe": "string — cultural group (e.g. 'Yoruba')",
      "linguistic_root": "string — base words (e.g. 'Oluwa (God) + Se (did) + Un (it)')",
      "gender": "string — e.g. 'Masculine', 'Feminine', 'Neutral'",
      "pronunciation": "string — phonetic pronunciation",
      "etymology_node": { "era": "string", "historical_context": "string" }
    }
  ]
}`;

// ----------------------------------------------------------------------
// IN-MEMORY CACHE — saves quota on repeated queries
// ----------------------------------------------------------------------
const cache = new Map<string, { data: NameResponse; ts: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

function getCached(key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { cache.delete(key); return null; }
  return entry.data;
}

// ----------------------------------------------------------------------
// PROMPT BUILDER — type-specific prompt engineering
// ----------------------------------------------------------------------
function buildUserPrompt(query: string, type: string): string {
  if (type === 'blend') {
    return `You are blending two linguistic roots into a single synthesized name.
Input: ${query}
Task: Merge the phonetic and semantic qualities of both roots into one elegant new name.
Return exactly 3 synthesized name variations with their etymologies and shared aesthetic tags.`;
  }
  return `The user is searching for names related to this query: "${query}"
Task: Return the 5 best matching names (real or synthesized) that fit this vibe or origin query.
Include short meanings for list view, and detailed etymologies/migration data for the deep dive.`;
}

export async function POST(request: Request) {
  let currentQuery = 'Unknown';
  let currentType = 'vibe';

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
    // 3. Rate limiting — 10 requests per user per minute
    // ------------------------------------------------------------------
    const headersList = await headers();
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      user.id; // fall back to user ID so auth bypass doesn't help

    if (!rateLimit(ip, 10, 60_000)) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait a moment and try again.' },
        { status: 429 }
      );
    }

    // ------------------------------------------------------------------
    // 4. Parse & validate body
    // ------------------------------------------------------------------
    const body = await request.json();
    currentQuery = (body.query || '').trim();
    currentType = body.type || 'vibe';

    if (!currentQuery) {
      return NextResponse.json({ error: 'Query is required.' }, { status: 400 });
    }
    if (currentQuery.length > 300) {
      return NextResponse.json(
        { error: 'Query must be 300 characters or fewer.' },
        { status: 400 }
      );
    }

    if (!process.env.QWEN_API_KEY) {
      return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // ------------------------------------------------------------------
    // 5. Check cache
    // ------------------------------------------------------------------
    const cacheKey = `${currentType}::${currentQuery.toLowerCase()}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // ------------------------------------------------------------------
    // 6. Call Qwen with retry logic
    // ------------------------------------------------------------------
    const qwen = new OpenAI({
      apiKey: process.env.QWEN_API_KEY!,
      baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });

    const userPrompt = buildUserPrompt(currentQuery, currentType);

    // Qwen occasionally returns empty output — retry up to 3× with backoff
    const MAX_RETRIES = 3;
    let rawText = '';
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const completion = await qwen.chat.completions.create({
        model: 'qwen-max',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.8,
        top_p: 0.95,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
      if (rawText) break;
      if (attempt < MAX_RETRIES) {
        console.warn(`[Namefind] Empty output (attempt ${attempt}/${MAX_RETRIES}), retrying...`);
        await new Promise(r => setTimeout(r, attempt * 500));
      }
    }

    if (!rawText) {
      throw new Error('Qwen returned empty output after 3 attempts. Please try again.');
    }

    // Strip markdown fences if the model adds them
    const cleanedText = rawText.replace(/```json\n?|```/g, '').trim();
    const data = JSON.parse(cleanedText);

    if (!data.query_tags || !data.results || !Array.isArray(data.results)) {
      throw new Error('Qwen returned an incomplete data structure.');
    }

    cache.set(cacheKey, { data, ts: Date.now() });

    // ------------------------------------------------------------------
    // 7. Insert into Supabase (fire-and-forget)
    // ------------------------------------------------------------------
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const supabaseAdmin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const namesToInsert = data.results.map((r: any) => ({
        name: r.name,
        primary_meaning: r.primary_meaning || r.short_meaning || '',
        contextual_meaning: r.contextual_meaning || null,
        region_origin: r.region_origin || null,
        ethnicity_tribe: r.ethnicity_tribe || null,
        linguistic_root: r.linguistic_root || null,
        gender: r.gender || null,
        pronunciation: r.pronunciation || null,
        vibe_tags: data.query_tags || [],
        etymology: r.etymology_node || r.migration_data || null,
      }));

      supabaseAdmin.from('names').insert(namesToInsert).then(({ error }: any) => {
        if (error) console.error('[Supabase Insert Error]:', error);
      });
    } else {
      console.warn('[Supabase] SUPABASE_SERVICE_ROLE_KEY missing. Skipping DB insert.');
    }

    // Ensure backward compatibility for components expecting short_meaning
    data.results = data.results.map((r: any) => ({
      ...r,
      short_meaning: r.primary_meaning || r.short_meaning || '',
    }));

    return NextResponse.json(data);

  } catch (error: any) {
    console.error('[Namefind API Error]', error);

    const isRateLimit =
      error?.status === 429 ||
      error?.response?.status === 429 ||
      error?.message?.includes('429');

    if (isRateLimit) {
      const q = currentQuery || 'Unknown';
      const capitalized = q.charAt(0).toUpperCase() + q.slice(1);
      return NextResponse.json({
        query_tags: ['QUOTA_EXCEEDED', 'MOCK_MODE', q.toUpperCase()],
        results: [
          {
            name: capitalized,
            short_meaning: 'Semantic placeholder (Rate Limited)',
            etymology: `Placeholder for "${capitalized}" — API quota reached. Please try again later.`,
          },
          {
            name: capitalized + 'ian',
            short_meaning: 'Variant placeholder',
            etymology: `A suffix-derived variant of ${capitalized}.`,
          },
        ],
      });
    }

    return NextResponse.json(
      { error: error?.message || 'Failed to process onomastic request.' },
      { status: 500 }
    );
  }
}
