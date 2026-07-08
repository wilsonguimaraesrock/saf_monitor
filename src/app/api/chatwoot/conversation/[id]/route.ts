import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { queryOne } from '@/lib/db';

const BASE_URL = process.env.CHATWOOT_BASE_URL?.replace(/\/$/, '');
const ACCOUNT_ID = process.env.CHATWOOT_ACCOUNT_ID ?? '1';
const TOKEN = process.env.CHATWOOT_API_TOKEN;

export const dynamic = 'force-dynamic';

function chatwootHeaders() {
  return { api_access_token: TOKEN! };
}

/** Nome do atendente logado (via JWT) — usado nas notas de transferência */
async function getAgentName(req: NextRequest): Promise<string | null> {
  const jwt = req.cookies.get(COOKIE_NAME)?.value;
  if (!jwt) return null;
  const user = await verifyToken(jwt);
  return user?.name ?? null;
}

/**
 * Resolve a identidade do atendente logado:
 * - Se tiver token pessoal do Chatwoot → autoria nativa (usa o token dele, sem prefixo)
 * - Senão → usa o token compartilhado e prefixa o nome na mensagem
 */
async function resolveAgent(req: NextRequest): Promise<{ token: string; prefixName: string | null }> {
  const jwt = req.cookies.get(COOKIE_NAME)?.value;
  const fallback = { token: TOKEN!, prefixName: null as string | null };
  if (!jwt) return fallback;

  const user = await verifyToken(jwt);
  if (!user) return fallback;

  const row = await queryOne<{ chatwoot_token: string | null }>(
    'SELECT chatwoot_token FROM users WHERE id = $1',
    [user.id]
  );

  if (row?.chatwoot_token) {
    // Autoria nativa: mensagem é atribuída ao próprio agente no Chatwoot
    return { token: row.chatwoot_token, prefixName: null };
  }
  // Sem token pessoal: token compartilhado + prefixo de nome
  return { token: TOKEN!, prefixName: user.name };
}

/** Nome do time atual da conversa (origem da transferência) */
async function getCurrentTeamName(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}`, {
      headers: chatwootHeaders(), cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = await res.json() as { meta?: { team?: { name?: string } } };
    return data?.meta?.team?.name ?? null;
  } catch {
    return null;
  }
}

/** Resolve o nome de um time pelo id */
async function getTeamName(teamId: number): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/teams`, {
      headers: chatwootHeaders(), cache: 'no-store',
    });
    if (!res.ok) return null;
    const teams = await res.json() as Array<{ id: number; name: string }>;
    return teams.find((t) => t.id === teamId)?.name ?? null;
  } catch {
    return null;
  }
}

/** Grava uma nota interna (private) registrando a transferência no histórico */
async function postTransferNote(id: string, from: string | null, to: string | null, agent: string | null) {
  const origem  = from ?? 'desconhecido';
  const destino = to   ?? 'outro departamento';
  const porQuem = agent ? ` · por *${agent}*` : '';
  const content = `🔀 *Transferência de atendimento*\nDe: *${origem}* → Para: *${destino}*${porQuem}`;
  await fetch(`${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...chatwootHeaders() },
    body: JSON.stringify({ content, message_type: 'outgoing', private: true }),
  });
}

function withAgentPrefix(content: string, prefixName: string | null): string {
  if (!prefixName) return content;
  return `*${prefixName}:*\n${content}`;
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
  const { token: agentToken, prefixName } = await resolveAgent(req);
  const authHeader = { api_access_token: agentToken };

  let body: BodyInit;
  let headers: Record<string, string> = authHeader;

  if (contentType.includes('multipart/form-data')) {
    // Attachment (image or audio) — proxy FormData directly to Chatwoot
    const incoming = await req.formData();
    const outgoing = new FormData();
    outgoing.append('message_type', 'outgoing');
    outgoing.append('private', 'false');
    const content = incoming.get('content');
    if (content) outgoing.append('content', withAgentPrefix(content as string, prefixName));
    const file = incoming.get('file');
    if (!file) return NextResponse.json({ error: 'Arquivo ausente' }, { status: 400 });
    // Preserva o nome/extensão do arquivo para o Chatwoot (ex.: .pdf, .docx)
    const fileName = file instanceof File ? file.name : 'arquivo';
    outgoing.append('attachments[]', file as Blob, fileName);
    body = outgoing;
    // Let fetch set the correct multipart Content-Type with boundary
  } else {
    const json = await req.json();
    if (!json.content?.trim()) {
      return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
    }
    const content = withAgentPrefix(json.content.trim(), prefixName);
    body = JSON.stringify({ content, message_type: 'outgoing', private: false });
    headers = { 'Content-Type': 'application/json', ...authHeader };
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
  const body = await req.json();
  const { teamId, agentId } = body;

  if (teamId === undefined && agentId === undefined) {
    return NextResponse.json({ error: 'teamId ou agentId obrigatório' }, { status: 400 });
  }

  const isTransfer = teamId !== undefined;
  const payload = isTransfer
    ? { team_id: teamId }
    : { assignee_id: agentId ?? null };

  // Captura o time de origem ANTES da transferência, para registrar no histórico
  const [originTeam, destTeam, agentName] = isTransfer
    ? await Promise.all([
        getCurrentTeamName(id),
        getTeamName(Number(teamId)),
        getAgentName(req),
      ])
    : [null, null, null];

  const res = await fetch(
    `${BASE_URL}/api/v1/accounts/${ACCOUNT_ID}/conversations/${id}/assignments`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...chatwootHeaders() },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    return NextResponse.json({ error: `Erro na atribuição: ${res.status}` }, { status: res.status });
  }

  // Registra a transferência como nota interna no histórico da conversa
  if (isTransfer) {
    await postTransferNote(id, originTeam, destTeam, agentName);
  }

  return NextResponse.json(await res.json());
}
