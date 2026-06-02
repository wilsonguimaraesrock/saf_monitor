/**
 * POST /api/webhooks/chatwoot-debug
 * Endpoint temporário para inspecionar o payload exato do Chatwoot.
 * Configure um webhook temporário no Chatwoot apontando para esta URL.
 * O payload fica nos logs da Vercel (Functions tab).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('webhook:chatwoot-debug');

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Log completo para inspecionar no Vercel Functions Logs
  log.info('=== CHATWOOT WEBHOOK PAYLOAD ===');
  log.info(JSON.stringify(body, null, 2));

  const event        = body?.event;
  const msgType      = body?.message_type;
  const content      = body?.content;
  const phone        = body?.sender?.phone_number ?? body?.contact?.phone_number;
  const teamId       = body?.conversation?.meta?.team?.id ?? body?.meta?.team?.id;
  const convId       = body?.conversation?.id ?? body?.id;
  const inboxId      = body?.conversation?.inbox_id ?? body?.inbox_id;

  log.info(`event=${event} msgType=${msgType} phone=${phone} teamId=${teamId} convId=${convId} inboxId=${inboxId}`);
  log.info(`content="${content?.slice(0, 100)}"`);

  return NextResponse.json({
    received: true,
    event, msgType, phone, teamId, convId, inboxId,
    contentPreview: content?.slice(0, 100),
  });
}
