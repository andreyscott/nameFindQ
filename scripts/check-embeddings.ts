import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as path from 'path';
import postgres from 'postgres';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function checkEmbeddings() {
    const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1, connect_timeout: 30 });
    try {
        const result = await sql`
            SELECT
                COUNT(*)::int          AS total,
                COUNT(embedding)::int  AS with_embeddings,
                (COUNT(*) - COUNT(embedding))::int AS missing_embeddings
            FROM public.names
        `;
        console.log('Database embedding status:');
        console.log(JSON.stringify(result[0], null, 2));
    } finally {
        await sql.end();
    }
}

checkEmbeddings();
