import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, BarChart3, Star } from 'lucide-react';
import { clsx } from 'clsx';
import { SECTORS } from '@/lib/sectors';
import { getMonthlySectorStats, type MonthlyStats } from '@/repository/analytics';
import { getCsatForPeriod } from '@/integrations/chatwoot';
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

function SlaCell({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-gray-300 dark:text-slate-700">—</span>;
  return (
    <span className={clsx(
      'font-semibold tabular-nums',
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
      'inline-flex items-center gap-1 font-semibold tabular-nums',
      avg >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
      avg >= 3 ? 'text-amber-600 dark:text-amber-400' :
                 'text-red-600 dark:text-red-400'
    )}>
      <Star size={11} className="fill-current" />
      {avg}
      <span className="text-xs font-normal opacity-60">({total})</span>
    </span>
  );
}

async function DashboardContent({ month }: { month: string }) {
  const { since, until } = monthBounds(month);
  const months = getLast12Months();

  const [allStats, csatResults] = await Promise.all([
    getMonthlySectorStats(12),
    Promise.all(
      SECTORS
        .filter((s) => s.chatwoot)
        .map(async (s) => {
          const csat = await getCsatForPeriod(s.chatwoot!.inboxId, since, until, s.chatwoot!.teamId);
          return { slug: s.slug, ...csat };
        })
    ),
  ]);

  const csatBySector: Record<string, { avg: number | null; total: number }> =
    Object.fromEntries(csatResults.map((r) => [r.slug, { avg: r.avg, total: r.total }]));

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
      return st
        ? { abertos: acc.abertos + st.abertos, resolvidos: acc.resolvidos + st.resolvidos }
        : acc;
    },
    { abertos: 0, resolvidos: 0 }
  );

  return (
    <div className="space-y-8">

      {/* ── Seletor de mês ─────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2">
        {months.map((m) => (
          <Link
            key={m}
            href={`/dashboard?m=${m}`}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap',
              m === month
                ? 'bg-orange-600 text-white shadow-sm'
                : 'bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800'
            )}
          >
            {formatMonth(m)}
          </Link>
        ))}
      </div>

      {/* ── Tabela do mês selecionado ───────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
          {formatMonth(month)}
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Setor</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">SAFs Abertos</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">SAFs Resolvidos</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">SLA</th>
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">CSAT WhatsApp</th>
              </tr>
            </thead>
            <tbody>
              {SECTORS.map((sector, i) => {
                const st   = statsBySector[sector.slug];
                const csat = csatBySector[sector.slug];
                const Icon = sector.icon;
                return (
                  <tr
                    key={sector.slug}
                    className={clsx(
                      'transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40',
                      i < SECTORS.length - 1 && 'border-b border-gray-50 dark:border-slate-800/60'
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Icon size={14} className="text-gray-400 dark:text-slate-500 shrink-0" />
                        <Link
                          href={`/setor/${sector.slug}`}
                          className="font-medium text-gray-900 dark:text-slate-100 hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
                        >
                          {sector.name}
                        </Link>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-gray-900 dark:text-slate-100">
                      {st?.abertos ?? <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums font-semibold text-gray-900 dark:text-slate-100">
                      {st?.resolvidos ?? <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <SlaCell rate={st?.slaRate ?? null} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <CsatCell avg={csat?.avg ?? null} total={csat?.total ?? 0} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                <td className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total</td>
                <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900 dark:text-slate-100 text-base">{totals.abertos}</td>
                <td className="px-5 py-3 text-right tabular-nums font-bold text-gray-900 dark:text-slate-100 text-base">{totals.resolvidos}</td>
                <td className="px-5 py-3 text-right text-gray-300 dark:text-slate-700">—</td>
                <td className="px-5 py-3 text-right text-gray-300 dark:text-slate-700">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── Histórico: SAFs abertos por setor ──────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
          Histórico — SAFs Abertos por Setor
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">Mês</th>
                {SECTORS.map((s) => (
                  <th key={s.slug} className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {s.name}
                  </th>
                ))}
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const rowTotal = SECTORS.reduce(
                  (acc, s) => acc + (trendMap[s.slug]?.[m]?.abertos ?? 0), 0
                );
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
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/dashboard?m=${m}`}
                        className={clsx(
                          'font-medium transition-colors hover:text-orange-600 dark:hover:text-orange-400',
                          isSelected
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-gray-700 dark:text-slate-300'
                        )}
                      >
                        {formatMonth(m)}
                      </Link>
                    </td>
                    {SECTORS.map((s) => {
                      const v = trendMap[s.slug]?.[m]?.abertos ?? 0;
                      return (
                        <td key={s.slug} className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-slate-300">
                          {v > 0 ? v : <span className="text-gray-200 dark:text-slate-800">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-slate-100">
                      {rowTotal > 0 ? rowTotal : <span className="text-gray-200 dark:text-slate-800">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Histórico: SAFs resolvidos por setor ───────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
          Histórico — SAFs Resolvidos por Setor
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">Mês</th>
                {SECTORS.map((s) => (
                  <th key={s.slug} className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {s.name}
                  </th>
                ))}
                <th className="text-right px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => {
                const rowTotal = SECTORS.reduce(
                  (acc, s) => acc + (trendMap[s.slug]?.[m]?.resolvidos ?? 0), 0
                );
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
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/dashboard?m=${m}`}
                        className={clsx(
                          'font-medium transition-colors hover:text-orange-600 dark:hover:text-orange-400',
                          isSelected
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-gray-700 dark:text-slate-300'
                        )}
                      >
                        {formatMonth(m)}
                      </Link>
                    </td>
                    {SECTORS.map((s) => {
                      const v = trendMap[s.slug]?.[m]?.resolvidos ?? 0;
                      return (
                        <td key={s.slug} className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-slate-300">
                          {v > 0 ? v : <span className="text-gray-200 dark:text-slate-800">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-5 py-2.5 text-right tabular-nums font-semibold text-gray-900 dark:text-slate-100">
                      {rowTotal > 0 ? rowTotal : <span className="text-gray-200 dark:text-slate-800">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Histórico: SLA % por setor ─────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
          Histórico — SLA % por Setor
        </h2>
        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800/50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">Mês</th>
                {SECTORS.map((s) => (
                  <th key={s.slug} className="text-right px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap">
                    {s.name}
                  </th>
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
                    <td className="px-5 py-2.5 whitespace-nowrap">
                      <Link
                        href={`/dashboard?m=${m}`}
                        className={clsx(
                          'font-medium transition-colors hover:text-orange-600 dark:hover:text-orange-400',
                          isSelected
                            ? 'text-orange-600 dark:text-orange-400'
                            : 'text-gray-700 dark:text-slate-300'
                        )}
                      >
                        {formatMonth(m)}
                      </Link>
                    </td>
                    {SECTORS.map((s) => (
                      <td key={s.slug} className="px-4 py-2.5 text-right">
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
                <p className="text-xs text-orange-100 dark:text-slate-600">SAFs · SLA · CSAT por mês</p>
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
