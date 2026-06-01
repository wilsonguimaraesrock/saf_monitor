/**
 * POST /api/webhooks/chatwoot
 * Recebe eventos do Chatwoot. Configurar em:
 * Chatwoot → Settings → Integrations → Webhooks → URL: https://<dominio>/api/webhooks/chatwoot
 * Eventos necessários: message_created
 */
import { NextRequest, NextResponse } from 'next/server';
import { handleIncomingMessage } from '@/lib/bot';
import { SECTORS } from '@/lib/sectors';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('webhook:chatwoot');

/** Map Chatwoot teamId → sector slug */
function departmentFromTeamId(teamId: number): string {
  const sector = SECTORS.find((s) => s.chatwoot?.teamId === teamId);
  return sector?.slug ?? 'global';
}

export async function POST(req: NextRequest) {
  // Optional signature verification
  const secret = process.env.CHATWOOT_WEBHOOK_SECRET?.trim();
  if (secret) {
    const sig = req.headers.get('x-chatwoot-signature') ?? '';
    const { createHmac } = await import('crypto');
    const body = await req.text();
    const expected = createHmac('sha256', secret).update(body).digest('hex');
    if (sig !== expected) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    const payload = JSON.parse(body) as ChatwootEvent;
    await processEvent(payload);
  } else {
    const payload = await req.json() as ChatwootEvent;
    await processEvent(payload);
  }

  return NextResponse.json({ ok: true });
}

interface ChatwootEvent {
  event: string;
  message_type?: string;
  content?: string;
  conversation?: {
    id: number;
    meta?: { team?: { id: number } };
  };
  sender?: {
    phone_number?: string;
  };
}

async function processEvent(payload: ChatwootEvent) {
  if (payload.event !== 'message_created') return;
  if (payload.message_type !== 'incoming') return;

  const conversationId = payload.conversation?.id;
  const messageText    = payload.content?.trim();
  const contactPhone   = payload.sender?.phone_number ?? '';
  const teamId         = payload.conversation?.meta?.team?.id ?? 0;

  if (!conversationId || !messageText) return;

  const department = departmentFromTeamId(teamId);

  log.info(`Webhook: conv=${conversationId} phone=${contactPhone} dept=${department}`);

  // Fire-and-forget — don't block the webhook response
  handleIncomingMessage({ conversationId, contactPhone, messageText, department, teamId })
    .catch((err: Error) => log.error(`Bot error: ${err.message}`));
}
