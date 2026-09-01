/**
 * Popula o cadastro de unidades/contatos a partir do CSV da franqueadora e
 * monta o dicionário de apelidos (saf_tickets.franchise → unidade).
 *
 * O CSV vive em dados-privados/ (pasta no .gitignore — contém telefones).
 * Colunas obrigatórias: uf, unidade, numero.  Opcionais: ativo, departamento.
 *
 * Uso:
 *   npx tsx scripts/seed-unidades.ts                 # simulação (não grava)
 *   npx tsx scripts/seed-unidades.ts --apply         # grava no banco
 *   npx tsx scripts/seed-unidades.ts --csv=outro.csv --apply
 *
 * Idempotente: rodar de novo atualiza os registros existentes, não duplica.
 */

import '../src/lib/env';
import fs from 'fs';
import path from 'path';
import { getPool } from '../src/lib/db';

const APPLY = process.argv.includes('--apply');
const CSV_PATH =
  process.argv.find((a) => a.startsWith('--csv='))?.slice(6) ??
  path.join(__dirname, '..', 'dados-privados', 'numeros-unidades.csv');

// ── Normalização de nome ──────────────────────────────────────
// O dfranquias escreve a mesma escola de várias formas: "Floripa - Estreito",
// "Florianópolis- Estreito", "ROCKFELLER BARREIRO". O slug remove acento,
// pontuação, a UF no fim e o prefixo institucional para todas caírem no mesmo
// lugar. Apelidos conhecidos (BC, BH, PV) entram como sinônimos.
const UFS = new Set(['ac','al','am','ap','ba','ce','df','es','go','ma','mg','ms','mt','pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to']);
const APELIDOS: Record<string, string> = {
  floripa: 'florianopolis',
  bc: 'balneario camboriu',
  bh: 'belo horizonte',
  sjp: 'sao jose dos pinhais',
  pv: 'presidente vargas',
};

function slugify(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  let partes = limpo.split(/\s+/).filter(Boolean);
  if (partes.length > 1 && UFS.has(partes[partes.length - 1])) partes = partes.slice(0, -1);
  while (partes.length > 1 && ['rockfeller', 'rock'].includes(partes[0])) partes = partes.slice(1);

  return partes.flatMap((p) => (APELIDOS[p] ?? p).split(' ')).join(' ');
}

// Unidades que fecharam. Continuam no cadastro para os tickets antigos
// resolverem, mas com status 'encerrada' — nunca aparecem no seletor de
// conversa ativa nem na lista de "faltando telefone".
const ENCERRADAS = new Set([
  'belo horizonte prado',   // ROCKFELLER BH PRADO      — último ticket 13/04/26
  'juiz de fora passos',    // Juiz de Fora - Passos    — último ticket 13/04/26
  'santa felicidade',       // Santa Felicidade (CWB)   — último ticket 28/01/26
]);

/** Semelhança 0..1 entre dois slugs (Levenshtein normalizado). Cobre grafias
 *  como "sao miguel d oeste" vs "sao miguel do oeste". */
