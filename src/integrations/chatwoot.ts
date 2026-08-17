import { businessElapsedSeconds } from '../lib/businessTime';

const BASE_URL = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN = process.env.CHATWOOT_API_TOKEN;

export interface ChatwootRequestOptions {
  cache?: RequestCache;
  revalidate?: number | false;
}

async function chatwootFetch<T>(
  path: string,
  options: ChatwootRequestOptions = {}
): Promise<T> {
  if (!BASE_URL || !TOKEN) {
    throw new Error('CHATWOOT_BASE_URL e CHATWOOT_API_TOKEN são obrigatórios');
  }

  const { cache, revalidate = 60 } = options;
  const url = `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`;

  const res = await fetch(url, {
    headers: { api_access_token: TOKEN },
    ...(cache ? { cache } : {}),
    ...(!cache && typeof revalidate === 'number' ? { next: { revalidate } } : {}),
  });

  if (!res.ok) {
    throw new Error(`Chatwoot ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Endpoints de relatório vivem sob /api/v2. */
async function chatwootFetchV2<T>(
  path: string,
  options: ChatwootRequestOptions = {}
): Promise<T> {
  if (!BASE_URL || !TOKEN) {
    throw new Error('CHATWOOT_BASE_URL e CHATWOOT_API_TOKEN são obrigatórios');
  }

  const { cache, revalidate = 60 } = options;
  const url = `${BASE_URL}/api/v2/accounts/${ACCOUNT_ID}${path}`;

  const res = await fetch(url, {
    headers: { api_access_token: TOKEN },
    ...(cache ? { cache } : {}),
    ...(!cache && typeof revalidate === 'number' ? { next: { revalidate } } : {}),
  });

  if (!res.ok) {
    throw new Error(`Chatwoot ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface ChatwootInbox {
  id: number;
  name: string;
  channel_type: string;
  phone_number?: string;
}

export interface ChatwootLabel {
  id: number;
  title: string;
  description: string;
  color: string;
}

export interface ChatwootTeam {
  id: number;
  name: string;
  description: string;
}

interface ConversationMeta {
  all_count: number;
  assigned_count: number;
  unassigned_count: number;
  mine_count: number;
}

export interface ChatwootPanelData {
  inboxId: number;
  inboxName: string;
  open: number;
  unassigned: number;
  pending: number;
  resolved: number;
  snoozed: number;
  csatAvg: number | null;
  csatTotal: number;
}

/**
 * IMPORTANTE — filtro de data do CSAT no Chatwoot:
 * `/csat_survey_responses` só aplica o recorte de período quando `since` E `until`
 * são enviados juntos. Com apenas `since`, a API ignora o filtro e devolve o
 * histórico inteiro paginado da mais antiga para a mais nova — as avaliações do
 * mês corrente ficam nas últimas páginas e nunca aparecem.
 * Sempre mande os dois parâmetros.
 */
export interface CsatResponse {
  conversationId: number;
  rating: number;
  feedback: string | null;
  createdAt: number;
}

interface CsatQuery {
  inboxId: number;
  teamId?: number;
  /** epoch em segundos (início do período, inclusivo) */
  since: number;
  /** epoch em segundos (fim do período, exclusivo) */
  until: number;
}

/** Todas as respostas de CSAT do período, paginando até o fim. */
export async function fetchCsatResponses(
  { inboxId, teamId, since, until }: CsatQuery,
  options: ChatwootRequestOptions = { cache: 'no-store' },
  maxPages = 40
): Promise<CsatResponse[]> {
  type RawCsat = {
    rating: number;
    feedback_message?: string | null;
    conversation_id?: number;
    conversation?: { id?: number };
    created_at?: number;
  };

  const teamParam = teamId != null ? `&team_id=${teamId}` : '';
  const all: CsatResponse[] = [];

  for (let page = 1; page <= maxPages; page++) {
    let data: RawCsat[];
    try {
      data = await chatwootFetch<RawCsat[]>(
        `/csat_survey_responses?inbox_id=${inboxId}${teamParam}&since=${since}&until=${until}&page=${page}`,
        options
      );
    } catch { break; }

    if (!Array.isArray(data) || data.length === 0) break;

    for (const r of data) {
      // conversation_id direto ou aninhado — varia conforme a versão do Chatwoot
      const convId = r.conversation_id ?? r.conversation?.id;
      if (!convId) continue;
      all.push({
        conversationId: convId,
        rating: Number(r.rating),
        feedback: r.feedback_message?.trim() || null,
        createdAt: r.created_at ?? 0,
      });
    }

    if (data.length < 25) break; // última página
  }

  return all;
}

/** Média e total de CSAT do período, via endpoint de métricas (uma chamada só). */
export async function getCsatMetrics(
  { inboxId, teamId, since, until }: CsatQuery,
  options: ChatwootRequestOptions = { cache: 'no-store' }
): Promise<{ avg: number | null; total: number }> {
  try {
    const teamParam = teamId != null ? `&team_id=${teamId}` : '';
    const data = await chatwootFetch<{
      total_count?: number;
      ratings_count?: Record<string, number>;
    }>(
      `/csat_survey_responses/metrics?inbox_id=${inboxId}${teamParam}&since=${since}&until=${until}`,
      options
    );

    const counts = data?.ratings_count ?? {};
    let total = 0;
    let sum = 0;
    for (const [rating, count] of Object.entries(counts)) {
      total += Number(count);
      sum += Number(rating) * Number(count);
    }
    if (total === 0) return { avg: null, total: Number(data?.total_count ?? 0) };

    return { total, avg: Math.round((sum / total) * 10) / 10 };
  } catch {
    return { avg: null, total: 0 };
  }
}

function monthBounds(ref = new Date()): { since: number; until: number } {
  return {
    since: Math.floor(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), 1) / 1000),
    until: Math.floor(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + 1, 1) / 1000),
  };
}

