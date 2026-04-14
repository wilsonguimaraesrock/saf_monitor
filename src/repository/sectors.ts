/**
 * Repository — queries específicas por setor
 *
 * Todas as queries filtram por department = ANY($1::text[])
 * em vez de priority_category, para suportar multi-setor.
 */

import { query, queryOne, execute } from '../lib/db';
import { SectorContact } from '../lib/types';

const WINDOW = `AND opened_at >= NOW() - INTERVAL '3 months'`;

// -------------------------------------------------------
// STATS POR SETOR
// -------------------------------------------------------

export async function getSectorStats(
  departments: string[],
  opts?: { dateFrom?: string; dateTo?: string }
) {
  const depts = departments; // array passado como $1
  const params: unknown[] = [depts];
  let p = 2;

  let dateFilter: string;
  if (opts?.dateFrom && opts?.dateTo) {
    dateFilter = `AND opened_at >= $${p++}::date AND opened_at < ($${p++}::date + INTERVAL '1 day')`;
    params.push(opts.dateFrom, opts.dateTo);
  } else {
    dateFilter = `AND opened_at >= NOW() - INTERVAL '3 months'`;
  }

  const deptFilter = `AND department = ANY($1::text[])`;

  return queryOne(
    `SELECT
       (SELECT COUNT(*) FROM saf_tickets
        WHERE status NOT IN ('resolvido','cancelado') ${dateFilter} ${deptFilter})               AS total_open,
       (SELECT COUNT(*) FROM saf_tickets
        WHERE is_overdue AND status NOT IN ('resolvido','cancelado') ${dateFilter} ${deptFilter}) AS total_overdue,
       (SELECT COUNT(*) FROM saf_tickets
        WHERE awaiting_our_response AND status NOT IN ('resolvido','cancelado') ${dateFilter} ${deptFilter}) AS total_awaiting,
       (SELECT COUNT(*) FROM saf_tickets
        WHERE status = 'aguardando_franquia' ${dateFilter} ${deptFilter})                        AS total_awaiting_school,
       (SELECT COUNT(*) FROM saf_tickets
        WHERE status = 'aberto' ${dateFilter} ${deptFilter})                                     AS total_not_opened,
       (SELECT COUNT(*) FROM saf_tickets
        WHERE awaiting_our_response = false
          AND status NOT IN ('resolvido','cancelado','aguardando_franquia') ${dateFilter} ${deptFilter}) AS total_no_response_status,
       (SELECT COUNT(*) FROM saf_tickets
        WHERE resolved_at::date = CURRENT_DATE ${deptFilter})                                    AS total_resolved_today`,
    params
  );
}

/** Contagem de tickets por departamento (para breakdown dentro do setor) */
export async function getSectorDeptBreakdown(
  departments: string[],
  opts?: { dateFrom?: string; dateTo?: string }
) {
  const params: unknown[] = [departments];
  let p = 2;

  let dateFilter: string;
  if (opts?.dateFrom && opts?.dateTo) {
    dateFilter = `AND opened_at >= $${p++}::date AND opened_at < ($${p++}::date + INTERVAL '1 day')`;
    params.push(opts.dateFrom, opts.dateTo);
  } else {
    dateFilter = `AND opened_at >= NOW() - INTERVAL '3 months'`;
  }

  return query(
    `SELECT department, COUNT(*) AS total
     FROM saf_tickets
     WHERE department = ANY($1::text[])
       AND status NOT IN ('resolvido','cancelado')
       ${dateFilter}
     GROUP BY department
     ORDER BY total DESC`,
    params
  );
}

// -------------------------------------------------------
// TICKETS POR SETOR
// -------------------------------------------------------

export async function getSectorOverdueTickets(departments: string[], limit = 10) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE is_overdue = true
       AND status NOT IN ('resolvido','cancelado')
       AND department = ANY($1::text[])
       ${WINDOW}
     ORDER BY days_overdue DESC, priority_score DESC
     LIMIT $2`,
    [departments, limit]
  );
}

export async function getSectorAwaitingTickets(departments: string[], limit = 10) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE awaiting_our_response = true
       AND status NOT IN ('resolvido','cancelado')
       AND department = ANY($1::text[])
       ${WINDOW}
     ORDER BY days_waiting_us DESC, priority_score DESC
     LIMIT $2`,
    [departments, limit]
  );
}

export async function getSectorOldestTickets(departments: string[], limit = 5) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE status NOT IN ('resolvido','cancelado')
       AND department = ANY($1::text[])
       ${WINDOW}
     ORDER BY opened_at ASC NULLS LAST
     LIMIT $2`,
    [departments, limit]
  );
}

export async function getSectorNotOpenedTickets(departments: string[], limit = 20) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE status = 'aberto'
       AND department = ANY($1::text[])
       ${WINDOW}
     ORDER BY opened_at ASC NULLS LAST
     LIMIT $2`,
    [departments, limit]
  );
}

export async function getSectorNoResponseTickets(departments: string[], limit = 20) {
  return query(
    `SELECT * FROM saf_tickets
     WHERE awaiting_our_response = false
       AND status NOT IN ('resolvido','cancelado','aguardando_franquia')
       AND department = ANY($1::text[])
       ${WINDOW}
     ORDER BY opened_at ASC NULLS LAST
     LIMIT $2`,
    [departments, limit]
  );
}

