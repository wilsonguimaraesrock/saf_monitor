/**
 * Snapshot consolidado das conversas ativas de todos os setores, usado para
 * disparar as notificações de nova mensagem no navegador.
 *
 * O resultado é memoizado por alguns segundos: várias abas/atendentes ficam
 * conectados ao mesmo tempo e não faz sentido bater no Chatwoot uma vez por aba.
 */

import { getConversationActivity, type ChatwootConversationActivity } from '@/integrations/chatwoot';
import { SECTORS } from '@/lib/sectors';

export interface LiveFeedConversation extends ChatwootConversationActivity {
  /** slug do setor (rota /setor/<slug>) */
  sectorSlug: string;
  /** nome do departamento que recebeu a mensagem — vai no título da notificação */
  sectorName: string;
}

export interface LiveFeedSnapshot {
  refreshedAt: string;
  conversations: LiveFeedConversation[];
}

const CACHE_TTL_MS = 8_000;
const FETCH_CONCURRENCY = 6;
const STATUSES: Array<'open' | 'pending'> = ['open', 'pending'];

let cached: { snapshot: LiveFeedSnapshot; at: number } | null = null;
let inflight: Promise<LiveFeedSnapshot> | null = null;

async function runConcurrently<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < tasks.length) {
      const index = cursor++;
      results[index] = await tasks[index]();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

async function buildSnapshot(): Promise<LiveFeedSnapshot> {
  const targets = SECTORS.flatMap((sector) =>
    sector.chatwoot
      ? STATUSES.map((status) => ({
          status,
          teamId: sector.chatwoot!.teamId,
          sectorSlug: sector.slug,
          sectorName: sector.name,
        }))
      : []
  );

  const batches = await runConcurrently(
    targets.map((t) => async () => {
      const convs = await getConversationActivity(t.teamId, t.status, { cache: 'no-store' });
      return convs.map((c) => ({ ...c, sectorSlug: t.sectorSlug, sectorName: t.sectorName }));
    }),
    FETCH_CONCURRENCY
  );

  // Dedup por id — a mesma conversa não deveria aparecer em dois status,
  // mas o Chatwoot pode mudar de status entre as duas chamadas.
  const byId = new Map<number, LiveFeedConversation>();
  for (const conv of batches.flat()) {
    const current = byId.get(conv.id);
    if (!current || conv.lastActivityAt > current.lastActivityAt) byId.set(conv.id, conv);
  }

  return {
    refreshedAt: new Date().toISOString(),
    conversations: Array.from(byId.values()).sort((a, b) => b.lastActivityAt - a.lastActivityAt),
  };
}

export async function getLiveFeedSnapshot(): Promise<LiveFeedSnapshot> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.snapshot;
  if (inflight) return inflight;

  inflight = buildSnapshot()
    .then((snapshot) => {
      cached = { snapshot, at: Date.now() };
      return snapshot;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}
