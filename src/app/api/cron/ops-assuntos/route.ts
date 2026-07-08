/**
 * GET /api/cron/ops-assuntos?dept=Adm · Outros
 * Diagnóstico: lista os valores distintos de title (Assunto) e service (Serviço)
 * dos SAFs de um department, com contagem. Ajuda a afinar o classificador.
 * Protegido por CRON_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dept = req.nextUrl.searchParams.get('dept') ?? 'Adm · Outros';

  const byTitle = await query<{ title: string; n: string }>(
    `SELECT COALESCE(NULLIF(title,''),'(vazio)') AS title, COUNT(*) AS n
     FROM saf_tickets WHERE department = $1
     GROUP BY 1 ORDER BY n DESC LIMIT 60`,
    [dept]
  );

  const byService = await query<{ service: string; n: string }>(
    `SELECT COALESCE(NULLIF(service,''),'(vazio)') AS service, COUNT(*) AS n
     FROM saf_tickets WHERE department = $1
     GROUP BY 1 ORDER BY n DESC LIMIT 60`,
    [dept]
  );

  return NextResponse.json({
    dept,
    porAssunto: byTitle.map((r) => ({ assunto: r.title, qtd: Number(r.n) })),
    porServico: byService.map((r) => ({ servico: r.service, qtd: Number(r.n) })),
  });
}
