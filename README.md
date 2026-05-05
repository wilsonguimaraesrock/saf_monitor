# Monitoramento de SAFs — Rockfeller

Dashboard em tempo real para acompanhamento de SAFs (Solicitações de Apoio Franqueado) do sistema **dfranquias.com.br**, com integração Chatwoot para monitoramento de atendimentos via WhatsApp.

Deployado em Vercel · banco PostgreSQL (Digital Ocean) · notificações via Telegram.

---

## Índice

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Setores monitorados](#setores-monitorados)
- [Integrações](#integrações)
- [Banco de dados](#banco-de-dados)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Automações](#automações)
- [Rodando localmente](#rodando-localmente)
- [Deploy](#deploy)
- [Adicionando um setor](#adicionando-um-setor)

---

## Visão geral

- **Landing page** — resumo de todos os setores: total de SAFs abertos, atrasados, aguardando resposta e SLA (%) por setor
- **Dashboard por setor** — filtros, tabelas de tickets, SLA, breakdown por departamento e clusters de assunto
- **Dashboard PD&I** — igual ao genérico + indicadores de atendimentos WhatsApp via Chatwoot (cards, SLA WhatsApp, tabela de conversas abertas, avaliação CSAT média)
- **Coleta de dados** — scraper Playwright roda via GitHub Actions a cada hora (seg–sex, 8h–20h BRT) e popula o banco
- **Relatórios Telegram** — enviados 4×/dia via Vercel Crons e a cada hora via GitHub Actions

### UI

- Header laranja gradiente (`from-orange-500 to-amber-500`) com logo Rockfeller branca em todas as páginas; dark mode mantém fundo slate-900
- Cards de indicadores com cores sólidas em gradiente no light mode e altura uniforme (`h-full`)
- Card "Todos" com fundo cinza gradiente no light mode
- SLA medido a partir de 2026-05-01; exibido em todas as páginas de setor e na landing

---

## Arquitetura

```
GitHub Actions (Playwright scraper)
        │ escreve
        ▼
  PostgreSQL (Digital Ocean)
        │ lê
        ▼
  Next.js App Router (Vercel)          ←→  Chatwoot API (WhatsApp)
  ├── src/app/page.tsx                       src/integrations/chatwoot.ts
  ├── src/app/setor/[slug]/page.tsx
  ├── src/app/setor/pd-i/page.tsx
  ├── src/repository/sectors.ts   ← queries SQL por setor
  ├── src/repository/tickets.ts   ← queries de tickets individuais
  └── src/components/             ← UI (StatCard, TicketTable, SlaPanel…)

Vercel Crons  ──→  /api/cron/report  ──→  Telegram
```

### Camadas

| Camada | Localização | Responsabilidade |
|---|---|---|
| Scraper | `src/scraper/` + GitHub Actions | Coleta tickets do dfranquias via Playwright |
| Engine | `src/engine/` | Classifica, normaliza e pontua tickets |
| Repository | `src/repository/` | Queries SQL parametrizadas por setor/departamento |
| Integrations | `src/integrations/` | Clientes Chatwoot, Telegram, WhatsApp |
| UI | `src/app/` + `src/components/` | Server Components Next.js, renderização em tempo real |
| API Routes | `src/app/api/` | Crons, scraper trigger, stats, debug |

---

## Setores monitorados

| Slug | Nome | Departamentos (dfranquias) |
|---|---|---|
| `pd-i` | PD&I | DSA JOY, MyRock, My Rock, Plataformas de Aulas, Suporte E-mails |
| `atendimento-adm` | Atendimento ADM | Atendimento e Sistema de Gestão, Implantação, Relacionamento, Gerencia |
| `material-didatico` | Material Didático | Material Didático, Material didático, Pedidos |
| `pedagogico` | Pedagógico | Adults 60', Pedagógico |
| `comercial` | Comercial | Comercial |
| `mkt` | MKT | Relacionamento |
| `treinamentos` | Treinamentos | Rockfeller Academy |
| `financeiro` | Financeiro | Financeiro |

> Os nomes em `departments` devem ser exatamente iguais ao campo Departamento do dfranquias (case-sensitive). Configuração central em `src/lib/sectors.ts`.

---

## Integrações

### dfranquias (scraper)

- Playwright autentica em `SAF_LOGIN_URL` e coleta tickets de `SAF_LIST_URL`
- Roda via **GitHub Actions** (`.github/workflows/scraper.yml`) a cada hora nos dias úteis das 8h às 20h BRT
- Também pode ser disparado manualmente pelo botão na UI (`ScraperTriggerButton`) via `/api/scraper/trigger`

### Chatwoot (WhatsApp)

- Usado apenas no setor **PD&I**, inbox **Tecnologia** (ID 9)
- Endpoints utilizados:
  - `GET /conversations?status=open&inbox_id=9` — conversas abertas (campo `assignee` está em `meta.assignee`)
  - `GET /conversations?status={status}&inbox_id=9` — contagens por status (open/pending/resolved/snoozed)
  - `GET /csat_survey_responses?inbox_id=9&since={unix}` — avaliações CSAT (últimos 30 dias, rating 1–5)
- **Requer token com papel de Administrador** no Chatwoot (Settings → Agents → promover para Administrator)
- Configuração: `src/integrations/chatwoot.ts`

Indicadores exibidos no painel "Atendimentos WhatsApp":
- Conversas abertas, não atribuídas, pendentes, resolvidas, adiadas
- **Avaliação média CSAT** (escala 1–5, colorida: ≥4.0 verde / ≥3.0 amarelo / <3.0 vermelho)

Painel "SLA WhatsApp":
- Taxa de atribuição (%), aguardando >1h, aguardando >24h, espera média

Tabela de conversas abertas com etiquetas coloridas (hash determinístico → cor Tailwind) e link direto para o Chatwoot.

### Telegram

- Relatórios automáticos por setor + relatório geral consolidado
- Configurado por setor via `TELEGRAM_CHAT_ID_<SETOR>` (ver env vars)
- Disparo: 4× ao dia via Vercel Crons + a cada hora via GitHub Actions

---

## Banco de dados

PostgreSQL (Digital Ocean). Tabelas principais:

| Tabela | Conteúdo |
|---|---|
| `saf_tickets` | Tickets normalizados (status, department, due_at, resolved_at, is_overdue…) |
| `saf_ticket_updates` | Histórico de atualizações, campo `is_ours` para calcular 1ª resposta |
| `saf_clusters` | Agrupamentos de tickets por assunto (keywords, is_spike) |
| `saf_daily_stats` | Snapshots diários para gráfico de tendência |
| `sector_contacts` | Chat IDs Telegram por setor |
| `cron_runs` | Log de execuções do scraper/cron |

### SLA

- Medição começa em tickets criados a partir de **2026-05-01** (`SLA_START` em `src/repository/sectors.ts`)
- Taxa SLA = tickets resolvidos dentro do prazo (`resolved_at <= due_at`) ÷ total resolvidos com prazo
- Em risco = tickets abertos com `due_at` entre agora e +48h
- Exibido em cada dashboard de setor (`SlaPanel`) e resumido na landing page (% + em risco por card de setor)
- 1ª resposta SAF calculada via `LATERAL JOIN` em `saf_ticket_updates` (primeira atualização com `is_ours = true`)

---

## Variáveis de ambiente

### Banco

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL |
| `DATABASE_SSL` | `true` para Digital Ocean |

### dfranquias (scraper)

| Variável | Descrição |
|---|---|
| `SAF_BASE_URL` | URL base do dfranquias |
| `SAF_LOGIN_URL` | Página de login |
| `SAF_LIST_URL` | Listagem de SAFs |
| `SAF_USERNAME` | Usuário |
| `SAF_PASSWORD` | Senha |

### Chatwoot

| Variável | Descrição |
|---|---|
| `CHATWOOT_BASE_URL` | URL da instância (ex: `https://chatwoot.exemplo.com`) |
| `CHATWOOT_ACCOUNT_ID` | ID da conta (padrão `1`) |
| `CHATWOOT_API_TOKEN` | Token de acesso — **deve ser de um Administrador** |

### Telegram

| Variável | Descrição |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do bot |
| `TELEGRAM_CHAT_ID` | Chat ID do grupo Geral |
| `TELEGRAM_CHAT_ID_PDI` | Chat ID do grupo PD&I |
| `TELEGRAM_CHAT_ID_ATENDIMENTO_ADM` | Chat ID Atendimento ADM |
| `TELEGRAM_CHAT_ID_MATERIAL_DIDATICO` | Chat ID Material Didático |
| `TELEGRAM_CHAT_ID_PEDAGOGICO` | Chat ID Pedagógico |
| `TELEGRAM_CHAT_ID_COMERCIAL` | Chat ID Comercial |
| `TELEGRAM_CHAT_ID_MKT` | Chat ID MKT |
| `TELEGRAM_CHAT_ID_TREINAMENTOS` | Chat ID Treinamentos |
| `TELEGRAM_CHAT_ID_FINANCEIRO` | Chat ID Financeiro |

### Autenticação (dashboard)

| Variável | Descrição |
|---|---|
| `DASHBOARD_PASSWORD` | Senha de acesso ao dashboard |
| `JWT_SECRET` | Segredo para assinar tokens de sessão |

### Vercel

| Variável | Descrição |
|---|---|
| `VERCEL_APP_URL` | URL pública do deploy (ex: `https://safs.vercel.app`) |

---

## Automações

### Vercel Crons (`vercel.json`)

Chamam `/api/cron/report` e enviam relatório Telegram:

| Horário UTC | Horário BRT |
|---|---|
| 11h (seg–sex) | 08h |
| 16h (seg–sex) | 13h |
| 20h (seg–sex) | 17h |
| 22h (seg–sex) | 19h |

### GitHub Actions

| Workflow | Arquivo | Frequência |
|---|---|---|
| Scraper SAF | `.github/workflows/scraper.yml` | A cada hora, seg–sex, 8h–20h BRT |
| Relatório Horário | `.github/workflows/hourly-report.yml` | A cada hora, seg–sex, 8h–20h BRT |

Secrets necessários no repositório GitHub: `DATABASE_URL`, `DATABASE_SSL`, `SAF_*`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `VERCEL_APP_URL`.

---

## Assets estáticos

| Arquivo | Localização | Uso |
|---|---|---|
| `logo-rockfeller-branca.png` | `public/` | Logo branca exibida no header de todas as páginas |

## Rodando localmente

```bash
# 1. Instalar dependências
npm install

# 2. Criar arquivo de ambiente
cp .env.example .env.local
# Preencher as variáveis necessárias

# 3. Iniciar o servidor de desenvolvimento
npm run dev
```

O dashboard fica disponível em `http://localhost:3000`.

Para rodar o scraper localmente:

```bash
npm run scraper:run
```

---

## Deploy

O projeto usa Vercel com deploy automático via push na branch `main`.

```bash
# Deploy manual via CLI
vercel --prod
```

Variáveis de ambiente devem ser configuradas no painel da Vercel em **Settings → Environment Variables**.

---

## Adicionando um setor

1. Abra `src/lib/sectors.ts` e adicione um objeto ao array `SECTORS`:

```typescript
{
  slug:        'novo-setor',
  name:        'Novo Setor',
  departments: ['Departamento Exato no dfranquias'],
  icon:        IconComponent,  // lucide-react
  color:       'cyan',
}
```

2. Adicione o chat ID Telegram em `getSectorTelegramChatIds` e como variável de ambiente no Vercel e GitHub.

3. Faça deploy — o dashboard genérico (`src/app/setor/[slug]/page.tsx`) é criado automaticamente.

> Para um setor com indicadores especiais (como Chatwoot no PD&I), crie uma página dedicada em `src/app/setor/<slug>/page.tsx`.
