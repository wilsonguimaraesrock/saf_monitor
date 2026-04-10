/**
 * Dashboard principal — Server Component.
 */

import { Suspense } from 'react';
import {
  AlertTriangle, Clock, Inbox, Zap, CheckCircle2,
  Timer, TrendingUp, Gamepad2, Monitor, BookOpen, Mail, LayoutGrid,
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
import {
  getDashboardStats,
  getOldestTickets,
  getOverdueTickets,
  getAwaitingTickets,
  getCriticalTickets,
  getTrendData,
  getTicketsFiltered,
} from '@/repository/tickets';
import { query } from '@/lib/db';

interface PageProps {
  searchParams: Promise<{
    category?: string;
    status?: string;
    franchise?: string;
    overdue?: string;
    awaiting?: string;
    critical?: string;
    dateFrom?: string;
    dateTo?: string;
    sort?: string;
  }>;
}

async function DashboardContent({ searchParams }: PageProps) {
  const params = await searchParams;

  const filters = {
    status:              params.status,
    category:            params.category,
    franchise:           params.franchise,
    isOverdue:           params.overdue   === 'true' ? true : undefined,
    awaitingOurResponse: params.awaiting  === 'true' ? true : undefined,
    isCritical:          params.critical  === 'true' ? true : undefined,
    dateFrom:            params.dateFrom,
    dateTo:              params.dateTo,
    sortOrder:           (params.sort === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc',
    limit: 200,
  };

  // Filtros "específicos" ativam o painel de resultado em vez das tabelas fixas
  const hasSpecificFilter = !!(
    filters.status || filters.category || filters.franchise ||
    filters.isOverdue || filters.awaitingOurResponse || filters.isCritical ||
    filters.dateFrom || filters.dateTo
  );

  const [stats, oldest, overdue, awaiting, critical, trend, clusters, allTickets] =
    await Promise.all([
      getDashboardStats() as Promise<Record<string, string> | null>,
      getOldestTickets(5),
      getOverdueTickets(10),
      getAwaitingTickets(10),
      getCriticalTickets(10),
      getTrendData(14),
      query('SELECT * FROM saf_clusters ORDER BY ticket_count DESC LIMIT 15'),
      // Sempre busca lista principal com ordenação configurável
      getTicketsFiltered(filters),
    ]);

  const s = {
    totalOpen:             Number(stats?.total_open             ?? 0),
    totalOverdue:          Number(stats?.total_overdue          ?? 0),
    totalAwaiting:         Number(stats?.total_awaiting         ?? 0),
    totalCritical:         Number(stats?.total_critical         ?? 0),
    totalResolvedToday:    Number(stats?.total_resolved_today   ?? 0),
    avgResponseHours:      Number(stats?.avg_response_hours     ?? 0),
    avgResolutionHours:    Number(stats?.avg_resolution_hours   ?? 0),
    countDsaJoy:           Number(stats?.count_dsa_joy          ?? 0),
    countMyrock:           Number(stats?.count_myrock           ?? 0),
    countPlataformasAulas: Number(stats?.count_plataformas_aulas ?? 0),
    countSuporteEmails:    Number(stats?.count_suporte_emails   ?? 0),
  };

  const countOutros = Math.max(0, s.totalOpen - s.countDsaJoy - s.countMyrock - s.countPlataformasAulas - s.countSuporteEmails);

  // Active states computados no servidor
  const noFilter   = !hasSpecificFilter && !params.sort;
  const ovActive   = params.overdue  === 'true';
  const awActive   = params.awaiting === 'true';
  const crActive   = params.critical === 'true';
  const catDsa     = params.category === 'dsa_joy';
  const catRock    = params.category === 'myrock';
  const catPlat    = params.category === 'plataformas_aulas';
  const catEmail   = params.category === 'suporte_emails';
  const sortOrder  = params.sort === 'asc' ? 'asc' : 'desc';

  const mainTableTitle = (() => {
    const parts: string[] = [];
    if (ovActive)  parts.push('Atrasados');
    if (awActive)  parts.push('Aguardando Nossa Resp.');
    if (crActive)  parts.push('Críticos');
    if (catDsa)    parts.push('DSA JOY');
    if (catRock)   parts.push('MyRock');
    if (catPlat)   parts.push('Plataformas de Aulas');
    if (catEmail)  parts.push('Suporte Emails');
    if (params.franchise) parts.push(`Franquia: ${params.franchise}`);
    if (params.status)    parts.push(params.status);
    if (params.dateFrom || params.dateTo) parts.push('Período filtrado');
    const label = parts.length > 0 ? parts.join(' + ') : 'Todos os SAFs';
    const order = sortOrder === 'asc' ? '↑ mais antigos primeiro' : '↓ mais recentes primeiro';
    return `${label} — ${order} (${allTickets.length})`;
  })();

  return (
    <div className="space-y-6">

      {/* ── Cards principais (filtráveis) ─────────────────────── */}
      {/* Grid 12 colunas: cards principais ocupam 2 cols, cards de tempo 1 col */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-12 gap-3">

        {/* Todos — reseta filtros (xl:col-span-2) */}
        <div className="col-span-1 sm:col-span-1 xl:col-span-2">
          <FilterCardWrapper clearAll isActive={noFilter}>
            <StatCard label="Todos" value={s.totalOpen} icon={LayoutGrid} variant="default" subtitle="tickets abertos"
              tooltip="Total de tickets abertos nos últimos 3 meses (status diferente de Resolvido e Cancelado)." />
          </FilterCardWrapper>
        </div>

        <div className="col-span-1 sm:col-span-1 xl:col-span-2">
          <FilterCardWrapper filterKey="overdue" filterValue="true" isActive={ovActive}>
            <StatCard label="Atrasados" value={s.totalOverdue} icon={AlertTriangle} variant={s.totalOverdue > 0 ? 'critical' : 'success'}
              tooltip="Tickets em aberto cujo prazo (SLA) já venceu. Calculado a partir da coluna 'Prazo' do dfranquias." />
          </FilterCardWrapper>
        </div>

        <div className="col-span-1 sm:col-span-1 xl:col-span-2">
          <FilterCardWrapper filterKey="awaiting" filterValue="true" isActive={awActive}>
            <StatCard label="Aguard. nossa resp." value={s.totalAwaiting} icon={Clock} variant={s.totalAwaiting > 0 ? 'warning' : 'success'}
              tooltip="Tickets com 'Status resp.' = Aguardando Franqueadora, ou seja, a bola está com o nosso time (Rockfeller) para responder." />
          </FilterCardWrapper>
        </div>

        <div className="col-span-1 sm:col-span-1 xl:col-span-2">
          <FilterCardWrapper filterKey="critical" filterValue="true" isActive={crActive}>
            <StatCard label="Críticos" value={s.totalCritical} icon={Zap} variant={s.totalCritical > 0 ? 'critical' : 'success'}
              tooltip="Tickets com score de prioridade ≥ 70. O score combina: atraso, dias aberto, tempo aguardando nossa resp. e categoria." />
          </FilterCardWrapper>
        </div>

        <div className="col-span-2 sm:col-span-2 xl:col-span-2">
          <StatCard label="Resolvidos hoje" value={s.totalResolvedToday} icon={CheckCircle2} variant="success"
            tooltip="Tickets cuja data de resolução (resolved_at) é hoje. Atualizado a cada coleta do scraper." />
        </div>

        {/* Cards de tempo — compactos (xl:col-span-1) */}
        <div className="col-span-1 sm:col-span-1 xl:col-span-1">
          <StatCard compact label="Resp. média" value={`${s.avgResponseHours.toFixed(1)}h`} icon={Timer} variant="default"
            tooltip="Tempo médio (em horas) que os tickets ficam aguardando nossa resposta." />
        </div>

        <div className="col-span-1 sm:col-span-1 xl:col-span-1">
          <StatCard compact label="Resol. média" value={`${s.avgResolutionHours.toFixed(1)}h`} icon={TrendingUp} variant="default"
            tooltip="Tempo médio (em horas) do total de dias aberto dos tickets já resolvidos." />
        </div>
      </div>

      {/* ── Cards por categoria (filtráveis) ─────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <FilterCardWrapper filterKey="category" filterValue="dsa_joy" isActive={catDsa}>
          <StatCard label="DSA JOY" value={s.countDsaJoy} icon={Monitor} variant="purple"
            tooltip="Tickets classificados na categoria DSA JOY — problemas relacionados ao sistema de gestão DSA." />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="category" filterValue="myrock" isActive={catRock}>
          <StatCard label="MyRock" value={s.countMyrock} icon={Gamepad2} variant="orange"
            tooltip="Tickets relacionados à plataforma MyRock (app do aluno e franqueado)." />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="category" filterValue="plataformas_aulas" isActive={catPlat}>
          <StatCard label="Plataformas Aulas" value={s.countPlataformasAulas} icon={BookOpen} variant="cyan"
            tooltip="Tickets sobre plataformas de aulas online (Zoom, gravações, acesso a cursos, etc.)." />
        </FilterCardWrapper>
        <FilterCardWrapper filterKey="category" filterValue="suporte_emails" isActive={catEmail}>
          <StatCard label="Suporte Emails" value={s.countSuporteEmails} icon={Mail} variant="emerald"
            tooltip="Tickets de suporte por e-mail — configuração, acesso e problemas com contas de e-mail das franquias." />
        </FilterCardWrapper>
      </div>

      {/* ── Filtros avançados + ordenação ────────────────────── */}
      <div className="card">
        <Filters />
      </div>

      {/* ── Tabela principal (sempre visível, ordenada por data) ─ */}
      <TicketTable
        tickets={allTickets as never}
        title={mainTableTitle}
        highlightOverdue
      />

      {/* ── Gráficos ─────────────────────────────────────────── */}
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

      {/* ── Tabelas fixas ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={overdue  as never} title="SAFs Atrasados"                    emptyMessage="Nenhum SAF atrasado"             highlightOverdue />
        <TicketTable tickets={awaiting as never} title="Aguardando Nossa Resposta"          emptyMessage="Nada aguardando nossa resposta" />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <TicketTable tickets={oldest   as never} title="SAFs Mais Antigos (ainda abertos)"  emptyMessage="Sem tickets antigos" />
        <TicketTable tickets={critical as never} title="Tickets Críticos (score ≥ 70)"      emptyMessage="Sem tickets críticos" />
      </div>

      {/* ── Clusters ─────────────────────────────────────────── */}
      <ClusterList clusters={clusters as never} />
    </div>
  );
}

export default function DashboardPage(props: PageProps) {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border-b border-gray-200 dark:border-slate-800">
        <div className="max-w-screen-2xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="live-dot" />
            <div>
              <h1 className="text-base font-bold text-gray-900 dark:text-slate-100 leading-tight">
                Monitoramento de SAFs
              </h1>
              <p className="text-xs text-gray-400 dark:text-slate-600">Dados em tempo real</p>
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
        <Suspense
          fallback={
            <div className="flex items-center justify-center h-64 text-gray-400 dark:text-slate-600 text-sm">
              Carregando dados...
            </div>
          }
        >
          <DashboardContent {...props} />
        </Suspense>
      </div>
    </main>
  );
}
