/**
 * Script de inspeção: mapeia os formulários e endpoints do dfranquias
 * para implementar reply e mudança de status via API.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/inspect-dfranquias-forms.ts [saf_id]
 *
 * Exemplo:
 *   npx tsx --env-file=.env.local scripts/inspect-dfranquias-forms.ts 263534
 */

import { chromium } from 'playwright';
import { login } from '../src/scraper/auth';

const BASE_URL = process.env.SAF_BASE_URL ?? 'https://app.dfranquias.com.br';
const SAF_ID   = process.argv[2] ?? '';

if (!SAF_ID) {
  console.error('❌  Passe o ID numérico do SAF como argumento.');
  console.error('    Exemplo: npx tsx --env-file=.env.local scripts/inspect-dfranquias-forms.ts 263534');
  process.exit(1);
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context  = await browser.newContext({ locale: 'pt-BR' });

  try {
    const page = await login(context);

    const url = `${BASE_URL}/saf/${SAF_ID}/show`;
    console.log(`\n🔍  Navegando para: ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // 1. CSRF token
    const csrfToken = await page.$eval(
      'meta[name="csrf-token"]',
      (el) => el.getAttribute('content') ?? '(não encontrado)'
    ).catch(() => '(meta csrf-token não encontrada)');
    console.log(`\n🔐  CSRF token: ${csrfToken.slice(0, 30)}...`);

    // 2. Cookies de sessão
    const cookies = await context.cookies();
    const sessionCookies = cookies.filter(
      (c) => c.domain.includes('dfranquias') || c.domain.includes('easypanel')
    );
    console.log('\n🍪  Cookies de sessão:');
    sessionCookies.forEach((c) => console.log(`    ${c.name}=${c.value.slice(0, 20)}... (domain: ${c.domain})`));

    // 3. Todos os formulários na página
    const forms = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('form')).map((form) => {
        const inputs = Array.from(form.querySelectorAll('input, textarea, select')).map((el) => ({
          tag:   el.tagName.toLowerCase(),
          type:  (el as HTMLInputElement).type ?? '',
          name:  (el as HTMLInputElement).name ?? '',
          value: (el as HTMLInputElement).value?.slice(0, 50) ?? '',
        }));
        return {
          action:  form.action ?? form.getAttribute('action') ?? '',
          method:  form.method ?? form.getAttribute('method') ?? '',
          id:      form.id ?? '',
          classes: form.className ?? '',
          inputs,
        };
      });
    });

    console.log(`\n📋  ${forms.length} formulário(s) encontrado(s):\n`);
    forms.forEach((form, i) => {
      console.log(`  ── Formulário ${i + 1} ──`);
      console.log(`     action : ${form.action}`);
      console.log(`     method : ${form.method}`);
      console.log(`     id     : ${form.id || '(sem id)'}`);
      console.log(`     class  : ${form.classes.slice(0, 60) || '(sem class)'}`);
      console.log(`     inputs :`);
      form.inputs.forEach((inp) => {
        const val = inp.type === 'hidden' ? ` = "${inp.value}"` : '';
        console.log(`       [${inp.tag}] type="${inp.type}" name="${inp.name}"${val}`);
      });
      console.log('');
    });

    // 4. Links/botões de ação (status change)
    const actionLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href*="saf"], button[data-url], a[data-method]'))
        .map((el) => ({
          text:   el.textContent?.trim().slice(0, 60) ?? '',
          href:   (el as HTMLAnchorElement).href ?? '',
          method: el.getAttribute('data-method') ?? '',
        }))
        .filter((l) => l.href || l.method);
    });

    console.log(`🔗  Links/botões de ação relevantes:\n`);
    actionLinks.forEach((link) => {
      console.log(`    [${link.method || 'GET'}] "${link.text}" → ${link.href}`);
    });

    // 5. Dump do HTML da área de comentários/histórico
    const commentAreaHtml = await page.$eval(
      'form, [class*="comment"], [class*="reply"], [class*="message"], [class*="update"]',
      (el) => el.outerHTML.slice(0, 2000)
    ).catch(() => '(não encontrado)');

    console.log('\n📄  HTML da área de comentários/reply (primeiros 2000 chars):');
    console.log(commentAreaHtml);

  } finally {
    console.log('\n✅  Inspeção concluída. Fechando browser em 5s...');
    await new Promise((r) => setTimeout(r, 5000));
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}

main().catch((err) => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
