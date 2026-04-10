'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

type State = 'idle' | 'loading' | 'success' | 'error';

export function ScraperTriggerButton() {
  const [state, setState] = useState<State>('idle');

  async function handleClick() {
    if (state === 'loading') return;
    setState('loading');

    try {
      const res = await fetch('/api/scraper/trigger', { method: 'POST' });
      if (res.ok) {
        setState('success');
        // Volta ao idle após 6 min (tempo do scraper terminar)
        setTimeout(() => setState('idle'), 6 * 60_000);
      } else {
        const { error } = await res.json();
        console.error('Trigger error:', error);
        setState('error');
        setTimeout(() => setState('idle'), 4_000);
      }
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 4_000);
    }
  }

  const label = {
    idle:    'Atualizar dados',
    loading: 'Disparando...',
    success: 'Coleta iniciada! Aguarde ~5 min',
    error:   'Erro ao disparar',
  }[state];

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading' || state === 'success'}
      title="Dispara o scraper agora via GitHub Actions"
      className={clsx(
        'flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors',
        state === 'loading' && 'bg-slate-400 text-white cursor-not-allowed dark:bg-slate-700',
        state === 'success' && 'bg-green-600 text-white cursor-not-allowed dark:bg-green-700',
        state === 'error'   && 'bg-red-600 text-white dark:bg-red-700',
        state === 'idle'    && 'bg-slate-700 hover:bg-slate-800 text-white dark:bg-slate-600 dark:hover:bg-slate-500',
      )}
    >
      <RefreshCw size={14} className={state === 'loading' ? 'animate-spin' : ''} />
      {label}
    </button>
  );
}
