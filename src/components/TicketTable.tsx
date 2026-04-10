'use client';

import { useState } from 'react';
import { clsx } from 'clsx';
import { TicketModal } from './TicketModal';

export interface TicketRow {
  id: string;
  external_id: string;
  number?: string;
  title: string;
  status: string;
  priority_category: string;
  priority_score: number;
  franchise?: string;
  days_open: number;
  days_overdue: number;
  days_waiting_us: number;
  is_overdue: boolean;
  awaiting_our_response: boolean;
  opened_at?: string;
}

interface TicketTableProps {
  tickets: TicketRow[];
  title: string;
  emptyMessage?: string;
  highlightOverdue?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  dsa_joy:           'DSA JOY',
  myrock:            'MyRock',
  plataformas_aulas: 'Plataformas',
  suporte_emails:    'Emails',
  outros:            'Outros',
  nao_classificado:  '—',
};

const CATEGORY_COLORS: Record<string, string> = {
  dsa_joy:           'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300',
  myrock:            'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  plataformas_aulas: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  suporte_emails:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  outros:            'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
  nao_classificado:  'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  aberto:                    { label: 'Aberto',           cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300' },
  em_andamento:              { label: 'Em andamento',     cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  aguardando_nossa_resposta: { label: 'Aguard. nós',      cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' },
  aguardando_franquia:       { label: 'Aguard. franquia', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  resolvido:                 { label: 'Resolvido',        cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300' },
  cancelado:                 { label: 'Cancelado',        cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' },
};

function ScoreBadge({ score }: { score: number }) {
  const cls =
    score >= 70 ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300' :
    score >= 40 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300' :
                  'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400';
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-sm font-bold tabular-nums', cls)}>
      {score}
    </span>
  );
}

export function TicketTable({ tickets, title, emptyMessage = 'Nenhum ticket', highlightOverdue }: TicketTableProps) {
  const [selected, setSelected] = useState<TicketRow | null>(null);

  return (
    <>
    <TicketModal ticket={selected} onClose={() => setSelected(null)} />
    <div className="card overflow-hidden p-0">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800">
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-200 uppercase tracking-wide">
          {title}
        </h2>
      </div>

      {tickets.length === 0 ? (
        <p className="px-5 py-10 text-center text-base text-gray-400 dark:text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Título</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Categoria</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Score</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Dias</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Atraso</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Franquia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
              {tickets.map((t, i) => {
                const isOverdueRow = highlightOverdue && t.is_overdue;
                const statusInfo = STATUS_LABELS[t.status] ?? { label: t.status, cls: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300' };
                return (
                  <tr
                    key={t.id}
                    onClick={() => setSelected(t)}
                    className={clsx(
                      'transition-colors cursor-pointer',
                      isOverdueRow
                        ? 'bg-red-50/50 dark:bg-red-950/10 hover:bg-red-50 dark:hover:bg-red-950/20'
                        : 'hover:bg-gray-50 dark:hover:bg-slate-800/50'
                    )}
                  >
                    <td className="px-4 py-3 text-gray-400 dark:text-slate-600 text-sm tabular-nums">{i + 1}</td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium line-clamp-2 text-base text-gray-800 dark:text-slate-100">
                        {t.number
                          ? <span className="text-gray-400 dark:text-slate-400 font-normal mr-1.5 text-sm">#{t.number}</span>
                          : ''}
                        {t.title}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium', statusInfo.cls)}>
                        {statusInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-sm font-medium', CATEGORY_COLORS[t.priority_category] ?? 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300')}>
                        {CATEGORY_LABELS[t.priority_category] ?? t.priority_category}
                      </span>
                    </td>
                    <td className="px-4 py-3"><ScoreBadge score={t.priority_score} /></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-slate-300 tabular-nums">{t.days_open}d</td>
                    <td className="px-4 py-3 tabular-nums">
                      {t.is_overdue
                        ? <span className="text-red-600 dark:text-red-400 font-semibold">{t.days_overdue}d</span>
                        : <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-sm truncate max-w-[120px]">
                      {t.franchise ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
    </>
  );
}
