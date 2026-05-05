import { NextRequest, NextResponse } from 'next/server';
import { getChatwootPanelData, getOpenConversations } from '@/integrations/chatwoot';
import { getSectorBySlug } from '@/lib/sectors';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('sector')?.trim();
  if (!slug) {
    return NextResponse.json({ error: 'Parâmetro "sector" é obrigatório' }, { status: 400 });
  }

  const sector = getSectorBySlug(slug);
  if (!sector?.chatwoot) {
    return NextResponse.json({ error: `Setor sem mapeamento Chatwoot: ${slug}` }, { status: 404 });
  }

  try {
    const [panelData, openConversations] = await Promise.all([
      getChatwootPanelData(sector.chatwoot.inboxId, sector.chatwoot.inboxName, { cache: 'no-store' }),
      getOpenConversations(sector.chatwoot.inboxId, 50, { cache: 'no-store' }),
    ]);

    return NextResponse.json(
      {
        panelData,
        openConversations,
        refreshedAt: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0',
        },
      }
    );
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}
