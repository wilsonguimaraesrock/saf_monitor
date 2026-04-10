'use client';

import { useEffect, useState, useRef } from 'react';
import { X, ExternalLink, Clock, Calendar, AlertTriangle, Tag, Building2, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { TicketRow } from './TicketTable';

interface Update {
  id: string;
  author: string | null;
  content: string | null;
  is_ours: boolean;
  occurred_at: string | null;
}

interface TicketModalProps {
  ticket: TicketRow | null;
  onClose: () => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  dsa_joy:           'DSA JOY',
  myrock:            'MyRock',
  plataformas_aulas: 'Plataformas de Aulas',
  suporte_emails:    'Suporte Emails',
  outros:            'Outros',
  nao_classificado:  'Não classificado',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  aberto:                    { label: 'Aberto',             cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400' },
  em_andamento:              { label: 'Em andamento',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' },
  aguardando_nossa_resposta: { label: 'Aguardando nossa resp.', cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400' },
  aguardando_franquia:       { label: 'Aguardando franquia', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' },
  resolvido:                 { label: 'Resolvido',          cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' },
  cancelado:                 { label: 'Cancelado',          cls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400' },
};

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return raw;
  }
}

export function TicketModal({ ticket, onClose }: TicketModalProps) {
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Fecha com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trava scroll do body
  useEffect(() => {
    if (ticket) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [ticket]);

  // Busca atualizações quando o ticket muda
  useEffect(() => {
    if (!ticket) return;
    setUpdates([]);
    setLoading(true);
    fetch(`/api/tickets/${ticket.id}`)
      .then((r) => r.json())
      .then((data) => setUpdates(data.updates ?? []))
      .catch(() => setUpdates([]))
      .finally(() => setLoading(false));
  }, [ticket?.id]);

  // Scroll automático para o fim do chat
  useEffect(() => {
    if (updates.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updates]);

  if (!ticket) return null;

  const statusInfo = STATUS_LABELS[ticket.status] ?? { label: ticket.status, cls: 'bg-gray-100 text-gray-500' };
  const dfranquiasUrl = `https://app.dfranquias.com.br/saf/${ticket.external_id}/show`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl
            bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {ticket.number && (
                  <span className="text-xs font-mono text-gray-400 dark:text-slate-500">
                    #{ticket.number}
                  </span>
                )}
                <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', statusInfo.cls)}>
                  {statusInfo.label}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                  {CATEGORY_LABELS[ticket.priority_category] ?? ticket.priority_category}
                </span>
                {ticket.is_overdue && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                    <AlertTriangle size={10} />
                    {ticket.days_overdue}d atrasado
                  </span>
                )}
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 leading-snug">
                {ticket.title}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Meta info */}
          <div className="flex flex-wrap gap-x-5 gap-y-2 px-6 py-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
            {ticket.franchise && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
                <Building2 size={12} />
                {ticket.franchise}
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
              <Calendar size={12} />
              {ticket.days_open}d aberto
            </div>
            {ticket.awaiting_our_response && (
              <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <Clock size={12} />
                Aguardando nossa resposta
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
              <Tag size={12} />
              Score: <span className="font-bold">{ticket.priority_score}</span>
            </div>
          </div>

          {/* Chat */}
          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={13} className="text-gray-400 dark:text-slate-600" />
              <span className="text-xs font-semibold text-gray-400 dark:text-slate-600 uppercase tracking-wide">
                Histórico de mensagens
              </span>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <MessageSquare size={28} className="text-gray-200 dark:text-slate-700" />
                <p className="text-sm text-gray-400 dark:text-slate-600">
                  Nenhuma mensagem registrada para este ticket.
                </p>
                <p className="text-xs text-gray-300 dark:text-slate-700">
                  As mensagens são capturadas na próxima coleta do scraper.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {updates.map((u) => (
                  <div
                    key={u.id}
                    className={clsx(
                      'flex flex-col max-w-[80%] gap-1',
                      u.is_ours ? 'ml-auto items-end' : 'items-start'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {!u.is_ours && u.author && (
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500">
                          {u.author}
                        </span>
                      )}
                      {u.is_ours && (
                        <span className="text-xs font-medium text-blue-500 dark:text-blue-400">
                          Nossa equipe
                        </span>
                      )}
                    </div>
                    <div
                      className={clsx(
                        'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                        u.is_ours
                          ? 'bg-blue-600 text-white rounded-br-sm'
                          : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200 rounded-bl-sm'
                      )}
                    >
                      {u.content}
                    </div>
                    {u.occurred_at && (
                      <span className="text-xs text-gray-300 dark:text-slate-700 px-1">
                        {formatDate(u.occurred_at)}
                      </span>
                    )}
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
            <a
              href={dfranquiasUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl
                bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
            >
              <ExternalLink size={15} />
              Abrir no dfranquias
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
