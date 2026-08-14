import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  ArrowLeft, BarChart3, Star, Inbox, CircleCheckBig, Clock, Building2,
  ShieldCheck, Timer, MessageSquare,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SECTORS } from '@/lib/sectors';
import { getMonthlySectorStats, type MonthlyStats } from '@/repository/analytics';
import { getCsatForPeriod, getWhatsappHandlingStats } from '@/integrations/chatwoot';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { UserMenu } from '@/components/UserMenu';

export const dynamic = 'force-dynamic';

const MONTH_NAMES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function formatMonth(m: string): string {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES_PT[Number(month) - 1]} ${year}`;
}

function monthBounds(month: string): { since: number; until: number } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end   = new Date(Date.UTC(year, m, 1));
  return { since: Math.floor(start.getTime() / 1000), until: Math.floor(end.getTime() / 1000) - 1 };
}

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
    <div className="relative rounded-2xl border border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden p-5">
      <div className={clsx('absolute top-0 left-0 right-0 h-1', t.bar)} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 leading-tight">
          {label}
        </p>
        <Icon size={20} strokeWidth={1.75} className={clsx('shrink-0', t.icon)} />
      </div>
      <p className={clsx('mt-3 text-5xl font-bold tabular-nums leading-none', t.value)}>
        {value}
      </p>
      {sub && (
        <p className="mt-2 text-sm text-gray-400 dark:text-slate-500 truncate">{sub}</p>
      )}
    </div>
  );
}

function SlaCell({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  return (
    <span className={clsx(
      'font-bold tabular-nums text-base',
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
      'inline-flex items-center gap-1 font-bold tabular-nums text-base',
      avg >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
      avg >= 3 ? 'text-amber-600 dark:text-amber-400' :
                 'text-red-600 dark:text-red-400'
    )}>
      <Star size={13} className="fill-current" />
      {avg}
      <span className="text-xs font-normal opacity-60">({total})</span>
    </span>
  );
}

function TmaCell({ sec, count }: { sec: number | null; count: number }) {
  if (!sec) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 font-bold tabular-nums text-base',
      sec <= 4 * 3600  ? 'text-emerald-600 dark:text-emerald-400' :
      sec <= 24 * 3600 ? 'text-amber-600 dark:text-amber-400' :
                         'text-red-600 dark:text-red-400'
    )}>
      {fmtDuration(sec)}
      {count > 0 && <span className="text-xs font-normal opacity-60">({count})</span>}
    </span>
  );
}

const TH = 'px-4 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap';
const TD_NUM = 'px-4 py-4 text-right tabular-nums text-base font-semibold';

async function DashboardContent({ month }: { month: string }) {
  const { since, until } = monthBounds(month);
  const months = getLast12Months();

  const [allStats, waResults] = await Promise.all([
    getMonthlySectorStats(12),
    Promise.all(
      SECTORS
        .filter((s) => s.chatwoot)
        .map(async (s) => {
          const [csat, handling] = await Promise.all([
            getCsatForPeriod(s.chatwoot!.inboxId, since, until, s.chatwoot!.teamId),
            getWhatsappHandlingStats(s.chatwoot!.teamId, since, until),
          ]);
          return { slug: s.slug, csat, handling };
        })
    ),
  ]);

  const waBySector = Object.fromEntries(waResults.map((r) => [r.slug, r]));

  const statsBySector: Record<string, MonthlyStats> =
    Object.fromEntries(allStats.filter((s) => s.month === month).map((s) => [s.sectorSlug, s]));

  // trend map: sectorSlug → month → stats
  const trendMap: Record<string, Record<string, MonthlyStats>> = {};
  for (const s of allStats) {
    if (!trendMap[s.sectorSlug]) trendMap[s.sectorSlug] = {};
    trendMap[s.sectorSlug][s.month] = s;
  }

  const totals = SECTORS.reduce(
    (acc, s) => {
      const st = statsBySector[s.slug];
      if (!st) return acc;
      return {
        abertos:            acc.abertos + st.abertos,
        resolvidos:         acc.resolvidos + st.resolvidos,
        aguardandoNos:      acc.aguardandoNos + st.aguardandoNos,
        aguardandoFranquia: acc.aguardandoFranquia + st.aguardandoFranquia,
        withDeadline:       acc.withDeadline + st.withDeadline,
        withinSla:          acc.withinSla + st.withinSla,
      };
    },
    { abertos: 0, resolvidos: 0, aguardandoNos: 0, aguardandoFranquia: 0, withDeadline: 0, withinSla: 0 }
  );

  const resolutionRate = totals.abertos > 0
    ? Math.round((100 * totals.resolvidos) / totals.abertos)
    : null;
  const globalSla = totals.withDeadline > 0
    ? Math.round((100 * totals.withinSla) / totals.withDeadline)
    : null;

  // WhatsApp global — médias ponderadas pelo volume de cada setor
  const csatSum   = waResults.reduce((a, r) => a + (r.csat.avg ?? 0) * r.csat.total, 0);
  const csatCount = waResults.reduce((a, r) => a + r.csat.total, 0);
  const globalCsat = csatCount > 0 ? Math.round((csatSum / csatCount) * 10) / 10 : null;

  const tmaSum   = waResults.reduce((a, r) => a + (r.handling.avgResolutionSec ?? 0) * r.handling.resolutionsCount, 0);
  const tmaCount = waResults.reduce((a, r) => a + (r.handling.avgResolutionSec ? r.handling.resolutionsCount : 0), 0);
  const globalTma = tmaCount > 0 ? Math.round(tmaSum / tmaCount) : null;

  return (
    <div className="space-y-8">

      {/* ── Seletor de mês ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <Link
            key={m}
            href={`/dashboard?m=${m}`}
            className={clsx(
              'px-3.5 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap',
              m === month
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            )}
          >
            {formatMonth(m)}
          </Link>
        ))}
      </div>

      {/* ── Indicadores do mês ─────────────────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
            {formatMonth(month)}
          </h2>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            SAFs contados pelo mês de abertura
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Kpi label="SAFs abertos"  value={totals.abertos}    icon={Inbox}         tone="slate"
               sub="abertos no mês" />
          <Kpi label="Resolvidos"    value={totals.resolvidos} icon={CircleCheckBig} tone="emerald"
               sub="abertos e resolvidos no mês" />
          <Kpi label="% resolvidos"  value={resolutionRate !== null ? `${resolutionRate}%` : '—'} icon={BarChart3} tone="blue"
               sub="do que abriu no mês" />
          <Kpi label="Aguard. nossa resp." value={totals.aguardandoNos} icon={Clock} tone="amber"
               sub="pendente conosco" />
          <Kpi label="Aguard. franquia"    value={totals.aguardandoFranquia} icon={Building2} tone="orange"
               sub="pendente com a franquia" />
          <Kpi label="SLA no prazo" value={globalSla !== null ? `${globalSla}%` : '—'} icon={ShieldCheck} tone="violet"
               sub="resolvidos dentro do prazo" />
        </div>

        {/* WhatsApp global */}
        <div className="flex items-center gap-2 mt-6 mb-3">
          <MessageSquare size={14} className="text-green-600 dark:text-green-500" />
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            WhatsApp — {formatMonth(month)}
          </h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <Kpi label="CSAT WhatsApp" value={globalCsat !== null ? globalCsat : '—'} icon={Star} tone="emerald"
               sub={csatCount > 0 ? `${csatCount} avaliações` : 'sem avaliações'} />
          <Kpi label="TMA WhatsApp" value={fmtDuration(globalTma)} icon={Timer} tone="blue"
               sub={tmaCount > 0 ? `${tmaCount} conversas resolvidas` : 'sem resoluções'} />
        </div>
      </div>

      {/* ── Tabela do mês selecionado ───────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
          Por setor — {formatMonth(month)}
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                <th rowSpan={2} className={clsx(TH, 'text-left align-bottom')}>Setor</th>
                <th colSpan={6} className="px-4 pt-3 pb-1 text-center text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                  SAFs
                </th>
                <th colSpan={2} className="px-4 pt-3 pb-1 text-center text-xs font-bold uppercase tracking-widest text-green-600/70 dark:text-green-500/70 border-b border-l border-gray-100 dark:border-slate-800">
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare size={12} /> WhatsApp
                  </span>
                </th>
              </tr>
              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                <th className={clsx(TH, 'text-right')}>Abertos</th>
                <th className={clsx(TH, 'text-right')}>Resolvidos</th>
                <th className={clsx(TH, 'text-right')}>% Resolv.</th>
                <th className={clsx(TH, 'text-right')}>Aguard. nós</th>
                <th className={clsx(TH, 'text-right')}>Aguard. franquia</th>
                <th className={clsx(TH, 'text-right')}>SLA</th>
                <th className={clsx(TH, 'text-right border-l border-gray-100 dark:border-slate-800')}>CSAT</th>
                <th className={clsx(TH, 'text-right')}>Tempo médio atend.</th>
              </tr>
            </thead>
            <tbody>
              {SECTORS.map((sector, i) => {
                const st   = statsBySector[sector.slug];
                const wa   = waBySector[sector.slug];
                const Icon = sector.icon;
                const rate = st && st.abertos > 0
                  ? Math.round((100 * st.resolvidos) / st.abertos)
                  : null;
                return (
                  <tr
                    key={sector.slug}
                    className={clsx(
                      'transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40',
                      i < SECTORS.length - 1 && 'border-b border-gray-50 dark:border-slate-800/60'
                    )}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <Icon size={16} className="text-gray-400 dark:text-slate-500 shrink-0" />
                        <Link
                          href={`/setor/${sector.slug}`}
                          className="text-base font-semibold text-gray-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                        >
                          {sector.name}
                        </Link>
                      </div>
                    </td>
                    <td className={clsx(TD_NUM, 'text-gray-900 dark:text-slate-100')}>
                      {st?.abertos ?? <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className={clsx(TD_NUM, 'text-emerald-600 dark:text-emerald-400')}>
                      {st?.resolvidos ?? <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className={clsx(TD_NUM, 'text-gray-600 dark:text-slate-300')}>
                      {rate !== null ? `${rate}%` : <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className={clsx(TD_NUM, (st?.aguardandoNos ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-300 dark:text-slate-700')}>
                      {st?.aguardandoNos ?? 0}
                    </td>
                    <td className={clsx(TD_NUM, (st?.aguardandoFranquia ?? 0) > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-gray-300 dark:text-slate-700')}>
                      {st?.aguardandoFranquia ?? 0}
                    </td>
                    <td className="px-4 py-4 text-right">
                      <SlaCell rate={st?.slaRate ?? null} />
                    </td>
                    <td className="px-4 py-4 text-right border-l border-gray-100 dark:border-slate-800">
                      <CsatCell avg={wa?.csat.avg ?? null} total={wa?.csat.total ?? 0} />
                    </td>
                    <td className="px-4 py-4 text-right">
                      <TmaCell sec={wa?.handling.avgResolutionSec ?? null} count={wa?.handling.resolutionsCount ?? 0} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <td className="px-4 py-4 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total</td>
                <td className={clsx(TD_NUM, 'text-lg text-gray-900 dark:text-slate-100')}>{totals.abertos}</td>
                <td className={clsx(TD_NUM, 'text-lg text-emerald-600 dark:text-emerald-400')}>{totals.resolvidos}</td>
                <td className={clsx(TD_NUM, 'text-lg text-gray-600 dark:text-slate-300')}>
                  {resolutionRate !== null ? `${resolutionRate}%` : '—'}
                </td>
                <td className={clsx(TD_NUM, 'text-lg text-amber-600 dark:text-amber-400')}>{totals.aguardandoNos}</td>
                <td className={clsx(TD_NUM, 'text-lg text-orange-600 dark:text-orange-400')}>{totals.aguardandoFranquia}</td>
                <td className="px-4 py-4 text-right">
                  <SlaCell rate={globalSla} />
                </td>
                <td className="px-4 py-4 text-right border-l border-gray-100 dark:border-slate-800">
                  <CsatCell avg={globalCsat} total={csatCount} />
                </td>
                <td className="px-4 py-4 text-right">
                  <TmaCell sec={globalTma} count={tmaCount} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
          Resolvidos = SAFs abertos <strong>e</strong> resolvidos dentro do mês. SAFs abertos em meses
          anteriores não entram na contagem, mesmo que resolvidos no mês filtrado.
          Tempo médio de atendimento do WhatsApp vem do relatório do Chatwoot (abertura → resolução).
        </p>
      </div>

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
                  <th key={s.slug} className={clsx(TH, 'text-right')}>{s.name}</th>
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
                      <td key={s.slug} className="px-4 py-3 text-right">
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
                <th key={s.slug} className={clsx(TH, 'text-right')}>{s.name}</th>
              ))}
              <th className={clsx(TH, 'text-right')}>Total</th>
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
                      <td key={s.slug} className="px-4 py-3 text-right tabular-nums text-base text-gray-700 dark:text-slate-300">
                        {v > 0 ? v : <span className="text-gray-200 dark:text-slate-800">—</span>}
                      </td>
                    );
                  })}
                  <td className="px-4 py-3 text-right tabular-nums text-base font-bold text-gray-900 dark:text-slate-100">
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
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
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
          fallback={
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
              Carregando dados...
            </div>
          }
        >
          <DashboardContent month={selectedMonth} />
        </Suspense>
      </div>
    </main>
  );
}
