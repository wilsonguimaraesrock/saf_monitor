export function parseMonthParam(param?: string): {
  start: Date;
  end: Date;
  ym: string;
  isCurrentMonth: boolean;
} {
  const now = new Date();
  let year  = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (param && /^\d{4}-\d{2}$/.test(param)) {
    const [y, m] = param.split('-').map(Number);
    year = y; month = m - 1;
  }

  const start = new Date(year, month, 1);
  const end   = new Date(year, month + 1, 1);
  const ym    = `${year}-${String(month + 1).padStart(2, '0')}`;
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  return { start, end, ym, isCurrentMonth };
}
