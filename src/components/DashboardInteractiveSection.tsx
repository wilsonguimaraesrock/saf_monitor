'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  FileSpreadsheet,
  FileDown,
  Calendar,
  Filter,
  Check,
  Loader2,
  AlertCircle,
  Inbox,
  CircleCheckBig,
  BarChart3,
  Clock,
  Building2,
  ShieldCheck,
  Star,
  Timer,
  MessageSquare,
  Sparkles,
  ChevronDown,
  X,
} from 'lucide-react';
import { clsx } from 'clsx';
import { SECTORS } from '@/lib/sectors';
import {
  exportDashboardCsv,
  exportDashboardPdf,
  fmtDurationExport,
  type ExportRowData,
  type ExportTotalsData,
  type ExportReportPayload,
} from '@/lib/exportUtils';
import { formatMonth } from '@/lib/month';
import type { WaSectorStats, DashboardTotals } from '@/lib/dashboardData';

interface DashboardStatsItem {
  abertos: number;
  resolvidos: number;
  aguardandoNos: number;
  aguardandoFranquia: number;
  withDeadline?: number;
  withinSla?: number;
  slaRate: number | null;
  avgResolutionSec: number | null;
}

interface DashboardInteractiveData {
  statsBySector: Record<string, DashboardStatsItem>;
  waBySector: Record<string, WaSectorStats>;
  totals: DashboardTotals;
  resolutionRate: number | null;
  globalSla: number | null;
  globalSafTma: number | null;
  globalCsat: number | null;
  csatCount: number;
  globalTma: number | null;
  tmaCount: number;
  waConversations: number;
}

interface DashboardInteractiveSectionProps {
  currentMonth: string; // e.g. "2026-11"
  availableMonths: string[];
  initialData: DashboardInteractiveData;
}

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
  goodSec?: number;
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
      {fmtDurationExport(sec)}
      {!!count && count > 0 && <span className="text-sm font-normal opacity-60">({count})</span>}
    </span>
  );
}

const SAF_TMA = { goodSec: 48 * 3600, warnSec: 120 * 3600 };
const TH = 'px-3 py-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 whitespace-nowrap';
const TD_NUM = 'px-3 py-4 text-center tabular-nums text-lg font-semibold';
const WA_ZONE  = 'bg-green-50/60 dark:bg-green-950/20';
const WA_EDGE  = 'border-l-2 border-green-300 dark:border-green-800/70';

