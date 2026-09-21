/**
 * POST /api/chatbot/conversation/:id/reengage
 *
 * Proxy autenticado para o template de retomada do chatbot. O navegador envia
 * somente o id da conversa; telefone e credenciais ficam restritos ao servidor.
 */
import { NextRequest, NextResponse } from 'next/server';
import { COOKIE_NAME, verifyToken } from '@/lib/auth';
import { isChatbotConfigured, reengageConversation } from '@/integrations/chatbot';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const jwt = req.cookies.get(COOKIE_NAME)?.value;
  const user = jwt ? await verifyToken(jwt) : null;
  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  }

  const { id: rawId } = await params;
  if (!/^\d+$/.test(rawId)) {
    return NextResponse.json({ error: 'ID da conversa inválido.' }, { status: 400 });
  }
  const conversationId = Number(rawId);
  if (!Number.isSafeInteger(conversationId) || conversationId <= 0) {
    return NextResponse.json({ error: 'ID da conversa inválido.' }, { status: 400 });
  }

  if (!isChatbotConfigured()) {
    return NextResponse.json(
      { error: 'Integração com o chatbot não configurada no servidor.' },
      { status: 503 }
    );
  }

  const result = await reengageConversation(conversationId);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
