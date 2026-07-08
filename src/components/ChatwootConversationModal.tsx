'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, ExternalLink, Send, UserX, Phone, Building2, Tag,
  RefreshCw, CheckCircle, Image as ImageIcon, Mic, MicOff, ArrowLeftRight, ArrowDown,
} from 'lucide-react';
import type { ChatwootConversation } from '@/integrations/chatwoot';

interface Attachment {
  id: number;
  file_type: 'image' | 'audio' | 'file' | 'video';
  data_url: string;
  thumb_url?: string;
}

interface Message {
  id: number;
  content: string;
  message_type: number; // 0=incoming, 1=outgoing, 2=activity
  created_at: number;
  private: boolean;
  sender?: { name: string; type: string } | null;
  attachments?: Attachment[];
}

interface Props {
  conversation: ChatwootConversation | null;
  onClose: () => void;
}

const LABEL_COLORS = [
  'bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300',
  'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
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
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function fmtSec(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Renderiza markdown estilo WhatsApp: *bold* _italic_ ~strike~ `code`
function renderWhatsApp(text: string): React.ReactNode {
  const regex = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    const inner = raw.slice(1, -1);
    if      (raw[0] === '*') parts.push(<strong key={key++}>{inner}</strong>);
    else if (raw[0] === '_') parts.push(<em key={key++}>{inner}</em>);
    else if (raw[0] === '~') parts.push(<s key={key++}>{inner}</s>);
    else parts.push(
      <code key={key++} className="font-mono text-[0.85em] bg-black/10 dark:bg-white/10 px-1 rounded">
        {inner}
      </code>
    );
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function ChatwootConversationModal({ conversation, onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [confirmResolve, setConfirmResolve] = useState(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);

  // Transfer
  const [showTransfer, setShowTransfer] = useState(false);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>('');
  const [transferring, setTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferDone, setTransferDone] = useState(false);
  const transferLoadedRef = useRef(false);

  // Image
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Audio
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async (id: number) => {
    const res = await fetch(`/api/chatwoot/conversation/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    const payload: Message[] = data?.payload ?? [];
    const visible = payload
      .filter((m) => m.message_type === 0 || m.message_type === 1)
      .sort((a, b) => a.created_at - b.created_at);
    setMessages(visible);
  }, []);

  // Carrega teams (uma vez por sessão de modal)
  const loadTransferData = useCallback(async () => {
    if (transferLoadedRef.current) return;
    transferLoadedRef.current = true;
    const res = await fetch('/api/chatwoot/transfer');
    if (!res.ok) return;
    const data = await res.json();
    setTeams(data.teams ?? []);
  }, []);

  useEffect(() => {
    if (showTransfer) loadTransferData();
  }, [showTransfer, loadTransferData]);

  // Fecha com Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
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
    setConfirmResolve(false);
    setShowTransfer(false);
    setSelectedTeamId('');
    setTransferError('');
    setTransferDone(false);
    setAutoScrollEnabled(true);
    transferLoadedRef.current = false;
    clearImage();
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
    if (autoScrollEnabled && messages.length > 0) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScrollEnabled, messages]);

  // Cleanup stream ao desmontar
  useEffect(() => {
    return () => stopStream();
  }, []);

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (recTimerRef.current) clearInterval(recTimerRef.current);
  }

  function clearImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function sendAttachment(file: Blob, filename: string) {
    if (!conversation) return;
    setSending(true);
    setSendError('');
    try {
      const fd = new FormData();
      fd.append('file', file, filename);
      if (reply.trim()) fd.append('content', reply.trim());
      const res = await fetch(`/api/chatwoot/conversation/${conversation.id}`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) { setSendError('Falha ao enviar. Tente novamente.'); return; }
      setReply('');
      clearImage();
      await fetchMessages(conversation.id);
    } catch {
      setSendError('Erro de conexão.');
    } finally {
      setSending(false);
    }
  }

  async function handleSend() {
    if (!conversation || sending) return;

    if (imageFile) {
      await sendAttachment(imageFile, imageFile.name);
      return;
    }

    if (!reply.trim()) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch(`/api/chatwoot/conversation/${conversation.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: reply.trim() }),
      });
      if (!res.ok) { setSendError('Falha ao enviar. Tente novamente.'); return; }
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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  async function handleRecordToggle() {
    if (recording) {
      mediaRecorderRef.current?.stop();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopStream();
        setRecording(false);
        setRecSec(0);
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        await sendAttachment(blob, 'audio.webm');
      };

      recorder.start();
      setRecording(true);
      setRecSec(0);
      recTimerRef.current = setInterval(() => setRecSec((s) => s + 1), 1000);
    } catch {
      setSendError('Permissão de microfone negada.');
    }
  }

  async function handleTransfer() {
    if (!conversation || transferring) return;
    if (!selectedTeamId) {
      setTransferError('Selecione um departamento.');
      return;
    }
    setTransferring(true);
    setTransferError('');
    try {
      const res = await fetch(`/api/chatwoot/conversation/${conversation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: Number(selectedTeamId) }),
      });
      if (!res.ok) {
        setTransferError('Falha ao transferir. Tente novamente.');
        return;
      }
      setTransferDone(true);
      setShowTransfer(false);
      await fetchMessages(conversation.id);
    } catch {
      setTransferError('Erro de conexão.');
    } finally {
      setTransferring(false);
    }
  }

  async function handleResolve() {
    if (!conversation || resolving) return;
    if (!confirmResolve) {
      setConfirmResolve(true);
      setTimeout(() => setConfirmResolve(false), 4000);
      return;
    }
    setResolving(true);
    try {
      const res = await fetch(`/api/chatwoot/conversation/${conversation.id}`, { method: 'PATCH' });
      if (res.ok) onClose();
    } finally {
      setResolving(false);
      setConfirmResolve(false);
    }
  }

  function toggleAutoScroll() {
    setAutoScrollEnabled((enabled) => {
      const next = !enabled;
      if (next) {
        requestAnimationFrame(() => {
          chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        });
      }
      return next;
    });
  }

  const canSend = !sending && !recording && (!!reply.trim() || !!imageFile);

  if (!conversation) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

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
                    <Phone size={11} />{conversation.contactPhone}
                  </span>
                )}
                {conversation.unitName && (
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                    <Building2 size={11} />{conversation.unitName}
                  </span>
                )}
                {conversation.assigneeName ? (
                  <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-slate-500">
                    <Tag size={11} />{conversation.assigneeName}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                    <UserX size={11} />Não atribuído
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
              <button
                onClick={() => setShowTransfer((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  showTransfer
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                }`}
                title="Transferir para outro departamento"
              >
                <ArrowLeftRight size={12} />
                {transferDone ? 'Transferido' : 'Transferir'}
              </button>
              <button
                onClick={handleResolve}
                disabled={resolving}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  confirmResolve
                    ? 'bg-green-700 text-white hover:bg-green-800'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
                title="Resolver conversa"
              >
                {resolving
                  ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  : <CheckCircle size={12} />
                }
                {confirmResolve ? 'Confirmar?' : 'Resolver'}
              </button>
              <a
                href={conversation.chatwootUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                  bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                title="Abrir no Chatwoot"
              >
                <ExternalLink size={12} />Chatwoot
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

          {/* Transfer panel */}
          {showTransfer && (
            <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-950/50 shrink-0">
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                Transferir para departamento
              </p>
              <div className="flex gap-3">
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="flex-1 rounded-lg px-3 py-2 text-sm
                    bg-white dark:bg-slate-800
                    border border-gray-200 dark:border-slate-700
                    text-gray-800 dark:text-slate-100
                    focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— selecione o departamento —</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
                <button
                  onClick={handleTransfer}
                  disabled={transferring || !selectedTeamId}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                    bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-slate-700
                    text-white disabled:text-gray-400 transition-colors shrink-0"
                >
                  {transferring
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <ArrowLeftRight size={13} />
                  }
                  Transferir
                </button>
              </div>
              {transferError && (
                <p className="text-xs text-red-500 mt-2">{transferError}</p>
              )}
            </div>
          )}

          {/* Auto-scroll control */}
          <div className="flex items-center justify-between gap-3 px-5 py-2 border-b border-gray-100 dark:border-slate-800 shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-slate-400">
              <ArrowDown size={13} />
              Auto-scroll
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoScrollEnabled}
              onClick={toggleAutoScroll}
              className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                autoScrollEnabled
                  ? 'bg-blue-600'
                  : 'bg-gray-200 dark:bg-slate-700'
              }`}
              title={autoScrollEnabled ? 'Desativar auto-scroll' : 'Ativar auto-scroll'}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                  autoScrollEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
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

                  // Nota interna (ex: registro de transferência) — bloco central destacado
                  if (m.private) {
                    return (
                      <div key={m.id} className="flex flex-col items-center gap-0.5 my-1">
                        <div className="max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed whitespace-pre-wrap break-words text-center
                          bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          {renderWhatsApp(m.content)}
                        </div>
                        <span className="text-xs text-gray-300 dark:text-slate-700">
                          {formatTime(m.created_at)} · nota interna
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col max-w-[80%] gap-0.5 ${isOutgoing ? 'ml-auto items-end' : 'items-start'}`}
                    >
                      <span className={`text-xs font-medium px-1 ${isOutgoing ? 'text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-slate-500'}`}>
                        {isOutgoing ? (m.sender?.name ?? 'Agente') : (m.sender?.name ?? '')}
                      </span>

                      {/* Attachments */}
                      {m.attachments?.map((att) => (
                        <div key={att.id} className={`rounded-2xl overflow-hidden ${isOutgoing ? 'rounded-br-sm' : 'rounded-bl-sm'}`}>
                          {att.file_type === 'image' && (
                            <a href={att.data_url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={att.thumb_url ?? att.data_url}
                                alt="imagem"
                                className="max-w-[240px] max-h-[200px] object-cover"
                              />
                            </a>
                          )}
                          {att.file_type === 'audio' && (
                            <audio controls src={att.data_url} className="max-w-[240px]" />
                          )}
                          {att.file_type === 'file' && (
                            <a
                              href={att.data_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center gap-2 px-4 py-2.5 text-sm underline ${
                                isOutgoing ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200'
                              }`}
                            >
                              📎 Arquivo
                            </a>
                          )}
                        </div>
                      ))}

                      {/* Text content */}
                      {m.content && (
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                            isOutgoing
                              ? 'bg-blue-600 text-white rounded-br-sm'
                              : 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200 rounded-bl-sm'
                          }`}
                        >
                          {renderWhatsApp(m.content)}
                        </div>
                      )}

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

            {/* Image preview */}
            {imagePreview && (
              <div className="relative inline-block mb-3">
                <img src={imagePreview} alt="preview" className="h-20 rounded-xl object-cover border border-gray-200 dark:border-slate-700" />
                <button
                  onClick={clearImage}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-gray-800 text-white flex items-center justify-center"
                >
                  <X size={10} />
                </button>
              </div>
            )}

            {/* Recording indicator */}
            {recording && (
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-xs font-medium text-red-500">Gravando {fmtSec(recSec)}</span>
                <span className="text-xs text-gray-400 dark:text-slate-500">— clique no microfone para parar e enviar</span>
              </div>
            )}

            {sendError && <p className="text-xs text-red-500 mb-2">{sendError}</p>}

            <div className="flex items-end gap-2">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />

              {/* Image button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={recording || sending}
                className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl
                  bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400
                  hover:bg-gray-200 dark:hover:bg-slate-700
                  disabled:opacity-40 transition-colors"
                title="Enviar imagem"
              >
                <ImageIcon size={17} />
              </button>

              {/* Mic button */}
              <button
                onClick={handleRecordToggle}
                disabled={sending || !!imageFile}
                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors
                  disabled:opacity-40 ${
                    recording
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-700'
                  }`}
                title={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
              >
                {recording ? <MicOff size={17} /> : <Mic size={17} />}
              </button>

              {/* Textarea */}
              <textarea
                ref={textareaRef}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={recording}
                placeholder={
                  recording
                    ? 'Gravando áudio…'
                    : imageFile
                    ? 'Legenda opcional… (Enter para enviar)'
                    : 'Digite sua resposta… (Enter para enviar, Shift+Enter para nova linha)'
                }
                rows={2}
                className="flex-1 resize-none rounded-xl px-4 py-2.5 text-sm
                  bg-gray-50 dark:bg-slate-800
                  border border-gray-200 dark:border-slate-700
                  text-gray-800 dark:text-slate-100
                  placeholder-gray-400 dark:placeholder-slate-600
                  focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600
                  disabled:opacity-50 transition-colors"
              />

              {/* Send button */}
              <button
                onClick={handleSend}
                disabled={!canSend}
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
