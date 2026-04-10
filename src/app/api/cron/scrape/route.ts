/**
 * GET /api/cron/scrape
 * Chamado pela Vercel a cada 10 minutos.
 * Apenas coleta + persiste dados. Não envia Telegram.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/scraper/runner';

export const maxDuration = 300; // 5 min timeout

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runScraper('cron:scrape');
  return NextResponse.json(result);
}
