/**
 * Fetch com timeout explícito e retry seguro para o Chatwoot.
 *
 * Contexto: o Chatwoot é auto-hospedado e, sob carga, para de aceitar conexões
 * TCP novas. O envio da resposta do atendente falhava com connect timeout (500).
 *
 * Regra central — nunca duplicar mensagem no WhatsApp do cliente:
 * para requisições NÃO idempotentes (POST de mensagem) a requisição é enviada
 * NO MÁXIMO UMA VEZ. As tentativas acontecem antes, numa sondagem TCP: enquanto
 * o servidor não aceitar conexão, nada é enviado e a sondagem é repetida. Só
 * quando o socket abre é que o POST vai. Assim é impossível gravar a mensagem
 * duas vezes, e o caso que quebrava em produção (servidor recusando conexão)
 * passa a ser absorvido pelas tentativas.
 *
 * Requisições idempotentes (GET) podem ser repetidas diretamente.
 */

import net from 'net';

/** Códigos que provam que a requisição não chegou ao servidor. */
const PRE_SEND_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', // connect timeout do undici
  'ECONNREFUSED',            // porta fechada
  'ENOTFOUND',               // DNS não resolveu
  'EAI_AGAIN',               // DNS temporariamente indisponível
  'ETIMEDOUT',               // handshake TCP não completou
  'EHOSTUNREACH',
  'ENETUNREACH',
]);

export type UpstreamOutcome =
  /** Resposta HTTP recebida (pode ser 2xx ou erro do próprio Chatwoot). */
  | { kind: 'response'; response: Response; attempts: number }
  /** Nunca chegou ao servidor — a mensagem com certeza não foi gravada. */
  | { kind: 'unreachable'; error: Error; attempts: number }
  /** Conexão abriu e caiu depois — pode ter sido gravada. Não reenviar sozinho. */
  | { kind: 'indeterminate'; error: Error; attempts: number };

function causeCode(err: unknown): string {
  const seen = new Set<unknown>();
  let node: unknown = err;
  while (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    const code = (node as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    node = (node as { cause?: unknown }).cause;
  }
  return '';
}

function isUnreachableError(err: unknown): boolean {
  return PRE_SEND_CODES.has(causeCode(err));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Abre e fecha um socket TCP para saber se o servidor está aceitando conexões.
 * É isto que distingue "sobrecarregado, não recebeu nada" de "recebeu e caiu".
 */
function probeTcp(host: string, port: number, timeoutMs: number): Promise<Error | null> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (err: Error | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(err);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(null));
    socket.once('timeout', () => done(new Error(`ETIMEDOUT ao conectar em ${host}:${port}`)));
    socket.once('error', (err) => done(err));
    socket.connect(port, host);
  });
}

export interface UpstreamFetchOptions extends RequestInit {
  /** Timeout por tentativa, em ms. */
  timeoutMs?: number;
  /** Tentativas de alcançar o servidor (a 1ª inclusa). */
  attempts?: number;
  /**
   * true para requisições idempotentes (GET): a própria requisição é repetida.
   * false (padrão) para POST: só a sondagem TCP é repetida; a requisição é
   * enviada no máximo uma vez.
   */
  idempotent?: boolean;
}

/** Nunca lança por falha de rede: devolve o desfecho classificado. */
export async function upstreamFetch(
  url: string,
  { timeoutMs = 15_000, attempts = 3, idempotent = false, ...init }: UpstreamFetchOptions = {}
): Promise<UpstreamOutcome> {
  const target = new URL(url);
  const port = Number(target.port) || (target.protocol === 'https:' ? 443 : 80);

  // ---- Não idempotente: garante alcançabilidade ANTES de enviar ----
  if (!idempotent) {
    let probeError: Error | null = null;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      probeError = await probeTcp(target.hostname, port, Math.min(timeoutMs, 8_000));
      if (!probeError) break;
      if (attempt < attempts) await sleep(attempt * 500);
    }

    if (probeError) {
      // Servidor não aceitou conexão em nenhuma tentativa: nada foi enviado.
      return { kind: 'unreachable', error: probeError, attempts };
    }

    // Socket abriu: envia UMA única vez. Qualquer falha daqui em diante é
    // ambígua e não pode ser reenviada automaticamente.
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      return { kind: 'response', response, attempts: 1 };
    } catch (err) {
      return {
        kind: isUnreachableError(err) ? 'unreachable' : 'indeterminate',
        error: err as Error,
        attempts: 1,
      };
    }
  }

  // ---- Idempotente: pode repetir a própria requisição ----
  let lastError: Error = new Error('falha desconhecida ao contatar o Chatwoot');
  let lastKind: 'unreachable' | 'indeterminate' = 'indeterminate';
  let sent = 0;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    sent = attempt;
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });

      // Erro transitório do proxy na frente do Chatwoot.
      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < attempts) {
        lastError = new Error(`Chatwoot respondeu ${response.status}`);
        lastKind = 'indeterminate';
        await sleep(attempt * 400);
        continue;
      }

      return { kind: 'response', response, attempts: attempt };
    } catch (err) {
      lastError = err as Error;
      lastKind = isUnreachableError(err) ? 'unreachable' : 'indeterminate';
      if (attempt < attempts) await sleep(attempt * 400);
    }
  }

  return { kind: lastKind, error: lastError, attempts: sent };
}

/** Mensagem pronta para o atendente ler na interface. */
export function describeOutcome(outcome: UpstreamOutcome): string {
  if (outcome.kind === 'unreachable') {
    return 'O servidor do Chatwoot não aceitou a conexão (sobrecarga). '
      + 'Sua mensagem NÃO foi enviada e continua salva aqui — tente novamente em alguns segundos.';
  }
  return 'A conexão com o Chatwoot caiu durante o envio. '
    + 'Confira no histórico se a mensagem chegou ANTES de reenviar, para não duplicar.';
}
