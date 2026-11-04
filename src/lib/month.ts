export const MONTH_NAMES_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function formatMonth(m: string): string {
  const [year, month] = m.split('-');
  return `${MONTH_NAMES_PT[Number(month) - 1]} ${year}`;
}

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

/** Returns "YYYY-MM-DD" for the first and last day of a "YYYY-MM" string. */
export function ymToDateRange(ym: string): { dateFrom: string; dateTo: string } {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { dateFrom: `${ym}-01`, dateTo: `${ym}-${String(last).padStart(2, '0')}` };
}

export function parseMonthParam(param?: string): {
  start: Date;
  end: Date;
  ym: string;
  isCurrentMonth: boolean;
} {
  const now = new Date();
  let year  = now.getUTCFullYear();
  let month = now.getUTCMonth(); // 0-indexed UTC

  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split('-').map(Number);
    year = y; month = m - 1;
  }

  const start = new Date(Date.UTC(year, month, 1));
  const end   = new Date(Date.UTC(year, month + 1, 1));
  const ym    = `${year}-${String(month + 1).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getUTCFullYear() && month === now.getUTCMonth();

  return { start, end, ym, isCurrentMonth };
}
