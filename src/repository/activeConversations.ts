import { query } from '../lib/db';

export type ConversationOrigin = 'ativo' | 'receptivo';

/**
 * Conversas iniciadas pelo SAF Monitor ficam registradas na auditoria local.
 * O Chatwoot não diferencia de forma confiável a origem no payload da listagem,
 * então o id gravado no handoff é a fonte de verdade para o backlog.
 */
export async function getActiveConversationIds(conversationIds: number[]): Promise<Set<number>> {
  const ids = [...new Set(conversationIds.filter(Number.isFinite))];
  if (ids.length === 0) return new Set();

  const rows = await query<{ chatwoot_conversation_id: number }>(
    `SELECT chatwoot_conversation_id
       FROM conversas_ativas
      WHERE chatwoot_conversation_id = ANY($1::int[])`,
    [ids]
  );

  return new Set(rows.map((row) => Number(row.chatwoot_conversation_id)));
}
