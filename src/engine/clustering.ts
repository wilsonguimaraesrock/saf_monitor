/**
 * Agrupamento de tickets por assunto semelhante
 *
 * Estratégia em duas camadas:
 *  1. TF-IDF simples com palavras-chave extraídas dos títulos
 *  2. Opcional: embeddings OpenAI para clustering semântico
 *
 * Salva/atualiza saf_clusters no banco.
 * Detecta spikes (aumento anormal de volume em um cluster).
 */

import { query, execute, withTransaction } from '../lib/db';
import { createChildLogger } from '../lib/logger';

const log = createChildLogger('clustering');

// Stop words em português e inglês
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

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
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

/**
 * Agrupa todos os tickets abertos por similaridade de título.
 * Cria/atualiza clusters no banco e detecta spikes.
 */
export async function clusterTickets(): Promise<void> {
  log.info('Iniciando clustering de tickets...');

  // Busca todos os tickets abertos
  const tickets = await query<{ id: string; title: string; description: string | null; cluster_id: string | null }>(
    `SELECT id, title, description, cluster_id
     FROM saf_tickets
     WHERE status NOT IN ('resolvido','cancelado')`
  );

  if (tickets.length === 0) {
    log.info('Nenhum ticket aberto para agrupar');
    return;
  }

  // Gera tokens por ticket
  const tokenized = tickets.map((t) => ({
    id: t.id,
    tokens: tokenize(`${t.title} ${t.description ?? ''}`),
  }));

  // Monta vocabulário global e IDF
  const docFreq: Record<string, number> = {};
  for (const { tokens } of tokenized) {
    for (const term of new Set(tokens)) {
      docFreq[term] = (docFreq[term] ?? 0) + 1;
    }
  }

  const N = tokenized.length;
  const idf = (term: string) => Math.log(N / (1 + (docFreq[term] ?? 0)));

  // TF-IDF por ticket
  const tfidf = tokenized.map(({ id, tokens }) => {
    const tf = buildTermFrequency(tokens);
    const scores: Record<string, number> = {};
    for (const [term, freq] of Object.entries(tf)) {
      scores[term] = (freq / tokens.length) * idf(term);
    }
    return { id, scores };
  });

  // Agrupa por top-1 termo TF-IDF (heurística simples)
  const groups: Record<string, string[]> = {};
  for (const { id, scores } of tfidf) {
    const topTerm = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'outros';
    if (!groups[topTerm]) groups[topTerm] = [];
    groups[topTerm].push(id);
  }

  const SPIKE_THRESHOLD = 5;

  await withTransaction(async (client) => {
    // Limpa clusters antigos
    await client.query('DELETE FROM saf_clusters');

    for (const [term, ids] of Object.entries(groups)) {
      if (ids.length === 0) continue;

      // Calcula top keywords do grupo
      const allTokens: string[] = [];
      for (const { id, scores } of tfidf.filter((t) => ids.includes(t.id))) {
        allTokens.push(...Object.keys(scores));
      }
      const keywords = topTerms(buildTermFrequency(allTokens), 8);

      const isSpike = ids.length >= SPIKE_THRESHOLD;
      const label = keywords.slice(0, 3).join(' / ') || term;

      const result = await client.query<{ id: string }>(
        `INSERT INTO saf_clusters (label, keywords, ticket_count, is_spike, spike_threshold)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [label, keywords, ids.length, isSpike, SPIKE_THRESHOLD]
      );

      const clusterId = result.rows[0]?.id;
      if (clusterId) {
        await client.query(
          `UPDATE saf_tickets SET cluster_id = $1 WHERE id = ANY($2::uuid[])`,
          [clusterId, ids]
        );
      }
    }
  });

  log.info(`Clustering concluído: ${Object.keys(groups).length} clusters`);
}
