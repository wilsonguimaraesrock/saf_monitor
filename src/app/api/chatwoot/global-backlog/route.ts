import { NextRequest, NextResponse } from 'next/server';
import { fetchCsatResponses, getCsatMetrics } from '@/integrations/chatwoot';
import {
  getActiveConversationIds,
  type ConversationOrigin,
} from '@/repository/activeConversations';

export const dynamic = 'force-dynamic';

const BASE_URL   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN      = process.env.CHATWOOT_API_TOKEN;

const CW_SECTORS = [
  { slug: 'pd-i',           name: 'PD&I',           teamId: 3,  inboxId: 11 },
  { slug: 'administrativo', name: 'Administrativo', teamId: 10, inboxId: 11 },
  { slug: 'logistica',      name: 'Logística',      teamId: 9,  inboxId: 11 },
  { slug: 'implantacao',    name: 'Implantação',    teamId: 11, inboxId: 11 },
  { slug: 'pedagogico',     name: 'Pedagógico',     teamId: 7,  inboxId: 11 },
  { slug: 'comercial',      name: 'Comercial',      teamId: 5,  inboxId: 11 },
  { slug: 'mkt',            name: 'MKT',            teamId: 4,  inboxId: 11 },
  { slug: 'treinamentos',   name: 'Treinamentos',   teamId: 8,  inboxId: 11 },
  { slug: 'financeiro',     name: 'Financeiro',     teamId: 6,  inboxId: 11 },
];

export interface GlobalBacklogConversation {
  id: number;
  contactName: string;
  contactPhone: string;
  assigneeName: string | null;
  labels: string[];
  status: string;
  createdAt: number;
  csatRating: number | null;
  chatwootUrl: string;
  unidade: string;
  departamento: string;
  subdepartamento: string;
  assunto: string;
  sectorSlug: string;
  sectorName: string;
  origem: ConversationOrigin;
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
  custom_attributes?: Record<string, string>;
};

type RawMessage = {
  id: number;
  content: string | null;
  created_at: number;
  message_type: number;
};

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

