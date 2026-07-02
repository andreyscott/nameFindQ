import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { rateLimit } from '@/lib/rateLimiter';
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
  source: 'db' | 'ai';
}

// ── Strict AI Prompt ──────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a professional onomastic historian and etymologist.
Given a name and optional seed data, return ONLY a valid JSON object describing its
linguistic origin tree. No markdown, no code fences, no text outside the JSON.

Required structure (all fields mandatory):
{
  "root_label": "Oldest proto-root and morpheme breakdown — e.g. 'Ada (Daughter) + Eze (King)' or '*leuk- (Light)'",
  "root_meaning": "Core semantic meaning in 4 words or fewer",
  "primary_epoch": "Historical period and culture — e.g. 'Pre-colonial Igbo', 'Classical Latin'",
  "primary_context": "1-2 sentences explaining the cultural origin and usage context of this name",
  "region": "Specific geographic region — e.g. 'Nigeria (South East)', 'Roman Empire (Italy)'",
  "tribe": "Specific ethnic or cultural group — e.g. 'Igbo', 'Latin', 'Yoruba', 'Edo'",
  "branches": [
    {
      "name": "A close linguistic variant or relative",
      "meaning": "Its meaning in 3-5 words",
      "variant_type": "Direct",
      "sub_variant": "A further derived name from this branch",
      "sub_variant_region": "Regional or cultural label — e.g. 'Romance', 'Modern English', 'Pan-Igbo'"
    },
    { "name": "...", "meaning": "...", "variant_type": "Extended",   "sub_variant": "...", "sub_variant_region": "..." },
    { "name": "...", "meaning": "...", "variant_type": "Feminine",   "sub_variant": "...", "sub_variant_region": "..." }
  ],
  "narrative": "2-3 elegant scholarly sentences tracing this name's etymological journey across time and culture."
}

CRITICAL RULES:
- branches MUST contain exactly 3 objects
- All string fields MUST be non-empty
- variant_type MUST be one of: Direct | Extended | Feminine | Short Form | Modern`;

// ── Sufficiency Check — is Supabase data rich enough to skip the AI? ───────
function isSufficient(data: any): boolean {
  const hasRoot = typeof data.linguistic_root === 'string' &&
    data.linguistic_root.includes('+') &&
    data.linguistic_root.length > 10;

  const hasContext =
    (data.etymology?.historical_context?.length ?? 0) > 40 ||
    (data.contextual_meaning?.length ?? 0) > 40;

  const hasThreeBranches =
    Array.isArray(data.etymology?.related_variants) &&
    data.etymology.related_variants.length >= 3;

  const hasRegion = !!(data.region_origin || data.ethnicity_tribe);

  // Sufficient if we have root + region + (rich historical context OR 3+ variants)
  return hasRoot && hasRegion && (hasContext && hasThreeBranches);
}

// ── Map Supabase row → TreeData when data is sufficient ───────────────────
function mapDbToTree(name: string, d: any): TreeData {
  const variants: string[] = d.etymology?.related_variants ?? [];
  const types: TreeBranch['variant_type'][] = ['Direct', 'Extended', 'Feminine'];

  const branches = types.map((vt, i) => ({
    name: variants[i] ?? `${name}${['i', 'e', 'a'][i]}`,
    meaning: 'Linguistic variant',
    variant_type: vt,
    sub_variant: (variants[i] ?? name) + (i === 2 ? 'a' : 'o'),
    sub_variant_region: d.ethnicity_tribe ?? d.region_origin ?? 'Regional',
  })) as [TreeBranch, TreeBranch, TreeBranch];

  return {
    name,
    root_label: d.linguistic_root,
    root_meaning: (d.primary_meaning ?? '').split(' ').slice(0, 4).join(' '),
    primary_epoch: d.etymology?.context ?? d.etymology?.era ?? 'Historical',
    primary_context:
      d.etymology?.historical_context ?? d.contextual_meaning ?? '',
    region: d.region_origin ?? 'Unknown region',
    tribe: d.ethnicity_tribe ?? 'Unknown culture',
    branches,
    narrative: `${name} carries the essence of ${d.ethnicity_tribe ?? 'its'} heritage. ${d.contextual_meaning ?? d.etymology?.historical_context ?? ''}`,
    source: 'db',
  };
}

// ── POST /api/tree ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    // 1. Content-Type guard
    if (!(request.headers.get('content-type') ?? '').includes('application/json')) {
      return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
    }

    // 2. Rate limit by IP (public endpoint — no auth required for tree reads)
    const headersList = await headers();
    const ip =
      headersList.get('x-forwarded-for')?.split(',')[0].trim() ??
      headersList.get('x-real-ip') ??
      'unknown';

    if (!rateLimit(ip, 10, 60_000)) {
      return NextResponse.json({ error: 'Too many requests. Please try again shortly.' }, { status: 429 });
    }

    // 3. Parse body
    const body = await request.json();
    const name = (body?.name ?? '').trim();
    if (!name) {
      return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    }
    if (name.length > 100) {
      return NextResponse.json({ error: 'Name too long.' }, { status: 400 });
    }

    // 4. Try Supabase first
    const supabase = await createClient();
    const { data: dbRow } = await supabase
      .from('names')
      .select('linguistic_root, primary_meaning, contextual_meaning, region_origin, ethnicity_tribe, etymology, vibe_tags')
      .ilike('name', name)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // 5. If DB has sufficient data — return immediately (no AI cost)
    if (dbRow && isSufficient(dbRow)) {
      return NextResponse.json(mapDbToTree(name, dbRow));
    }

    // 6. AI Fallback — call Qwen to generate / enrich the tree
    if (!process.env.QWEN_API_KEY) {
      return NextResponse.json({ error: 'AI enrichment unavailable.' }, { status: 503 });
    }

    const qwen = new OpenAI({
      apiKey: process.env.QWEN_API_KEY!,
      baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });

    // Build a seed prompt using what we already know from DB (if anything)
    const seedContext = dbRow
      ? `Seed data already known about this name:
