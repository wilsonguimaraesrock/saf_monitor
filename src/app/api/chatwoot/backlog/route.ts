import { NextRequest, NextResponse } from 'next/server';
import { fetchCsatResponses, getCsatMetrics } from '@/integrations/chatwoot';

export const dynamic = 'force-dynamic';

const BASE_URL   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN      = process.env.CHATWOOT_API_TOKEN;

export interface BacklogConversation {
  id: number;
  contactName: string;
  contactPhone: string;
  assigneeName: string | null;
  labels: string[];
  status: string;
  createdAt: number;   // Unix timestamp
  csatRating: number | null;
  csatFeedback: string | null;
  chatwootUrl: string;
  unidade: string;
  departamento: string;
  subdepartamento: string;
  assunto: string;
}

type BotData = Pick<BacklogConversation, 'unidade' | 'departamento' | 'subdepartamento' | 'assunto'>;

type RawMessage = {
  id: number;
  content: string | null;
  created_at: number;
  message_type: number; // 0=incoming, 1=outgoing, 2=activity
};

function parseBotMessage(content: string): BotData {
  const field = (name: string) => {
    const m = content.match(new RegExp(`\\*${name}:\\*\\s*(.+?)(?:\\n|$)`, 'i'));
    return m?.[1]?.trim() ?? '';
  };
  return {
    unidade:         field('Unidade'),
    departamento:    field('Departamento'),
    subdepartamento: field('Subdepartamento'),
    assunto:         field('Assunto'),
  };
}

async function fetchBotData(convId: number): Promise<BotData> {
  const empty: BotData = { unidade: '', departamento: '', subdepartamento: '', assunto: '' };
  try {
    const data = await cwFetch<{ payload: RawMessage[] }>(`/conversations/${convId}/messages`);
    const first = (data?.payload ?? [])
      .filter((m) => m.content?.trim() && m.message_type !== 2)
      .sort((a, b) => a.created_at - b.created_at)[0];
    return first ? parseBotMessage(first.content!) : empty;
  } catch {
    return empty;
  }
}

async function runConcurrently<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function cwFetch<T>(path: string): Promise<T> {
  if (!BASE_URL || !TOKEN) throw new Error('Chatwoot não configurado');
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`, {
    headers: { api_access_token: TOKEN! },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Chatwoot ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

type RawConv = {
  id: number;
  status: string;
  created_at: number;
  meta: {
    sender: { name: string; phone_number: string };
    assignee: { name: string } | null;
  };
  labels: string[];
};

async function fetchConversationsForStatus(
  inboxId: number,
  teamId: number,
  status: string,
  since: number,
  maxPages = 6
): Promise<RawConv[]> {
  const all: RawConv[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await cwFetch<{ data: { payload: RawConv[] } }>(
      `/conversations?status=${status}&inbox_id=${inboxId}&team_id=${teamId}&page=${page}`
    );
    const payload = data?.data?.payload ?? [];
    if (payload.length === 0) break;

    // Filter to current month and stop paginating if all are older
    const inRange = payload.filter((c) => c.created_at >= since);
    all.push(...inRange);

    // If the oldest item on this page is before `since`, no need to fetch more
    const oldest = payload[payload.length - 1]?.created_at ?? 0;
    if (oldest < since) break;
  }

  return all;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const inboxId  = Number(searchParams.get('inboxId'));
  const teamId   = Number(searchParams.get('teamId')) || 0;
  const monthParam = searchParams.get('month'); // "YYYY-MM"

  if (!inboxId || !teamId) {
    return NextResponse.json({ error: 'inboxId e teamId obrigatórios' }, { status: 400 });
  }

  // Compute month boundaries
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (monthParam) {
    const [y, m] = monthParam.split('-').map(Number);
    if (y && m) { year = y; month = m - 1; }
  }

  const since = Math.floor(new Date(year, month, 1).getTime() / 1000);
  const until = Math.floor(new Date(year, month + 1, 1).getTime() / 1000);

  try {
    // Fetch conversations for all relevant statuses in parallel
    const [resolved, open, pending, snoozed] = await Promise.all([
      fetchConversationsForStatus(inboxId, teamId, 'resolved', since),
      fetchConversationsForStatus(inboxId, teamId, 'open', since, 3),
      fetchConversationsForStatus(inboxId, teamId, 'pending', since, 2),
      fetchConversationsForStatus(inboxId, teamId, 'snoozed', since, 2),
    ]);

    const allConversations = [...resolved, ...open, ...pending, ...snoozed];

    // Deduplicate by id
    const convMap = new Map<number, RawConv>();
    for (const c of allConversations) convMap.set(c.id, c);

    // CSAT do mês. `since` + `until` juntos são obrigatórios: só com `since` o
    // Chatwoot ignora o filtro e devolve o histórico inteiro da mais antiga
    // para a mais nova — as avaliações do mês ficavam nas últimas páginas.
    const csatMap = new Map<number, { rating: number; feedback: string | null }>();
    for (const r of await fetchCsatResponses({ inboxId, teamId, since, until })) {
      csatMap.set(r.conversationId, { rating: r.rating, feedback: r.feedback });
    }

    // Build sorted conversation list
    const convArray = Array.from(convMap.values())
      .filter((c) => c.created_at >= since && c.created_at < until)
      .sort((a, b) => b.created_at - a.created_at);

    // Fetch first message for each conversation to extract bot-parsed fields
    const botDataList = await runConcurrently(
      convArray.map((c) => () => fetchBotData(c.id)),
      10
    );

    const conversations: BacklogConversation[] = convArray.map((c, i) => {
      const csat = csatMap.get(c.id);
      const bot  = botDataList[i];
      return {
        id:              c.id,
        contactName:     c.meta?.sender?.name ?? '—',
        contactPhone:    c.meta?.sender?.phone_number ?? '',
        assigneeName:    c.meta?.assignee?.name ?? null,
        labels:          c.labels ?? [],
        status:          c.status,
        createdAt:       c.created_at,
        csatRating:      csat?.rating ?? null,
        csatFeedback:    csat?.feedback ?? null,
        chatwootUrl:     `${BASE_URL}/app/accounts/${ACCOUNT_ID}/conversations/${c.id}`,
        unidade:         bot.unidade,
        departamento:    bot.departamento,
        subdepartamento: bot.subdepartamento,
        assunto:         bot.assunto,
      };
    });

    // CSAT do mês pela data da avaliação — inclui conversas abertas em meses
    // anteriores e avaliadas neste, que não aparecem na listagem acima.
    const csatMonth = await getCsatMetrics({ inboxId, teamId, since, until });

    return NextResponse.json({
      conversations,
      csatMonth,
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
