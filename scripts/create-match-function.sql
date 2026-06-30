-- ============================================================
-- match_names: Semantic similarity search using pgvector
-- Returns names ranked by cosine distance to a query embedding.
--
-- Run this script once against your Supabase database via:
--   npm run db:deploy-fn
--
-- Parameters:
--   query_embedding  : The 1024-dim vector from Qwen text-embedding-v3
--   match_threshold  : Minimum similarity score (0–1). 0.5 is a good default.
--   match_count      : Maximum number of results to return
-- ============================================================

-- Step 1: Ensure pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add the embedding column if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'names'
      AND column_name  = 'embedding'
  ) THEN
    ALTER TABLE public.names ADD COLUMN embedding vector(1024);
    RAISE NOTICE 'Added embedding column to public.names';
  ELSE
    RAISE NOTICE 'embedding column already exists — skipping';
  END IF;
END $$;

-- Step 3: Create an HNSW index for fast approximate cosine search
--         (drop and recreate if it exists, to pick up any dimension changes)
DROP INDEX IF EXISTS idx_names_embedding_cosine;
CREATE INDEX idx_names_embedding_cosine
  ON public.names
  USING hnsw (embedding vector_cosine_ops);

-- Step 4: Create (or replace) the match function
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
