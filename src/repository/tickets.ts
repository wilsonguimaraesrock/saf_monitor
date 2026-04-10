/**
 * Repository — camada de acesso ao banco para tickets e execuções
 */

import { query, queryOne, execute, withTransaction } from '../lib/db';
import { RawTicketUpdate } from '../lib/types';
import { SafTicket, TicketSnapshot, DailyStats, CronRun } from '../lib/types';
import { format } from 'date-fns';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('repository');

// -------------------------------------------------------
// TICKETS
// -------------------------------------------------------

/** Upsert de ticket. Retorna { isNew: boolean } */
export async function upsertTicket(ticket: SafTicket): Promise<{ isNew: boolean }> {
  // Tenta encontrar pelo external_id (ID numérico atual)
  let existing = await queryOne<{ id: string; external_id: string }>(
    'SELECT id, external_id FROM saf_tickets WHERE external_id = $1',
    [ticket.externalId]
  );

  // Fallback: busca pelo número formatado (ex: "260126-010") quando o externalId
  // ainda está no formato antigo (antes da migração para ID numérico)
  if (!existing && ticket.number) {
    const byNumber = await queryOne<{ id: string; external_id: string }>(
      'SELECT id, external_id FROM saf_tickets WHERE number = $1 AND external_id != $2',
      [ticket.number, ticket.externalId]
    );
    if (byNumber) {
      existing = byNumber;
      // Atualiza o external_id para o novo formato numérico
      await execute(
        'UPDATE saf_tickets SET external_id = $1 WHERE id = $2',
        [ticket.externalId, byNumber.id]
      );
      log.info(`Migrou external_id ${byNumber.external_id} → ${ticket.externalId} (number=${ticket.number})`);
    }
  }

  if (existing) {
    await execute(
      `UPDATE saf_tickets SET
         title = $1, description = $2, status = $3,
         priority_category = $4, priority_score = $5,
         franchise = $6, service = $7, responsible = $8,
         opened_at = $9, due_at = $10, last_updated_at = $11,
         resolved_at = $12, is_overdue = $13, days_overdue = $14,
         days_open = $15, days_waiting_us = $16,
         awaiting_our_response = $17, updated_at = NOW()
       WHERE external_id = $18`,
      [
        ticket.title, ticket.description, ticket.status,
        ticket.priorityCategory, ticket.priorityScore,
        ticket.franchise, ticket.service, ticket.responsible,
        ticket.openedAt ?? null, ticket.dueAt ?? null, ticket.lastUpdatedAt ?? null,
        ticket.resolvedAt ?? null, ticket.isOverdue, ticket.daysOverdue,
        ticket.daysOpen, ticket.daysWaitingUs,
        ticket.awaitingOurResponse, ticket.externalId,
      ]
    );
    return { isNew: false };
  }

  await execute(
    `INSERT INTO saf_tickets
       (external_id, number, title, description, status, priority_category,
        priority_score, franchise, service, responsible, opened_at, due_at,
        last_updated_at, resolved_at, is_overdue, days_overdue, days_open,
        days_waiting_us, awaiting_our_response)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      ticket.externalId, ticket.number, ticket.title, ticket.description,
      ticket.status, ticket.priorityCategory, ticket.priorityScore,
      ticket.franchise, ticket.service, ticket.responsible,
      ticket.openedAt ?? null, ticket.dueAt ?? null, ticket.lastUpdatedAt ?? null,
      ticket.resolvedAt ?? null, ticket.isOverdue, ticket.daysOverdue,
      ticket.daysOpen, ticket.daysWaitingUs, ticket.awaitingOurResponse,
    ]
  );
  return { isNew: true };
}

/**
 * Salva mensagens/atualizações de um ticket.
 * Usa ON CONFLICT (ticket_id, occurred_at, author) para não duplicar.
 */
/** Converte "DD/MM/YYYY HH:MM" ou "DD/MM/YYYY" para ISO 8601 */
function parseBrDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // DD/MM/YYYY HH:MM[:SS]
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) {
    const [, day, month, year, h = '00', min = '00', sec = '00'] = m;
    return `${year}-${month}-${day}T${h}:${min}:${sec}`;
  }
  // Já ISO ou outro formato — tenta parsear
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export async function saveTicketUpdates(externalId: string, updates: RawTicketUpdate[]): Promise<void> {
  if (!updates.length) return;

  const ticket = await queryOne<{ id: string }>(
    'SELECT id FROM saf_tickets WHERE external_id = $1',
    [externalId]
  );
  if (!ticket) return;

  for (const u of updates) {
    try {
      await execute(
        `INSERT INTO saf_ticket_updates (ticket_id, author, content, is_ours, occurred_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [ticket.id, u.author ?? null, u.content ?? null, u.isOurs ?? false, parseBrDate(u.occurredAt)]
      );
    } catch (err) {
      log.warn(`saveTicketUpdates skip (${externalId}): ${(err as Error).message}`);
    }
  }
}

