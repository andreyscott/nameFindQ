-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. Names Table (Core Dictionary)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.names (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    primary_meaning TEXT,
    contextual_meaning TEXT,
    region_origin VARCHAR(255),
    ethnicity_tribe VARCHAR(255),
    linguistic_root TEXT,
    gender VARCHAR(50), -- e.g., 'Masculine', 'Feminine', 'Neutral'
    pronunciation VARCHAR(255),
    vibe_tags TEXT[], -- array of tags for the 'vibe scanner' (e.g. ['ethereal', 'strong'])
    etymology JSONB, -- store structured etymology mapping
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add an index on the name column for faster lookups since we will search by name
CREATE INDEX IF NOT EXISTS idx_names_name ON public.names(name);

-- Add unique constraint on name column to handle conflict in seed script
ALTER TABLE public.names ADD CONSTRAINT unique_name UNIQUE(name);



-- ==========================================
-- 2. User Profiles (Optional)
-- Extends Supabase auth.users if you need additional user fields
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(255) UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 3. Saved Names (For Persistence/Saved Items)
-- ==========================================
CREATE TABLE IF NOT EXISTS public.saved_names (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name_id UUID NOT NULL REFERENCES public.names(id) ON DELETE CASCADE,
    notes TEXT, -- optional notes by the user for why they saved the name
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, name_id) -- prevent duplicate saves of the same name by the same user
);


-- ==========================================
-- 4. Search History
-- ==========================================
CREATE TABLE IF NOT EXISTS public.search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    search_query TEXT NOT NULL,
    filters JSONB, -- any specific filters used (e.g., {"region_origin": "latin", "gender": "neutral"})
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Names: anyone can read, only service role (your API) can write
ALTER TABLE public.names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Names are viewable by everyone." ON public.names FOR SELECT USING (true);

-- Profiles: users can read their own, update their own
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile." ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile." ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Saved Names: users can manage their own saved names
ALTER TABLE public.saved_names ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own saved names." ON public.saved_names FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own saved names." ON public.saved_names FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own saved names." ON public.saved_names FOR DELETE USING (auth.uid() = user_id);

-- Search History: users can manage their own search history
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own search history." ON public.search_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own search history." ON public.search_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own search history." ON public.search_history FOR DELETE USING (auth.uid() = user_id);


-- ==========================================
-- TRIGGERS
-- ==========================================

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply trigger to names table
CREATE TRIGGER update_names_modtime
    BEFORE UPDATE ON public.names
    FOR EACH ROW
    EXECUTE FUNCTION update_modified_column();

-- ==========================================
-- PERFORMANCE EXTENSIONS & ADVANCED INDEXING
-- ==========================================

-- 1. Performance Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2. Advanced Indexing for Search and Vibe Queries
CREATE INDEX IF NOT EXISTS idx_names_name_fuzzy ON public.names USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_names_vibe_tags_gin ON public.names USING gin (vibe_tags);

-- 3. Optimization for JSONB filters in history
CREATE INDEX IF NOT EXISTS idx_search_history_filters ON public.search_history USING gin (filters);
