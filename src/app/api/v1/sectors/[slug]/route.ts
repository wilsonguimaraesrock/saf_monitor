/**
 * GET /api/v1/sectors/:slug
 * Returns SAF stats + SLA + WhatsApp for a single sector.
 * Query params: ?month=YYYY-MM
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/apiAuth';
import { buildSectorsPayload } from '@/lib/webhooks';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:v1:sectors:slug');

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authErr = validateApiKey(req);
  if (authErr) return NextResponse.json({ error: authErr.error }, { status: authErr.status });

  const { slug } = await params;
  const month = req.nextUrl.searchParams.get('month') ?? undefined;

  try {
    const { sectors, month: resolvedMonth, timestamp } = await buildSectorsPayload(month);
    const sector = sectors.find((s) => s.slug === slug);

    if (!sector) {
      return NextResponse.json(
        { error: `Setor '${slug}' não encontrado. Slugs disponíveis: ${sectors.map((s) => s.slug).join(', ')}` },
        { status: 404 }
      );
    }

    return NextResponse.json({ month: resolvedMonth, timestamp, sector });
  } catch (err) {
    log.error(`GET /api/v1/sectors/${slug} failed: ${(err as Error).message}`);
    return NextResponse.json({ error: 'Erro interno ao buscar dados' }, { status: 500 });
  }
}
