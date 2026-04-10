/**
 * Teste de conexão com o sistema SAF
 * Roda sem banco de dados — autentica, lê a listagem e testa o export XLSX.
 *
 * Uso:
 *   npx ts-node --skip-project --compiler-options '{"module":"commonjs","esModuleInterop":true}' scripts/test-connection.ts
 */

import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Carrega variáveis do .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌  .env.local não encontrado.');
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const idx = t.indexOf('=');
    if (idx === -1) continue;
    const key = t.slice(0, idx).trim();
    const val = t.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

const BASE_URL   = process.env.SAF_BASE_URL  ?? 'https://app.dfranquias.com.br';
const LOGIN_URL  = process.env.SAF_LOGIN_URL ?? `${BASE_URL}/login`;
const LIST_URL   = process.env.SAF_LIST_URL  ?? `${BASE_URL}/saf/`;
const USERNAME   = process.env.SAF_USERNAME  ?? '';
const PASSWORD   = process.env.SAF_PASSWORD  ?? '';
const TIMEOUT    = 30_000;
const SS_DIR     = path.join(__dirname, '..', 'logs', 'screenshots');
const DL_DIR     = path.join(__dirname, '..', 'logs', 'downloads');

for (const d of [SS_DIR, DL_DIR]) if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });

const ok   = (m: string) => console.log(`  ✅  ${m}`);
const warn = (m: string) => console.log(`  ⚠️   ${m}`);
const fail = (m: string) => console.log(`  ❌  ${m}`);
const info = (m: string) => console.log(`  ℹ️   ${m}`);
const step = (m: string) => console.log(`\n▶  ${m}`);
const ss   = async (p: Page, l: string) => {
  const f = path.join(SS_DIR, `${l}-${Date.now()}.png`);
  await p.screenshot({ path: f, fullPage: true });
  info(`Screenshot: ${path.basename(f)}`);
};

