/**
 * Scheduler — gerencia execuções automáticas via node-cron
 *
 * Horários padrão (configuráveis via variáveis de ambiente):
 *   - Manhã:   08:00 (segunda–sexta)
 *   - Meio-dia: 13:00 (segunda–sexta)
 *   - Tarde:   17:00 (segunda–sexta)
 *   - Noite:   19:00 (segunda–sexta)
 *
 * Também expõe runNow() para execução on-demand.
 */

import '../lib/env'; // carrega .env.local quando rodado via ts-node
import cron from 'node-cron';
import { runScraper } from '../scraper/runner';
import { sendAlert, buildCriticalAlertMessage } from '../integrations/notifications';
import { getCriticalTickets, getOverdueTickets } from '../repository/tickets';
import { runReport } from '../lib/report';
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

  // 2. Resumo diário por setor → grupos Telegram de cada equipe
  await runReport(true);

  // 3. Alertas críticos por categoria → chat pessoal do admin
  const critical = await getCriticalTickets(10) as Array<Record<string, unknown>>;
  const overdue  = await getOverdueTickets(50)  as Array<Record<string, unknown>>;

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
  const EVENING   = process.env.CRON_EVENING   ?? '0 19 * * 1-5';

  for (const [name, expr] of [
    ['manhã', MORNING],
    ['meio-dia', MIDDAY],
    ['tarde', AFTERNOON],
    ['noite', EVENING],
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
