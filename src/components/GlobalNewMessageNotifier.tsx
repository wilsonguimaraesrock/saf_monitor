'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { MessageSquare, ExternalLink, X } from 'lucide-react';
import type { LiveFeedConversation, LiveFeedSnapshot } from '@/lib/liveFeed';
import { readNotificationsEnabled, subscribeNotificationsEnabled } from '@/lib/notificationPrefs';
import { playNotificationTone } from '@/lib/notificationSound';
import { hasPushSubscription } from '@/lib/webPush';

const POLL_FALLBACK_MS = 20_000;
const MAX_TOASTS = 4;
const TOAST_TTL_MS = 15_000;
/** Ignora atividade antiga (ex.: conversa que voltou para a janela do feed). */
const MAX_MESSAGE_AGE_SEC = 15 * 60;
/** Acima disso, agrupa em um único aviso em vez de encher a tela. */
const DIGEST_THRESHOLD = 3;
/** Janela em que o snapshot não repete um aviso que já veio por push. */
const PUSH_DEDUPE_MS = 90_000;

type Toast =
  | {
      key: string;
      kind: 'message';
      sectorSlug: string;
      sectorName: string;
      contactName: string;
      unitName: string;
      message: string;
      chatwootUrl: string;
    }
  | {
      key: string;
      kind: 'digest';
      count: number;
      sectors: string[];
    };

/** Omit distributivo — sem isso a união colapsaria nas chaves comuns. */
type NewToast = Toast extends infer T ? (T extends Toast ? Omit<T, 'key'> : never) : never;

