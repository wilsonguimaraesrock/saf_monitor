/**
 * GET  /api/admin/users  — lista todos os usuários
 * POST /api/admin/users  — cria novo usuário
 * Apenas superadmin pode acessar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken, hashPassword, COOKIE_NAME } from '@/lib/auth';

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  return user?.role === 'superadmin' ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await requireSuperAdmin(req)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const rows = await query<{
    id: number; email: string; name: string; role: string;
    departments: string[]; is_active: boolean; created_at: string;
    has_chatwoot_token: boolean;
  }>(`SELECT id, email, name, role, departments, is_active, created_at,
             (chatwoot_token IS NOT NULL AND chatwoot_token <> '') AS has_chatwoot_token
      FROM users ORDER BY created_at ASC`);

  return NextResponse.json({ users: rows });
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin(req)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const body = await req.json() as {
    email?: string; name?: string; password?: string;
    role?: string; departments?: string[]; chatwootToken?: string;
  };

  const { email, name, password, role = 'user', departments = [], chatwootToken } = body;

  if (!email || !name || !password) {
    return NextResponse.json({ error: 'email, name e password são obrigatórios' }, { status: 400 });
  }

  if (!['superadmin', 'user'].includes(role)) {
    return NextResponse.json({ error: 'role inválido' }, { status: 400 });
  }

  const hash = await hashPassword(password);

  try {
    await execute(
      `INSERT INTO users (email, name, password_hash, role, departments, is_active, chatwoot_token)
       VALUES ($1, $2, $3, $4, $5, true, $6)`,
      [email.trim().toLowerCase(), name.trim(), hash, role, departments, chatwootToken?.trim() || null]
    );
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'Email já cadastrado' }, { status: 409 });
    }
    throw err;
  }
}
