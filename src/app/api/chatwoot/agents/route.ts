import { NextResponse } from 'next/server';

const BASE_URL   = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN      = process.env.CHATWOOT_API_TOKEN;

export const dynamic = 'force-dynamic';

export async function GET() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: 'Chatwoot não configurado' }, { status: 500 });
  }

  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/agents`,
    { headers: { api_access_token: TOKEN }, cache: 'no-store' }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Chatwoot error: ${res.status}` }, { status: res.status });
  }

  const data: Array<{ id: number; name: string; availability_status: string }> = await res.json();
  return NextResponse.json({
    agents: data.map((a) => ({ id: a.id, name: a.name, available: a.availability_status === 'online' })),
  });
}
