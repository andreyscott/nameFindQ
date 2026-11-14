import { z } from 'zod';

/**
 * Zod schemas for every AI response. Models sometimes emit `null` for missing
 * optional fields, so optional strings accept null and normalize to undefined.
 * Length caps keep junk or prompt-injected essays out of the database.
 */

const req = (max: number) => z.string().trim().min(1).max(max);
const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : undefined));

export const MAX_RESULTS = 8;

export const NameItemSchema = z.object({
  name: req(60),
  primary_meaning: req(300),
  contextual_meaning: opt(600),
  region_origin: opt(120),
  ethnicity_tribe: opt(120),
  linguistic_root: opt(300),
  gender: opt(30),
  pronunciation: opt(120),
  etymology_node: z
    .object({
      era: opt(120),
      historical_context: opt(600),
    })
    .nullish()
    .transform((v) => v ?? undefined),
});

export const NameResultSchema = z.object({
  query_tags: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .transform((tags) => tags.slice(0, 6).map((t) => t.toUpperCase())),
  results: z
    .array(NameItemSchema)
    .min(1)
    .transform((items) => items.slice(0, MAX_RESULTS)),
});

export type NameItem = z.infer<typeof NameItemSchema>;
export type NameResponse = z.infer<typeof NameResultSchema>;

export const VARIANT_TYPES = ['Direct', 'Extended', 'Feminine', 'Short Form', 'Modern'] as const;

export const TreeBranchSchema = z.object({
  name: req(60),
  meaning: req(120),
  variant_type: z.enum(VARIANT_TYPES),
  sub_variant: req(60),
  sub_variant_region: req(80),
});

export const TreeAISchema = z.object({
  root_label: req(200),
  root_meaning: req(80),
  primary_epoch: req(120),
  primary_context: req(600),
  region: req(120),
  tribe: req(120),
  branches: z.tuple([TreeBranchSchema, TreeBranchSchema, TreeBranchSchema]),
  narrative: req(800),
});

export type TreeBranch = z.infer<typeof TreeBranchSchema>;
export type TreeAI = z.infer<typeof TreeAISchema>;
