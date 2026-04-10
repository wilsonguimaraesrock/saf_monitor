import { NextResponse } from 'next/server';
import { healthCheck } from '@/lib/db';

export async function GET() {
  const db = await healthCheck();
  const status = db ? 200 : 503;
  return NextResponse.json(
    { status: db ? 'ok' : 'error', db, timestamp: new Date().toISOString() },
    { status }
  );
}
