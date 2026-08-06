import { NextResponse } from 'next/server';
import { getLiveFeedSnapshot } from '@/lib/liveFeed';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * GET /api/chatwoot/live-feed
 * Snapshot das conversas ativas de todos os setores com a última mensagem.
 * Usado como fallback do stream SSE (/api/chatwoot/stream).
 */
export async function GET() {
  try {
    const snapshot = await getLiveFeedSnapshot();
    return NextResponse.json(snapshot, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
