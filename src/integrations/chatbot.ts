/**
 * Cliente da API /admin do ChatBot Whats Franquias.
 *
 * É o app que faz o menu do WhatsApp e, principalmente, a entrega das
 * mensagens. A inbox 11 do Chatwoot é `Channel::Api`: o Chatwoot só guarda a
 * conversa, quem fala com o WhatsApp é esse app.
 *
 * Por que a conversa ativa passa por aqui em vez de criar tudo no Chatwoot:
 * testamos criar contato + conversa + mensagem direto pela API do Chatwoot e a
 * mensagem NÃO chega no celular, sem erro nenhum — o Chatwoot marca `sent` e a
 * entrega morre em silêncio. A entrega depende de estado interno do app, e
 * a primeira mensagem precisa ser um template aprovado pela Meta (política do
 * WhatsApp para conversa iniciada pela empresa).
 *
 * A API tem prefixo global /api: os caminhos são /api/admin/... (a primeira
 * versão da documentação omitia o prefixo e devolvia 404).
 *
 * Credenciais: Basic Auth de serviço, só no servidor. Nenhuma rota expõe isso
 * ao navegador — o painel fala com /api/chatbot/*, que faz o proxy.
 */

import { upstreamFetch, describeOutcome } from '../lib/upstreamFetch';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('chatbot');

const BASE_URL = process.env.CHATBOT_API_URL?.replace(/\/$/, '');
const USER     = process.env.CHATBOT_API_USER;
const PASSWORD = process.env.CHATBOT_API_PASSWORD;

export function isChatbotConfigured(): boolean {
  return Boolean(BASE_URL && USER && PASSWORD);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;
}

// ── Tipos do cadastro do chatbot ──────────────────────────────
// Os ids são UUIDs do cadastro dele, não do nosso banco.

export interface ChatbotWhatsappNumber {
  id: string;
  phoneNumber: string;
  active: boolean;
  department?: string | null;
  contactName?: string | null;
}

export interface ChatbotUnit {
  id: string;
  name: string;
  state?: string | null;
  active?: boolean;
  whatsappNumbers: ChatbotWhatsappNumber[];
}

export interface ChatbotNamed {
  id: string;
  name: string;
  active?: boolean;
}

export interface ActiveHandoffRequest {
  unitId: string;
  whatsappNumberId: string;
  departmentId: string;
  subdepartmentId: string;
  subjectId: string;
  agent: { id: string; name: string; email?: string };
}

export interface ActiveHandoffSuccess {
  handoffId: string;
  chatwootConversationId: number;
}

/** Resultado do POST já traduzido para o que a tela precisa decidir. */
export type ActiveHandoffResult =
  | { ok: true; data: ActiveHandoffSuccess }
  /** 409 — a escola já está em atendimento; `conversationId` leva o atendente até ela. */
  | { ok: false; kind: 'em_andamento'; message: string; conversationId: number | null }
  /** 400/404 — dados inconsistentes ou inativos. Não adianta repetir igual. */
  | { ok: false; kind: 'dados_invalidos'; message: string; status: number }
  /** 502 e falhas de rede — transitório, o atendente pode tentar de novo. */
  | { ok: false; kind: 'transitorio'; message: string };

class ChatbotNotConfiguredError extends Error {
  constructor() {
    super(
      'API do chatbot não configurada. Defina CHATBOT_API_URL, CHATBOT_API_USER e '
      + 'CHATBOT_API_PASSWORD no ambiente.'
    );
  }
}

async function get<T>(path: string): Promise<T> {
  if (!isChatbotConfigured()) throw new ChatbotNotConfiguredError();

  const outcome = await upstreamFetch(`${BASE_URL}${path}`, {
    headers: { Authorization: authHeader(), accept: 'application/json' },
    cache: 'no-store',
    timeoutMs: 15_000,
    attempts: 3,
    idempotent: true,
  });

  if (outcome.kind !== 'response') {
    throw new Error(describeOutcome(outcome));
  }
  if (!outcome.response.ok) {
    // 401 é o caso comum e tem causa específica: credencial de serviço errada
    // ou não provisionada no ambiente. Mensagem genérica aqui manda o atendente
    // chamar o suporte sem saber o que dizer.
    if (outcome.response.status === 401 || outcome.response.status === 403) {
      throw new Error(
        'O chatbot recusou a credencial do SAF Monitor. Confira CHATBOT_API_USER e '
        + 'CHATBOT_API_PASSWORD com o responsável pelo chatbot.'
      );
    }
    throw new Error(`Chatbot ${path} → HTTP ${outcome.response.status}`);
  }
  return outcome.response.json() as Promise<T>;
}

/**
 * Aceita tanto `[...]` quanto `{ data: [...] }` / `{ payload: [...] }`.
 * A documentação não fixa o envelope e um formato diferente derrubaria a tela
 * inteira do atendente por um detalhe de serialização.
 */