function semelhanca(a: string, b: string): number {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (!m || !n) return 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** Último trecho depois do hífen — "Belo Horizonte - Barreiro" → "barreiro".
 *  O dfranquias às vezes usa só o bairro ("Rockfeller Barreiro"). */
function slugBairro(nome: string): string | null {
  const partes = nome.split('-').map((p) => p.trim()).filter(Boolean);
  return partes.length > 1 ? slugify(partes[partes.length - 1]) : null;
}

// ── Telefone ──────────────────────────────────────────────────
// Mesma convenção do source_id da inbox 11: só dígitos, com 55 na frente.
function normalizaTelefone(raw: string): string | null {
  let d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;              // veio sem código do país
  if (!d.startsWith('55')) return null;
  if (d.length < 12 || d.length > 13) return null; // 55 + DDD + 8 ou 9 dígitos
  return d;
}

const DDD_UF: Record<string, string> = {
  '11':'SP','12':'SP','13':'SP','14':'SP','15':'SP','16':'SP','17':'SP','18':'SP','19':'SP',
  '21':'RJ','22':'RJ','24':'RJ','27':'ES','28':'ES',
  '31':'MG','32':'MG','33':'MG','34':'MG','35':'MG','37':'MG','38':'MG',
  '41':'PR','42':'PR','43':'PR','44':'PR','45':'PR','46':'PR',
  '47':'SC','48':'SC','49':'SC','51':'RS','53':'RS','54':'RS','55':'RS',
  '61':'DF','62':'GO','63':'TO','64':'GO','65':'MT','66':'MT','67':'MS','68':'AC','69':'RO',
  '71':'BA','73':'BA','74':'BA','75':'BA','77':'BA','79':'SE',
  '81':'PE','82':'AL','83':'PB','84':'RN','85':'CE','86':'PI','87':'PE','88':'CE','89':'PI',
  '91':'PA','92':'AM','93':'PA','94':'PA','95':'RR','96':'AP','97':'AM','98':'MA','99':'MA',
};

// ── CSV ───────────────────────────────────────────────────────
interface LinhaCsv { uf: string; unidade: string; numero: string; ativo?: string; departamento?: string }

function leCsv(file: string): LinhaCsv[] {
  const texto = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const cab = linhas[0].split(',').map((c) => c.trim().toLowerCase());

  const idx = (nomes: string[]) => cab.findIndex((c) => nomes.includes(c));
  const iUf   = idx(['uf', 'estado']);
  const iUni  = idx(['unidade', 'escola', 'nome']);
  const iNum  = idx(['numero', 'número', 'telefone', 'whatsapp']);
  const iAtivo = idx(['ativo']);
  const iDep  = idx(['departamento', 'setor', 'area', 'área']);

  if (iUf < 0 || iUni < 0 || iNum < 0) {
    throw new Error(`CSV precisa das colunas uf, unidade e numero. Encontrei: ${cab.join(', ')}`);
  }

  return linhas.slice(1).map((l) => {
    // Split simples com suporte a campo entre aspas
    const cols = l.match(/("([^"]*)")|[^,]+/g)?.map((c) => c.replace(/^"|"$/g, '').trim()) ?? [];
    return {
      uf: cols[iUf] ?? '',
      unidade: cols[iUni] ?? '',
      numero: cols[iNum] ?? '',
      ativo: iAtivo >= 0 ? cols[iAtivo] : undefined,
      departamento: iDep >= 0 ? cols[iDep] : undefined,
    };
  }).filter((r) => r.unidade && r.numero);
}

// ── Seed ──────────────────────────────────────────────────────
async function main() {
  const pool = getPool();

  const linhas = leCsv(CSV_PATH);
  console.log(`CSV: ${path.basename(CSV_PATH)} — ${linhas.length} linhas`);

  // 1. Agrupa por unidade e por telefone
  type Status = 'ativa' | 'sem_numero' | 'encerrada';
  type Unidade = { nome: string; uf: string; slug: string; interna: boolean; status: Status };
  const unidades = new Map<string, Unidade>();                       // chave: slug|uf
  const porTelefone = new Map<string, { unidades: Set<string>; departamentos: Set<string> }>();
  const descartadas: string[] = [];

  for (const l of linhas) {
    if (l.ativo && !/^(t|true|1|s|sim|y|yes)$/i.test(l.ativo)) continue;

    const tel = normalizaTelefone(l.numero);
    if (!tel) { descartadas.push(`${l.unidade}: "${l.numero}"`); continue; }

    const uf = l.uf.toUpperCase().slice(0, 2);
    const slug = slugify(l.unidade);
    const chave = `${slug}|${uf}`;

    if (!unidades.has(chave)) {
      unidades.set(chave, {
        nome: l.unidade,
        uf,
        slug,
        // Não é escola: é o número da própria franqueadora
        interna: slug === 'franchising',
        status: 'ativa',
      });
    }

    const reg = porTelefone.get(tel) ?? { unidades: new Set<string>(), departamentos: new Set<string>() };
    reg.unidades.add(chave);
    if (l.departamento) reg.departamentos.add(l.departamento);
    porTelefone.set(tel, reg);
  }

  // 2. Nome do contato no Chatwoot: unidade [· departamento].
  //    Nunca o nome da pessoa — quem fala vem em custom_attributes.name a cada
  //    conversa, e os nomes atuais dos contatos são texto de mensagem.
  const nomeContato = (tel: string): string => {
    const reg = porTelefone.get(tel)!;
    const nomes = [...reg.unidades].map((c) => unidades.get(c)!.nome).sort();
    const base = nomes.join(' / ');   // mesmo franqueado com duas escolas
    const dep = [...reg.departamentos][0];
    return dep ? `${base} · ${dep}` : base;
  };

  const compartilhados = [...porTelefone.entries()].filter(([, r]) => r.unidades.size > 1);

  console.log(`\nunidades no CSV:        ${unidades.size}`);
  console.log(`telefones válidos:      ${porTelefone.size}`);
  console.log(`números compartilhados: ${compartilhados.length} (mesmo franqueado, mais de uma escola)`);
  if (descartadas.length) console.log(`números descartados:    ${descartadas.length} → ${descartadas.slice(0, 5).join(', ')}`);

  // 3. Unidades que aparecem em ticket mas não estão no CSV → status sem_numero
  const { rows: franchises } = await pool.query<{ franchise: string; n: string }>(
    `SELECT franchise, count(*)::text n FROM saf_tickets
      WHERE franchise IS NOT NULL AND franchise <> '' GROUP BY 1`
  );

  const porSlug = new Map<string, string>();      // slug → chave da unidade
  const porSlugBairro = new Map<string, string[]>();
  for (const [chave, u] of unidades) {
    porSlug.set(u.slug, chave);
    const sb = slugBairro(u.nome);
    if (sb) porSlugBairro.set(sb, [...(porSlugBairro.get(sb) ?? []), chave]);
  }

  type Alias = { alias: string; slug: string; chave: string | null; confirmado: boolean; tickets: number };
  const aliases: Alias[] = [];
  const semUnidade = new Map<string, number>();
  const encerradas = new Map<string, { nome: string; tickets: number }>();

  for (const f of franchises) {
    const slug = slugify(f.franchise);
    const tickets = Number(f.n);
    const direto = porSlug.get(slug);
    if (direto) { aliases.push({ alias: f.franchise, slug, chave: direto, confirmado: true, tickets }); continue; }

    // Unidade fechada: aponta para o registro histórico, não para uma vizinha
    // parecida — "BH Prado" não é "BH Planalto".
    if (ENCERRADAS.has(slug)) {
      aliases.push({ alias: f.franchise, slug, chave: `${slug}|--`, confirmado: true, tickets });
      encerradas.set(slug, { nome: f.franchise, tickets });
      continue;
    }

    const porBairro = porSlugBairro.get(slug);
    if (porBairro?.length === 1) {
      // "Rockfeller Barreiro" → "Belo Horizonte - Barreiro": plausível, mas
      // precisa de olho humano antes de virar destino de mensagem.
      aliases.push({ alias: f.franchise, slug, chave: porBairro[0], confirmado: false, tickets });
      continue;
    }

    // Grafia quase igual: "sao miguel d oeste" → "sao miguel do oeste"
    let melhor: { chave: string; score: number } | null = null;
    for (const [s, chave] of porSlug) {
      const score = semelhanca(slug, s);
      if (score >= 0.88 && (!melhor || score > melhor.score)) melhor = { chave, score };
    }
    if (melhor) {
      aliases.push({ alias: f.franchise, slug, chave: melhor.chave, confirmado: false, tickets });
      continue;
    }

    aliases.push({ alias: f.franchise, slug, chave: null, confirmado: false, tickets });
    semUnidade.set(slug, (semUnidade.get(slug) ?? 0) + tickets);
  }

  console.log(`\napelidos de ticket:     ${aliases.length}`);
  console.log(`  casam direto:         ${aliases.filter((a) => a.confirmado).length}`);
  console.log(`  revisar (por bairro): ${aliases.filter((a) => !a.confirmado && a.chave).length}`);
  console.log(`  sem unidade:          ${aliases.filter((a) => !a.chave).length}`);

  // Unidades sem número entram no cadastro para o ticket ter para onde apontar,
  // mas com status sem_numero: o modal vai exigir número manual.
  for (const [slug, tickets] of semUnidade) {
    const chave = `${slug}|--`;
    if (!unidades.has(chave)) {
      const alias = aliases.find((a) => a.slug === slug && !a.chave)!;
      unidades.set(chave, { nome: alias.alias, uf: '--', slug, interna: false, status: 'sem_numero' });
      console.log(`  + sem_numero: ${alias.alias} (${tickets} tickets)`);
    }
  }

  for (const [slug, info] of encerradas) {
    const chave = `${slug}|--`;
    if (!unidades.has(chave)) {
      unidades.set(chave, { nome: info.nome, uf: '--', slug, interna: false, status: 'encerrada' });
      console.log(`  + encerrada:  ${info.nome} (${info.tickets} tickets, só histórico)`);
    }
  }

  if (!APPLY) {
    console.log('\n── simulação (nada gravado). Rode com --apply para gravar. ──');
    const exemplos = [...porTelefone.keys()].slice(0, 5);
    console.log('exemplos de nome de contato:');
    for (const t of exemplos) console.log(`   ${t} → "${nomeContato(t)}"`);
    for (const [t] of compartilhados) console.log(`   ${t} → "${nomeContato(t)}"  (compartilhado)`);
    await pool.end();
    return;
  }

  // 4. Gravação
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const idUnidade = new Map<string, number>();
    for (const [chave, u] of unidades) {
      const status = u.status;
      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO unidades (nome, uf, slug, status, is_interna)
         VALUES ($1, $2, $3, $4::unidade_status, $5)
         ON CONFLICT (slug, uf) DO UPDATE
           SET nome = EXCLUDED.nome, is_interna = EXCLUDED.is_interna, updated_at = NOW()
         RETURNING id`,
        [u.nome, u.uf, u.slug, status, u.interna]
      );
      idUnidade.set(chave, rows[0].id);
    }

    for (const [tel, reg] of porTelefone) {
      const ddd = tel.slice(2, 4);
      const ufs = [...reg.unidades].map((c) => unidades.get(c)!.uf);
      const divergente = !!DDD_UF[ddd] && !ufs.includes(DDD_UF[ddd]);

      const { rows } = await client.query<{ id: number }>(
        `INSERT INTO contatos_whatsapp (telefone, nome_sugerido, ddd_divergente)
         VALUES ($1, $2, $3)
         ON CONFLICT (telefone) DO UPDATE
           SET nome_sugerido = EXCLUDED.nome_sugerido,
               ddd_divergente = EXCLUDED.ddd_divergente,
               updated_at = NOW()
         RETURNING id`,
        [tel, nomeContato(tel), divergente]
      );
      const contatoId = rows[0].id;

      for (const chave of reg.unidades) {
        await client.query(
          `INSERT INTO unidade_contatos (unidade_id, contato_id, departamento, principal)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (unidade_id, contato_id) DO UPDATE SET departamento = EXCLUDED.departamento`,
          [idUnidade.get(chave), contatoId, [...reg.departamentos][0] ?? null, reg.unidades.size === 1]
        );
      }
    }

    for (const a of aliases) {
      await client.query(
        `INSERT INTO unidade_aliases (alias, alias_slug, unidade_id, confirmado, tickets)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (alias) DO UPDATE
           SET unidade_id = COALESCE(unidade_aliases.unidade_id, EXCLUDED.unidade_id),
               tickets = EXCLUDED.tickets,
               updated_at = NOW()`,
        [a.alias, a.slug, a.chave ? idUnidade.get(a.chave) ?? null : null, a.confirmado, a.tickets]
      );
    }

    await client.query('COMMIT');
    console.log(`\n✓ gravado: ${unidades.size} unidades, ${porTelefone.size} contatos, ${aliases.length} apelidos`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
}

main().catch((err) => {
  console.error(`seed falhou: ${(err as Error).message}`);
  process.exit(1);
});
