'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Send, School, Phone, Building2, Layers, Tag, AlertTriangle, MessageSquare,
} from 'lucide-react';

/**
 * "Iniciar conversa" — atendimento ativo da franqueadora para a escola.
 *
 * O cadastro (unidade, número, departamento, subdepartamento, assunto) vem do
 * ChatBot Whats Franquias, que é quem entrega no WhatsApp. Não existe campo de
 * mensagem: a primeira mensagem é um template aprovado pela Meta, montado pelo
 * chatbot com setor, assunto e nome do atendente — exigência do WhatsApp para
 * conversa iniciada pela empresa.
 */

interface WhatsappNumber { id: string; phoneNumber: string; active: boolean }
interface Unit { id: string; name: string; state?: string | null; whatsappNumbers: WhatsappNumber[] }
interface Named { id: string; name: string }

interface Props {
  sectorSlug: string;
  sectorName: string;
  /** Nome do departamento no cadastro do chatbot, quando difere do nome do setor */
  chatbotDepartment?: string;
  onClose: () => void;
  /** Chamado no 201 com a conversa criada e no 409 apenas com o id */
  onStarted: (arg: { conversationId: number; conversation?: unknown }) => void;
}

type Erro = { texto: string; conversationId?: number | null } | null;

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '');
  const local = d.startsWith('55') ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}

