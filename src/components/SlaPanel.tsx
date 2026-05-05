import { ShieldCheck, TriangleAlert, Timer, CalendarX, Reply } from 'lucide-react';
import type { SectorSlaStats } from '@/repository/sectors';

interface Props {
  sla: SectorSlaStats;
}

function formatHours(hours: number): string {
  if (hours <= 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}min`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function SlaPanel({ sla }: Props) {
  const rateColor =
    sla.slaRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
    sla.slaRate >= 50 ? 'text-amber-600 dark:text-amber-400' :
                        'text-red-600 dark:text-red-400';

  const rateBg =
    sla.slaRate >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' :
    sla.slaRate >= 50 ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' :
                        'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';

  const cols = 'grid-cols-2 sm:grid-cols-5';

  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
        Indicadores de SLA
      </p>

      <div className={`grid ${cols} gap-3`}>

        {/* % no SLA */}
        <div className={`h-full rounded-xl border p-4 flex flex-col gap-1 ${rateBg}`}>
          <div className="flex items-center gap-1.5">
            <ShieldCheck size={14} className={rateColor} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Cumprimento SLA</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${rateColor}`}>
            {sla.slaRate}%
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">resolvidos no prazo (90d)</span>
        </div>

        {/* Em risco */}
        <div className={`h-full rounded-xl border p-4 flex flex-col gap-1 ${
          sla.atRisk > 0
            ? 'bg-orange-50 dark:bg-orange-950/40 border-orange-200 dark:border-orange-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <TriangleAlert size={14} className={sla.atRisk > 0 ? 'text-orange-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Em risco</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            sla.atRisk > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {sla.atRisk}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">vencem em até 48h</span>
        </div>

        {/* Tempo médio de resolução */}
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <Timer size={14} className="text-blue-500" />
            <span className="text-xs text-gray-500 dark:text-slate-400">Tempo médio resolução</span>
          </div>
          <span className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {sla.avgResolutionDays > 0 ? `${sla.avgResolutionDays}d` : '—'}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">últimos 90 dias</span>
        </div>

        {/* Tempo médio 1ª resposta SAF */}
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <Reply size={14} className="text-violet-500" />
            <span className="text-xs text-gray-500 dark:text-slate-400">1ª resposta SAF</span>
          </div>
          <span className="text-2xl font-bold tabular-nums text-violet-600 dark:text-violet-400">
            {formatHours(sla.avgFirstResponseHours)}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">tempo médio até responder</span>
        </div>

        {/* Sem prazo */}
        <div className={`h-full rounded-xl border p-4 flex flex-col gap-1 ${
          sla.noDeadline > 0
            ? 'bg-yellow-50 dark:bg-yellow-950/40 border-yellow-200 dark:border-yellow-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <CalendarX size={14} className={sla.noDeadline > 0 ? 'text-yellow-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Sem prazo definido</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            sla.noDeadline > 0 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {sla.noDeadline}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">tickets abertos sem due_at</span>
        </div>

      </div>
    </div>
  );
}
