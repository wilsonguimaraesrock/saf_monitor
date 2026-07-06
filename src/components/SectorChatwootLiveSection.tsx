'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { History } from 'lucide-react';
import type { ChatwootConversation, ChatwootPanelData } from '@/integrations/chatwoot';
import { ChatwootPanel } from '@/components/ChatwootPanel';
import { ChatwootConversationTable } from '@/components/ChatwootConversationTable';
import { ChatwootBacklogModal } from '@/components/ChatwootBacklogModal';
import { ChatwootBreakdownCard } from '@/components/ChatwootBreakdownCard';
import { NewMessageNotifier } from '@/components/NewMessageNotifier';

const LIVE_REFRESH_MS = 30 * 1000;

interface LiveChatwootResponse {
  panelData: ChatwootPanelData | null;
  openConversations: ChatwootConversation[];
  refreshedAt: string;
}

interface Props {
  sectorSlug: string;
  inboxName: string;
  teamId: number;
  inboxId: number;
  initialPanelData: ChatwootPanelData | null;
  initialOpenConversations: ChatwootConversation[];
  initialRefreshedAt: string;
}

export function SectorChatwootLiveSection({
  sectorSlug,
  inboxName,
  teamId,
  inboxId,
  initialPanelData,
  initialOpenConversations,
  initialRefreshedAt,
}: Props) {
  const [panelData, setPanelData] = useState(initialPanelData);
  const [openConversations, setOpenConversations] = useState(initialOpenConversations);
  const [refreshedAt, setRefreshedAt] = useState(initialRefreshedAt);
  const [isPolling, setIsPolling] = useState(false);
  const [hasPollingError, setHasPollingError] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const refreshedLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(new Date(refreshedAt)),
    [refreshedAt]
  );

  useEffect(() => {
    let cancelled = false;

    const clearScheduledRefresh = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const scheduleRefresh = (delay = LIVE_REFRESH_MS) => {
      clearScheduledRefresh();
      timerRef.current = setTimeout(() => {
        void refreshChatwootData();
      }, delay);
    };

    const refreshChatwootData = async () => {
      clearScheduledRefresh();

      // Continua buscando mesmo com a aba em segundo plano — necessário para
      // as notificações de nova mensagem dispararem quando o atendente está
      // em outra aba/aplicativo.

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsPolling(true);

      try {
        const res = await fetch(`/api/chatwoot/live?sector=${encodeURIComponent(sectorSlug)}`, {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error(`Falha ao atualizar Chatwoot (${res.status})`);
        }

        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          throw new Error(`Resposta inesperada do Chatwoot live: ${contentType || 'sem content-type'}`);
        }

        const data = await res.json() as LiveChatwootResponse;
        if (cancelled) return;

        startTransition(() => {
          setPanelData(data.panelData);
          setOpenConversations(data.openConversations);
          setRefreshedAt(data.refreshedAt);
          setHasPollingError(false);
        });
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        console.error(err);
        setHasPollingError(true);
      } finally {
        if (cancelled) return;
        setIsPolling(false);
        scheduleRefresh();
      }
    };

    const handleWindowFocus = () => {
      if (document.visibilityState === 'visible') {
        clearScheduledRefresh();
        void refreshChatwootData();
      }
    };

    startTransition(() => {
      setPanelData(initialPanelData);
      setOpenConversations(initialOpenConversations);
      setRefreshedAt(initialRefreshedAt);
      setHasPollingError(false);
    });

    void refreshChatwootData();
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      cancelled = true;
      clearScheduledRefresh();
      abortRef.current?.abort();
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, [sectorSlug, initialOpenConversations, initialPanelData, initialRefreshedAt]);

  return (
    <div className="space-y-6">
      {backlogOpen && (
        <ChatwootBacklogModal
          inboxId={panelData?.inboxId ?? null}
          teamId={teamId}
          inboxName={inboxName}
          onClose={() => setBacklogOpen(false)}
        />
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              hasPollingError
                ? 'bg-amber-500'
                : isPolling
                  ? 'bg-emerald-500 animate-pulse'
                  : 'bg-emerald-500'
            }`}
          />
          {hasPollingError ? 'Chatwoot ao vivo em reconexao' : 'Chatwoot ao vivo'}
        </span>
        <div className="flex items-center gap-3">
          <NewMessageNotifier conversations={openConversations} sectorName={inboxName} />
          <button
            onClick={() => setBacklogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300
              hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700"
          >
            <History size={13} />
            Backlog do mês
          </button>
          <span>Atualizado as {refreshedLabel} · intervalo de 30s</span>
        </div>
      </div>

      {panelData && <ChatwootPanel data={panelData} />}

      <ChatwootConversationTable
        conversations={openConversations}
        title={`Conversas Abertas — WhatsApp ${inboxName}`}
        onBacklog={() => setBacklogOpen(true)}
      />

      <ChatwootBreakdownCard teamId={teamId} inboxId={inboxId} />
    </div>
  );
}
