const BASE_URL = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN = process.env.CHATWOOT_API_TOKEN;

async function chatwootFetch<T>(path: string): Promise<T> {
  if (!BASE_URL || !TOKEN) {
    throw new Error('CHATWOOT_BASE_URL e CHATWOOT_API_TOKEN são obrigatórios');
  }
  const url = `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`;
  const res = await fetch(url, {
    headers: { api_access_token: TOKEN },
    next: { revalidate: 60 },
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

export interface ChatwootConversationSummary {
  open: number;
  pending: number;
  resolved: number;
  all: number;
}

export interface ChatwootReportSummary {
  avg_first_response_time: number;
  avg_resolution_time: number;
  account_id: number;
  resolutions_count: number;
  incoming_messages_count: number;
  outgoing_messages_count: number;
  conversations_count: number;
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

export async function getConversationStats(params: {
  inboxId?: number;
  teamId?: number;
  labels?: string[];
}): Promise<ChatwootConversationSummary> {
  const counts: ChatwootConversationSummary = { open: 0, pending: 0, resolved: 0, all: 0 };

  for (const status of ['open', 'pending', 'resolved'] as const) {
    const qs = new URLSearchParams({ status });
    if (params.inboxId) qs.set('inbox_id', String(params.inboxId));
    if (params.teamId) qs.set('team_id', String(params.teamId));
    if (params.labels?.length) qs.set('labels[]', params.labels[0]);

    const data = await chatwootFetch<{ data: { meta: { all_count: number } } }>(
      `/conversations?${qs}`
    );
    counts[status] = data?.data?.meta?.all_count ?? 0;
  }

  counts.all = counts.open + counts.pending + counts.resolved;
  return counts;
}

export async function getReportSummary(params: {
  inboxId?: number;
  teamId?: number;
  since?: number;
  until?: number;
}): Promise<ChatwootReportSummary | null> {
  try {
    const qs = new URLSearchParams({ type: 'account' });
    if (params.inboxId) { qs.set('type', 'inbox'); qs.set('id', String(params.inboxId)); }
    if (params.teamId)  { qs.set('type', 'team');  qs.set('id', String(params.teamId));  }
    if (params.since)   qs.set('since', String(params.since));
    if (params.until)   qs.set('until', String(params.until));
    return await chatwootFetch<ChatwootReportSummary>(`/reports/summary?${qs}`);
  } catch {
    return null;
  }
}
