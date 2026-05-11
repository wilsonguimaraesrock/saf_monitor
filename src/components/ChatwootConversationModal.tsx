'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ExternalLink, Send, UserX, Phone, Building2, Tag, RefreshCw } from 'lucide-react';
import type { ChatwootConversation } from '@/integrations/chatwoot';

interface Message {
  id: number;
  content: string;
  message_type: number; // 0=incoming, 1=outgoing, 2=activity
  created_at: number;
  private: boolean;
  sender?: { name: string; type: string } | null;
}

interface Props {
  conversation: ChatwootConversation | null;
  onClose: () => void;
}

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

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ChatwootConversationModal({ conversation, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async (id: number) => {
    const res = await fetch(`/api/chatwoot/conversation/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const payload: Message[] = data?.payload ?? [];
    // Only show incoming (0) and outgoing (1), sorted by created_at
    const visible = payload
      .filter((m) => m.message_type === 0 || m.message_type === 1)
      .sort((a, b) => a.created_at - b.created_at);
    setMessages(visible);
  }, []);

  // Fecha com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Trava scroll do body
  useEffect(() => {
    document.body.style.overflow = conversation ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [conversation]);

  // Carrega mensagens quando a conversa muda
  useEffect(() => {
    if (!conversation) return;
    setMessages([]);
    setReply('');
    setSendError('');
    setLoading(true);
    fetchMessages(conversation.id).finally(() => setLoading(false));
  }, [conversation?.id, fetchMessages]);

  // Auto-refresh a cada 10s
  useEffect(() => {
    if (!conversation) return;
    const interval = setInterval(() => fetchMessages(conversation.id), 10_000);
    return () => clearInterval(interval);
  }, [conversation?.id, fetchMessages]);

  // Scroll para o fim após carregar/atualizar
  useEffect(() => {
    if (messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleSend() {
    if (!conversation || !reply.trim() || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/chatwoot/conversation/${conversation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (!res.ok) {
        setSendError('Falha ao enviar. Tente novamente.');
        return;
      }
      setReply('');
      await fetchMessages(conversation.id);
    } catch {
      setSendError('Erro de conexão.');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!conversation) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl
            bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-gray-900 dark:text-slate-100 truncate">
                {conversation.contactName}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-1">
                {conversation.contactPhone && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                    <Phone size={11} />
                    {conversation.contactPhone}
                  </span>
                )}
                {conversation.unitName && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                    <Building2 size={11} />
                    {conversation.unitName}
                  </span>
                )}
                {conversation.assigneeName ? (
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                    <Tag size={11} />
                    {conversation.assigneeName}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                    <UserX size={11} />
                    Não atribuído
                  </span>
                )}
              </div>
              {conversation.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {conversation.labels.map((l) => (
                    <span key={l} className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${labelColor(l)}`}>
                      {l}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <a
                href={conversation.chatwootUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300
                  hover:bg-green-200 dark:hover:bg-green-900/60 transition-colors"
                title="Abrir no Chatwoot"
              >
                <ExternalLink size={12} />
                Chatwoot
              </a>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                  dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                <RefreshCw size={28} className="text-gray-200 dark:text-slate-700" />
                <p className="text-sm text-gray-400 dark:text-slate-500">Nenhuma mensagem nesta conversa.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isOutgoing = m.message_type === 1;
                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col max-w-[80%] gap-0.5 ${isOutgoing ? 'ml-auto items-end' : 'items-start'}`}
                    >
                      {!isOutgoing && m.sender?.name && (
                        <span className="text-xs font-medium text-gray-500 dark:text-slate-500 px-1">
                          {m.sender.name}
                        </span>
                      )}
                      {isOutgoing && (
                        <span className="text-xs font-medium text-blue-500 dark:text-blue-400 px-1">
                          {m.sender?.name ?? 'Agente'}
                        </span>
                      )}
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                          isOutgoing
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200 rounded-bl-sm'
                        }`}
                      >
                        {m.content}
                      </div>
                      <span className="text-xs text-gray-300 dark:text-slate-700 px-1">
                        {formatTime(m.created_at)}
                      </span>
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
            )}
          </div>

          {/* Reply box */}
          <div className="px-5 py-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
            {sendError && (
              <p className="text-xs text-red-500 mb-2">{sendError}</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite sua resposta… (Enter para enviar, Shift+Enter para nova linha)"
                rows={2}
                className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm
                  bg-gray-50 dark:bg-slate-800
                  border border-gray-200 dark:border-slate-700
                  text-gray-800 dark:text-slate-100
                  placeholder-gray-400 dark:placeholder-slate-600
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600
                  transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={!reply.trim() || sending}
                className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl
                  bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-slate-700
                  text-white disabled:text-gray-400 dark:disabled:text-slate-500
                  transition-colors"
                title="Enviar (Enter)"
              >
                {sending
                  ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Send size={16} />
                }
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
