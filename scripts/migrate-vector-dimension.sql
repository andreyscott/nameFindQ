-- ============================================================
-- Migration: Resize embedding column from vector(1536) to vector(1024)
--
-- Required because Qwen text-embedding-v3 supports: 512, 768, 1024
-- (NOT 1536 which was used by the old Gemini embedding model).
--
-- Run this once in Supabase SQL Editor or via psql:
--   psql $DATABASE_URL -f scripts/migrate-vector-dimension.sql
--
-- WARNING: This clears all existing embeddings (set to NULL).
-- You MUST re-run `npm run db:embed` after this migration to
-- regenerate all embeddings with Qwen text-embedding-v3 at 1024 dims.
-- ============================================================

-- Step 1: Drop the old HNSW index (it's tied to the old dimension)
DROP INDEX IF EXISTS idx_names_embedding_cosine;

-- Step 2: Clear existing 1536-dim embeddings (incompatible with 1024)
UPDATE public.names SET embedding = NULL;

-- Step 3: Change column type from vector(1536) → vector(1024)
ALTER TABLE public.names
  ALTER COLUMN embedding TYPE vector(1024)
  USING embedding::vector(1024);

-- Step 4: Recreate the HNSW index for the new dimension
CREATE INDEX idx_names_embedding_cosine
  ON public.names
  USING hnsw (embedding vector_cosine_ops);

-- Step 5: Replace the match function with the correct dimension
CREATE OR REPLACE FUNCTION match_names(
  query_embedding vector(1024),
  match_threshold float,
  match_count     int
)
RETURNS TABLE (
  id                uuid,
  name              varchar,
  primary_meaning   text,
  contextual_meaning text,
  vibe_tags         text[],
  ethnicity_tribe   varchar
)
LANGUAGE sql STABLE
AS $$
  SELECT
    n.id,
    n.name,
    n.primary_meaning,
    n.contextual_meaning,
    n.vibe_tags,
    n.ethnicity_tribe
  FROM public.names n
  WHERE n.embedding IS NOT NULL
    AND (1 - (n.embedding <=> query_embedding)) >= match_threshold
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Done. Now run: npm run db:embed
