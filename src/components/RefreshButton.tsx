'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';

export function RefreshButton() {
  const [loading, setLoading] = useState(false);

  function handleRefresh() {
    setLoading(true);
    window.location.reload();
  }

  return (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className={clsx(
        'flex items-center gap-2 text-sm px-4 py-2 rounded-lg font-medium transition-colors',
        loading
          ? 'bg-blue-400 text-white cursor-not-allowed dark:bg-blue-800 dark:text-blue-300'
          : 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-600 dark:hover:bg-blue-500'
      )}
    >
      <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
      {loading ? 'Atualizando...' : 'Atualizar'}
    </button>
  );
}
