'use client';

import { useEffect, useState, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, MessageSquare, Star, UserX, CheckCircle2, Clock, Loader2, Search } from 'lucide-react';
import { clsx } from 'clsx';
import type { BacklogConversation } from '@/app/api/chatwoot/backlog/route';
import { ChatwootConversationModal } from './ChatwootConversationModal';
import type { ChatwootConversation } from '@/integrations/chatwoot';

interface Props {
  inboxId: number | null;
  inboxName?: string;
  onClose: () => void;
}

const LABEL_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
];
function labelColor(label: string) {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[h % LABEL_COLORS.length];
}

const STATUS_MAP: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  resolved: {
    label: 'Resolvido',
    cls:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400',
    icon:  <CheckCircle2 size={11} />,
  },
  open: {
    label: 'Aberto',
    cls:   'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400',
    icon:  <MessageSquare size={11} />,
  },
  pending: {
    label: 'Pendente',
    cls:   'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
    icon:  <Clock size={11} />,
  },
  snoozed: {
    label: 'Pausado',
    cls:   'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400',
    icon:  <Clock size={11} />,
  },
};

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  const stars = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-0.5" title={`Nota ${rating}`}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={12}
          className={s <= stars ? 'text-amber-400 fill-amber-400' : 'text-gray-200 dark:text-slate-700'}
        />
      ))}
      <span className="ml-1 text-xs text-gray-500 dark:text-slate-400">{rating}</span>
    </span>
  );
}

function formatDate(ts: number) {
  return new Date(ts * 1000).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
}

// Minimal ChatwootConversation for the modal
function toModalConversation(c: BacklogConversation): ChatwootConversation {
  return {
    id: c.id,
    contactName:    c.contactName,
    contactPhone:   c.contactPhone,
    unitName:       c.unidade,
    labels:         c.labels,
    assigneeId:     null,
    assigneeName:   c.assigneeName,
    lastMessage:    '',
    waitingSinceSec: 0,
    chatwootUrl:    c.chatwootUrl,
  };
}

