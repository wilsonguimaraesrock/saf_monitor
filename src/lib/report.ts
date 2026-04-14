/**
 * Lógica de report diário por setor — compartilhada entre
 * o scheduler (node-cron) e o endpoint /api/cron/report.
 */

import { SECTORS, getSectorTelegramChatIds } from './sectors';
import { getSectorStats } from '../repository/sectors';
import { getDashboardStats } from '../repository/tickets';
import { broadcastToContacts, formatDailySummary } from '../integrations/telegram';
import { queryOne } from './db';
import { createChildLogger } from './logger';

const log = createChildLogger('report');

export type ReportResult = Record<string, { sent: number; failed: number; skipped?: boolean }>;

function brHour(): { hour: number; dow: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return { hour: now.getHours(), dow: now.getDay() };
}

/**
 * Envia resumo diário para cada grupo de setor e para o grupo Geral.
 * Respeita a janela de horário seg–sex, 8h–20h BRT (a menos que `force=true`).
 */
export async function runReport(force = false): Promise<ReportResult> {
  const { hour, dow } = brHour();

  if (!force && (dow === 0 || dow === 6 || hour < 8 || hour >= 20)) {
    log.info(`Report ignorado — fora da janela (dow=${dow}, hour=${hour})`);
    return {};
  }

  const results: ReportResult = {};

  // ── Envio por setor ──────────────────────────────────────────
  await Promise.all(
    SECTORS.map(async (sector) => {
      const chatIds = getSectorTelegramChatIds(sector.slug);
      if (chatIds.length === 0) {
        results[sector.slug] = { sent: 0, failed: 0, skipped: true };
        return;
      }

      const stats = await getSectorStats(sector.departments) as Record<string, string> | null;
      if (!stats) {
        results[sector.slug] = { sent: 0, failed: 1 };
        return;
      }

      const s: Parameters<typeof formatDailySummary>[0] = {
        total:         Number(stats.total_open            ?? 0),
        overdue:       Number(stats.total_overdue         ?? 0),
        awaiting:      Number(stats.total_awaiting        ?? 0),
        resolvedToday: Number(stats.total_resolved_today  ?? 0),
        notOpened:     Number(stats.total_not_opened      ?? 0),
      };

      if (sector.slug === 'pd-i') {
        const cat = await getDashboardStats() as Record<string, string> | null;
        s.categories = {
          dsaJoy:           Number(cat?.count_dsa_joy           ?? 0),
          myrock:           Number(cat?.count_myrock            ?? 0),
          plataformasAulas: Number(cat?.count_plataformas_aulas ?? 0),
          suporteEmails:    Number(cat?.count_suporte_emails    ?? 0),
        };
      }

      const text = formatDailySummary(s, sector.name);
      const r = await broadcastToContacts(chatIds, text);
      results[sector.slug] = r;
      log.info(`Setor ${sector.name}: sent=${r.sent}, failed=${r.failed}`);
    })
  );

  // ── Resumo global para o grupo Geral ─────────────────────────
  const geralId = process.env.TELEGRAM_CHAT_ID_GERAL?.trim();
  if (geralId) {
    const globalRow = await queryOne<{ total: string; overdue: string; awaiting: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS total,
         COUNT(*) FILTER (WHERE is_overdue
           AND status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS overdue,
         COUNT(*) FILTER (WHERE awaiting_our_response
           AND status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS awaiting
       FROM saf_tickets`,
      []
    );

    const sectorLines = await Promise.all(
      SECTORS.map(async (sector) => {
        const stats = await getSectorStats(sector.departments) as Record<string, string> | null;
        const total   = Number(stats?.total_open    ?? 0);
        const overdue = Number(stats?.total_overdue ?? 0);
        const ov = overdue > 0 ? ` 🔴 ${overdue}` : '';
        return `  • <b>${sector.name}</b>: ${total}${ov}`;
      })
    );

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const geralText =
      `📊 <b>Resumo Geral SAFs — ${now}</b>\n\n` +
      `Total abertos: <b>${Number(globalRow?.total ?? 0)}</b>\n` +
      `Atrasados: <b>${Number(globalRow?.overdue ?? 0)}</b>\n` +
      `Aguardando nossa resp.: <b>${Number(globalRow?.awaiting ?? 0)}</b>\n\n` +
      `<b>Por setor:</b>\n` +
      sectorLines.join('\n') + '\n\n' +
      `🔗 ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}`;

    const r = await broadcastToContacts([geralId], geralText);
    results['geral'] = r;
    log.info(`Geral: sent=${r.sent}, failed=${r.failed}`);
  }

  return results;
}
