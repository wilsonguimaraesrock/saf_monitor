/**
 * Módulo de autenticação — faz login no sistema dfranquias
 * e mantém a sessão ativa durante a coleta.
 *
 * Estratégia resiliente:
 *  1. Tenta login via form padrão
 *  2. Detecta redirecionamento pós-login
 *  3. Valida que a sessão está ativa antes de scraping
 *  4. Captura screenshot em caso de erro
 */

import { Page, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('auth');

const BASE_URL = process.env.SAF_BASE_URL ?? 'https://app.dfranquias.com.br';
const LOGIN_URL = process.env.SAF_LOGIN_URL ?? `${BASE_URL}/login`;
const SAF_LIST_URL = process.env.SAF_LIST_URL ?? `${BASE_URL}/saf/`;
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR ?? path.join(process.cwd(), 'logs', 'screenshots');
const TIMEOUT = Number(process.env.PLAYWRIGHT_TIMEOUT_MS ?? 30_000);

// Garante diretório de screenshots
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function saveErrorScreenshot(page: Page, label: string): Promise<void> {
  if (process.env.PLAYWRIGHT_SCREENSHOT_ON_ERROR !== 'false') {
    const file = path.join(SCREENSHOT_DIR, `${label}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    log.warn(`Screenshot salvo: ${file}`);
  }
}

/**
 * Realiza login e retorna a página já autenticada.
 * Lança erro descritivo em caso de falha.
 */
export async function login(context: BrowserContext): Promise<Page> {
  const username = process.env.SAF_USERNAME;
  const password = process.env.SAF_PASSWORD;

  if (!username || !password) {
    throw new Error('Credenciais SAF não configuradas. Defina SAF_USERNAME e SAF_PASSWORD no .env.local');
  }

  const page = await context.newPage();
  page.setDefaultTimeout(TIMEOUT);

  log.info(`Acessando login: ${LOGIN_URL}`);

  try {
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Aguarda formulário de login
    await page.waitForSelector('input[type="text"], input[type="email"], input[name="username"], input[name="email"]', {
      timeout: TIMEOUT,
    });

    // Preenche usuário — tenta seletores comuns
    const userField =
      (await page.$('input[name="username"]')) ??
      (await page.$('input[name="email"]')) ??
      (await page.$('input[type="email"]')) ??
      (await page.$('input[type="text"]'));

    if (!userField) {
      await saveErrorScreenshot(page, 'login-no-user-field');
      throw new Error('Campo de usuário não encontrado na página de login');
    }
    await userField.fill(username);

    // Preenche senha
    const passField = await page.$('input[type="password"]');
    if (!passField) {
      await saveErrorScreenshot(page, 'login-no-pass-field');
      throw new Error('Campo de senha não encontrado na página de login');
    }
    await passField.fill(password);

    // Clica no botão de login
    const submitBtn =
      (await page.$('button[type="submit"]')) ??
      (await page.$('input[type="submit"]')) ??
      (await page.$('button:has-text("Entrar")')) ??
      (await page.$('button:has-text("Login")')) ??
      (await page.$('button:has-text("Acessar")'));

    if (!submitBtn) {
      await saveErrorScreenshot(page, 'login-no-submit');
      throw new Error('Botão de submit não encontrado na página de login');
    }

    // Aguarda navegação pós-clique
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT }),
      submitBtn.click(),
    ]);

    // Verifica se ainda está na página de login (credenciais erradas)
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
      const errorMsg = await page.$eval(
        '.alert-danger, .error-message, [class*="error"], [class*="alert"]',
        (el) => el.textContent?.trim()
      ).catch(() => null);

      await saveErrorScreenshot(page, 'login-failed');
      throw new Error(`Login falhou. Mensagem do site: ${errorMsg ?? 'sem mensagem de erro visível'}`);
    }

    log.info(`Login bem-sucedido. URL atual: ${currentUrl}`);
    return page;
  } catch (err) {
    await saveErrorScreenshot(page, 'login-exception');
    await page.close().catch(() => {});
    throw err;
  }
}

/**
 * Verifica se a sessão ainda está ativa.
 * Navega para a URL da lista de SAFs e checa se há redirecionamento para login.
 */
export async function isSessionActive(page: Page): Promise<boolean> {
  try {
    await page.goto(SAF_LIST_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
    const url = page.url();
    const active = !url.includes('/login') && !url.includes('/signin');
    if (!active) log.warn('Sessão expirada — redirecionou para login');
    return active;
  } catch {
    return false;
  }
}

/**
 * Renova a sessão: faz login novamente se necessário.
 */
export async function ensureSession(context: BrowserContext, page: Page): Promise<Page> {
  const active = await isSessionActive(page);
  if (!active) {
    log.info('Renovando sessão...');
    await page.close().catch(() => {});
    return login(context);
  }
  return page;
}
