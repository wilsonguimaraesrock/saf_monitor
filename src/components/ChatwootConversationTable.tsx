'use client';

import { useState, useCallback } from 'react';
import { MessageSquare, UserX, History, ChevronDown, Loader2 } from 'lucide-react';
import type { ChatwootConversation } from '@/integrations/chatwoot';
import { ChatwootConversationModal } from './ChatwootConversationModal';
import { businessElapsedSeconds } from '@/lib/businessTime';

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
  onBacklog?: () => void;
}

interface Agent {
  id: number;
  name: string;
  available: boolean;
}

/** Espera em tempo útil — sexta 18h → segunda 8h não conta */
function waitingSeconds(waitingSinceSec: number): number {
  return businessElapsedSeconds(waitingSinceSec, Math.floor(Date.now() / 1000));
}

function waitingLabel(waitingSinceSec: number): string {
  if (!waitingSinceSec) return '—';
  const diffSec = waitingSeconds(waitingSinceSec);
  if (diffSec < 60)    return `${diffSec}s`;
  if (diffSec < 3600)  return `${Math.floor(diffSec / 60)}min`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function waitingTimestamp(waitingSinceSec: number): string {
  if (!waitingSinceSec) return '';
  return new Date(waitingSinceSec * 1000).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function waitingColor(waitingSinceSec: number): string {
  if (!waitingSinceSec) return 'text-gray-400 dark:text-slate-600';
  const diffSec = waitingSeconds(waitingSinceSec);
  if (diffSec > 86400) return 'text-red-600 dark:text-red-400 font-semibold';
  if (diffSec > 3600)  return 'text-amber-600 dark:text-amber-400 font-semibold';
  return 'text-gray-600 dark:text-slate-300';
}

function cleanMessage(content: string): string {
  return content
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function ChatwootConversationTable({ conversations, title = 'Conversas Abertas', onBacklog }: Props) {
  const [selected, setSelected]       = useState<ChatwootConversation | null>(null);
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [assigningId, setAssigningId] = useState<number | null>(null);
  // optimistic local overrides: convId → { id, name } | null (null = unassigned)
  const [localAssignees, setLocalAssignees] = useState<Record<number, { id: number; name: string } | null>>({});

  const loadAgents = useCallback(async () => {
    if (agentsLoaded) return;
    try {
      const res = await fetch('/api/chatwoot/agents');
      const data = await res.json();
      setAgents(data.agents ?? []);
    } finally {
      setAgentsLoaded(true);
    }
  }, [agentsLoaded]);

  async function assignAgent(convId: number, agentId: number | null) {
    setAssigningId(convId);
    try {
      const res = await fetch(`/api/chatwoot/conversation/${convId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      if (res.ok) {
        const agent = agentId ? (agents.find((a) => a.id === agentId) ?? null) : null;
        setLocalAssignees((prev) => ({
          ...prev,
          [convId]: agent ? { id: agent.id, name: agent.name } : null,
        }));
        if (agent) {
          fetch(`/api/chatwoot/conversation/${convId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `Seu atendimento está com *${agent.name}*.`, asSystem: true }),
          }).catch(() => {});
        }
      }
    } finally {
      setAssigningId(null);
      setEditingId(null);
    }
  }

  return (
    <>
      <ChatwootConversationModal conversation={selected} onClose={() => setSelected(null)} />
      <div className="card overflow-hidden p-0">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-gray-700 dark:text-slate-200 uppercase tracking-wide">
            {title} ({conversations.length})
          </h2>
          {onBacklog && (
            <button
              onClick={onBacklog}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            >
              <History size={13} />
              Backlog do mês
            </button>
          )}
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
                {conversations.map((c, i) => {
                  const localAssignee = Object.prototype.hasOwnProperty.call(localAssignees, c.id)
                    ? localAssignees[c.id]
                    : (c.assigneeId ? { id: c.assigneeId, name: c.assigneeName ?? '' } : null);
                  const isAssigning = assigningId === c.id;
                  const isEditing   = editingId === c.id;

                  return (
                    <tr
                      key={c.id}
                      onClick={() => { if (!isEditing) setSelected(c); }}
                      className="hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                    >
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

                      <td className="px-4 py-3 tabular-nums">
                        <span className={`text-sm ${waitingColor(c.waitingSinceSec)}`}>
                          {waitingLabel(c.waitingSinceSec)}
                        </span>
                        {c.waitingSinceSec > 0 && (
                          <span className="block text-xs text-gray-400 dark:text-slate-500">
                            {waitingTimestamp(c.waitingSinceSec)}
                          </span>
                        )}
                      </td>

                      {/* Agente — dropdown inline */}
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        {isAssigning ? (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                            <Loader2 size={12} className="animate-spin" /> Salvando…
                          </span>
                        ) : isEditing ? (
                          <select
                            autoFocus
                            defaultValue={localAssignee?.id ?? ''}
                            onChange={async (e) => {
                              const val = e.target.value;
                              await assignAgent(c.id, val ? Number(val) : null);
                            }}
                            onBlur={() => setEditingId(null)}
                            className="text-sm border border-gray-300 dark:border-slate-600 rounded-md px-2 py-1
                              bg-white dark:bg-slate-800 text-gray-800 dark:text-slate-100
                              focus:outline-none focus:ring-2 focus:ring-orange-400 w-full max-w-[180px]"
                          >
                            <option value="">— Não atribuído</option>
                            {agents.map((a) => (
                              <option key={a.id} value={a.id}>{a.name}</option>
                            ))}
                          </select>
                        ) : (
                          <button
                            className="group flex items-center gap-1 text-left hover:bg-gray-100 dark:hover:bg-slate-700/50 rounded px-1 -mx-1 py-0.5 transition-colors"
                            title="Clique para atribuir agente"
                            onClick={async () => {
                              await loadAgents();
                              setEditingId(c.id);
                            }}
                          >
                            {localAssignee ? (
                              <span className="text-sm text-gray-600 dark:text-slate-300">{localAssignee.name}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
                                <UserX size={12} /> Não atribuído
                              </span>
                            )}
                            <ChevronDown size={11} className="text-gray-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelected(c); }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
                          title="Abrir conversa"
                        >
                          <MessageSquare size={12} />
                          Abrir
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