export function ChatwootBacklogModal({ inboxId, inboxName, onClose }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const [conversations, setConversations] = useState<BacklogConversation[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [selected, setSelected] = useState<ChatwootConversation | null>(null);

  const [filterEscola, setFilterEscola]   = useState('');
  const [filterDepto, setFilterDepto]     = useState('');
  const [filterAssunto, setFilterAssunto] = useState('');

  const fetchBacklog = useCallback(async () => {
    if (!inboxId) return;
    setLoading(true);
    setError('');
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const res = await fetch(`/api/chatwoot/backlog?inboxId=${inboxId}&month=${monthStr}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [inboxId, year, month]);

  useEffect(() => { void fetchBacklog(); }, [fetchBacklog]);

  // Escape closes
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !selected) onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, selected]);

  // Body scroll lock
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const n = new Date();
    if (year > n.getFullYear() || (year === n.getFullYear() && month >= n.getMonth())) return;
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  // Client-side filtering
  const filtered = conversations.filter((c) => {
    const esc  = filterEscola.toLowerCase();
    const dep  = filterDepto.toLowerCase();
    const ass  = filterAssunto.toLowerCase();
    if (esc && !c.unidade.toLowerCase().includes(esc)) return false;
    if (dep && !c.departamento.toLowerCase().includes(dep) && !c.subdepartamento.toLowerCase().includes(dep)) return false;
    if (ass && !c.assunto.toLowerCase().includes(ass)) return false;
    return true;
  });
  const hasFilter = filterEscola || filterDepto || filterAssunto;

  // Stats
  const total    = filtered.length;
  const resolved = filtered.filter((c) => c.status === 'resolved').length;
  const withCsat = filtered.filter((c) => c.csatRating !== null);
  const csatAvg  = withCsat.length
    ? Math.round((withCsat.reduce((s, c) => s + (c.csatRating ?? 0), 0) / withCsat.length) * 10) / 10
    : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-7xl max-h-[92vh] flex flex-col rounded-2xl shadow-2xl
            bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-gray-800 dark:text-slate-100">
                Backlog — {inboxName ?? 'WhatsApp'}
              </h2>

              {/* Month navigation */}
              <div className="flex items-center gap-1 ml-2">
                <button
                  onClick={prevMonth}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-sm font-medium text-gray-600 dark:text-slate-300 min-w-[140px] text-center capitalize">
                  {monthLabel(year, month)}
                </span>
                <button
                  onClick={nextMonth}
                  disabled={isCurrentMonth}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Stats bar */}
          {!loading && !error && conversations.length > 0 && (
            <div className="flex items-center gap-6 px-6 py-3 border-b border-gray-100 dark:border-slate-800 shrink-0
              bg-gray-50 dark:bg-slate-950/40 text-sm">
              <span className="text-gray-500 dark:text-slate-400">
                <span className="font-semibold text-gray-800 dark:text-slate-100">{total}</span>
                {hasFilter && <span className="text-gray-400"> / {conversations.length}</span>}
                {' '}conversas
              </span>
              <span className="text-gray-500 dark:text-slate-400">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{resolved}</span> resolvidas
              </span>
              <span className="text-gray-500 dark:text-slate-400">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{total - resolved}</span> em aberto
              </span>
              {csatAvg !== null && (
                <span className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400">
                  CSAT médio:
                  <StarRating rating={csatAvg} />
                  <span className="text-xs text-gray-400">({withCsat.length} avaliações)</span>
                </span>
              )}
            </div>
          )}

          {/* Filters */}
          {!loading && !error && conversations.length > 0 && (
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
              <Search size={13} className="text-gray-400 dark:text-slate-500 shrink-0" />
              <input
                type="text"
                placeholder="Escola / Unidade"
                value={filterEscola}
                onChange={(e) => setFilterEscola(e.target.value)}
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <input
                type="text"
                placeholder="Departamento"
                value={filterDepto}
                onChange={(e) => setFilterDepto(e.target.value)}
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <input
                type="text"
                placeholder="Assunto"
                value={filterAssunto}
                onChange={(e) => setFilterAssunto(e.target.value)}
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              {hasFilter && (
                <button
                  onClick={() => { setFilterEscola(''); setFilterDepto(''); setFilterAssunto(''); }}
                  className="text-xs px-2 py-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-300
                    hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
                >
                  Limpar
                </button>
              )}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-gray-400 dark:text-slate-500">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Carregando conversas…</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
                <p className="text-sm text-red-500">{error}</p>
                <button
                  onClick={fetchBacklog}
                  className="mt-2 px-4 py-2 rounded-lg text-sm bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors text-gray-600 dark:text-slate-300"
                >
                  Tentar novamente
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <MessageSquare size={32} className="text-gray-200 dark:text-slate-700" />
                <p className="text-sm text-gray-400 dark:text-slate-500">Nenhuma conversa encontrada neste período.</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center">
                <Search size={32} className="text-gray-200 dark:text-slate-700" />
                <p className="text-sm text-gray-400 dark:text-slate-500">Nenhuma conversa corresponde aos filtros.</p>
                <button
                  onClick={() => { setFilterEscola(''); setFilterDepto(''); setFilterAssunto(''); }}
                  className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
                >
                  Limpar filtros
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/80 backdrop-blur-sm">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-8">#</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Contato</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Escola</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Departamento</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Assunto</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Agente</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">CSAT</th>
                    <th className="px-3 py-3 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {filtered.map((c, i) => {
                    const statusInfo = STATUS_MAP[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-500', icon: null };
                    return (
                      <tr
                        key={c.id}
                        onClick={() => setSelected(toModalConversation(c))}
                        className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                      >
                        <td className="px-3 py-3 text-gray-400 dark:text-slate-600 tabular-nums">{i + 1}</td>

                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-800 dark:text-slate-100 whitespace-nowrap">{c.contactName}</p>
                          {c.contactPhone && (
                            <p className="text-xs text-gray-400 dark:text-slate-500">{c.contactPhone}</p>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {c.unidade
                            ? <span className="text-xs text-gray-600 dark:text-slate-300">{c.unidade}</span>
                            : <span className="text-gray-300 dark:text-slate-700">—</span>
                          }
                        </td>

                        <td className="px-3 py-3">
                          {c.departamento ? (
                            <div>
                              <p className="text-xs text-gray-600 dark:text-slate-300">{c.departamento}</p>
                              {c.subdepartamento && (
                                <p className="text-xs text-gray-400 dark:text-slate-500">{c.subdepartamento}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-700">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3 max-w-[180px]">
                          {c.assunto
                            ? <span className="text-xs text-gray-600 dark:text-slate-300 line-clamp-2">{c.assunto}</span>
                            : <span className="text-gray-300 dark:text-slate-700">—</span>
                          }
                        </td>

                        <td className="px-3 py-3">
                          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium', statusInfo.cls)}>
                            {statusInfo.icon}
                            {statusInfo.label}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          {c.assigneeName
                            ? <span className="text-xs text-gray-600 dark:text-slate-300 whitespace-nowrap">{c.assigneeName}</span>
                            : (
                              <span className="inline-flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                                <UserX size={12} /> Não atribuído
                              </span>
                            )
                          }
                        </td>

                        <td className="px-3 py-3 text-gray-500 dark:text-slate-400 tabular-nums whitespace-nowrap text-xs">
                          {formatDate(c.createdAt)}
                        </td>

                        <td className="px-3 py-3">
                          <StarRating rating={c.csatRating} />
                          {c.csatFeedback && (
                            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 max-w-[120px] truncate" title={c.csatFeedback}>
                              {c.csatFeedback}
                            </p>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelected(toModalConversation(c)); }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
                              bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300
                              hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                          >
                            <MessageSquare size={12} />
                            Abrir
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* Conversation modal on top */}
      <ChatwootConversationModal
        conversation={selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
