import { query } from '../lib/db';
import { SECTORS } from '../lib/sectors';

// Um departamento pode pertencer a mais de um setor (ex: "Relacionamento" → Operações e MKT)
const DEPT_TO_SECTORS = new Map<string, string[]>();
for (const s of SECTORS) {
  for (const d of s.departments) {
    const existing = DEPT_TO_SECTORS.get(d) ?? [];
    if (!existing.includes(s.slug)) DEPT_TO_SECTORS.set(d, [...existing, s.slug]);
  }
}

export interface MonthlyStats {
  month: string;        // "2026-04"
  sectorSlug: string;
  abertos: number;
  /** Resolvidos DENTRO do próprio mês de abertura */
  resolvidos: number;
  /** Abertos no mês que seguem aguardando nossa resposta */
  aguardandoNos: number;
  /** Abertos no mês que seguem aguardando a franquia */
  aguardandoFranquia: number;
  /** Resolvidos no mês que tinham prazo definido (base do SLA) */
  withDeadline: number;
  /** Desses, quantos foram resolvidos dentro do prazo */
  withinSla: number;
  slaRate: number | null;
}

/**
 * Estatísticas mensais por setor.
 *
 * Tudo é agrupado pelo mês de ABERTURA do SAF: um SAF aberto em abril e
 * resolvido em maio conta como aberto em abril e não entra em nenhuma
 * contagem de resolvidos de maio.
 */
export async function getMonthlySectorStats(monthsBack = 12): Promise<MonthlyStats[]> {
  const SLA_START = '2026-05-01';
  const interval  = `(($1 - 1) || ' months')::interval`;

  const rows = await query<{
    month: string;
    department: string;
    abertos: string;
    resolvidos: string;
    aguardando_nos: string;
    aguardando_franquia: string;
    with_deadline: string;
    within_sla: string;
  }>(
    `WITH t AS (
       SELECT
         department,
         opened_at,
         resolved_at,
         due_at,
         status,
         awaiting_our_response,
         (status = 'resolvido'
          AND resolved_at IS NOT NULL
          AND resolved_at < DATE_TRUNC('month', opened_at) + INTERVAL '1 month') AS resolved_same_month
       FROM saf_tickets
       WHERE opened_at >= DATE_TRUNC('month', NOW()) - ${interval}
         AND opened_at IS NOT NULL
         AND department IS NOT NULL
     )
     SELECT
       TO_CHAR(DATE_TRUNC('month', opened_at), 'YYYY-MM') AS month,
       department,
       COUNT(*) AS abertos,
       COUNT(*) FILTER (WHERE resolved_same_month) AS resolvidos,
       COUNT(*) FILTER (WHERE awaiting_our_response
                          AND status NOT IN ('resolvido','cancelado')) AS aguardando_nos,
       COUNT(*) FILTER (WHERE status = 'aguardando_franquia') AS aguardando_franquia,
       COUNT(*) FILTER (WHERE resolved_same_month
                          AND due_at IS NOT NULL
                          AND opened_at >= $2::date) AS with_deadline,
       COUNT(*) FILTER (WHERE resolved_same_month
                          AND due_at IS NOT NULL
                          AND opened_at >= $2::date
                          AND resolved_at <= due_at) AS within_sla
     FROM t
     GROUP BY 1, 2
     ORDER BY 1 DESC, 2`,
    [monthsBack, SLA_START]
  );

  const map = new Map<string, {
    abertos: number; resolvidos: number; aguardandoNos: number;
    aguardandoFranquia: number; withDeadline: number; withinSla: number;
  }>();

  const ensure = (month: string, slug: string) => {
    const k = `${month}|${slug}`;
    if (!map.has(k)) {
      map.set(k, {
        abertos: 0, resolvidos: 0, aguardandoNos: 0,
        aguardandoFranquia: 0, withDeadline: 0, withinSla: 0,
      });
    }
    return map.get(k)!;
  };

  for (const row of rows) {
    for (const slug of DEPT_TO_SECTORS.get(row.department) ?? []) {
      const e = ensure(row.month, slug);
      e.abertos            += Number(row.abertos);
      e.resolvidos         += Number(row.resolvidos);
      e.aguardandoNos      += Number(row.aguardando_nos);
      e.aguardandoFranquia += Number(row.aguardando_franquia);
      e.withDeadline       += Number(row.with_deadline);
      e.withinSla          += Number(row.within_sla);
    }
  }

  const result: MonthlyStats[] = [];
  for (const [k, v] of map) {
    const [month, sectorSlug] = k.split('|');
    result.push({
      month,
      sectorSlug,
      abertos:            v.abertos,
      resolvidos:         v.resolvidos,
      aguardandoNos:      v.aguardandoNos,
      aguardandoFranquia: v.aguardandoFranquia,
      withDeadline:       v.withDeadline,
      withinSla:          v.withinSla,
      slaRate:    v.withDeadline > 0
        ? Math.round(100 * v.withinSla / v.withDeadline)
        : null,
    });
  }

  return result.sort((a, b) =>
    b.month.localeCompare(a.month) || a.sectorSlug.localeCompare(b.sectorSlug)
  );
}
