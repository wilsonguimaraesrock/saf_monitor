import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const runs = await query(
      `SELECT * FROM cron_runs ORDER BY started_at DESC LIMIT 20`
    );
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
