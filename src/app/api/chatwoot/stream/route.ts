import { NextRequest } from 'next/server';
import { getLiveFeedSnapshot } from '@/lib/liveFeed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 300;

const PUSH_INTERVAL_MS = 15_000;
/** Encerra antes do limite da função; o EventSource reconecta sozinho. */
const STREAM_TTL_MS = 270_000;

/**
 * GET /api/chatwoot/stream (Server-Sent Events)
 *
 * Empurra o snapshot de conversas ativas a cada 15s. É SSE em vez de polling no
 * cliente porque o navegador limita timers de abas em segundo plano a ~1 por
 * minuto — e a notificação precisa chegar mesmo com o atendente em outra aba.
 */
export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          /* já fechado pelo cliente */
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const sleep = (ms: number) =>
        new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, ms);
          req.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              resolve();
            },
            { once: true }
          );
        });

      req.signal.addEventListener('abort', () => { closed = true; }, { once: true });

      // Intervalo de reconexão do EventSource
      try {
        controller.enqueue(encoder.encode('retry: 5000\n\n'));
      } catch {
        return;
      }

      const startedAt = Date.now();

      while (!closed && Date.now() - startedAt < STREAM_TTL_MS) {
        try {
          send('snapshot', await getLiveFeedSnapshot());
        } catch (err) {
          send('feed-error', { message: (err as Error).message });
        }
        if (closed) break;
        await sleep(PUSH_INTERVAL_MS);
      }

      close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform, max-age=0',
      Connection: 'keep-alive',
      // Evita buffering em proxies intermediários
      'X-Accel-Buffering': 'no',
    },
  });
}
