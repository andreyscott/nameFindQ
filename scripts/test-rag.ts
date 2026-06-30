import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import postgres from 'postgres';
import OpenAI from 'openai';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function testRag() {
    const query = 'a strong warrior name from the Yoruba tribe';
    console.log(`\n🔍 Testing RAG pipeline with query: "${query}"\n`);

    // 1. Embed using Qwen text-embedding-v3 (OpenAI-compatible)
    const qwen = new OpenAI({
        apiKey: process.env.QWEN_API_KEY!,
        baseURL: process.env.QWEN_BASE_URL || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    });

    console.log('Step 1: Generating embedding with text-embedding-v3 (Qwen)...');
    const embeddingResponse = await qwen.embeddings.create({
        model: 'text-embedding-v3',
        input: query,
        dimensions: 1024,
    });

    const values = embeddingResponse.data?.[0]?.embedding;
    if (!values) throw new Error('No embedding returned');
    console.log(`✅ Embedding generated — ${values.length} dimensions\n`);

    // 2. Query DB
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 30 });
    console.log('Step 2: Calling match_names() in Supabase...');

    try {
        const embeddingString = `[${values.join(',')}]`;
        const results = await sql`
            SELECT name, primary_meaning, ethnicity_tribe, vibe_tags
            FROM match_names(
                ${embeddingString}::vector,
                ${0.4}::float,
                ${5}::int
            )
        `;

        console.log(`✅ Got ${results.length} result(s):\n`);
        results.forEach((r, i) => {
            console.log(`  ${i + 1}. ${r.name} (${r.ethnicity_tribe})`);
            console.log(`     "${r.primary_meaning}"`);
            console.log(`     Tags: ${(r.vibe_tags || []).join(', ')}\n`);
        });
    } finally {
        await sql.end();
    }
}

testRag().catch(console.error);
