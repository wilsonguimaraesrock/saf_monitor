/**
 * Integração Telegram — envia notificações via Bot API.
 *
 * Setup:
 *  1. Crie um bot via @BotFather no Telegram → copie o token
 *  2. Adicione TELEGRAM_BOT_TOKEN no .env.local
 *  3. Crie grupos por setor, adicione o bot, e salve o chat ID em sector_contacts
 *
 * Como obter o chat ID de um grupo:
 *  1. Adicione o bot no grupo
 *  2. Mande qualquer mensagem no grupo
 *  3. Acesse: https://api.telegram.org/bot{SEU_TOKEN}/getUpdates
 *  4. Procure o campo "chat.id" (geralmente negativo para grupos)
 */

import { createChildLogger } from '../lib/logger';

const log = createChildLogger('telegram');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const API_BASE  = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : null;

export interface TelegramMessage {
  chatId: string;
  text: string;
  parseMode?: 'HTML' | 'Markdown';
}

/**
 * Envia uma mensagem para um chat ID específico.
 * Retorna true se enviou, false se falhou ou Telegram não está configurado.
 */
export async function sendTelegramMessage(msg: TelegramMessage): Promise<boolean> {
  if (!API_BASE) {
    log.warn('Telegram não configurado — defina TELEGRAM_BOT_TOKEN no .env.local');
    return false;
  }

  try {
    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    msg.chatId,
        text:       msg.text,
        parse_mode: msg.parseMode ?? 'HTML',
      }),
    });

    const data = await res.json() as { ok: boolean; description?: string };
    if (!data.ok) {
      log.warn(`Telegram falhou para chat ${msg.chatId}: ${data.description}`);
      return false;
    }

    log.info(`Telegram ✓ → chat ${msg.chatId}`);
    return true;
  } catch (err) {
    log.warn(`Telegram erro: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Envia a mesma mensagem para múltiplos chat IDs.
 * Continua mesmo se algum falhar.
 */
export async function broadcastToContacts(
  chatIds: string[],
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;

  for (const chatId of chatIds) {
    const ok = await sendTelegramMessage({ chatId, text, parseMode });
    if (ok) sent++; else failed++;
  }

  return { sent, failed };
}

// -------------------------------------------------------
// Templates de mensagem por tipo de alerta
// -------------------------------------------------------

export function formatOverdueAlert(tickets: {
  number?: string; title: string; franchise?: string; daysOverdue: number;
}[], sectorName: string): string {
  const lines = tickets.map((t) =>
    `  • <b>#${t.number ?? '?'}</b> — ${t.title.slice(0, 60)}` +
    `\n    🏫 ${t.franchise ?? '—'} | ⏰ ${t.daysOverdue}d atrasado`
  );

  return (
    `🚨 <b>SAFs Atrasados — ${sectorName}</b>\n` +
    `${tickets.length} ticket(s) com prazo vencido:\n\n` +
    lines.join('\n\n')
  );
}

export function formatAwaitingAlert(tickets: {
  number?: string; title: string; franchise?: string; daysWaitingUs: number;
}[], sectorName: string): string {
  const lines = tickets.map((t) =>
    `  • <b>#${t.number ?? '?'}</b> — ${t.title.slice(0, 60)}` +
    `\n    🏫 ${t.franchise ?? '—'} | ⏳ ${t.daysWaitingUs}d aguardando`
  );

  return (
    `⏳ <b>Aguardando Nossa Resposta — ${sectorName}</b>\n` +
    `${tickets.length} ticket(s) aguardando resposta do time:\n\n` +
    lines.join('\n\n')
  );
}

export function formatDailySummary(stats: {
  total: number; overdue: number; awaiting: number;
  resolvedToday: number; notOpened: number;
}, sectorName: string): string {
  return (
    `📊 <b>Resumo Diário — ${sectorName}</b>\n\n` +
    `📋 Total abertos: <b>${stats.total}</b>\n` +
    `🚨 Atrasados: <b>${stats.overdue}</b>\n` +
    `⏳ Aguardando nossa resp.: <b>${stats.awaiting}</b>\n` +
    `📭 Ainda não abertos: <b>${stats.notOpened}</b>\n` +
    `✅ Resolvidos hoje: <b>${stats.resolvedToday}</b>`
  );
}
