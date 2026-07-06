import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { verifyPassword, signToken, verifyToken, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** GET /api/auth — retorna o usuário logado (via JWT do cookie) */
export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ user: null });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ user: null });
  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

interface DbUser {
  id: number;
  email: string;
  name: string;
  role: 'superadmin' | 'user';
  departments: string[];
  is_active: boolean;
  password_hash: string;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as { email?: string; password?: string };
  const { email, password } = body;

  if (!email || !password) {
    return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
  }

  const user = await queryOne<DbUser>(
    'SELECT id, email, name, role, departments, is_active, password_hash FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );

  if (!user || !user.is_active) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
  }

  const token = await signToken({
    id:          user.id,
    email:       user.email,
    name:        user.name,
    role:        user.role,
    departments: user.departments ?? [],
  });

  const from = req.nextUrl.searchParams.get('from') ?? '/';
  const res  = NextResponse.json({ ok: true, redirect: from, name: user.name, role: user.role });

  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   COOKIE_MAX_AGE,
    path:     '/',
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res;
}
