'use client';

import { startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChatwootConversation, ChatwootPanelData } from '@/integrations/chatwoot';
import { ChatwootPanel } from '@/components/ChatwootPanel';
import { ChatwootSlaPanel } from '@/components/ChatwootSlaPanel';
import { ChatwootConversationTable } from '@/components/ChatwootConversationTable';

const LIVE_REFRESH_MS = 30 * 1000;

interface LiveChatwootResponse {
  panelData: ChatwootPanelData | null;
  openConversations: ChatwootConversation[];
  refreshedAt: string;
}

interface Props {
  sectorSlug: string;
  inboxName: string;
  initialPanelData: ChatwootPanelData | null;
  initialOpenConversations: ChatwootConversation[];
  initialRefreshedAt: string;
  children?: ReactNode;
}

export function SectorChatwootLiveSection({
  sectorSlug,
  inboxName,
  initialPanelData,
  initialOpenConversations,
  initialRefreshedAt,
  children,
}: Props) {
  const [panelData, setPanelData] = useState(initialPanelData);
  const [openConversations, setOpenConversations] = useState(initialOpenConversations);
  const [refreshedAt, setRefreshedAt] = useState(initialRefreshedAt);
  const [isPolling, setIsPolling] = useState(false);
  const [hasPollingError, setHasPollingError] = useState(false);

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

      if (document.visibilityState === 'hidden') {
        scheduleRefresh();
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setIsPolling(true);

      try {
        const res = await fetch(`/api/chatwoot/live?sector=${encodeURIComponent(sectorSlug)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`Falha ao atualizar Chatwoot (${res.status})`);
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

    scheduleRefresh();
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('visibilitychange', handleWindowFocus);

    return () => {
      cancelled = true;
      clearScheduledRefresh();
      abortRef.current?.abort();
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('visibilitychange', handleWindowFocus);
    };
  }, [sectorSlug]);

  return (
    <div className="space-y-6">
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
        <span>Atualizado as {refreshedLabel} · intervalo de 30s</span>
      </div>

      {panelData && <ChatwootPanel data={panelData} />}

      {children}

      <ChatwootSlaPanel
        conversations={openConversations}
        panelData={panelData}
        title={`SLA WhatsApp — ${inboxName}`}
      />

      {openConversations.length > 0 && (
        <ChatwootConversationTable
          conversations={openConversations}
          title={`Conversas Abertas — WhatsApp ${inboxName}`}
        />
      )}
    </div>
  );
}
