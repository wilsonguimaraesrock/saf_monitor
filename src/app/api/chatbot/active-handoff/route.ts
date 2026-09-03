/**
 * POST /api/chatbot/active-handoff
 *
 * Inicia um atendimento ativo: o chatbot cria a conversa no Chatwoot e envia o
 * template aprovado pela Meta para o WhatsApp da escola.
 *
 * O atendente vem da sessão (JWT), nunca do corpo da requisição — quem clicou
 * é auditoria, e deixar isso vir do cliente permitiria assinar mensagem com o
 * nome de outra pessoa.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { execute } from '@/lib/db';
import { createActiveHandoff, isChatbotConfigured } from '@/integrations/chatbot';
import {
  assignConversationToAgent,
  findChatwootAgentForUser,
  type ChatwootAgent,
} from '@/integrations/chatwoot';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('active-handoff');

interface Body {
  unitId?: string;
  unitName?: string;
  whatsappNumberId?: string;
  whatsappNumber?: string;
  departmentId?: string;
  departmentName?: string;
  subdepartmentId?: string;
  subdepartmentName?: string;
  subjectId?: string;
  subjectName?: string;
  sectorSlug?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  if (!isChatbotConfigured()) {
    return NextResponse.json(
      { error: 'Integração com o chatbot não configurada no servidor.', kind: 'nao_configurado' },
      { status: 503 }
    );
  }

  const jwt = req.cookies.get(COOKIE_NAME)?.value;
  const user = jwt ? await verifyToken(jwt) : null;
  if (!user) {
    return NextResponse.json({ error: 'Sessão expirada. Entre novamente.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = await req.json() as Body;
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 });
  }

  const ids = {
    unitId:           body.unitId?.trim() ?? '',
    whatsappNumberId: body.whatsappNumberId?.trim() ?? '',
    departmentId:     body.departmentId?.trim() ?? '',
    subdepartmentId:  body.subdepartmentId?.trim() ?? '',
    subjectId:        body.subjectId?.trim() ?? '',
  };

  const faltando = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
  if (faltando.length > 0) {
    return NextResponse.json(
      { error: `Seleção incompleta: ${faltando.join(', ')}` },
      { status: 400 }
    );
  }
  // Erra rápido aqui em vez de mandar lixo para o chatbot e receber 400 dele.
  const malformados = Object.entries(ids).filter(([, v]) => !UUID.test(v)).map(([k]) => k);
  if (malformados.length > 0) {
    return NextResponse.json(
      { error: `Identificadores fora do formato esperado: ${malformados.join(', ')}` },
      { status: 400 }
    );
  }

  let chatwootAgent: ChatwootAgent | null;
  try {
    chatwootAgent = await findChatwootAgentForUser(user.email, user.name);
  } catch (err) {
    log.error(`falha ao localizar agente Chatwoot para ${user.name}: ${(err as Error).message}`);
    return NextResponse.json(
      { error: 'Não foi possível identificar seu agente no Chatwoot. Tente novamente.' },
      { status: 502 }
    );
  }
  if (!chatwootAgent) {
    return NextResponse.json(
      {
        error: 'Seu usuário do SAF Monitor não está vinculado a um agente do Chatwoot. '
          + 'Peça ao administrador para conferir seu e-mail antes de iniciar o atendimento.',
      },
      { status: 422 }
    );
  }

  const result = await createActiveHandoff({
    ...ids,
    agent: { id: String(user.id), name: user.name, email: user.email },
  });

  if (!result.ok) {
    log.info(
      `handoff recusado (${result.kind}) por ${user.name} — unidade ${body.unitName ?? ids.unitId}`
    );
    const status = result.kind === 'em_andamento' ? 409
      : result.kind === 'dados_invalidos' ? result.status
      : 502;
    return NextResponse.json(
      {
        error: result.message,
        kind: result.kind,
        conversationId: result.kind === 'em_andamento' ? result.conversationId : null,
      },
      { status }
    );
  }

  const { handoffId, chatwootConversationId } = result.data;
  log.info(
    `handoff ${handoffId} → conversa ${chatwootConversationId} `
    + `(${body.unitName ?? ids.unitId} · ${body.subjectName ?? ids.subjectId}) por ${user.name}`
  );

  let assigned = false;
  try {
    await assignConversationToAgent(chatwootConversationId, chatwootAgent.id);
    assigned = true;
  } catch (err) {
    // O template já foi enviado: nunca transformar isto em erro de handoff,
    // pois o atendente poderia repetir e mandar uma segunda mensagem à escola.
    log.error(
      `handoff ${handoffId} criado, mas a atribuição ao agente ${chatwootAgent.id} falhou: `
      + (err as Error).message
    );
  }

  // Auditoria local. Uma falha ao gravar não pode virar erro na tela: a
  // mensagem já foi para a escola, e dizer "falhou" faria o atendente repetir.
  try {
    await execute(
      `INSERT INTO conversas_ativas (
         handoff_id, chatwoot_conversation_id, sector_slug,
         unit_id, unit_name, whatsapp_number_id, whatsapp_number,
         department_id, department_name, subdepartment_id, subdepartment_name,
         subject_id, subject_name, agent_id, agent_name, agent_email
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (handoff_id) DO NOTHING`,
      [
        handoffId, chatwootConversationId, body.sectorSlug ?? null,
        ids.unitId, body.unitName ?? null, ids.whatsappNumberId, body.whatsappNumber ?? null,
        ids.departmentId, body.departmentName ?? null, ids.subdepartmentId, body.subdepartmentName ?? null,
        ids.subjectId, body.subjectName ?? null, String(user.id), user.name, user.email ?? null,
      ]
    );
  } catch (err) {
    log.error(`falha ao registrar handoff ${handoffId}: ${(err as Error).message}`);
  }

  // O modal de conversa do painel espera um ChatwootConversation. Montamos aqui
  // porque só o servidor conhece CHATWOOT_BASE_URL — assim o atendente cai
  // direto na conversa criada, sem esperar o próximo poll de 30s.
  const chatwootBase = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '') ?? '';
  const accountId = process.env.CHATWOOT_ACCOUNT_ID ?? '1';

  return NextResponse.json(
    {
      handoffId,
      conversationId: chatwootConversationId,
      conversation: {
        id: chatwootConversationId,
        source: 'saf-monitor',
        contactName: body.unitName ?? 'Escola',
        contactPhone: body.whatsappNumber ?? '',
        unitName: body.unitName ?? '',
        labels: [] as string[],
        assigneeId: assigned ? chatwootAgent.id : null,
        assigneeName: assigned ? chatwootAgent.name : null,
        lastMessage: '',
        waitingSinceSec: 0,
        chatwootUrl: chatwootBase
          ? `${chatwootBase}/app/accounts/${accountId}/conversations/${chatwootConversationId}`
          : '',
      },
    },
    { status: 201 }
  );
}