async function getCsatStats(
  inboxId: number,
  teamId: number,
  options?: ChatwootRequestOptions
): Promise<{ avg: number | null; total: number }> {
  const { since, until } = monthBounds();
  return getCsatMetrics({ inboxId, teamId, since, until }, options);
}

async function getConversationMeta(
  teamId: number,
  status: string,
  options?: ChatwootRequestOptions,
  since?: number
): Promise<ConversationMeta> {
  const sinceParam = since ? `&since=${since}` : '';
  const data = await chatwootFetch<{ data: { meta: ConversationMeta } }>(
    `/conversations?status=${status}&team_id=${teamId}${sinceParam}`,
    options
  );
  return data?.data?.meta ?? { all_count: 0, assigned_count: 0, unassigned_count: 0, mine_count: 0 };
}

export async function getChatwootPanelData(
  teamId: number,
  inboxId: number,
  inboxName: string,
  options?: ChatwootRequestOptions
): Promise<ChatwootPanelData | null> {
  try {
    const [openMeta, pendingMeta, resolvedMeta, snoozedMeta, csat] = await Promise.all([
      getConversationMeta(teamId, 'open', options),
      getConversationMeta(teamId, 'pending', options),
      getConversationMeta(teamId, 'resolved', options),
      getConversationMeta(teamId, 'snoozed', options),
      getCsatStats(inboxId, teamId, options),
    ]);
    return {
      inboxId,
      inboxName,
      open:       openMeta.all_count,
      unassigned: openMeta.unassigned_count,
      pending:    pendingMeta.all_count,
      resolved:   resolvedMeta.all_count,
      snoozed:    snoozedMeta.all_count,
      csatAvg:    csat.avg,
      csatTotal:  csat.total,
    };
  } catch {
    return null;
  }
}

export interface ChatwootConversation {
  id: number;
  contactName: string;
  contactPhone: string;
  unitName: string;
  labels: string[];
  assigneeId: number | null;
  assigneeName: string | null;
  lastMessage: string;
  waitingSinceSec: number;
  chatwootUrl: string;
}

