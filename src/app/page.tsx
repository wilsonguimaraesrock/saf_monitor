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
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';
import { SECTORS } from '@/lib/sectors';
import { getSectorDisplayDepartments } from '@/lib/sectors';
import type { SectorColor } from '@/lib/sectors';
import { getLandingStats } from '@/repository/sectors';
import { getChatwootLandingStats } from '@/integrations/chatwoot';
import type { ChatwootLandingStats } from '@/integrations/chatwoot';
import { queryOne } from '@/lib/db';
import { GlobalChatwootButton } from '@/components/GlobalChatwootButton';
import { MonthPickerNav } from '@/components/MonthPickerNav';
import { parseMonthParam } from '@/lib/month';

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

async function LandingContent({ month }: { month: string }) {
  const { start, end, isCurrentMonth } = parseMonthParam(month);

  // Monta mapa slug → departments para getLandingStats
  const sectorsMap = Object.fromEntries(
    SECTORS.map((s) => [s.slug, s.departments])
  );

  const sectorsWithChatwoot = SECTORS.filter((s) => s.chatwoot);

  // Stats globais, por setor e WhatsApp em paralelo
  // Current month: count ALL currently open (3-month window) — matches sector page + ticket tables.
  // Historical month: count tickets opened in that period (any status, volume view).
  const globalOpenFilter = isCurrentMonth
    ? `status NOT IN ('resolvido','cancelado') AND opened_at >= NOW() - INTERVAL '3 months'`
    : `status NOT IN ('resolvido','cancelado') AND opened_at >= $1 AND opened_at < $2`;
  const globalActionFilter = isCurrentMonth
    ? `status NOT IN ('resolvido','cancelado') AND opened_at >= NOW() - INTERVAL '3 months'`
    : `status NOT IN ('resolvido','cancelado') AND opened_at >= $1 AND opened_at < $2`;

  const [globalRow, sectorStats, chatwootResults] = await Promise.all([
    queryOne<{ total: string; overdue: string; awaiting: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE ${globalOpenFilter}) AS total,
         COUNT(*) FILTER (WHERE is_overdue AND ${globalActionFilter}) AS overdue,
         COUNT(*) FILTER (WHERE awaiting_our_response AND ${globalActionFilter}) AS awaiting
       FROM saf_tickets`,
      isCurrentMonth ? [] : [start.toISOString(), end.toISOString()]
    ),
    getLandingStats(sectorsMap, start, end),
    Promise.all(sectorsWithChatwoot.map((s) => getChatwootLandingStats(s.chatwoot!.inboxId, s.chatwoot!.teamId, start, end))),
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
    <div className="space-y-5">

      {/* ── Totalizadores globais ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total SAFs abertos" value={global.total}   icon={LayoutGrid}    variant="default" subtitle="todos os setores" />
        <StatCard label="Atrasados"           value={global.overdue} icon={AlertTriangle} variant={global.overdue > 0 ? 'critical' : 'success'} subtitle="prazo vencido" />
        <StatCard label="Aguard. nossa resp." value={global.awaiting}icon={Clock}         variant={global.awaiting > 0 ? 'warning' : 'success'} subtitle="ação pendente" />
      </div>

      {/* ── WhatsApp global ────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Setores
        </h2>
        <GlobalChatwootButton
          totalWA={Object.values(chatwootStats).reduce((s, cw) => s + (cw?.monthlyTotal ?? 0), 0)}
        />
      </div>

      {/* ── Cards de setor ─────────────────────────────────── */}
      <div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {SECTORS.map((sector) => {
            const stats  = sectorStats[sector.slug] ?? { total: 0, monthTotal: 0, overdue: 0, awaiting: 0, slaRate: 0, atRisk: 0 };
            const Icon   = sector.icon;
            const accent = LANDING_ACCENT_STYLES[sector.color];

            return (
              <Link
                key={sector.slug}
                href={`/setor/${sector.slug}`}
                className="group block rounded-xl border bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-800 shadow-sm hover:shadow-md hover:scale-[1.01] transition-all duration-150 overflow-hidden"
              >
                <div className={`h-0.5 ${accent.bar}`} />

                <div className="p-4">
                  {/* ── Linha 1: ícone + nome + número ── */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 transition-colors ${accent.iconWrap} ${accent.iconWrapHover}`}>
                        <Icon size={16} className={accent.icon} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-bold text-gray-900 dark:text-slate-100 text-base leading-tight">{sector.name}</p>
                          {sector.chatwoot && (() => {
                            const cw = chatwootStats[sector.slug];
                            const alertCount = (cw?.open ?? 0) + (cw?.pending ?? 0);
                            if (alertCount === 0) return null;
                            return (
                              <span className="inline-flex items-center gap-1.5 text-sm font-bold bg-green-500 text-white px-2.5 py-1 rounded-full animate-pulse shadow-md shadow-green-400/50 leading-none" style={{ animationDuration: '0.7s' }}>
                                <MessageSquare size={13} className="shrink-0 fill-white/30" />
                                {alertCount} WA
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[180px] leading-tight mt-0.5">
                          {getSectorDisplayDepartments(sector).join(', ')}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-slate-100 leading-none">
                        {stats.total}
                      </span>
                      {stats.monthTotal > stats.total && (
                        <div className="text-xs tabular-nums text-gray-400 dark:text-slate-500 leading-tight mt-0.5">
                          {stats.monthTotal} no mês
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Linha 2: atrasados + aguardando + SLA + em risco ── */}
                  <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-100 dark:border-slate-800 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} className={stats.overdue > 0 ? 'text-red-500' : 'text-gray-300 dark:text-slate-700'} />
                      <span className={`text-sm font-semibold tabular-nums ${stats.overdue > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-slate-600'}`}>
                        {stats.overdue} atrasados
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} className={stats.awaiting > 0 ? 'text-amber-500' : 'text-gray-300 dark:text-slate-700'} />
                      <span className={`text-sm font-semibold tabular-nums ${stats.awaiting > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-600'}`}>
                        {stats.awaiting} aguardando
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck size={13} className={
                        stats.slaRate >= 80 ? 'text-emerald-500' :
                        stats.slaRate >= 60 ? 'text-amber-500' :
                        stats.slaRate > 0   ? 'text-red-500' :
                        'text-gray-300 dark:text-slate-700'
                      } />
                      <span className={`text-sm font-semibold tabular-nums ${
                        stats.slaRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
                        stats.slaRate >= 60 ? 'text-amber-600 dark:text-amber-400' :
                        stats.slaRate > 0   ? 'text-red-600 dark:text-red-400' :
                        'text-gray-400 dark:text-slate-600'
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

                  {/* ── Linha 3: WhatsApp (tudo em uma linha) ── */}
                  {sector.chatwoot && (() => {
                    const cw = chatwootStats[sector.slug];
                    if (!cw) return null;
                    return (
                      <div className="flex items-center gap-3 mt-2.5 pt-2.5 border-t border-gray-100 dark:border-slate-800 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare size={13} className="text-green-500 shrink-0" />
                          <span className="text-xs font-medium text-gray-400 dark:text-slate-500">WA</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-semibold tabular-nums ${cw.monthlyTotal > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400 dark:text-slate-600'}`}>
                            {cw.monthlyTotal} total
                          </span>
                        </div>
                        {isCurrentMonth && (
                        <div className="flex items-center gap-1">
                          <span className={`text-sm font-semibold tabular-nums ${cw.open > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-slate-600'}`}>
                            {cw.open} abertas
                          </span>
                        </div>
                        )}
                        {isCurrentMonth && cw.avgWaitMin !== null && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={13} className={
                              cw.avgWaitMin > 60 ? 'text-red-500' :
                              cw.avgWaitMin > 30 ? 'text-amber-500' :
                              'text-emerald-500'
                            } />
                            <span className={`text-sm font-semibold tabular-nums ${
                              cw.avgWaitMin > 60 ? 'text-red-600 dark:text-red-400' :
                              cw.avgWaitMin > 30 ? 'text-amber-600 dark:text-amber-400' :
                              'text-emerald-600 dark:text-emerald-400'
                            }`}>
                              {fmtWait(cw.avgWaitMin)}
                            </span>
                          </div>
                        )}
                        {cw.csatAvg !== null && (
                          <div className="flex items-center gap-1.5">
                            <Star size={13} className="text-amber-400 fill-amber-400" />
                            <span className="text-sm font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                              {cw.csatAvg}
                            </span>
                          </div>
                        )}
                      </div>
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

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: monthParam } = await searchParams;
  const { ym, isCurrentMonth } = parseMonthParam(monthParam);

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
            <MonthPickerNav currentMonth={ym} isCurrentMonth={isCurrentMonth} />
            <NotificationBell />
            <DarkModeToggle />
            <ScraperTriggerButton />
            <RefreshButton />
            <div className="w-px h-6 bg-white/20 dark:bg-slate-700" />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-gray-400 text-sm">Carregando dados...</div>}>
          <LandingContent month={ym} />
        </Suspense>
      </div>
    </main>
  );
}
