'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';

interface Props {
  currentMonth: string; // "YYYY-MM"
  isCurrentMonth: boolean;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nowYM(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function MonthPickerNav({ currentMonth, isCurrentMonth }: Props) {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  function go(ym: string) {
    const next = new URLSearchParams(params.toString());
    if (ym === nowYM()) {
      next.delete('month');
    } else {
      next.set('month', ym);
    }
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const prev = shiftMonth(currentMonth, -1);
  const next = shiftMonth(currentMonth, +1);
  const canGoNext = !isCurrentMonth;

  return (
    <div className="flex items-center gap-1 bg-white/10 dark:bg-slate-800/60 rounded-lg px-1 py-0.5">
      <button
        onClick={() => go(prev)}
        className="p-1 rounded text-orange-100 dark:text-slate-400 hover:text-white dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-700 transition-colors"
        aria-label="Mês anterior"
      >
        <ChevronLeft size={15} />
      </button>

      <div className="flex items-center gap-1.5 px-1.5">
        <CalendarDays size={13} className={isCurrentMonth ? 'text-orange-200 dark:text-slate-400' : 'text-amber-300 dark:text-amber-400'} />
        <span className="text-sm font-semibold text-white dark:text-slate-100 capitalize min-w-[120px] text-center">
          {monthLabel(currentMonth)}
        </span>
        {!isCurrentMonth && (
          <span className="text-xs bg-amber-400 text-amber-900 font-bold px-1.5 py-0.5 rounded leading-none">
            histórico
          </span>
        )}
      </div>

      <button
        onClick={() => go(next)}
        disabled={!canGoNext}
        className="p-1 rounded text-orange-100 dark:text-slate-400 hover:text-white dark:hover:text-slate-200 hover:bg-white/20 dark:hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-default"
        aria-label="Próximo mês"
      >
        <ChevronRight size={15} />
      </button>
    </div>
  );
}
