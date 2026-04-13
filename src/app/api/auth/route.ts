import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const COOKIE_NAME = 'saf_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 dias

export async function POST(req: NextRequest) {
  const { password } = await req.json() as { password?: string };
  const expected = process.env.APP_PASSWORD?.trim();

  if (!expected) {
    return NextResponse.json({ error: 'APP_PASSWORD não configurada' }, { status: 500 });
  }

  if (!password || password.trim() !== expected) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 401 });
  }

  const token = createHash('sha256').update(expected).digest('hex');
  const from   = req.nextUrl.searchParams.get('from') ?? '/';

  const res = NextResponse.json({ ok: true, redirect: from });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, '', { maxAge: 0, path: '/' });
  return res;
}
