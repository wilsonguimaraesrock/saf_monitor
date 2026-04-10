'use client';

import { useState, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

type State = 'idle' | 'loading' | 'running' | 'done' | 'error';

interface StepInfo { name: string; status: string; conclusion: string | null; }
interface StatusPayload {
  runId: number;
  status: string;
  conclusion: string | null;
  steps: StepInfo[];
  htmlUrl: string;
}

const STEP_LABELS: Record<string, string> = {
  'Set up job':                   '⚙️  Iniciando runner',
  'Instalar dependências':        '📦 Instalando dependências (npm ci)',
  'Instalar Playwright (Chromium)':'🌐 Instalando Playwright / Chromium',
  'Executar scraper':             '🤖 Executando scraper (coleta de dados)',
  'Complete job':                 '✅ Finalizando',
};

function label(name: string) {
  return STEP_LABELS[name] ?? `▶️  ${name}`;
}

export function ScraperTriggerButton() {
  const [state, setState]     = useState<State>('idle');
  const [btnLabel, setBtnLabel] = useState('Atualizar dados');
  const pollRef               = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStepsRef          = useRef<string>('');
  const lastRunIdRef          = useRef<number | null>(null);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function pollStatus() {
    try {
      const res  = await fetch('/api/scraper/status');
      const data = await res.json() as StatusPayload;

      // Ignora runs anteriores ao clique
      if (lastRunIdRef.current && data.runId !== lastRunIdRef.current) return;
      if (!lastRunIdRef.current) lastRunIdRef.current = data.runId;

      // Loga etapas novas / atualizadas
      const stepsKey = JSON.stringify(data.steps);
      if (stepsKey !== lastStepsRef.current) {
        lastStepsRef.current = stepsKey;
        data.steps.forEach((s) => {
          if (s.status === 'in_progress') {
            console.log(`%c${label(s.name)}...`, 'color:#60a5fa;font-weight:bold');
          } else if (s.status === 'completed') {
            const ok = s.conclusion === 'success' || s.conclusion === 'skipped';
            console.log(
              `%c${ok ? '✅' : '❌'} ${label(s.name)} — ${s.conclusion}`,
              `color:${ok ? '#4ade80' : '#f87171'};font-weight:bold`
            );
          }
        });
      }

      // Fim do run
      if (data.status === 'completed') {
        stopPolling();
        const ok = data.conclusion === 'success';
        console.log(
          `%c\n🏁 Scraper ${ok ? 'concluído com sucesso' : 'terminou com erro: ' + data.conclusion}`,
          `color:${ok ? '#4ade80' : '#f87171'};font-size:14px;font-weight:bold`
        );
        console.log(`%c🔗 ${data.htmlUrl}`, 'color:#94a3b8');
        setState(ok ? 'done' : 'error');
        setBtnLabel(ok ? '✅ Concluído — clique Atualizar' : '❌ Erro no scraper');
        setTimeout(() => { setState('idle'); setBtnLabel('Atualizar dados'); }, 10_000);
      }
    } catch {
      // silencia erros de rede no polling
    }
  }

  async function handleClick() {
    if (state !== 'idle') return;
    setState('loading');
    setBtnLabel('Disparando...');
    lastRunIdRef.current  = null;
    lastStepsRef.current  = '';

    console.log('%c\n🚀 [Scraper] Disparando workflow no GitHub Actions...', 'color:#60a5fa;font-size:14px;font-weight:bold');

    try {
      const res = await fetch('/api/scraper/trigger', { method: 'POST' });
      if (!res.ok) {
        const { error } = await res.json();
        console.error('[Scraper] Erro ao disparar:', error);
        setState('error');
        setBtnLabel('Erro ao disparar');
        setTimeout(() => { setState('idle'); setBtnLabel('Atualizar dados'); }, 4_000);
        return;
      }

      console.log('%c⏳ Aguardando o runner iniciar...', 'color:#fbbf24;font-weight:bold');
      setState('running');
      setBtnLabel('Coletando dados...');

      // Aguarda 15s para o runner iniciar antes de começar o polling
      await new Promise((r) => setTimeout(r, 15_000));
      await pollStatus();
      pollRef.current = setInterval(pollStatus, 8_000);

    } catch {
      setState('error');
      setBtnLabel('Erro ao disparar');
      setTimeout(() => { setState('idle'); setBtnLabel('Atualizar dados'); }, 4_000);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={state !== 'idle'}
      title="Dispara o scraper agora via GitHub Actions (acompanhe o progresso no console)"
      className={clsx(
        'flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors',
        state === 'idle'    && 'bg-slate-700 hover:bg-slate-800 text-white dark:bg-slate-600 dark:hover:bg-slate-500',
        state === 'loading' && 'bg-slate-400 text-white cursor-not-allowed',
        state === 'running' && 'bg-blue-600 text-white cursor-not-allowed',
        state === 'done'    && 'bg-green-600 text-white cursor-not-allowed',
        state === 'error'   && 'bg-red-600 text-white cursor-not-allowed',
      )}
    >
      <RefreshCw size={14} className={state === 'loading' || state === 'running' ? 'animate-spin' : ''} />
      {btnLabel}
    </button>
  );
}