export async function getOpenConversations(
  teamId: number,
  limit = 50,
  options?: ChatwootRequestOptions,
  maxPages = 10
): Promise<ChatwootConversation[]> {
  type RawConversation = {
    id: number;
    status: string;
    waiting_since: number;
    labels: string[];
    meta: {
      sender: { name: string; phone_number: string };
      assignee: { id: number; name: string } | null;
    };
    custom_attributes: Record<string, string>;
    last_non_activity_message: { content: string } | null;
  };

  try {
    const all: RawConversation[] = [];

    for (let page = 1; page <= maxPages; page++) {
      const data = await chatwootFetch<{ data: { payload: RawConversation[] } }>(
        `/conversations?status=open&team_id=${teamId}&page=${page}`,
        options
      );
      const payload = data?.data?.payload ?? [];
      if (payload.length === 0) break;
      all.push(...payload);
      if (all.length >= limit) break;
    }

    return all.slice(0, limit).map((c) => ({
      id: c.id,
      contactName:    c.meta?.sender?.name ?? '—',
      contactPhone:   c.meta?.sender?.phone_number ?? '',
      unitName:       c.custom_attributes?.unitName ?? '',
      labels:         c.labels ?? [],
      assigneeId:     c.meta?.assignee?.id ?? null,
      assigneeName:   c.meta?.assignee?.name ?? null,
      lastMessage:    c.last_non_activity_message?.content ?? '',
      waitingSinceSec: c.waiting_since ?? 0,
      chatwootUrl: `${BASE_URL}/app/accounts/${ACCOUNT_ID}/conversations/${c.id}`,
    }));
  } catch {
    return [];
  }
}

export interface ChatwootConversationActivity {
  id: number;
  status: string;
  contactName: string;
  contactPhone: string;
  unitName: string;
  assigneeName: string | null;
  lastMessage: string;
  /** id da última mensagem — usado para detectar mensagem nova sem depender do texto */
  lastMessageId: number | null;
  /** 0 = recebida do contato, 1 = enviada pelo atendente, 2 = atividade, 3 = template */
  lastMessageType: number | null;
  /** epoch em segundos */
  lastActivityAt: number;
  chatwootUrl: string;
}

/**
 * Página mais recente de conversas de um team, com dados da última mensagem.
 * Usada pelo feed de novas mensagens — o Chatwoot devolve ordenado por
 * atividade mais recente, então a primeira página basta para detectar novidades.
 */
export async function getConversationActivity(
  teamId: number,
  status: 'open' | 'pending',
  options?: ChatwootRequestOptions
): Promise<ChatwootConversationActivity[]> {
  type RawMessage = {
    id?: number;
    content?: string | null;
    message_type?: number;
    created_at?: number;
  };

  type RawConversation = {
    id: number;
    status?: string;
    last_activity_at?: number;
    timestamp?: number;
    waiting_since?: number;
    meta?: {
      sender?: { name?: string; phone_number?: string };
      assignee?: { name?: string } | null;
    };
    custom_attributes?: Record<string, string>;
    last_non_activity_message?: RawMessage | null;
    messages?: RawMessage[];
  };

  try {
    const data = await chatwootFetch<{ data: { payload: RawConversation[] } }>(
      `/conversations?status=${status}&team_id=${teamId}&page=1`,
      options
    );

    return (data?.data?.payload ?? []).map((c) => {
      // Versões do Chatwoot variam: umas trazem last_non_activity_message,
      // outras só o array messages com a última mensagem.
      const fromArray = (c.messages ?? [])
        .filter((m) => m.message_type !== 2)
        .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))
        .pop();
      const last = c.last_non_activity_message ?? fromArray ?? null;

      return {
        id: c.id,
        status: c.status ?? status,
        contactName: c.meta?.sender?.name ?? '—',
        contactPhone: c.meta?.sender?.phone_number ?? '',
        unitName: c.custom_attributes?.unitName ?? '',
        assigneeName: c.meta?.assignee?.name ?? null,
        lastMessage: last?.content?.trim() ?? '',
        lastMessageId: last?.id ?? null,
        lastMessageType: last?.message_type ?? null,
        lastActivityAt: c.last_activity_at ?? last?.created_at ?? c.timestamp ?? 0,
        chatwootUrl: `${BASE_URL}/app/accounts/${ACCOUNT_ID}/conversations/${c.id}`,
      };
    });
  } catch {
    return [];
  }
}

