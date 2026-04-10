/**
 * Agrupamento de tickets por assunto semelhante
 *
 * Estratégia em duas camadas:
 *  1. Tópicos fixos (PINNED_TOPICS): temas recorrentes conhecidos com
 *     label legível e palavras-chave definidas manualmente. Têm prioridade.
 *  2. TF-IDF para os tickets restantes não capturados pelos tópicos fixos.
 *
 * Salva/atualiza saf_clusters no banco e detecta spikes.
 */

import { query, execute, withTransaction } from '../lib/db';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('clustering');

// -------------------------------------------------------
// Tópicos fixos — temas recorrentes conhecidos
// Adicione aqui qualquer assunto que aparece com frequência
// e precisa de um label legível no painel.
// -------------------------------------------------------
const PINNED_TOPICS: { label: string; keywords: string[] }[] = [
  {
    label: 'Relatório de Menores',
    keywords: [
      'menor', 'menores', 'relatorio de menor', 'relatório de menor',
      'autorização', 'autorizacao', 'responsável', 'responsavel',
      'tutela', 'adolescente', 'criança', 'crianca', 'proteção',
      'protecao', 'guardião', 'guardiao', 'menor de idade',
    ],
  },
  {
    label: 'Acesso / Login',
    keywords: [
      'acesso', 'login', 'senha', 'password', 'entrar', 'autenticação',
      'autenticacao', 'bloqueado', 'não consigo acessar', 'nao consigo acessar',
      'redefinir senha', 'recuperar senha', 'esqueci senha',
    ],
  },
  {
    label: 'Notas Fiscais / Financeiro',
    keywords: [
      'nota fiscal', 'nf', 'nfe', 'fatura', 'financeiro', 'cobrança',
      'cobranca', 'boleto', 'pagamento', 'reembolso', 'mensalidade',
    ],
  },
  {
    label: 'Erro / Bug no Sistema',
    keywords: [
      'erro', 'bug', 'falha', 'não funciona', 'nao funciona', 'travando',
      'travado', 'instável', 'instavel', 'lento', 'sistema fora', 'indisponível',
      'indisponivel', 'tela branca', 'não carrega', 'nao carrega',
    ],
  },
  {
    label: 'Certificado / Diploma',
    keywords: [
      'certificado', 'diploma', 'conclusão', 'conclusao', 'certificação',
      'certificacao', 'aprovação', 'aprovacao', 'histórico',
    ],
  },
];

// -------------------------------------------------------
// Stop words
// -------------------------------------------------------
const STOP_WORDS = new Set([
  'de','a','o','que','e','do','da','em','um','para','com','uma','os','no','se',
  'na','por','mais','as','dos','como','mas','foi','ao','ele','das','tem','à',
  'seu','sua','ou','ser','quando','muito','há','nos','já','está','eu','também',
  'só','pelo','pela','até','isso','ela','entre','era','depois','sem','mesmo',
  'aos','seus','quem','nas','me','esse','eles','estão','você','tinha','were',
  'the','of','and','a','to','in','is','it','you','that','he','was','for','on',
  'are','with','his','they','i','at','be','this','have','from','or','one',
  'had','by','word','but','not','what','all','were','we','when','your','can',
]);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

function buildTermFrequency(tokens: string[]): Record<string, number> {
  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] ?? 0) + 1;
  return freq;
}

function topTerms(freq: Record<string, number>, n = 5): string[] {
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([term]) => term);
}

/** Verifica se o texto do ticket bate com um tópico fixo */
function matchesPinned(text: string, topic: typeof PINNED_TOPICS[0]): boolean {
  const normalized = normalizeText(text);
  return topic.keywords.some((kw) => normalized.includes(normalizeText(kw)));
}

/**
 * Agrupa tickets abertos das categorias do escopo por similaridade.
 * Tópicos fixos têm prioridade; o restante vai para TF-IDF.
 */
