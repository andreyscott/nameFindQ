import 'dotenv/config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';

// Load .env.local first (Next.js convention), then .env
dotenv.config({ path: path.join(process.cwd(), '.env.local') });
dotenv.config({ path: path.join(process.cwd(), '.env') });

async function deployMatchFunction() {
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is missing! Check your .env.local file.');
        process.exit(1);
    }

    const sql = postgres(process.env.DATABASE_URL, {
        ssl: 'require',
        max: 1,
        connect_timeout: 30,
        idle_timeout: 30,
    });

    try {
        console.log('🚀 Deploying match_names function to Supabase...\n');

        const sqlFilePath = path.join(process.cwd(), 'scripts', 'create-match-function.sql');
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf-8');

        // Execute the full SQL file using unsafe() for raw DDL statements
        await sql.unsafe(sqlContent);

        console.log('✅ match_names function deployed successfully!');
        console.log('\nTest it in Supabase SQL Editor with:');
        console.log("  SELECT * FROM match_names(array_fill(0, ARRAY[1536])::vector, 0.3, 5);");

    } catch (error) {
        console.error('❌ Deployment failed:', error);
        process.exit(1);
    } finally {
        await sql.end();
    }
}

deployMatchFunction();
