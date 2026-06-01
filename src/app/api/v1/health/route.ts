import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:v1:health');

export async function GET() {
  try {
    const row = await queryOne<{ now: string }>('SELECT NOW() AS now');
    return NextResponse.json({
      ok: true,
      db: 'connected',
      dbTime: row?.now ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    log.error(`DB health check failed: ${(err as Error).message}`);
    return NextResponse.json({ ok: false, db: 'error' }, { status: 503 });
  }
}
