import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const LOGIN_PATH  = '/login';
const COOKIE_NAME = 'saf_session';

function getSecret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET?.trim() ?? '');
}

async function getSessionRole(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload as { role?: string }).role ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes — no auth needed
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/cron') ||
    pathname.startsWith('/api/health') ||
    pathname.startsWith('/api/v1/health') ||
    pathname.startsWith('/api/webhooks') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next();
  }

  // JWT_SECRET not configured — allow everything (dev without DB)
  if (!process.env.JWT_SECRET?.trim()) return NextResponse.next();

  const role = await getSessionRole(req);

  if (!role) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = LOGIN_PATH;
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin routes — superadmin only
  if (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) {
    if (role !== 'superadmin') {
      return NextResponse.json({ error: 'Acesso restrito a super admins' }, { status: 403 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Exclude static files (images, fonts, icons) and Next.js internals
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf)).*)'],
};
