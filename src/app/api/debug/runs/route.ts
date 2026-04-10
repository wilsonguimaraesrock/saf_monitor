import { NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export async function GET() {
  try {
    const runs = await query(
      `SELECT id, run_type, status, triggered_by,
              tickets_found, tickets_new, tickets_updated,
              duration_ms, error_message,
              started_at, finished_at
       FROM cron_runs
       ORDER BY started_at DESC
       LIMIT 5`
    );

    // Contagem por status (sem filtro)
    const byStatus = await query(
      `SELECT status, COUNT(*) AS total
       FROM saf_tickets
       GROUP BY status ORDER BY total DESC`
    );

    // Contagem por categoria (apenas ativos)
    const byCategory = await query(
      `SELECT priority_category, COUNT(*) AS total
       FROM saf_tickets
       WHERE status NOT IN ('resolvido','cancelado')
       GROUP BY priority_category ORDER BY total DESC`
    );

    // Stats do dashboard (mesma query que o painel usa)
    const stats = await queryOne(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months'
           AND priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')) AS total_open,
         COUNT(*) FILTER (WHERE resolved_at::date = CURRENT_DATE
           AND priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')) AS resolved_today,
         COUNT(*) FILTER (WHERE resolved_at::date = CURRENT_DATE) AS resolved_today_all,
         NOW() AT TIME ZONE 'America/Sao_Paulo' AS now_brt
       FROM saf_tickets`
    );

    return NextResponse.json({ runs, byStatus, byCategory, stats });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