- Primary meaning: ${dbRow.primary_meaning ?? 'unknown'}
- Linguistic root: ${dbRow.linguistic_root ?? 'unknown'}
- Region: ${dbRow.region_origin ?? 'unknown'}
- Cultural group: ${dbRow.ethnicity_tribe ?? 'unknown'}
- Context: ${dbRow.contextual_meaning ?? 'unknown'}

Use this as the factual foundation. Enrich and expand with historical branches.`
      : `No prior data is available. Research this name from scratch using your onomastic knowledge.`;

    const userPrompt = `Generate the complete etymology tree JSON for the name "${name}".

${seedContext}`;

    let rawText = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      const completion = await qwen.chat.completions.create({
        model: 'qwen-max',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        top_p: 0.9,
      });
      rawText = completion.choices[0]?.message?.content ?? '';
      if (rawText) break;
      if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 500));
    }

    if (!rawText) {
      return NextResponse.json({ error: 'AI enrichment failed. Please try again.' }, { status: 502 });
    }

    const cleaned = rawText.replace(/```json\n?|```/g, '').trim();
    const aiData = JSON.parse(cleaned) as Omit<TreeData, 'name' | 'source'>;

    const treeData: TreeData = { name, ...aiData, source: 'ai' };

    // 7. Save AI-enriched etymology back to DB (only if the row already exists)
    if (dbRow && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const admin = createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      // Update etymology column with the richer AI data so future requests hit DB
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
        .ilike('name', name)
        .then(({ error }) => {
          if (error) console.warn('[Tree] DB update failed:', error.message);
        });
    }

    return NextResponse.json(treeData);
  } catch (error: any) {
    console.error('[/api/tree] Error:', error);
    return NextResponse.json(
      { error: error?.message ?? 'Etymology tree generation failed.' },
      { status: 500 }
    );
  }
}
