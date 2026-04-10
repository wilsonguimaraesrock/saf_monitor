/**
 * Normaliza um RawTicket (dado bruto do scraper) em SafTicket.
 * Converte datas, mapeia status, calcula métricas derivadas.
 */

import { differenceInCalendarDays, parseISO, isValid } from 'date-fns';
import { RawTicket, SafTicket, SafStatus } from '../lib/types';

// -------------------------------------------------------
// Mapeamento de texto livre → SafStatus
// -------------------------------------------------------
const STATUS_MAP: Record<string, SafStatus> = {
  // ── Valores reais confirmados pelo sistema dfranquias ──
  'aberto':                      'aberto',
  'em andamento':                'em_andamento',
  'em_andamento':                'em_andamento',
  // "Aguardando Franqueadora" = estamos esperando que eles respondam
  'aguardando franqueadora':     'aguardando_nossa_resposta',
  // "Aguardando Franquia" = eles estão esperando que nos respondamos → nossa vez
  'aguardando franquia':         'aguardando_franquia',
  'aguardando nossa resposta':   'aguardando_nossa_resposta',
  'aguardando resposta':         'aguardando_nossa_resposta',
  'aguardando nossa':            'aguardando_nossa_resposta',
  'aguardando cliente':          'aguardando_franquia',
  'resolvido':                   'resolvido',
  'fechado':                     'resolvido',
  'concluído':                   'resolvido',
  'concluido':                   'resolvido',
  'cancelado':                   'cancelado',
  // Inglês (fallback)
  'open':                        'aberto',
  'in progress':                 'em_andamento',
  'waiting':                     'aguardando_nossa_resposta',
  'resolved':                    'resolvido',
  'closed':                      'resolvido',
  'cancelled':                   'cancelado',
};

function parseStatus(raw?: string): SafStatus {
  if (!raw) return 'aberto';
  const key = raw.toLowerCase().trim();
  return STATUS_MAP[key] ?? 'aberto';
}

// -------------------------------------------------------
// Parser de datas flexível
// Aceita: ISO 8601, DD/MM/YYYY, DD/MM/YYYY HH:MM
// -------------------------------------------------------
export function parseDate(raw?: string): Date | undefined {
  if (!raw || raw.trim() === '') return undefined;

  const s = raw.trim();

  // Já é ISO 8601
  const iso = parseISO(s);
  if (isValid(iso)) return iso;

  // DD/MM/YYYY ou DD/MM/YYYY HH:MM:SS
  const ptMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (ptMatch) {
    const [, day, month, year, h = '0', m = '0', sec = '0'] = ptMatch;
    const d = new Date(Number(year), Number(month) - 1, Number(day), Number(h), Number(m), Number(sec));
    if (isValid(d)) return d;
  }

  // MM/DD/YYYY (inglês)
  const enMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (enMatch) {
    const d = new Date(s);
    if (isValid(d)) return d;
  }

  return undefined;
}

// -------------------------------------------------------
// Normalização principal
// -------------------------------------------------------
export function normalizeTicket(raw: RawTicket): SafTicket {
  const now      = new Date();
  const openedAt = parseDate(raw.openedAt);
  const dueAt    = parseDate(raw.dueAt);
  const lastUpdatedAt = parseDate(raw.lastUpdatedAt);

  // O XLSX só exporta "Aberto"/"Resolvido" no Status Atual.
  // A coluna "Status resp." da listagem HTML contém o status detalhado
  // (ex: "Aguardando Franqueadora"). Usa statusResponse como refinamento.
  const statusFromResp = raw.statusResponse ? parseStatus(raw.statusResponse) : undefined;
  const statusBase     = parseStatus(raw.status);
  // statusResponse prevalece quando é mais específico que "aberto"
  const status = (statusFromResp && statusFromResp !== 'aberto') ? statusFromResp : statusBase;

  // Calcula dias em aberto
  const daysOpen = openedAt
    ? Math.max(0, differenceInCalendarDays(now, openedAt))
    : 0;

  // Verifica atraso
  const isOverdue = dueAt ? dueAt < now && status !== 'resolvido' && status !== 'cancelado' : false;
  const daysOverdue = isOverdue && dueAt
    ? Math.max(0, differenceInCalendarDays(now, dueAt))
    : 0;

  // Aguardando nossa resposta
  const awaitingOurResponse = status === 'aguardando_nossa_resposta';

  // Dias aguardando nossa resposta
  // Heurística: usa lastUpdatedAt como início da espera
  const daysWaitingUs = awaitingOurResponse && lastUpdatedAt
    ? Math.max(0, differenceInCalendarDays(now, lastUpdatedAt))
    : 0;

  return {
    id:                  '',    // preenchido pelo DB
    externalId:          raw.externalId,
    number:              raw.number,
    title:               raw.title,
    description:         raw.description,
    status,
    priorityCategory:    'nao_classificado',  // preenchido pelo classifier
    priorityScore:       0,                   // preenchido pelo scorer
    franchise:           raw.franchise,
    service:             raw.service,
    responsible:         raw.responsible,
    openedAt,
    dueAt,
    lastUpdatedAt,
    resolvedAt:          status === 'resolvido' ? (lastUpdatedAt ?? now) : undefined,
    isOverdue,
    daysOverdue,
    daysOpen,
    daysWaitingUs,
    awaitingOurResponse,
    createdAt:           now,
    updatedAt:           now,
  };
}
