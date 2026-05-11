import { NextRequest, NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { sendDfranquiasReply } from '@/lib/dfranquias-client';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
  }

  // Busca o external_id (ID numérico do dfranquias) pelo UUID interno
  const ticket = await queryOne<{ external_id: string }>(
    `SELECT external_id FROM saf_tickets WHERE id = $1`,
    [id]
  );

  if (!ticket) {
    return NextResponse.json({ error: 'Ticket não encontrado' }, { status: 404 });
  }

  try {
    await sendDfranquiasReply(ticket.external_id, content.trim());
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 }
    );
  }
}
