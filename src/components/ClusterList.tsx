'use client';

import { clsx } from 'clsx';

interface Cluster {
  id: string;
  label: string;
  keywords: string[];
  ticket_count: number;
  is_spike: boolean;
}

interface ClusterListProps {
  clusters: Cluster[];
}

export function ClusterList({ clusters }: ClusterListProps) {
  const max = Math.max(...clusters.map((c) => c.ticket_count), 1);

  return (
    <div className="card">
      <h2 className="text-base font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-5">
        Agrupamentos por Assunto
      </h2>

      {clusters.length === 0 ? (
        <p className="text-base text-gray-400 dark:text-slate-500 text-center py-8">
          Sem dados de clustering
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {clusters.map((c) => {
            const pct = (c.ticket_count / max) * 100;
            return (
              <div
                key={c.id}
                className={clsx(
                  'rounded-xl border p-4',
                  c.is_spike
                    ? 'border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-950/10'
                    : 'border-gray-100 bg-gray-50 dark:border-slate-800 dark:bg-slate-800/30'
                )}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.is_spike && (
                      <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-400 uppercase tracking-wide">
                        Spike
                      </span>
                    )}
                    <span className="text-base font-semibold text-gray-700 dark:text-slate-200 truncate capitalize">
                      {c.label}
                    </span>
                  </div>
                  <span className={clsx(
                    'shrink-0 text-xl font-bold tabular-nums',
                    c.is_spike ? 'text-red-600 dark:text-red-400' : 'text-gray-800 dark:text-slate-100'
                  )}>
                    {c.ticket_count}
                  </span>
                </div>

                <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-1.5 mb-2">
                  <div
                    className={clsx('h-1.5 rounded-full transition-all', c.is_spike ? 'bg-red-500' : 'bg-blue-500')}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                {c.keywords.length > 0 && (
                  <p className="text-sm text-gray-500 dark:text-slate-400 truncate">
                    {c.keywords.slice(0, 5).join(' · ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
