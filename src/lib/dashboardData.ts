/**
 * Fonte única dos números do dashboard.
 *
 * Três consumidores dependem destes valores: a página /dashboard, a API
 * /api/v1/dashboard e a página pública /publico/dashboard. A agregação vivia
 * dentro do componente da página; foi extraída para cá para os três mostrarem
 * exatamente o mesmo número — duplicar a matemática garantiria divergência.
 */

import { SECTORS } from '@/lib/sectors';
import { getMonthlySectorStats, type MonthlyStats } from '@/repository/analytics';
import {
  getCsatForPeriod,
  getWhatsappHandlingStats,
  type ChatwootHandlingStats,
} from '@/integrations/chatwoot';
import { memoize } from '@/lib/memoCache';

/**
 * Montar o dashboard custa ~10s: uma consulta pesada ao banco mais 18 chamadas
 * ao Chatwoot (o endpoint de CSAT chega a levar 7s por setor). São indicadores
 * agregados por mês, que não mudam de forma perceptível em poucos minutos, e há
 * três consumidores — a página /dashboard, a API e a página pública, esta última
 * recarregando sozinha numa TV. Sem cache compartilhado, cada carregamento
 * repetiria a amplificação de requisições que sobrecarrega o Chatwoot.
 */
const DASHBOARD_TTL_MS = 3 * 60_000;

export const MONTH_NAMES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/** Últimos 12 meses em "YYYY-MM", do mais recente para o mais antigo. */
export function getLast12Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