function preview(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nova conversa';
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function fingerprint(conv: LiveFeedConversation): string {
  return `${conv.lastMessageId ?? 0}|${conv.lastActivityAt}|${conv.lastMessage}`;
}

/** Mensagem enviada pelo atendente/bot não deve alertar ninguém. */
function isIncoming(conv: LiveFeedConversation): boolean {
  return conv.lastMessageType === 0 || conv.lastMessageType === null;
}

/**
 * Notificador global de novas mensagens.
 *
 * Fica montado no layout, então funciona em qualquer tela do painel — e como
 * usa SSE (não timer), continua recebendo com a aba em segundo plano, onde o
 * navegador estrangula setTimeout/setInterval para ~1 por minuto.
 */
export function GlobalNewMessageNotifier() {
  const router = useRouter();
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const seenRef = useRef<Map<number, string>>(new Map());
  const baselineRef = useRef(false);
  const unreadRef = useRef(0);
  const baseTitleRef = useRef('');
  const toastSeqRef = useRef(0);
  /** Com push ativo, quem mostra a notificação do sistema é o service worker. */
  const pushActiveRef = useRef(false);
  /** conversas já avisadas via push — evita o toast repetir no snapshot seguinte */
  const pushedRef = useRef<Map<number, number>>(new Map());

  const active = enabled && !pathname.startsWith('/login');

  useEffect(() => {
    setEnabled(readNotificationsEnabled());
    return subscribeNotificationsEnabled(setEnabled);
  }, []);

  const dismiss = useCallback((key: string) => {
    setToasts((current) => current.filter((t) => t.key !== key));
  }, []);

  const pushToast = useCallback((toast: NewToast) => {
    const key = `toast-${++toastSeqRef.current}`;
    setToasts((current) => [...current, { ...toast, key } as Toast].slice(-MAX_TOASTS));
  }, []);

  /** Contador no título da aba — pista visível mesmo sem permissão de notificação. */
  const bumpTitle = useCallback((count: number) => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') return;
    if (!baseTitleRef.current) baseTitleRef.current = document.title.replace(/^\(\d+\)\s*/, '');
    unreadRef.current += count;
    document.title = `(${unreadRef.current}) ${baseTitleRef.current}`;
  }, []);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      unreadRef.current = 0;
      if (baseTitleRef.current) document.title = baseTitleRef.current;
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const showDesktopNotification = useCallback(
    (title: string, body: string, tag: string, onClick: () => void) => {
      // Evita aviso duplicado: com Web Push inscrito, o sw.js já notifica
      if (pushActiveRef.current) return;
      if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
      try {
        const notification = new Notification(title, {
          body,
          tag,
          icon: '/logo-rockfeller-branca.png',
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
          onClick();
        };
      } catch {
        /* alguns navegadores exigem service worker — o toast cobre esse caso */
      }
    },
    []
  );

  const announce = useCallback(
    (fresh: LiveFeedConversation[]) => {
      playNotificationTone();
      bumpTitle(fresh.length);

      if (fresh.length > DIGEST_THRESHOLD) {
        const sectors = [...new Set(fresh.map((c) => c.sectorName))];
        pushToast({ kind: 'digest', count: fresh.length, sectors });
        showDesktopNotification(
          `${fresh.length} novas mensagens`,
          `Departamentos: ${sectors.join(', ')}`,
          'saf-digest',
          () => router.push('/')
        );
        return;
      }

      for (const conv of fresh) {
        pushToast({
          kind: 'message',
          sectorSlug: conv.sectorSlug,
          sectorName: conv.sectorName,
          contactName: conv.contactName,
          unitName: conv.unitName,
          message: preview(conv.lastMessage),
          chatwootUrl: conv.chatwootUrl,
        });
        showDesktopNotification(
          `Nova mensagem — ${conv.sectorName}`,
          `${conv.contactName}${conv.unitName ? ` · ${conv.unitName}` : ''}: ${preview(conv.lastMessage, 160)}`,
          `saf-conv-${conv.id}`,
          () => router.push(`/setor/${conv.sectorSlug}`)
        );
      }
    },
    [bumpTitle, pushToast, router, showDesktopNotification]
  );

  const handleSnapshot = useCallback(
    (snapshot: LiveFeedSnapshot) => {
      const nowSec = Math.floor(Date.now() / 1000);
      const next = new Map<number, string>();
      const fresh: LiveFeedConversation[] = [];

      for (const conv of snapshot.conversations ?? []) {
        const key = fingerprint(conv);
        const previous = seenRef.current.get(conv.id);
        next.set(conv.id, key);

        if (!baselineRef.current || previous === key) continue;
        if (!isIncoming(conv)) continue;
        if (conv.lastActivityAt && nowSec - conv.lastActivityAt > MAX_MESSAGE_AGE_SEC) continue;

        // Já avisada pelo push (que chega antes) — não repete o toast
        const pushedAt = pushedRef.current.get(conv.id);
        if (pushedAt && Date.now() - pushedAt < PUSH_DEDUPE_MS) continue;

        fresh.push(conv);
      }

      seenRef.current = next;

      if (!baselineRef.current) {
        baselineRef.current = true;
        return;
      }
      if (fresh.length > 0) announce(fresh);
    },
    [announce]
  );

  // Descobre se este navegador está inscrito no Web Push
  useEffect(() => {
    if (!active) {
      pushActiveRef.current = false;
      return;
    }
    let cancelled = false;
    void hasPushSubscription().then((subscribed) => {
      if (!cancelled) pushActiveRef.current = subscribed;
    });
    return () => { cancelled = true; };
  }, [active]);

  // Push recebido: o service worker avisa as abas abertas para mostrarem o
  // toast na hora, sem esperar o próximo snapshot.
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const payload = event.data as
        | { type?: string; data?: { tag?: string; sectorSlug?: string | null; sectorName?: string; contactName?: string; message?: string; body?: string; url?: string } }
        | undefined;
      if (payload?.type !== 'saf-push' || !payload.data) return;

      const data = payload.data;
      const convId = Number(data.tag?.replace('saf-conv-', ''));
      if (Number.isFinite(convId)) pushedRef.current.set(convId, Date.now());

      // Limpa entradas antigas para o Map não crescer indefinidamente
      for (const [id, at] of pushedRef.current) {
        if (Date.now() - at > PUSH_DEDUPE_MS * 2) pushedRef.current.delete(id);
      }

      playNotificationTone();
      bumpTitle(1);
      pushToast({
        kind: 'message',
        sectorSlug: data.sectorSlug ?? '',
        sectorName: data.sectorName ?? 'Atendimento',
        contactName: data.contactName ?? 'Franqueado',
        unitName: '',
        message: preview(data.message ?? data.body ?? ''),
        chatwootUrl: '',
      });
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [active, bumpTitle, pushToast]);

  useEffect(() => {
    if (!active) return;

    // Ao (re)ativar, a primeira resposta só serve de linha de base — evita
    // uma enxurrada de alertas de mensagens que já estavam lá.
    baselineRef.current = false;
    seenRef.current = new Map();

    let stopped = false;
    let source: EventSource | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const res = await fetch('/api/chatwoot/live-feed', {
          cache: 'no-store',
          credentials: 'include',
          headers: { accept: 'application/json' },
        });
        if (res.ok) handleSnapshot((await res.json()) as LiveFeedSnapshot);
      } catch {
        /* tenta de novo no próximo ciclo */
      } finally {
        if (!stopped) pollTimer = setTimeout(() => void poll(), POLL_FALLBACK_MS);
      }
    };

    const startFallbackPolling = () => {
      if (stopped || pollTimer) return;
      source?.close();
      source = null;
      console.warn('[notificações] SSE indisponível — usando polling de 20s');
      void poll();
    };

    source = new EventSource('/api/chatwoot/stream');

    source.addEventListener('snapshot', (event) => {
      consecutiveErrors = 0;
      try {
        handleSnapshot(JSON.parse((event as MessageEvent<string>).data) as LiveFeedSnapshot);
      } catch {
        /* payload inválido — ignora */
      }
    });

    // O stream é encerrado de propósito a cada ~4,5 min (limite da função) e o
    // EventSource reconecta; por isso só caímos para polling após erros
    // consecutivos sem nenhum snapshot no meio.
    source.onerror = () => {
      consecutiveErrors += 1;
      if (consecutiveErrors >= 3) startFallbackPolling();
    };

    return () => {
      stopped = true;
      source?.close();
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [active, handleSnapshot]);

  if (toasts.length === 0) return null;

  // Topo da página, abaixo do header fixo (~60px) para não cobrir o título.
  return (
    <div className="fixed top-[4.5rem] left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[min(24rem,calc(100vw-1.5rem))]">
      {toasts.map((toast) => (
        <ToastCard
          key={toast.key}
          toast={toast}
          onDismiss={() => dismiss(toast.key)}
          onOpenSector={(slug) => {
            dismiss(toast.key);
            router.push(`/setor/${slug}`);
          }}
        />
      ))}
    </div>
  );
}

