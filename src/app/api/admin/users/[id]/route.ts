/**
 * PUT    /api/admin/users/:id  — atualiza usuário (nome, departamentos, role, ativo, senha)
 * DELETE /api/admin/users/:id  — remove usuário
 * Apenas superadmin pode acessar.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { verifyToken, hashPassword, COOKIE_NAME } from '@/lib/auth';

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  return user?.role === 'superadmin' ? user : null;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);

  const existing = await queryOne<{ id: number }>('SELECT id FROM users WHERE id = $1', [userId]);
  if (!existing) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const body = await req.json() as {
    email?: string; name?: string; departments?: string[]; role?: string;
    is_active?: boolean; password?: string; chatwootToken?: string;
  };

  const updates: string[] = [];
  const values: unknown[]  = [];
  let p = 1;

  if (body.email      !== undefined) { updates.push(`email = $${p++}`);        values.push(body.email.trim().toLowerCase()); }
  if (body.name       !== undefined) { updates.push(`name = $${p++}`);        values.push(body.name.trim()); }
  if (body.departments !== undefined) { updates.push(`departments = $${p++}`); values.push(body.departments); }
  if (body.role       !== undefined) {
    if (!['superadmin', 'user'].includes(body.role)) {
      return NextResponse.json({ error: 'role inválido' }, { status: 400 });
    }
    updates.push(`role = $${p++}`); values.push(body.role);
  }
  if (body.is_active  !== undefined) { updates.push(`is_active = $${p++}`);   values.push(body.is_active); }
  if (body.password   !== undefined) {
    const hash = await hashPassword(body.password);
    updates.push(`password_hash = $${p++}`); values.push(hash);
  }
  if (body.chatwootToken !== undefined) {
    updates.push(`chatwoot_token = $${p++}`); values.push(body.chatwootToken.trim() || null);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  await execute(
    `UPDATE users SET ${updates.join(', ')} WHERE id = $${p}`,
    values
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireSuperAdmin(req);
  if (!admin) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { id } = await params;
  const userId = Number(id);

  // Prevent self-deletion
  if (admin.id === userId) {
    return NextResponse.json({ error: 'Não é possível remover sua própria conta' }, { status: 400 });
  }

  await execute('DELETE FROM users WHERE id = $1', [userId]);
  return NextResponse.json({ ok: true });
}