export function formatMonth(m: string): string {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES_PT[Number(month) - 1]} ${year}`;
}

/** Limites epoch (segundos) do mês, para os relatórios do Chatwoot. */
export function monthBounds(month: string): { since: number; until: number } {
  const [year, m] = month.split('-').map(Number);
  const start = new Date(Date.UTC(year, m - 1, 1));
  const end   = new Date(Date.UTC(year, m, 1));
  return { since: Math.floor(start.getTime() / 1000), until: Math.floor(end.getTime() / 1000) - 1 };
}

/** Aceita "YYYY-MM"; qualquer outra coisa cai no mês corrente. */
export function normalizeMonth(param?: string | null): string {
  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [, m] = param.split('-').map(Number);
    if (m >= 1 && m <= 12) return param;
  }
  return getLast12Months()[0];
}

export interface WaSectorStats {
  slug: string;
  csat: { avg: number | null; total: number };
  handling: ChatwootHandlingStats;
}

export interface DashboardTotals {
  abertos: number;
  resolvidos: number;
  aguardandoNos: number;
  aguardandoFranquia: number;
  withDeadline: number;
  withinSla: number;
  tmaSum: number;
  tmaCount: number;
}

export interface DashboardData {
  month: string;
  months: string[];
  timestamp: string;
  statsBySector: Record<string, MonthlyStats>;
  waBySector: Record<string, WaSectorStats>;
  /** sectorSlug → mês → stats (séries dos últimos 12 meses) */
  trendMap: Record<string, Record<string, MonthlyStats>>;
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

export async function getDashboardData(monthParam?: string | null): Promise<DashboardData> {
  const month = normalizeMonth(monthParam);
  return memoize(`dashboard:${month}`, DASHBOARD_TTL_MS, () => buildDashboardData(month));
}

async function buildDashboardData(month: string): Promise<DashboardData> {
  const { since, until } = monthBounds(month);
  const months = getLast12Months();

  const [allStats, waResults] = await Promise.all([
    getMonthlySectorStats(12),
    Promise.all(
      SECTORS
        .filter((s) => s.chatwoot)
        .map(async (s): Promise<WaSectorStats> => {
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

  const trendMap: Record<string, Record<string, MonthlyStats>> = {};
  for (const s of allStats) {
    if (!trendMap[s.sectorSlug]) trendMap[s.sectorSlug] = {};
    trendMap[s.sectorSlug][s.month] = s;
  }

  const totals = SECTORS.reduce<DashboardTotals>(
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
        // ponderado pelo nº de SAFs resolvidos de cada setor
        tmaSum:             acc.tmaSum + (st.avgResolutionSec ?? 0) * st.resolvidos,
        tmaCount:           acc.tmaCount + (st.avgResolutionSec !== null ? st.resolvidos : 0),
      };
    },
    { abertos: 0, resolvidos: 0, aguardandoNos: 0, aguardandoFranquia: 0,
      withDeadline: 0, withinSla: 0, tmaSum: 0, tmaCount: 0 }
  );

  const resolutionRate = totals.abertos > 0
    ? Math.round((100 * totals.resolvidos) / totals.abertos)
    : null;
  const globalSla = totals.withDeadline > 0
    ? Math.round((100 * totals.withinSla) / totals.withDeadline)
    : null;
  const globalSafTma = totals.tmaCount > 0
    ? Math.round(totals.tmaSum / totals.tmaCount)
    : null;

  // WhatsApp global — médias ponderadas pelo volume de cada setor
  const csatSum   = waResults.reduce((a, r) => a + (r.csat.avg ?? 0) * r.csat.total, 0);
  const csatCount = waResults.reduce((a, r) => a + r.csat.total, 0);
  const globalCsat = csatCount > 0 ? Math.round((csatSum / csatCount) * 10) / 10 : null;

  const tmaSum   = waResults.reduce((a, r) => a + (r.handling.avgResolutionSec ?? 0) * r.handling.resolutionsCount, 0);
  const tmaCount = waResults.reduce((a, r) => a + (r.handling.avgResolutionSec ? r.handling.resolutionsCount : 0), 0);
  const globalTma = tmaCount > 0 ? Math.round(tmaSum / tmaCount) : null;

  const waConversations = waResults.reduce((a, r) => a + r.handling.conversationsCount, 0);

  return {
    month, months, timestamp: new Date().toISOString(),
    statsBySector, waBySector, trendMap, totals,
    resolutionRate, globalSla, globalSafTma,
    globalCsat, csatCount, globalTma, tmaCount, waConversations,
  };
}

// ──────────────────────────────────────────────────────────────────────
// Serialização para a API pública
// ──────────────────────────────────────────────────────────────────────

/**
 * Converte para um payload estável e autoexplicativo, pensado para ser
 * consumido por outra aplicação. Nomes em português seguindo os rótulos do
 * dashboard, e tempos sempre em segundos (o consumidor formata como quiser).
 */
export function toPublicPayload(d: DashboardData) {
  return {
    mes: d.month,
    atualizadoEm: d.timestamp,
    indicadoresGlobais: {
      safsAbertos:          d.totals.abertos,
      safsResolvidos:       d.totals.resolvidos,
      percentualResolvidos: d.resolutionRate,
      aguardandoNos:        d.totals.aguardandoNos,
      aguardandoFranquia:   d.totals.aguardandoFranquia,
      slaNoPrazoPercentual: d.globalSla,
      safsTempoMedioSeg:    d.globalSafTma,
      whatsappConversas:    d.waConversations,
      whatsappCsatMedio:    d.globalCsat,
      whatsappCsatAvaliacoes: d.csatCount,
      whatsappTempoMedioSeg:  d.globalTma,
      whatsappResolvidas:     d.tmaCount,
    },
    setores: SECTORS.map((sector) => {
      const st = d.statsBySector[sector.slug];
      const wa = d.waBySector[sector.slug];
      return {
        slug: sector.slug,
        nome: sector.name,
        safs: {
          abertos:              st?.abertos ?? 0,
          resolvidos:           st?.resolvidos ?? 0,
          percentualResolvidos: st && st.abertos > 0
            ? Math.round((100 * st.resolvidos) / st.abertos)
            : null,
          aguardandoNos:        st?.aguardandoNos ?? 0,
          aguardandoFranquia:   st?.aguardandoFranquia ?? 0,
          slaNoPrazoPercentual: st?.slaRate ?? null,
          tempoMedioSeg:        st?.avgResolutionSec ?? null,
        },
        whatsapp: wa
          ? {
              conversas:      wa.handling.conversationsCount,
              resolvidas:     wa.handling.resolutionsCount,
              csatMedio:      wa.csat.avg,
              csatAvaliacoes: wa.csat.total,
              tempoMedioSeg:  wa.handling.avgResolutionSec,
              primeiraRespostaSeg: wa.handling.avgFirstResponseSec,
            }
          : null,
      };
    }),
    // Série dos últimos 12 meses, do mais antigo para o mais recente —
    // ordem natural para plotar num gráfico.
    historico: [...d.months].reverse().map((m) => ({
      mes: m,
      setores: SECTORS.map((sector) => {
        const st = d.trendMap[sector.slug]?.[m];
        return {
          slug: sector.slug,
          abertos:              st?.abertos ?? 0,
          resolvidos:           st?.resolvidos ?? 0,
          slaNoPrazoPercentual: st?.slaRate ?? null,
          tempoMedioSeg:        st?.avgResolutionSec ?? null,
        };
      }),
    })),
  };
}