/** Snapshot diário de um ticket */
export async function saveSnapshot(ticket: SafTicket): Promise<void> {
  const today = format(new Date(), 'yyyy-MM-dd');
  await execute(
    `INSERT INTO saf_ticket_snapshots
       (ticket_id, snapshot_date, status, priority_score, is_overdue,
        days_overdue, days_open, awaiting_our_response, priority_category)
     SELECT id, $2, $3, $4, $5, $6, $7, $8, $9
     FROM saf_tickets WHERE external_id = $1
     ON CONFLICT (ticket_id, snapshot_date) DO UPDATE SET
       status = EXCLUDED.status,
       priority_score = EXCLUDED.priority_score,
       is_overdue = EXCLUDED.is_overdue,
       days_overdue = EXCLUDED.days_overdue,
       days_open = EXCLUDED.days_open,
       awaiting_our_response = EXCLUDED.awaiting_our_response,
       priority_category = EXCLUDED.priority_category`,
    [
      ticket.externalId, today, ticket.status, ticket.priorityScore,
      ticket.isOverdue, ticket.daysOverdue, ticket.daysOpen,
      ticket.awaitingOurResponse, ticket.priorityCategory,
    ]
  );
}

/** Calcula e salva estatísticas do dia */
export async function saveDailyStats(): Promise<void> {
  const today = format(new Date(), 'yyyy-MM-dd');

  const stats = await queryOne<{
    total_open: string; total_overdue: string; total_awaiting: string;
    total_critical: string; total_resolved: string;
    avg_response: string; avg_resolution: string;
    cnt_dsa: string; cnt_rock: string; cnt_plat: string;
    cnt_email: string; cnt_outros: string;
  }>(
    `SELECT
       COUNT(*) FILTER (WHERE status NOT IN ('resolvido','cancelado'))               AS total_open,
       COUNT(*) FILTER (WHERE is_overdue)                                            AS total_overdue,
       COUNT(*) FILTER (WHERE awaiting_our_response)                                 AS total_awaiting,
       COUNT(*) FILTER (WHERE priority_score >= 70)                                  AS total_critical,
       COUNT(*) FILTER (WHERE resolved_at::date = CURRENT_DATE)                     AS total_resolved,
       AVG(days_waiting_us) FILTER (WHERE awaiting_our_response)                    AS avg_response,
       AVG(days_open) FILTER (WHERE status = 'resolvido')                           AS avg_resolution,
       COUNT(*) FILTER (WHERE priority_category = 'dsa_joy')                        AS cnt_dsa,
       COUNT(*) FILTER (WHERE priority_category = 'myrock')                         AS cnt_rock,
       COUNT(*) FILTER (WHERE priority_category = 'plataformas_aulas')              AS cnt_plat,
       COUNT(*) FILTER (WHERE priority_category = 'suporte_emails')                 AS cnt_email,
       COUNT(*) FILTER (WHERE priority_category = 'outros')                         AS cnt_outros
     FROM saf_tickets`,
    []
  );

  if (!stats) return;

  await execute(
    `INSERT INTO daily_stats
       (stat_date, total_open, total_overdue, total_awaiting_our, total_critical,
        total_resolved_today, avg_response_time_hours, avg_resolution_time_hours,
        count_dsa_joy, count_myrock, count_plataformas_aulas, count_suporte_emails, count_outros)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (stat_date) DO UPDATE SET
       total_open = EXCLUDED.total_open,
       total_overdue = EXCLUDED.total_overdue,
       total_awaiting_our = EXCLUDED.total_awaiting_our,
       total_critical = EXCLUDED.total_critical,
       total_resolved_today = EXCLUDED.total_resolved_today,
       avg_response_time_hours = EXCLUDED.avg_response_time_hours,
       avg_resolution_time_hours = EXCLUDED.avg_resolution_time_hours,
       count_dsa_joy = EXCLUDED.count_dsa_joy,
       count_myrock = EXCLUDED.count_myrock,
       count_plataformas_aulas = EXCLUDED.count_plataformas_aulas,
       count_suporte_emails = EXCLUDED.count_suporte_emails,
       count_outros = EXCLUDED.count_outros`,
    [
      today,
      Number(stats.total_open), Number(stats.total_overdue),
      Number(stats.total_awaiting), Number(stats.total_critical),
      Number(stats.total_resolved),
      Number(stats.avg_response ?? 0) * 24,
      Number(stats.avg_resolution ?? 0) * 24,
      Number(stats.cnt_dsa), Number(stats.cnt_rock),
      Number(stats.cnt_plat), Number(stats.cnt_email), Number(stats.cnt_outros),
    ]
  );
}

