import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET() {
  try {
    const services = await query(
      `SELECT service, priority_category, COUNT(*) AS total
       FROM saf_tickets
       WHERE status NOT IN ('resolvido','cancelado')
       GROUP BY service, priority_category
       ORDER BY total DESC
       LIMIT 60`
    );
    return NextResponse.json(services);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
