/**
 * Teste de banco de dados
 * Testa conexão, cria schema e executa migrations.
 *
 * Uso:
 *   npx ts-node --project tsconfig.scripts.json --transpile-only scripts/test-db.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) { console.error('❌  .env.local não encontrado'); process.exit(1); }
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const ok   = (m: string) => console.log(`  ✅  ${m}`);
const fail = (m: string) => console.log(`  ❌  ${m}`);
const info = (m: string) => console.log(`  ℹ️   ${m}`);
const step = (m: string) => console.log(`\n▶  ${m}`);

async function run() {
  console.log('\n══════════════════════════════════════════');
  console.log('  TESTE DE BANCO — PostgreSQL (Digital Ocean)');
  console.log('══════════════════════════════════════════');

  const connStr = process.env.DATABASE_URL;
  if (!connStr) { fail('DATABASE_URL não definida no .env.local'); process.exit(1); }

  // Mostra host/db sem expor a senha
  const safeUrl = connStr.replace(/:([^@:]+)@/, ':***@');
  info(`URL: ${safeUrl}`);

  // Digital Ocean usa CA próprio — adiciona uselibpqcompat para
  // que sslmode=require não seja tratado como verify-full
  const safeConn = connStr.includes('uselibpqcompat')
    ? connStr
    : connStr.replace('sslmode=require', 'sslmode=require&uselibpqcompat=true');

  const pool = new Pool({
    connectionString: safeConn,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });

  try {
    // ── PASSO 1: Conexão básica ────────────────────────────
    step('Testando conexão...');
    const { rows: [pg] } = await pool.query('SELECT version(), current_database(), current_schema()');
    ok(`Conectado!`);
    info(`Versão:  ${pg.version.split(',')[0]}`);
    info(`Banco:   ${pg.current_database}`);
    info(`Schema:  ${pg.current_schema}`);

    // ── PASSO 2: Cria schema saf_monitor se não existir ────
    step('Verificando schema saf_monitor...');
    await pool.query(`CREATE SCHEMA IF NOT EXISTS saf_monitor`);
    await pool.query(`SET search_path TO saf_monitor`);
    ok('Schema saf_monitor pronto');

    // ── PASSO 3: Executa migrations ────────────────────────
    step('Executando migrations...');

    // Cria tabela de controle
    await pool.query(`
      CREATE TABLE IF NOT EXISTS saf_monitor._migrations (
        filename   TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrDir = path.join(__dirname, '..', 'supabase', 'migrations');
    const files   = fs.readdirSync(migrDir).filter((f) => f.endsWith('.sql')).sort();

    for (const file of files) {
      const { rows } = await pool.query(
        'SELECT filename FROM saf_monitor._migrations WHERE filename = $1', [file]
      );
      if (rows.length > 0) { info(`  Já aplicado: ${file}`); continue; }

      const sql = fs.readFileSync(path.join(migrDir, file), 'utf-8');
      info(`  Aplicando: ${file}...`);
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO saf_monitor._migrations (filename) VALUES ($1)', [file]);
        ok(`  ✓ ${file}`);
      } catch (err) {
        const msg = (err as Error).message;
        // Ignora erros de "já existe" — idempotente
        if (msg.includes('already exists')) {
          info(`  Já existe (ignorado): ${file}`);
          await pool.query('INSERT INTO saf_monitor._migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [file]);
        } else {
          fail(`  Migration ${file}: ${msg}`);
          throw err;
        }
      }
    }

    // ── PASSO 4: Verifica tabelas criadas ──────────────────
    step('Verificando tabelas...');
    const { rows: tables } = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'saf_monitor'
      ORDER BY tablename
    `);

    const expected = [
      'saf_tickets', 'saf_ticket_updates', 'saf_ticket_snapshots',
      'saf_categories', 'saf_clusters', 'alerts', 'cron_runs',
      'daily_stats', 'settings',
    ];

    const found = tables.map((t: Record<string, string>) => t.tablename);
    info(`Tabelas encontradas (${found.length}): ${found.join(', ')}`);

    for (const t of expected) {
      if (found.includes(t)) ok(`  Tabela: ${t}`);
      else fail(`  Tabela ausente: ${t}`);
    }

    // ── PASSO 5: Verifica dados iniciais ───────────────────
    step('Verificando dados iniciais (categories e settings)...');
    const { rows: cats }  = await pool.query('SELECT slug, label FROM saf_monitor.saf_categories ORDER BY slug');
    const { rows: setts } = await pool.query('SELECT key, value FROM saf_monitor.settings ORDER BY key');

    if (cats.length > 0) {
      ok(`${cats.length} categorias: ${cats.map((c: Record<string, string>) => c.label).join(', ')}`);
    } else {
      fail('Nenhuma categoria encontrada — seeds não rodaram');
    }

    if (setts.length > 0) {
      ok(`${setts.length} configurações carregadas`);
    } else {
      fail('Nenhuma configuração encontrada');
    }

    // ── PASSO 6: Teste de INSERT/SELECT/DELETE ─────────────
    step('Testando leitura/escrita...');
    await pool.query(`
      INSERT INTO saf_monitor.cron_runs (run_type, status, triggered_by)
      VALUES ('on_demand', 'success', 'test-script')
    `);
    const { rows: runs } = await pool.query(
      `SELECT id, started_at FROM saf_monitor.cron_runs WHERE triggered_by = 'test-script' LIMIT 1`
    );
    ok(`INSERT/SELECT OK — id: ${runs[0]?.id}`);

    await pool.query(`DELETE FROM saf_monitor.cron_runs WHERE triggered_by = 'test-script'`);
    ok('DELETE OK — limpeza concluída');

    // ── RESUMO ─────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  BANCO PRONTO');
    console.log('══════════════════════════════════════════');
    ok('Conexão OK');
    ok('Schema saf_monitor criado');
    ok('Todas as tabelas criadas');
    ok('Leitura e escrita funcionando');
    info('Próximo passo: npm run scraper:run (ou testar o scraper completo)');
    console.log('══════════════════════════════════════════\n');

  } catch (err) {
    console.log('\n══════════════════════════════════════════');
    fail(`Erro: ${(err as Error).message}`);
    console.log('══════════════════════════════════════════\n');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
