/**
 * Coletor de tickets SAF — mapeado com dados reais do sistema
 *
 * XLSX columns confirmadas (via teste):
 *   Número | Status Atual | Histórico Status | Criado por | Assunto |
 *   Departamento | Serviço | Franquia | Criado em | Prazo | Concluído com Atraso?
 *
 * Estratégia:
 *  1. Clica em "Exportar Excel" na listagem → download do XLSX (181+ tickets)
 *  2. Fallback: scraping paginado da tabela (10 por página, ~19 páginas)
 *  3. Enriquecimento via /saf/{id}/show para histórico de mensagens
 */

import { Page, BrowserContext, chromium } from 'playwright';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { RawTicket, RawTicketUpdate, ScraperResult } from '../lib/types';
import { login, ensureSession } from './auth';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('collector');

const BASE_URL     = process.env.SAF_BASE_URL    ?? 'https://app.dfranquias.com.br';
const LIST_URL     = `${BASE_URL}/saf/`;
const TIMEOUT      = Number(process.env.PLAYWRIGHT_TIMEOUT_MS  ?? 30_000);
const HEADLESS     = process.env.PLAYWRIGHT_HEADLESS !== 'false';
const MAX_PAGES    = Number(process.env.SCRAPER_MAX_PAGES ?? 50);
const DOWNLOAD_DIR = path.join(process.cwd(), 'logs', 'downloads');

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// -------------------------------------------------------
// MÉTODO 1 — Download XLSX via clique em "Exportar Excel"
// (o href é "#", acionado por JavaScript na página)
// -------------------------------------------------------
async function collectViaXlsx(page: Page): Promise<RawTicket[] | null> {
  log.info('Tentando coleta via "Exportar Excel"...');
  try {
    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    const exportBtn = await page.$('a:has-text("Exportar Excel"), a:has-text("Export Excel"), a[href*="export"]');
    if (!exportBtn) {
      log.warn('Botão "Exportar Excel" não encontrado na listagem');
      return null;
    }

    const xlsxPath = path.join(DOWNLOAD_DIR, `saf-${Date.now()}.xlsx`);
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await exportBtn.click();
    const download = await downloadPromise;
    await download.saveAs(xlsxPath);

    const size = fs.statSync(xlsxPath).size;
    if (size === 0) { log.warn('XLSX vazio'); return null; }

    log.info(`XLSX baixado: ${(size / 1024).toFixed(1)} KB`);
    return parseXlsx(xlsxPath);
  } catch (err) {
    log.warn(`Falha no export XLSX: ${(err as Error).message} — usando fallback`);
    return null;
  }
}

// -------------------------------------------------------
// Parse do XLSX com colunas reais confirmadas
// -------------------------------------------------------
function parseXlsx(filePath: string): RawTicket[] {
  const workbook = XLSX.readFile(filePath);
  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rows     = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  log.info(`XLSX: ${rows.length} linhas`);

  return rows
    .filter((row) => row['Número'] || row['Assunto'])   // ignora linhas vazias
    .map((row) => {
      const get = (...keys: string[]): string => {
        for (const k of keys) {
          const v = row[k];
          if (v !== undefined && v !== '') return String(v).trim();
        }
        return '';
      };

      const numero = get('Número', 'Numero', 'N°');

      return {
        externalId:    numero || String(Math.random()),
        number:        numero,
        title:         get('Assunto', 'Titulo', 'Subject'),
        description:   get('Descrição', 'Description'),
        // "Status Atual" é o status atual do ticket
        status:        get('Status Atual', 'Status'),
        franchise:     get('Franquia', 'Franchise'),
        // "Serviço" é a subcategoria; "Departamento" é a área
        service:       get('Serviço', 'Servico', 'Service'),
        responsible:   get('Criado por', 'Responsavel', 'Responsible'),
        openedAt:      get('Criado em', 'Data Abertura', 'Created'),
        dueAt:         get('Prazo', 'Due Date', 'SLA'),
        lastUpdatedAt: get('Atualizado em', 'Updated'),
        // Coluna extra útil para detectar atraso
        _concludedLate: get('Concluído com Atraso?') === 'Sim',
      } as RawTicket & { _concludedLate: boolean };
    });
}