function ToastCard({
  toast,
  onDismiss,
  onOpenSector,
}: {
  toast: Toast;
  onDismiss: () => void;
  onOpenSector: (slug: string) => void;
}) {
  // Ref para o timer não reiniciar a cada render do pai.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  useEffect(() => {
    const timer = setTimeout(() => dismissRef.current(), TOAST_TTL_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      className="toast-in rounded-xl border border-orange-700/40 bg-gradient-to-r from-orange-600 to-amber-600
        text-white shadow-lg shadow-black/25 overflow-hidden"
    >
      <div className="flex items-start gap-2.5 p-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
          <MessageSquare size={14} />
        </span>

        <div className="min-w-0 flex-1">
          {toast.kind === 'digest' ? (
            <>
              <p className="text-sm font-bold text-white">{toast.count} novas mensagens</p>
              <p className="mt-0.5 text-xs font-bold text-orange-50">{toast.sectors.join(' · ')}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5">
                <span className="inline-block rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  {toast.sectorName}
                </span>
                <span className="text-[10px] font-bold uppercase text-orange-50/90">nova mensagem</span>
              </div>
              <p className="mt-1 truncate text-sm font-bold text-white">
                {toast.contactName}
                {toast.unitName && <span className="font-bold text-orange-50/90"> · {toast.unitName}</span>}
              </p>
              <p className="mt-0.5 line-clamp-2 text-xs font-bold text-orange-50">{toast.message}</p>
              <div className="mt-2 flex items-center gap-3">
                {toast.sectorSlug && (
                  <button
                    onClick={() => onOpenSector(toast.sectorSlug)}
                    className="text-xs font-bold text-white underline decoration-white/40 underline-offset-2 hover:decoration-white"
                  >
                    Abrir setor
                  </button>
                )}
                {toast.chatwootUrl && (
                  <a
                    href={toast.chatwootUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-bold text-orange-50/90 hover:text-white"
                  >
                    Chatwoot <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        <button
          onClick={onDismiss}
          aria-label="Fechar aviso"
          className="shrink-0 rounded-md p-1 text-orange-50/80 hover:bg-white/20 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
