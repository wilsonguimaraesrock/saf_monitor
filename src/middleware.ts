import { NextRequest, NextResponse } from 'next/server';

const LOGIN_PATH = '/login';
const COOKIE_NAME = 'saf_session';

/** sha256 via Web Crypto API — compatível com Edge Runtime */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer  = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function middleware(req: NextRequest) {
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

  const pwd = process.env.APP_PASSWORD?.trim();

  // Se APP_PASSWORD não estiver configurada, deixa passar
  if (!pwd) return NextResponse.next();

  const expectedToken  = await sha256(pwd);
  const sessionCookie  = req.cookies.get(COOKIE_NAME)?.value;

  if (sessionCookie !== expectedToken) {
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
