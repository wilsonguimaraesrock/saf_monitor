/**
 * Landing page — visão geral de todos os setores.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertTriangle, Clock, LayoutGrid, MessageSquare, ShieldCheck, Star } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { RefreshButton } from '@/components/RefreshButton';
import { ScraperTriggerButton } from '@/components/ScraperTriggerButton';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { SECTORS } from '@/lib/sectors';
import { getSectorDisplayDepartments } from '@/lib/sectors';
import type { SectorColor } from '@/lib/sectors';
import { getLandingStats } from '@/repository/sectors';
import { getChatwootLandingStats } from '@/integrations/chatwoot';
import type { ChatwootLandingStats } from '@/integrations/chatwoot';
import { queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

const LANDING_ACCENT_STYLES: Record<SectorColor, {
  bar: string;
  iconWrap: string;
  iconWrapHover: string;
  icon: string;
}> = {
  default: {
    bar: 'bg-slate-400 dark:bg-slate-500',
    iconWrap: 'bg-slate-100 dark:bg-slate-800',
    iconWrapHover: 'group-hover:bg-slate-200 dark:group-hover:bg-slate-700',
    icon: 'text-slate-600 dark:text-slate-300',
  },
  critical: {
    bar: 'bg-red-500 dark:bg-red-500',
    iconWrap: 'bg-red-100 dark:bg-red-950/40',
    iconWrapHover: 'group-hover:bg-red-200 dark:group-hover:bg-red-900/50',
    icon: 'text-red-600 dark:text-red-300',
  },
  warning: {
    bar: 'bg-amber-500 dark:bg-amber-500',
    iconWrap: 'bg-amber-100 dark:bg-amber-950/40',
    iconWrapHover: 'group-hover:bg-amber-200 dark:group-hover:bg-amber-900/50',
    icon: 'text-amber-600 dark:text-amber-300',
  },
  purple: {
    bar: 'bg-purple-500 dark:bg-purple-500',
    iconWrap: 'bg-purple-100 dark:bg-purple-950/40',
    iconWrapHover: 'group-hover:bg-purple-200 dark:group-hover:bg-purple-900/50',
    icon: 'text-purple-600 dark:text-purple-300',
  },
  orange: {
    bar: 'bg-orange-500 dark:bg-orange-500',
    iconWrap: 'bg-orange-100 dark:bg-orange-950/40',
    iconWrapHover: 'group-hover:bg-orange-200 dark:group-hover:bg-orange-900/50',
    icon: 'text-orange-600 dark:text-orange-300',
  },
  cyan: {
    bar: 'bg-cyan-500 dark:bg-cyan-500',
    iconWrap: 'bg-cyan-100 dark:bg-cyan-950/40',
    iconWrapHover: 'group-hover:bg-cyan-200 dark:group-hover:bg-cyan-900/50',
    icon: 'text-cyan-600 dark:text-cyan-300',
  },
  emerald: {
    bar: 'bg-emerald-500 dark:bg-emerald-500',
    iconWrap: 'bg-emerald-100 dark:bg-emerald-950/40',
    iconWrapHover: 'group-hover:bg-emerald-200 dark:group-hover:bg-emerald-900/50',
    icon: 'text-emerald-600 dark:text-emerald-300',
  },
};

function fmtWait(min: number): string {
  if (min < 60) return `${min}min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

async function LandingContent() {
  // Monta mapa slug → departments para getLandingStats
  const sectorsMap = Object.fromEntries(
    SECTORS.map((s) => [s.slug, s.departments])
  );

  const sectorsWithChatwoot = SECTORS.filter((s) => s.chatwoot);

  // Stats globais, por setor e WhatsApp em paralelo
  const [globalRow, sectorStats, chatwootResults] = await Promise.all([
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
    Promise.all(sectorsWithChatwoot.map((s) => getChatwootLandingStats(s.chatwoot!.inboxId, s.chatwoot!.teamId))),
  ]);

  const chatwootStats: Record<string, ChatwootLandingStats> = Object.fromEntries(
    sectorsWithChatwoot.map((s, i) => [s.slug, chatwootResults[i]])
  );

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
            const accent = LANDING_ACCENT_STYLES[sector.color];

            return (
              <Link
                key={sector.slug}
                href={`/setor/${sector.slug}`}
                className="group block rounded-2xl border bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-150 overflow-hidden"
              >
                {/* Barra de acento */}
                <div className={`h-1 ${accent.bar}`} />

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded-xl transition-colors ${accent.iconWrap} ${accent.iconWrapHover}`}>
                        <Icon size={18} className={accent.icon} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900 dark:text-slate-100 text-sm">{sector.name}</p>
                          {sector.chatwoot && (() => {
                            const cw = chatwootStats[sector.slug];
                            const alertCount = (cw?.open ?? 0) + (cw?.pending ?? 0);
                            if (alertCount === 0) return null;
                            return (
                              <span className="inline-flex items-center gap-1.5 text-xs font-bold bg-green-500 dark:bg-green-500 text-white px-2 py-1 rounded-full animate-pulse shadow-md shadow-green-400/50 dark:shadow-green-600/40 leading-none" style={{ animationDuration: '0.7s' }}>
                                <MessageSquare size={12} className="shrink-0 fill-white/30" />
                                {alertCount} WA
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-slate-500 mt-0.5 truncate max-w-[180px]">
                          {getSectorDisplayDepartments(sector).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-4xl font-bold tabular-nums text-gray-900 dark:text-slate-100">
                        {stats.total}
                      </span>
                      {stats.monthlyTotal > 0 && (
                        <p className="text-xs text-gray-400 dark:text-slate-500 tabular-nums mt-0.5">
                          {stats.monthlyTotal} no mês
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className={stats.overdue > 0 ? 'text-red-500' : 'text-gray-300 dark:text-slate-600'} />
                      <span className={`text-base font-semibold tabular-nums ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'}`}>
                        {stats.overdue} atrasados
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className={stats.awaiting > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-slate-600'} />
                      <span className={`text-base font-semibold tabular-nums ${stats.awaiting > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
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
                      <span className={`text-base font-semibold tabular-nums ${
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
                        <span className="text-base font-semibold tabular-nums text-orange-600 dark:text-orange-400">
                          {stats.atRisk} em risco
                        </span>
                      </div>
                    )}
                  </div>

                  {/* WhatsApp row */}
                  {sector.chatwoot && (() => {
                    const cw = chatwootStats[sector.slug];
                    if (!cw) return null;
                    return (
                      <>
                        {/* linha 1: total do mês + abertas agora */}
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-slate-800">
                          <div className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500 font-medium">
                            <MessageSquare size={11} className="text-green-500 shrink-0" />
                            <span className="text-gray-300 dark:text-slate-600 mr-0.5">WA</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MessageSquare size={12} className={cw.monthlyTotal > 0 ? 'text-green-500' : 'text-gray-300 dark:text-slate-600'} />
                            <span className={`text-base font-semibold tabular-nums ${cw.monthlyTotal > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-500'}`}>
                              {cw.monthlyTotal} total
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <MessageSquare size={12} className={cw.open > 0 ? 'text-blue-500' : 'text-gray-300 dark:text-slate-600'} />
                            <span className={`text-base font-semibold tabular-nums ${cw.open > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-500'}`}>
                              {cw.open} abertas
                            </span>
                          </div>
                        </div>
                        {/* linha 2: espera + CSAT */}
                        {(cw.avgWaitMin !== null || cw.csatAvg !== null) && (
                          <div className="flex items-center gap-4 mt-2">
                            {cw.avgWaitMin !== null && (
                              <div className="flex items-center gap-1.5">
                                <Clock size={12} className={
                                  cw.avgWaitMin > 60 ? 'text-red-500' :
                                  cw.avgWaitMin > 30 ? 'text-amber-500' :
                                  'text-emerald-500'
                                } />
                                <span className={`text-base font-semibold tabular-nums ${
                                  cw.avgWaitMin > 60 ? 'text-red-600 dark:text-red-400' :
                                  cw.avgWaitMin > 30 ? 'text-amber-600 dark:text-amber-400' :
                                  'text-emerald-600 dark:text-emerald-400'
                                }`}>
                                  {fmtWait(cw.avgWaitMin)} espera
                                </span>
                              </div>
                            )}
                            {cw.csatAvg !== null && (
                              <div className="flex items-center gap-1.5">
                                <Star size={12} className="text-amber-400 fill-amber-400" />
                                <span className="text-base font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                                  {cw.csatAvg}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    );
                  })()}
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
      <header className="sticky top-0 z-20 bg-gradient-to-r from-orange-600 to-amber-600 border-b border-orange-700 dark:from-slate-900 dark:to-slate-900 dark:border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Image
              src="/logo-rockfeller-branca.png"
              alt="Rockfeller"
              width={794}
              height={77}
              className="h-3.5 w-auto"
              priority
            />
            <div className="w-px h-6 bg-orange-300/50 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <div>
                <h1 className="text-base font-bold text-white dark:text-slate-100 leading-tight">
                  Atendimento aos Franqueados
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
