/**
 * GET /api/chatbot/catalogo?tipo=units|departments|subdepartments|subjects
 *
 * Proxy do cadastro do ChatBot Whats Franquias, que alimenta os selects em
 * cascata do "Iniciar conversa". Existe por dois motivos:
 *  - a credencial Basic da API dele fica só no servidor, nunca no navegador;
 *  - o cadastro muda pouco, então cacheamos e evitamos uma ida por abertura
 *    do modal.
 *
 * A sessão do atendente é exigida pelo middleware antes de chegar aqui.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getUnits, getDepartments, getSubdepartments, getSubjects, isChatbotConfigured,
} from '@/integrations/chatbot';
import { memoize } from '@/lib/memoCache';

export const dynamic = 'force-dynamic';

/** Unidades e departamentos mudam em escala de dias; assuntos, de semanas. */
const TTL_MS = 5 * 60_000;

export async function GET(req: NextRequest) {
  if (!isChatbotConfigured()) {
    return NextResponse.json(
      {
        error: 'Integração com o chatbot não configurada no servidor.',
        code: 'nao_configurado',
      },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get('tipo')?.trim();
  const id   = searchParams.get('id')?.trim();

  try {
    switch (tipo) {
      case 'units':
        return NextResponse.json({
          items: await memoize('chatbot:units', TTL_MS, getUnits),
        });

      case 'departments':
        return NextResponse.json({
          items: await memoize('chatbot:departments', TTL_MS, getDepartments),
        });

      case 'subdepartments':
        if (!id) return NextResponse.json({ error: 'Parâmetro "id" (departmentId) é obrigatório' }, { status: 400 });
        return NextResponse.json({
          items: await memoize(`chatbot:subdeps:${id}`, TTL_MS, () => getSubdepartments(id)),
        });

      case 'subjects':
        if (!id) return NextResponse.json({ error: 'Parâmetro "id" (subdepartmentId) é obrigatório' }, { status: 400 });
        return NextResponse.json({
          items: await memoize(`chatbot:subjects:${id}`, TTL_MS, () => getSubjects(id)),
        });

      default:
        return NextResponse.json(
          { error: 'tipo deve ser units, departments, subdepartments ou subjects' },
          { status: 400 }
        );
    }
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
