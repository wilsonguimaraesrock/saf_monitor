/**
 * Conexão com PostgreSQL (Digital Ocean Managed Database)
 *
 * Usa globalThis para manter um único pool entre hot-reloads do Next.js
 * e entre invocações serverless na mesma instância.
 *
 * Pool sizing para serverless:
 *   - max: 3  → cada instância Vercel abre no máximo 3 conexões
 *   - Digital Ocean Connection Pooler (porta 25061, PgBouncer) lida com
 *     multiplexação e evita "too many clients"
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from './logger';

const log = createChildLogger('db');

// Chave no globalThis — sobrevive hot-reloads do Next.js dev
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function buildPool(): Pool {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada. Defina no .env.local');
  }

  // Remove parâmetros que o PostgreSQL/PgBouncer não aceita via URL
  // (sslmode e options são configurados via objetos no Pool)
  connectionString = connectionString
    .replace(/[?&]sslmode=[^&]*/g,  (m) => m.startsWith('?') ? '?' : '')
    .replace(/[?&]options=[^&]*/g,  (m) => m.startsWith('?') ? '?' : '')
    .replace(/\?&/, '?')
    .replace(/[?&]$/, '');

  let ssl: boolean | { rejectUnauthorized: boolean; ca?: string } = false;

  if (process.env.DATABASE_SSL === 'true') {
    const caPath = process.env.DB_SSL_CA_PATH;
    if (caPath) {
      const resolved = path.resolve(caPath);
      if (fs.existsSync(resolved)) {
        ssl = { rejectUnauthorized: true, ca: fs.readFileSync(resolved).toString() };
        log.info('SSL com CA personalizado configurado');
      } else {
        ssl = { rejectUnauthorized: false };
      }
    } else {
      ssl = { rejectUnauthorized: false };
    }
  }

  const pool = new Pool({
    connectionString,
    ssl: ssl || undefined,
    // 1 conexão por instância serverless — evita "too many clients"
    // O globalThis singleton garante que cada instância Vercel usa apenas 1 pool
    max: 1,
    min: 0,
    idleTimeoutMillis: 5_000,    // fecha conexões ociosas rapidamente
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,       // libera o event loop em ambientes serverless
  });

  // Define search_path em cada nova conexão física do pool
  // (necessário ao usar PgBouncer na porta 25061 — não aceita options= na URL)
  pool.on('connect', (client) => {
    client.query("SET search_path TO saf_monitor").catch(() => {});
  });

  pool.on('error', (err) => {
    log.error(`Pool error: ${err.message}`);
  });

  return pool;
}

export function getPool(): Pool {
  // Em produção usa globalThis para sobreviver entre invocações da mesma instância
  // Em dev isso também evita múltiplos pools por hot-reload
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = buildPool();
  }
  return globalThis.__pgPool;
}

// -------------------------------------------------------
// Helpers de query tipados
// -------------------------------------------------------

export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  try {
    const result: QueryResult<T> = await getPool().query<T>(sql, params);
    return result.rows;
  } catch (err) {
    log.error(`Query error: ${(err as Error).message}\nSQL: ${sql}`);
    throw err;
  }
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

export async function execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
  try {
    return await getPool().query(sql, params);
  } catch (err) {
    log.error(`Execute error: ${(err as Error).message}\nSQL: ${sql}`);
    throw err;
  }
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
