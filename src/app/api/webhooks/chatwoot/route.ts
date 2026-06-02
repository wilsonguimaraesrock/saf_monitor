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

/** Normaliza número para formato E.164 com + */
function normalizePhone(raw: string | undefined | null): string {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  return digits ? `+${digits}` : '';
}

/** Map Chatwoot teamId → sector slug */
function departmentFromTeamId(teamId: number): string {
  const sector = SECTORS.find((s) => s.chatwoot?.teamId === teamId);
  return sector?.slug ?? 'global';
}

// Chatwoot v2/v3 payload shapes differ — handle both
interface ChatwootEvent {
  event?: string;
  message_type?: string;
  content?: string;
  // v2 flat structure
  conversation?: {
    id?: number;
    inbox_id?: number;
    meta?: {
      team?: { id?: number; name?: string };
      sender?: { phone_number?: string };
    };
  };
  // some versions put sender at top level
  sender?: { phone_number?: string; name?: string };
  contact?: { phone_number?: string };
  // v3 puts conversation id at top level too
  id?: number;
  inbox_id?: number;
  meta?: { team?: { id?: number } };
}

export async function POST(req: NextRequest) {
  let payload: ChatwootEvent;
  try {
    const secret = process.env.CHATWOOT_WEBHOOK_SECRET?.trim();
    if (secret) {
      const body    = await req.text();
      const sig     = req.headers.get('x-chatwoot-signature') ?? '';
      const { createHmac } = await import('crypto');
      const expected = createHmac('sha256', secret).update(body).digest('hex');
      if (sig !== expected) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      payload = JSON.parse(body) as ChatwootEvent;
    } else {
      payload = await req.json() as ChatwootEvent;
    }
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  // Fire-and-forget
  processEvent(payload).catch((err: Error) => log.error(`processEvent error: ${err.message}`));

  return NextResponse.json({ ok: true });
}

async function processEvent(payload: ChatwootEvent) {
  if (payload.event !== 'message_created') return;
  if (payload.message_type !== 'incoming') return;

  const conversationId = payload.conversation?.id ?? payload.id;
  const messageText    = payload.content?.trim();

  // Phone can be in several places depending on Chatwoot version
  const rawPhone =
    payload.sender?.phone_number ??
    payload.contact?.phone_number ??
    payload.conversation?.meta?.sender?.phone_number ??
    '';

  const contactPhone = normalizePhone(rawPhone);

  // Team id can also be in different places
  const teamId =
    payload.conversation?.meta?.team?.id ??
    payload.meta?.team?.id ??
    0;

  if (!conversationId || !messageText) {
    log.info(`Skipping: no conversationId=${conversationId} or messageText="${messageText}"`);
    return;
  }

  const department = departmentFromTeamId(teamId);

  log.info(
    `Webhook msg: conv=${conversationId} phone="${contactPhone}" team=${teamId} dept=${department} text="${messageText.slice(0, 60)}"`
  );

  await handleIncomingMessage({ conversationId, contactPhone, messageText, department, teamId });
}