export async function getSectorTicketsFiltered(
  departments: string[],
  filters: {
    status?: string;
    franchise?: string;
    isOverdue?: boolean;
    awaitingOurResponse?: boolean;
    noResponseStatus?: boolean;
    dateFrom?: string;
    dateTo?: string;
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }
) {
  const conditions: string[] = [
    "opened_at >= NOW() - INTERVAL '3 months'",
    `department = ANY($1::text[])`,
  ];
  const params: unknown[] = [departments];
  let p = 2;

  if (!filters.status) {
    conditions.push("status NOT IN ('resolvido','cancelado')");
  }

  if (filters.status)               { conditions.push(`status = $${p++}`);              params.push(filters.status); }
  if (filters.franchise)            { conditions.push(`franchise ILIKE $${p++}`);       params.push(`%${filters.franchise}%`); }
  if (filters.isOverdue !== undefined)           { conditions.push(`is_overdue = $${p++}`);             params.push(filters.isOverdue); }
  if (filters.awaitingOurResponse !== undefined) { conditions.push(`awaiting_our_response = $${p++}`); params.push(filters.awaitingOurResponse); }
  if (filters.noResponseStatus) {
    conditions.push(`awaiting_our_response = false`);
    conditions.push(`status NOT IN ('aguardando_franquia')`);
  }
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

// -------------------------------------------------------
// CLUSTERS POR SETOR
// -------------------------------------------------------

/** Clusters com tickets de pelo menos um dos departamentos do setor */
export async function getSectorClusters(departments: string[], limit = 15) {
  return query<{ id: string; label: string; keywords: string[]; ticket_count: number; is_spike: boolean }>(
    `SELECT sc.id, sc.label, sc.keywords, COUNT(st.id)::int AS ticket_count, sc.is_spike
     FROM saf_clusters sc
     JOIN saf_tickets st ON st.cluster_id = sc.id
     WHERE st.department = ANY($1::text[])
       AND st.status NOT IN ('resolvido','cancelado')
     GROUP BY sc.id, sc.label, sc.keywords, sc.is_spike
     HAVING COUNT(st.id) > 0
     ORDER BY COUNT(st.id) DESC
     LIMIT $2`,
    [departments, limit]
  );
}

// -------------------------------------------------------
// STATS GLOBAIS (todas as landing page)
// -------------------------------------------------------

/** Contagem por setor para a landing page — um SELECT por setor */
export async function getLandingStats(sectorsMap: Record<string, string[]>) {
  const results: Record<string, { total: number; overdue: number; awaiting: number }> = {};

  await Promise.all(
    Object.entries(sectorsMap).map(async ([slug, departments]) => {
      const row = await queryOne<{ total: string; overdue: string; awaiting: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status NOT IN ('resolvido','cancelado')
             AND opened_at >= NOW() - INTERVAL '3 months') AS total,
           COUNT(*) FILTER (WHERE is_overdue
             AND status NOT IN ('resolvido','cancelado')
             AND opened_at >= NOW() - INTERVAL '3 months') AS overdue,
           COUNT(*) FILTER (WHERE awaiting_our_response
             AND status NOT IN ('resolvido','cancelado')
             AND opened_at >= NOW() - INTERVAL '3 months') AS awaiting
         FROM saf_tickets
         WHERE department = ANY($1::text[])`,
        [departments]
      );
      results[slug] = {
        total:   Number(row?.total   ?? 0),
        overdue: Number(row?.overdue ?? 0),
        awaiting: Number(row?.awaiting ?? 0),
      };
    })
  );

  return results;
}

// -------------------------------------------------------
// CONTATOS TELEGRAM POR SETOR
// -------------------------------------------------------

export async function getSectorContacts(sectorSlug: string): Promise<SectorContact[]> {
  const rows = await query<{
    id: string; sector_slug: string; name: string;
    telegram_chat_id: string; active: boolean; created_at: Date;
  }>(
    `SELECT * FROM sector_contacts
     WHERE sector_slug = $1 AND active = true
     ORDER BY created_at ASC`,
    [sectorSlug]
  );

  return rows.map((r) => ({
    id:             r.id,
    sectorSlug:     r.sector_slug,
    name:           r.name,
    telegramChatId: r.telegram_chat_id,
    active:         r.active,
    createdAt:      r.created_at,
  }));
}

/** Retorna contacts do setor + do setor "geral" (recebe tudo) */
export async function getSectorAndGeneralContacts(sectorSlug: string): Promise<SectorContact[]> {
  const rows = await query<{
    id: string; sector_slug: string; name: string;
    telegram_chat_id: string; active: boolean; created_at: Date;
  }>(
    `SELECT * FROM sector_contacts
     WHERE (sector_slug = $1 OR sector_slug = 'geral') AND active = true
     ORDER BY sector_slug, created_at ASC`,
    [sectorSlug]
  );

  return rows.map((r) => ({
    id:             r.id,
    sectorSlug:     r.sector_slug,
    name:           r.name,
    telegramChatId: r.telegram_chat_id,
    active:         r.active,
    createdAt:      r.created_at,
  }));
}

export async function addSectorContact(
  sectorSlug: string,
  name: string,
  telegramChatId: string
): Promise<SectorContact> {
  const row = await queryOne<{
    id: string; sector_slug: string; name: string;
    telegram_chat_id: string; active: boolean; created_at: Date;
  }>(
    `INSERT INTO sector_contacts (sector_slug, name, telegram_chat_id)
     VALUES ($1, $2, $3) RETURNING *`,
    [sectorSlug, name, telegramChatId]
  );

  return {
    id:             row!.id,
    sectorSlug:     row!.sector_slug,
    name:           row!.name,
    telegramChatId: row!.telegram_chat_id,
    active:         row!.active,
    createdAt:      row!.created_at,
  };
}

export async function removeSectorContact(id: string): Promise<void> {
  await execute(
    `UPDATE sector_contacts SET active = false, updated_at = NOW() WHERE id = $1`,
    [id]
  );
}
