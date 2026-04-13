/**
 * Classificador de categoria prioritária
 *
 * Estratégia (em camadas):
 *  1. Matching por palavras-chave configuradas (saf_categories.keywords)
 *  2. Matching por campo "service" do ticket
 *  3. Fallback: 'outros'
 *
 * Para melhorar a classificação com IA:
 *  - Ative OPENAI_API_KEY e o classificador usará embeddings/few-shot
 */

import { RawTicket, PriorityCategory } from '../lib/types';

// -------------------------------------------------------
// Mapa estático de palavras-chave por categoria
// (espelha saf_categories no banco — atualize ambos)
// -------------------------------------------------------
const CATEGORY_KEYWORDS: Record<PriorityCategory, string[]> = {
  dsa_joy: [
    // Nomes do produto
    'dsa', 'joy', 'dsa joy', 'dsajoy',
    // Serviços reais do dfranquias
    'cadastro de turmas', 'sugestoes de melhorias joy', 'sugestões de melhorias joy',
  ],
  myrock: [
    // Nomes do produto
    'myrock', 'my rock', 'rock', 'my-rock',
    // Serviços reais do dfranquias
    'my rock adm', 'my rock lms', 'my rock problemas no acesso',
    'my rock aluno presencial', 'my rock assuntos diversos',
    'my rock correcao', 'my rock correcção', 'my rock bring it out',
    'rock spot', 'myrock situacao no acesso', 'myrock situação no acesso',
  ],
  plataformas_aulas: [
    // Palavras genéricas
    'plataforma', 'plataformas', 'aula', 'aulas', 'lms', 'ead',
    'curso', 'cursos', 'ensino', 'aprendizado', 'e-learning',
    'google classroom', 'moodle', 'canvas',
    // Serviços reais do dfranquias
    'duo', 'plataforma offline', 'plataforma online',
    'cursos regulares', 'ondemand', 'on demand',
    'situacao em plataforma', 'situação em plataforma',
    'feedback de conteudo', 'feedback de conteúdo',
    'curadoria de livros', 'cancelamento de pedidos',
  ],
  suporte_emails: [
    'email', 'e-mail', 'emails', 'e-mails', 'smtp', 'imap',
    'caixa de entrada', 'outlook', 'gmail', 'webmail',
    'dominio de email', 'domínio de email', 'configurar email', 'email bounce',
  ],
  outros: [],
  nao_classificado: [],
};

// -------------------------------------------------------
// Mapeamento direto: valor normalizado do campo "Departamento"
// do dfranquias → categoria. Tem precedência sobre keywords.
// -------------------------------------------------------
const DEPARTMENT_CATEGORY_MAP: Record<string, PriorityCategory> = {
  // DSA JOY
  'dsa joy':              'dsa_joy',
  'dsa-joy':              'dsa_joy',
  'dsajoy':               'dsa_joy',
  'dsa':                  'dsa_joy',
  // MyRock
  'myrock':               'myrock',
  'my rock':              'myrock',
  'my-rock':              'myrock',
  // Plataformas de Aulas
  'plataformas de aulas': 'plataformas_aulas',
  'plataformas aulas':    'plataformas_aulas',
  'plataforma de aulas':  'plataformas_aulas',
  'plataforma aulas':     'plataformas_aulas',
  // Suporte E-mails
  'suporte e-mails':      'suporte_emails',
  'suporte emails':       'suporte_emails',
  'suporte e mails':      'suporte_emails',
  'e-mails':              'suporte_emails',
  'emails':               'suporte_emails',
};

// Pré-processa: constrói Set de termos por categoria para O(1) lookup
const CATEGORY_SETS = Object.entries(CATEGORY_KEYWORDS).reduce(
  (acc, [cat, kws]) => {
    acc[cat as PriorityCategory] = new Set(kws.map((k) => k.toLowerCase()));
    return acc;
  },
  {} as Record<PriorityCategory, Set<string>>
);

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-z0-9\s-]/g, ' ')   // só letras, números, espaços e hífens
    .trim();
}

function matchesCategory(haystack: string, category: PriorityCategory): boolean {
  const terms = CATEGORY_SETS[category];
  const normalized = normalizeText(haystack);

  for (const term of terms) {
    if (normalized.includes(term)) return true;
  }
  return false;
}

/**
 * Classifica um ticket bruto na categoria prioritária.
 *
 * Prioridade:
 *  1. Mapeamento direto pelo campo "Departamento" (fonte de verdade do dfranquias)
 *  2. Keyword matching no corpus de texto (título, serviço, descrição, updates)
 */
export function classifyCategory(raw: RawTicket): PriorityCategory {
  // 1. Mapeamento direto pelo departamento — mais confiável e à prova de mudança de nomes de serviços
  if (raw.department) {
    const normalizedDept = normalizeText(raw.department);
    const directMatch = DEPARTMENT_CATEGORY_MAP[normalizedDept];
    if (directMatch) return directMatch;
  }

  // 2. Fallback: keyword matching no corpus completo
  const corpus = [
    raw.title ?? '',
    raw.service ?? '',
    raw.department ?? '',
    raw.description ?? '',
    ...(raw.updates?.map((u) => u.content ?? '') ?? []),
  ]
    .filter(Boolean)
    .join(' ');

  // Ordem de prioridade de checagem (as mais específicas primeiro)
  const order: PriorityCategory[] = [
    'dsa_joy',
    'myrock',
    'suporte_emails',
    'plataformas_aulas',
  ];

  for (const cat of order) {
    if (matchesCategory(corpus, cat)) return cat;
  }

  // Se tem texto mas não encaixou, vai para "outros"
  if (corpus.trim().length > 0) return 'outros';

  return 'nao_classificado';
}

// -------------------------------------------------------
// Classificação assistida por IA (OpenAI) — opcional
// Ativada quando OPENAI_API_KEY está presente
// -------------------------------------------------------
let openaiClient: unknown = null;

async function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) return null;
  if (!openaiClient) {
    const { default: OpenAI } = await import('openai');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient as import('openai').default;
}

export async function classifyCategoryWithAI(raw: RawTicket): Promise<PriorityCategory> {
  // Primeiro tenta classificação local (mais rápida)
  const localResult = classifyCategory(raw);
  if (localResult !== 'nao_classificado' && localResult !== 'outros') return localResult;

  const ai = await getOpenAI();
  if (!ai) return localResult;

  try {
    const prompt = `Classifique este ticket de suporte em uma das categorias abaixo.
Responda SOMENTE com o slug da categoria, sem explicação.

Categorias:
- dsa_joy       → relacionado ao produto DSA JOY
- myrock        → relacionado ao produto MyRock
- plataformas_aulas → plataformas de aulas, LMS, EAD, cursos online
- suporte_emails → problemas com email, SMTP, caixa de entrada
- outros        → qualquer outro assunto
- nao_classificado → sem informação suficiente

Ticket:
Título: ${raw.title}
Serviço: ${raw.service ?? ''}
Descrição: ${(raw.description ?? '').slice(0, 300)}`;

    const response = await (ai as import('openai').default).chat.completions.create({
      model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 20,
      temperature: 0,
    });

    const answer = response.choices[0]?.message?.content?.trim().toLowerCase() as PriorityCategory;
    const valid: PriorityCategory[] = ['dsa_joy', 'myrock', 'plataformas_aulas', 'suporte_emails', 'outros', 'nao_classificado'];
    return valid.includes(answer) ? answer : localResult;
  } catch {
    return localResult;
  }
}
