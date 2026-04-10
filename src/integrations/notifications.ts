/**
 * Notificações via Telegram Bot
 *
 * Setup (2 minutos):
 *  1. Abra @BotFather no Telegram → /newbot → siga as instruções → copie o TOKEN
 *  2. Abra uma conversa com o seu novo bot e mande qualquer mensagem (ex: "oi")
 *  3. Acesse no navegador:
 *       https://api.telegram.org/bot<SEU_TOKEN>/getUpdates
 *     Procure "chat" → "id" no JSON retornado → esse é o TELEGRAM_CHAT_ID
 *  4. Defina no .env.local:
 *       TELEGRAM_BOT_TOKEN=123456789:AAF...
 *       TELEGRAM_CHAT_ID=987654321
 *
 * Pronto. Sem conta, sem aprovação, sem custo.
 */

import axios from 'axios';
import crypto from 'crypto';
import { execute, queryOne } from '../lib/db';
import { AlertType, AlertSeverity } from '../lib/types';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('notifications');

// -------------------------------------------------------
// Deduplicação — não reenvia o mesmo alerta em 6 horas
// -------------------------------------------------------
function buildHash(type: AlertType, body: string): string {
  return crypto.createHash('sha256').update(`${type}::${body}`).digest('hex');
}

async function isAlreadySent(hash: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM alerts WHERE hash = $1 AND sent_at > NOW() - INTERVAL '6 hours'`,
    [hash]
  );
  return !!row;
}

async function recordAlert(
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  body: string,
  hash: string
): Promise<void> {
  await execute(
    `INSERT INTO alerts (type, severity, title, body, hash, sent_via, sent_at)
     VALUES ($1, $2, $3, $4, $5, ARRAY['telegram'], NOW())
     ON CONFLICT (hash) DO UPDATE SET sent_at = NOW()`,
    [type, severity, title, body, hash]
  );
}

// -------------------------------------------------------
// Telegram — envia mensagem formatada com MarkdownV2
// -------------------------------------------------------
function escapeMarkdown(text: string): string {
  // Escapa caracteres especiais exigidos pelo MarkdownV2 do Telegram
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
}

async function sendTelegram(text: string): Promise<boolean> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    log.warn('Telegram não configurado. Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID no .env.local');
    return false;
  }

  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        chat_id:    chatId,
        text:       text,
        parse_mode: 'HTML',   // HTML é mais fácil de usar que MarkdownV2
        disable_web_page_preview: true,
      },
      { timeout: 10_000 }
    );
    return true;
  } catch (err) {
    const msg = axios.isAxiosError(err)
      ? `${err.response?.status} — ${JSON.stringify(err.response?.data)}`
      : (err as Error).message;
    log.error(`Telegram falhou: ${msg}`);
    return false;
  }
}

// -------------------------------------------------------
// Dispatcher principal (com deduplicação)
// -------------------------------------------------------
export async function sendAlert(
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  body: string,
  force = false
): Promise<boolean> {
  const hash = buildHash(type, body);

  if (!force && (await isAlreadySent(hash))) {
    log.info(`Alerta duplicado suprimido [${type}] (hash=${hash.slice(0, 8)}...)`);
    return false;
  }

  // Formata com HTML do Telegram
  const severityPrefix = severity === 'critical' ? '🚨' : severity === 'warning' ? '⚠️' : 'ℹ️';
  const message = `${severityPrefix} <b>${htmlEscape(title)}</b>\n\n${htmlEscape(body)}`;

  const ok = await sendTelegram(message);

  if (ok) {
    await recordAlert(type, severity, title, body, hash);
    log.info(`Alerta [${type}/${severity}] enviado via Telegram`);
  }

  return ok;
}

function htmlEscape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// -------------------------------------------------------
// Templates de mensagem
// -------------------------------------------------------
export interface AlertPayload {
  totalOpen: number;
  totalOverdue: number;
  totalAwaiting: number;
  totalCritical: number;
  top5Oldest: Array<{ title: string; daysOpen: number }>;
  byCategory: {
    dsaJoy: number;
    myrock: number;
    plataformasAulas: number;
    suporteEmails: number;
  };
  stalledCount: number;
}

export function buildDailySummaryMessage(p: AlertPayload): string {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const lines = [
    `📊 Resumo SAFs — ${now}`,
    '',
    `📋 Total abertos: ${p.totalOpen}`,
    p.totalOverdue  > 0 ? `🔴 Atrasados: ${p.totalOverdue}`                : `✅ Sem tickets atrasados`,
    p.totalAwaiting > 0 ? `⏳ Aguardando nossa resposta: ${p.totalAwaiting}` : `✅ Nada aguardando resposta`,
    p.totalCritical > 0 ? `🚨 Críticos (score ≥ 70): ${p.totalCritical}`   : '',
    '',
    `📂 Por categoria:`,
    p.byCategory.dsaJoy           > 0 ? `  • DSA JOY: ${p.byCategory.dsaJoy}`                     : '',
    p.byCategory.myrock           > 0 ? `  • MyRock: ${p.byCategory.myrock}`                       : '',
    p.byCategory.plataformasAulas > 0 ? `  • Plataformas de Aulas: ${p.byCategory.plataformasAulas}` : '',
    p.byCategory.suporteEmails    > 0 ? `  • Suporte Emails: ${p.byCategory.suporteEmails}`         : '',
  ].filter(Boolean);

  if (p.stalledCount > 0) {
    lines.push('');
    lines.push(`⚠️ ${p.stalledCount} ticket(s) sem movimentação há mais de 7 dias`);
  }

  if (p.top5Oldest.length > 0) {
    lines.push('');
    lines.push(`🕰️ Tickets mais antigos abertos:`);
    p.top5Oldest.slice(0, 5).forEach((t, i) => {
      lines.push(`  ${i + 1}. ${t.title.slice(0, 55)} (${t.daysOpen}d)`);
    });
  }

  lines.push('');
  lines.push(`🔗 ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}`);

  return lines.join('\n');
}

export function buildCriticalAlertMessage(category: string, count: number, detail: string): string {
  return [
    `ALERTA CRÍTICO — ${category}`,
    '',
    detail,
    `Total críticos: ${count}`,
    '',
    `🔗 ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}`,
  ].join('\n');
}
