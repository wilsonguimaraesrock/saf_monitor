/**
 * Dashboard PD&I — Server Component.
 *
 * Totais principais (total, atrasados, aguardando, etc.) usam filtro por
 * `department` — igual à landing page — para números consistentes.
 * Breakdown por categoria (DSA JOY, MyRock…) usa priority_category.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertTriangle, Clock, CheckCircle2,
  Gamepad2, Monitor, BookOpen, Mail, LayoutGrid, School,
  ArrowLeft, FlaskConical,
} from 'lucide-react';
import { StatCard } from '@/components/StatCard';
import { FilterCardWrapper } from '@/components/FilterCardWrapper';
import { RefreshButton } from '@/components/RefreshButton';
import { ScraperTriggerButton } from '@/components/ScraperTriggerButton';
import { DarkModeToggle } from '@/components/DarkModeToggle';
import { TicketTable } from '@/components/TicketTable';
import { TrendChart } from '@/components/TrendChart';
import { CategoryChart } from '@/components/CategoryChart';
import { ClusterList } from '@/components/ClusterList';
import { Filters } from '@/components/Filters';
import { SlaPanel } from '@/components/SlaPanel';
import { SectorChatwootLiveSection } from '@/components/SectorChatwootLiveSection';
import { getSectorBySlug } from '@/lib/sectors';
import {
  getSectorStats,
  getSectorCategoryStats,
  getSectorOverdueTickets,
  getSectorAwaitingTickets,
  getSectorOldestTickets,
  getSectorNotOpenedTickets,
  getSectorNoResponseTickets,
  getSectorTicketsFiltered,
  getSectorSlaStats,
} from '@/repository/sectors';
import { getChatwootPanelData, getOpenConversations } from '@/integrations/chatwoot';
import {
  getCriticalTickets,
  getTrendData,
} from '@/repository/tickets';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    category?: string;
    status?: string;
    franchise?: string;
    overdue?: string;
    awaiting?: string;
    critical?: string;
    no_response?: string;
    month?: string;
    sort?: string;
  }>;
}

async function PdiContent({ searchParams }: PageProps) {
  const params = await searchParams;

  const sector = getSectorBySlug('pd-i')!;
  const depts  = sector.departments;
  const chatwoot = sector.chatwoot!;

  const monthDateFrom = params.month ? `${params.month}-01` : undefined;
  const monthDateTo   = params.month
    ? (() => {
        const [y, m] = params.month.split('-').map(Number);
        const last = new Date(y, m, 0).getDate();
        return `${params.month}-${String(last).padStart(2, '0')}`;
      })()
    : undefined;

  const filters = {
    status:              params.status,
    category:            params.category,
    franchise:           params.franchise,
    isOverdue:           params.overdue      === 'true' ? true : undefined,
    awaitingOurResponse: params.awaiting     === 'true' ? true : undefined,
    noResponseStatus:    params.no_response  === 'true' ? true : undefined,
    dateFrom:            monthDateFrom,
    dateTo:              monthDateTo,
    sortOrder:           (params.sort === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
    limit: 200,
  };

  const hasSpecificFilter = !!(
    filters.status || filters.category || filters.franchise ||
    filters.isOverdue || filters.awaitingOurResponse ||
    filters.noResponseStatus || filters.dateFrom || filters.dateTo
  );

  // Totais principais — filtro por department (igual à landing)
  // Breakdown por categoria — filtro por priority_category (mais confiável para DSA JOY / MyRock)
  const [sectorStats, catStats, oldest, overdue, awaiting, critical, notOpened, noRespStatus, trend, clusters, allTickets, slaStats, chatwootData, openConversations] =
    await Promise.all([
      getSectorStats(depts, { dateFrom: monthDateFrom, dateTo: monthDateTo }) as Promise<Record<string, string> | null>,
      getSectorCategoryStats(depts, { dateFrom: monthDateFrom, dateTo: monthDateTo }) as Promise<Record<string, string> | null>,
      getSectorOldestTickets(depts, 5),
      getSectorOverdueTickets(depts, 10),
      getSectorAwaitingTickets(depts, 10),
      getCriticalTickets(10),
      getSectorNotOpenedTickets(depts, 20),
      getSectorNoResponseTickets(depts, 20),
      getTrendData(14),
      query('SELECT * FROM saf_clusters ORDER BY ticket_count DESC LIMIT 15'),
      getSectorTicketsFiltered(depts, filters),
      getSectorSlaStats(depts),
      getChatwootPanelData(chatwoot.inboxId, chatwoot.inboxName),
      getOpenConversations(chatwoot.inboxId),
    ]);

  const s = {
    totalOpen:             Number(sectorStats?.total_open             ?? 0),
    totalOverdue:          Number(sectorStats?.total_overdue          ?? 0),
    totalAwaiting:         Number(sectorStats?.total_awaiting         ?? 0),
    totalResolvedToday:    Number(sectorStats?.total_resolved_today   ?? 0),
    totalAwaitingSchool:   Number(sectorStats?.total_awaiting_school  ?? 0),
    totalNotOpened:        Number(sectorStats?.total_not_opened       ?? 0),
    totalNoResponseStatus: Number(sectorStats?.total_no_response_status ?? 0),
    // Breakdown por categoria (priority_category)
    countDsaJoy:           Number(catStats?.count_dsa_joy             ?? 0),
    countMyrock:           Number(catStats?.count_myrock              ?? 0),
    countPlataformasAulas: Number(catStats?.count_plataformas_aulas   ?? 0),
    countSuporteEmails:    Number(catStats?.count_suporte_emails      ?? 0),
  };

  const countOutros = Math.max(0, s.totalOpen - s.countDsaJoy - s.countMyrock - s.countPlataformasAulas - s.countSuporteEmails);

  const noFilter   = !hasSpecificFilter && !params.sort;
  const ovActive   = params.overdue  === 'true';
  const awActive   = params.awaiting === 'true';
  const catDsa     = params.category === 'dsa_joy';
  const catRock    = params.category === 'myrock';
  const catPlat    = params.category === 'plataformas_aulas';
  const catEmail   = params.category === 'suporte_emails';
  const noRespActive = params.no_response === 'true';
  const statusAberto = params.status === 'aberto';
  const sortOrder    = params.sort === 'asc' ? 'asc' : 'desc';

  const mainTableTitle = (() => {
    const parts: string[] = [];
    if (ovActive)      parts.push('Atrasados');
    if (awActive)      parts.push('Aguardando Nossa Resp.');
    if (noRespActive)  parts.push('Sem Status de Resposta');
    if (statusAberto)  parts.push('Ainda Não Abertos');
    if (catDsa)        parts.push('DSA JOY');
    if (catRock)       parts.push('MyRock');
    if (catPlat)       parts.push('Plataformas de Aulas');
    if (catEmail)      parts.push('Suporte Emails');
    if (params.franchise) parts.push(`Franquia: ${params.franchise}`);
    if (params.status && !statusAberto) parts.push(params.status);
    if (params.month) parts.push(`Mês: ${params.month}`);
    const label = parts.length > 0 ? parts.join(' + ') : 'Todos os SAFs PD&I';
    const order = sortOrder === 'asc' ? '↑ mais antigos primeiro' : '↓ mais recentes primeiro';
    return `${label} — ${order} (${allTickets.length})`;
  })();

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <FilterCardWrapper clearAll isActive={noFilter}>
          <StatCard label="Todos" value={s.totalOpen} icon={LayoutGrid} variant="default" subtitle="tickets abertos" />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="overdue" filterValue="true" isActive={ovActive}>
          <StatCard label="Atrasados" value={s.totalOverdue} icon={AlertTriangle} variant={s.totalOverdue > 0 ? 'critical' : 'success'} />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="awaiting" filterValue="true" isActive={awActive}>
          <StatCard label="Aguard. nossa resp." value={s.totalAwaiting} icon={Clock} variant={s.totalAwaiting > 0 ? 'warning' : 'success'} />
        </FilterCardWrapper>
        <StatCard label="Aguardando escola" value={s.totalAwaitingSchool} icon={School} variant={s.totalAwaitingSchool > 0 ? 'warning' : 'success'} />
        <StatCard label="Resolvidos hoje" value={s.totalResolvedToday} icon={CheckCircle2} variant="success" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FilterCardWrapper filterKey="category" filterValue="dsa_joy" isActive={catDsa}>
          <StatCard label="DSA JOY" value={s.countDsaJoy} icon={Monitor} variant="purple" />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="category" filterValue="myrock" isActive={catRock}>
          <StatCard label="MyRock" value={s.countMyrock} icon={Gamepad2} variant="orange" />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="category" filterValue="plataformas_aulas" isActive={catPlat}>
          <StatCard label="Plataformas Aulas" value={s.countPlataformasAulas} icon={BookOpen} variant="cyan" />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="category" filterValue="suporte_emails" isActive={catEmail}>
          <StatCard label="Suporte Emails" value={s.countSuporteEmails} icon={Mail} variant="emerald" />
        </FilterCardWrapper>
      </div>

      <SectorChatwootLiveSection
        sectorSlug={sector.slug}
        inboxName={chatwoot.inboxName}
        initialPanelData={chatwootData}
        initialOpenConversations={openConversations}
        initialRefreshedAt={new Date().toISOString()}
      >
        <SlaPanel sla={slaStats} />
      </SectorChatwootLiveSection>

      <div className="card">
        <Filters />
      </div>

      <TicketTable tickets={allTickets as never} title={mainTableTitle} highlightOverdue />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TrendChart data={trend as never} />
        <CategoryChart
          dsaJoy={s.countDsaJoy}
          myrock={s.countMyrock}
          plataformasAulas={s.countPlataformasAulas}
          suporteEmails={s.countSuporteEmails}
          outros={countOutros}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={overdue  as never} title="SAFs Atrasados"                   emptyMessage="Nenhum SAF atrasado" highlightOverdue />
        <TicketTable tickets={awaiting as never} title="Aguardando Nossa Resposta"         emptyMessage="Nada aguardando nossa resposta" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={oldest   as never} title="SAFs Mais Antigos (ainda abertos)" emptyMessage="Sem tickets antigos" />
        <TicketTable tickets={critical as never} title="Tickets Críticos (score ≥ 70)"     emptyMessage="Sem tickets críticos" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={notOpened    as never} title="Ainda Não Abertos"          emptyMessage="Nenhum ticket sem resposta" />
        <TicketTable tickets={noRespStatus as never} title="Sem Status de Resposta"     emptyMessage="Todos têm status definido" />
      </div>

      <ClusterList clusters={clusters as never} />
    </div>
  );
}

export default function PdiPage(props: PageProps) {
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
                  <FlaskConical size={14} className="text-orange-200 dark:text-purple-500" />
                  <h1 className="text-base font-bold text-white dark:text-slate-100 leading-tight">
                    PD&amp;I — Monitoramento de SAFs
                  </h1>
                </div>
                <p className="text-xs text-orange-100 dark:text-slate-600">Dados em tempo real</p>
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
          <PdiContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
