import { MessageCircle, UserX, Clock, CheckCircle2, BellOff } from 'lucide-react';
import type { ChatwootPanelData } from '@/integrations/chatwoot';

interface Props {
  data: ChatwootPanelData;
}

export function ChatwootPanel({ data }: Props) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={14} className="text-green-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          Atendimentos WhatsApp — {data.inboxName}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">

        {/* Abertas */}
        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
          data.open > 0
            ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <MessageCircle size={13} className={data.open > 0 ? 'text-blue-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Abertas</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            data.open > 0 ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {data.open}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">em atendimento</span>
        </div>

        {/* Não atribuídas */}
        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
          data.unassigned > 0
            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <UserX size={13} className={data.unassigned > 0 ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Não atribuídas</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            data.unassigned > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {data.unassigned}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">sem agente</span>
        </div>

        {/* Pendentes */}
        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
          data.pending > 0
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <Clock size={13} className={data.pending > 0 ? 'text-amber-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Pendentes</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            data.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {data.pending}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">aguardando ação</span>
        </div>

        {/* Resolvidas */}
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-emerald-500" />
            <span className="text-xs text-gray-500 dark:text-slate-400">Resolvidas</span>
          </div>
          <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {data.resolved}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">total no canal</span>
        </div>

        {/* Adiadas */}
        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
          data.snoozed > 0
            ? 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <BellOff size={13} className={data.snoozed > 0 ? 'text-slate-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Adiadas</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            data.snoozed > 0 ? 'text-slate-600 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {data.snoozed}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">snoozed</span>
        </div>

      </div>
    </div>
  );
}
