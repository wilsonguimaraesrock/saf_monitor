/**
 * POST /api/scraper/trigger
 * Dispara o workflow scraper.yml via GitHub Actions API.
 * Requer GITHUB_PAT (Personal Access Token) com escopo "workflow".
 */
import { NextResponse } from 'next/server';

const OWNER    = 'wilsonguimaraesrock';
const REPO     = 'saf_monitor';
const WORKFLOW = 'scraper.yml';

export async function POST() {
  const token = process.env.GH_PAT;
  if (!token) {
    return NextResponse.json({ error: 'GITHUB_PAT não configurado' }, { status: 500 });
  }

  const res = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  // GitHub retorna 204 No Content em caso de sucesso
  if (res.status === 204) {
    return NextResponse.json({ ok: true });
  }

  const body = await res.text();
  return NextResponse.json({ error: body }, { status: res.status });
}