export interface ChatwootLandingStats {
  open: number;
  pending: number;
  monthlyTotal: number;
  avgWaitMin: number | null;
  csatAvg: number | null;
}

async function getMonthlyResolvedCount(
  teamId: number,
  sinceMonth: number,
  untilMonth?: number
): Promise<number> {
  let count = 0;
  for (let page = 1; page <= 10; page++) {
    let data: { data: { payload: Array<{ created_at: number }> } } | null = null;
    try {
      data = await chatwootFetch<{ data: { payload: Array<{ created_at: number }> } }>(
        `/conversations?status=resolved&team_id=${teamId}&page=${page}`,
        { cache: 'no-store' }
      );
    } catch { break; }
    const payload = data?.data?.payload ?? [];
    if (payload.length === 0) break;
    const inMonth = payload.filter(
      (c) => c.created_at >= sinceMonth && (untilMonth === undefined || c.created_at < untilMonth)
    );
    count += inMonth.length;
    const oldest = payload[payload.length - 1]?.created_at ?? 0;
    if (oldest < sinceMonth) break;
  }
  return count;
}

async function getHistoricalMonthlyCount(
  teamId: number,
  sinceMonth: number,
  untilMonth: number
): Promise<number> {
  let total = 0;
  for (const status of ['open', 'pending', 'resolved', 'snoozed'] as const) {
    for (let page = 1; page <= 10; page++) {
      let data: { data: { payload: Array<{ created_at: number }> } } | null = null;
      try {
        data = await chatwootFetch<{ data: { payload: Array<{ created_at: number }> } }>(
          `/conversations?status=${status}&team_id=${teamId}&page=${page}`,
          { cache: 'no-store' }
        );
      } catch { break; }
      const payload = data?.data?.payload ?? [];
      if (payload.length === 0) break;
      const inRange = payload.filter(
        (c) => c.created_at >= sinceMonth && c.created_at < untilMonth
      );
      total += inRange.length;
      const oldest = payload[payload.length - 1]?.created_at ?? 0;
      if (oldest < sinceMonth) break;
    }
  }
  return total;
}

