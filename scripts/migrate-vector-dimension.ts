import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, {
    ssl: 'require', max: 1, connect_timeout: 30, idle_timeout: 30
});

async function migrate() {
    console.log('🔄 Starting vector dimension migration: 1536 → 1024\n');
    try {
        // Step 1: Drop old HNSW index
        console.log('Step 1: Dropping old HNSW index...');
        await sql`DROP INDEX IF EXISTS idx_names_embedding_cosine`;
        console.log('✅ Done\n');

        // Step 2: Clear existing embeddings (1536-dim, incompatible with 1024)
        console.log('Step 2: Clearing existing 1536-dim embeddings...');
        const { count } = await sql`UPDATE public.names SET embedding = NULL`.then(r => ({ count: r.count }));
        console.log(`✅ Cleared embeddings on ${count} rows\n`);

        // Step 3: Alter column type
        console.log('Step 3: Altering column type to vector(1024)...');
        await sql`ALTER TABLE public.names ALTER COLUMN embedding TYPE vector(1024) USING NULL::vector(1024)`;
        console.log('✅ Done\n');

        // Step 4: Recreate HNSW index
        console.log('Step 4: Recreating HNSW index for vector(1024)...');
        await sql`
            CREATE INDEX idx_names_embedding_cosine
            ON public.names
            USING hnsw (embedding vector_cosine_ops)
        `;
        console.log('✅ Done\n');

        // Step 5: Replace match_names function
        console.log('Step 5: Updating match_names() function signature...');
        await sql`DROP FUNCTION IF EXISTS match_names(vector, float, int)`;
        await sql`
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
            $$
        `;
        console.log('✅ Done\n');

        console.log('🎉 Migration complete!');
        console.log('👉 Next step: run  npm run db:embed  to regenerate all embeddings at 1024 dims.\n');
    } catch (err) {
        console.error('❌ Migration failed:', err);
    } finally {
        await sql.end();
    }
}

migrate();