function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === 'object') {
    for (const key of ['data', 'payload', 'items', 'results'] as const) {
      const value = (raw as Record<string, unknown>)[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

/**
 * Registro inativo é recusado pelo POST, mas continua vindo nos endpoints de
 * leitura — inclusive nos filtrados. O cadastro tem hoje 1 departamento, 3
 * subdepartamentos e 36 assuntos inativos, e a mensagem de erro do POST não
 * diz "inativo" (fala que o item "não pertence" ao pai), então oferecer um
 * inativo no seletor viraria um 400 incompreensível para o atendente.
 * `active` ausente conta como ativo — só excluímos o que vier explicitamente
 * marcado como false.
 */
function somenteAtivos<T extends { active?: boolean }>(list: T[]): T[] {
  return list.filter((x) => x.active !== false);
}

export async function getUnits(): Promise<ChatbotUnit[]> {
  const list = asList<ChatbotUnit>(await get<unknown>('/api/admin/units'));
  return somenteAtivos(list).map((u) => ({
    ...u,
    whatsappNumbers: somenteAtivos(asList<ChatbotWhatsappNumber>(u.whatsappNumbers)),
  }));
}

export async function getDepartments(): Promise<ChatbotNamed[]> {
  return somenteAtivos(asList<ChatbotNamed>(await get<unknown>('/api/admin/departments')));
}

export async function getSubdepartments(departmentId: string): Promise<ChatbotNamed[]> {
  return somenteAtivos(asList<ChatbotNamed>(
    await get<unknown>(`/api/admin/subdepartments?departmentId=${encodeURIComponent(departmentId)}`)
  ));
}

export async function getSubjects(subdepartmentId: string): Promise<ChatbotNamed[]> {
  return somenteAtivos(asList<ChatbotNamed>(
    await get<unknown>(`/api/admin/subjects?subdepartmentId=${encodeURIComponent(subdepartmentId)}`)
  ));
}

/**
 * Inicia o atendimento ativo. O chatbot cria a conversa e envia o template.
 *
 * `idempotent: false` de propósito: se a conexão cair depois de enviada, a
 * escola pode já ter recebido o template. Repetir por conta própria mandaria
 * uma segunda mensagem para o franqueado. O 409 do chatbot é a rede de
 * segurança para o clique repetido.
 */
export async function createActiveHandoff(
  body: ActiveHandoffRequest
): Promise<ActiveHandoffResult> {
  if (!isChatbotConfigured()) {
    return {
      ok: false,
      kind: 'transitorio',
      message: new ChatbotNotConfiguredError().message,
    };
  }

  const outcome = await upstreamFetch(`${BASE_URL}/api/admin/active-handoffs`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
    attempts: 3,
  });

  if (outcome.kind !== 'response') {
    log.error(`active-handoff falhou sem resposta: ${outcome.kind}`);
    return {
      ok: false,
      kind: 'transitorio',
      message: outcome.kind === 'unreachable'
        ? 'O chatbot não aceitou a conexão. Nada foi enviado para a escola — tente novamente.'
        : 'A conexão com o chatbot caiu durante o envio. Confira se o atendimento foi criado antes de repetir.',
    };
  }

  const res = outcome.response;
  const payload = await res.json().catch(() => null) as
    | { message?: string; handoffId?: string; chatwootConversationId?: number }
    | null;

  if (res.status === 201 || res.ok) {
    const id = Number(payload?.chatwootConversationId);
    if (!payload?.handoffId || !Number.isFinite(id)) {
      // Criou, mas não sabemos onde. Melhor avisar do que abrir a conversa errada.
      return {
        ok: false,
        kind: 'transitorio',
        message: 'O chatbot respondeu sucesso sem informar a conversa. Confira o painel antes de repetir.',
      };
    }
    return { ok: true, data: { handoffId: payload.handoffId, chatwootConversationId: id } };
  }

  if (res.status === 409) {
    const id = Number(payload?.chatwootConversationId);
    return {
      ok: false,
      kind: 'em_andamento',
      message: payload?.message?.trim()
        || 'Esta escola já está em atendimento neste número.',
      conversationId: Number.isFinite(id) ? id : null,
    };
  }

  if (res.status === 400 || res.status === 404) {
    return {
      ok: false,
      kind: 'dados_invalidos',
      status: res.status,
      message: payload?.message?.trim()
        || (res.status === 400
          ? 'Os dados escolhidos não combinam entre si. Refaça a seleção.'
          : 'Unidade, número ou departamento não existe mais no cadastro do chatbot.'),
    };
  }

  // 502 = criou o atendimento e não conseguiu enviar o template. O chatbot
  // desfaz o registro, mas cada tentativa manda mensagem para o WhatsApp da
  // escola — insistir enche o franqueado de mensagem estranha. Por isso não
  // convidamos a repetir: quem repete precisa saber que custa mensagem.
  log.error(`active-handoff HTTP ${res.status}`);
  return {
    ok: false,
    kind: 'transitorio',
    message: payload?.message?.trim()
      || 'Não foi possível notificar a escola: o envio da mensagem falhou no WhatsApp. '
         + 'O atendimento não foi criado. Avise o suporte antes de tentar de novo — '
         + 'cada tentativa envia mensagem para o franqueado.',
  };
}