// -------------------------------------------------------
// MÉTODO 1b — Lê STATUS RESP. e ID numérico da listagem HTML
// para enriquecer o XLSX.
//
// O XLSX exporta o número formatado (ex: "260126-010") mas a
// URL do dfranquias usa o ID interno numérico (ex: "263534").
// Aqui capturamos ambos a partir do href do link de detalhe.
//
// Retorna mapa: numero_formatado → { statusResp, numericId }
// -------------------------------------------------------
interface ListEntry { statusResp: string; numericId: string }

async function collectStatusRespMap(
  page: Page,
  context: BrowserContext,
): Promise<Map<string, ListEntry>> {
  log.info('Coletando STATUS RESP. + IDs numéricos da listagem HTML...');
  const statusMap = new Map<string, ListEntry>();
  let pagesScraped = 0;

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

  while (pagesScraped < MAX_PAGES) {
    pagesScraped++;

    if (pagesScraped % 5 === 0) page = await ensureSession(context, page);

    const rows = await page.evaluate(() => {
      const result: { numero: string; statusResp: string; numericId: string }[] = [];
      document.querySelectorAll('table tbody tr').forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;

        // Número formatado está na col 0 (ex: "260126-010 Aberto")
        const col0   = cells[0]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        const numero = col0.split(/\s+/)[0] ?? '';

        // Status resp. na col 1
        const statusResp = cells[1]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

        // ID numérico vem do href: /saf/263534/show
        const link      = row.querySelector('a[href*="/saf/"][href*="/show"]') as HTMLAnchorElement | null;
        const href      = link?.getAttribute('href') ?? '';
        const idMatch   = href.match(/\/saf\/(\d+)/);
        const numericId = idMatch?.[1] ?? '';

        if (numero && numericId) result.push({ numero, statusResp, numericId });
      });
      return result;
    });

    for (const { numero, statusResp, numericId } of rows) {
      statusMap.set(numero, { statusResp, numericId });
    }

    log.info(`  Página ${pagesScraped}: ${rows.length} linhas, total mapeado: ${statusMap.size}`);

    const hasNext = await page.$('li.next:not(.disabled) a, a[rel="next"]');
    if (!hasNext) break;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT }),
      hasNext.click(),
    ]);
  }

  log.info(`Mapeados: ${statusMap.size} tickets (STATUS RESP. + ID numérico)`);
  return statusMap;
}

