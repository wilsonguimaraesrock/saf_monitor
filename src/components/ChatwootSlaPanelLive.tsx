'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import type { ChatwootConversation, ChatwootPanelData } from '@/integrations/chatwoot';
import { ChatwootSlaPanel } from '@/components/ChatwootSlaPanel';

interface Props {
  sectorSlug: string;
  inboxName: string;
  initialConversations: ChatwootConversation[];
  initialPanelData: ChatwootPanelData | null;
}

const POLL_MS = 30_000;

export function ChatwootSlaPanelLive({
  sectorSlug,
  inboxName,
  initialConversations,
  initialPanelData,
}: Props) {
  const [conversations, setConversations] = useState(initialConversations);
  const [panelData, setPanelData]         = useState(initialPanelData);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      if (document.visibilityState === 'hidden') {
        timerRef.current = setTimeout(poll, POLL_MS);
        return;
      }
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch(`/api/chatwoot/live?sector=${encodeURIComponent(sectorSlug)}`, {
          cache: 'no-store',
          signal: ctrl.signal,
        });
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
        const data = await res.json();
        if (cancelled) return;
        startTransition(() => {
          setConversations(data.openConversations ?? []);
          setPanelData(data.panelData ?? null);
        });
      } catch {
        // silently ignore abort / network errors
      } finally {
        if (!cancelled) timerRef.current = setTimeout(poll, POLL_MS);
      }
    };

    timerRef.current = setTimeout(poll, POLL_MS);
    const onFocus = () => {
      if (document.visibilityState === 'visible') {
        if (timerRef.current) clearTimeout(timerRef.current);
        void poll();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [sectorSlug]);

  return (
    <ChatwootSlaPanel
      conversations={conversations}
      panelData={panelData}
      title={`SLA WhatsApp — ${inboxName}`}
    />
  );
}