function parseBotMessage(content: string): { unidade: string; departamento: string; subdepartamento: string; assunto: string } {
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

/** Classificação do menu direto do payload da conversa (formato atual).
 *  O parse da primeira mensagem cobre só as conversas antigas. */
function botDataFromAttributes(attrs?: Record<string, string>) {
  const unidade         = attrs?.unitName?.trim() ?? '';
  const departamento    = attrs?.departmentName?.trim() ?? '';
  const subdepartamento = attrs?.subdepartmentName?.trim() ?? '';
  const assunto         = attrs?.subjectName?.trim() ?? '';
  if (!unidade && !departamento && !subdepartamento && !assunto) return null;
  return { unidade, departamento, subdepartamento, assunto };
}

async function fetchBotData(convId: number) {
  const empty = { unidade: '', departamento: '', subdepartamento: '', assunto: '' };
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

async function fetchConversationsForSector(
  inboxId: number,
  teamId: number,
  sectorSlug: string,
  sectorName: string,
  status: string,
  since: number,
  until: number,
  maxPages = 6
): Promise<Array<RawConv & { sectorSlug: string; sectorName: string }>> {
  const all: Array<RawConv & { sectorSlug: string; sectorName: string }> = [];

  for (let page = 1; page <= maxPages; page++) {
    let data: { data: { payload: RawConv[] } } | null = null;
    try {
      data = await cwFetch<{ data: { payload: RawConv[] } }>(
        `/conversations?status=${status}&inbox_id=${inboxId}&team_id=${teamId}&page=${page}`
      );
    } catch { break; }

    const payload = data?.data?.payload ?? [];
    if (payload.length === 0) break;

    const inRange = payload.filter((c) => c.created_at >= since && c.created_at < until);
    all.push(...inRange.map((c) => ({ ...c, sectorSlug, sectorName })));

    if ((payload[payload.length - 1]?.created_at ?? 0) < since) break;
  }

  return all;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const monthParam = searchParams.get('month'); // "YYYY-MM"

  const now = new Date();
  let year  = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (monthParam) {
    const [y, m] = monthParam.split('-').map(Number);
    if (y && m) { year = y; month = m - 1; }
  }

  const since = Math.floor(new Date(year, month, 1).getTime() / 1000);
  const until = Math.floor(new Date(year, month + 1, 1).getTime() / 1000);

  try {
    // Fetch all statuses for all sectors concurrently
    const sectorFetches = CW_SECTORS.flatMap((s) => [
      () => fetchConversationsForSector(s.inboxId, s.teamId, s.slug, s.name, 'resolved', since, until),
      () => fetchConversationsForSector(s.inboxId, s.teamId, s.slug, s.name, 'open',     since, until, 3),
      () => fetchConversationsForSector(s.inboxId, s.teamId, s.slug, s.name, 'pending',  since, until, 2),
      () => fetchConversationsForSector(s.inboxId, s.teamId, s.slug, s.name, 'snoozed',  since, until, 2),
    ]);

    const batches = await runConcurrently(sectorFetches, 8);
    const allConvs = batches.flat();

    // Deduplicate by id (keep first occurrence)
    const convMap = new Map<number, RawConv & { sectorSlug: string; sectorName: string }>();
    for (const c of allConvs) if (!convMap.has(c.id)) convMap.set(c.id, c);

    const convArray = Array.from(convMap.values())
      .sort((a, b) => b.created_at - a.created_at);

    // Fetch CSAT for the shared inbox (one call covers all sectors).
    // `since` + `until` juntos são obrigatórios: só com `since` o Chatwoot
    // ignora o filtro e devolve o histórico inteiro da mais antiga para a mais
    // nova — as avaliações do mês ficavam nas últimas páginas e se perdiam.
    const csatMap = new Map<number, number>();
    for (const r of await fetchCsatResponses({ inboxId: CW_SECTORS[0].inboxId, since, until })) {
      csatMap.set(r.conversationId, r.rating);
    }

    // CSAT do mês pela data da avaliação (não pela data de abertura da conversa):
    // conta toda avaliação respondida dentro do mês, inclusive de conversas
    // abertas em meses anteriores. Métricas por time somam exatamente o global.
    const sectorCsat = await runConcurrently(
      CW_SECTORS.map((s) => () => getCsatMetrics({ inboxId: s.inboxId, teamId: s.teamId, since, until })),
      9
    );
    const csatMonth = {
      geral: await getCsatMetrics({ inboxId: CW_SECTORS[0].inboxId, since, until }),
      porSetor: Object.fromEntries(CW_SECTORS.map((s, i) => [s.slug, sectorCsat[i]])),
    };

    // Fetch bot data concurrently (cap at 200 conversations to keep it fast)
    const capped = convArray.slice(0, 200);
    const botDataList = await runConcurrently(
      capped.map((c) => async () =>
        botDataFromAttributes(c.custom_attributes) ?? (await fetchBotData(c.id))
      ),
      10
    );
    const activeConversationIds = await getActiveConversationIds(capped.map((c) => c.id));

    const conversations: GlobalBacklogConversation[] = capped.map((c, i) => ({
      id:              c.id,
      contactName:     c.meta?.sender?.name ?? '—',
      contactPhone:    c.meta?.sender?.phone_number ?? '',
      assigneeName:    c.meta?.assignee?.name ?? null,
      labels:          c.labels ?? [],
      status:          c.status,
      createdAt:       c.created_at,
      csatRating:      csatMap.get(c.id) ?? null,
      chatwootUrl:     `${BASE_URL}/app/accounts/${ACCOUNT_ID}/conversations/${c.id}`,
      unidade:         botDataList[i].unidade,
      departamento:    botDataList[i].departamento,
      subdepartamento: botDataList[i].subdepartamento,
      assunto:         botDataList[i].assunto,
      sectorSlug:      c.sectorSlug,
      sectorName:      c.sectorName,
      origem:          activeConversationIds.has(c.id) ? 'ativo' : 'receptivo',
    }));

    return NextResponse.json({
      conversations,
      csatMonth,
      month: `${year}-${String(month + 1).padStart(2, '0')}`,
      total: convArray.length,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
