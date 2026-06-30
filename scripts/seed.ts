import 'dotenv/config';
import postgres from 'postgres';
import * as fs from 'fs';
import * as path from 'path';

// Initialize connection using your connection string (keep this secure!)
const sql = postgres(process.env.DATABASE_URL!, {
    ssl: 'require',
    max: 1, // Ensure we don't open too many connections
    idle_timeout: 60, // Keep connection open longer
});

function isPostgresError(error: unknown): error is { code: string } {
    return (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof (error as { code?: unknown }).code === 'string'
    );
}

async function seedDatabase() {
    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is missing! Check your .env file.");
        return;
    }
    try {
        console.log('🚀 Starting onomastic database seed...');

        // 1. Read the JSON files
        const filesToSeed = ['Igbo.json', 'Edo.json', 'yoruba.json'];

        for (const fileName of filesToSeed) {
            console.log(`\n📂 Reading file: ${fileName}...`);
            const filePath = path.join(process.cwd(), 'data', fileName);

            if (!fs.existsSync(filePath)) {
                console.error(`❌ File not found: ${filePath}, skipping.`);
                continue;
            }

            const rawData = fs.readFileSync(filePath, 'utf-8');
            const namesData = JSON.parse(rawData);

            // 2. Define Batch Parameters
            // Serverless databases choke if you send 10,000 rows at once.
            // Chunking data into batches of 200 is the sweet spot.
            const BATCH_SIZE = 50;

            for (let i = 0; i < namesData.length; i += BATCH_SIZE) {
                const chunk = namesData.slice(i, i + BATCH_SIZE);

                console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1} from ${fileName}...`);

                // 3. Heavy-duty bulk insert with conflict handling
                await sql`
        INSERT INTO public.names ${sql(
                    chunk,
                    'name', 'primary_meaning', 'contextual_meaning',
                    'region_origin', 'ethnicity_tribe', 'linguistic_root',
                    'gender', 'pronunciation', 'vibe_tags', 'etymology'
                )}
        ON CONFLICT (name) DO NOTHING;
      `;
            }
        }

        console.log('✅ Seeding complete! All names successfully indexed.');
    } catch (error: unknown) {
        console.error('❌ Critical failure during seeding process:', error);
    } finally {
        await sql.end(); // Cleanly close database pool connection
    }
}

seedDatabase();