export async function getChatwootLandingStats(
  inboxId: number,
  teamId: number,
  monthStart?: Date,
  monthEnd?: Date,
): Promise<ChatwootLandingStats> {
  const empty: ChatwootLandingStats = { open: 0, pending: 0, monthlyTotal: 0, avgWaitMin: null, csatAvg: null };
  try {
    const now = Math.floor(Date.now() / 1000);

    // Past month — no live metrics, mas o CSAT do período é histórico e conta
    // pela data da avaliação, então continua valendo.
    if (monthStart && monthEnd && monthEnd.getTime() <= Date.now()) {
      const sinceMonth = Math.floor(monthStart.getTime() / 1000);
      const untilMonth = Math.floor(monthEnd.getTime() / 1000);
      const [monthlyTotal, csat] = await Promise.all([
        getHistoricalMonthlyCount(teamId, sinceMonth, untilMonth),
        getCsatMetrics({ inboxId, teamId, since: sinceMonth, until: untilMonth }),
      ]);
      return { open: 0, pending: 0, monthlyTotal, avgWaitMin: null, csatAvg: csat.avg };
    }

    const curMonthStart = monthStart ?? new Date();
    const sinceMonth = Math.floor(Date.UTC(curMonthStart.getUTCFullYear(), curMonthStart.getUTCMonth(), 1) / 1000);
    const untilMonth = Math.floor(Date.UTC(curMonthStart.getUTCFullYear(), curMonthStart.getUTCMonth() + 1, 1) / 1000);

    const [convRes, pendingMeta, snoozedMeta, csat, monthlyResolved] = await Promise.all([
      chatwootFetch<{
        data: {
          meta: { all_count: number };
          payload: Array<{ waiting_since: number | null }>;
        };
      }>(`/conversations?status=open&team_id=${teamId}&page=1`, { cache: 'no-store' }),

      getConversationMeta(teamId, 'pending', { cache: 'no-store' }),
      getConversationMeta(teamId, 'snoozed', { cache: 'no-store' }),

      getCsatMetrics({ inboxId, teamId, since: sinceMonth, until: untilMonth }),

      getMonthlyResolvedCount(teamId, sinceMonth),
    ]);

    const open    = convRes?.data?.meta?.all_count ?? 0;
    const pending = pendingMeta.all_count;
    const payload = convRes?.data?.payload ?? [];

    // Espera em tempo útil — fim de semana (sex 18h → seg 8h) não conta
    const waits = payload
      .filter((c) => c.waiting_since && c.waiting_since > 0)
      .map((c) => businessElapsedSeconds(c.waiting_since!, now));

    const avgWaitMin = waits.length > 0
      ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length / 60)
      : null;

    const csatAvg = csat.avg;

    const monthlyTotal = open + pending + monthlyResolved + snoozedMeta.all_count;

    return { open, pending, monthlyTotal, avgWaitMin, csatAvg };
  } catch {
    return empty;
  }
}

export async function getCsatForPeriod(
  inboxId: number,
  since: number,
  until: number,
  teamId?: number
): Promise<{ avg: number | null; total: number }> {
  return getCsatMetrics({ inboxId, teamId, since, until });
}

export interface ChatwootHandlingStats {
  /** Tempo médio de atendimento (abertura → resolução), em segundos */
  avgResolutionSec: number | null;
  /** Tempo médio da primeira resposta, em segundos */
  avgFirstResponseSec: number | null;
  /** Conversas resolvidas no período */
  resolutionsCount: number;
  /** Conversas abertas no período */
  conversationsCount: number;
}

/**
 * Tempo médio de atendimento do WhatsApp no período, via relatório do Chatwoot.
 * Os tempos vêm do próprio Chatwoot (relógio corrido, sem desconto de fim de semana).
 */
export async function getWhatsappHandlingStats(
  teamId: number,
  since: number,
  until: number
): Promise<ChatwootHandlingStats> {
  const empty: ChatwootHandlingStats = {
    avgResolutionSec: null,
    avgFirstResponseSec: null,
    resolutionsCount: 0,
    conversationsCount: 0,
  };
  try {
    const data = await chatwootFetchV2<{
      avg_resolution_time?: number | string | null;
      avg_first_response_time?: number | string | null;
      resolutions_count?: number | null;
      conversations_count?: number | null;
    }>(
      `/reports/summary?type=team&id=${teamId}&since=${since}&until=${until}`,
      { cache: 'no-store' }
    );

    const num = (v: number | string | null | undefined): number | null => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    };

    return {
      avgResolutionSec:    num(data?.avg_resolution_time),
      avgFirstResponseSec: num(data?.avg_first_response_time),
      resolutionsCount:    Number(data?.resolutions_count ?? 0),
      conversationsCount:  Number(data?.conversations_count ?? 0),
    };
  } catch {
    return empty;
  }
}

export async function getInboxes(): Promise<ChatwootInbox[]> {
  const data = await chatwootFetch<{ payload: ChatwootInbox[] }>('/inboxes');
  return data.payload ?? [];
}

export async function getLabels(): Promise<ChatwootLabel[]> {
  const data = await chatwootFetch<{ payload: ChatwootLabel[] }>('/labels');
  return data.payload ?? [];
}

export async function getTeams(): Promise<ChatwootTeam[]> {
  const data = await chatwootFetch<ChatwootTeam[]>('/teams');
  return Array.isArray(data) ? data : [];
}
