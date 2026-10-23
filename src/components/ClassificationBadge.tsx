'use client';

import type { Prioridade, Complexidade } from '@/repository/conversationClassification';

export const PRIORIDADE_OPTIONS: { value: Prioridade; label: string; color: string; dot: string }[] = [
  {
    value: 'urgente',
    label: 'Urgente',
    color: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-900/60',
    dot: 'bg-red-500',
  },
  {
    value: 'alta',
    label: 'Alta',
    color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-900/60',
    dot: 'bg-orange-500',
  },
  {
    value: 'media',
    label: 'Média',
    color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60',
    dot: 'bg-amber-500',
  },
  {
    value: 'baixa',
    label: 'Baixa',
    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60',
    dot: 'bg-emerald-500',
  },
];

export const COMPLEXIDADE_OPTIONS: { value: Complexidade; label: string; shortLabel: string; color: string }[] = [
  {
    value: 'alta',
    label: 'Complexidade Alta',
    shortLabel: 'Comp. Alta',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-900/60',
  },
  {
    value: 'media',
    label: 'Complexidade Média',
    shortLabel: 'Comp. Média',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60',
  },
  {
    value: 'baixa',
    label: 'Complexidade Baixa',
    shortLabel: 'Comp. Baixa',
    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  },
];

export function PriorityBadge({
  prioridade,
  className = '',
}: {
  prioridade: Prioridade | null | undefined;
  className?: string;
}) {
  if (!prioridade) return null;
  const opt = PRIORIDADE_OPTIONS.find((o) => o.value === prioridade);
  if (!opt) return null;

  return (
    <span
      title={`Prioridade: ${opt.label}`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${opt.color} ${className}`.trim()}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${opt.dot} shrink-0`} />
      {opt.label}
    </span>
  );
}

export function ComplexityBadge({
  complexidade,
  short = true,
  className = '',
}: {
  complexidade: Complexidade | null | undefined;
  short?: boolean;
  className?: string;
}) {
  if (!complexidade) return null;
  const opt = COMPLEXIDADE_OPTIONS.find((o) => o.value === complexidade);
  if (!opt) return null;

  return (
    <span
      title={`Complexidade: ${opt.label}`}
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${opt.color} ${className}`.trim()}
    >
      {short ? opt.shortLabel : opt.label}
    </span>
  );
}
