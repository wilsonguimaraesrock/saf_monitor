import { NextRequest, NextResponse } from 'next/server';
import { execute, queryOne } from '@/lib/db';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { generateEmbedding } from '@/integrations/openai';

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const u = await verifyToken(token);
  return u?.role === 'superadmin' ? u : null;
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireSuperAdmin(req)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const { id } = await params;
  const body = await req.json() as {
    title?: string; content?: string; category?: string; department?: string; is_active?: boolean;
  };

  const updates: string[] = [];
  const values: unknown[] = [];
  let p = 1;

  if (body.title      !== undefined) { updates.push(`title = $${p++}`);      values.push(body.title.trim()); }
  if (body.content    !== undefined) { updates.push(`content = $${p++}`);    values.push(body.content.trim()); }
  if (body.category   !== undefined) { updates.push(`category = $${p++}`);   values.push(body.category); }
  if (body.department !== undefined) { updates.push(`department = $${p++}`); values.push(body.department); }
  if (body.is_active  !== undefined) { updates.push(`is_active = $${p++}`);  values.push(body.is_active); }

  // Re-generate embedding if content or title changed
  if (body.title !== undefined || body.content !== undefined) {
    const current = await queryOne<{ title: string; content: string }>(
      'SELECT title, content FROM knowledge_base WHERE id = $1', [Number(id)]
    );
    if (current) {
      const newTitle   = body.title   ?? current.title;
      const newContent = body.content ?? current.content;
      try {
        const emb = await generateEmbedding(`${newTitle}\n${newContent}`);
        updates.push(`embedding = $${p++}`);
        values.push(emb);
      } catch { /* proceed without new embedding */ }
    }
  }

  if (updates.length === 0) return NextResponse.json({ error: 'Nada para atualizar' }, { status: 400 });

  updates.push('updated_at = NOW()');
  values.push(Number(id));
  await execute(`UPDATE knowledge_base SET ${updates.join(', ')} WHERE id = $${p}`, values);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireSuperAdmin(req)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  const { id } = await params;
  await execute('DELETE FROM knowledge_base WHERE id = $1', [Number(id)]);
  return NextResponse.json({ ok: true });
}
