import { NextRequest, NextResponse } from 'next/server';
import {
  getDashboardStats,
  getTrendData,
  getOldestTickets,
  getOverdueTickets,
  getAwaitingTickets,
  getCriticalTickets,
} from '@/repository/tickets';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const trendDays = Number(searchParams.get('trendDays') ?? 14);

  try {
    const [stats, trend, oldest, overdue, awaiting, critical, clusters] = await Promise.all([
      getDashboardStats(),
      getTrendData(trendDays),
      getOldestTickets(10),
      getOverdueTickets(20),
      getAwaitingTickets(20),
      getCriticalTickets(20),
      query('SELECT * FROM saf_clusters ORDER BY ticket_count DESC LIMIT 20'),
    ]);

    return NextResponse.json({ stats, trend, oldest, overdue, awaiting, critical, clusters });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
