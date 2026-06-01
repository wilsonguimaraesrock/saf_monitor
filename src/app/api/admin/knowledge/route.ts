/**
 * GET  /api/admin/knowledge  — lista artigos da base de conhecimento
 * POST /api/admin/knowledge  — cria artigo (gera embedding via OpenAI)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query, execute } from '@/lib/db';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { generateEmbedding } from '@/integrations/openai';

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const user = await verifyToken(token);
  return user?.role === 'superadmin' ? user : null;
}

export async function GET(req: NextRequest) {
  if (!await requireSuperAdmin(req)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const department = req.nextUrl.searchParams.get('department') ?? undefined;
  const rows = await query<{
    id: number; title: string; content: string; category: string;
    department: string; is_active: boolean; created_at: string;
  }>(
    `SELECT id, title, content, category, department, is_active, created_at
     FROM knowledge_base
     ${department ? 'WHERE department = $1' : ''}
     ORDER BY department, created_at DESC`,
    department ? [department] : []
  );

  return NextResponse.json({ articles: rows });
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin(req)) return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });

  const body = await req.json() as {
    title?: string; content?: string; category?: string; department?: string;
  };
  const { title, content, category = 'geral', department = 'global' } = body;

  if (!title || !content) return NextResponse.json({ error: 'title e content são obrigatórios' }, { status: 400 });

  // Generate embedding
  let embedding: number[] | null = null;
  try {
    embedding = await generateEmbedding(`${title}\n${content}`);
  } catch {
    // proceed without embedding — article still searchable by text
  }

  await execute(
    `INSERT INTO knowledge_base (title, content, category, department, embedding, is_active)
     VALUES ($1, $2, $3, $4, $5, true)`,
    [title.trim(), content.trim(), category, department, embedding]
  );

  return NextResponse.json({ ok: true }, { status: 201 });
}
