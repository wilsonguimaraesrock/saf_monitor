'use client';

import { useEffect, useState } from 'react';
import { Star, Layers, Tag, User, Loader2 } from 'lucide-react';
import type { WhatsAppBreakdownData } from '@/app/api/chatwoot/breakdown/route';

interface Props {
  teamId: number;
  inboxId: number;
}

type Tab = 'subdep' | 'assunto' | 'agente';

function CsatBadge({ avg, total }: { avg: number | null; total: number }) {
  if (avg === null) return null;
  const color =
    avg >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
    avg >= 3 ? 'text-amber-600 dark:text-amber-400' :
               'text-red-600 dark:text-red-400';
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums ${color}`}>
      <Star size={10} className="fill-current" />
      {avg}
      <span className="font-normal opacity-60 ml-0.5">({total})</span>
    </span>
  );
}

function Bar({ count, max }: { count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
      <div
        className="h-full rounded-full bg-orange-400 dark:bg-orange-500 transition-all duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function ChatwootBreakdownCard({ teamId, inboxId }: Props) {
  const [data, setData]     = useState<WhatsAppBreakdownData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]       = useState<Tab>('subdep');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/chatwoot/breakdown?teamId=${teamId}&inboxId=${inboxId}`)
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [teamId, inboxId]);

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'subdep',  label: 'Subdepartamento', icon: <Layers size={13} /> },
    { id: 'assunto', label: 'Assunto',          icon: <Tag    size={13} /> },
    { id: 'agente',  label: 'Atendentes',       icon: <User   size={13} /> },
  ];

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-700 dark:text-slate-200 uppercase tracking-wide">
            Atendimentos WhatsApp — Breakdown
          </h2>
          {data && (
            <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5">
              {data.total} conversa{data.total !== 1 ? 's' : ''} em {data.period}
            </p>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              tab === t.id
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400 dark:text-slate-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando…
          </div>
        ) : !data || data.total === 0 ? (
          <p className="text-center py-8 text-sm text-gray-400 dark:text-slate-500">
            Nenhuma conversa no mês
          </p>
        ) : (
          <>
            {/* Subdepartamento */}
            {tab === 'subdep' && (
              <div className="space-y-3">
                {data.bySubdepartamento.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">Sem dados</p>
                ) : (() => {
                  const max = data.bySubdepartamento[0].count;
                  return data.bySubdepartamento.map((row) => (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700 dark:text-slate-200 truncate max-w-[240px]" title={row.name}>
                          {row.name}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {row.resolved} res.
                          </span>
                          <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-100 w-6 text-right">
                            {row.count}
                          </span>
                        </div>
                      </div>
                      <Bar count={row.count} max={max} />
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Assunto */}
            {tab === 'assunto' && (
              <div className="space-y-3">
                {data.byAssunto.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">Sem dados</p>
                ) : (() => {
                  const max = data.byAssunto[0].count;
                  return data.byAssunto.map((row) => (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700 dark:text-slate-200 truncate max-w-[260px]" title={row.name}>
                          {row.name}
                        </span>
                        <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-100 w-6 text-right shrink-0">
                          {row.count}
                        </span>
                      </div>
                      <Bar count={row.count} max={max} />
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* Atendentes */}
            {tab === 'agente' && (
              <div className="space-y-3">
                {data.byAgent.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-slate-500">Sem dados</p>
                ) : (() => {
                  const max = data.byAgent[0].count;
                  return data.byAgent.map((row) => (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm text-gray-700 dark:text-slate-200 truncate max-w-[200px]" title={row.name}>
                          {row.name}
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          <CsatBadge avg={row.avgCsat} total={row.csatCount} />
                          <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-slate-100 w-6 text-right">
                            {row.count}
                          </span>
                        </div>
                      </div>
                      <Bar count={row.count} max={max} />
                    </div>
                  ));
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
