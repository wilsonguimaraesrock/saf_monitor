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
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api_access_token': API_TOKEN! },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
}

async function sendMessage(conversationId: number, content: string) {
  return chatwootPost(`/conversations/${conversationId}/messages`, {
    content,
    message_type: 'outgoing',
    private: false,
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
  topK = 3
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
  return /\b(nao|nope|consultor|humano|atendente|pessoa|falar|quero|sim.*consultor)\b/.test(t);
}

function wantsResolved(text: string): boolean {
  const t = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return /\b(sim|ok|obrigad|resolvid|ajudou|certo|perfeito|entendi)\b/.test(t);
}

// ── Main handler ──────────────────────────────────────────────

export interface IncomingMessage {
  conversationId: number;
  contactPhone: string;     // ex: "+5511999999999"
  messageText: string;
  department: string;       // sector slug from Chatwoot team
  teamId: number;
}

export async function handleIncomingMessage(msg: IncomingMessage): Promise<void> {
  const { conversationId, contactPhone, messageText, department, teamId } = msg;

  // 1. Check test phone list
  const testPhones = await getTestPhones();
  if (testPhones.length > 0 && !testPhones.includes(contactPhone)) {
    log.info(`Bot: número ${contactPhone} não está na lista de teste — ignorando`);
    return;
  }

  // 2. Check if bot is enabled for this department
  const enabledDepts = await getEnabledDepartments();
  if (!enabledDepts.includes(department) && !enabledDepts.includes('global')) {
    log.info(`Bot: departamento ${department} não habilitado — ignorando`);
    return;
  }

  // 3. Check conversation state
  const state = await getConvState(conversationId);

  if (state === 'awaiting_escalation') {
    if (wantsEscalation(messageText)) {
      await sendMessage(conversationId,
        '👋 Vou te transferir para um consultor agora. Aguarde um momento!'
      );
      await assignToTeam(conversationId, teamId);
      await setConvState(conversationId, 'escalated');
    } else if (wantsResolved(messageText)) {
      await sendMessage(conversationId,
        '✅ Ótimo! Fico feliz em ter ajudado. Se precisar de algo mais, é só chamar!'
      );
      await setConvState(conversationId, 'resolved');
    } else {
      // Ambíguo — repetir a pergunta
      await sendMessage(conversationId,
        'Desculpe, não entendi. Sua dúvida foi solucionada? Responda:\n• *SIM* — para encerrar\n• *NÃO* — para falar com um consultor'
      );
    }
    return;
  }

  // 4. RAG: generate embedding + search knowledge base
  const systemPrompt = (await getSetting('system_prompt')) ??
    'Você é um assistente de atendimento da Rockfeller. Responda de forma clara, objetiva e amigável em português. Use apenas as informações da base de conhecimento fornecida. Se não souber a resposta, diga que vai transferir para um consultor.';

  let chunks: string[] = [];
  try {
    const embedding = await generateEmbedding(messageText);
    chunks = await searchKnowledge(embedding, department);
  } catch (err) {
    log.error(`Erro no RAG: ${(err as Error).message}`);
  }

  // 5. Generate response
  let answer = '';
  try {
    answer = await chatCompletion(systemPrompt, messageText, chunks);
  } catch (err) {
    log.error(`Erro no GPT-4o: ${(err as Error).message}`);
    answer = 'Desculpe, tive um problema ao processar sua mensagem. Vou te transferir para um consultor.';
    await sendMessage(conversationId, answer);
    await assignToTeam(conversationId, teamId);
    await setConvState(conversationId, 'escalated');
    return;
  }

  // 6. Send answer + escalation prompt
  const fullMessage = `${answer}\n\n---\n💬 Sua dúvida foi solucionada?\n• Responda *SIM* para encerrar\n• Responda *NÃO* para falar com um consultor`;
  await sendMessage(conversationId, fullMessage);
  await setConvState(conversationId, 'awaiting_escalation');
}
