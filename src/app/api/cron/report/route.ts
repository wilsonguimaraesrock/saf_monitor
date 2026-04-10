/**
 * GET /api/cron/report
 * Chamado pela Vercel de hora em hora (seg–sex, 8h–20h BRT).
 * Envia resumo de indicadores para o Telegram.
 * Horário verificado dentro da função para garantir janela correta.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getDashboardStats,
  getOldestTickets,
} from '@/repository/tickets';
import { sendAlert, buildDailySummaryMessage } from '@/integrations/notifications';
import { query } from '@/lib/db';
import { createChildLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createChildLogger('cron:report');

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

/** Retorna hora atual em BRT (UTC-3). */
function brHour(): { hour: number; dow: number } {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return { hour: now.getHours(), dow: now.getDay() }; // 0=Dom, 6=Sáb
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

  const [stats, oldest, stalled] = await Promise.all([
    getDashboardStats() as Promise<Record<string, string> | null>,
    getOldestTickets(5) as Promise<Array<Record<string, unknown>>>,
    query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM saf_tickets
       WHERE last_updated_at < NOW() - INTERVAL '7 days'
       AND status NOT IN ('resolvido','cancelado')`
    ),
  ]);

  if (!stats) {
    return NextResponse.json({ error: 'Sem dados de estatísticas' }, { status: 500 });
  }

  const payload = {
    totalOpen:     Number(stats.total_open     ?? 0),
    totalOverdue:  Number(stats.total_overdue  ?? 0),
    totalAwaiting: Number(stats.total_awaiting ?? 0),
    totalCritical: Number(stats.total_critical ?? 0),
    stalledCount:  Number(stalled[0]?.count    ?? 0),
    top5Oldest: oldest.map((t) => ({
      title:    String(t.title    ?? ''),
      daysOpen: Number(t.days_open ?? 0),
    })),
    byCategory: {
      dsaJoy:           Number(stats.count_dsa_joy           ?? 0),
      myrock:           Number(stats.count_myrock            ?? 0),
      plataformasAulas: Number(stats.count_plataformas_aulas ?? 0),
      suporteEmails:    Number(stats.count_suporte_emails    ?? 0),
    },
  };

  const msg = buildDailySummaryMessage(payload);
  const sent = await sendAlert('daily_summary', 'info', 'Resumo Horário SAFs', msg, true);

  log.info(`Report enviado=${sent}, hora BRT=${hour}h`);
  return NextResponse.json({ sent, hour });
}