export async function clusterTickets(): Promise<void> {
  log.info('Iniciando clustering de tickets...');

  // Apenas tickets do escopo
  const tickets = await query<{
    id: string; title: string; description: string | null; cluster_id: string | null;
  }>(
    `SELECT id, title, description, cluster_id
     FROM saf_tickets
     WHERE status NOT IN ('resolvido','cancelado')
       AND priority_category IN ('dsa_joy','myrock','plataformas_aulas','suporte_emails')`
  );

  if (tickets.length === 0) {
    log.info('Nenhum ticket aberto para agrupar');
    return;
  }

  // ── Etapa 1: tópicos fixos ──────────────────────────────
  const assignedIds = new Set<string>();
  const pinnedGroups: { label: string; keywords: string[]; ids: string[] }[] = [];

  for (const topic of PINNED_TOPICS) {
    const matched = tickets.filter((t) => {
      const corpus = `${t.title} ${t.description ?? ''}`;
      return matchesPinned(corpus, topic);
    });
    if (matched.length > 0) {
      pinnedGroups.push({ ...topic, ids: matched.map((t) => t.id) });
      matched.forEach((t) => assignedIds.add(t.id));
    }
  }

  // ── Etapa 2: TF-IDF para os restantes ──────────────────
  const remaining = tickets.filter((t) => !assignedIds.has(t.id));
  const tfidfGroups: { label: string; keywords: string[]; ids: string[] }[] = [];

  if (remaining.length > 0) {
    const tokenized = remaining.map((t) => ({
      id: t.id,
      tokens: tokenize(`${t.title} ${t.description ?? ''}`),
    }));

    const docFreq: Record<string, number> = {};
    for (const { tokens } of tokenized) {
      for (const term of new Set(tokens)) {
        docFreq[term] = (docFreq[term] ?? 0) + 1;
      }
    }

    const N = tokenized.length;
    const idf = (term: string) => Math.log(N / (1 + (docFreq[term] ?? 0)));

    const tfidf = tokenized.map(({ id, tokens }) => {
      const tf = buildTermFrequency(tokens);
      const scores: Record<string, number> = {};
      for (const [term, freq] of Object.entries(tf)) {
        scores[term] = (freq / tokens.length) * idf(term);
      }
      return { id, scores };
    });

    const groups: Record<string, string[]> = {};
    for (const { id, scores } of tfidf) {
      const topTerm = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'outros';
      if (!groups[topTerm]) groups[topTerm] = [];
      groups[topTerm].push(id);
    }

    for (const [term, ids] of Object.entries(groups)) {
      if (ids.length === 0) continue;
      const allTokens: string[] = [];
      for (const { scores } of tfidf.filter((t) => ids.includes(t.id))) {
        allTokens.push(...Object.keys(scores));
      }
      const keywords = topTerms(buildTermFrequency(allTokens), 8);
      const label = keywords.slice(0, 3).join(' / ') || term;
      tfidfGroups.push({ label, keywords, ids });
    }
  }

  // ── Persiste no banco ───────────────────────────────────
  const SPIKE_THRESHOLD = 5;
  const allGroups = [...pinnedGroups, ...tfidfGroups];

  await withTransaction(async (client) => {
    await client.query('DELETE FROM saf_clusters');

    for (const group of allGroups) {
      const isSpike = group.ids.length >= SPIKE_THRESHOLD;

      const result = await client.query<{ id: string }>(
        `INSERT INTO saf_clusters (label, keywords, ticket_count, is_spike, spike_threshold)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [group.label, group.keywords, group.ids.length, isSpike, SPIKE_THRESHOLD]
      );

      const clusterId = result.rows[0]?.id;
      if (clusterId) {
        await client.query(
          `UPDATE saf_tickets SET cluster_id = $1 WHERE id = ANY($2::uuid[])`,
          [clusterId, group.ids]
        );
      }
    }
  });

  const pinnedCount = pinnedGroups.reduce((s, g) => s + g.ids.length, 0);
  log.info(
    `Clustering concluído: ${allGroups.length} clusters ` +
    `(${pinnedGroups.length} fixos com ${pinnedCount} tickets, ` +
    `${tfidfGroups.length} TF-IDF com ${remaining.length - pinnedCount} tickets)`
  );
}