// -------------------------------------------------------
// CRON RUNS
// -------------------------------------------------------

export async function createCronRun(triggeredBy: string): Promise<string> {
  const result = await queryOne<{ id: string }>(
    `INSERT INTO cron_runs (run_type, status, triggered_by)
     VALUES ($1, 'running', $2) RETURNING id`,
    [triggeredBy === 'scheduled' ? 'scheduled' : 'on_demand', triggeredBy]
  );
  return result!.id;
}

export async function finishCronRun(
  id: string,
  data: {
    status: 'success' | 'error';
    ticketsFound?: number;
    ticketsNew?: number;
    ticketsUpdated?: number;
    alertsSent?: number;
    durationMs?: number;
    errorMessage?: string;
  }
): Promise<void> {
  await execute(
    `UPDATE cron_runs SET
       status = $1, tickets_found = $2, tickets_new = $3,
       tickets_updated = $4, alerts_sent = $5, duration_ms = $6,
       error_message = $7, finished_at = NOW()
     WHERE id = $8`,
    [
      data.status, data.ticketsFound ?? 0, data.ticketsNew ?? 0,
      data.ticketsUpdated ?? 0, data.alertsSent ?? 0,
      data.durationMs ?? null, data.errorMessage ?? null, id,
    ]
  );
}

// -------------------------------------------------------
// QUERIES DO DASHBOARD
// -------------------------------------------------------

// Janela padrão: apenas tickets abertos nos últimos 3 meses
const WINDOW = `AND opened_at >= NOW() - INTERVAL '3 months'`;

// Categorias do escopo — exclui 'outros' e 'nao_classificado' de todas as queries
const SCOPE_CATS = `AND priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')`;

export async function getOverdueTickets(limit = 50) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE is_overdue = true AND status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}
     ORDER BY days_overdue DESC, priority_score DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getAwaitingTickets(limit = 50) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE awaiting_our_response = true AND status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}
     ORDER BY days_waiting_us DESC, priority_score DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getOldestTickets(limit = 10) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}
     ORDER BY opened_at ASC NULLS LAST
     LIMIT $1`,
    [limit]
  );
}

export async function getCriticalTickets(limit = 30) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE priority_score >= 70 AND status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}
     ORDER BY priority_score DESC
     LIMIT $1`,
    [limit]
  );
}

