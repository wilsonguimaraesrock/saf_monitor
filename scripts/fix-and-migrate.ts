/**
 * Fix migrations tracking table and apply pending migrations.
 * Marks already-applied migrations that are missing from _migrations,
 * then applies any remaining ones.
 */

import fs from 'fs';
import path from 'path';
import { getPool } from '../src/lib/db';

async function main() {
  const pool = getPool();

  // Ensure migrations tracking table exists
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  // Mark 002 as applied (it was applied directly, not via the runner)
  await pool.query(`
    INSERT INTO _migrations (filename)
    VALUES ('002_updates_unique.sql')
    ON CONFLICT (filename) DO NOTHING
  `);
  console.log('✓ Marked 002_updates_unique.sql as applied');

  // Now apply 003 if not already applied
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const pending = ['003_department_and_sector_contacts.sql'];

  for (const file of pending) {
    const existing = await pool.query(
      'SELECT filename FROM _migrations WHERE filename = $1',
      [file]
    );
    if (existing.rows.length > 0) {
      console.log(`Já aplicado: ${file}`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.error(`Arquivo não encontrado: ${filePath}`);
      continue;
    }

    const sql = fs.readFileSync(filePath, 'utf-8');
    console.log(`Aplicando: ${file}...`);
    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    console.log(`✓ ${file}`);
  }

  console.log('Concluído.');
  await pool.end();
}

main().catch((err) => {
  console.error('Erro:', err.message);
  process.exit(1);
});
