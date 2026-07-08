/**
 * POST /api/cron/reclassify-operacoes
 * Backfill único: reclassifica os SAFs de Operações existentes para os novos
 * departments finos (Adm · …, Logística, Implantação) com base no Assunto (title).
 * Protegido por CRON_SECRET. Idempotente — rodar de novo não muda nada já migrado.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { classifyOperationsDepartment } from '@/engine/classifier';
import { createChildLogger } from '@/lib/logger';

export const maxDuration = 300;

const log = createChildLogger('cron:reclassify-operacoes');

// Departments ORIGINAIS do dfranquias que pertencem a Operações e devem migrar.
// 'Relacionamento' NÃO entra (é do MKT).
const SOURCE_DEPARTMENTS = [
  'Atendimento e Sistema de Gestão',
  'Implantação',
  'Gerencia',
  'Gerência',
  'Material Didático',
  'Material didático',
  'Pedidos',
];

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return req.headers.get('authorization') === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const rows = await query<{ id: string; title: string; department: string; service: string | null }>(
    `SELECT id, title, department, service
     FROM saf_tickets
     WHERE department = ANY($1::text[])`,
    [SOURCE_DEPARTMENTS]
  );

  const counts: Record<string, number> = {};
  let updated = 0;

  for (const r of rows) {
    const newDept = classifyOperationsDepartment({
      externalId: r.id,
      title:      r.title ?? '',
      department: r.department,
      service:    r.service ?? undefined,
    });
    if (!newDept || newDept === r.department) continue;

    await execute('UPDATE saf_tickets SET department = $1 WHERE id = $2', [newDept, r.id]);
    counts[newDept] = (counts[newDept] ?? 0) + 1;
    updated++;
  }

  log.info(`Reclassificados ${updated}/${rows.length} tickets de Operações: ${JSON.stringify(counts)}`);

  return NextResponse.json({ ok: true, scanned: rows.length, updated, counts });
}
