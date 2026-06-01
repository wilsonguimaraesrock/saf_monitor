import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const COOKIE_NAME = 'saf_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export { COOKIE_NAME, COOKIE_MAX_AGE };

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: 'superadmin' | 'user';
  departments: string[];
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) throw new Error('JWT_SECRET não configurado');
  return new TextEncoder().encode(secret);
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
