import { query } from '../lib/db';

export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente';
export type Complexidade = 'baixa' | 'media' | 'alta';

export interface AtendimentoClassificacao {
  conversationId: number;
  prioridade: Prioridade | null;
  complexidade: Complexidade | null;
  updatedById?: number | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
}

interface DbRow {
  chatwoot_conversation_id: number;
  prioridade: Prioridade | null;
  complexidade: Complexidade | null;
  updated_by_id: number | null;
  updated_by_name: string | null;
  updated_at: string | null;
}

function rowToModel(row: DbRow): AtendimentoClassificacao {
  return {
    conversationId: Number(row.chatwoot_conversation_id),
    prioridade: row.prioridade ?? null,
    complexidade: row.complexidade ?? null,
    updatedById: row.updated_by_id ?? null,
    updatedByName: row.updated_by_name ?? null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  };
}

/**
 * Busca classificação (prioridade e complexidade) para uma lista de conversas.
 */
export async function getClassifications(conversationIds: number[]): Promise<Map<number, AtendimentoClassificacao>> {
  const ids = [...new Set(conversationIds.filter(Number.isFinite))];
  const map = new Map<number, AtendimentoClassificacao>();
  if (ids.length === 0) return map;

  try {
    const rows = await query<DbRow>(
      `SELECT chatwoot_conversation_id, prioridade, complexidade, updated_by_id, updated_by_name, updated_at
         FROM atendimento_classificacao
        WHERE chatwoot_conversation_id = ANY($1::int[])`,
      [ids]
    );

    for (const r of rows) {
      map.set(Number(r.chatwoot_conversation_id), rowToModel(r));
    }
  } catch (err) {
    console.error('Erro ao buscar classificações:', err);
  }

  return map;
}

/**
 * Busca classificação de uma conversa específica.
 */
export async function getClassification(conversationId: number): Promise<AtendimentoClassificacao | null> {
  if (!Number.isFinite(conversationId)) return null;

  try {
    const rows = await query<DbRow>(
      `SELECT chatwoot_conversation_id, prioridade, complexidade, updated_by_id, updated_by_name, updated_at
         FROM atendimento_classificacao
        WHERE chatwoot_conversation_id = $1`,
      [conversationId]
    );

    return rows.length > 0 ? rowToModel(rows[0]) : null;
  } catch (err) {
    console.error(`Erro ao buscar classificação da conversa ${conversationId}:`, err);
    return null;
  }
}

/**
 * Salva ou atualiza a classificação (prioridade e/ou complexidade) de uma conversa.
 */
export async function upsertClassification(
  conversationId: number,
  data: {
    prioridade?: Prioridade | null;
    complexidade?: Complexidade | null;
  },
  user?: { id?: number; name?: string }
): Promise<AtendimentoClassificacao> {
  const hasPrio = 'prioridade' in data;
  const hasComp = 'complexidade' in data;

  const rows = await query<DbRow>(
    `INSERT INTO atendimento_classificacao (
       chatwoot_conversation_id,
       prioridade,
       complexidade,
       updated_by_id,
       updated_by_name,
       updated_at
     )
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (chatwoot_conversation_id) DO UPDATE
       SET prioridade      = CASE WHEN $6::boolean THEN $2 ELSE atendimento_classificacao.prioridade END,
           complexidade    = CASE WHEN $7::boolean THEN $3 ELSE atendimento_classificacao.complexidade END,
           updated_by_id   = $4,
           updated_by_name = $5,
           updated_at      = NOW()
     RETURNING chatwoot_conversation_id, prioridade, complexidade, updated_by_id, updated_by_name, updated_at`,
    [
      conversationId,
      data.prioridade ?? null,
      data.complexidade ?? null,
      user?.id ?? null,
      user?.name ?? null,
      hasPrio,
      hasComp,
    ]
  );

  return rowToModel(rows[0]);
}
