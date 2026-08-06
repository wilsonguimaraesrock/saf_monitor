import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import { deletePushSubscription, savePushSubscription } from '@/repository/pushSubscriptions';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:push');

interface SubscriptionBody {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
}

async function getEmail(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  return user?.email ?? null;
}

/** POST /api/push/subscription — registra este navegador para receber push */
export async function POST(req: NextRequest) {
  let body: SubscriptionBody;
  try {
    body = (await req.json()) as SubscriptionBody;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Inscrição incompleta' }, { status: 400 });
  }

  try {
    await savePushSubscription({
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userEmail: await getEmail(req),
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error(`Erro ao salvar inscrição: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Falha ao salvar inscrição' }, { status: 500 });
  }
}

/** DELETE /api/push/subscription — remove este navegador */
export async function DELETE(req: NextRequest) {
  let endpoint: string | undefined;
  try {
    ({ endpoint } = (await req.json()) as { endpoint?: string });
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!endpoint) return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 400 });

  try {
    await deletePushSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (err) {
    log.error(`Erro ao remover inscrição: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Falha ao remover inscrição' }, { status: 500 });
  }
}
