/**
 * GET /api/admin/bot  — lê configurações do bot
 * PUT /api/admin/bot  — atualiza configurações
 */
import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const u = await verifyToken(token);
  return u?.role === 'superadmin' ? u : null;
}

export async function GET(req: NextRequest) {
  if (!await requireSuperAdmin(req)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const rows = await query<{ key: string; value: string }>('SELECT key, value FROM bot_settings');
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return NextResponse.json({
    testPhoneNumbers:    JSON.parse(settings.test_phone_numbers   ?? '[]'),
    enabledDepartments:  JSON.parse(settings.enabled_departments  ?? '[]'),
    systemPrompt:        settings.system_prompt ?? '',
  });
}

export async function PUT(req: NextRequest) {
  if (!await requireSuperAdmin(req)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await req.json() as {
    testPhoneNumbers?: string[];
    enabledDepartments?: string[];
    systemPrompt?: string;
  };

  if (body.testPhoneNumbers !== undefined) {
    await execute(
      `INSERT INTO bot_settings (key, value) VALUES ('test_phone_numbers', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(body.testPhoneNumbers)]
    );
  }
  if (body.enabledDepartments !== undefined) {
    await execute(
      `INSERT INTO bot_settings (key, value) VALUES ('enabled_departments', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [JSON.stringify(body.enabledDepartments)]
    );
  }
  if (body.systemPrompt !== undefined) {
    await execute(
      `INSERT INTO bot_settings (key, value) VALUES ('system_prompt', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1`,
      [body.systemPrompt]
    );
  }

  return NextResponse.json({ ok: true });
}
