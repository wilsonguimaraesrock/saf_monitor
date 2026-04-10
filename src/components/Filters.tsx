'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { Filter, X, ArrowDownUp } from 'lucide-react';

const CATEGORIES = [
  { value: '',                  label: 'Todas as categorias' },
  { value: 'dsa_joy',           label: 'DSA JOY' },
  { value: 'myrock',            label: 'MyRock' },
  { value: 'plataformas_aulas', label: 'Plataformas de Aulas' },
  { value: 'suporte_emails',    label: 'Suporte Emails' },
  { value: 'outros',            label: 'Outros' },
  { value: 'nao_classificado',  label: 'Não classificado' },
];

const STATUSES = [
  { value: '',                          label: 'Todos os status' },
  { value: 'aberto',                    label: 'Aberto' },
  { value: 'em_andamento',              label: 'Em andamento' },
  { value: 'aguardando_nossa_resposta', label: 'Aguardando nossa resposta' },
  { value: 'aguardando_franquia',       label: 'Aguardando franquia' },
  { value: 'resolvido',                 label: 'Resolvido' },
];

const INPUT_CLS = `
  text-base rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500
  border border-gray-200 bg-white text-gray-700
  dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200
`.trim();

const ALL_KEYS = ['category', 'status', 'overdue', 'awaiting', 'critical', 'franchise', 'dateFrom', 'dateTo', 'sort'];

export function Filters() {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  const hasAny = ALL_KEYS.some((k) => searchParams.get(k));
  const sortOrder = searchParams.get('sort') ?? 'desc'; // default: mais recentes primeiro

  const update = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }, [router, pathname, searchParams]);

  function toggleSort() {
    update('sort', sortOrder === 'desc' ? 'asc' : 'desc');
  }

  function clearAll() { router.push(pathname); }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wide">
        <Filter size={13} />
        Filtros avançados
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        {/* Categoria */}
        <select
          value={searchParams.get('category') ?? ''}
          onChange={(e) => update('category', e.target.value)}
          className={INPUT_CLS}
        >
          {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {/* Status */}
        <select
          value={searchParams.get('status') ?? ''}
          onChange={(e) => update('status', e.target.value)}
          className={INPUT_CLS}
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* Franquia */}
        <input
          type="text"
          placeholder="Buscar franquia..."
          defaultValue={searchParams.get('franchise') ?? ''}
          onBlur={(e) => update('franchise', e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && update('franchise', (e.target as HTMLInputElement).value)}
          className={`${INPUT_CLS} w-44 placeholder:text-gray-400 dark:placeholder:text-slate-600`}
        />

        {/* Checkboxes */}
        <label className="flex items-center gap-2 text-base text-gray-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={searchParams.get('overdue') === 'true'}
            onChange={(e) => update('overdue', e.target.checked ? 'true' : '')}
            className="rounded accent-blue-600 w-4 h-4"
          />
          Atrasados
        </label>

        <label className="flex items-center gap-2 text-base text-gray-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={searchParams.get('awaiting') === 'true'}
            onChange={(e) => update('awaiting', e.target.checked ? 'true' : '')}
            className="rounded accent-blue-600 w-4 h-4"
          />
          Aguardando nós
        </label>
      </div>

      {/* Segunda linha: datas + ordem */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
          <span className="font-medium">Abertura:</span>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-sm text-gray-500 dark:text-slate-400">de</label>
          <input
            type="date"
            value={searchParams.get('dateFrom') ?? ''}
            onChange={(e) => update('dateFrom', e.target.value)}
            className={`${INPUT_CLS} text-sm`}
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-sm text-gray-500 dark:text-slate-400">até</label>
          <input
            type="date"
            value={searchParams.get('dateTo') ?? ''}
            onChange={(e) => update('dateTo', e.target.value)}
            className={`${INPUT_CLS} text-sm`}
          />
        </div>

        {/* Sort toggle */}
        <button
          onClick={toggleSort}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors
            border-gray-200 bg-white text-gray-700 hover:bg-gray-50
            dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          title={sortOrder === 'desc' ? 'Mais recentes primeiro' : 'Mais antigos primeiro'}
        >
          <ArrowDownUp size={14} />
          {sortOrder === 'desc' ? 'Mais recentes primeiro' : 'Mais antigos primeiro'}
        </button>

        {hasAny && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors"
          >
            <X size={13} />
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
