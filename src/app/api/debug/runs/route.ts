import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  const runs = await query(
    `SELECT id, run_type, status, triggered_by,
            tickets_found, tickets_new, tickets_updated,
            duration_ms, error_message,
            created_at, finished_at
     FROM cron_runs
     ORDER BY created_at DESC
     LIMIT 10`
  );

  const counts = await query(
    `SELECT status, COUNT(*) AS total
     FROM saf_tickets
     GROUP BY status
     ORDER BY total DESC`
  );

  return NextResponse.json({ runs, counts });
}
