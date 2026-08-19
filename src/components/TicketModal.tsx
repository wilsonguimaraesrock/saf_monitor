'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { loadDraft, saveDraft, clearDraft } from '@/lib/replyDraft';
import { X, ExternalLink, Clock, Calendar, AlertTriangle, Tag, Building2, MessageSquare, Send, KeyRound, Eye, EyeOff } from 'lucide-react';
import { clsx } from 'clsx';
import { TicketRow } from './TicketTable';

interface Update {
  id: string;
  author: string | null;
  content: string | null;
  is_ours: boolean;
  occurred_at: string | null;
}

interface TicketModalProps {
  ticket: TicketRow | null;
  onClose: () => void;
}

interface DfranquiasCredentials {
  username: string;
  password: string;
}

const CREDS_KEY = 'dfranquias_credentials';

const CATEGORY_LABELS: Record<string, string> = {
  dsa_joy:           'DSA JOY',
  myrock:            'MyRock',
  plataformas_aulas: 'Plataformas de Aulas',
  suporte_emails:    'Suporte Emails',
  outros:            'Outros',
  nao_classificado:  'Não classificado',
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  aberto:                    { label: 'Aberto',             cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400' },
  em_andamento:              { label: 'Em andamento',       cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' },
  aguardando_nossa_resposta: { label: 'Aguardando nossa resp.', cls: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400' },
  aguardando_franquia:       { label: 'Aguardando franquia', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400' },
  resolvido:                 { label: 'Resolvido',          cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400' },
  cancelado:                 { label: 'Cancelado',          cls: 'bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400' },
};

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '—';
  try {
    return new Date(raw).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return raw;
  }
}

function loadCredentials(): DfranquiasCredentials | null {
  try {
    const raw = localStorage.getItem(CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.username && parsed?.password) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveCredentials(creds: DfranquiasCredentials) {
  localStorage.setItem(CREDS_KEY, JSON.stringify(creds));
}

// ──────────────────────────────────────────────────────────────────────
// Credential setup form (shown when no credentials stored)
// ──────────────────────────────────────────────────────────────────────
function CredentialForm({ onSave }: { onSave: (c: DfranquiasCredentials) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    const creds = { username: username.trim(), password };
    saveCredentials(creds);
    onSave(creds);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 px-6 py-8">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound size={16} className="text-amber-500" />
        <span className="text-sm font-semibold text-gray-700 dark:text-slate-200">
          Configure seu login do dfranquias
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-500 -mt-2">
        Suas credenciais ficam salvas localmente no navegador e são usadas para enviar respostas com a sua conta.
      </p>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Usuário</label>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          placeholder="seu.usuario@rockfeller.com.br"
          className="rounded-xl px-4 py-2.5 text-sm
            bg-gray-50 dark:bg-slate-800
            border border-gray-200 dark:border-slate-700
            text-gray-800 dark:text-slate-100
            placeholder-gray-400 dark:placeholder-slate-600
            focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600 dark:text-slate-400">Senha</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            placeholder="••••••••"
            className="w-full rounded-xl px-4 py-2.5 pr-10 text-sm
              bg-gray-50 dark:bg-slate-800
              border border-gray-200 dark:border-slate-700
              text-gray-800 dark:text-slate-100
              placeholder-gray-400 dark:placeholder-slate-600
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-slate-300"
          >
            {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={!username.trim() || !password.trim()}
        className="mt-1 rounded-xl py-2.5 text-sm font-medium
          bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-slate-700
          text-white disabled:text-gray-400 transition-colors"
      >
        Salvar e continuar
      </button>
    </form>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Main modal
// ──────────────────────────────────────────────────────────────────────
export function TicketModal({ ticket, onClose }: TicketModalProps) {
  const [credentials, setCredentials] = useState<DfranquiasCredentials | null>(null);
  const [editingCreds, setEditingCreds] = useState(false);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendOk, setSendOk] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Carrega credenciais do localStorage na montagem
  useEffect(() => {
    setCredentials(loadCredentials());
  }, []);

  const fetchUpdates = useCallback(async (id: string) => {
    const data = await fetch(`/api/tickets/${id}`).then((r) => r.json());
    setUpdates(data.updates ?? []);
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
    if (ticket) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [ticket]);

  // Busca atualizações quando o ticket muda
  useEffect(() => {
    if (!ticket) return;
    setUpdates([]);
    // Restaura o rascunho — resposta digitada não se perde ao fechar/reabrir.
    setReply(loadDraft('saf', ticket.id));
    setSendError('');
    setSendOk(false);
    setLoading(true);
    fetchUpdates(ticket.id).finally(() => setLoading(false));
  }, [ticket?.id, fetchUpdates]);

  // Persiste o rascunho a cada alteração.
  useEffect(() => {
    if (!ticket) return;
    saveDraft('saf', ticket.id, reply);
  }, [ticket?.id, reply]);

  // Scroll automático para o fim do chat
  useEffect(() => {
    if (updates.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [updates]);

  async function handleSend() {
    if (!ticket || !reply.trim() || sending || !credentials) return;
    setSending(true);
    setSendError('');
    setSendOk(false);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: reply.trim(),
          username: credentials.username,
          password: credentials.password,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({} as { error?: string }));
        setSendError(err.error ?? `Falha ao enviar (${res.status}). O texto foi mantido — tente novamente.`);
        return;
      }
      // Envio confirmado: só agora o rascunho pode ser descartado.
      clearDraft('saf', ticket.id);
      setReply('');
      setSendOk(true);
      setTimeout(() => setSendOk(false), 3000);
      await fetchUpdates(ticket.id);
    } catch {
      setSendError('Sem conexão com o servidor. O texto foi mantido — tente novamente.');
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

  if (!ticket) return null;

  const statusInfo = STATUS_LABELS[ticket.status] ?? { label: ticket.status, cls: 'bg-gray-100 text-gray-500' };
  const dfranquiasUrl = `https://app.dfranquias.com.br/saf/${ticket.external_id}/show`;

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
          <div className="flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                {ticket.number && (
                  <span className="text-xs font-mono text-gray-400 dark:text-slate-500">
                    #{ticket.number}
                  </span>
                )}
                <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium', statusInfo.cls)}>
                  {statusInfo.label}
                </span>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                  {CATEGORY_LABELS[ticket.priority_category] ?? ticket.priority_category}
                </span>
                {ticket.is_overdue && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-400">
                    <AlertTriangle size={10} />
                    {ticket.days_overdue}d atrasado
                  </span>
                )}
              </div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100 leading-snug">
                {ticket.title}
              </h2>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Botão para editar/trocar credenciais */}
              {credentials && !editingCreds && (
                <button
                  onClick={() => setEditingCreds(true)}
                  title={`Logado como ${credentials.username} — clique para trocar`}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-amber-500 hover:bg-gray-100
                    dark:hover:bg-slate-800 transition-colors"
                >
                  <KeyRound size={15} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100
                  dark:text-slate-500 dark:hover:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Se não tem credenciais ou está editando, mostra o form */}
          {(!credentials || editingCreds) ? (
            <CredentialForm
              onSave={(creds) => {
                setCredentials(creds);
                setEditingCreds(false);
              }}
            />
          ) : (
            <>
              {/* Meta info */}
              <div className="flex flex-wrap gap-x-5 gap-y-2 px-6 py-3 border-b border-gray-100 dark:border-slate-800 shrink-0">
                {ticket.franchise && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
                    <Building2 size={12} />
                    {ticket.franchise}
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
                  <Calendar size={12} />
                  {ticket.days_open}d aberto
                </div>
                {ticket.awaiting_our_response && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Clock size={12} />
                    Aguardando nossa resposta
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
                  <Tag size={12} />
                  Score: <span className="font-bold">{ticket.priority_score}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-slate-600 ml-auto">
                  <KeyRound size={10} />
                  {credentials.username}
                </div>
              </div>

              {/* Chat */}
              <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquare size={13} className="text-gray-400 dark:text-slate-600" />
                  <span className="text-xs font-semibold text-gray-400 dark:text-slate-600 uppercase tracking-wide">
                    Histórico de mensagens
                  </span>
                </div>

                {loading ? (
                  <div className="flex justify-center py-10">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : updates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
                    <MessageSquare size={28} className="text-gray-200 dark:text-slate-700" />
                    <p className="text-sm text-gray-400 dark:text-slate-600">
                      Nenhuma mensagem registrada para este ticket.
                    </p>
                    <p className="text-xs text-gray-300 dark:text-slate-700">
                      As mensagens são capturadas na próxima coleta do scraper.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {updates.map((u) => (
                      <div
                        key={u.id}
                        className={clsx(
                          'flex flex-col max-w-[80%] gap-1',
                          u.is_ours ? 'ml-auto items-end' : 'items-start'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          {!u.is_ours && u.author && (
                            <span className="text-xs font-medium text-gray-500 dark:text-slate-500">
                              {u.author}
                            </span>
                          )}
                          {u.is_ours && (
                            <span className="text-xs font-medium text-blue-500 dark:text-blue-400">
                              Nossa equipe
                            </span>
                          )}
                        </div>
                        <div
                          className={clsx(
                            'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                            u.is_ours
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200 rounded-bl-sm'
                          )}
                        >
                          {u.content}
                        </div>
                        {u.occurred_at && (
                          <span className="text-xs text-gray-300 dark:text-slate-700 px-1">
                            {formatDate(u.occurred_at)}
                          </span>
                        )}
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>
                )}
              </div>

              {/* Reply box */}
              <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-800 shrink-0">
                {sendError && (
                  <p className="text-xs text-red-500 mb-2">{sendError}</p>
                )}
                {sendOk && (
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
                    ✓ Mensagem enviada ao dfranquias. O histórico será atualizado na próxima coleta.
                  </p>
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
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                      transition-colors"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!reply.trim() || sending}
                    className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl
                      bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-slate-700
                      text-white disabled:text-gray-400 transition-colors"
                    title="Enviar (Enter)"
                  >
                    {sending
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Send size={16} />
                    }
                  </button>
                  <a
                    href={dfranquiasUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl
                      bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700
                      text-gray-500 dark:text-slate-400 transition-colors"
                    title="Abrir no dfranquias"
                  >
                    <ExternalLink size={16} />
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
