import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const ticket = await queryOne(
    `SELECT * FROM saf_tickets WHERE id = $1`,
    [id]
  );

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
  }

  const updates = await query(
    `SELECT id, author, content, is_ours, occurred_at
     FROM saf_ticket_updates
     WHERE ticket_id = $1
     ORDER BY occurred_at ASC NULLS LAST`,
    [id]
  );

  return NextResponse.json({ ticket, updates });
}
