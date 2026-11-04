import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, BarChart3, Star, Inbox, CircleCheckBig, Clock, Building2,
  ShieldCheck, Timer, MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SECTORS } from '@/lib/sectors';
import { type MonthlyStats } from '@/repository/analytics';
import {
  getDashboardData,
  getDashboardDataForDateRange,
  formatMonth,
  getLast12Months,
  type DashboardTotals,
} from '@/lib/dashboardData';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';
import { DashboardInteractiveSection } from '@/components/DashboardInteractiveSection';

export const dynamic = 'force-dynamic';

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

// ── Indicadores do topo ──────────────────────────────────────────────
type Tone = 'slate' | 'emerald' | 'amber' | 'orange' | 'blue' | 'violet';

const KPI_TONES: Record<Tone, { bar: string; icon: string; value: string }> = {
  slate:   { bar: 'bg-slate-400',   icon: 'text-slate-500 dark:text-slate-400',     value: 'text-gray-900 dark:text-slate-100' },
  emerald: { bar: 'bg-emerald-500', icon: 'text-emerald-500',                        value: 'text-emerald-600 dark:text-emerald-400' },
  amber:   { bar: 'bg-amber-500',   icon: 'text-amber-500',                          value: 'text-amber-600 dark:text-amber-400' },
  orange:  { bar: 'bg-orange-500',  icon: 'text-orange-500',                         value: 'text-orange-600 dark:text-orange-400' },
  blue:    { bar: 'bg-blue-500',    icon: 'text-blue-500',                           value: 'text-blue-600 dark:text-blue-400' },
  violet:  { bar: 'bg-violet-500',  icon: 'text-violet-500',                         value: 'text-violet-600 dark:text-violet-400' },
};

function Kpi({
  label, value, sub, icon: Icon, tone = 'slate',
}: {
  label: string;
  value: string | number;
  sub?: string;
  icon: typeof Inbox;
  tone?: Tone;
}) {
  const t = KPI_TONES[tone];
  return (
    <div className="relative rounded-xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden px-3.5 py-3">
      <div className={clsx('absolute top-0 left-0 right-0 h-1', t.bar)} />
      <div className="flex items-start justify-between gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 leading-tight">
          {label}
        </p>
        <Icon size={15} strokeWidth={1.75} className={clsx('shrink-0 mt-0.5', t.icon)} />
      </div>
      <p className={clsx('mt-1.5 text-3xl font-bold tabular-nums leading-none', t.value)}>
        {value}
      </p>
      {sub && (
        <p className="mt-1.5 text-[11px] text-gray-400 dark:text-slate-500 truncate">{sub}</p>
      )}
    </div>
  );
}

function SlaCell({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  return (
    <span className={clsx(
      'font-bold tabular-nums text-lg',
      rate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
      rate >= 60 ? 'text-amber-600 dark:text-amber-400' :
                  'text-red-600 dark:text-red-400'
    )}>
      {rate}%
    </span>
  );
}

function CsatCell({ avg, total }: { avg: number | null; total: number }) {
  if (avg === null) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 font-bold tabular-nums text-lg',
      avg >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
      avg >= 3 ? 'text-amber-600 dark:text-amber-400' :
                 'text-red-600 dark:text-red-400'
    )}>
      <Star size={15} className="fill-current" />
      {avg}
      <span className="text-sm font-normal opacity-60">({total})</span>
    </span>
  );
}

function TmaCell({
  sec, count, goodSec = 4 * 3600, warnSec = 24 * 3600,
}: {
  sec: number | null;
  count?: number;
  /** até aqui é verde */
  goodSec?: number;
  /** até aqui é âmbar; acima, vermelho */
  warnSec?: number;
}) {
  if (!sec) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 font-bold tabular-nums text-lg',
      sec <= goodSec ? 'text-emerald-600 dark:text-emerald-400' :
      sec <= warnSec ? 'text-amber-600 dark:text-amber-400' :
                       'text-red-600 dark:text-red-400'
    )}>
      {fmtDuration(sec)}
      {!!count && count > 0 && <span className="text-sm font-normal opacity-60">({count})</span>}
    </span>
  );
}

