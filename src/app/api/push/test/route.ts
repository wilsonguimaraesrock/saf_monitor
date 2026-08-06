import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import { isPushConfigured, sendPushToAll, sendPushToEmail } from '@/lib/push';

export const dynamic = 'force-dynamic';

/**
 * POST /api/push/test — dispara uma notificação de teste.
 * Sem sessão identificável, envia para todos os inscritos.
 */
export async function POST(req: NextRequest) {
  if (!isPushConfigured()) {
    return NextResponse.json(
      { error: 'VAPID não configurado (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)' },
      { status: 503 }
    );
  }

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const user  = token ? await verifyToken(token) : null;

  const payload = {
    title: 'Nova mensagem — Teste',
    body: 'Rockfeller: se você está vendo isso, as notificações estão funcionando.',
    tag: 'saf-test',
    url: '/',
    sectorName: 'Teste',
    contactName: 'Rockfeller',
    message: 'Se você está vendo isso, as notificações estão funcionando.',
  };

  const result = user?.email
    ? await sendPushToEmail(user.email, payload)
    : await sendPushToAll(payload);

  return NextResponse.json({ ok: true, ...result });
}
