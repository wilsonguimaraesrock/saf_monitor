import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';

const LOGIN_PATH = '/login';
const COOKIE_NAME = 'saf_session';

/** Token esperado = sha256 da senha. Muda automaticamente se a senha mudar. */
function expectedToken(): string | null {
  const pwd = process.env.APP_PASSWORD?.trim();
  if (!pwd) return null;
  return createHash('sha256').update(pwd).digest('hex');
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Rotas que nunca precisam de auth
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  const token = expectedToken();

  // Se APP_PASSWORD não estiver configurada, deixa passar (sem proteção)
  if (!token) return NextResponse.next();

  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;

  if (sessionCookie !== token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
