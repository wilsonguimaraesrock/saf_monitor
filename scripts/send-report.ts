/**
 * Script autônomo — envia resumo horário de SAFs para o Telegram.
 * Sem dependências de src/ — usa pg e axios diretamente.
 *
 * Uso:
 *   node --loader ts-node/esm scripts/send-report.ts
 *
 * Variáveis de ambiente:
 *   DATABASE_URL, DATABASE_SSL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 *   VERCEL_APP_URL (opcional — link no rodapé da mensagem)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Carrega .env.local (dev) e .env como fallback
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });
import { Pool } from 'pg';
import axios from 'axios';

// ── BRT ───────────────────────────────────────────────────
function brTime() {
  const now = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' })
  );
  return { hour: now.getHours(), dow: now.getDay(), label: now.toLocaleString('pt-BR') };
}

// ── Banco ─────────────────────────────────────────────────
function buildPool(): Pool {
  let cs = process.env.DATABASE_URL;
  if (!cs) { console.error('DATABASE_URL não definida'); process.exit(1); }

  // Remove parâmetros que o PostgreSQL não reconhece (sslmode, uselibpqcompat…)
  cs = cs.replace(/[?&]sslmode=[^&]*/g, (m) => m.startsWith('?') ? '?' : '')
         .replace(/[?&]uselibpqcompat=[^&]*/g, (m) => m.startsWith('?') ? '?' : '')
         .replace(/\?&/, '?')
         .replace(/[?&]$/, '');

  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

  return new Pool({ connectionString: cs, ssl, max: 2, idleTimeoutMillis: 5_000 });
}

async function fetchStats(pool: Pool) {
  const SCOPE  = `AND priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')`;
  const WINDOW = `AND opened_at >= NOW() - INTERVAL '3 months'`;
  const ACTIVE = `AND status NOT IN ('resolvido','cancelado')`;

  const { rows: [s] } = await pool.query(`
    SELECT
      (SELECT COUNT(*) FROM saf_tickets WHERE TRUE ${ACTIVE} ${WINDOW} ${SCOPE})                    AS total_open,
      (SELECT COUNT(*) FROM saf_tickets WHERE is_overdue ${ACTIVE} ${WINDOW} ${SCOPE})              AS total_overdue,
      (SELECT COUNT(*) FROM saf_tickets WHERE awaiting_our_response ${ACTIVE} ${WINDOW} ${SCOPE})   AS total_awaiting,
      (SELECT COUNT(*) FROM saf_tickets WHERE priority_score >= 70 ${ACTIVE} ${WINDOW} ${SCOPE})    AS total_critical,
      (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'dsa_joy' ${ACTIVE} ${WINDOW})    AS cnt_dsa,
      (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'myrock' ${ACTIVE} ${WINDOW})     AS cnt_rock,
      (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'plataformas_aulas' ${ACTIVE} ${WINDOW}) AS cnt_plat,
      (SELECT COUNT(*) FROM saf_tickets WHERE priority_category = 'suporte_emails' ${ACTIVE} ${WINDOW})    AS cnt_email,
      (SELECT COUNT(*) FROM saf_tickets WHERE resolved_at::date = CURRENT_DATE ${SCOPE})            AS resolved_today,
      (SELECT COUNT(*) FROM saf_tickets
       WHERE last_updated_at < NOW() - INTERVAL '7 days' ${ACTIVE})                                 AS stalled
  `);

  const { rows: oldest } = await pool.query<{ title: string; days_open: number }>(`
    SELECT title, days_open FROM saf_tickets
    WHERE TRUE ${ACTIVE} ${WINDOW} ${SCOPE}
    ORDER BY opened_at ASC NULLS LAST
    LIMIT 5
  `);

  return { s, oldest };
}

// ── Formata mensagem ──────────────────────────────────────
function buildMessage(
  s: Record<string, string>,
  oldest: Array<{ title: string; days_open: number }>,
  label: string
): string {
  const n = (v: string) => Number(v ?? 0);
  const appUrl = process.env.VERCEL_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? '';

  const lines: string[] = [
    `📊 <b>Resumo SAFs — ${label}</b>`,
    '',
    `📋 Total abertos: <b>${n(s.total_open)}</b>`,
    `✅ Concluídos hoje: <b>${n(s.resolved_today)}</b>`,
    n(s.total_overdue)  > 0 ? `🔴 Atrasados: <b>${n(s.total_overdue)}</b>`               : `✅ Sem tickets atrasados`,
    n(s.total_awaiting) > 0 ? `⏳ Aguardando nossa resposta: <b>${n(s.total_awaiting)}</b>` : `✅ Nada aguardando resposta`,
    n(s.total_critical) > 0 ? `🚨 Críticos (score ≥ 70): <b>${n(s.total_critical)}</b>`  : '',
    '',
    `📂 <b>Por categoria:</b>`,
    n(s.cnt_dsa)  > 0 ? `  • DSA JOY: ${n(s.cnt_dsa)}`                   : '',
    n(s.cnt_rock) > 0 ? `  • MyRock: ${n(s.cnt_rock)}`                    : '',
    n(s.cnt_plat) > 0 ? `  • Plataformas de Aulas: ${n(s.cnt_plat)}`      : '',
    n(s.cnt_email)> 0 ? `  • Suporte Emails: ${n(s.cnt_email)}`           : '',
  ].filter(Boolean);

  if (n(s.stalled) > 0) {
    lines.push('');
    lines.push(`⚠️ ${n(s.stalled)} ticket(s) sem movimentação há mais de 7 dias`);
  }

  if (oldest.length > 0) {
    lines.push('');
    lines.push(`🕰️ <b>Tickets mais antigos abertos:</b>`);
    oldest.forEach((t, i) => {
      lines.push(`  ${i + 1}. ${t.title.slice(0, 55)} (${t.days_open}d)`);
    });
  }

  if (appUrl) {
    lines.push('');
    lines.push(`🔗 ${appUrl}`);
  }

  return lines.join('\n');
}

// ── Telegram ──────────────────────────────────────────────
async function sendTelegram(text: string): Promise<void> {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) { console.error('TELEGRAM_BOT_TOKEN ou TELEGRAM_CHAT_ID ausentes'); process.exit(1); }

  await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    { chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true },
    { timeout: 10_000 }
  );
}

// ── Main ──────────────────────────────────────────────────
async function main() {
  const { hour, dow, label } = brTime();

  if (dow === 0 || dow === 6 || hour < 8 || hour >= 20) {
    console.log(`Fora da janela — dow=${dow}, hour=${hour}h BRT. Nada enviado.`);
    return;
  }

  console.log(`[${label}] Conectando ao banco...`);
  const pool = buildPool();

  try {
    const { s, oldest } = await fetchStats(pool);
    const msg = buildMessage(s, oldest, label);
    console.log('Enviando ao Telegram...');
    await sendTelegram(msg);
    console.log('Mensagem enviada.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Erro:', err.message ?? err);
  process.exit(1);
});
