/**
 * Bot RAG — orquestração completa:
 * 1. Verifica número de teste e se o bot está ativo para o departamento
 * 2. Busca artigos relevantes por similaridade de embedding
 * 3. Gera resposta com GPT-4o + pergunta de escalada
 * 4. Gerencia estado da conversa (ativa / aguardando_escalada)
 * 5. Escalada para agente humano no Chatwoot
 */

import { query, queryOne, execute } from './db';
import { generateEmbedding, chatCompletion } from '../integrations/openai';
import { createChildLogger } from './logger';

const log = createChildLogger('bot');

const BASE_URL   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const API_TOKEN  = process.env.CHATWOOT_API_TOKEN;

// ── Chatwoot helpers ──────────────────────────────────────────

async function chatwootPost(path: string, body: unknown) {
  const url = `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`;
  log.info(`Chatwoot POST ${url}`);
  if (!BASE_URL) { log.error('CHATWOOT_BASE_URL não configurada'); return null; }
  if (!API_TOKEN) { log.error('CHATWOOT_API_TOKEN não configurada'); return null; }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api_access_token': API_TOKEN },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log.error(`Chatwoot ${res.status} ${url}: ${text.slice(0, 200)}`);
    return null;
  }
  return res.json();
}

async function sendMessage(conversationId: number, content: string) {
  return chatwootPost(`/conversations/${conversationId}/messages`, {
    content,
    message_type: 'outgoing',
    private: false,
  });
}

async function setTyping(conversationId: number, on: boolean) {
  return chatwootPost(`/conversations/${conversationId}/typing_status`, {
    typing_status: on ? 'on' : 'off',
  });
}

async function assignToTeam(conversationId: number, teamId: number) {
  return fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${conversationId}/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api_access_token': API_TOKEN! },
    body: JSON.stringify({ team_id: teamId }),
  });
}

// ── Settings helpers ──────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  const row = await queryOne<{ value: string }>('SELECT value FROM bot_settings WHERE key = $1', [key]);
  return row?.value ?? null;
}