// SAFs levam dias, não horas — limiares próprios
const SAF_TMA = { goodSec: 48 * 3600, warnSec: 120 * 3600 };

const TH = 'px-3 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap';
const TD_NUM = 'px-3 py-4 text-center tabular-nums text-lg font-semibold';

// Faixa do WhatsApp — destacada do bloco de SAFs
const WA_ZONE  = 'bg-green-50/60 dark:bg-green-950/20';
const WA_EDGE  = 'border-l-2 border-green-300 dark:border-green-800/70';

async function DashboardContent({
  month,
  startDate,
  endDate,
  initialDept,
}: {
  month: string;
  startDate?: string;
  endDate?: string;
  initialDept?: string;
}) {
  const months = getLast12Months();
  const isCustom = Boolean(
    startDate &&
    endDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
    /^\d{4}-\d{2}-\d{2}$/.test(endDate)
  );

  let periodLabel = formatMonth(month);
  let statsBySector: Record<string, any>;
  let waBySector: Record<string, any>;
  let totals: DashboardTotals;
  let resolutionRate: number | null;
  let globalSla: number | null;
  let globalSafTma: number | null;
  let globalCsat: number | null;
  let csatCount: number;
  let globalTma: number | null;
  let tmaCount: number;
  let waConversations: number;
  let trendMap: Record<string, Record<string, MonthlyStats>>;

  if (isCustom && startDate && endDate) {
    const [periodData, monthData] = await Promise.all([
      getDashboardDataForDateRange(startDate, endDate),
      getDashboardData(month),
    ]);
    periodLabel = periodData.label;
    statsBySector = periodData.statsBySector;
    waBySector = periodData.waBySector;
    totals = periodData.totals;
    resolutionRate = periodData.resolutionRate;
    globalSla = periodData.globalSla;
    globalSafTma = periodData.globalSafTma;
    globalCsat = periodData.globalCsat;
    csatCount = periodData.csatCount;
    globalTma = periodData.globalTma;
    tmaCount = periodData.tmaCount;
    waConversations = periodData.waConversations;
    trendMap = monthData.trendMap;
  } else {
    const monthData = await getDashboardData(month);
    periodLabel = formatMonth(monthData.month);
    statsBySector = monthData.statsBySector;
    waBySector = monthData.waBySector;
    totals = monthData.totals;
    resolutionRate = monthData.resolutionRate;
    globalSla = monthData.globalSla;
    globalSafTma = monthData.globalSafTma;
    globalCsat = monthData.globalCsat;
    csatCount = monthData.csatCount;
    globalTma = monthData.globalTma;
    tmaCount = monthData.tmaCount;
    waConversations = monthData.waConversations;
    trendMap = monthData.trendMap;
  }

  return (
    <div className="space-y-8">

      {/* ── Área de Exportação & Seção Interativa ────────────────── */}
      <DashboardInteractiveSection
        key={`${month}-${startDate}-${endDate}`}
        currentMonth={month}
        availableMonths={months}
        isCustomRange={isCustom}
        startDateParam={startDate}
        endDateParam={endDate}
        periodLabel={periodLabel}
        initialDept={initialDept}
        initialData={{
          statsBySector,
          waBySector,
          totals,
          resolutionRate,
          globalSla,
          globalSafTma,
          globalCsat,
          csatCount,
          globalTma,
          tmaCount,
          waConversations,
        }}
      />

      {/* ── Histórico: SAFs abertos por setor ──────────────────── */}
      <HistoryTable
        title="Histórico — SAFs Abertos por Setor"
        months={months}
        month={month}
        trendMap={trendMap}
        pick={(s) => s.abertos}
      />

      {/* ── Histórico: SAFs resolvidos por setor ───────────────── */}
      <HistoryTable
        title="Histórico — SAFs Resolvidos no Mês de Abertura"
        months={months}
        month={month}
        trendMap={trendMap}
        pick={(s) => s.resolvidos}
      />

      {/* ── Histórico: SLA % por setor ─────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
          Histórico — SLA % por Setor
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                <th className={clsx(TH, 'text-left')}>Mês</th>
                {SECTORS.map((s) => (
                  <th key={s.slug} className={clsx(TH, 'text-center')}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const isSelected = m === month;
                return (
                  <tr
                    key={m}
                    className={clsx(
                      'transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40',
                      isSelected && 'bg-orange-50/40 dark:bg-orange-950/10',
                      i < months.length - 1 && 'border-b border-gray-50 dark:border-slate-800/60'
                    )}
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/dashboard?m=${m}`}
                        className={clsx(
                          'text-base font-semibold transition-colors hover:text-orange-600 dark:hover:text-orange-400',
                          isSelected
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-gray-700 dark:text-slate-300'
                        )}
                      >
                        {formatMonth(m)}
                      </Link>
                    </td>
                    {SECTORS.map((s) => (
                      <td key={s.slug} className="px-4 py-3 text-center">
                        <SlaCell rate={trendMap[s.slug]?.[m]?.slaRate ?? null} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function HistoryTable({
  title, months, month, trendMap, pick,
}: {
  title: string;
  months: string[];
  month: string;
  trendMap: Record<string, Record<string, MonthlyStats>>;
  pick: (s: MonthlyStats) => number;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
        {title}
      </h2>
      <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
              <th className={clsx(TH, 'text-left')}>Mês</th>
              {SECTORS.map((s) => (
                <th key={s.slug} className={clsx(TH, 'text-center')}>{s.name}</th>
              ))}
              <th className={clsx(TH, 'text-center')}>Total</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m, i) => {
              const rowTotal = SECTORS.reduce((acc, s) => {
                const st = trendMap[s.slug]?.[m];
                return acc + (st ? pick(st) : 0);
              }, 0);
              const isSelected = m === month;
              return (
                <tr
                  key={m}
                  className={clsx(
                    'transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40',
                    isSelected && 'bg-orange-50/40 dark:bg-orange-950/10',
                    i < months.length - 1 && 'border-b border-gray-50 dark:border-slate-800/60'
                  )}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link
                      href={`/dashboard?m=${m}`}
                      className={clsx(
                        'text-base font-semibold transition-colors hover:text-orange-600 dark:hover:text-orange-400',
                        isSelected
                          ? 'text-orange-600 dark:text-orange-400'
                          : 'text-gray-700 dark:text-slate-300'
                      )}
                    >
                      {formatMonth(m)}
                    </Link>
                  </td>
                  {SECTORS.map((s) => {
                    const st = trendMap[s.slug]?.[m];
                    const v  = st ? pick(st) : 0;
                    return (
                      <td key={s.slug} className="px-4 py-3 text-center tabular-nums text-lg text-gray-700 dark:text-slate-300">
                        {v > 0 ? v : <span className="text-gray-200 dark:text-slate-800">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-center tabular-nums text-lg font-bold text-gray-900 dark:text-slate-100">
                    {rowTotal > 0 ? rowTotal : <span className="text-gray-200 dark:text-slate-800">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; start?: string; end?: string; dept?: string }>;
}) {
  const { m, start, end, dept } = await searchParams;
  const months = getLast12Months();
  const selectedMonth = m && months.includes(m) ? m : months[0];

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
            <Link
              href="/"
              className="flex items-center gap-1.5 text-orange-100 dark:text-slate-400 hover:text-white dark:hover:text-slate-200 text-sm transition-colors"
            >
              <ArrowLeft size={14} />
              <span>Voltar</span>
            </Link>
            <div className="w-px h-6 bg-orange-300/50 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-orange-100 dark:text-slate-400" />
              <div>
                <h1 className="text-base font-bold text-white dark:text-slate-100 leading-tight">
                  Dashboard Histórico
                </h1>
                <p className="text-xs text-orange-100 dark:text-slate-600">SAFs · SLA · CSAT · WhatsApp por mês</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <DarkModeToggle />
            <div className="w-px h-6 bg-white/20 dark:bg-slate-700" />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-6 py-6">
        <Suspense
          key={`${selectedMonth}-${start}-${end}`}
          fallback={
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Carregando dados...
            </div>
          }
        >
          <DashboardContent
            month={selectedMonth}
            startDate={start}
            endDate={end}
            initialDept={dept}
          />
        </Suspense>
      </div>
    </main>
  );
}
