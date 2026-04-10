/**
 * Script autônomo — envia resumo horário de SAFs para o Telegram.
 *
 * Roda direto pelo GitHub Actions (sem passar pela Vercel).
 * Conecta no banco, busca os indicadores e envia a mensagem.
 *
 * Uso:
 *   node --loader ts-node/esm scripts/send-report.ts
 *
 * Variáveis de ambiente necessárias:
 *   DATABASE_URL, DATABASE_SSL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   VERCEL_APP_URL (opcional — aparece no link da mensagem)
 */

import { query, queryOne, getPool } from '../src/lib/db.js';
import { buildDailySummaryMessage } from '../src/integrations/notifications.js';
import axios from 'axios';

// ── Hora BRT ──────────────────────────────────────────────
function brTime(): { hour: number; dow: number } {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  return { hour: now.getHours(), dow: now.getDay() }; // 0=Dom
}

// ── Telegram direto (sem deduplicação — é horário fixo) ──
async function sendTelegram(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID não definidos.');
    process.exit(1);
  }

  await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    },
    { timeout: 10_000 }
  );
}

// ── Queries (mesma lógica do /api/cron/report) ────────────
const SCOPE = `AND priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')`;
const WINDOW = `AND opened_at >= NOW() - INTERVAL '3 months'`;
const ACTIVE = `AND status NOT IN ('resolvido','cancelado')`;

async function fetchStats() {
  const stats = await queryOne<Record<string, string>>(
    `SELECT
       (SELECT COUNT(*) FROM saf_tickets WHERE TRUE ${ACTIVE} ${WINDOW} ${SCOPE}) AS total_open,
       (SELECT COUNT(*) FROM saf_tickets WHERE is_overdue ${ACTIVE} ${WINDOW} ${SCOPE}) AS total_overdue,
       (SELECT COUNT(*) FROM saf_tickets WHERE awaiting_our_response ${ACTIVE} ${WINDOW} ${SCOPE}) AS total_awaiting,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_score >= 70 ${ACTIVE} ${WINDOW} ${SCOPE}) AS total_critical,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'dsa_joy' ${ACTIVE} ${WINDOW}) AS count_dsa_joy,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'myrock' ${ACTIVE} ${WINDOW}) AS count_myrock,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'plataformas_aulas' ${ACTIVE} ${WINDOW}) AS count_plataformas_aulas,
       (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'suporte_emails' ${ACTIVE} ${WINDOW}) AS count_suporte_emails`
  );

  const oldest = await query<{ title: string; days_open: number }>(
    `SELECT title, days_open FROM saf_tickets
     WHERE TRUE ${ACTIVE} ${WINDOW} ${SCOPE}
     ORDER BY opened_at ASC NULLS LAST
     LIMIT 5`
  );

  const stalled = await queryOne<{ count: string }>(
    `SELECT COUNT(*) AS count FROM saf_tickets
     WHERE last_updated_at < NOW() - INTERVAL '7 days' ${ACTIVE}`
  );

  return { stats, oldest, stalledCount: Number(stalled?.count ?? 0) };
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const { hour, dow } = brTime();

  // Seg–Sex (1–5), 8h–19h BRT
  if (dow === 0 || dow === 6 || hour < 8 || hour >= 20) {
    console.log(`Fora da janela — dow=${dow}, hour=${hour}h BRT. Nada enviado.`);
    process.exit(0);
  }

  console.log(`Buscando dados — ${hour}h BRT, dow=${dow}...`);

  const { stats, oldest, stalledCount } = await fetchStats();

  if (!stats) {
    console.error('Sem dados no banco.');
    process.exit(1);
  }

  const payload = {
    totalOpen:     Number(stats.total_open     ?? 0),
    totalOverdue:  Number(stats.total_overdue  ?? 0),
    totalAwaiting: Number(stats.total_awaiting ?? 0),
    totalCritical: Number(stats.total_critical ?? 0),
    stalledCount,
    top5Oldest: oldest.map((t) => ({ title: t.title, daysOpen: Number(t.days_open ?? 0) })),
    byCategory: {
      dsaJoy:           Number(stats.count_dsa_joy           ?? 0),
      myrock:           Number(stats.count_myrock            ?? 0),
      plataformasAulas: Number(stats.count_plataformas_aulas ?? 0),
      suporteEmails:    Number(stats.count_suporte_emails    ?? 0),
    },
  };

  // Usa a URL do app Vercel no link do rodapé se disponível
  process.env.NEXT_PUBLIC_APP_URL = process.env.VERCEL_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

  const msg = buildDailySummaryMessage(payload);
  console.log('Enviando mensagem ao Telegram...');
  await sendTelegram(`ℹ️ <b>Resumo Horário SAFs</b>\n\n${msg}`);
  console.log('Mensagem enviada com sucesso.');

  // Fecha o pool para o processo terminar limpo
  await getPool().end();
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exit(1);
});
