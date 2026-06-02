import { getDb } from './connection.js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function ensureMigrationsTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
}

async function getAppliedMigrations() {
  const sql = getDb();
  const rows = await sql`SELECT version FROM schema_migrations ORDER BY version`;
  return new Set(rows.map(r => r.version));
}

async function applyMigration(version: string, sqlContent: string) {
  const sql = getDb();
  const normalizedSql = sqlContent.replace(/^\uFEFF/, '');
  console.log(`Applying migration: ${version}`);
  
  await sql.begin(async (tx) => {
    // Execute migration SQL
    await tx.unsafe(normalizedSql);
    
    // Record migration
    await tx`INSERT INTO schema_migrations (version) VALUES (${version})`;
  });
  
  console.log(`✓ Migration ${version} applied successfully`);
}

export async function runMigrations() {
  try {
    console.log('Starting database migrations...');
    
    await ensureMigrationsTable();
    const applied = await getAppliedMigrations();
    
    const migrationsDir = join(__dirname, '../migrations');
    const files = await readdir(migrationsDir);
    const migrationFiles = files
      .filter(f => f.endsWith('.sql'))
      .sort();
    
    let appliedCount = 0;
    
    for (const file of migrationFiles) {
      const version = file.replace('.sql', '');
      
      if (applied.has(version)) {
        console.log(`⊘ Migration ${version} already applied, skipping`);
        continue;
      }
      
      const filePath = join(migrationsDir, file);
      const sqlContent = await readFile(filePath, 'utf-8');
      
      await applyMigration(version, sqlContent);
      appliedCount++;
    }
    
    if (appliedCount === 0) {
      console.log('No new migrations to apply');
    } else {
      console.log(`\n✓ Applied ${appliedCount} migration(s) successfully`);
    }
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}
