import { NextRequest, NextResponse } from 'next/server';

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

type RawCsatResponse = {
  rating: number;
  feedback_message: string | null;
  conversation_id: number;
};

async function fetchConversationsForStatus(
  inboxId: number,
  status: string,
  since: number,
  maxPages = 6
): Promise<RawConv[]> {
  const all: RawConv[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const data = await cwFetch<{ data: { payload: RawConv[] } }>(
      `/conversations?status=${status}&inbox_id=${inboxId}&page=${page}`
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
  const inboxId = Number(searchParams.get('inboxId'));
  const monthParam = searchParams.get('month'); // "YYYY-MM"

  if (!inboxId) {
    return NextResponse.json({ error: 'inboxId obrigatório' }, { status: 400 });
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
      fetchConversationsForStatus(inboxId, 'resolved', since),
      fetchConversationsForStatus(inboxId, 'open', since, 3),
      fetchConversationsForStatus(inboxId, 'pending', since, 2),
      fetchConversationsForStatus(inboxId, 'snoozed', since, 2),
    ]);

    const allConversations = [...resolved, ...open, ...pending, ...snoozed];

    // Deduplicate by id
    const convMap = new Map<number, RawConv>();
    for (const c of allConversations) convMap.set(c.id, c);

    // Fetch CSAT responses for the month
    let csatMap = new Map<number, { rating: number; feedback: string | null }>();
    try {
      const csatData = await cwFetch<RawCsatResponse[]>(
        `/csat_survey_responses?inbox_id=${inboxId}&since=${since}&page=1`
      );
      if (Array.isArray(csatData)) {
        for (const r of csatData) {
          const convId = r.conversation_id;
          if (convId) {
            csatMap.set(convId, {
              rating: Number(r.rating),
              feedback: r.feedback_message ?? null,
            });
          }
        }
      }
    } catch {
      // CSAT is optional
    }

    // Build response
    const conversations: BacklogConversation[] = Array.from(convMap.values())
      .filter((c) => c.created_at >= since && c.created_at < until)
      .sort((a, b) => b.created_at - a.created_at)
      .map((c) => {
        const csat = csatMap.get(c.id);
        return {
          id: c.id,
          contactName:   c.meta?.sender?.name ?? '—',
          contactPhone:  c.meta?.sender?.phone_number ?? '',
          assigneeName:  c.meta?.assignee?.name ?? null,
          labels:        c.labels ?? [],
          status:        c.status,
          createdAt:     c.created_at,
          csatRating:    csat?.rating ?? null,
          csatFeedback:  csat?.feedback ?? null,
          chatwootUrl:   `${BASE_URL}/app/accounts/${ACCOUNT_ID}/conversations/${c.id}`,
        };
      });

    return NextResponse.json({ conversations, month: `${year}-${String(month + 1).padStart(2, '0')}` });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
