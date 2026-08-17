'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  X, ChevronLeft, ChevronRight, Search, Loader2, MessageSquare, Star, ExternalLink,
} from 'lucide-react';
import type { GlobalBacklogConversation } from '@/app/api/chatwoot/global-backlog/route';

const CW_SECTOR_NAMES = [
  { slug: 'pd-i',           name: 'PD&I' },
  { slug: 'administrativo', name: 'Administrativo' },
  { slug: 'logistica',      name: 'Logística' },
  { slug: 'implantacao',    name: 'Implantação' },
  { slug: 'pedagogico',     name: 'Pedagógico' },
  { slug: 'comercial',      name: 'Comercial' },
  { slug: 'mkt',            name: 'MKT' },
  { slug: 'treinamentos',   name: 'Treinamentos' },
  { slug: 'financeiro',     name: 'Financeiro' },
];

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  resolved: { label: 'Resolvido', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  open:     { label: 'Aberta',    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  pending:  { label: 'Pendente',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  snoozed:  { label: 'Adiada',    cls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400' },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          size={11}
          className={s <= Math.round(rating) ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-slate-600'}
        />
      ))}
      <span className="ml-1 text-xs font-semibold text-gray-700 dark:text-slate-300">{rating}</span>
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

interface CsatStat { avg: number | null; total: number }

interface CsatMonth {
  geral: CsatStat;
  porSetor: Record<string, CsatStat>;
}

interface Props {
  onClose: () => void;
}

export function GlobalChatwootBacklogModal({ onClose }: Props) {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const [conversations, setConversations] = useState<GlobalBacklogConversation[]>([]);
  const [csatMonth, setCsatMonth] = useState<CsatMonth | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const [filterSetor,   setFilterSetor]   = useState('');
  const [filterEscola,  setFilterEscola]  = useState('');
  const [filterDepto,   setFilterDepto]   = useState('');
  const [filterAssunto, setFilterAssunto] = useState('');

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
      const res = await fetch(`/api/chatwoot/global-backlog?month=${monthStr}`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Erro ${res.status}`);
      }
      const data = await res.json();
      setConversations(data.conversations ?? []);
      setCsatMonth(data.csatMonth ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { void fetch_(); }, [fetch_]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function prevMonth() {
    if (month === 0) { setYear((y) => y - 1); setMonth(11); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth())) return;
    if (month === 11) { setYear((y) => y + 1); setMonth(0); }
    else setMonth((m) => m + 1);
  }
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const filtered = conversations.filter((c) => {
    if (filterSetor   && c.sectorSlug !== filterSetor) return false;
    if (filterEscola  && !c.unidade.toLowerCase().includes(filterEscola.toLowerCase())) return false;
    if (filterDepto   && !c.departamento.toLowerCase().includes(filterDepto.toLowerCase())
                      && !c.subdepartamento.toLowerCase().includes(filterDepto.toLowerCase())) return false;
    if (filterAssunto && !c.assunto.toLowerCase().includes(filterAssunto.toLowerCase())) return false;
    return true;
  });

  const hasFilter = filterSetor || filterEscola || filterDepto || filterAssunto;
  const resolved  = filtered.filter((c) => c.status === 'resolved').length;

  // CSAT do mês conta pela data da AVALIAÇÃO, não pela data de abertura da
  // conversa — inclui conversas abertas em meses anteriores e avaliadas neste.
  // Os filtros de texto (escola/departamento/assunto) vivem só nas conversas
  // listadas, então nesses casos o cálculo volta a ser sobre as linhas visíveis.
  const textFilter = Boolean(filterEscola || filterDepto || filterAssunto);
  const rowsWithCsat = filtered.filter((c) => c.csatRating !== null);
  const monthCsat = filterSetor ? csatMonth?.porSetor?.[filterSetor] : csatMonth?.geral;

  const csat: CsatStat = textFilter || !monthCsat
    ? {
        total: rowsWithCsat.length,
        avg: rowsWithCsat.length
          ? Math.round(rowsWithCsat.reduce((s, c) => s + (c.csatRating ?? 0), 0) / rowsWithCsat.length * 10) / 10
          : null,
      }
    : monthCsat;

  function clearFilters() {
    setFilterSetor(''); setFilterEscola(''); setFilterDepto(''); setFilterAssunto('');
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-[96vw] max-h-[92vh] flex flex-col rounded-2xl shadow-2xl
            bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-3">
              <MessageSquare size={18} className="text-green-500 shrink-0" />
              <h2 className="text-base font-semibold text-gray-800 dark:text-slate-100">
                Conversas WhatsApp — Todos os Setores
              </h2>

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
              bg-gray-50 dark:bg-slate-950/40 text-sm flex-wrap">
              <span className="text-gray-500 dark:text-slate-400">
                <span className="font-semibold text-gray-800 dark:text-slate-100">{filtered.length}</span>
                {hasFilter && <span className="text-gray-400"> / {conversations.length}</span>}
                {' '}conversas
              </span>
              <span className="text-gray-500 dark:text-slate-400">
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">{resolved}</span> resolvidas
              </span>
              <span className="text-gray-500 dark:text-slate-400">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{filtered.length - resolved}</span> em aberto
              </span>
              {csat.avg !== null && (
                <span
                  className="flex items-center gap-1.5 text-gray-500 dark:text-slate-400"
                  title={textFilter
                    ? 'Média das conversas listadas que receberam avaliação'
                    : 'Média de todas as avaliações respondidas no mês, inclusive de conversas abertas em meses anteriores'}
                >
                  CSAT médio: <StarRating rating={csat.avg} />
                  <span className="text-xs text-gray-400">
                    ({csat.total} {csat.total === 1 ? 'avaliação' : 'avaliações'}
                    {!textFilter && ' no mês'})
                  </span>
                </span>
              )}
            </div>
          )}

          {/* Filters */}
          {!loading && !error && conversations.length > 0 && (
            <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 dark:border-slate-800 shrink-0 flex-wrap">
              <Search size={13} className="text-gray-400 dark:text-slate-500 shrink-0" />

              {/* Setor select */}
              <select
                value={filterSetor}
                onChange={(e) => setFilterSetor(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              >
                <option value="">Todos os setores</option>
                {CW_SECTOR_NAMES.map((s) => (
                  <option key={s.slug} value={s.slug}>{s.name}</option>
                ))}
              </select>

              <input
                type="text"
                placeholder="Escola / Unidade"
                value={filterEscola}
                onChange={(e) => setFilterEscola(e.target.value)}
                className="flex-1 min-w-[120px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <input
                type="text"
                placeholder="Departamento"
                value={filterDepto}
                onChange={(e) => setFilterDepto(e.target.value)}
                className="flex-1 min-w-[120px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <input
                type="text"
                placeholder="Assunto"
                value={filterAssunto}
                onChange={(e) => setFilterAssunto(e.target.value)}
                className="flex-1 min-w-[100px] text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700
                  bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-slate-300
                  placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              {hasFilter && (
                <button
                  onClick={clearFilters}
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
              <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400 dark:text-slate-500">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-sm">Carregando conversas de todos os setores…</span>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2 text-center px-6">
                <p className="text-sm text-red-500">{error}</p>
                <button
                  onClick={fetch_}
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
                <button onClick={clearFilters} className="mt-1 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors">
                  Limpar filtros
                </button>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/80 backdrop-blur-sm">
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-8">#</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-36">Contato</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Escola</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Setor</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Departamento</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Assunto</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Agente</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Data</th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">CSAT</th>
                    <th className="px-3 py-3 w-12" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
                  {filtered.map((c, i) => {
                    const statusInfo = STATUS_MAP[c.status] ?? { label: c.status, cls: 'bg-gray-100 text-gray-500' };
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="px-3 py-3 text-gray-400 dark:text-slate-600 tabular-nums">{i + 1}</td>

                        <td className="px-3 py-3 max-w-[9rem]">
                          <p className="font-medium text-gray-800 dark:text-slate-100 truncate" title={c.contactName}>{c.contactName}</p>
                          {c.contactPhone && (
                            <p className="text-xs text-gray-400 dark:text-slate-500 truncate" title={c.contactPhone}>{c.contactPhone}</p>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {c.unidade
                            ? <span className="text-xs text-gray-600 dark:text-slate-300">{c.unidade}</span>
                            : <span className="text-gray-300 dark:text-slate-700">—</span>
                          }
                        </td>

                        <td className="px-3 py-3">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 whitespace-nowrap">
                            {c.sectorName}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          {c.subdepartamento ? (
                            <div>
                              <p className="text-xs text-gray-700 dark:text-slate-300">{c.subdepartamento}</p>
                              {c.departamento && c.departamento !== c.subdepartamento && (
                                <p className="text-xs text-gray-400 dark:text-slate-500">{c.departamento}</p>
                              )}
                            </div>
                          ) : c.departamento ? (
                            <span className="text-xs text-gray-700 dark:text-slate-300">{c.departamento}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-slate-700">—</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          {c.assunto
                            ? <span className="text-xs text-gray-600 dark:text-slate-300">{c.assunto}</span>
                            : <span className="text-gray-300 dark:text-slate-700">—</span>
                          }
                        </td>

                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                            {statusInfo.label}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-xs text-gray-600 dark:text-slate-400 whitespace-nowrap">
                          {c.assigneeName ?? <span className="text-gray-300 dark:text-slate-700">—</span>}
                        </td>

                        <td className="px-3 py-3 text-xs text-gray-500 dark:text-slate-500 whitespace-nowrap tabular-nums">
                          {formatDate(c.createdAt)}
                        </td>

                        <td className="px-3 py-3">
                          {c.csatRating !== null
                            ? <StarRating rating={c.csatRating} />
                            : <span className="text-gray-300 dark:text-slate-700 text-xs">—</span>
                          }
                        </td>

                        <td className="px-3 py-3">
                          <a
                            href={c.chatwootUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg
                              bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400
                              hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                          >
                            <ExternalLink size={11} />
                            Abrir
                          </a>
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
    </>
  );
}
