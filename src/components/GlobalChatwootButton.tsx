'use client';

import { useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { GlobalChatwootBacklogModal } from '@/components/GlobalChatwootBacklogModal';

interface Props {
  totalWA: number;
}

export function GlobalChatwootButton({ totalWA }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border
          bg-white dark:bg-slate-900 border-gray-200 dark:border-slate-700
          hover:border-green-300 dark:hover:border-green-700
          hover:bg-green-50 dark:hover:bg-green-950/30
          shadow-sm hover:shadow transition-all duration-150 group"
      >
        <MessageSquare size={15} className="text-green-500 shrink-0" />
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300 group-hover:text-green-700 dark:group-hover:text-green-400 transition-colors">
          Conversas WhatsApp
        </span>
        {totalWA > 0 && (
          <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded-full
            bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-400">
            {totalWA} no mês
          </span>
        )}
      </button>

      {open && <GlobalChatwootBacklogModal onClose={() => setOpen(false)} />}
    </>
  );
}
