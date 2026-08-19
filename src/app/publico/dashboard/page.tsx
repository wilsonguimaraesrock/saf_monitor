/**
 * GET /publico/dashboard?token=XXX
 *
 * Versão somente-leitura do dashboard, para embutir num iframe ou exibir numa
 * TV do painel de indicadores da empresa. Sem menu, sem login, sem links de
 * navegação — e com números maiores, pensados para leitura à distância.
 *
 * Os valores vêm de src/lib/dashboardData.ts, a mesma fonte da página
 * /dashboard e da API /api/v1/dashboard.
 */
import { Inbox, CircleCheckBig, BarChart3, Clock, Building2, ShieldCheck, Star, Timer, MessageSquare, type LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { SECTORS } from '@/lib/sectors';
import { getDashboardData, formatMonth } from '@/lib/dashboardData';
import { isValidDashboardToken } from '@/lib/dashboardAuth';
import { AutoRefresh } from '@/components/AutoRefresh';

export const dynamic = 'force-dynamic';

/** Sem indexação: é um link compartilhável, não uma página pública de verdade. */
export const metadata = {
  title: 'Indicadores SAF — Rockfeller',
  robots: { index: false, follow: false },
};

const REFRESH_SECONDS = 120;

function fmtDuration(sec: number | null): string {
  if (!sec || sec <= 0) return '—';
  if (sec < 60)    return `${sec}s`;
  if (sec < 3600)  return `${Math.round(sec / 60)}min`;
  if (sec < 86400) return `${(sec / 3600).toFixed(1)}h`;
  return `${(sec / 86400).toFixed(1)}d`;
}

type Tone = 'slate' | 'emerald' | 'blue' | 'amber' | 'orange' | 'violet';

const TONES: Record<Tone, string> = {
  slate:   'text-slate-100',
  emerald: 'text-emerald-400',
  blue:    'text-sky-400',
  amber:   'text-amber-400',
  orange:  'text-orange-400',
  violet:  'text-violet-400',
};

function Kpi({
  label, value, sub, icon: Icon, tone,
}: {
  label: string; value: string | number; sub?: string;
  icon: LucideIcon; tone: Tone;
}) {
  return (
    <div className="rounded-2xl bg-slate-900/80 border border-slate-800 px-5 py-4 flex flex-col gap-1">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon size={16} className="shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <span className={clsx('text-4xl xl:text-5xl font-bold tabular-nums leading-none', TONES[tone])}>
        {value}
      </span>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

const TH = 'px-3 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-400';
const TD = 'px-3 py-3 text-center text-xl font-semibold tabular-nums';

export default async function PublicDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; mes?: string; month?: string }>;
}) {
  const { token, mes, month } = await searchParams;

  if (!isValidDashboardToken(token)) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-300 flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-100">Acesso não autorizado</h1>
          <p className="text-sm text-slate-400">
            Este painel exige um token válido. Adicione <code className="text-slate-200">?token=…</code> à URL.
          </p>
        </div>
      </main>
    );
  }

  const d = await getDashboardData(mes ?? month);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 xl:p-8 space-y-6">
      {/* Cabeçalho */}
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <h1 className="text-2xl xl:text-3xl font-bold tracking-tight">
            Indicadores de Atendimento — SAF
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{formatMonth(d.month)}</p>
        </div>
        <div className="text-xs text-slate-500 text-right leading-relaxed">
          <div>
            {new Date(d.timestamp).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>
          <AutoRefresh seconds={REFRESH_SECONDS} />
        </div>
      </header>

      {/* KPIs — SAFs */}
      <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi label="SAFs abertos" value={d.totals.abertos} sub="abertos no mês" icon={Inbox} tone="slate" />
        <Kpi label="Resolvidos" value={d.totals.resolvidos} sub="resolvidos no mês" icon={CircleCheckBig} tone="emerald" />
        <Kpi label="% resolvidos" value={d.resolutionRate !== null ? `${d.resolutionRate}%` : '—'} sub="do que abriu no mês" icon={BarChart3} tone="blue" />
        <Kpi label="Aguard. nós" value={d.totals.aguardandoNos} sub="pendente conosco" icon={Clock} tone="amber" />
        <Kpi label="Aguard. franquia" value={d.totals.aguardandoFranquia} sub="pendente com a franquia" icon={Building2} tone="orange" />
        <Kpi label="SLA no prazo" value={d.globalSla !== null ? `${d.globalSla}%` : '—'} sub="resolvidos no prazo" icon={ShieldCheck} tone="violet" />
      </section>

      {/* KPIs — WhatsApp */}
      <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Kpi label="Conversas WhatsApp" value={d.waConversations} sub="abertas no mês" icon={MessageSquare} tone="emerald" />
        <Kpi label="CSAT WhatsApp" value={d.globalCsat !== null ? d.globalCsat : '—'}
             sub={d.csatCount > 0 ? `${d.csatCount} avaliações` : 'sem avaliações'} icon={Star} tone="emerald" />
        <Kpi label="TMA WhatsApp" value={fmtDuration(d.globalTma)}
             sub={d.tmaCount > 0 ? `${d.tmaCount} resolvidas` : 'sem resoluções'} icon={Timer} tone="blue" />
      </section>

      {/* Tabela por setor */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
          Por setor — {formatMonth(d.month)}
        </h2>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead>
              <tr className="border-b border-slate-800">
                <th className={clsx(TH, 'text-left')}>Setor</th>
                <th className={TH}>Abertos</th>
                <th className={TH}>Resolvidos</th>
                <th className={TH}>% Resolv.</th>
                <th className={TH}>Aguard. nós</th>
                <th className={TH}>Aguard. franquia</th>
                <th className={TH}>SLA</th>
                <th className={clsx(TH, 'border-l-2 border-green-800/70')}>Conversas</th>
                <th className={TH}>CSAT</th>
              </tr>
            </thead>
            <tbody>
              {SECTORS.map((sector, i) => {
                const st = d.statsBySector[sector.slug];
                const wa = d.waBySector[sector.slug];
                const rate = st && st.abertos > 0 ? Math.round((100 * st.resolvidos) / st.abertos) : null;
                const dim = 'text-slate-700';
                return (
                  <tr key={sector.slug} className={clsx(i < SECTORS.length - 1 && 'border-b border-slate-800/60')}>
                    <td className="px-3 py-3 text-base font-semibold text-slate-200 whitespace-nowrap">
                      {sector.name}
                    </td>
                    <td className={clsx(TD, 'text-slate-100')}>{st?.abertos ?? '—'}</td>
                    <td className={clsx(TD, 'text-emerald-400')}>{st?.resolvidos ?? '—'}</td>
                    <td className={clsx(TD, 'text-slate-300')}>{rate !== null ? `${rate}%` : '—'}</td>
                    <td className={clsx(TD, (st?.aguardandoNos ?? 0) > 0 ? 'text-amber-400' : dim)}>{st?.aguardandoNos ?? 0}</td>
                    <td className={clsx(TD, (st?.aguardandoFranquia ?? 0) > 0 ? 'text-orange-400' : dim)}>{st?.aguardandoFranquia ?? 0}</td>
                    <td className={clsx(TD, st?.slaRate != null ? 'text-violet-400' : dim)}>
                      {st?.slaRate != null ? `${st.slaRate}%` : '—'}
                    </td>
                    <td className={clsx(TD, 'border-l-2 border-green-800/70', (wa?.handling.conversationsCount ?? 0) > 0 ? 'text-slate-100' : dim)}>
                      {wa?.handling.conversationsCount ?? '—'}
                    </td>
                    <td className={clsx(TD, wa?.csat.avg != null ? 'text-emerald-400' : dim)}>
                      {wa?.csat.avg != null ? wa.csat.avg : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-700 bg-slate-800/40">
                <td className="px-3 py-3 text-xs font-bold uppercase tracking-wider text-slate-400">Total</td>
                <td className={clsx(TD, 'text-slate-100')}>{d.totals.abertos}</td>
                <td className={clsx(TD, 'text-emerald-400')}>{d.totals.resolvidos}</td>
                <td className={clsx(TD, 'text-slate-300')}>{d.resolutionRate !== null ? `${d.resolutionRate}%` : '—'}</td>
                <td className={clsx(TD, 'text-amber-400')}>{d.totals.aguardandoNos}</td>
                <td className={clsx(TD, 'text-orange-400')}>{d.totals.aguardandoFranquia}</td>
                <td className={clsx(TD, 'text-violet-400')}>{d.globalSla !== null ? `${d.globalSla}%` : '—'}</td>
                <td className={clsx(TD, 'text-slate-100 border-l-2 border-green-800/70')}>{d.waConversations}</td>
                <td className={clsx(TD, 'text-emerald-400')}>{d.globalCsat !== null ? d.globalCsat : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        Resolvidos = SAFs abertos <strong>e</strong> resolvidos dentro do mês. SLA = resolvidos no prazo,
        entre os que tinham prazo definido. Conversas e CSAT do WhatsApp vêm do relatório do Chatwoot.
      </p>
    </main>
  );
}
