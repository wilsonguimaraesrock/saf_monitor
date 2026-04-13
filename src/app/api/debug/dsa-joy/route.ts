import { NextResponse } from 'next/server';
import { query } from '@/lib/db';

/**
 * Diagnóstico: por que o dashboard mostra menos DSA JOY do que o relatório do dfranquias?
 *
 * Possíveis causas:
 *  1. Janela de 3 meses (WINDOW) excluindo tickets mais antigos
 *  2. Tickets classificados como 'outros'/'nao_classificado' pelo classificador
 *  3. Tickets marcados como 'resolvido' no banco mas ainda ativos no dfranquias
 */
export async function GET() {
  try {
    const [summary, oldTickets, misclassified, resolvedButMaybe] = await Promise.all([
      // 1. Resumo: quantos DSA JOY existem por status/categoria (SEM filtro de janela)
      query(`
        SELECT
          priority_category,
          status,
          COUNT(*) AS total,
          MIN(opened_at) AS mais_antigo,
          MAX(opened_at) AS mais_recente
        FROM saf_tickets
        WHERE priority_category = 'dsa_joy'
        GROUP BY priority_category, status
        ORDER BY status
      `),

      // 2. Tickets DSA JOY fora da janela de 3 meses (excluídos pelo WINDOW)
      query(`
        SELECT external_id, number, title, service, status, opened_at, priority_category
        FROM saf_tickets
        WHERE priority_category = 'dsa_joy'
          AND status NOT IN ('resolvido','cancelado')
          AND opened_at < NOW() - INTERVAL '3 months'
        ORDER BY opened_at ASC
      `),

      // 3. Tickets com service contendo 'dsa' ou 'joy' mas classificados como outros/nao_classificado
      query(`
        SELECT external_id, number, title, service, status, opened_at, priority_category
        FROM saf_tickets
        WHERE (
          LOWER(service) LIKE '%dsa%' OR
          LOWER(service) LIKE '%joy%' OR
          LOWER(title)   LIKE '%dsa%' OR
          LOWER(title)   LIKE '%joy%'
        )
        AND priority_category NOT IN ('dsa_joy')
        AND status NOT IN ('resolvido','cancelado')
        ORDER BY opened_at DESC
        LIMIT 30
      `),

      // 4. Tickets DSA JOY marcados como 'resolvido' nos últimos 30 dias (possível falso positivo)
      query(`
        SELECT external_id, number, title, service, status, opened_at, resolved_at
        FROM saf_tickets
        WHERE priority_category = 'dsa_joy'
          AND status = 'resolvido'
          AND resolved_at >= NOW() - INTERVAL '30 days'
        ORDER BY resolved_at DESC
        LIMIT 20
      `),
    ]);

    // 5. Todos os serviços únicos de tickets ativos para ajudar a mapear palavras-chave novas
    const allServices = await query(`
      SELECT DISTINCT service, priority_category, COUNT(*) AS total
      FROM saf_tickets
      WHERE status NOT IN ('resolvido','cancelado')
        AND service IS NOT NULL
      GROUP BY service, priority_category
      ORDER BY priority_category, service
    `);

    return NextResponse.json({
      resumo: summary,
      fora_da_janela_3_meses: oldTickets,
      possivel_classificacao_errada: misclassified,
      resolvidos_recentemente: resolvedButMaybe,
      todos_servicos_ativos: allServices,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
