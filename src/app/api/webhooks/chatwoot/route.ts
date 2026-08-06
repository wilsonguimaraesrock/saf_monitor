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
import { sendPushToAll } from '@/lib/push';

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

/** Nome amigável do departamento para exibir na notificação */
function sectorNameFromTeamId(teamId: number, fallback?: string): { slug: string | null; name: string } {
  const sector = SECTORS.find((s) => s.chatwoot?.teamId === teamId);
  if (sector) return { slug: sector.slug, name: sector.name };
  return { slug: null, name: fallback?.trim() || 'Sem departamento' };
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
    custom_attributes?: Record<string, string>;
    meta?: {
      team?: { id?: number; name?: string };
      sender?: { phone_number?: string; name?: string };
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

  // Await processing — Vercel kills fire-and-forget before async work finishes
  try {
    await processEvent(payload);
  } catch (err) {
    log.error(`processEvent error: ${(err as Error).message}`);
  }

  return NextResponse.json({ ok: true });
}

async function processEvent(payload: ChatwootEvent) {
  if (payload.event !== 'message_created') return;
  if (payload.message_type !== 'incoming') return;

  const conversationId = payload.conversation?.id ?? payload.id;
  const messageText    = payload.content?.trim();

  // For incoming messages: sender = contact (has phone_number)
  // For outgoing messages: sender = agent (no phone_number, but we already filtered those out)
  // Fallback: conversation.meta.sender has the contact's phone
  const rawPhone =
    (payload.sender as { phone_number?: string; type?: string })?.phone_number ??
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

  const department  = departmentFromTeamId(teamId);
  const contactName = payload.conversation?.meta?.sender?.name ?? undefined;
  const subjectName = (payload.conversation?.custom_attributes as Record<string, string> | undefined)?.subjectName ?? undefined;

  log.info(
    `Webhook msg: conv=${conversationId} phone="${contactPhone}" team=${teamId} dept=${department} subject="${subjectName}" text="${messageText.slice(0, 60)}"`
  );

  // Notificação Web Push — chega mesmo com o painel fechado. Independente do
  // bot: uma falha aqui não pode impedir a resposta ao franqueado.
  try {
    const { slug, name } = sectorNameFromTeamId(teamId, payload.conversation?.meta?.team?.name);
    const preview = messageText.replace(/\s+/g, ' ').slice(0, 160);
    const result = await sendPushToAll({
      title: `Nova mensagem — ${name}`,
      body: `${contactName ?? 'Franqueado'}: ${preview}`,
      tag: `saf-conv-${conversationId}`,
      url: slug ? `/setor/${slug}` : '/',
      sectorSlug: slug,
      sectorName: name,
      contactName: contactName ?? 'Franqueado',
      message: preview,
    });
    if (result.sent || result.removed || result.failed) {
      log.info(`Push: enviados=${result.sent} removidos=${result.removed} falhas=${result.failed}`);
    }
  } catch (err) {
    log.error(`Falha ao enviar push: ${(err as Error).message}`);
  }

  await handleIncomingMessage({ conversationId, contactPhone, messageText, department, teamId, contactName, subjectName });
}