// -------------------------------------------------------
// MÉTODO 2 — Scraping paginado (fallback)
// Colunas reais: nº/Status | Status resp. | Franquia |
//                Departamento | Assunto | Criado Por | Prazo | Ações
// -------------------------------------------------------
async function collectViaListScraping(page: Page, context: BrowserContext): Promise<RawTicket[]> {
  log.info('Coletando via scraping paginado...');
  const allRaw: RawTicket[] = [];
  let pagesScraped = 0;

  await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

  while (pagesScraped < MAX_PAGES) {
    pagesScraped++;
    log.info(`  Página ${pagesScraped}...`);

    if (pagesScraped % 5 === 0) page = await ensureSession(context, page);

    const rows = await page.evaluate((base: string) => {
      const result: { externalId: string; number: string; title: string; statusCurrent: string; statusResponse: string; franchise: string; department: string; responsible: string; dueAt: string; detailHref: string }[] = [];

      document.querySelectorAll('table tbody tr').forEach((row) => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 5) return;

        const link    = row.querySelector('a[href*="/saf/"][href*="/show"]') as HTMLAnchorElement | null;
        const href    = link ? link.getAttribute('href') ?? '' : '';
        const idMatch = href.match(/\/saf\/(\d+)/);
        if (!idMatch) return;

        const t = (i: number) => cells[i]?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

        // col 0: "260409-005 Aberto"  → número + statusCurrent
        const col0Parts = t(0).split(/\s+/);
        const numero    = col0Parts[0] ?? '';

        result.push({
          externalId:     idMatch[1],
          number:         numero,
          title:          t(4),           // Assunto
          statusCurrent:  t(0).replace(numero, '').trim(), // status embutido no col 0
          statusResponse: t(1),           // Status resp. (ex: "Aguardando Franqueadora")
          franchise:      t(2),           // Franquia
          department:     t(3),           // Departamento
          responsible:    t(5),           // Criado Por
          dueAt:          t(6),           // Prazo
          detailHref:     href,
        });
      });

      return result;
    }, BASE_URL);

    log.info(`  → ${rows.length} tickets`);
    for (const r of rows) {
      allRaw.push({
        externalId:    r.externalId,
        number:        r.number,
        title:         r.title,
        // Combina statusCurrent + statusResponse para o normalizer decidir
        status:        r.statusResponse || r.statusCurrent,
        franchise:     r.franchise,
        service:       r.department,
        responsible:   r.responsible,
        dueAt:         r.dueAt,
      });
    }

    const hasNext = await page.$('li.next:not(.disabled) a, a[rel="next"]');
    if (!hasNext) break;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT }),
      hasNext.click(),
    ]);
  }

  return allRaw;
}

// -------------------------------------------------------
// Enriquece ticket com detalhe /saf/{id}/show
// Captura o histórico de mensagens/chat do ticket.
//
// Estratégia: usa innerText da página e faz parse linha-a-linha
// detectando cabeçalhos de mensagem pelos dois formatos do dfranquias:
//   Formato A: "DD/MM/YYYY HH:MM - Nome do Autor"
//   Formato B: "Tipo Mensagem - DD/MM/YYYY - HH:MM:SS"
// -------------------------------------------------------
export async function enrichTicketDetail(page: Page, externalId: string): Promise<Partial<RawTicket>> {
  try {
    await page.goto(`${BASE_URL}/saf/${externalId}/show`, {
      waitUntil: 'domcontentloaded', timeout: TIMEOUT,
    });

    const updates = await page.evaluate((): { author?: string; content?: string; occurredAt?: string; isOurs?: boolean }[] => {
      const results: { author?: string; content?: string; occurredAt?: string; isOurs?: boolean }[] = [];

      // Usa innerText para obter o texto visível exatamente como o usuário vê
      const bodyText: string = (document.body as HTMLElement).innerText || '';
      const lines: string[] = bodyText.split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l.length > 1);

      // Formato A: "DD/MM/YYYY HH:MM - Nome Autor"  (início de nova mensagem)
      const patternA = /^(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)\s*[-–]\s*(.{2,80})$/;
      // Formato B: "Tipo - DD/MM/YYYY - HH:MM:SS"  (ex: "Mensagem inicial - 11/03/2026 - 19:42:07")
      const patternB = /^(.{2,60})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}:\d{2}(?::\d{2})?)$/;

      type Block = { occurredAt: string; author: string; contentLines: string[] };
      const blocks: Block[] = [];
      let pendingAuthor = '';
      let cur: Block | null = null;

      for (const line of lines) {
        // Formato B: "Label - DD/MM/YYYY - HH:MM:SS"
        const mb = line.match(patternB);
        if (mb) {
          if (cur) blocks.push(cur);
          cur = {
            occurredAt: `${mb[2]} ${mb[3]}`,
            author: pendingAuthor || mb[1].trim(),
            contentLines: [],
          };
          pendingAuthor = '';
          continue;
        }

        // Formato A: "DD/MM/YYYY HH:MM - Autor"
        const ma = line.match(patternA);
        if (ma) {
          if (cur) blocks.push(cur);
          cur = {
            occurredAt: ma[1].trim(),
            author: ma[2].trim(),
            contentLines: [],
          };
          pendingAuthor = '';
          continue;
        }

        if (cur) {
          cur.contentLines.push(line);
        } else if (line.length >= 3 && line.length <= 80 && !/^\d/.test(line)) {
          // Pode ser o nome do autor antes do primeiro bloco
          pendingAuthor = line;
        }
      }
      if (cur) blocks.push(cur);

      for (const b of blocks) {
        const content = b.contentLines.join('\n').trim();
        if (!content && !b.author) continue;
        const isOurs = /rockfeller|nathan|wade|equipe|suporte|staff|admin|interno|atend/i.test(b.author);
        results.push({
          content: content || '—',
          author: b.author,
          occurredAt: b.occurredAt,
          isOurs,
        });
      }

      return results;
    });

    if (updates.length > 0) {
      log.info(`  [${externalId}] ${updates.length} msgs parseadas`);
    }
    return { updates };
  } catch (err) {
    log.warn(`Detalhe ${externalId}: ${(err as Error).message}`);
    return {};
  }
}

