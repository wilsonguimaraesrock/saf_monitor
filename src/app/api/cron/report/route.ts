/**
 * GET /api/cron/report
 * Chamado pela Vercel (seg–sex, 8h/13h/17h/19h BRT).
 * Envia resumo por setor para o grupo Telegram de cada setor,
 * e um resumo consolidado para o grupo Geral.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runReport } from '@/lib/report';
import { createChildLogger } from '@/lib/logger';

export const maxDuration = 60;

const log = createChildLogger('cron:report');

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hour = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  ).getHours();

  const results = await runReport();

  log.info(`Report completo: ${JSON.stringify(results)}`);
  return NextResponse.json({ ok: true, hour, results });
}
