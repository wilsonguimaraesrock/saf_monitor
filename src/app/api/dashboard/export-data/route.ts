import { NextRequest, NextResponse } from 'next/server';
import {
  getDashboardData,
  getDashboardDataForDateRange,
  formatMonth,
} from '@/lib/dashboardData';
import { createChildLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createChildLogger('api:dashboard:export-data');

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const month = searchParams.get('month');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  try {
    if (startDate && endDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        return NextResponse.json(
          { error: 'Datas devem estar no formato YYYY-MM-DD' },
          { status: 400 }
        );
      }
      const data = await getDashboardDataForDateRange(startDate, endDate);
      return NextResponse.json(data);
    }

    // Padrão ou mês especificado
    const monthData = await getDashboardData(month);
    return NextResponse.json({
      month: monthData.month,
      label: formatMonth(monthData.month),
      timestamp: monthData.timestamp,
      statsBySector: monthData.statsBySector,
      waBySector: monthData.waBySector,
      totals: monthData.totals,
      resolutionRate: monthData.resolutionRate,
      globalSla: monthData.globalSla,
      globalSafTma: monthData.globalSafTma,
      globalCsat: monthData.globalCsat,
      csatCount: monthData.csatCount,
      globalTma: monthData.globalTma,
      tmaCount: monthData.tmaCount,
      waConversations: monthData.waConversations,
    });
  } catch (err) {
    log.error(`Erro ao obter dados para exportação: ${(err as Error).message}`);
    return NextResponse.json(
      { error: 'Erro ao carregar dados do período solicitado' },
      { status: 500 }
    );
  }
}
