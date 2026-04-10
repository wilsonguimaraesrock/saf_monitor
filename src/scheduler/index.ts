/**
 * Scheduler — gerencia execuções automáticas via node-cron
 *
 * Horários padrão (configuráveis via variáveis de ambiente):
 *   - Manhã:   08:00 (segunda–sexta)
 *   - Meio-dia: 13:00 (segunda–sexta)
 *   - Tarde:   17:00 (segunda–sexta)
 *
 * Também expõe runNow() para execução on-demand.
 */

import '../lib/env'; // carrega .env.local quando rodado via ts-node
import cron from 'node-cron';
import { runScraper } from '../scraper/runner';
import { sendAlert, buildDailySummaryMessage, buildCriticalAlertMessage } from '../integrations/notifications';
import {
  getDashboardStats,
  getOldestTickets,
  getCriticalTickets,
  getOverdueTickets,
} from '../repository/tickets';
import { query } from '../lib/db';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('scheduler');

// -------------------------------------------------------
// Execução principal (scraping + análise + alertas)
// -------------------------------------------------------
export async function runNow(triggeredBy = 'scheduler'): Promise<void> {
  log.info(`[runNow] Iniciando — triggeredBy=${triggeredBy}`);

  // 1. Scraping
  const result = await runScraper(triggeredBy);

  if (!result.success) {
    await sendAlert(
      'critical', 'critical',
      '⚠️ Falha na execução do agente SAF',
      `O agente de coleta falhou às ${new Date().toLocaleString('pt-BR')}.\n\nErro: ${result.error}`,
      true
    );
    return;
  }

  // 2. Monta payload para alerta
  const stats     = await getDashboardStats() as Record<string, string> | null;
  const oldest    = await getOldestTickets(5)  as Array<Record<string, unknown>>;
  const critical  = await getCriticalTickets(10) as Array<Record<string, unknown>>;
  const overdue   = await getOverdueTickets(50)  as Array<Record<string, unknown>>;

  // Tickets sem movimentação há > 7 dias
  const stalled = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM saf_tickets
     WHERE last_updated_at < NOW() - INTERVAL '7 days'
     AND status NOT IN ('resolvido','cancelado')`
  );

  if (!stats) return;

  const payload = {
    totalOpen:     Number(stats.total_open ?? 0),
    totalOverdue:  Number(stats.total_overdue ?? 0),
    totalAwaiting: Number(stats.total_awaiting ?? 0),
    totalCritical: Number(stats.total_critical ?? 0),
    stalledCount:  Number(stalled[0]?.count ?? 0),
    top5Oldest: oldest.map((t) => ({
      title:    String(t.title ?? ''),
      daysOpen: Number(t.days_open ?? 0),
    })),
    byCategory: {
      dsaJoy:           Number(stats.count_dsa_joy ?? 0),
      myrock:           Number(stats.count_myrock ?? 0),
      plataformasAulas: Number(stats.count_plataformas_aulas ?? 0),
      suporteEmails:    Number(stats.count_suporte_emails ?? 0),
    },
  };

  // 3. Resumo diário
  const summaryMsg = buildDailySummaryMessage(payload);
  await sendAlert('daily_summary', 'info', 'Resumo Diário SAFs', summaryMsg);

  // 4. Alertas críticos por categoria
  const criticalByCategory: Record<string, number> = {};
  for (const t of critical) {
    const cat = String(t.priority_category ?? 'outros');
    criticalByCategory[cat] = (criticalByCategory[cat] ?? 0) + 1;
  }

  const LABEL: Record<string, string> = {
    dsa_joy:            'DSA JOY',
    myrock:             'MyRock',
    plataformas_aulas:  'Plataformas de Aulas',
    suporte_emails:     'Suporte Emails',
  };

  for (const [cat, count] of Object.entries(criticalByCategory)) {
    if (count > 0 && LABEL[cat]) {
      const overdueInCat = overdue.filter((t) => t.priority_category === cat).length;
      const detail = [
        `${count} ticket(s) crítico(s)`,
        overdueInCat > 0 ? `${overdueInCat} atrasado(s)` : '',
      ].filter(Boolean).join(' · ');

      await sendAlert(
        'critical', 'critical',
        `Alerta — ${LABEL[cat]}`,
        buildCriticalAlertMessage(LABEL[cat], count, detail)
      );
    }
  }

  log.info('[runNow] Concluído');
}

// -------------------------------------------------------
// Configuração dos cron jobs
// -------------------------------------------------------
export function startScheduler(): void {
  const MORNING   = process.env.CRON_MORNING   ?? '0 8 * * 1-5';
  const MIDDAY    = process.env.CRON_MIDDAY    ?? '0 13 * * 1-5';
  const AFTERNOON = process.env.CRON_AFTERNOON ?? '0 17 * * 1-5';

  for (const [name, expr] of [
    ['manhã', MORNING],
    ['meio-dia', MIDDAY],
    ['tarde', AFTERNOON],
  ]) {
    if (!cron.validate(expr)) {
      log.error(`Expressão cron inválida para ${name}: "${expr}"`);
      continue;
    }

    cron.schedule(expr, async () => {
      log.info(`[cron:${name}] Disparando execução...`);
      await runNow(`cron:${name}`).catch((err) => {
        log.error(`[cron:${name}] Erro: ${(err as Error).message}`);
      });
    }, { timezone: 'America/Sao_Paulo' });

    log.info(`Cron registrado [${name}]: ${expr}`);
  }

  log.info('Scheduler iniciado. Aguardando próxima execução...');
}

// Inicializa quando executado diretamente
if (require.main === module) {
  startScheduler();
}
