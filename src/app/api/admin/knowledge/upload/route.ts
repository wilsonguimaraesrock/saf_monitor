/**
 * POST /api/admin/knowledge/upload
 * Recebe um PDF, extrai o texto, divide em chunks e gera embeddings via OpenAI.
 * Cada chunk vira um artigo na knowledge_base.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { generateEmbedding } from '@/integrations/openai';

export const maxDuration = 120; // PDF grande pode demorar

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const u = await verifyToken(token);
  return u?.role === 'superadmin' ? u : null;
}

// Split text into overlapping chunks
function chunkText(text: string, maxChars = 800, overlap = 100): string[] {
  const chunks: string[] = [];
  // Try to split on paragraph boundaries first
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20);

  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length <= maxChars) {
      current = current ? current + '\n\n' + para : para;
    } else {
      if (current) chunks.push(current);
      // If single paragraph is too long, split by sentences
      if (para.length > maxChars) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
        let sub = '';
        for (const s of sentences) {
          if ((sub + ' ' + s).length <= maxChars) {
            sub = sub ? sub + ' ' + s : s;
          } else {
            if (sub) chunks.push(sub);
            sub = s;
          }
        }
        if (sub) current = sub;
        else current = '';
      } else {
        current = para;
      }
    }
  }
  if (current) chunks.push(current);

  // Add overlap: prepend last `overlap` chars of previous chunk to next
  const overlapped: string[] = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) { overlapped.push(chunks[i]); continue; }
    const tail = chunks[i - 1].slice(-overlap);
    overlapped.push(`${tail} ${chunks[i]}`.trim());
  }

  return overlapped;
}

export async function POST(req: NextRequest) {
  if (!await requireSuperAdmin(req)) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
  }

  const formData  = await req.formData();
  const file      = formData.get('file') as File | null;
  const department = (formData.get('department') as string) ?? 'global';
  const category   = (formData.get('category')   as string) ?? 'documento';

  if (!file || file.type !== 'application/pdf') {
    return NextResponse.json({ error: 'Envie um arquivo PDF válido' }, { status: 400 });
  }

  // Parse PDF
  const buffer = Buffer.from(await file.arrayBuffer());
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;
  const { text, numpages } = await pdfParse(buffer);

  if (!text?.trim()) {
    return NextResponse.json({ error: 'Não foi possível extrair texto do PDF (verifique se não é uma imagem escaneada)' }, { status: 422 });
  }

  const baseName = file.name.replace(/\.pdf$/i, '');
  const chunks   = chunkText(text);

  // Generate embeddings + insert in batches (to avoid timeout)
  let saved = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const title = `${baseName} — parte ${i + 1}`;

    let embedding: number[] | null = null;
    try {
      embedding = await generateEmbedding(`${title}\n${chunk}`);
    } catch { /* proceed without embedding */ }

    await execute(
      `INSERT INTO knowledge_base (title, content, category, department, embedding, is_active)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [title, chunk, category, department, embedding]
    );
    saved++;
  }

  return NextResponse.json({
    ok: true,
    filename: file.name,
    pages: numpages,
    chunks: saved,
  });
}
