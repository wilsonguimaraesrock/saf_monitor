/**
 * POST /api/admin/knowledge/upload
 * Recebe um PDF, extrai o texto, divide em chunks e gera embeddings via OpenAI.
 *
 * Usa pdf-parse/lib/pdf-parse.js diretamente para evitar o bug do Vercel onde
 * o módulo principal tenta carregar arquivos de teste que não existem em produção.
 */
import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { verifyToken, COOKIE_NAME } from '@/lib/auth';
import { generateEmbedding } from '@/integrations/openai';

export const maxDuration = 120;

async function requireSuperAdmin(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const u = await verifyToken(token);
  return u?.role === 'superadmin' ? u : null;
}

function chunkText(text: string, maxChars = 800, overlap = 100): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 20);

  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if ((current ? current + '\n\n' + para : para).length <= maxChars) {
      current = current ? current + '\n\n' + para : para;
    } else {
      if (current) chunks.push(current);
      if (para.length > maxChars) {
        const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
        let sub = '';
        for (const s of sentences) {
          if ((sub ? sub + ' ' + s : s).length <= maxChars) {
            sub = sub ? sub + ' ' + s : s;
          } else {
            if (sub) chunks.push(sub);
            sub = s;
          }
        }
        current = sub;
      } else {
        current = para;
      }
    }
  }
  if (current) chunks.push(current);

  // Add overlap
  return chunks.map((c, i) =>
    i === 0 ? c : (chunks[i - 1].slice(-overlap) + ' ' + c).trim()
  );
}

export async function POST(req: NextRequest) {
  try {
    if (!await requireSuperAdmin(req)) {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 });
    }

    const formData   = await req.formData();
    const file       = formData.get('file') as File | null;
    const department = (formData.get('department') as string) || 'global';
    const category   = (formData.get('category')   as string) || 'documento';

    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Envie um arquivo PDF válido' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Use direct lib path to bypass pdf-parse's test-file loader (breaks on Vercel)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
      buf: Buffer,
      opts?: object
    ) => Promise<{ text: string; numpages: number }>;

    let text = '';
    let numpages = 0;
    try {
      const result = await pdfParse(buffer, { max: 0 });
      text     = result.text;
      numpages = result.numpages;
    } catch (parseErr) {
      return NextResponse.json(
        { error: `Falha ao ler o PDF: ${(parseErr as Error).message}` },
        { status: 422 }
      );
    }

    if (!text?.trim()) {
      return NextResponse.json(
        { error: 'Não foi possível extrair texto. O PDF pode ser uma imagem escaneada.' },
        { status: 422 }
      );
    }

    const baseName = file.name.replace(/\.pdf$/i, '');
    const chunks   = chunkText(text);

    let saved = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const title = `${baseName} — parte ${i + 1}`;

      let embedding: number[] | null = null;
      try {
        embedding = await generateEmbedding(`${title}\n${chunk}`);
      } catch { /* save without embedding — article still usable */ }

      await execute(
        `INSERT INTO knowledge_base (title, content, category, department, embedding, is_active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [title, chunk, category, department, embedding]
      );
      saved++;
    }

    return NextResponse.json({ ok: true, filename: file.name, pages: numpages, chunks: saved });

  } catch (err) {
    return NextResponse.json(
      { error: `Erro interno: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
