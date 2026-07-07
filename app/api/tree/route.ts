import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rateLimiter';
import { getQwenClient } from '@/lib/qwenClient';
import { headers } from 'next/headers';

// ── Tree Data Shape ───────────────────────────────────────────────────────────
export interface TreeBranch {
  name: string;
  meaning: string;
  variant_type: 'Direct' | 'Extended' | 'Feminine' | 'Short Form' | 'Modern';
  sub_variant: string;
  sub_variant_region: string;
}

export interface TreeData {
  name: string;
  root_label: string;
  root_meaning: string;
  primary_epoch: string;
  primary_context: string;
  region: string;
  tribe: string;
  branches: [TreeBranch, TreeBranch, TreeBranch];
  narrative: string;
  source: 'db' | 'ai' | 'fallback';
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a professional onomastic historian and etymologist.
Given a name, return ONLY a single valid JSON object — no markdown, no code fences, no text outside the JSON.

Required JSON structure (all fields mandatory, no empty strings):
{
  "root_label": "Oldest proto-root with morpheme breakdown e.g. 'El (God) + Dan (Judge)' or 'Ada (Daughter) + Eze (King)'",
  "root_meaning": "Core semantic meaning in 4 words or fewer",
  "primary_epoch": "Historical period and culture e.g. 'Biblical Era, Ancient Hebrew' or 'Pre-colonial Igbo'",
  "primary_context": "1-2 sentences explaining the cultural origin and usage context of this name",
  "region": "Specific geographic region e.g. 'Ancient Israel', 'Nigeria (South East)'",
  "tribe": "Specific ethnic or cultural group e.g. 'Hebrew', 'Igbo', 'Yoruba', 'Latin'",
  "branches": [
    {
      "name": "A close linguistic variant or related name",
      "meaning": "Its meaning in 3-5 words",
      "variant_type": "Direct",
      "sub_variant": "A further derived name from this branch",
      "sub_variant_region": "Regional or cultural label e.g. 'Romance', 'Modern English'"
    },
    { "name": "Second variant", "meaning": "meaning", "variant_type": "Extended", "sub_variant": "derived", "sub_variant_region": "region" },
    { "name": "Third variant", "meaning": "meaning", "variant_type": "Feminine", "sub_variant": "derived", "sub_variant_region": "region" }
  ],
  "narrative": "2-3 elegant scholarly sentences tracing this name's etymological journey across time and culture."
}

CRITICAL RULES:
- branches must contain exactly 3 objects
- variant_type must be one of: Direct, Extended, Feminine, Short Form, Modern
- All string values must be non-empty`;

// ── In-memory result cache (1 hour TTL) ──────────────────────────────────────
const treeCache = new Map<string, { data: TreeData; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCachedTree(name: string): TreeData | null {
  const entry = treeCache.get(name.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { treeCache.delete(name.toLowerCase()); return null; }
  return entry.data;
}

// ── Relaxed sufficiency check ─────────────────────────────────────────────────
// Previous version required 3 related_variants (almost never present in DB).
// Now: root + some context + region is enough to serve a rich tree from DB data.
function isSufficient(data: any): boolean {
  const hasRoot =
    typeof data.linguistic_root === 'string' && data.linguistic_root.length > 8;
  const hasContext =
    (data.etymology?.historical_context?.length ?? 0) > 30 ||
    (data.contextual_meaning?.length ?? 0) > 30;
  const hasRegion = !!(data.region_origin || data.ethnicity_tribe);
  return hasRoot && hasContext && hasRegion;
}

// ── Map Supabase row → TreeData ───────────────────────────────────────────────
function mapDbToTree(name: string, d: any): TreeData {
  const variants: string[] = d.etymology?.related_variants ?? [];
  const types: TreeBranch['variant_type'][] = ['Direct', 'Extended', 'Feminine'];
  const tribe = d.ethnicity_tribe ?? d.region_origin ?? 'Regional';

  const branches = types.map((vt, i) => ({
    name: variants[i] ?? `${name}${['i', 'e', 'a'][i]}`,
    meaning: 'Linguistic variant',
    variant_type: vt,
    sub_variant: (variants[i] ?? name) + (i === 2 ? 'a' : 'o'),
    sub_variant_region: tribe,
  })) as [TreeBranch, TreeBranch, TreeBranch];

  return {
    name,
    root_label: d.linguistic_root,
    root_meaning: (d.primary_meaning ?? '').split(' ').slice(0, 4).join(' '),
    primary_epoch: d.etymology?.context ?? d.etymology?.era ?? 'Historical period',
    primary_context: d.etymology?.historical_context ?? d.contextual_meaning ?? '',
    region: d.region_origin ?? 'Unknown region',
    tribe: d.ethnicity_tribe ?? 'Unknown culture',
    branches,
    narrative: `${name} carries the essence of ${tribe} heritage. ${d.contextual_meaning ?? d.etymology?.historical_context ?? ''}`,
    source: 'db',
  };
}

// ── Graceful fallback — returned when AI fails, never returns an error to UI ──
function buildFallbackTree(name: string, dbRow: any | null): TreeData {
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
      { name: cap + 'a',   meaning: 'Feminine variant',   variant_type: 'Feminine',   sub_variant: cap + 'ah', sub_variant_region: 'Regional'  },
      { name: cap + 'i',   meaning: 'Extended form',      variant_type: 'Extended',   sub_variant: cap + 'io', sub_variant_region: 'Modern'    },
      { name: cap.slice(0, -1) || cap, meaning: 'Short form', variant_type: 'Short Form', sub_variant: cap + 'el', sub_variant_region: 'Diaspora' },
    ],
    narrative: `${cap} carries an enduring legacy across time and culture. ${ctx}`,
    source: 'fallback',
  };
}

// ── Lazy admin client ─────────────────────────────────────────────────────────
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

// ── POST /api/tree ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // 1. Content-Type guard
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    }

    // 2. Rate limit by IP (public endpoint — read-only tree data)
    const headersList = await headers();
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      'unknown';

    if (!rateLimit(ip, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    // 3. Parse & validate body
    const body = await request.json();
    const name = (body?.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    if (name.length > 100) return NextResponse.json({ error: 'Name too long.' }, { status: 400 });

    // 4. In-memory cache
    const cached = getCachedTree(name);
    if (cached) return NextResponse.json(cached);

    // 5. Supabase lookup (also fetches the row id for precise update later)
    const supabase = await createClient();
    const { data: dbRow } = await supabase
      .from('names')
      .select('id, linguistic_root, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe, etymology')
      .ilike('name', name)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 6. Serve from DB if sufficient (relaxed check — no longer requires 3 variants)
    if (dbRow && isSufficient(dbRow)) {
      const treeData = mapDbToTree(name, dbRow);
      treeCache.set(name.toLowerCase(), { data: treeData, ts: Date.now() });
      return NextResponse.json(treeData);
    }

    // 7. AI fallback — if key missing, serve graceful fallback immediately
    if (!process.env.QWEN_API_KEY) {
      console.warn('[Tree] QWEN_API_KEY missing — serving fallback tree.');
      return NextResponse.json(buildFallbackTree(name, dbRow));
    }

    // 8. Build seed context from existing DB data
    const seedContext = dbRow
      ? `Known data: meaning="${dbRow.primary_meaning ?? '?'}", root="${dbRow.linguistic_root ?? '?'}", region="${dbRow.region_origin ?? '?'}", culture="${dbRow.ethnicity_tribe ?? '?'}", context="${dbRow.contextual_meaning ?? '?'}". Enrich with historical branches.`
      : `No prior data. Research "${name}" from scratch using onomastic knowledge.`;

    // 9. Call Qwen with retry + 25s timeout
    // qwen-max takes 18-25s on cold starts — 12s was too aggressive.
    const qwen = getQwenClient();
    let rawText = '';

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25_000);

      try {
        const completion = await qwen.chat.completions.create(
          {
            model: 'qwen-max',
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: `Generate etymology tree JSON for "${name}". ${seedContext}` },
            ],
            temperature: 0.3,
            top_p: 0.85,
            max_tokens: 1000, // Cap to speed up generation
          },
          { signal: controller.signal }
        );
        clearTimeout(timeoutId);
        rawText = completion.choices[0]?.message?.content ?? '';
        if (rawText) break;
      } catch (err: any) {
        clearTimeout(timeoutId);
        const isAbort = err.name === 'AbortError' || err.code === 'ERR_CANCELED';
        console.warn(`[Tree] Attempt ${attempt}/2 failed — ${isAbort ? 'timeout (25s)' : err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1_000));
      }
    }

    // 10. If AI failed after all retries — serve graceful fallback (never 502)
    if (!rawText) {
      console.error(`[Tree] AI failed for "${name}" after 3 attempts — serving fallback.`);
      const fallback = buildFallbackTree(name, dbRow);
      treeCache.set(name.toLowerCase(), { data: fallback, ts: Date.now() });
      return NextResponse.json(fallback);
    }

    // 11. Parse AI response
    let aiData: Omit<TreeData, 'name' | 'source'>;
    try {
      aiData = JSON.parse(rawText.replace(/```json\n?|```/g, '').trim());
    } catch {
      console.error('[Tree] JSON parse failed — serving fallback.');
      return NextResponse.json(buildFallbackTree(name, dbRow));
    }

    const treeData: TreeData = { name, ...aiData, source: 'ai' };
    treeCache.set(name.toLowerCase(), { data: treeData, ts: Date.now() });

    // 12. Write enriched data back to DB using row id (not ilike — precise update)
    if (dbRow?.id) {
      const admin = getAdmin();
      if (admin) {
        admin
          .from('names')
          .update({
            etymology: {
              era: aiData.primary_epoch,
              historical_context: aiData.primary_context,
              related_variants: aiData.branches.map(b => b.name),
            },
            linguistic_root: aiData.root_label,
            region_origin: aiData.region,
            ethnicity_tribe: aiData.tribe,
          })
          .eq('id', dbRow.id) // Precise single-row update via PK, not ilike
          .then(({ error }: any) => {
            if (error) console.warn('[Tree] DB enrichment write failed:', error.message);
            else console.log(`[Tree] Enriched DB row id=${dbRow.id} for "${name}"`);
          });
      }
    }

    return NextResponse.json(treeData);

  } catch (error: any) {
    // Final safety net — log internally, never expose stack to client
    console.error('[Tree] Unhandled error:', error?.message ?? error);
    return NextResponse.json(
      { error: 'Etymology tree generation failed. Please try again.' },
      { status: 500 }
    );
  }
}
