/**
 * POST /api/admin/migrate
 * One-time setup: creates the users table and seeds the superadmin.
 * Protected by CRON_SECRET (reuses existing secret).
 * Safe to run multiple times (CREATE TABLE IF NOT EXISTS).
 */
import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Users table
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      email         TEXT    UNIQUE NOT NULL,
      name          TEXT    NOT NULL,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user',
      departments   TEXT[]  NOT NULL DEFAULT '{}',
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Knowledge base articles (RAG) — separated by department
  await execute(`
    CREATE TABLE IF NOT EXISTS knowledge_base (
      id         SERIAL PRIMARY KEY,
      title      TEXT    NOT NULL,
      content    TEXT    NOT NULL,
      category   TEXT    NOT NULL DEFAULT 'geral',
      department TEXT    NOT NULL DEFAULT 'global',
      embedding  FLOAT8[],
      is_active  BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bot configuration (key-value)
  await execute(`
    CREATE TABLE IF NOT EXISTS bot_settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Seed default bot settings (idempotent)
  await execute(`
    INSERT INTO bot_settings (key, value) VALUES
      ('test_phone_numbers', '[]'),
      ('enabled_departments', '[]'),
      ('system_prompt', 'Você é a Roxy, assistente de IA pedagógica da Rockfeller. Responda de forma clara, objetiva e amigável em português. Use apenas as informações da base de conhecimento fornecida. Nunca invente informações. Se não souber a resposta, diga que vai transferir para um atendente humano.')
    ON CONFLICT (key) DO NOTHING
  `);

  // Conversation state for escalation flow
  await execute(`
    CREATE TABLE IF NOT EXISTS bot_conversations (
      chatwoot_conversation_id INTEGER PRIMARY KEY,
      state                    TEXT NOT NULL DEFAULT 'active',
      last_bot_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed superadmin from env vars (idempotent)
  const email    = process.env.SUPERADMIN_EMAIL?.trim();
  const password = process.env.SUPERADMIN_PASSWORD?.trim();

  if (!email || !password) {
    return NextResponse.json({ ok: true, seeded: false, message: 'SUPERADMIN_EMAIL ou SUPERADMIN_PASSWORD não configurados' });
  }

  const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE email = $1', [email]);
  if (existing) {
    return NextResponse.json({ ok: true, seeded: false, message: 'Superadmin já existe' });
  }

  const hash = await hashPassword(password);
  await execute(
    `INSERT INTO users (email, name, password_hash, role, departments, is_active)
     VALUES ($1, $2, $3, 'superadmin', '{}', true)`,
    [email, 'Super Admin', hash]
  );

  return NextResponse.json({ ok: true, seeded: true, email });
}