/** Mesma aparência dos selects de filtro do painel (ver Filters.tsx). */
const INPUT_CLS = `
  w-full text-sm rounded-lg px-3 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500
  border border-gray-200 bg-white text-gray-700
  dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200
`.trim();

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function IniciarConversaModal({
  sectorSlug, sectorName, chatbotDepartment, onClose, onStarted,
}: Props) {
  const [units, setUnits]       = useState<Unit[]>([]);
  const [departments, setDeps]  = useState<Named[]>([]);
  const [subdeps, setSubdeps]   = useState<Named[]>([]);
  const [subjects, setSubjects] = useState<Named[]>([]);

  const [unitId, setUnitId]         = useState('');
  const [numberId, setNumberId]     = useState('');
  const [departmentId, setDeptId]   = useState('');
  const [subdepId, setSubdepId]     = useState('');
  const [subjectId, setSubjectId]   = useState('');

  const [busca, setBusca]       = useState('');
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro]         = useState<Erro>(null);

  const buscar = useCallback(async (tipo: string, id?: string) => {
    const qs = new URLSearchParams({ tipo, ...(id ? { id } : {}) });
    const res = await fetch(`/api/chatbot/catalogo?${qs}`, {
      cache: 'no-store',
      credentials: 'include',
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.error ?? `Falha ao carregar ${tipo}`);
    return (data?.items ?? []) as never[];
  }, []);

  // Unidades e departamentos: uma vez, na abertura
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [u, d] = await Promise.all([buscar('units'), buscar('departments')]);
        if (cancelado) return;
        setUnits(u as unknown as Unit[]);
        setDeps(d as unknown as Named[]);

        // Pré-seleciona o departamento do setor de onde o modal foi aberto.
        // Sem correspondência, o atendente escolhe na lista — não travamos.
        const alvo = norm(chatbotDepartment ?? sectorName);
        const achado = (d as unknown as Named[]).find((x) => norm(x.name) === alvo);
        if (achado) setDeptId(achado.id);
      } catch (err) {
        if (!cancelado) setErro({ texto: (err as Error).message });
      } finally {
        if (!cancelado) setCarregando(false);
      }
    })();
    return () => { cancelado = true; };
  }, [buscar, chatbotDepartment, sectorName]);

  // Cascata: departamento → subdepartamentos
  useEffect(() => {
    setSubdepId(''); setSubjects([]); setSubjectId('');
    if (!departmentId) { setSubdeps([]); return; }
    let cancelado = false;
    buscar('subdepartments', departmentId)
      .then((r) => { if (!cancelado) setSubdeps(r as unknown as Named[]); })
      .catch((err) => { if (!cancelado) setErro({ texto: (err as Error).message }); });
    return () => { cancelado = true; };
  }, [departmentId, buscar]);

  // Cascata: subdepartamento → assuntos
  useEffect(() => {
    setSubjectId('');
    if (!subdepId) { setSubjects([]); return; }
    let cancelado = false;
    buscar('subjects', subdepId)
      .then((r) => { if (!cancelado) setSubjects(r as unknown as Named[]); })
      .catch((err) => { if (!cancelado) setErro({ texto: (err as Error).message }); });
    return () => { cancelado = true; };
  }, [subdepId, buscar]);

  const unidade = useMemo(() => units.find((u) => u.id === unitId), [units, unitId]);

  // Números ativos da unidade escolhida; um só já vem selecionado
  const numeros = useMemo(
    () => (unidade?.whatsappNumbers ?? []).filter((n) => n.active !== false),
    [unidade]
  );
  useEffect(() => {
    setNumberId(numeros.length === 1 ? numeros[0].id : '');
  }, [numeros]);

  const unidadesFiltradas = useMemo(() => {
    const q = norm(busca);
    const lista = q
      ? units.filter((u) => norm(`${u.name} ${u.state ?? ''}`).includes(q))
      : units;
    return [...lista].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [units, busca]);

  const completo = unitId && numberId && departmentId && subdepId && subjectId;

  async function enviar() {
    if (!completo || enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch('/api/chatbot/active-handoff', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitId, whatsappNumberId: numberId, departmentId,
          subdepartmentId: subdepId, subjectId,
          sectorSlug,
          // Só para auditoria e log legível — o chatbot valida pelos ids.
          unitName: unidade?.name,
          whatsappNumber: numeros.find((n) => n.id === numberId)?.phoneNumber,
          departmentName: departments.find((d) => d.id === departmentId)?.name,
          subdepartmentName: subdeps.find((s) => s.id === subdepId)?.name,
          subjectName: subjects.find((s) => s.id === subjectId)?.name,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.conversationId) {
        onStarted({
          conversationId: Number(data.conversationId),
          conversation: data.conversation,
        });
        return;
      }
      setErro({
        texto: data?.error ?? `Não foi possível iniciar o atendimento (HTTP ${res.status}).`,
        conversationId: data?.conversationId ?? null,
      });
    } catch (err) {
      setErro({ texto: (err as Error).message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900
          border border-gray-200 dark:border-slate-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-200 dark:border-slate-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
              Iniciar conversa
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-0.5">
              A escola recebe uma mensagem no WhatsApp com o setor, o assunto e seu nome.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-slate-200
              hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {carregando ? (
          <div className="p-10 flex flex-col items-center gap-3 text-gray-500 dark:text-slate-400">
            <Loader2 size={22} className="animate-spin" />
            <span className="text-sm">Carregando cadastro das escolas…</span>
          </div>
        ) : (
          <div className="p-5 flex flex-col gap-4">

            {/* Escola */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <School size={13} /> Escola
              </span>
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome ou UF…"
                className={INPUT_CLS}
              />
              <select
                value={unitId}
                onChange={(e) => setUnitId(e.target.value)}
                className={INPUT_CLS}
                size={1}
              >
                <option value="">Selecione a escola…</option>
                {unidadesFiltradas.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}{u.state ? ` — ${u.state}` : ''}
                  </option>
                ))}
              </select>
            </label>

            {/* Número */}
            {unitId && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                  <Phone size={13} /> Número de WhatsApp
                </span>
                {numeros.length === 0 ? (
                  <span className="text-sm text-amber-600 dark:text-amber-400 inline-flex items-center gap-1.5">
                    <AlertTriangle size={14} />
                    Esta escola não tem número ativo no cadastro do chatbot.
                  </span>
                ) : (
                  <select
                    value={numberId}
                    onChange={(e) => setNumberId(e.target.value)}
                    className={INPUT_CLS}
                  >
                    {numeros.length > 1 && <option value="">Selecione o número…</option>}
                    {numeros.map((n) => (
                      <option key={n.id} value={n.id}>{formatPhone(n.phoneNumber)}</option>
                    ))}
                  </select>
                )}
              </label>
            )}

            {/* Departamento */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <Building2 size={13} /> Departamento
              </span>
              <select
                value={departmentId}
                onChange={(e) => setDeptId(e.target.value)}
                className={INPUT_CLS}
              >
                <option value="">Selecione o departamento…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>

            {/* Subdepartamento */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <Layers size={13} /> Subdepartamento
              </span>
              <select
                value={subdepId}
                onChange={(e) => setSubdepId(e.target.value)}
                disabled={!departmentId || subdeps.length === 0}
                className={`${INPUT_CLS} disabled:opacity-50`}
              >
                <option value="">
                  {!departmentId ? 'Escolha o departamento primeiro' : 'Selecione…'}
                </option>
                {subdeps.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {/* Assunto */}
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                <Tag size={13} /> Assunto
              </span>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                disabled={!subdepId || subjects.length === 0}
                className={`${INPUT_CLS} disabled:opacity-50`}
              >
                <option value="">
                  {!subdepId ? 'Escolha o subdepartamento primeiro' : 'Selecione…'}
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>

            {/* A restrição do WhatsApp vaza para cá: até a escola responder ao
                template, nenhuma mensagem de texto livre é entregue. */}
            <p className="text-xs text-gray-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60
              border border-gray-200 dark:border-slate-700 rounded-lg p-3 leading-relaxed">
              A primeira mensagem é um modelo aprovado pela Meta — não é possível escrever um texto
              próprio aqui. <b>Enquanto a escola não responder, a caixa de resposta fica bloqueada</b>,
              porque o WhatsApp não entrega texto livre antes disso.
            </p>

            {erro && (
              <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-3
                flex flex-col gap-2">
                <span className="text-sm text-red-700 dark:text-red-300 inline-flex items-start gap-2">
                  <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                  {erro.texto}
                </span>
                {erro.conversationId && (
                  <button
                    onClick={() => onStarted({ conversationId: erro.conversationId! })}
                    className="self-start inline-flex items-center gap-1.5 text-sm font-medium
                      text-red-700 dark:text-red-300 underline underline-offset-2"
                  >
                    <MessageSquare size={14} />
                    Abrir o atendimento em andamento
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-slate-300
                  hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={enviar}
                disabled={!completo || enviando}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold
                  bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50
                  disabled:cursor-not-allowed transition-colors"
              >
                {enviando ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                {enviando ? 'Iniciando…' : 'Iniciar conversa'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
