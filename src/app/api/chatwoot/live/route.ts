import { NextRequest, NextResponse } from 'next/server';
import { getChatwootPanelData, getOpenConversations } from '@/integrations/chatwoot';
import { getSectorBySlug } from '@/lib/sectors';
import { memoize } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/** Metade do intervalo de polling do cliente (30s) — mantém o dado fresco
 *  e ainda absorve os dois componentes que pedem o mesmo setor. */
const LIVE_TTL_MS = 15_000;

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
    // Os dois componentes da página do setor pedem este mesmo endpoint a cada
    // 30s. O TTL curto faz as duas chamadas compartilharem uma ida ao Chatwoot.
    const { panelData, openConversations, refreshedAt } = await memoize(
      `live:${slug}`,
      LIVE_TTL_MS,
      async () => {
        const [panel, convs] = await Promise.all([
          getChatwootPanelData(sector.chatwoot!.teamId, sector.chatwoot!.inboxId, sector.chatwoot!.inboxName, { cache: 'no-store' }),
          getOpenConversations(sector.chatwoot!.teamId, 200, { cache: 'no-store' }),
        ]);
        return { panelData: panel, openConversations: convs, refreshedAt: new Date().toISOString() };
      }
    );

    return NextResponse.json(
      {
        panelData,
        openConversations,
        refreshedAt,
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
