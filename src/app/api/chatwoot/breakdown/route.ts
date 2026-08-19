import { NextRequest, NextResponse } from 'next/server';
import { fetchCsatResponses } from '@/integrations/chatwoot';
import { memoize } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';

/** Agregado do mês inteiro: custa até ~165 chamadas ao Chatwoot (uma por
 *  conversa, para ler os campos do bot). Não precisa ser recalculado a cada
 *  montagem do card. */
const BREAKDOWN_TTL_MS = 5 * 60_000;

const BASE_URL   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN      = process.env.CHATWOOT_API_TOKEN;

async function cwFetch<T>(path: string): Promise<T> {
  if (!BASE_URL || !TOKEN) throw new Error('Chatwoot não configurado');
  const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`, {
    headers: { api_access_token: TOKEN! },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Chatwoot ${path} → ${res.status}`);
  return res.json() as Promise<T>;
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

type RawConv = {
  id: number;
  status: string;
  created_at: number;
  meta: { assignee: { name: string } | null };
};

type RawMessage = { content: string | null; created_at: number; message_type: number };

function parseBotFields(content: string): { subdepartamento: string; assunto: string } {
  const field = (name: string) => {
    const m = content.match(new RegExp(`\\*${name}:\\*\\s*(.+?)(?:\\n|$)`, 'i'));
    return m?.[1]?.trim() ?? '';
  };
  return { subdepartamento: field('Subdepartamento'), assunto: field('Assunto') };
}

async function fetchBotFields(convId: number): Promise<{ subdepartamento: string; assunto: string }> {
  const empty = { subdepartamento: '', assunto: '' };
  try {
    const data = await cwFetch<{ payload: RawMessage[] }>(`/conversations/${convId}/messages`);
    const first = (data?.payload ?? [])
      .filter((m) => m.content?.trim() && m.message_type !== 2)
      .sort((a, b) => a.created_at - b.created_at)[0];
    return first ? parseBotFields(first.content!) : empty;
  } catch {
    return empty;
  }
}

async function fetchConvsByTeam(teamId: number, status: string, since: number, maxPages = 6): Promise<RawConv[]> {
  const all: RawConv[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const data = await cwFetch<{ data: { payload: RawConv[] } }>(
      `/conversations?status=${status}&team_id=${teamId}&page=${page}`
    );
    const payload = data?.data?.payload ?? [];
    if (payload.length === 0) break;
    const inRange = payload.filter((c) => c.created_at >= since);
    all.push(...inRange);
    if ((payload[payload.length - 1]?.created_at ?? 0) < since) break;
  }
  return all;
}

export interface WhatsAppBreakdownData {
  period: string;
  total: number;
  bySubdepartamento: Array<{ name: string; count: number; resolved: number }>;
  byAssunto: Array<{ name: string; count: number }>;
  byAgent: Array<{ name: string; count: number; avgCsat: number | null; csatCount: number }>;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const teamId  = Number(searchParams.get('teamId'));
  const inboxId = Number(searchParams.get('inboxId'));

  if (!teamId || !inboxId) {
    return NextResponse.json({ error: 'teamId e inboxId obrigatórios' }, { status: 400 });
  }

  const now = new Date();
  const since = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000);
  const until = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) / 1000);
  const period = now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });

  try {
    const payload = await memoize(`breakdown:${teamId}:${inboxId}:${since}`, BREAKDOWN_TTL_MS, async () => {
      const [resolved, open, pending, snoozed, csatRaw] = await Promise.all([
        fetchConvsByTeam(teamId, 'resolved', since),
        fetchConvsByTeam(teamId, 'open',     since, 3),
        fetchConvsByTeam(teamId, 'pending',  since, 2),
        fetchConvsByTeam(teamId, 'snoozed',  since, 2),
        // `since` + `until` juntos e todas as páginas — sem os dois o Chatwoot
        // ignora o filtro e devolve o histórico inteiro em ordem cronológica.
        fetchCsatResponses({ inboxId, teamId, since, until }),
      ]);

      // Deduplicate + filter to month window (cap at 150 to keep bot-fetch fast)
      const convMap = new Map<number, RawConv>();
      for (const c of [...resolved, ...open, ...pending, ...snoozed]) convMap.set(c.id, c);
      const convs = Array.from(convMap.values())
        .filter((c) => c.created_at >= since && c.created_at < until)
        .slice(0, 150);

      // CSAT map: convId → rating
      const csatMap = new Map<number, number>();
      for (const r of csatRaw) csatMap.set(r.conversationId, r.rating);

      // Fetch bot fields (subdepartamento + assunto) concurrently
      const botFields = await runConcurrently(
        convs.map((c) => () => fetchBotFields(c.id)),
        10
      );

      // Aggregate
      const subdepMap  = new Map<string, { count: number; resolved: number }>();
      const assuntoMap = new Map<string, number>();
      const agentMap   = new Map<string, { count: number; csatSum: number; csatCount: number }>();

      for (let i = 0; i < convs.length; i++) {
        const conv = convs[i];
        const bot  = botFields[i];
        const csat = csatMap.get(conv.id) ?? null;

        // by subdepartamento
        const subdep = bot.subdepartamento || '(não informado)';
        const sd = subdepMap.get(subdep) ?? { count: 0, resolved: 0 };
        sd.count++;
        if (conv.status === 'resolved') sd.resolved++;
        subdepMap.set(subdep, sd);

        // by assunto
        const assunto = bot.assunto || '(não informado)';
        assuntoMap.set(assunto, (assuntoMap.get(assunto) ?? 0) + 1);

        // by agent
        const agent = conv.meta?.assignee?.name ?? '(não atribuído)';
        const ag = agentMap.get(agent) ?? { count: 0, csatSum: 0, csatCount: 0 };
        ag.count++;
        if (csat !== null) { ag.csatSum += csat; ag.csatCount++; }
        agentMap.set(agent, ag);
      }

      const result: WhatsAppBreakdownData = {
        period,
        total: convs.length,
        bySubdepartamento: Array.from(subdepMap.entries())
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.count - a.count),
        byAssunto: Array.from(assuntoMap.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count),
        byAgent: Array.from(agentMap.entries())
          .map(([name, v]) => ({
            name,
            count: v.count,
            avgCsat: v.csatCount > 0 ? Math.round((v.csatSum / v.csatCount) * 10) / 10 : null,
            csatCount: v.csatCount,
          }))
          .sort((a, b) => b.count - a.count),
      };

      return result;
    });

    return NextResponse.json(payload);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
