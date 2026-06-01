/**
 * GET /api/cron/scrape
 * Chamado pela Vercel a cada 10 minutos.
 * Apenas coleta + persiste dados. Não envia Telegram.
 * Após o scraper concluir, dispara webhooks externos (WEBHOOK_URL_1, …) se configurados.
 */
import { NextRequest, NextResponse } from 'next/server';
import { runScraper } from '@/scraper/runner';
import { dispatchWebhooks, buildSectorsPayload } from '@/lib/webhooks';

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

  // Dispatch webhooks in background — don't block the cron response
  if (process.env.WEBHOOK_URL_1) {
    buildSectorsPayload().then((data) =>
      dispatchWebhooks({ event: 'scraper_complete', timestamp: new Date().toISOString(), data })
    ).catch(() => {/* errors already logged inside dispatchWebhooks */});
  }

  return NextResponse.json(result);
}
