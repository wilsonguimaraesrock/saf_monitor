/**
 * Dashboard genérico por setor — Server Component.
 * Usado para todos os setores exceto PD&I (que tem página própria).
 */

import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, AlertTriangle, Clock, CheckCircle2, LayoutGrid } from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { FilterCardWrapper } from '@/components/FilterCardWrapper';
import { RefreshButton } from '@/components/RefreshButton';
import { ScraperTriggerButton } from '@/components/ScraperTriggerButton';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { TicketTable } from '@/components/TicketTable';
import { ClusterList } from '@/components/ClusterList';
import { Filters } from '@/components/Filters';
import { SlaPanel } from '@/components/SlaPanel';
import { getSectorBySlug } from '@/lib/sectors';
import {
  getSectorStats,
  getSectorOverdueTickets,
  getSectorAwaitingTickets,
  getSectorOldestTickets,
  getSectorNotOpenedTickets,
  getSectorNoResponseTickets,
  getSectorTicketsFiltered,
  getSectorDeptBreakdown,
  getSectorClusters,
  getSectorSlaStats,
} from '@/repository/sectors';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    status?: string;
    franchise?: string;
    overdue?: string;
    awaiting?: string;
    no_response?: string;
    month?: string;
    sort?: string;
  }>;
}

