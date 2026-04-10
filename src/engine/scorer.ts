/**
 * Score de prioridade — 0 a 100
 *
 * Fatores e pesos padrão (ajustáveis nas settings do banco):
 *
 *  | Fator                        | Peso máx | Descrição                              |
 *  |------------------------------|----------|----------------------------------------|
 *  | Atrasado (overdue)           |   40 pts | +40 se vencido, proporcional ao atraso |
 *  | Dias aguardando nossa resp.  |   20 pts | +2 por dia, máximo 20                  |
 *  | Idade do ticket              |   15 pts | +0.5 por dia, máximo 15                |
 *  | Sem movimentação recente     |   15 pts | +3 por dia parado, máximo 15           |
 *  | Bônus de categoria prioritária|  10 pts | +10 para categorias DSA JOY / MyRock  |
 *
 *  Total máximo: 100
 */

import { differenceInCalendarDays } from 'date-fns';
import { SafTicket, PriorityScoreResult, PriorityCategory } from '../lib/types';

// Categorias que recebem bônus de prioridade
const HIGH_PRIORITY_CATEGORIES: PriorityCategory[] = ['dsa_joy', 'myrock'];

export function calculatePriorityScore(ticket: SafTicket): PriorityScoreResult {
  const now = new Date();
  let score = 0;

  // ---- Fator 1: Ticket atrasado (até 40 pts) ----
  let overduePts = 0;
  if (ticket.isOverdue) {
    // Base de 20 pts + 2 pt por dia de atraso, max 40
    overduePts = Math.min(40, 20 + ticket.daysOverdue * 2);
  }
  score += overduePts;

  // ---- Fator 2: Aguardando nossa resposta (até 20 pts) ----
  let waitingPts = 0;
  if (ticket.awaitingOurResponse) {
    waitingPts = Math.min(20, ticket.daysWaitingUs * 2);
  }
  score += waitingPts;

  // ---- Fator 3: Idade do ticket (até 15 pts) ----
  const daysCap = 30;
  const daysOpenCapped = Math.min(ticket.daysOpen, daysCap);
  const agePts = Math.round((daysOpenCapped / daysCap) * 15);
  score += agePts;

  // ---- Fator 4: Sem movimentação recente (até 15 pts) ----
  let stalenessPts = 0;
  if (ticket.lastUpdatedAt) {
    const daysSinceUpdate = differenceInCalendarDays(now, ticket.lastUpdatedAt);
    stalenessPts = Math.min(15, daysSinceUpdate * 3);
  }
  score += stalenessPts;

  // ---- Fator 5: Bônus de categoria (até 10 pts) ----
  const categoryBonus = HIGH_PRIORITY_CATEGORIES.includes(ticket.priorityCategory) ? 10 : 0;
  score += categoryBonus;

  // Garante 0–100
  score = Math.max(0, Math.min(100, score));

  return {
    score,
    breakdown: {
      overdue:        overduePts,
      daysOpen:       agePts,
      daysWaiting:    waitingPts,
      categoryBonus,
      staleness:      stalenessPts,
    },
    isCritical: score >= 70,
  };
}
