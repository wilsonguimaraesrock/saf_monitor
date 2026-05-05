'use client';

import { UserCheck, Clock, TriangleAlert, Timer } from 'lucide-react';
import type { ChatwootConversation } from '@/integrations/chatwoot';
import type { ChatwootPanelData } from '@/integrations/chatwoot';

interface Props {
  conversations: ChatwootConversation[];
  panelData: ChatwootPanelData | null;
  title?: string;
}

function formatDuration(sec: number): string {
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.floor(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

export function ChatwootSlaPanel({
  conversations,
  panelData,
  title = 'SLA WhatsApp',
}: Props) {
  const nowSec = Math.floor(Date.now() / 1000);

  const waitingTimes = conversations
    .filter((c) => c.waitingSinceSec > 0)
    .map((c) => nowSec - c.waitingSinceSec);

  const avgWaitSec   = waitingTimes.length > 0
    ? Math.floor(waitingTimes.reduce((a, b) => a + b, 0) / waitingTimes.length)
    : 0;
  const over1h  = waitingTimes.filter((s) => s > 3600).length;
  const over24h = waitingTimes.filter((s) => s > 86400).length;

  const openTotal   = panelData?.open ?? conversations.length;
  const unassigned  = panelData?.unassigned ?? conversations.filter((c) => !c.assigneeName).length;
  const assignRate  = openTotal > 0 ? Math.round(((openTotal - unassigned) / openTotal) * 100) : 0;

  const assignColor =
    assignRate >= 80 ? 'text-emerald-600 dark:text-emerald-400' :
    assignRate >= 50 ? 'text-amber-600 dark:text-amber-400' :
                       'text-red-600 dark:text-red-400';

  const assignBg =
    assignRate >= 80 ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' :
    assignRate >= 50 ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800' :
                       'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800';

  return (
    <div className="card">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 mb-3">
        {title}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">

        {/* % atribuídas */}
        <div className={`h-full rounded-xl border p-4 flex flex-col gap-1 ${assignBg}`}>
          <div className="flex items-center gap-1.5">
            <UserCheck size={14} className={assignColor} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Taxa de atribuição</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${assignColor}`}>
            {assignRate}%
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">conversas com agente</span>
        </div>

        {/* Aguardando > 1h */}
        <div className={`h-full rounded-xl border p-4 flex flex-col gap-1 ${
          over1h > 0
            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <Clock size={14} className={over1h > 0 ? 'text-amber-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Aguardando &gt; 1h</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            over1h > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {over1h}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">conversas abertas</span>
        </div>

        {/* Aguardando > 24h */}
        <div className={`h-full rounded-xl border p-4 flex flex-col gap-1 ${
          over24h > 0
            ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
            : 'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700'
        }`}>
          <div className="flex items-center gap-1.5">
            <TriangleAlert size={14} className={over24h > 0 ? 'text-red-500' : 'text-gray-400 dark:text-slate-500'} />
            <span className="text-xs text-gray-500 dark:text-slate-400">Aguardando &gt; 24h</span>
          </div>
          <span className={`text-2xl font-bold tabular-nums ${
            over24h > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-slate-500'
          }`}>
            {over24h}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">sem resposta há mais de 1 dia</span>
        </div>

        {/* Tempo médio de espera */}
        <div className="rounded-xl border p-4 flex flex-col gap-1 bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-1.5">
            <Timer size={14} className="text-blue-500" />
            <span className="text-xs text-gray-500 dark:text-slate-400">Espera média</span>
          </div>
          <span className="text-2xl font-bold tabular-nums text-blue-600 dark:text-blue-400">
            {avgWaitSec > 0 ? formatDuration(avgWaitSec) : '—'}
          </span>
          <span className="text-xs text-gray-400 dark:text-slate-500">conversas abertas agora</span>
        </div>

      </div>
    </div>
  );
}