async function SectorContent({ params, searchParams }: PageProps) {
  const { slug }  = await params;
  const sp        = await searchParams;
  const sector    = getSectorBySlug(slug);
  if (!sector) notFound();

  const monthDateFrom = sp.month ? `${sp.month}-01` : undefined;
  const monthDateTo   = sp.month
    ? (() => {
        const [y, m] = sp.month.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        return `${sp.month}-${String(last).padStart(2, '0')}`;
      })()
    : undefined;

  const filters = {
    status:              sp.status,
    franchise:           sp.franchise,
    isOverdue:           sp.overdue      === 'true' ? true : undefined,
    awaitingOurResponse: sp.awaiting     === 'true' ? true : undefined,
    noResponseStatus:    sp.no_response  === 'true' ? true : undefined,
    dateFrom:            monthDateFrom,
    dateTo:              monthDateTo,
    sortOrder:           (sp.sort === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
    limit: 200,
  };

  const hasSpecificFilter = !!(
    filters.status || filters.franchise || filters.isOverdue ||
    filters.awaitingOurResponse || filters.noResponseStatus ||
    filters.dateFrom || filters.dateTo
  );

  const depts = sector.departments;

  const [stats, overdue, awaiting, oldest, notOpened, noResp, deptBreakdown, clusters, allTickets, slaStats] =
    await Promise.all([
      getSectorStats(depts, { dateFrom: monthDateFrom, dateTo: monthDateTo }) as Promise<Record<string, string> | null>,
      getSectorOverdueTickets(depts, 10),
      getSectorAwaitingTickets(depts, 10),
      getSectorOldestTickets(depts, 5),
      getSectorNotOpenedTickets(depts, 20),
      getSectorNoResponseTickets(depts, 20),
      getSectorDeptBreakdown(depts, { dateFrom: monthDateFrom, dateTo: monthDateTo }),
      getSectorClusters(depts, 15),
      getSectorTicketsFiltered(depts, filters),
      getSectorSlaStats(depts),
    ]);

  const s = {
    totalOpen:            Number(stats?.total_open            ?? 0),
    totalOverdue:         Number(stats?.total_overdue         ?? 0),
    totalAwaiting:        Number(stats?.total_awaiting        ?? 0),
    totalAwaitingSchool:  Number(stats?.total_awaiting_school ?? 0),
    totalResolvedToday:   Number(stats?.total_resolved_today  ?? 0),
    totalNotOpened:       Number(stats?.total_not_opened      ?? 0),
    totalNoResponseStatus:Number(stats?.total_no_response_status ?? 0),
  };

  const noFilter    = !hasSpecificFilter && !sp.sort;
  const ovActive    = sp.overdue      === 'true';
  const awActive    = sp.awaiting     === 'true';
  const noRespActive= sp.no_response  === 'true';
  const statusAberto= sp.status       === 'aberto';
  const sortOrder   = sp.sort === 'asc' ? 'asc' : 'desc';

  const mainTableTitle = (() => {
    const parts: string[] = [];
    if (ovActive)      parts.push('Atrasados');
    if (awActive)      parts.push('Aguardando Nossa Resp.');
    if (noRespActive)  parts.push('Sem Status de Resposta');
    if (statusAberto)  parts.push('Ainda Não Abertos');
    if (sp.franchise)  parts.push(`Franquia: ${sp.franchise}`);
    if (sp.status && !statusAberto) parts.push(sp.status);
    if (sp.month) parts.push(`Mês: ${sp.month}`);
    const label = parts.length > 0 ? parts.join(' + ') : `Todos os SAFs — ${sector.name}`;
    const order = sortOrder === 'asc' ? '↑ mais antigos primeiro' : '↓ mais recentes primeiro';
    return `${label} — ${order} (${allTickets.length})`;
  })();

  const SectorIcon = sector.icon;

  return (
    <div className="space-y-6">

      {/* ── Cards principais ───────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FilterCardWrapper clearAll isActive={noFilter}>
          <StatCard label="Todos" value={s.totalOpen} icon={LayoutGrid} variant="default" subtitle="tickets abertos" />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="overdue" filterValue="true" isActive={ovActive}>
          <StatCard label="Atrasados" value={s.totalOverdue} icon={AlertTriangle} variant={s.totalOverdue > 0 ? 'critical' : 'success'} />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="awaiting" filterValue="true" isActive={awActive}>
          <StatCard label="Aguard. nossa resp." value={s.totalAwaiting} icon={Clock} variant={s.totalAwaiting > 0 ? 'warning' : 'success'} />
        </FilterCardWrapper>
        <StatCard label="Resolvidos hoje" value={s.totalResolvedToday} icon={CheckCircle2} variant="success" />
      </div>

      {/* ── Breakdown por departamento ─────────────────────── */}
      {(deptBreakdown as { department: string; total: string }[]).length > 1 && (
        <div className="card">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
            Por departamento
          </p>
          <div className="flex flex-wrap gap-2">
            {(deptBreakdown as { department: string; total: string }[]).map((d) => (
              <span key={d.department}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300">
                {d.department}
                <span className="font-bold text-gray-900 dark:text-slate-100">{d.total}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── SLA ────────────────────────────────────────────── */}
      <SlaPanel sla={slaStats} />

      {/* ── Filtros ────────────────────────────────────────── */}
      <div className="card">
        <Filters />
      </div>

      {/* ── Tabela principal ───────────────────────────────── */}
      <TicketTable tickets={allTickets as never} title={mainTableTitle} highlightOverdue />

      {/* ── Tabelas fixas ──────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={overdue  as never} title="SAFs Atrasados"              emptyMessage="Nenhum SAF atrasado"           highlightOverdue />
        <TicketTable tickets={awaiting as never} title="Aguardando Nossa Resposta"   emptyMessage="Nada aguardando nossa resposta" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={oldest   as never} title="Mais Antigos (ainda abertos)" emptyMessage="Sem tickets antigos" />
        <TicketTable tickets={notOpened as never} title="Ainda Não Abertos"           emptyMessage="Nenhum ticket sem resposta" />
      </div>
      <div className="grid grid-cols-1 gap-4">
        <TicketTable tickets={noResp as never} title="Sem Status de Resposta (limbo)" emptyMessage="Todos têm status definido" />
      </div>

      <ClusterList clusters={clusters as never} />

    </div>
  );
}

export default async function SectorPage(props: PageProps) {
  const { slug } = await props.params;
  const sector   = getSectorBySlug(slug);
  if (!sector) notFound();

  const SectorIcon = sector.icon;

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 bg-gradient-to-r from-orange-500 to-amber-500 border-b border-orange-600 dark:from-slate-900 dark:to-slate-900 dark:border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-orange-100 hover:text-white dark:text-slate-400 dark:hover:text-slate-200 transition-colors shrink-0">
              <ArrowLeft size={18} />
            </Link>
            <Image
              src="/logo-rockfeller-branca.png"
              alt="Rockfeller"
              width={794}
              height={77}
              className="h-[1.225rem] w-auto"
              priority
            />
            <div className="w-px h-6 bg-orange-300/50 dark:bg-slate-700" />
            <div className="flex items-center gap-2">
              <span className="live-dot" />
              <div>
                <div className="flex items-center gap-2">
                  <SectorIcon size={14} className="text-orange-200 dark:text-gray-500" />
                  <h1 className="text-base font-bold text-white dark:text-slate-100 leading-tight">
                    {sector.name} — Monitoramento de SAFs
                  </h1>
                </div>
                <p className="text-xs text-orange-100 dark:text-slate-600">
                  {sector.departments.join(' · ')}
                </p>
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
          <SectorContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
