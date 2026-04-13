/**
 * Dispara o relatório de teste para todos os grupos Telegram.
 * Uso: node scripts/run-with-env.mjs scripts/test-telegram-report.ts
 */

import { SECTORS, getSectorTelegramChatIds } from '../src/lib/sectors';
import { getSectorStats } from '../src/repository/sectors';
import { getDashboardStats } from '../src/repository/tickets';
import { broadcastToContacts, formatDailySummary } from '../src/integrations/telegram';
import { queryOne, getPool } from '../src/lib/db';

async function main() {
  console.log('Disparando relatório de teste para todos os grupos...\n');

  // ── Por setor ──────────────────────────────────────────────
  for (const sector of SECTORS) {
    const chatIds = getSectorTelegramChatIds(sector.slug);

    if (chatIds.length === 0) {
      console.log(`⚠️  ${sector.name}: sem chat ID configurado — pulando`);
      continue;
    }

    const stats = await getSectorStats(sector.departments) as Record<string, string> | null;
    const s: Parameters<typeof formatDailySummary>[0] = {
      total:         Number(stats?.total_open            ?? 0),
      overdue:       Number(stats?.total_overdue         ?? 0),
      awaiting:      Number(stats?.total_awaiting        ?? 0),
      resolvedToday: Number(stats?.total_resolved_today  ?? 0),
      notOpened:     Number(stats?.total_not_opened      ?? 0),
    };

    if (sector.slug === 'pd-i') {
      const cat = await getDashboardStats() as Record<string, string> | null;
      s.categories = {
        dsaJoy:           Number(cat?.count_dsa_joy            ?? 0),
        myrock:           Number(cat?.count_myrock             ?? 0),
        plataformasAulas: Number(cat?.count_plataformas_aulas  ?? 0),
        suporteEmails:    Number(cat?.count_suporte_emails     ?? 0),
      };
    }

    const text = `🧪 <b>[TESTE]</b>\n${formatDailySummary(s, sector.name)}`;
    const result = await broadcastToContacts(chatIds, text);

    const icon = result.failed === 0 ? '✅' : '⚠️';
    console.log(`${icon} ${sector.name} (${chatIds.join(', ')}): sent=${result.sent} failed=${result.failed}`);
    console.log(`   Total: ${s.total} | Atrasados: ${s.overdue} | Aguardando: ${s.awaiting}`);
  }

  // ── Grupo Geral ────────────────────────────────────────────
  const geralId = process.env.TELEGRAM_CHAT_ID_GERAL?.trim();
  if (geralId) {
    const globalRow = await queryOne<{ total: string; overdue: string; awaiting: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS total,
         COUNT(*) FILTER (WHERE is_overdue
           AND status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS overdue,
         COUNT(*) FILTER (WHERE awaiting_our_response
           AND status NOT IN ('resolvido','cancelado')
           AND opened_at >= NOW() - INTERVAL '3 months') AS awaiting
       FROM saf_tickets`,
      []
    );

    const sectorLines = await Promise.all(
      SECTORS.map(async (sector) => {
        const stats  = await getSectorStats(sector.departments) as Record<string, string> | null;
        const total   = Number(stats?.total_open    ?? 0);
        const overdue = Number(stats?.total_overdue ?? 0);
        const ov = overdue > 0 ? ` 🔴 ${overdue}` : '';
        return `  • <b>${sector.name}</b>: ${total}${ov}`;
      })
    );

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const geralText =
      `🧪 <b>[TESTE]</b>\n` +
      `📊 <b>Resumo Geral SAFs — ${now}</b>\n\n` +
      `Total abertos: <b>${Number(globalRow?.total ?? 0)}</b>\n` +
      `Atrasados: <b>${Number(globalRow?.overdue ?? 0)}</b>\n` +
      `Aguardando nossa resp.: <b>${Number(globalRow?.awaiting ?? 0)}</b>\n\n` +
      `<b>Por setor:</b>\n` +
      sectorLines.join('\n') + '\n\n' +
      `🔗 ${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}`;

    const result = await broadcastToContacts([geralId], geralText);
    const icon = result.failed === 0 ? '✅' : '⚠️';
    console.log(`\n${icon} GERAL (${geralId}): sent=${result.sent} failed=${result.failed}`);
  } else {
    console.log('\n⚠️  GERAL: TELEGRAM_CHAT_ID_GERAL não configurado');
  }

  console.log('\nConcluído.');
  await getPool().end();
}

main().catch(err => { console.error('Erro:', err.message); process.exit(1); });
