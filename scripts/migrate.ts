/**
 * Executa as migrations SQL no banco PostgreSQL
 * Uso: npm run db:migrate
 */

import fs from 'fs';
import path from 'path';
import { getPool } from '../src/lib/db';
import { logger } from '../src/lib/logger';

async function migrate() {
  const pool = getPool();
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  // Cria tabela de controle se não existir
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  for (const file of files) {
    const existing = await pool.query(
      'SELECT filename FROM _migrations WHERE filename = $1',
      [file]
    );
    if (existing.rows.length > 0) {
      logger.info(`Já aplicado: ${file}`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    logger.info(`Aplicando: ${file}...`);

    await pool.query(sql);
    await pool.query('INSERT INTO _migrations (filename) VALUES ($1)', [file]);
    logger.info(`✓ ${file}`);
  }

  logger.info('Migrations concluídas.');
  await pool.end();
}

migrate().catch((err) => {
  logger.error(`Migration falhou: ${err.message}`);
  process.exit(1);
});
