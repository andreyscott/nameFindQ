import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { z } from 'zod';
import { createClient } from '@/utils/supabase/server';
import { getAdminClient } from '@/utils/supabase/admin';
import { rateLimit } from '@/lib/rateLimiter';
import { chatJSON } from '@/lib/ai/qwen';
import { TreeAISchema, type TreeBranch } from '@/lib/ai/schemas';
import { INJECTION_GUARD, buildTreeUserPrompt } from '@/lib/ai/prompts';
import { escapeLike } from '@/lib/text';

export type { TreeBranch };

// ── Tree Data Shape ───────────────────────────────────────────────────────────
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

interface DbRow {
  id: string;
  source: 'seed' | 'ai';
  linguistic_root: string | null;
  primary_meaning: string | null;
  contextual_meaning: string | null;
  region_origin: string | null;
  ethnicity_tribe: string | null;
  etymology: {
    era?: string;
    context?: string;
    historical_context?: string;
    related_variants?: string[];
  } | null;
}

const RequestSchema = z.object({
  name: z.string().trim().min(1, 'Name is required.').max(100, 'Name too long.'),
});

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
- All string values must be non-empty

${INJECTION_GUARD}`;

// ── In-memory result cache (1 hour TTL) ──────────────────────────────────────
const treeCache = new Map<string, { data: TreeData; ts: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

function getCachedTree(name: string): TreeData | null {
  const entry = treeCache.get(name.toLowerCase());
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { treeCache.delete(name.toLowerCase()); return null; }
  return entry.data;
}

// ── Sufficiency check: root + some context + region is enough ─────────────────
function isSufficient(data: DbRow): boolean {
  const hasRoot = typeof data.linguistic_root === 'string' && data.linguistic_root.length > 8;
  const hasContext =
    (data.etymology?.historical_context?.length ?? 0) > 30 ||
    (data.contextual_meaning?.length ?? 0) > 30;
  const hasRegion = !!(data.region_origin || data.ethnicity_tribe);
  return hasRoot && hasContext && hasRegion;
}

// ── Map Supabase row → TreeData ───────────────────────────────────────────────
function mapDbToTree(name: string, d: DbRow): TreeData {
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
    root_label: d.linguistic_root ?? name,
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

// ── Graceful fallback — returned when AI fails ────────────────────────────────
function buildFallbackTree(name: string, dbRow: DbRow | null): TreeData {
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

// ── POST /api/tree ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // 1. Content-Type guard
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    }

    // 2. Rate limit by IP (public endpoint)
    const headersList = await headers();
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      'unknown';

    if (!rateLimit(ip, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    // 3. Parse & validate body
    const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid request.' }, { status: 400 });
    }
    const { name } = parsed.data;

    // 4. In-memory cache
    const cached = getCachedTree(name);
    if (cached) return NextResponse.json(cached);

    // 5. Supabase lookup
    const supabase = await createClient();
    const { data: dbRowData } = await supabase
      .from('names')
      .select('id, source, linguistic_root, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe, etymology')
      .ilike('name', escapeLike(name))
      .order('source', { ascending: false }) // 'seed' sorts before 'ai'
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const dbRow = (dbRowData as DbRow | null) ?? null;

    // 6. Serve from DB if sufficient
    if (dbRow && isSufficient(dbRow)) {
      const treeData = mapDbToTree(name, dbRow);
      treeCache.set(name.toLowerCase(), { data: treeData, ts: Date.now() });
      return NextResponse.json(treeData);
    }

    // 7. AI (validated); any failure → graceful fallback
    let aiData;
    try {
      ({ data: aiData } = await chatJSON({
        schema: TreeAISchema,
        system: SYSTEM_PROMPT,
        user: buildTreeUserPrompt(name, dbRow),
        maxTokens: 1200,
      }));
    } catch (err) {
      console.error(`[Tree] AI failed for "${name}": ${(err as Error)?.message} — serving fallback.`);
      const fallback = buildFallbackTree(name, dbRow);
      treeCache.set(name.toLowerCase(), { data: fallback, ts: Date.now() });
      return NextResponse.json(fallback);
    }

    const treeData: TreeData = { name, ...aiData, source: 'ai' };
    treeCache.set(name.toLowerCase(), { data: treeData, ts: Date.now() });

    // 8. Write enriched data back by row id — AI rows only; curated seed
    //    rows are never modified.
    if (dbRow?.id && dbRow.source === 'ai') {
      const admin = getAdminClient();
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
          .eq('id', dbRow.id)
          .then(({ error }) => {
            if (error) console.warn('[Tree] DB enrichment write failed:', error.message);
          });
      }
    }

    return NextResponse.json(treeData);

  } catch (error: unknown) {
    console.error('[Tree] Unhandled error:', (error as Error)?.message ?? error);
    return NextResponse.json(
      { error: 'Etymology tree generation failed. Please try again.' },
      { status: 500 }
    );
  }
}
