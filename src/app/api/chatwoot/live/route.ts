import { NextRequest, NextResponse } from 'next/server';
import { getChatwootPanelData, getOpenConversations } from '@/integrations/chatwoot';
import { getSectorBySlug } from '@/lib/sectors';
import { memoize } from '@/lib/memoCache';
import { parseMonthParam } from '@/lib/month';

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

  // O mês selecionado na página precisa chegar aqui: sem ele o painel de um mês
  // passado mostrava os números de agora (e o CSAT do mês corrente).
  const monthParam = req.nextUrl.searchParams.get('month')?.trim() || undefined;
  const { start, end, ym, isCurrentMonth } = parseMonthParam(monthParam);
  const period = {
    since: Math.floor(start.getTime() / 1000),
    until: Math.floor(end.getTime() / 1000),
  };

  try {
    // Os dois componentes da página do setor pedem este mesmo endpoint a cada
    // 30s. O TTL curto faz as duas chamadas compartilharem uma ida ao Chatwoot.
    const { panelData, openConversations, refreshedAt } = await memoize(
      `live:${slug}:${ym}`,
      LIVE_TTL_MS,
      async () => {
        const [panel, convs] = await Promise.all([
          getChatwootPanelData(
            sector.chatwoot!.teamId, sector.chatwoot!.inboxId, sector.chatwoot!.inboxName,
            { cache: 'no-store' }, period
          ),
          // Conversas abertas são estado de agora — num mês encerrado a lista
          // certa é o backlog do período, não o que está aberto hoje.
          isCurrentMonth
            ? getOpenConversations(sector.chatwoot!.teamId, 200, { cache: 'no-store' })
            : Promise.resolve([]),
        ]);
        return { panelData: panel, openConversations: convs, refreshedAt: new Date().toISOString() };
      }
    );

    return NextResponse.json(
      {
        panelData,
        openConversations,
        refreshedAt,
        month: ym,
        isCurrentMonth,
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
