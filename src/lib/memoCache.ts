/**
 * Cache em memória com deduplicação de chamadas simultâneas.
 *
 * Motivo: cada requisição a /api/chatwoot/live custa ~7 chamadas ao Chatwoot e
 * a página do setor tem DOIS componentes pedindo o mesmo dado a cada 30s
 * (SectorChatwootLiveSection e ChatwootSlaPanelLive). Sem isto, o trabalho é
 * feito duas vezes. O `inflight` também garante que N abas chegando juntas
 * gerem uma única ida ao Chatwoot em vez de N.
 *
 * O cache é por instância serverless — não substitui um cache compartilhado,
 * mas corta a maior parte da duplicação sem infraestrutura nova.
 */

interface Entry<T> {
  value: T;
  at: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function memoize<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;

  // Já existe uma busca em andamento para esta chave — aproveita a mesma.
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const promise = fn()
    .then((value) => {
      store.set(key, { value, at: Date.now() });
      return value;
    })
    .catch((err) => {
      // Falhou: se houver valor antigo, devolve como fallback em vez de
      // propagar o erro — o atendente vê dados levemente defasados no lugar
      // de uma tela quebrada quando o Chatwoot está sobrecarregado.
      const stale = store.get(key) as Entry<T> | undefined;
      if (stale) return stale.value;
      throw err;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}
