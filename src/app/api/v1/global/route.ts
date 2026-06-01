/**
 * GET /api/v1/global
 * Returns consolidated totals across all sectors.
 * Query params: ?month=YYYY-MM
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { buildSectorsPayload } from '@/lib/webhooks';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:v1:global');

export async function GET(req: NextRequest) {
  const authErr = validateApiKey(req);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const month = req.nextUrl.searchParams.get('month') ?? undefined;

  try {
    const { sectors, month: resolvedMonth, timestamp } = await buildSectorsPayload(month);

    const global = sectors.reduce(
      (acc, s) => ({
        open:             acc.open             + s.safs.open,
        monthTotal:       acc.monthTotal       + s.safs.monthTotal,
        overdue:          acc.overdue          + s.safs.overdue,
        awaiting:         acc.awaiting         + s.safs.awaiting,
        awaitingSchool:   acc.awaitingSchool   + s.safs.awaitingSchool,
        notOpened:        acc.notOpened        + s.safs.notOpened,
        noResponseStatus: acc.noResponseStatus + s.safs.noResponseStatus,
        resolvedToday:    acc.resolvedToday    + s.safs.resolvedToday,
        waMonthlyTotal:   acc.waMonthlyTotal   + (s.whatsapp?.monthlyTotal as number ?? 0),
        waOpen:           acc.waOpen           + (s.whatsapp?.open        as number ?? 0),
        waPending:        acc.waPending        + (s.whatsapp?.pending     as number ?? 0),
      }),
      { open: 0, monthTotal: 0, overdue: 0, awaiting: 0, awaitingSchool: 0,
        notOpened: 0, noResponseStatus: 0, resolvedToday: 0,
        waMonthlyTotal: 0, waOpen: 0, waPending: 0 }
    );

    return NextResponse.json({ month: resolvedMonth, timestamp, global, sectors });
  } catch (err) {
    log.error(`GET /api/v1/global failed: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Erro interno ao buscar dados' }, { status: 500 });
  }
}