async function run() {
  console.log('\n══════════════════════════════════════════');
  console.log('  TESTE DE CONEXÃO — SISTEMA SAF');
  console.log('══════════════════════════════════════════');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  });
  let page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  try {
    // ── LOGIN ─────────────────────────────────────────────
    step('Login...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    const userField =
      await page.$('input[name="_username"]') ??
      await page.$('input[name="username"]') ??
      await page.$('input[name="email"]') ??
      await page.$('input[type="email"]') ??
      await page.$('input[type="text"]');

    if (!userField) { await ss(page, 'no-user-field'); fail('Campo usuário não encontrado'); return; }
    await userField.fill(USERNAME);

    const passField = await page.$('input[type="password"]');
    if (!passField) { await ss(page, 'no-pass-field'); fail('Campo senha não encontrado'); return; }
    await passField.fill(PASSWORD);

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT }),
      (await page.$('button[type="submit"]') ?? await page.$('input[type="submit"]'))!.click(),
    ]);

    if (page.url().includes('/login')) {
      await ss(page, 'login-failed');
      fail('Login falhou — verifique credenciais');
      return;
    }
    ok(`Login OK → ${page.url()}`);

    // ── LISTAGEM DE SAFs ──────────────────────────────────
    step('Acessando lista de SAFs...');
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded' });
    await ss(page, 'saf-list');

    // Inspeciona a estrutura da tabela
    const tableInfo = await page.evaluate(() => {
      const table = document.querySelector('table');
      if (!table) return null;

      const headers = Array.from(table.querySelectorAll('thead th, thead td'))
        .map((th) => th.textContent?.trim() ?? '');

      const rows = Array.from(table.querySelectorAll('tbody tr')).slice(0, 3).map((row) => {
        const cells = Array.from(row.querySelectorAll('td'))
          .map((td) => td.textContent?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '');
        const link = row.querySelector('a[href*="/saf/"]') as HTMLAnchorElement | null;
        return { cells, href: link?.getAttribute('href') ?? '' };
      });

      return { headers, rowCount: table.querySelectorAll('tbody tr').length, rows };
    });

    if (!tableInfo) {
      warn('Tabela não encontrada — verifique screenshot');
    } else {
      ok(`Tabela encontrada: ${tableInfo.rowCount} linhas visíveis`);
      info(`Colunas (${tableInfo.headers.length}): ${tableInfo.headers.join(' | ')}`);
      tableInfo.rows.forEach((r, i) => {
        info(`  Linha ${i + 1}: ${r.cells.join(' | ')}`);
        if (r.href) info(`    Link: ${r.href}`);
      });
    }

    // Verifica paginação
    const paginationInfo = await page.evaluate(() => {
      const pagination = document.querySelector('.pagination, [class*="pagination"]');
      if (!pagination) return null;
      const links = Array.from(pagination.querySelectorAll('a')).map((a) => a.textContent?.trim());
      return { html: pagination.innerHTML.slice(0, 200), links };
    });
    if (paginationInfo) {
      ok(`Paginação encontrada: [${paginationInfo.links.join(', ')}]`);
    }

    // ── EXPORT XLSX — via botão na página ─────────────────
    step('Investigando export XLSX...');

    // Procura botão/link de exportação na página
    const exportInfo = await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll('a, button'))
        .filter((el) => {
          const text = el.textContent?.toLowerCase() ?? '';
          const href = (el as HTMLAnchorElement).href ?? '';
          return text.includes('xlsx') || text.includes('excel') || text.includes('export')
            || href.includes('xlsx') || href.includes('excel') || href.includes('export');
        })
        .map((el) => ({
          tag:  el.tagName,
          text: el.textContent?.trim().slice(0, 80) ?? '',
          href: (el as HTMLAnchorElement).href ?? '',
          class: el.className,
        }));
      return candidates;
    });

    if (exportInfo.length > 0) {
      ok(`Encontrados ${exportInfo.length} elemento(s) de export:`);
      exportInfo.forEach((e, i) => info(`  ${i + 1}. <${e.tag}> "${e.text}" href="${e.href}"`));
    } else {
      warn('Nenhum botão/link de export encontrado na listagem');
      info('Verifique no screenshot se há um botão de exportação visível');
    }

    // Tenta clicar no botão de export e capturar o download
    if (exportInfo.length > 0) {
      const xlsxPath = path.join(DL_DIR, `saf-test-${Date.now()}.xlsx`);
      try {
        const exportBtn = await page.$(`a[href*="xlsx"], a[href*="excel"], button:has-text("xlsx"), button:has-text("Excel"), a:has-text("xlsx"), a:has-text("Excel")`);
        if (exportBtn) {
          const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
          await exportBtn.click();
          const download = await downloadPromise;
          await download.saveAs(xlsxPath);
          const size = fs.statSync(xlsxPath).size;
          ok(`XLSX baixado via clique! Tamanho: ${(size / 1024).toFixed(1)} KB`);

          try {
            const XLSX = await import('xlsx');
            const wb   = XLSX.readFile(xlsxPath);
            const ws   = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(ws);
            ok(`XLSX contém ${rows.length} linhas`);
            if (rows.length > 0) info('Colunas XLSX: ' + Object.keys(rows[0] as object).join(' | '));
          } catch { warn('Não foi possível ler o XLSX'); }
        }
      } catch {
        warn('Download via clique não funcionou — usaremos scraping paginado');
      }
    }

    // ── DETALHE DE UM TICKET ──────────────────────────────
    if (tableInfo?.rows[0]?.href) {
      step('Testando detalhe do ticket...');
      const detailUrl = tableInfo.rows[0].href.startsWith('http')
        ? tableInfo.rows[0].href
        : `${BASE_URL}${tableInfo.rows[0].href}`;

      await page.goto(detailUrl, { waitUntil: 'domcontentloaded' });
      await ss(page, 'ticket-detail');

      const detailInfo = await page.evaluate(() => {
        const getText = (sel: string) => document.querySelector(sel)?.textContent?.trim().slice(0, 100);
        const msgs = document.querySelectorAll('[class*="timeline"], [class*="message"], [class*="historico"]');
        return {
          url: window.location.href,
          title: document.title,
          msgCount: msgs.length,
          bodySnippet: getText('main, .content, [class*="card"], [class*="ticket"]') ?? '',
        };
      });
      ok(`Detalhe acessado: ${detailInfo.url}`);
      info(`Mensagens/histórico encontrados: ${detailInfo.msgCount}`);
      info(`Snippet: ${detailInfo.bodySnippet.slice(0, 100)}`);
    }

    // ── RESUMO ────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════');
    console.log('  RESULTADO');
    console.log('══════════════════════════════════════════');
    ok('Autenticação funcionando');
    ok('Listagem de SAFs acessível');
    ok('Screenshots salvos em logs/screenshots/');
    if (tableInfo) {
      info(`Estrutura da tabela mapeada — ${tableInfo.headers.length} colunas`);
      info(`Colunas: ${tableInfo.headers.join(' | ')}`);
    }
    info('Próximo passo: configurar banco PostgreSQL na Digital Ocean');
    console.log('══════════════════════════════════════════\n');

  } catch (err) {
    fail(`Erro: ${(err as Error).message}`);
    await ss(page, 'error').catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close().catch(() => {});
  }
}

run();
