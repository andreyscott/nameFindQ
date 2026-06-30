import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });
import postgres from 'postgres';
import OpenAI from 'openai';

// Initialize Database and Qwen AI client (OpenAI-compatible)
const sql = postgres(process.env.DATABASE_URL!, {
    ssl: 'require', max: 1, connect_timeout: 30, idle_timeout: 30
});

const qwen = new OpenAI({
    apiKey: process.env.QWEN_API_KEY!,
    baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
});

async function generateEmbeddings() {
    console.log('🚀 Starting embedding generation...');

    try {
        // 1. Find all names that don't have an embedding yet
        const names = await sql`
            SELECT id, name, primary_meaning, contextual_meaning, ethnicity_tribe, vibe_tags 
            FROM public.names 
            WHERE embedding IS NULL
        `;

        if (names.length === 0) {
            console.log('✅ All names already have embeddings. Nothing to do!');
            return;
        }

        console.log(`Found ${names.length} names to process.\n`);

        // 2. Loop through each name and generate the vector
        for (const record of names) {

            // We combine the fields so the AI fully understands the cultural context
            const textToEmbed = `Name: ${record.name}. Tribe: ${record.ethnicity_tribe}. Meaning: ${record.primary_meaning}. Context: ${record.contextual_meaning}. Vibes: ${record.vibe_tags.join(', ')}.`;

            // Call Qwen text-embedding-v3 with dimensions: 1024 to match the DB vector(1024) column
            // NOTE: text-embedding-v3 only supports: 512, 768, 1024
            const response = await qwen.embeddings.create({
                model: 'text-embedding-v3',
                input: textToEmbed,
                dimensions: 1024,
            });

            // Extract the array of 1024 numbers
            const embeddingArray = response.data?.[0]?.embedding;
            if (!embeddingArray) {
                throw new Error(`No embedding returned for: ${record.name}`);
            }

            // Format for pgvector (it expects a string like '[0.1, 0.2, ...]')
            const embeddingString = `[${embeddingArray.join(',')}]`;

            // 3. Save it back to the database
            await sql`
                UPDATE public.names
                SET embedding = ${embeddingString}
                WHERE id = ${record.id}
            `;

            console.log(`✅ Embedded and saved: ${record.name}`);

            // Small pause to respect rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        console.log('\n🎉 Finished! Your database is now AI-ready.');

    } catch (error) {
        console.error('❌ Critical error:', error);
    } finally {
        await sql.end();
    }
}

generateEmbeddings();