export async function getDashboardStats() {
  return queryOne(
    `SELECT
       (SELECT COUNT(*) FROM saf_tickets WHERE status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS})               AS total_open,
       (SELECT COUNT(*) FROM saf_tickets WHERE is_overdue AND status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}) AS total_overdue,
       (SELECT COUNT(*) FROM saf_tickets WHERE awaiting_our_response AND status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}) AS total_awaiting,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_score >= 70 AND status NOT IN ('resolvido','cancelado') ${WINDOW} ${SCOPE_CATS}) AS total_critical,
       (SELECT COUNT(*) FROM saf_tickets WHERE resolved_at::date = CURRENT_DATE ${SCOPE_CATS})                               AS total_resolved_today,
       (SELECT ROUND(AVG(days_waiting_us)::numeric * 24, 1) FROM saf_tickets WHERE awaiting_our_response ${WINDOW} ${SCOPE_CATS}) AS avg_response_hours,
       (SELECT ROUND(AVG(days_open)::numeric * 24, 1) FROM saf_tickets WHERE status = 'resolvido' ${WINDOW} ${SCOPE_CATS})   AS avg_resolution_hours,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'dsa_joy' AND status NOT IN ('resolvido','cancelado') ${WINDOW}) AS count_dsa_joy,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'myrock' AND status NOT IN ('resolvido','cancelado') ${WINDOW}) AS count_myrock,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'plataformas_aulas' AND status NOT IN ('resolvido','cancelado') ${WINDOW}) AS count_plataformas_aulas,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'suporte_emails' AND status NOT IN ('resolvido','cancelado') ${WINDOW}) AS count_suporte_emails`
  );
}

export async function getTrendData(days = 14) {
  return query(
    `SELECT * FROM daily_stats
     WHERE stat_date >= CURRENT_DATE - INTERVAL '${days} days'
     ORDER BY stat_date ASC`
  );
}

export async function getTicketsFiltered(filters: {
  status?: string;
  category?: string;
  franchise?: string;
  isOverdue?: boolean;
  awaitingOurResponse?: boolean;
  isCritical?: boolean;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}) {
  const conditions: string[] = [
    "opened_at >= NOW() - INTERVAL '3 months'",
    // Sempre limita às categorias do escopo, a menos que uma categoria específica seja selecionada
    "priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')",
  ];
  const params: unknown[] = [];
  let p = 1;

  // Por padrão, exclui resolvidos e cancelados.
  // Só mostra se o filtro de status pedir explicitamente.
  if (!filters.status) {
    conditions.push("status NOT IN ('resolvido','cancelado')");
  }

  if (filters.status)               { conditions.push(`status = $${p++}`);              params.push(filters.status); }
  if (filters.category)             {
    // Substitui o filtro de escopo pelo de categoria específica
    const idx = conditions.findIndex((c) => c.startsWith('priority_category IN'));
    conditions[idx] = `priority_category = $${p++}`;
    params.push(filters.category);
  }
  if (filters.franchise)            { conditions.push(`franchise ILIKE $${p++}`);       params.push(`%${filters.franchise}%`); }
  if (filters.isOverdue !== undefined)           { conditions.push(`is_overdue = $${p++}`);             params.push(filters.isOverdue); }
  if (filters.awaitingOurResponse !== undefined) { conditions.push(`awaiting_our_response = $${p++}`); params.push(filters.awaitingOurResponse); }
  if (filters.isCritical)                        { conditions.push(`priority_score >= 70`); }
  if (filters.dateFrom)             { conditions.push(`opened_at >= $${p++}::date`);    params.push(filters.dateFrom); }
  if (filters.dateTo)               { conditions.push(`opened_at < ($${p++}::date + INTERVAL '1 day')`); params.push(filters.dateTo); }

  const limit  = filters.limit  ?? 200;
  const offset = filters.offset ?? 0;
  const dir    = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const sql = `
    SELECT * FROM saf_tickets
    WHERE ${conditions.join(' AND ')}
    ORDER BY opened_at ${dir} NULLS LAST
    LIMIT $${p++} OFFSET $${p++}
  `;
  params.push(limit, offset);

  return query(sql, params);
}
