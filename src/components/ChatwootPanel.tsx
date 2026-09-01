'use client';

import { MessageCircle, UserX, Clock, CheckCircle2, BellOff, Star, History } from 'lucide-react';
import type { ChatwootPanelData } from '@/integrations/chatwoot';

interface Props {
  data: ChatwootPanelData;
}

type Tone = 'blue' | 'red' | 'amber' | 'slate';

const TONES: Record<Tone, { bg: string; text: string; icon: string }> = {
  blue:  { bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',       text: 'text-blue-700 dark:text-blue-300',   icon: 'text-blue-500' },
  red:   { bg: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',           text: 'text-red-600 dark:text-red-400',     icon: 'text-red-500' },
  amber: { bg: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',   text: 'text-amber-600 dark:text-amber-400', icon: 'text-amber-500' },
  slate: { bg: 'bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-600',     text: 'text-slate-600 dark:text-slate-300', icon: 'text-slate-500' },
};

const NEUTRAL = {
  bg:   'bg-gray-50 dark:bg-slate-800/40 border-gray-200 dark:border-slate-700',
  text: 'text-gray-400 dark:text-slate-500',
  icon: 'text-gray-400 dark:text-slate-500',
};

/**
 * Cartão de estado vivo (abertas, não atribuídas, pendentes, adiadas).
 * Em mês encerrado o valor chega `null` e o cartão mostra "—": o Chatwoot não
 * guarda histórico de status, então não existe "abertas em agosto" — mostrar o
 * número de agora sob o rótulo de um mês passado seria informação falsa.
 */
function LiveTile({
  label, hint, value, tone, icon: Icon,
}: {
  label: string;
  hint: string;
  value: number | null;
  tone: Tone;
  icon: typeof MessageCircle;
}) {
  const active = value !== null && value > 0;
  const style = active ? TONES[tone] : NEUTRAL;

  return (
    <div className={`h-full rounded-xl border shadow-md dark:shadow-sm p-4 flex flex-col gap-1 ${style.bg}`}>
      <div className="flex items-center gap-1.5">
        <Icon size={15} className={style.icon} />
        <span className="text-sm text-gray-500 dark:text-slate-400">{label}</span>
      </div>
      <span className={`text-4xl font-bold tabular-nums ${style.text}`}>
        {value === null ? '—' : value}
      </span>
      <span className="text-sm text-gray-400 dark:text-slate-500">
        {value === null ? 'só no mês atual' : hint}
      </span>
    </div>
  );
}

export function ChatwootPanel({ data }: Props) {
  const avg = data.csatAvg;

  const csatStyle =
    avg === null ? NEUTRAL :
    avg >= 4.0   ? { bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800', text: 'text-emerald-600 dark:text-emerald-400', icon: 'text-emerald-500' } :
    avg >= 3.0   ? TONES.amber :
                   TONES.red;

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <MessageCircle size={16} className="text-green-500" />
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
            Atendimentos WhatsApp — {data.inboxName}
          </p>
        </div>
        {data.historical && (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-lg
            bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
            <History size={12} />
            mês encerrado
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">

        <LiveTile label="Abertas"        hint="em atendimento"  value={data.open}       tone="blue"  icon={MessageCircle} />
        <LiveTile label="Não atribuídas" hint="sem agente"      value={data.unassigned} tone="red"   icon={UserX} />
        <LiveTile label="Pendentes"      hint="aguardando ação" value={data.pending}    tone="amber" icon={Clock} />

        {/* Resolvidas no período selecionado — antes era o total do canal */}
        <div className="h-full rounded-xl border shadow-md dark:shadow-sm p-4 flex flex-col gap-1
          bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-emerald-500" />
            <span className="text-sm text-gray-500 dark:text-slate-400">Resolvidas</span>
          </div>
          <span className="text-4xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
            {data.resolved}
          </span>
          <span className="text-sm text-gray-400 dark:text-slate-500">abertas e resolvidas no mês</span>
        </div>

        <LiveTile label="Adiadas" hint="snoozed" value={data.snoozed} tone="slate" icon={BellOff} />

        {/* Avaliação média CSAT do mês selecionado */}
        <div className={`h-full rounded-xl border shadow-md dark:shadow-sm p-4 flex flex-col gap-1 ${csatStyle.bg}`}>
          <div className="flex items-center gap-1.5">
            <Star size={15} className={csatStyle.icon} />
            <span className="text-sm text-gray-500 dark:text-slate-400">Avaliação média</span>
          </div>
          <span className={`text-4xl font-bold tabular-nums ${csatStyle.text}`}>
            {avg !== null ? avg.toFixed(1) : '—'}
          </span>
          <span className="text-sm text-gray-400 dark:text-slate-500">
            {data.csatTotal > 0
              ? `${data.csatTotal} avaliação${data.csatTotal > 1 ? 'ões' : ''} no mês`
              : 'sem avaliações no mês'}
          </span>
        </div>

      </div>
    </div>
  );
}
