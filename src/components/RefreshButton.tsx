'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutos

export function RefreshButton() {
  const router = useRouter();
  const [loading, setLoading]         = useState(false);
  const [countdown, setCountdown]     = useState(AUTO_REFRESH_MS / 1000);

  // Atualiza os dados em background (sem recarregar a página) para não
  // perder o que o usuário estiver digitando (ex.: resposta no chat).
  const refreshData = useCallback(() => {
    setLoading(true);
    router.refresh();
    // router.refresh() não retorna promise; libera o botão após um instante.
    setTimeout(() => setLoading(false), 1200);
  }, [router]);

  // Auto-refresh a cada 5 minutos (em background)
  useEffect(() => {
    let refreshAt = Date.now() + AUTO_REFRESH_MS;

    const tick = setInterval(() => {
      const remaining = Math.ceil((refreshAt - Date.now()) / 1000);
      if (remaining <= 0) {
        refreshData();
        refreshAt = Date.now() + AUTO_REFRESH_MS;
        setCountdown(AUTO_REFRESH_MS / 1000);
      } else {
        setCountdown(remaining);
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [refreshData]);

  function handleRefresh() {
    refreshData();
  }

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;
  const countdownStr = `${minutes}:${String(seconds).padStart(2, '0')}`;

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      title={`Auto-refresh em ${countdownStr}`}
      className={clsx(
        'flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors',
        loading
          ? 'bg-blue-400 text-white cursor-not-allowed dark:bg-blue-800 dark:text-blue-300'
          : 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500'
      )}
    >
      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Atualizando...' : `Atualizar (${countdownStr})`}
    </button>
  );
}
