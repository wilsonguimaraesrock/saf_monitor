import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const BASE_URL   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN      = process.env.CHATWOOT_API_TOKEN;

async function cw<T>(path: string): Promise<{ ok: boolean; status: number; body: T | null; error?: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}${path}`, {
      headers: { api_access_token: TOKEN! },
      cache: 'no-store',
    });
    const body = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: null, error: String(e) };
  }
}

export async function GET() {
  const now        = Math.floor(Date.now() / 1000);
  const monthStart = new Date();
  const sinceMonth = Math.floor(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), 1) / 1000);

  const teamIds = [2, 3, 4, 5, 6, 7, 8]; // todos os teams

  const results = await Promise.all(teamIds.map(async (id) => {
    const [summary, openMeta, resolvedMeta, resolvedSince] = await Promise.all([
      cw(`/reports/summary?since=${sinceMonth}&until=${now}&id=${id}&type=team`),
      cw(`/conversations?status=open&team_id=${id}&page=1`),
      cw(`/conversations?status=resolved&team_id=${id}&page=1`),
      cw(`/conversations?status=resolved&team_id=${id}&since=${sinceMonth}&page=1`),
    ]);
    return {
      teamId: id,
      summary,
      open_all_count: (openMeta.body as any)?.data?.meta?.all_count,
      resolved_all_count: (resolvedMeta.body as any)?.data?.meta?.all_count,
      resolved_since_count: (resolvedSince.body as any)?.data?.meta?.all_count,
    };
  }));

  return NextResponse.json({ sinceMonth, now, results });
}
