/**
 * Runner do scraper — orquestra coleta + persistência
 *
 * Fluxo:
 *  1. Cria registro de execução (cron_runs)
 *  2. Coleta tickets via XLSX ou scraping
 *  3. Normaliza e classifica cada ticket
 *  4. Persiste novos e atualiza existentes (upsert)
 *  5. Gera snapshot diário
 *  6. Calcula estatísticas do dia
 *  7. Finaliza registro de execução
 */

import '../lib/env'; // carrega .env.local quando rodado via ts-node
import { collectAllTickets, enrichTicketsInBatch } from './collector';
import { normalizeTicket } from '../engine/normalizer';
import { classifyCategory } from '../engine/classifier';
import { calculatePriorityScore } from '../engine/scorer';
import { clusterTickets } from '../engine/clustering';
import { upsertTicket, saveSnapshot, saveDailyStats, saveTicketUpdates, createCronRun, finishCronRun, markDisappearedTicketsResolved, getTicketsNeedingEnrichment } from '../repository/tickets';
import { SECTORS } from '../lib/sectors';
import { createChildLogger } from '../lib/logger';
import { RawTicket } from '../lib/types';

const log = createChildLogger('runner');

export async function runScraper(triggeredBy = 'scheduled'): Promise<{
  success: boolean;
  ticketsFound: number;
  ticketsNew: number;
  ticketsUpdated: number;
  error?: string;
}> {
  const runId = await createCronRun(triggeredBy);
  log.info(`=== Iniciando execução [${runId}] triggeredBy=${triggeredBy} ===`);

  let ticketsNew = 0;
  let ticketsUpdated = 0;

  try {
    // 1. Coleta
    const result = await collectAllTickets();
    log.info(`Coleta: ${result.totalFound} tickets em ${result.durationMs}ms`);

    if (result.errors.length > 0) {
      log.warn(`Erros durante coleta: ${result.errors.join('; ')}`);
    }

    // 2. Processa cada ticket
    const processedTickets: { externalId: string; score: number; isNew: boolean }[] = [];

    for (const raw of result.tickets) {
      try {
        const ticket = normalizeTicket(raw);
        ticket.priorityCategory = classifyCategory(raw);
        const scoreResult = calculatePriorityScore(ticket);
        ticket.priorityScore = scoreResult.score;

        const { isNew } = await upsertTicket(ticket);
        if (isNew) ticketsNew++; else ticketsUpdated++;

        await saveSnapshot(ticket);
        processedTickets.push({ externalId: ticket.externalId, score: ticket.priorityScore, isNew });
      } catch (err) {
        log.warn(`Erro ao processar ticket ${raw.externalId}: ${(err as Error).message}`);
      }
    }

    // 3. Marca como resolvidos os tickets que sumiram da listagem
    const seenIds = result.tickets.map((t) => t.externalId).filter(Boolean);
    const vanished = await markDisappearedTicketsResolved(seenIds);
    if (vanished > 0) {
      log.info(`${vanished} ticket(s) marcados como resolvidos (sumiram da listagem)`);
    }

    // 4. Enriquece tickets com histórico de mensagens
    //    Até ENRICH_PER_SECTOR tickets sem chat por setor (cobertura uniforme).
    //    Tickets novos nesta execução entram sempre, independente do cap.
    const ENRICH_PER_SECTOR = Number(process.env.ENRICH_PER_SECTOR ?? 50);

    const unenrichedIds = await getTicketsNeedingEnrichment(SECTORS, ENRICH_PER_SECTOR);
    const unenrichedSet = new Set(unenrichedIds);

    // Garante tickets novos desta execução mesmo que já estejam cobertos
    const newIds = processedTickets
      .filter((t) => t.isNew)
      .map((t) => t.externalId)
      .filter((id) => !unenrichedSet.has(id));

    const toEnrich = [...unenrichedIds, ...newIds];

    if (toEnrich.length > 0) {
      log.info(`Enriquecendo ${toEnrich.length} tickets (${unenrichedIds.length} sem chat por setor ≤${ENRICH_PER_SECTOR}, ${newIds.length} novos)...`);
      try {
        const updates = await enrichTicketsInBatch(toEnrich);
        let saved = 0;
        for (const [externalId, msgs] of updates.entries()) {
          try {
            await saveTicketUpdates(externalId, msgs);
            saved++;
          } catch (err) {
            log.warn(`saveTicketUpdates(${externalId}): ${(err as Error).message}`);
          }
        }
        log.info(`Histórico salvo para ${saved}/${updates.size} tickets`);
      } catch (err) {
        log.warn(`Enriquecimento falhou: ${(err as Error).message}`);
      }
    }

    // 5. Clustering por assunto
    await clusterTickets();

    // 6. Estatísticas do dia
    await saveDailyStats();

    await finishCronRun(runId, {
      status: 'success',
      ticketsFound: result.totalFound,
      ticketsNew,
      ticketsUpdated,
      durationMs: result.durationMs,
    });

    log.info(`=== Execução concluída: ${ticketsNew} novos, ${ticketsUpdated} atualizados ===`);
    return { success: true, ticketsFound: result.totalFound, ticketsNew, ticketsUpdated };
  } catch (err) {
    const msg = (err as Error).message;
    log.error(`Execução falhou: ${msg}`);
    await finishCronRun(runId, { status: 'error', errorMessage: msg });
    return { success: false, ticketsFound: 0, ticketsNew, ticketsUpdated, error: msg };
  }
}

// Permite rodar diretamente: npx ts-node src/scraper/runner.ts
if (require.main === module) {
  runScraper('manual').then((r) => {
    log.info('Resultado:', r);
    process.exit(r.success ? 0 : 1);
  });
}
