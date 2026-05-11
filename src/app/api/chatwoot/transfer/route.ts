import { NextResponse } from 'next/server';

const BASE_URL = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN = process.env.CHATWOOT_API_TOKEN;

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: 'Configuração Chatwoot ausente' }, { status: 500 });
  }

  const headers = { api_access_token: TOKEN };

  const [agentsRes, inboxesRes] = await Promise.all([
    fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/agents`, { headers, cache: 'no-store' }),
    fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/inboxes`, { headers, cache: 'no-store' }),
  ]);

  const agents: Array<{ id: number; name: string }> = agentsRes.ok
    ? (await agentsRes.json()).map((a: { id: number; name: string }) => ({ id: a.id, name: a.name }))
    : [];

  const inboxesData = inboxesRes.ok ? (await inboxesRes.json()).payload ?? [] : [];
  const inboxes: Array<{ id: number; name: string }> = inboxesData.map(
    (i: { id: number; name: string }) => ({ id: i.id, name: i.name })
  );

  return NextResponse.json({ agents, inboxes });
}
