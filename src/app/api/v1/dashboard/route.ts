/**
 * GET /api/v1/dashboard
 *
 * Indicadores do dashboard em JSON, para exibição num painel externo.
 * Os números são os mesmos da página /dashboard (fonte única em
 * src/lib/dashboardData.ts).
 *
 * Autenticação: SAF_DASHBOARD_TOKEN via header X-Dashboard-Token ou ?token=
 * Parâmetros:   ?mes=YYYY-MM (ou ?month=) — padrão: mês corrente
 */
import { NextRequest, NextResponse } from 'next/server';
import { validateDashboardToken, CORS_HEADERS } from '@/lib/dashboardAuth';
import { getDashboardData, toPublicPayload } from '@/lib/dashboardData';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:v1:dashboard');

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const auth = validateDashboardToken(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: CORS_HEADERS });
  }

  const mes = req.nextUrl.searchParams.get('mes') ?? req.nextUrl.searchParams.get('month');

  try {
    // O cache vive em getDashboardData (3 min), compartilhado com a página
    // /dashboard e com /publico/dashboard — não é duplicado aqui.
    const payload = toPublicPayload(await getDashboardData(mes));

    return NextResponse.json(payload, {
      headers: {
        ...CORS_HEADERS,
        // Permite que CDN/painel reaproveitem por 1 min e sirvam o valor antigo
        // por mais 5 min se a origem estiver indisponível.
        'Cache-Control': 'public, max-age=180, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    log.error(`GET /api/v1/dashboard falhou: ${(err as Error).message}`);
    return NextResponse.json(
      { error: 'Erro interno ao montar os indicadores' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