// -------------------------------------------------------
// Enriquece um lote de tickets com dados da página de detalhe.
// Abre browser próprio para não interferir na coleta principal.
// -------------------------------------------------------
export async function enrichTicketsInBatch(
  externalIds: string[],
): Promise<Map<string, { author?: string; content?: string; occurredAt?: string; isOurs?: boolean }[]>> {
  type MsgEntry = { author?: string; content?: string; occurredAt?: string; isOurs?: boolean };
  const results = new Map<string, MsgEntry[]>();
  if (externalIds.length === 0) return results;

  const browser = await chromium.launch({ headless: HEADLESS });
  const context  = await browser.newContext({
    locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  });

  try {
    const { login: loginFn } = await import('./auth');
    let page = await loginFn(context);

    for (const id of externalIds) {
      const detail = await enrichTicketDetail(page, id);
      if (detail.updates && detail.updates.length > 0) {
        results.set(id, detail.updates as never);
        log.info(`  Enriquecido ${id}: ${detail.updates.length} mensagens`);
      }
    }
  } catch (err) {
    log.warn(`enrichTicketsInBatch: ${(err as Error).message}`);
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return results;
}

// -------------------------------------------------------
// ENTRADA PRINCIPAL
// -------------------------------------------------------
export async function collectAllTickets(): Promise<ScraperResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  let tickets: RawTicket[] = [];
  let pagesScraped = 0;

  const browser = await chromium.launch({ headless: HEADLESS });
  const context  = await browser.newContext({
    acceptDownloads: true,
    locale: 'pt-BR',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
  });
  let page: Page | null = null;

  try {
    page = await login(context);

    // Tenta XLSX primeiro (método mais confiável — todos os tickets em 1 request)
    const xlsxTickets = await collectViaXlsx(page);
    if (xlsxTickets && xlsxTickets.length > 0) {
      // Enriquece com STATUS RESP. + ID numérico da listagem HTML
      // (o XLSX só tem o número formatado, não o ID interno do dfranquias)
      const statusMap = await collectStatusRespMap(page, context);
      tickets = xlsxTickets.map((t) => {
        const entry = statusMap.get(t.number ?? '');
        return {
          ...t,
          // Substitui externalId pelo ID numérico real (usado na URL do dfranquias)
          externalId:     entry?.numericId || t.externalId,
          statusResponse: entry?.statusResp || undefined,
        };
      });
      pagesScraped = 1;
      log.info(`XLSX+HTML: ${tickets.length} tickets enriquecidos, ${statusMap.size} IDs mapeados`);
    } else {
      tickets = await collectViaListScraping(page, context);
      pagesScraped = MAX_PAGES;
      log.info(`Scraping: ${tickets.length} tickets`);
    }
  } catch (err) {
    const msg = (err as Error).message;
    errors.push(msg);
    log.error(`Coleta falhou: ${msg}`);
  } finally {
    await page?.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  return { tickets, totalFound: tickets.length, pagesScraped, errors, durationMs: Date.now() - startedAt };
}
