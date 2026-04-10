import { NextRequest, NextResponse } from 'next/server';
import { getTicketsFiltered, getDashboardStats, getTrendData } from '@/repository/tickets';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;

  const filters = {
    status:               searchParams.get('status')   ?? undefined,
    category:             searchParams.get('category') ?? undefined,
    franchise:            searchParams.get('franchise') ?? undefined,
    isOverdue:            searchParams.has('overdue') ? searchParams.get('overdue') === 'true' : undefined,
    awaitingOurResponse:  searchParams.has('awaiting') ? searchParams.get('awaiting') === 'true' : undefined,
    limit:                Number(searchParams.get('limit')  ?? 50),
    offset:               Number(searchParams.get('offset') ?? 0),
  };

  try {
    const tickets = await getTicketsFiltered(filters);
    return NextResponse.json({ tickets, count: tickets.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
