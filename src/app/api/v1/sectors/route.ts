/**
 * GET /api/v1/sectors
 * Returns SAF stats + SLA + WhatsApp for all sectors.
 * Query params: ?month=YYYY-MM
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { buildSectorsPayload } from '@/lib/webhooks';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:v1:sectors');

export async function GET(req: NextRequest) {
  const authErr = validateApiKey(req);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const month = req.nextUrl.searchParams.get('month') ?? undefined;

  try {
    const payload = await buildSectorsPayload(month);
    return NextResponse.json(payload);
  } catch (err) {
    log.error(`GET /api/v1/sectors failed: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Erro interno ao buscar dados' }, { status: 500 });
  }
}
