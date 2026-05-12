import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN = process.env.CHATWOOT_API_TOKEN;

export const dynamic = 'force-dynamic';

function chatwootHeaders() {
  return { api_access_token: TOKEN! };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: 'Configuração Chatwoot ausente' }, { status: 500 });
  }

  const { id } = await params;

  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}/messages`,
    { headers: chatwootHeaders(), cache: 'no-store' }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Chatwoot error: ${res.status}` }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: 'Configuração Chatwoot ausente' }, { status: 500 });
  }

  const { id } = await params;
  const contentType = req.headers.get('content-type') ?? '';

  let body: BodyInit;
  let headers: Record<string, string> = chatwootHeaders();

  if (contentType.includes('multipart/form-data')) {
    // Attachment (image or audio) — proxy FormData directly to Chatwoot
    const incoming = await req.formData();
    const outgoing = new FormData();
    outgoing.append('message_type', 'outgoing');
    outgoing.append('private', 'false');
    const content = incoming.get('content');
    if (content) outgoing.append('content', content as string);
    const file = incoming.get('file');
    if (!file) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 });
    outgoing.append('attachments[]', file as Blob);
    body = outgoing;
    // Let fetch set the correct multipart Content-Type with boundary
  } else {
    const json = await req.json();
    if (!json.content?.trim()) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    }
    body = JSON.stringify({ content: json.content.trim(), message_type: 'outgoing', private: false });
    headers = { 'Content-Type': 'application/json', ...chatwootHeaders() };
  }

  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}/messages`,
    { method: 'POST', headers, body }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Chatwoot error: ${res.status}` }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: 'Configuração Chatwoot ausente' }, { status: 500 });
  }

  const { id } = await params;

  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}/toggle_status`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...chatwootHeaders() },
      body: JSON.stringify({ status: 'resolved' }),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Chatwoot error: ${res.status}` }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json({ error: 'Configuração Chatwoot ausente' }, { status: 500 });
  }

  const { id } = await params;
  const { teamId } = await req.json();

  if (teamId === undefined) {
    return NextResponse.json({ error: 'teamId obrigatório' }, { status: 400 });
  }

  // Transfere para outro team (departamento) via endpoint de assignments
  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}/assignments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...chatwootHeaders() },
      body: JSON.stringify({ team_id: teamId }),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Erro ao transferir team: ${res.status}` }, { status: res.status });
  }

  return NextResponse.json(await res.json());
}
