/**
 * Landing page — visão geral de todos os setores.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle, Clock, LayoutGrid, ShieldCheck } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { RefreshButton } from '@/components/RefreshButton';
import { ScraperTriggerButton } from '@/components/ScraperTriggerButton';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { SECTORS } from '@/lib/sectors';
import { getLandingStats } from '@/repository/sectors';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function LandingContent() {
  // Monta mapa slug → departments para getLandingStats
  const sectorsMap = Object.fromEntries(
    SECTORS.map((s) => [s.slug, s.departments])
  );

  // Stats globais e por setor em paralelo
  const [globalRow, sectorStats] = await Promise.all([
    queryOne<{ total: string; overdue: string; awaiting: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS total,
         COUNT(*) FILTER (WHERE is_overdue
           AND status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS overdue,
         COUNT(*) FILTER (WHERE awaiting_our_response
           AND status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS awaiting
       FROM saf_tickets`,
      []
    ),
    getLandingStats(sectorsMap),
  ]);

  const global = {
    total:   Number(globalRow?.total   ?? 0),
    overdue: Number(globalRow?.overdue ?? 0),
    awaiting:Number(globalRow?.awaiting ?? 0),
  };

  return (
    <div className="space-y-8">

      {/* ── Totalizadores globais ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total SAFs abertos" value={global.total}   icon={LayoutGrid}    variant="default" subtitle="todos os setores" />
        <StatCard label="Atrasados"           value={global.overdue} icon={AlertTriangle} variant={global.overdue > 0 ? 'critical' : 'success'} subtitle="prazo vencido" />
        <StatCard label="Aguard. nossa resp." value={global.awaiting}icon={Clock}         variant={global.awaiting > 0 ? 'warning' : 'success'} subtitle="ação pendente" />
      </div>

      {/* ── Cards de setor ─────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-4">
          Setores
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SECTORS.map((sector) => {
            const stats  = sectorStats[sector.slug] ?? { total: 0, overdue: 0, awaiting: 0 };
            const Icon   = sector.icon;
            const hasAlert = stats.overdue > 0;

            return (
              <Link
                key={sector.slug}
                href={`/setor/${sector.slug}`}
                className="group block rounded-2xl border bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-150 overflow-hidden"
              >
                {/* Barra de acento */}
                <div className={`h-1 ${hasAlert ? 'bg-red-500' : 'bg-blue-400'}`} />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-gray-100 dark:bg-slate-800 group-hover:bg-gray-200 dark:group-hover:bg-slate-700 transition-colors">
                        <Icon size={18} className="text-gray-600 dark:text-slate-300" />
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 dark:text-slate-100 text-sm">{sector.name}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate max-w-[180px]">
                          {sector.departments.join(', ')}
                        </p>
                      </div>
                    </div>
                    <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-100 shrink-0">
                      {stats.total}
                    </span>
                  </div>

                  <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className={stats.overdue > 0 ? 'text-red-500' : 'text-gray-300 dark:text-slate-600'} />
                      <span className={`text-sm font-semibold tabular-nums ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'}`}>
                        {stats.overdue} atrasados
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className={stats.awaiting > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-slate-600'} />
                      <span className={`text-sm font-semibold tabular-nums ${stats.awaiting > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                        {stats.awaiting} aguardando
                      </span>
                    </div>
                  </div>

                  {/* SLA row */}
                  <div className="flex gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={13} className={
                        stats.slaRate >= 80 ? 'text-emerald-500' :
                        stats.slaRate >= 60 ? 'text-amber-500' :
                        stats.slaRate > 0   ? 'text-red-500' :
                        'text-gray-300 dark:text-slate-600'
                      } />
                      <span className={`text-sm font-semibold tabular-nums ${
                        stats.slaRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        stats.slaRate >= 60 ? 'text-amber-600 dark:text-amber-400' :
                        stats.slaRate > 0   ? 'text-red-600 dark:text-red-400' :
                        'text-gray-400 dark:text-slate-500'
                      }`}>
                        {stats.slaRate > 0 ? `${stats.slaRate}% SLA` : '— SLA'}
                      </span>
                    </div>
                    {stats.atRisk > 0 && (
                      <div className="flex items-center gap-1.5">
                        <Clock size={13} className="text-orange-500" />
                        <span className="text-sm font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                          {stats.atRisk} em risco
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-orange-500 to-amber-500 border-b border-orange-600 dark:from-slate-900 dark:to-slate-900 dark:border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-rockfeller-branca.png"
              alt="Rockfeller"
              width={794}
              height={77}
              className="h-7 w-auto"
              priority
            />
            <div className="w-px h-6 bg-orange-300/50 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <div>
                <h1 className="text-base font-bold text-white dark:text-slate-100 leading-tight">
                  Monitoramento de SAFs
                </h1>
                <p className="text-xs text-orange-100 dark:text-slate-600">Visão geral por setor</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <ScraperTriggerButton />
            <RefreshButton />
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">Carregando dados...</div>}>
          <LandingContent />
        </Suspense>
      </div>
    </main>
  );
}
