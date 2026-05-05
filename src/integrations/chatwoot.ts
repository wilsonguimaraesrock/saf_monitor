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
}

async function getConversationMeta(inboxId: number, status: string): Promise<ConversationMeta> {
  const data = await chatwootFetch<{ data: { meta: ConversationMeta } }>(
    `/conversations?status=${status}&inbox_id=${inboxId}`
  );
  return data?.data?.meta ?? { all_count: 0, assigned_count: 0, unassigned_count: 0, mine_count: 0 };
}

export async function getChatwootPanelData(
  inboxId: number,
  inboxName: string
): Promise<ChatwootPanelData | null> {
  try {
    const [openMeta, pendingMeta, resolvedMeta, snoozedMeta] = await Promise.all([
      getConversationMeta(inboxId, 'open'),
      getConversationMeta(inboxId, 'pending'),
      getConversationMeta(inboxId, 'resolved'),
      getConversationMeta(inboxId, 'snoozed'),
    ]);
    return {
      inboxId,
      inboxName,
      open:       openMeta.all_count,
      unassigned: openMeta.unassigned_count,
      pending:    pendingMeta.all_count,
      resolved:   resolvedMeta.all_count,
      snoozed:    snoozedMeta.all_count,
    };
  } catch {
    return null;
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
