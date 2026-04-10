/**
 * Conexão com PostgreSQL (Digital Ocean Managed Database)
 *
 * Usa um pool de conexões via `pg`.
 * A DATABASE_URL deve incluir o certificado CA quando
 * a opção "Require SSL" estiver ativa no DO (recomendado).
 *
 * Formato da URL:
 *   postgresql://user:password@host:port/dbname?sslmode=require
 *
 * Para SSL com CA customizado:
 *   Baixe o certificado CA em: Digital Ocean → Database → Connection Details
 *   e coloque em /certs/do-ca-certificate.crt
 *   Adicione a variável DB_SSL_CA_PATH=./certs/do-ca-certificate.crt
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import fs from 'fs';
import path from 'path';
import { createChildLogger } from './logger';

const log = createChildLogger('db');

function buildPool(): Pool {
  let connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL não configurada. Defina no .env.local');
  }

  // Digital Ocean: adiciona uselibpqcompat para evitar que sslmode=require
  // seja tratado como verify-full nas versões novas do pg-connection-string
  if (connectionString.includes('sslmode=require') && !connectionString.includes('uselibpqcompat')) {
    connectionString = connectionString.replace('sslmode=require', 'sslmode=require&uselibpqcompat=true');
  }

  // SSL obrigatório para Digital Ocean Managed DB
  let ssl: boolean | { rejectUnauthorized: boolean; ca?: string } = false;

  if (process.env.DATABASE_SSL === 'true' || connectionString.includes('sslmode=require')) {
    const caPath = process.env.DB_SSL_CA_PATH;
    if (caPath) {
      const resolved = path.resolve(caPath);
      if (fs.existsSync(resolved)) {
        ssl = { rejectUnauthorized: true, ca: fs.readFileSync(resolved).toString() };
        log.info('SSL com CA personalizado configurado');
      } else {
        log.warn(`CA não encontrado em ${resolved}. Usando SSL sem verificação de CA.`);
        ssl = { rejectUnauthorized: false };
      }
    } else {
      ssl = { rejectUnauthorized: false };
    }
  }

  return new Pool({
    connectionString,
    ssl: ssl || undefined,
    max: 10,               // máximo de conexões no pool
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
}

// Singleton do pool — reutilizado entre requests no Next.js
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) pool = buildPool();
  return pool;
}

// -------------------------------------------------------
// Helpers de query tipados
// -------------------------------------------------------

/** Executa query e retorna todas as linhas */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const client = getPool();
  try {
    const result: QueryResult<T> = await client.query<T>(sql, params);
    return result.rows;
  } catch (err) {
    log.error(`Query error: ${(err as Error).message}\nSQL: ${sql}`);
    throw err;
  }
}

/** Executa query e retorna a primeira linha ou null */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/** Executa query sem retorno (INSERT/UPDATE/DELETE) */
export async function execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
  const client = getPool();
  try {
    return await client.query(sql, params);
  } catch (err) {
    log.error(`Execute error: ${(err as Error).message}\nSQL: ${sql}`);
    throw err;
  }
}

/** Executa bloco em transação */
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

/** Verifica se a conexão está ativa */
export async function healthCheck(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
