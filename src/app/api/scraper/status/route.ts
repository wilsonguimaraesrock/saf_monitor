/**
 * GET /api/scraper/status
 * Retorna o status do último run do scraper.yml no GitHub Actions.
 */
import { NextResponse } from 'next/server';

const OWNER    = 'wilsonguimaraesrock';
const REPO     = 'saf_monitor';
const WORKFLOW = 'scraper.yml';

export async function GET() {
  const token = process.env.GH_PAT;
  if (!token) {
    return NextResponse.json({ error: 'GH_PAT não configurado' }, { status: 500 });
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  // Busca o run mais recente
  const runsRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`,
    { headers }
  );
  const runsData = await runsRes.json() as { workflow_runs: Run[] };
  const run = runsData.workflow_runs?.[0];
  if (!run) return NextResponse.json({ status: 'no_runs' });

  // Busca os jobs (etapas) do run
  const jobsRes = await fetch(run.jobs_url, { headers });
  const jobsData = await jobsRes.json() as { jobs: Job[] };
  const job = jobsData.jobs?.[0];

  const steps = (job?.steps ?? []).map((s) => ({
    name:       s.name,
    status:     s.status,       // queued | in_progress | completed
    conclusion: s.conclusion,   // success | failure | skipped | null
    started_at: s.started_at,
  }));

  return NextResponse.json({
    runId:      run.id,
    status:     run.status,       // queued | in_progress | completed
    conclusion: run.conclusion,   // success | failure | null
    createdAt:  run.created_at,
    updatedAt:  run.updated_at,
    htmlUrl:    run.html_url,
    steps,
  });
}

interface Run {
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  updated_at: string;
  html_url: string;
  jobs_url: string;
}

interface Job {
  steps: Step[];
}

interface Step {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
}
