import { ExternalLink, UserX } from 'lucide-react';
import type { ChatwootConversation } from '@/integrations/chatwoot';

const LABEL_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300',
  'bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300',
];

function labelColor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) >>> 0;
  return LABEL_COLORS[hash % LABEL_COLORS.length];
}

interface Props {
  conversations: ChatwootConversation[];
  title?: string;
}

function waitingLabel(waitingSinceSec: number): string {
  if (!waitingSinceSec) return '—';
  const diffSec = Math.floor(Date.now() / 1000) - waitingSinceSec;
  if (diffSec < 60)   return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function waitingColor(waitingSinceSec: number): string {
  if (!waitingSinceSec) return 'text-gray-400 dark:text-slate-600';
  const diffSec = Math.floor(Date.now() / 1000) - waitingSinceSec;
  if (diffSec > 86400) return 'text-red-600 dark:text-red-400 font-semibold';
  if (diffSec > 3600)  return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-gray-600 dark:text-slate-300';
}

function cleanMessage(content: string): string {
  return content
    .replace(/\*([^*]+)\*/g, '$1') // remove bold markdown
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function ChatwootConversationTable({ conversations, title = 'Conversas Abertas' }: Props) {
  return (
    <div className="card overflow-hidden p-0">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800">
        <h2 className="text-base font-semibold text-gray-700 dark:text-slate-200 uppercase tracking-wide">
          {title} ({conversations.length})
        </h2>
      </div>

      {conversations.length === 0 ? (
        <p className="px-5 py-10 text-center text-base text-gray-400 dark:text-slate-500">
          Nenhuma conversa aberta
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-base">
            <thead>
              <tr className="border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/50">
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-8">#</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Contato</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Última mensagem</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Labels</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Aguardando</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">Agente</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-slate-800/60">
              {conversations.map((c, i) => (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-400 dark:text-slate-600 text-sm tabular-nums">{i + 1}</td>

                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-800 dark:text-slate-100 text-sm">{c.contactName}</p>
                    {c.unitName && (
                      <p className="text-xs text-gray-400 dark:text-slate-500 truncate max-w-[160px]">{c.unitName}</p>
                    )}
                    {c.contactPhone && (
                      <p className="text-xs text-gray-400 dark:text-slate-500">{c.contactPhone}</p>
                    )}
                  </td>

                  <td className="px-4 py-3 max-w-xs">
                    <p className="text-sm text-gray-600 dark:text-slate-300 line-clamp-2">
                      {c.lastMessage ? cleanMessage(c.lastMessage) : <span className="text-gray-300 dark:text-slate-700">—</span>}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.labels.length > 0
                        ? c.labels.map((l) => (
                            <span key={l} className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${labelColor(l)}`}>
                              {l}
                            </span>
                          ))
                        : <span className="text-gray-300 dark:text-slate-700 text-sm">—</span>
                      }
                    </div>
                  </td>

                  <td className={`px-4 py-3 text-sm tabular-nums ${waitingColor(c.waitingSinceSec)}`}>
                    {waitingLabel(c.waitingSinceSec)}
                  </td>

                  <td className="px-4 py-3">
                    {c.assigneeName
                      ? <span className="text-sm text-gray-600 dark:text-slate-300">{c.assigneeName}</span>
                      : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
                          <UserX size={12} /> Não atribuído
                        </span>
                      )
                    }
                  </td>

                  <td className="px-4 py-3">
                    <a
                      href={c.chatwootUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                      title="Abrir no Chatwoot"
                    >
                      <ExternalLink size={12} />
                      Chatwoot
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
