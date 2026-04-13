/**
 * GET /api/cron/report
 * Chamado pela Vercel (seg–sex, 8h/13h/17h BRT).
 * Envia resumo por setor para o grupo Telegram de cada setor,
 * e um resumo consolidado para o grupo Geral.
 */
import { NextRequest, NextResponse } from 'next/server';
import { SECTORS } from '@/lib/sectors';
import { getSectorStats } from '@/repository/sectors';
import { getSectorTelegramChatIds } from '@/lib/sectors';
import { broadcastToContacts, formatDailySummary } from '@/integrations/telegram';
import { queryOne } from '@/lib/db';
import { createChildLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createChildLogger('cron:report');

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

function brHour(): { hour: number; dow: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return { hour: now.getHours(), dow: now.getDay() };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, dow } = brHour();

  // Só envia seg–sex (1–5), das 8h às 20h BRT
  if (dow === 0 || dow === 6 || hour < 8 || hour >= 20) {
    log.info(`Report ignorado — fora da janela (dow=${dow}, hour=${hour})`);
    return NextResponse.json({ skipped: true, reason: 'outside business hours', hour, dow });
  }

  const results: Record<string, { sent: number; failed: number; skipped?: boolean }> = {};

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

      const s = {
        total:         Number(stats.total_open            ?? 0),
        overdue:       Number(stats.total_overdue         ?? 0),
        awaiting:      Number(stats.total_awaiting        ?? 0),
        resolvedToday: Number(stats.total_resolved_today  ?? 0),
        notOpened:     Number(stats.total_not_opened      ?? 0),
      };

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

    // Linha por setor com os resultados já consultados
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

  log.info(`Report completo: ${JSON.stringify(results)}`);
  return NextResponse.json({ ok: true, hour, results });
}
