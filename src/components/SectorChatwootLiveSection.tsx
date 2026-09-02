'use client';

import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { History, MessageSquarePlus } from 'lucide-react';
import type { ChatwootConversation, ChatwootPanelData } from '@/integrations/chatwoot';
import { ChatwootPanel } from '@/components/ChatwootPanel';
import { ChatwootConversationTable } from '@/components/ChatwootConversationTable';
import { ChatwootBacklogModal } from '@/components/ChatwootBacklogModal';
import { ChatwootBreakdownCard } from '@/components/ChatwootBreakdownCard';
import { IniciarConversaModal } from '@/components/IniciarConversaModal';
import { ChatwootConversationModal } from '@/components/ChatwootConversationModal';

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
  /** Mês selecionado na página, "YYYY-MM" */
  month: string;
  isCurrentMonth: boolean;
  /** Nome do setor, para o cabeçalho e o pré-preenchimento do departamento */
  sectorName: string;
  /** Nome do departamento no cadastro do chatbot, quando difere do nome do setor */
  chatbotDepartment?: string;
}

export function SectorChatwootLiveSection({
  sectorSlug,
  inboxName,
  teamId,
  inboxId,
  initialPanelData,
  initialOpenConversations,
  initialRefreshedAt,
  month,
  isCurrentMonth,
  sectorName,
  chatbotDepartment,
}: Props) {
  const [panelData, setPanelData] = useState(initialPanelData);
  const [openConversations, setOpenConversations] = useState(initialOpenConversations);
  const [refreshedAt, setRefreshedAt] = useState(initialRefreshedAt);
  const [isPolling, setIsPolling] = useState(false);
  const [hasPollingError, setHasPollingError] = useState(false);
  const [backlogOpen, setBacklogOpen] = useState(false);
  const [iniciarOpen, setIniciarOpen] = useState(false);
  // Conversa recém-iniciada: abre direto, sem esperar o próximo poll
  const [conversaIniciada, setConversaIniciada] = useState<ChatwootConversation | null>(null);

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
        const res = await fetch(
          `/api/chatwoot/live?sector=${encodeURIComponent(sectorSlug)}&month=${encodeURIComponent(month)}`,
          {
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
          // `getChatwootPanelData` devolve null quando qualquer uma das cinco
          // chamadas ao Chatwoot falha (o CSAT é a mais instável). Sobrescrever
          // com null apagava o painel inteiro por causa de uma falha passageira;
          // preservar o último dado bom e sinalizar o erro é mais honesto.
          if (data.panelData) {
            setPanelData(data.panelData);
            setHasPollingError(false);
          } else {
            setHasPollingError(true);
          }
          setOpenConversations(data.openConversations);
          setRefreshedAt(data.refreshedAt);
        });
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return;
        console.error(err);
        setHasPollingError(true);
      } finally {
        if (cancelled) return;
        setIsPolling(false);
        // Mês encerrado não muda mais: uma busca basta, sem polling de 30s.
        if (isCurrentMonth) scheduleRefresh();
      }
    };

    const handleWindowFocus = () => {
      if (!isCurrentMonth) return;
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
  }, [sectorSlug, month, isCurrentMonth, initialOpenConversations, initialPanelData, initialRefreshedAt]);

  return (
    <div className="space-y-6">
      {backlogOpen && (
        <ChatwootBacklogModal
          // O inbox vem da configuração do setor, não do painel vivo. Ligado ao
          // `panelData`, um único poll que falhasse (o painel virava null)
          // deixava o backlog com inboxId null — e ele mostrava "nenhuma
          // conversa" em vez de buscar, sem erro nenhum na tela.
          inboxId={inboxId}
          teamId={teamId}
          inboxName={inboxName}
          initialMonth={month}
          onClose={() => setBacklogOpen(false)}
        />
      )}

      {iniciarOpen && (
        <IniciarConversaModal
          sectorSlug={sectorSlug}
          sectorName={sectorName}
          chatbotDepartment={chatbotDepartment}
          onClose={() => setIniciarOpen(false)}
          onStarted={({ conversationId, conversation }) => {
            setIniciarOpen(false);
            setConversaIniciada(
              (conversation as ChatwootConversation | undefined) ?? {
                // 409: só temos o id, o resto o próprio modal busca pela conversa
                id: conversationId,
                contactName: 'Atendimento em andamento',
                contactPhone: '',
                unitName: '',
                labels: [],
                assigneeId: null,
                assigneeName: null,
                lastMessage: '',
                waitingSinceSec: 0,
                chatwootUrl: '',
              }
            );
          }}
        />
      )}

      {conversaIniciada && (
        <ChatwootConversationModal
          conversation={conversaIniciada}
          onClose={() => setConversaIniciada(null)}
        />
      )}

      <div className="flex items-center justify-between gap-3 text-xs text-gray-400 dark:text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span
            className={`h-2 w-2 rounded-full ${
              !isCurrentMonth
                ? 'bg-slate-400'
                : hasPollingError
                  ? 'bg-amber-500'
                  : isPolling
                    ? 'bg-emerald-500 animate-pulse'
                    : 'bg-emerald-500'
            }`}
          />
          {!isCurrentMonth
            ? `Chatwoot — histórico de ${month}`
            : hasPollingError ? 'Chatwoot ao vivo em reconexao' : 'Chatwoot ao vivo'}
        </span>
        <div className="flex items-center gap-3">
          {/* Conversa ativa só faz sentido no presente: em mês fechado o botão sai */}
          {isCurrentMonth && (
            <button
              onClick={() => setIniciarOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
                bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm"
            >
              <MessageSquarePlus size={13} />
              Iniciar conversa
            </button>
          )}
          <button
            onClick={() => setBacklogOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300
              hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-gray-200 dark:border-slate-700"
          >
            <History size={13} />
            Backlog do mês
          </button>
          <span>
            {isCurrentMonth
              ? `Atualizado as ${refreshedLabel} · intervalo de 30s`
              : 'Dados do mês fechado — abra o backlog para ver as conversas'}
          </span>
        </div>
      </div>

      {panelData && <ChatwootPanel data={panelData} />}

      {isCurrentMonth && (
        <ChatwootConversationTable
          conversations={openConversations}
          title={`Conversas Abertas — WhatsApp ${inboxName}`}
          onBacklog={() => setBacklogOpen(true)}
        />
      )}

      <ChatwootBreakdownCard teamId={teamId} inboxId={inboxId} month={month} />
    </div>
  );
}
