/**
 * Etymology-tree shapes and the DB/fallback mappers used by /api/tree.
 * Rule: never invent data. Branches come only from the AI (validated) or
 * from variants recorded in the database.
 */

export interface TreeDisplayBranch {
  name: string;
  meaning?: string;
  variant_type: string;
  sub_variant?: string;
  sub_variant_region?: string;
}

export interface TreeData {
  name: string;
  root_label: string;
  root_meaning: string;
  primary_epoch: string;
  primary_context: string;
  region: string;
  tribe: string;
  branches: TreeDisplayBranch[];
  narrative: string;
  /** db = from our dictionary, ai = generated now, fallback = limited data */
  source: 'db' | 'ai' | 'fallback';
}

export interface DbNameRow {
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const firstWords = (s: string | null | undefined, n: number) => (s ?? '').split(/\s+/).slice(0, n).join(' ');

function recordedVariants(d: DbNameRow | null): string[] {
  return (d?.etymology?.related_variants ?? []).filter((v) => typeof v === 'string' && v.trim()).slice(0, 3);
}

/** Enough real data to draw a tree without calling the AI. */
export function isSufficient(d: DbNameRow): boolean {
  const hasRoot = typeof d.linguistic_root === 'string' && d.linguistic_root.length > 8;
  const hasContext =
    (d.etymology?.historical_context?.length ?? 0) > 30 || (d.contextual_meaning?.length ?? 0) > 30;
  const hasRegion = !!(d.region_origin || d.ethnicity_tribe);
  return hasRoot && hasContext && hasRegion && recordedVariants(d).length > 0;
}

export function mapDbToTree(name: string, d: DbNameRow): TreeData {
  return {
    name,
    root_label: d.linguistic_root ?? name,
    root_meaning: firstWords(d.primary_meaning, 4),
    primary_epoch: d.etymology?.era ?? d.etymology?.context ?? 'Era not recorded',
    primary_context: d.etymology?.historical_context ?? d.contextual_meaning ?? '',
    region: d.region_origin ?? 'Unknown region',
    tribe: d.ethnicity_tribe ?? 'Unknown culture',
    branches: recordedVariants(d).map((v) => ({ name: v, variant_type: 'Related form' })),
    narrative: d.contextual_meaning ?? d.etymology?.historical_context ?? '',
    source: 'db',
  };
}

/** Shown when the AI is unavailable: only what we actually know. */
export function buildFallbackTree(name: string, d: DbNameRow | null): TreeData {
  const cap = capitalize(name);
  return {
    name: cap,
    root_label: d?.linguistic_root ?? cap,
    root_meaning: firstWords(d?.primary_meaning, 4),
    primary_epoch: d?.etymology?.era ?? 'Not yet documented',
    primary_context:
      d?.contextual_meaning ?? d?.etymology?.historical_context ??
      `We don't have a documented etymology for ${cap} yet.`,
    region: d?.region_origin ?? 'Unknown region',
    tribe: d?.ethnicity_tribe ?? 'Unknown culture',
    branches: recordedVariants(d).map((v) => ({ name: v, variant_type: 'Related form' })),
    narrative: '',
    source: 'fallback',
  };
}