async function getTestPhones(): Promise<string[]> {
  const raw = await getSetting('test_phone_numbers');
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

async function getEnabledDepartments(): Promise<string[]> {
  const raw = await getSetting('enabled_departments');
  try { return raw ? JSON.parse(raw) : []; } catch { return []; }
}

// ── RAG search ────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

async function searchKnowledge(
  questionEmbedding: number[],
  department: string,
  topK = 3,
): Promise<string[]> {
  const rows = await query<{ title: string; content: string; embedding: number[] }>(
    `SELECT title, content, embedding
     FROM knowledge_base
     WHERE is_active = true
       AND (department = $1 OR department = 'global')
       AND embedding IS NOT NULL`,
    [department]
  );

  const scored = rows
    .map((r) => ({ ...r, score: cosineSimilarity(questionEmbedding, r.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  log.info(`RAG top-${topK} for dept="${department}": ${scored.map((r) => `"${r.title}" (${r.score.toFixed(3)})`).join(', ')}`);

  return scored.map((r) => `**${r.title}**\n${r.content}`);
}

// ── Conversation state ────────────────────────────────────────

async function getConvState(conversationId: number): Promise<string | null> {
  const row = await queryOne<{ state: string }>(
    'SELECT state FROM bot_conversations WHERE chatwoot_conversation_id = $1',
    [conversationId]
  );
  return row?.state ?? null;
}

async function setConvState(conversationId: number, state: string) {
  await execute(
    `INSERT INTO bot_conversations (chatwoot_conversation_id, state, last_bot_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (chatwoot_conversation_id) DO UPDATE SET state = $2, last_bot_at = NOW()`,
    [conversationId, state]
  );
}

// ── Escalation response detection ────────────────────────────

function wantsEscalation(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  // Direct keywords: HUMANO, ATENDENTE, CONSULTOR + negations and requests
  return /\b(humano|atendente|consultor|nao|nope|pessoa|quero falar|falar com|preciso de ajuda humana)\b/.test(t);
}

function wantsResolved(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\b(sim|ok|obrigad|resolvid|ajudou|certo|perfeito|entendi|valeu|tudo certo)\b/.test(t);
}

function buildWelcomeHeader(contactName?: string, subjectName?: string): string {
  const greeting = contactName ? `Olá, *${contactName}*! 👋` : `Olá! 👋`;
  const subject  = subjectName ? ` sobre *${subjectName}*` : '';
  return `${greeting} Sou a *Roxy*, assistente de IA pedagógica da Rockfeller. 🤖\n\nRecebi sua dúvida${subject} e já estou buscando a melhor resposta para você!\n\n_Se preferir falar com um atendente humano a qualquer momento, basta digitar_ *ATENDENTE*_._ 😊`;
}

// ── Main handler ──────────────────────────────────────────────

export interface IncomingMessage {
  conversationId: number;
  contactPhone: string;
  messageText: string;
  department: string;
  teamId: number;
  contactName?: string;   // from conversation.meta.sender.name
  subjectName?: string;   // from conversation.custom_attributes.subjectName
}

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const { conversationId, contactPhone, messageText, department, teamId, contactName, subjectName } = msg;

  // 1. Check test phone list — normalize both sides, handling BR 9-digit mobile format
  const testPhones = await getTestPhones();
  if (testPhones.length > 0) {
    // Normalize to digits only; for BR numbers (+55 + 2-digit area + 8 or 9 digits),
    // strip the leading 9 after the area code so both formats compare equal.
    const normalizeBR = (p: string) => {
      const d = p.replace(/\D/g, '');
      // Brazil: 55 + 2-digit DDD + 9-digit number → strip leading 9 of the local part
      if (d.startsWith('55') && (d.length === 13)) {
        return '55' + d.slice(2, 4) + d.slice(5); // remove the 9 after DDD
      }
      return d;
    };
    const normalizedIncoming = normalizeBR(contactPhone);
    const matched = testPhones.some((t) => normalizeBR(t) === normalizedIncoming);
    if (!matched) {
      log.info(`Bot: número ${contactPhone} (norm: ${normalizedIncoming}) não está na lista de teste — ignorando`);
      return;
    }
  }

  // 2. Check if bot is enabled for this department
  const enabledDepts = await getEnabledDepartments();
  if (!enabledDepts.includes(department) && !enabledDepts.includes('global')) {
    log.info(`Bot: departamento ${department} não habilitado — ignorando`);
    return;
  }

  // 3. Check conversation state
  const state = await getConvState(conversationId);

  // 3a. Handle escalation requests at any point (even outside awaiting_escalation)
  if (wantsEscalation(messageText) && state !== 'escalated') {
    await sendMessage(conversationId,
      '👋 Claro! Vou te transferir para um atendente humano agora. Aguarde um momento! 🙋'
    );
    await assignToTeam(conversationId, teamId);
    await setConvState(conversationId, 'escalated');
    return;
  }

  if (state === 'awaiting_escalation') {
    if (wantsResolved(messageText)) {
      await sendMessage(conversationId,
        '✅ Ótimo! Fico feliz em ter ajudado. Se precisar de algo mais, é só chamar! 😊'
      );
      await setConvState(conversationId, 'resolved');
    } else {
      // Não entendeu — responde como nova pergunta (continua o fluxo RAG abaixo)
    }
    if (wantsResolved(messageText)) return;
  }

  const isFirstInteraction = !state;

  log.info(`Bot: passou todas as checagens — iniciando RAG para conv=${conversationId}`);

  // Mostrar "digitando..." enquanto a Roxy processa
  await setTyping(conversationId, true);

  // 4. RAG: generate embedding + search knowledge base
  const systemPrompt = (await getSetting('system_prompt')) ??
    'Você é a Roxy, assistente de IA pedagógica da Rockfeller. Responda de forma clara, objetiva e amigável em português. Use apenas as informações da base de conhecimento fornecida. Se não souber a resposta, diga que vai transferir para um atendente humano.';

  let chunks: string[] = [];
  try {
    const embedding = await generateEmbedding(messageText);
    chunks = await searchKnowledge(embedding, department, 3);
  } catch (err) {
    log.error(`Erro no RAG: ${(err as Error).message}`);
  }

  // 5. Generate response — include subject context so model doesn't mix topics
  const contextualMessage = subjectName
    ? `[Contexto: o usuário está perguntando sobre "${subjectName}"]\n\n${messageText}`
    : messageText;

  let answer = '';
  try {
    answer = await chatCompletion(systemPrompt, contextualMessage, chunks);
  } catch (err) {
    log.error(`Erro no GPT-4o: ${(err as Error).message}`);
    await setTyping(conversationId, false);
    answer = 'Desculpe, tive um problema ao processar sua mensagem. Vou te transferir para um atendente humano.';
    await sendMessage(conversationId, answer);
    await assignToTeam(conversationId, teamId);
    await setConvState(conversationId, 'escalated');
    return;
  }

  // 6. Send answer (with welcome header on first interaction) + escalation prompt
  await setTyping(conversationId, false);
  const welcomeHeader = isFirstInteraction
    ? buildWelcomeHeader(contactName, subjectName) + '\n\n'
    : '';
  const fullMessage = `${welcomeHeader}${answer}\n\n---\n💬 Consegui te ajudar?\n• Responda *SIM* se a dúvida foi resolvida\n• Responda *NÃO* ou *ATENDENTE* para falar com um atendente humano`;
  await sendMessage(conversationId, fullMessage);
  await setConvState(conversationId, 'awaiting_escalation');
}
