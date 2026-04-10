/**
 * Integração WhatsApp — suporta dois providers:
 *  1. Evolution API (auto-hospedada, padrão)
 *  2. Twilio WhatsApp API (fallback/alternativa)
 *
 * Controla deduplicação: não reenvia o mesmo alerta se já foi
 * enviado nas últimas N horas (baseado em hash do conteúdo).
 */

import axios from 'axios';
import crypto from 'crypto';
import { execute, queryOne } from '../lib/db';
import { AlertType, AlertSeverity } from '../lib/types';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('whatsapp');

const WHATSAPP_PROVIDER = process.env.WHATSAPP_PROVIDER ?? 'evolution'; // 'evolution' | 'twilio'
const ALERT_NUMBERS     = (process.env.WHATSAPP_ALERT_NUMBERS ?? '').split(',').map((n) => n.trim()).filter(Boolean);

// -------------------------------------------------------
// Deduplicação de alertas
// -------------------------------------------------------
function buildHash(type: AlertType, body: string): string {
  return crypto.createHash('sha256').update(`${type}::${body}`).digest('hex');
}

/** Verifica se este alerta já foi enviado nas últimas 6 horas */
async function isAlreadySent(hash: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM alerts
     WHERE hash = $1 AND sent_at > NOW() - INTERVAL '6 hours'`,
    [hash]
  );
  return !!row;
}

/** Registra alerta enviado no banco */
async function recordAlert(
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  body: string,
  hash: string,
  sentVia: string[]
): Promise<void> {
  await execute(
    `INSERT INTO alerts (type, severity, title, body, hash, sent_via, sent_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (hash) DO UPDATE SET sent_at = NOW(), sent_via = EXCLUDED.sent_via`,
    [type, severity, title, body, hash, sentVia]
  );
}

// -------------------------------------------------------
// Evolution API
// -------------------------------------------------------
async function sendViaEvolution(to: string, body: string): Promise<boolean> {
  const url      = process.env.EVOLUTION_API_URL;
  const apiKey   = process.env.EVOLUTION_API_KEY;
  const instance = process.env.EVOLUTION_INSTANCE;

  if (!url || !apiKey || !instance) {
    log.warn('Evolution API não configurada (EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE)');
    return false;
  }

  try {
    await axios.post(
      `${url}/message/sendText/${instance}`,
      { number: to, options: { delay: 1200 }, textMessage: { text: body } },
      { headers: { apikey: apiKey }, timeout: 10_000 }
    );
    return true;
  } catch (err) {
    log.error(`Evolution API error para ${to}: ${(err as Error).message}`);
    return false;
  }
}

// -------------------------------------------------------
// Twilio WhatsApp
// -------------------------------------------------------
async function sendViaTwilio(to: string, body: string): Promise<boolean> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_WHATSAPP_FROM;   // whatsapp:+14155238886

  if (!sid || !token || !from) {
    log.warn('Twilio não configurado (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_WHATSAPP_FROM)');
    return false;
  }

  const dest = to.startsWith('whatsapp:') ? to : `whatsapp:+${to}`;
  const url  = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;

  try {
    await axios.post(
      url,
      new URLSearchParams({ From: from, To: dest, Body: body }).toString(),
      {
        auth: { username: sid, password: token },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      }
    );
    return true;
  } catch (err) {
    log.error(`Twilio error para ${to}: ${(err as Error).message}`);
    return false;
  }
}

// -------------------------------------------------------
// Envio principal (com deduplicação)
// -------------------------------------------------------
async function sendToNumber(to: string, body: string): Promise<boolean> {
  if (WHATSAPP_PROVIDER === 'twilio') return sendViaTwilio(to, body);
  return sendViaEvolution(to, body);
}

export async function sendAlert(
  type: AlertType,
  severity: AlertSeverity,
  title: string,
  body: string,
  force = false
): Promise<boolean> {
  if (ALERT_NUMBERS.length === 0) {
    log.warn('Nenhum número configurado em WHATSAPP_ALERT_NUMBERS');
    return false;
  }

  if (process.env.WHATSAPP_ENABLED === 'false') {
    log.info(`WhatsApp desabilitado. Alerta suprimido: ${title}`);
    return false;
  }

  const hash = buildHash(type, body);

  if (!force && (await isAlreadySent(hash))) {
    log.info(`Alerta duplicado suprimido (hash=${hash.slice(0, 8)}...)`);
    return false;
  }

  const sentVia: string[] = [];
  let anySuccess = false;

  for (const number of ALERT_NUMBERS) {
    const ok = await sendToNumber(number, `*${title}*\n\n${body}`);
    if (ok) { sentVia.push(number); anySuccess = true; }
  }

  if (anySuccess) {
    await recordAlert(type, severity, title, body, hash, sentVia);
    log.info(`Alerta [${type}] enviado para ${sentVia.length} número(s)`);
  }

  return anySuccess;
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
  stalledCount: number;   // tickets sem movimentação há > 7 dias
}

export function buildDailySummaryMessage(p: AlertPayload): string {
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const lines = [
    `📊 *Resumo SAFs — ${now}*`,
    '',
    `📋 Total abertos: *${p.totalOpen}*`,
    p.totalOverdue  > 0 ? `🔴 Atrasados: *${p.totalOverdue}*`              : `✅ Sem tickets atrasados`,
    p.totalAwaiting > 0 ? `⏳ Aguardando nossa resposta: *${p.totalAwaiting}*` : `✅ Nada aguardando nossa resposta`,
    p.totalCritical > 0 ? `🚨 Críticos (score ≥ 70): *${p.totalCritical}*` : '',
    '',
    `📂 *Por categoria:*`,
    p.byCategory.dsaJoy          > 0 ? `• DSA JOY: ${p.byCategory.dsaJoy}`                    : '',
    p.byCategory.myrock          > 0 ? `• MyRock: ${p.byCategory.myrock}`                      : '',
    p.byCategory.plataformasAulas > 0 ? `• Plataformas de Aulas: ${p.byCategory.plataformasAulas}` : '',
    p.byCategory.suporteEmails   > 0 ? `• Suporte Emails: ${p.byCategory.suporteEmails}`        : '',
  ].filter((l) => l !== '');

  if (p.stalledCount > 0) {
    lines.push('');
    lines.push(`⚠️ *${p.stalledCount} ticket(s) sem movimentação há mais de 7 dias*`);
  }

  if (p.top5Oldest.length > 0) {
    lines.push('');
    lines.push(`🕰️ *Tickets mais antigos abertos:*`);
    p.top5Oldest.slice(0, 5).forEach((t, i) => {
      lines.push(`${i + 1}. ${t.title.slice(0, 60)} — ${t.daysOpen} dias`);
    });
  }

  lines.push('');
  lines.push(`🔗 Dashboard: ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}`);

  return lines.join('\n');
}

export function buildCriticalAlertMessage(
  category: string,
  count: number,
  detail: string
): string {
  return [
    `🚨 *ALERTA CRÍTICO — ${category}*`,
    '',
    detail,
    '',
    `Total de tickets críticos: *${count}*`,
    `🔗 ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}`,
  ].join('\n');
}
