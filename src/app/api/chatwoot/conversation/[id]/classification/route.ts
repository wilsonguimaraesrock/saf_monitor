import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import {
  getClassification,
  upsertClassification,
  type Prioridade,
  type Complexidade,
} from '@/repository/conversationClassification';

export const dynamic = 'force-dynamic';

const VALID_PRIORITIES = new Set<string>(['baixa', 'media', 'alta', 'urgente']);
const VALID_COMPLEXITIES = new Set<string>(['baixa', 'media', 'alta']);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const classification = await getClassification(conversationId);
  return NextResponse.json({ classification });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const jwt = req.cookies.get(COOKIE_NAME)?.value;
  if (!jwt) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const user = await verifyToken(jwt);
  if (!user) {
    return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 });
  }

  const { id } = await params;
  const conversationId = Number(id);
  if (!Number.isFinite(conversationId)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as {
    prioridade?: string | null;
    complexidade?: string | null;
  } | null;

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Corpo da requisição inválido' }, { status: 400 });
  }

  const patchData: {
    prioridade?: Prioridade | null;
    complexidade?: Complexidade | null;
  } = {};

  if ('prioridade' in body) {
    if (body.prioridade === null || body.prioridade === '') {
      patchData.prioridade = null;
    } else if (typeof body.prioridade === 'string' && VALID_PRIORITIES.has(body.prioridade)) {
      patchData.prioridade = body.prioridade as Prioridade;
    } else {
      return NextResponse.json(
        { error: 'Prioridade inválida. Opções: baixa, media, alta, urgente' },
        { status: 400 }
      );
    }
  }

  if ('complexidade' in body) {
    if (body.complexidade === null || body.complexidade === '') {
      patchData.complexidade = null;
    } else if (typeof body.complexidade === 'string' && VALID_COMPLEXITIES.has(body.complexidade)) {
      patchData.complexidade = body.complexidade as Complexidade;
    } else {
      return NextResponse.json(
        { error: 'Complexidade inválida. Opções: baixa, media, alta' },
        { status: 400 }
      );
    }
  }

  try {
    const classification = await upsertClassification(conversationId, patchData, {
      id: user.id,
      name: user.name,
    });

    return NextResponse.json({ ok: true, classification });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
