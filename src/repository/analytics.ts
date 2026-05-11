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
  resolvidos: number;
  slaRate: number | null;
}

export async function getMonthlySectorStats(monthsBack = 12): Promise<MonthlyStats[]> {
  const SLA_START = '2026-05-01';
  const interval  = `(($1 - 1) || ' months')::interval`;

  const [openedRows, resolvedRows] = await Promise.all([
    query<{ month: string; department: string; abertos: string }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', opened_at), 'YYYY-MM') AS month,
         department,
         COUNT(*) AS abertos
       FROM saf_tickets
       WHERE opened_at >= DATE_TRUNC('month', NOW()) - ${interval}
         AND opened_at IS NOT NULL
         AND department IS NOT NULL
       GROUP BY 1, 2
       ORDER BY 1 DESC, 2`,
      [monthsBack]
    ),
    query<{
      month: string;
      department: string;
      resolvidos: string;
      with_deadline: string;
      within_sla: string;
    }>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', resolved_at), 'YYYY-MM') AS month,
         department,
         COUNT(*) AS resolvidos,
         COUNT(*) FILTER (WHERE due_at IS NOT NULL) AS with_deadline,
         COUNT(*) FILTER (WHERE due_at IS NOT NULL AND resolved_at <= due_at) AS within_sla
       FROM saf_tickets
       WHERE status = 'resolvido'
         AND resolved_at IS NOT NULL
         AND resolved_at >= DATE_TRUNC('month', NOW()) - ${interval}
         AND opened_at >= $2::date
         AND department IS NOT NULL
       GROUP BY 1, 2
       ORDER BY 1 DESC, 2`,
      [monthsBack, SLA_START]
    ),
  ]);

  const map = new Map<string, {
    abertos: number; resolvidos: number; withDeadline: number; withinSla: number;
  }>();

  const ensure = (month: string, slug: string) => {
    const k = `${month}|${slug}`;
    if (!map.has(k)) map.set(k, { abertos: 0, resolvidos: 0, withDeadline: 0, withinSla: 0 });
    return map.get(k)!;
  };

  for (const row of openedRows) {
    for (const slug of DEPT_TO_SECTORS.get(row.department) ?? []) {
      ensure(row.month, slug).abertos += Number(row.abertos);
    }
  }

  for (const row of resolvedRows) {
    for (const slug of DEPT_TO_SECTORS.get(row.department) ?? []) {
      const e = ensure(row.month, slug);
      e.resolvidos   += Number(row.resolvidos);
      e.withDeadline += Number(row.with_deadline);
      e.withinSla    += Number(row.within_sla);
    }
  }

  const result: MonthlyStats[] = [];
  for (const [k, v] of map) {
    const [month, sectorSlug] = k.split('|');
    result.push({
      month,
      sectorSlug,
      abertos:    v.abertos,
      resolvidos: v.resolvidos,
      slaRate:    v.withDeadline > 0
        ? Math.round(100 * v.withinSla / v.withDeadline)
        : null,
    });
  }

  return result.sort((a, b) =>
    b.month.localeCompare(a.month) || a.sectorSlug.localeCompare(b.sectorSlug)
  );
}
