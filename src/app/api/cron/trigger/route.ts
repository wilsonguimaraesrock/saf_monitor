/**
 * Endpoint para disparo on-demand do agente
 * POST /api/cron/trigger
 * Header: Authorization: Bearer <CRON_SECRET>
 */

import { NextRequest, NextResponse } from 'next/server';
import { runNow } from '@/scheduler/index';

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET não configurado' }, { status: 500 });
  }

  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
  }

  // Executa em background sem bloquear a resposta
  runNow('api:on_demand').catch(console.error);

  return NextResponse.json({ message: 'Execução iniciada', timestamp: new Date().toISOString() });
}