export function DashboardInteractiveSection({
  currentMonth,
  availableMonths,
  initialData,
}: DashboardInteractiveSectionProps) {
  // Estado de controle de filtros
  const [periodType, setPeriodType] = useState<'month' | 'custom'>('month');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Período personalizado (default: mês atual)
  const [customStart, setCustomStart] = useState<string>(() => {
    const [y, m] = currentMonth.split('-');
    return `${y}-${m}-01`;
  });
  const [customEnd, setCustomEnd] = useState<string>(() => {
    const [y, m] = currentMonth.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  });

  // Filtro de Departamento
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [filterOnScreen, setFilterOnScreen] = useState<boolean>(true);

  // Dados ativos
  const [activeData, setActiveData] = useState<DashboardInteractiveData>(initialData);
  const [activeLabel, setActiveLabel] = useState<string>(formatMonth(currentMonth));

  // Estados de carregamento e exportação
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Carrega dados de período customizado ou outro mês
  const handleApplyCustomPeriod = async (start: string, end: string, label: string) => {
    if (!start || !end) {
      setErrorMessage('Por favor, informe a data inicial e final.');
      return;
    }
    if (start > end) {
      setErrorMessage('A data inicial não pode ser posterior à data final.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/dashboard/export-data?startDate=${start}&endDate=${end}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Falha ao buscar dados do período');
      }
      const data = await res.json();
      setActiveData(data);
      setActiveLabel(label || `${start} a ${end}`);
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleMonthChange = async (monthVal: string) => {
    setSelectedMonth(monthVal);
    if (monthVal === currentMonth) {
      setActiveData(initialData);
      setActiveLabel(formatMonth(currentMonth));
      setErrorMessage(null);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/dashboard/export-data?month=${monthVal}`);
      if (!res.ok) throw new Error('Falha ao carregar dados do mês selecionado');
      const data = await res.json();
      setActiveData(data);
      setActiveLabel(formatMonth(monthVal));
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  // Atalhos rápidos de data
  const handlePreset = (preset: 'current' | 'prev' | 'last30' | 'last90') => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const toYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (preset === 'current') {
      const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
      const end = toYMD(now);
      setCustomStart(start);
      setCustomEnd(end);
      handleApplyCustomPeriod(start, end, `Este mês (${pad(now.getMonth() + 1)}/${now.getFullYear()})`);
    } else if (preset === 'prev') {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-01`;
      const lastDay = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
      const end = `${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}-${pad(lastDay)}`;
      setCustomStart(start);
      setCustomEnd(end);
      handleApplyCustomPeriod(start, end, `Mês anterior (${formatMonth(`${prevDate.getFullYear()}-${pad(prevDate.getMonth() + 1)}`)})`);
    } else if (preset === 'last30') {
      const past = new Date(now.getTime() - 30 * 86400 * 1000);
      const start = toYMD(past);
      const end = toYMD(now);
      setCustomStart(start);
      setCustomEnd(end);
      handleApplyCustomPeriod(start, end, 'Últimos 30 dias');
    } else if (preset === 'last90') {
      const past = new Date(now.getTime() - 90 * 86400 * 1000);
      const start = toYMD(past);
      const end = toYMD(now);
      setCustomStart(start);
      setCustomEnd(end);
      handleApplyCustomPeriod(start, end, 'Últimos 90 dias');
    }
  };

  // Disparo de exportação
  const handleExport = (type: 'csv' | 'pdf') => {
    setExportStatus(`Gerando ${type.toUpperCase()}...`);

    let rows: ExportRowData[] = [];
    if (selectedSector === 'all') {
      rows = SECTORS.map((s) => {
        const st = activeData.statsBySector[s.slug];
        const wa = activeData.waBySector[s.slug];
        const rate = st && st.abertos > 0 ? Math.round((100 * st.resolvidos) / st.abertos) : null;
        return {
          sectorSlug: s.slug,
          sectorName: s.name,
          abertos: st?.abertos ?? 0,
          resolvidos: st?.resolvidos ?? 0,
          resolutionRate: rate,
          aguardandoNos: st?.aguardandoNos ?? 0,
          aguardandoFranquia: st?.aguardandoFranquia ?? 0,
          slaRate: st?.slaRate ?? null,
          safTmaSec: st?.avgResolutionSec ?? null,
          waConversations: wa?.handling.conversationsCount ?? 0,
          waCsatAvg: wa?.csat.avg ?? null,
          waCsatCount: wa?.csat.total ?? 0,
          waTmaSec: wa?.handling.avgResolutionSec ?? null,
          waResolutionsCount: wa?.handling.resolutionsCount ?? 0,
        };
      });
    } else {
      const s = SECTORS.find((sec) => sec.slug === selectedSector);
      if (s) {
        const st = activeData.statsBySector[s.slug];
        const wa = activeData.waBySector[s.slug];
        const rate = st && st.abertos > 0 ? Math.round((100 * st.resolvidos) / st.abertos) : null;
        rows = [
          {
            sectorSlug: s.slug,
            sectorName: s.name,
            abertos: st?.abertos ?? 0,
            resolvidos: st?.resolvidos ?? 0,
            resolutionRate: rate,
            aguardandoNos: st?.aguardandoNos ?? 0,
            aguardandoFranquia: st?.aguardandoFranquia ?? 0,
            slaRate: st?.slaRate ?? null,
            safTmaSec: st?.avgResolutionSec ?? null,
            waConversations: wa?.handling.conversationsCount ?? 0,
            waCsatAvg: wa?.csat.avg ?? null,
            waCsatCount: wa?.csat.total ?? 0,
            waTmaSec: wa?.handling.avgResolutionSec ?? null,
            waResolutionsCount: wa?.handling.resolutionsCount ?? 0,
          },
        ];
      }
    }

    let totalsData: ExportTotalsData;
    if (selectedSector === 'all') {
      totalsData = {
        abertos: activeData.totals.abertos,
        resolvidos: activeData.totals.resolvidos,
        resolutionRate: activeData.resolutionRate,
        aguardandoNos: activeData.totals.aguardandoNos,
        aguardandoFranquia: activeData.totals.aguardandoFranquia,
        slaRate: activeData.globalSla,
        safTmaSec: activeData.globalSafTma,
        waConversations: activeData.waConversations,
        waCsatAvg: activeData.globalCsat,
        waCsatCount: activeData.csatCount,
        waTmaSec: activeData.globalTma,
        waResolutionsCount: activeData.tmaCount,
      };
    } else {
      const r = rows[0];
      totalsData = {
        abertos: r?.abertos ?? 0,
        resolvidos: r?.resolvidos ?? 0,
        resolutionRate: r?.resolutionRate ?? null,
        aguardandoNos: r?.aguardandoNos ?? 0,
        aguardandoFranquia: r?.aguardandoFranquia ?? 0,
        slaRate: r?.slaRate ?? null,
        safTmaSec: r?.safTmaSec ?? null,
        waConversations: r?.waConversations ?? 0,
        waCsatAvg: r?.waCsatAvg ?? null,
        waCsatCount: r?.waCsatCount ?? 0,
        waTmaSec: r?.waTmaSec ?? null,
        waResolutionsCount: r?.waResolutionsCount ?? 0,
      };
    }

    const selectedSectorObj = SECTORS.find((s) => s.slug === selectedSector);
    const selectedSectorName = selectedSectorObj ? selectedSectorObj.name : 'Todos os Setores';

    const payload: ExportReportPayload = {
      periodLabel: activeLabel,
      selectedSectorSlug: selectedSector,
      selectedSectorName,
      generatedAt: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      totals: totalsData,
      rows,
    };

    try {
      if (type === 'csv') {
        exportDashboardCsv(payload);
      } else {
        exportDashboardPdf(payload);
      }
      setExportStatus('Relatório exportado com sucesso!');
    } catch (err) {
      console.error(err);
      setErrorMessage(`Erro ao gerar ${type.toUpperCase()}: ${(err as Error).message}`);
    } finally {
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

  // Determina quais setores exibir na tabela e nos KPIs com base no filtro
  const displayedSectors = filterOnScreen && selectedSector !== 'all'
    ? SECTORS.filter((s) => s.slug === selectedSector)
    : SECTORS;

  // KPIs exibidos na tela (se filtrado por setor, mostra métricas do setor; se 'all', mostra globais)
  const currentKpiView = (() => {
    if (!filterOnScreen || selectedSector === 'all') {
      return {
        abertos: activeData.totals.abertos,
        resolvidos: activeData.totals.resolvidos,
        resolutionRate: activeData.resolutionRate,
        aguardandoNos: activeData.totals.aguardandoNos,
        aguardandoFranquia: activeData.totals.aguardandoFranquia,
        slaRate: activeData.globalSla,
        csatAvg: activeData.globalCsat,
        csatCount: activeData.csatCount,
        tmaSec: activeData.globalTma,
        tmaCount: activeData.tmaCount,
      };
    }
    const st = activeData.statsBySector[selectedSector];
    const wa = activeData.waBySector[selectedSector];
    const rate = st && st.abertos > 0 ? Math.round((100 * st.resolvidos) / st.abertos) : null;
    return {
      abertos: st?.abertos ?? 0,
      resolvidos: st?.resolvidos ?? 0,
      resolutionRate: rate,
      aguardandoNos: st?.aguardandoNos ?? 0,
      aguardandoFranquia: st?.aguardandoFranquia ?? 0,
      slaRate: st?.slaRate ?? null,
      csatAvg: wa?.csat.avg ?? null,
      csatCount: wa?.csat.total ?? 0,
      tmaSec: wa?.handling.avgResolutionSec ?? null,
      tmaCount: wa?.handling.resolutionsCount ?? 0,
    };
  })();

  const selectedSectorObj = SECTORS.find((s) => s.slug === selectedSector);

  return (
    <div className="space-y-6">

      {/* ── ÁREA DE EXPORTAÇÃO E FILTROS DO RELATÓRIO ──────────────── */}
      <section
        id="area-exportacao-relatorio"
        className="rounded-2xl border-2 border-orange-500/20 dark:border-orange-500/30 bg-gradient-to-br from-orange-50/60 via-white to-amber-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 shadow-md p-5 transition-all"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-200/80 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-orange-600 text-white shadow-sm shadow-orange-600/30">
              <FileDown size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">
                  Exportar Relatório do Dashboard
                </h3>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">
                  <Sparkles size={11} /> CSV & PDF
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
                Escolha o período e o departamento para exportar os indicadores e métricas exibidos na tela.
              </p>
            </div>
          </div>

          {/* Botões de Ação de Exportação */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleExport('csv')}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white shadow-sm transition-all disabled:opacity-50 disabled:pointer-events-none"
              title="Exportar planilha formatada em CSV (compatível com Excel)"
            >
              <FileSpreadsheet size={16} />
              <span>Exportar CSV</span>
            </button>

            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-orange-600 hover:bg-orange-500 active:scale-95 text-white shadow-sm shadow-orange-600/30 transition-all disabled:opacity-50 disabled:pointer-events-none"
              title="Exportar documento executivo em PDF (Landscape A4)"
            >
              <FileDown size={16} />
              <span>Exportar PDF</span>
            </button>
          </div>
        </div>

        {/* Linha de Controles de Filtro */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">

          {/* 1. Seleção de Tipo de Período */}
          <div className="md:col-span-5 space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar size={13} className="text-orange-600 dark:text-orange-400" />
                Período
              </label>
              <div className="flex items-center gap-1 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPeriodType('month')}
                  className={clsx(
                    'px-2 py-0.5 rounded transition-colors font-medium',
                    periodType === 'month'
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-slate-400'
                  )}
                >
                  Por Mês
                </button>
                <span className="text-gray-300 dark:text-slate-700">|</span>
                <button
                  type="button"
                  onClick={() => setPeriodType('custom')}
                  className={clsx(
                    'px-2 py-0.5 rounded transition-colors font-medium',
                    periodType === 'custom'
                      ? 'bg-orange-600 text-white'
                      : 'text-gray-500 hover:text-gray-800 dark:text-slate-400'
                  )}
                >
                  Datas Livres
                </button>
              </div>
            </div>

            {periodType === 'month' ? (
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  disabled={isLoading}
                  className="w-full h-10 px-3 pr-8 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-gray-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {formatMonth(m)} {m === currentMonth ? '(Mês Atual na Tela)' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-gray-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <span className="text-xs text-gray-400 font-bold">até</span>
                <div className="flex-1">
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full h-10 px-2.5 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-gray-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const fmt = (dStr: string) => {
                      const [y, m, d] = dStr.split('-');
                      return `${d}/${m}/${y}`;
                    };
                    handleApplyCustomPeriod(customStart, customEnd, `${fmt(customStart)} a ${fmt(customEnd)}`);
                  }}
                  disabled={isLoading}
                  className="h-10 px-3 rounded-xl bg-gray-900 dark:bg-slate-700 hover:bg-gray-800 dark:hover:bg-slate-600 text-white text-xs font-semibold shrink-0 transition-colors"
                >
                  Aplicar
                </button>
              </div>
            )}

            {/* Presets rápidos */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-gray-400 dark:text-slate-500 font-medium mr-0.5">Atalhos:</span>
              <button
                type="button"
                onClick={() => handlePreset('current')}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 transition-colors"
              >
                Este Mês
              </button>
              <button
                type="button"
                onClick={() => handlePreset('prev')}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 transition-colors"
              >
                Mês Anterior
              </button>
              <button
                type="button"
                onClick={() => handlePreset('last30')}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 transition-colors"
              >
                Últimos 30d
              </button>
              <button
                type="button"
                onClick={() => handlePreset('last90')}
                className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-gray-100 dark:bg-slate-800 hover:bg-orange-100 dark:hover:bg-slate-700 text-gray-700 dark:text-slate-300 transition-colors"
              >
                Últimos 90d
              </button>
            </div>
          </div>

          {/* 2. Filtro de Departamento / Setor */}
          <div className="md:col-span-4 space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-slate-300 flex items-center gap-1.5">
              <Filter size={13} className="text-orange-600 dark:text-orange-400" />
              Departamento / Setor
            </label>
            <div className="relative">
              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="w-full h-10 px-3 pr-8 rounded-xl border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-gray-800 dark:text-slate-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              >
                <option value="all">Todos os Departamentos / Setores ({SECTORS.length})</option>
                {SECTORS.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={filterOnScreen}
                  onChange={(e) => setFilterOnScreen(e.target.checked)}
                  className="rounded border-gray-300 text-orange-600 focus:ring-orange-500/30"
                />
                <span>Filtrar também tabela e cards abaixo</span>
              </label>

              {selectedSector !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedSector('all')}
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-600 dark:text-orange-400 hover:underline ml-auto"
                >
                  <X size={11} />
                  <span>Limpar filtro</span>
                </button>
              )}
            </div>
          </div>

          {/* 3. Feedback e Resumo da Seleção */}
          <div className="md:col-span-3 flex flex-col justify-end space-y-1.5">
            <div className="rounded-xl bg-white/80 dark:bg-slate-800/80 border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-slate-500">
                Escopo do Relatório
              </p>
              <p className="font-semibold text-gray-800 dark:text-slate-100 truncate mt-0.5">
                {selectedSectorObj ? selectedSectorObj.name : 'Todos os Setores (9)'}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate">
                Período: <span className="font-semibold text-orange-600 dark:text-orange-400">{activeLabel}</span>
              </p>
            </div>
          </div>

        </div>

        {/* Alertas de Status / Erro */}
        {isLoading && (
          <div className="mt-3.5 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-orange-100/70 dark:bg-orange-950/40 text-orange-800 dark:text-orange-300 text-xs font-semibold animate-pulse">
            <Loader2 size={14} className="animate-spin" />
            <span>Carregando dados consolidados do período selecionado...</span>
          </div>
        )}

        {exportStatus && (
          <div className="mt-3.5 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
            <Check size={14} />
            <span>{exportStatus}</span>
          </div>
        )}

        {errorMessage && (
          <div className="mt-3.5 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-red-100 dark:bg-red-950/40 text-red-800 dark:text-red-300 text-xs font-semibold">
            <AlertCircle size={14} />
            <span>{errorMessage}</span>
          </div>
        )}
      </section>

      {/* ── INDICADORES DO PERÍODO SELECIONADO ──────────────────────── */}
      <div>
        <div className="flex items-baseline justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
              {activeLabel}
            </h2>
            {selectedSectorObj && filterOnScreen && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300">
                Setor: {selectedSectorObj.name}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-slate-500">
            SAFs contados pelo período de abertura
          </p>
        </div>

        <div className="flex flex-wrap items-stretch gap-3">
          {/* SAFs */}
          <div className="flex-[6] min-w-[560px] grid grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi
              label="SAFs abertos"
              value={currentKpiView.abertos}
              icon={Inbox}
              tone="slate"
              sub="abertos no período"
            />
            <Kpi
              label="Resolvidos"
              value={currentKpiView.resolvidos}
              icon={CircleCheckBig}
              tone="emerald"
              sub="resolvidos no período"
            />
            <Kpi
              label="% resolvidos"
              value={currentKpiView.resolutionRate !== null ? `${currentKpiView.resolutionRate}%` : '—'}
              icon={BarChart3}
              tone="blue"
              sub="do que abriu no período"
            />
            <Kpi
              label="Aguard. nós"
              value={currentKpiView.aguardandoNos}
              icon={Clock}
              tone="amber"
              sub="pendente conosco"
            />
            <Kpi
              label="Aguard. franquia"
              value={currentKpiView.aguardandoFranquia}
              icon={Building2}
              tone="orange"
              sub="pendente com a franquia"
            />
            <Kpi
              label="SLA no prazo"
              value={currentKpiView.slaRate !== null ? `${currentKpiView.slaRate}%` : '—'}
              icon={ShieldCheck}
              tone="violet"
              sub="resolvidos no prazo"
            />
          </div>

          {/* Divisor SAFs | WhatsApp */}
          <div className="hidden xl:flex flex-col items-center justify-center gap-2 px-1">
            <div className="w-px flex-1 bg-gray-200 dark:bg-slate-800" />
            <MessageSquare size={13} className="text-green-600 dark:text-green-500 shrink-0" />
            <div className="w-px flex-1 bg-gray-200 dark:bg-slate-800" />
          </div>

          {/* WhatsApp */}
          <div className="flex-[2] min-w-[220px] grid grid-cols-2 gap-3">
            <Kpi
              label="CSAT WhatsApp"
              value={currentKpiView.csatAvg !== null ? currentKpiView.csatAvg : '—'}
              icon={Star}
              tone="emerald"
              sub={currentKpiView.csatCount > 0 ? `${currentKpiView.csatCount} avaliações` : 'sem avaliações'}
            />
            <Kpi
              label="TMA WhatsApp"
              value={fmtDurationExport(currentKpiView.tmaSec)}
              icon={Timer}
              tone="blue"
              sub={currentKpiView.tmaCount > 0 ? `${currentKpiView.tmaCount} resolvidas` : 'sem resoluções'}
            />
          </div>
        </div>
      </div>

      {/* ── TABELA DETALHADA POR SETOR ──────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Por setor — {activeLabel}
          </h2>
          {selectedSector !== 'all' && filterOnScreen && (
            <span className="text-xs text-orange-600 dark:text-orange-400 font-semibold">
              Exibindo 1 de {SECTORS.length} setores
            </span>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-slate-800 overflow-x-auto bg-white dark:bg-slate-900 shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                <th rowSpan={2} className={clsx(TH, 'text-left align-bottom')}>Setor</th>
                <th colSpan={7} className="px-4 pt-3 pb-1 text-center text-xs font-bold uppercase tracking-widest text-gray-400 dark:text-slate-500 border-b border-gray-100 dark:border-slate-800">
                  SAFs
                </th>
                <th colSpan={3} className={clsx(
                  'px-4 pt-3 pb-1 text-center text-xs font-bold uppercase tracking-widest',
                  'text-green-700 dark:text-green-400 border-b border-gray-100 dark:border-slate-800',
                  WA_ZONE, WA_EDGE
                )}>
                  <span className="inline-flex items-center gap-1.5">
                    <MessageSquare size={12} /> WhatsApp
                  </span>
                </th>
              </tr>
              <tr className="bg-gray-50 dark:bg-slate-800/50 border-b border-gray-100 dark:border-slate-800">
                <th className={clsx(TH, 'text-center')}>Abertos</th>
                <th className={clsx(TH, 'text-center')}>Resolvidos</th>
                <th className={clsx(TH, 'text-center')}>% Resolv.</th>
                <th className={clsx(TH, 'text-center')}>Aguard. nós</th>
                <th className={clsx(TH, 'text-center')}>Aguard. franquia</th>
                <th className={clsx(TH, 'text-center')}>SLA</th>
                <th className={clsx(TH, 'text-center')}>Tempo médio</th>
                <th className={clsx(TH, 'text-center', WA_ZONE, WA_EDGE)}>Conversas</th>
                <th className={clsx(TH, 'text-center', WA_ZONE)}>CSAT</th>
                <th className={clsx(TH, 'text-center', WA_ZONE)}>Tempo médio</th>
              </tr>
            </thead>
            <tbody>
              {displayedSectors.map((sector, i) => {
                const st   = activeData.statsBySector[sector.slug];
                const wa   = activeData.waBySector[sector.slug];
                const Icon = sector.icon;
                const rate = st && st.abertos > 0
                  ? Math.round((100 * st.resolvidos) / st.abertos)
                  : null;
                return (
                  <tr
                    key={sector.slug}
                    className={clsx(
                      'transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/40',
                      i < displayedSectors.length - 1 && 'border-b border-gray-50 dark:border-slate-800/60'
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
                    <td className="px-3 py-4 text-center">
                      <SlaCell rate={st?.slaRate ?? null} />
                    </td>
                    <td className="px-3 py-4 text-center">
                      <TmaCell sec={st?.avgResolutionSec ?? null} {...SAF_TMA} />
                    </td>
                    <td className={clsx(TD_NUM, WA_ZONE, WA_EDGE, (wa?.handling.conversationsCount ?? 0) > 0 ? 'text-gray-900 dark:text-slate-100' : 'text-gray-300 dark:text-slate-700')}>
                      {wa?.handling.conversationsCount ?? <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </td>
                    <td className={clsx('px-3 py-4 text-center', WA_ZONE)}>
                      <CsatCell avg={wa?.csat.avg ?? null} total={wa?.csat.total ?? 0} />
                    </td>
                    <td className={clsx('px-3 py-4 text-center', WA_ZONE)}>
                      <TmaCell sec={wa?.handling.avgResolutionSec ?? null} count={wa?.handling.resolutionsCount ?? 0} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {/* Totalizador (exibido quando todos os setores estão visíveis) */}
            {displayedSectors.length > 1 && (
              <tfoot>
                <tr className="border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
                  <td className="px-4 py-4 text-sm font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">Total</td>
                  <td className={clsx(TD_NUM, 'text-xl text-gray-900 dark:text-slate-100')}>{activeData.totals.abertos}</td>
                  <td className={clsx(TD_NUM, 'text-xl text-emerald-600 dark:text-emerald-400')}>{activeData.totals.resolvidos}</td>
                  <td className={clsx(TD_NUM, 'text-xl text-gray-600 dark:text-slate-300')}>
                    {activeData.resolutionRate !== null ? `${activeData.resolutionRate}%` : '—'}
                  </td>
                  <td className={clsx(TD_NUM, 'text-xl text-amber-600 dark:text-amber-400')}>{activeData.totals.aguardandoNos}</td>
                  <td className={clsx(TD_NUM, 'text-xl text-orange-600 dark:text-orange-400')}>{activeData.totals.aguardandoFranquia}</td>
                  <td className="px-3 py-4 text-center">
                    <SlaCell rate={activeData.globalSla} />
                  </td>
                  <td className="px-3 py-4 text-center">
                    <TmaCell sec={activeData.globalSafTma} {...SAF_TMA} />
                  </td>
                  <td className={clsx(TD_NUM, 'text-xl text-gray-900 dark:text-slate-100', WA_ZONE, WA_EDGE)}>
                    {activeData.waConversations}
                  </td>
                  <td className={clsx('px-3 py-4 text-center', WA_ZONE)}>
                    <CsatCell avg={activeData.globalCsat} total={activeData.csatCount} />
                  </td>
                  <td className={clsx('px-3 py-4 text-center', WA_ZONE)}>
                    <TmaCell sec={activeData.globalTma} count={activeData.tmaCount} />
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="mt-2 text-xs text-gray-400 dark:text-slate-500">
          Resolvidos = SAFs abertos <strong>e</strong> resolvidos dentro do período. SAFs abertos em períodos
          anteriores não entram na contagem, mesmo que resolvidos no período filtrado.
          Tempo médio de atendimento dos SAFs = abertura → resolução em horário útil (fim de semana não conta).
          Do lado do WhatsApp, conversas, CSAT e tempo médio vêm do relatório do Chatwoot (tempo corrido).
        </p>
      </div>

    </div>
  );
}
