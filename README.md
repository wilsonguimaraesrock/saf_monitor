# Atendimento aos Franqueados — Rockfeller

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
- [API pública v1](#api-pública-v1)
- [Painel super admin](#painel-super-admin)
- [Roxy — bot de IA com RAG](#roxy--bot-de-ia-com-rag)
- [Automações](#automações)
- [Rodando localmente](#rodando-localmente)
- [Deploy](#deploy)
- [Adicionando um setor](#adicionando-um-setor)

---

## Visão geral

- **Landing page** — resumo de todos os setores com filtro de mês (`MonthPickerNav`): total de SAFs em aberto no mês, atrasados, aguardando resposta, SLA (%) e indicadores WhatsApp por setor (total do mês, conversas abertas, CSAT); badge verde pulsante no card do setor quando há conversas WhatsApp pendentes; botão **"Conversas WhatsApp"** consolida o backlog de todos os setores com filtros
- **Dashboard por setor** — filtro de mês, filtros de status/franquia, tabelas de tickets, SLA SAF e SLA WhatsApp (após a tabela principal), breakdown por departamento e clusters de assunto
- **Dashboard PD&I** — igual ao genérico + indicadores de atendimentos WhatsApp via Chatwoot (cards, conversas abertas, breakdown, SLA WhatsApp, avaliação CSAT por departamento)
- **Breakdown WhatsApp** — card com 3 abas por setor: **subdepartamento** (contagem + resolvidas), **assunto** (ranking de frequência) e **atendentes** (contagem + CSAT médio)
- **Atribuição de agente inline** — dropdown diretamente na tabela de conversas abertas; ao atribuir, envia mensagem automática no WhatsApp informando o responsável ("Seu atendimento está com *[Nome]*.")
- **Chat nativo Chatwoot** — modal de conversa completo: histórico de mensagens, envio de texto/áudio/imagem, botão Resolver, botão **Transferir** (muda o team/departamento da conversa) e link externo para o Chatwoot
- **Autoria por atendente** — mensagens enviadas pelo dashboard são atribuídas ao atendente logado: com token Chatwoot pessoal cadastrado, usa autoria nativa; sem token, prefixa `*Nome:*` no conteúdo
- **Roxy — bot de IA com RAG** — assistente que responde dúvidas no WhatsApp usando uma base de conhecimento por departamento (busca semântica + GPT-4o); transborda para atendente humano via palavra-chave ou quando não sabe a resposta
- **Backlog mensal Chatwoot** — botão "Backlog do mês" na área WhatsApp exibe histórico de todas as conversas do mês com status, agente e nota CSAT; navegação por mês
- **Resposta a SAFs pelo dashboard** — atendentes respondem tickets do dfranquias diretamente no modal de ticket, com autenticação individual (credenciais por atendente salvas em localStorage)
- **Coleta de dados** — scraper Playwright roda via GitHub Actions a cada hora (seg–sex, 8h–20h BRT) e popula o banco
- **Relatórios Telegram** — enviados 4×/dia via Vercel Crons e a cada hora via GitHub Actions
- **API pública v1** — endpoints REST autenticados por `X-API-Key` para consumo externo; webhooks POST automáticos após cada scraper
- **Painel super admin** — `/admin` com 3 abas: gestão de usuários (email/senha individual), base de conhecimento da Roxy e configuração do bot WhatsApp

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
  ├── src/app/setor/[slug]/page.tsx          src/integrations/openai.ts (RAG)
  ├── src/app/setor/pd-i/page.tsx
  ├── src/app/admin/page.tsx               ← super admin (usuários, RAG, bot)
  ├── src/app/api/v1/                      ← API pública REST
  ├── src/app/api/webhooks/chatwoot/       ← entrada do bot Roxy
  ├── src/lib/month.ts             ← parseMonthParam + ymToDateRange (UTC)
  ├── src/lib/auth.ts              ← JWT (jose) + hash de senha (bcryptjs)
  ├── src/lib/bot.ts               ← orquestração RAG + escalada da Roxy
  ├── src/lib/webhooks.ts          ← buildSectorsPayload + dispatchWebhooks
  ├── src/repository/sectors.ts   ← queries SQL por setor
  ├── src/repository/tickets.ts   ← queries de tickets individuais
  └── src/components/             ← UI (StatCard, TicketTable, SlaPanel…)

Vercel Crons  ──→  /api/cron/report  ──→  Telegram
              ──→  /api/cron/scrape  ──→  dispatchWebhooks  ──→  WEBHOOK_URL_N
WhatsApp ──→ Chatwoot webhook ──→ /api/webhooks/chatwoot ──→ Roxy (RAG + GPT-4o)
```

### Camadas

| Camada | Localização | Responsabilidade |
|---|---|---|
| Scraper | `src/scraper/` + GitHub Actions | Coleta tickets do dfranquias via Playwright |
| Engine | `src/engine/` | Classifica, normaliza e pontua tickets |
| Repository | `src/repository/` | Queries SQL parametrizadas por setor/departamento |
| Integrations | `src/integrations/` | Clientes Chatwoot, Telegram, WhatsApp, OpenAI (embeddings + GPT-4o) |
| Lib | `src/lib/` | Utilitários: `month.ts` (mês UTC), `auth.ts` (JWT + bcrypt), `bot.ts` (RAG/Roxy), `webhooks.ts` (dispatch + payload), `sectors.ts` (config), `db.ts` (pool) |
| UI | `src/app/` + `src/components/` | Server Components Next.js, renderização em tempo real |
| API Routes | `src/app/api/` | Crons, scraper trigger, stats, API v1 pública, admin, webhook do bot |

---

## Setores monitorados

| Slug | Nome | Departamentos (dfranquias) |
|---|---|---|
| `pd-i` | PD&I | DSA JOY, MyRock, My Rock, Plataformas de Aulas, Suporte E-mails |
| `operacoes` | Operações | Atendimento e Sistema de Gestão, Implantação, Relacionamento, Gerencia, Material Didático, Material didático, Pedidos |
| `pedagogico` | Pedagógico | Adults 60', Pedagógico |
| `comercial` | Comercial | Comercial |
| `mkt` | MKT | Relacionamento |
| `treinamentos` | Treinamentos | Rockfeller Academy |
| `financeiro` | Financeiro | Financeiro |

> Os nomes em `departments` devem ser exatamente iguais ao campo Departamento do dfranquias (case-sensitive). Configuração central em `src/lib/sectors.ts`.

---

## Integrações

### dfranquias (scraper + respostas)

- Playwright autentica em `SAF_LOGIN_URL` e coleta tickets de `SAF_LIST_URL`
- Roda via **GitHub Actions** (`.github/workflows/scraper.yml`) a cada hora nos dias úteis das 8h às 20h BRT
- Também pode ser disparado manualmente pelo botão na UI (`ScraperTriggerButton`) via `/api/scraper/trigger`

**Resposta a SAFs pelo dashboard:**
- Atendentes podem responder tickets diretamente do modal de ticket (`TicketModal`)
- Cada atendente usa suas **próprias credenciais do dfranquias** (não a conta compartilhada do scraper)
- As credenciais são salvas no `localStorage` do navegador sob a chave `dfranquias_credentials`
- O modal exibe um formulário de login na primeira abertura; ícone de chave no header permite trocar de conta
- O servidor mantém sessões `PHPSESSID` em cache por usuário (25 min TTL, `Map` por username) em `src/lib/dfranquias-client.ts`
- `SAF_USERNAME` / `SAF_PASSWORD` são usados **exclusivamente pelo scraper** — não para replies
- Rota: `POST /api/tickets/[id]/reply` — recebe `{ content, username, password }`, busca `external_id` no banco, chama `sendDfranquiasReply(safId, message, username, password)`

### Chatwoot (WhatsApp)

**Estrutura atual (mai/2026):** uma única inbox WhatsApp — **"WhatsApp – Rockfeller" (ID 11)** — e cada departamento é um **team** no Chatwoot. Conversas são roteadas entre departamentos por atribuição de team, não por inbox.

- Usado nos setores mapeados em `src/lib/sectors.ts` via `SectorChatwootConfig { teamId, inboxId, inboxName }`:

| Setor (slug) | Team no Chatwoot | Team ID | Inbox compartilhada |
|---|---|---|---|
| `pd-i` | tecnologia | 3 | WhatsApp – Rockfeller (11) |
| `operacoes` | operações | 2 | WhatsApp – Rockfeller (11) |
| `pedagogico` | pedagógico | 7 | WhatsApp – Rockfeller (11) |
| `comercial` | comercial | 5 | WhatsApp – Rockfeller (11) |
| `mkt` | marketing | 4 | WhatsApp – Rockfeller (11) |
| `treinamentos` | rock academy | 8 | WhatsApp – Rockfeller (11) |
| `financeiro` | financeiro | 6 | WhatsApp – Rockfeller (11) |

- Conversas abertas, contagens e **CSAT** filtrados por `team_id` — cada departamento exibe sua própria nota de satisfação
- O dashboard faz polling em `/api/chatwoot/live?sector={slug}` a cada 30s para atualizar cards e conversas abertas sem recarregar a página inteira
- **Requer token com papel de Administrador** no Chatwoot (Settings → Agents → promover para Administrator)
- Configuração: `src/integrations/chatwoot.ts`

**Endpoints da API Chatwoot utilizados:**

| Endpoint | Uso |
|---|---|
| `GET /conversations?status=open&team_id={id}` | Conversas abertas ao vivo por departamento |
| `GET /conversations?status={status}&team_id={id}` | Contagens por status por departamento |
| `GET /conversations?status={status}&inbox_id={id}&team_id={id}&page={n}` | Paginação para backlog (filtra por inbox **e** team — consistente com os totais por setor) |
| `GET /csat_survey_responses?inbox_id={id}&team_id={id}&since={unix}` | CSAT do mês corrente por departamento |
| `GET /reports/summary?since={unix}&until={unix}&id={teamId}&type=team` | Total de conversas abertas no mês por team |
| `GET /agents` | Lista todos os agentes da conta |
| `GET /messages` via `/api/chatwoot/conversation/[id]` | Histórico da conversa |
| `POST /messages` via `/api/chatwoot/conversation/[id]` | Envio de mensagem/áudio/imagem |
| `POST /toggle_status` via `PATCH /api/chatwoot/conversation/[id]` | Resolver conversa |
| `POST /assignments` via `PUT /api/chatwoot/conversation/[id]` | Atribuir agente `{ assignee_id }` ou transferir team `{ team_id }` |
| `GET /teams` via `/api/chatwoot/transfer` | Listar teams disponíveis para transferência |

**Rotas internas da API Next.js (Chatwoot):**

| Rota | Método | Função |
|---|---|---|
| `/api/chatwoot/live` | GET | Polling 30s — dados ao vivo por setor |
| `/api/chatwoot/agents` | GET | Lista agentes da conta `{ agents: [{id, name, available}] }` |
| `/api/chatwoot/breakdown` | GET | Breakdown do mês por team (`?teamId=X&inboxId=Y`) — agrega por subdep, assunto e atendente+CSAT |
| `/api/chatwoot/conversation/[id]` | GET | Histórico de mensagens |
| `/api/chatwoot/conversation/[id]` | POST | Enviar mensagem (texto ou multipart) |
| `/api/chatwoot/conversation/[id]` | PATCH | Resolver conversa |
| `/api/chatwoot/conversation/[id]` | PUT | Atribuir agente `{ agentId }` ou transferir team `{ teamId }` |
| `/api/chatwoot/transfer` | GET | Listar teams `{ teams: [{id, name}] }` |
| `/api/chatwoot/backlog` | GET | Conversas do mês com CSAT (`?inboxId=X&teamId=Y&month=YYYY-MM`) — filtra por inbox **e** team |
| `/api/chatwoot/global-backlog` | GET | Conversas do mês de **todos os setores** (`?month=YYYY-MM`) — agrega os 7 times em paralelo |

**Layout dos cards por setor (ordem):**

1. Indicadores ao vivo (ChatwootPanel)
2. Conversas abertas agora (ChatwootConversationTable) — com dropdown de atribuição de agente
3. Breakdown do mês (ChatwootBreakdownCard)
4. Filtros + Tabela principal de SAFs
5. SLA dos SAFs (SlaPanel)
6. SLA WhatsApp (ChatwootSlaPanelLive — polling independente de 30s)
7. Tabelas secundárias (atrasados, aguardando, mais antigos…)

**Componentes Chatwoot:**

| Componente | Função |
|---|---|
| `SectorChatwootLiveSection` | Container ao vivo com polling 30s, status, botão "Backlog do mês", Panel e ConversationTable |
| `ChatwootPanel` | Cards de métricas: abertos, pendentes, resolvidos, CSAT |
| `ChatwootBreakdownCard` | 3 abas: por subdepartamento (+ resolvidas), por assunto, por atendente (+ CSAT) |
| `ChatwootSlaPanel` | SLA: atribuição %, espera >1h, >24h, média (componente presentacional) |
| `ChatwootSlaPanelLive` | Wrapper autônomo com polling 30s — renderiza ChatwootSlaPanel com dados vivos |
| `ChatwootConversationTable` | Tabela de conversas abertas com **dropdown inline de atribuição de agente**; botão "Backlog do mês" |
| `ChatwootConversationModal` | Chat nativo: histórico, texto, áudio, imagem, Resolver, **Transferir** (select de team) |
| `ChatwootBacklogModal` | Backlog mensal por setor: todas as conversas com status e CSAT; navegação prev/next mês |
| `GlobalChatwootBacklogModal` | Backlog global: consolida conversas de **todos os setores** com filtro de Setor, Escola, Departamento e Assunto |
| `GlobalChatwootButton` | Botão na landing page que abre o `GlobalChatwootBacklogModal`; exibe total consolidado do mês |

**Atribuição de agente inline:**
- Coluna "Agente" na tabela de conversas abertas é clicável
- Clique carrega a lista de agentes (`GET /api/chatwoot/agents`) e exibe um `<select>` in-place
- Ao selecionar: `PUT /api/chatwoot/conversation/{id}` com `{ agentId }` → Chatwoot `POST /assignments` com `{ assignee_id }`
- Após atribuição bem-sucedida: envia automaticamente no WhatsApp **"Seu atendimento está com *[Nome do Agente]*."**
- Atualização otimista da linha — sem reload de página

Indicadores exibidos no painel "Atendimentos WhatsApp":
- Conversas abertas, não atribuídas, pendentes, resolvidas, adiadas
- **Avaliação média CSAT do mês** por departamento (escala 1–5, colorida: ≥4.0 verde / ≥3.0 amarelo / <3.0 vermelho); vazio quando não há avaliações no mês corrente

**Filtro de mês (MonthPickerNav):**
- Disponível na landing page e em todos os dashboards de setor (incluindo PD&I)
- Permite navegar para meses anteriores via `?month=YYYY-MM` na URL
- Mês atual é o padrão (sem parâmetro na URL); botão "Hoje" redefine para o mês corrente
- Ao navegar para mês histórico, as contagens de SAFs e WA mostram os totais daquele período

**Cards da landing page (por setor com WhatsApp):**
- Badge verde pulsante (`animate-pulse`) com ícone WhatsApp + contagem aparece ao lado do nome do setor quando há conversas **pendentes** (`status=pending`)
- `X total` — soma de open + pending + resolved + snoozed via `getConversationMeta` por status (mesma fonte do painel interno do setor)
- `X abertas` — conversas em aberto no momento (ocultadas em meses históricos)
- Tempo médio de espera (ocultado em meses históricos) + CSAT do mês por setor
- Em meses históricos: `getChatwootLandingStats` usa `getHistoricalMonthlyCount` (todos os 4 status, filtro `created_at` pelo range do mês)

**Cards da landing page (SAFs por setor):**
- Número grande = SAFs **em aberto** no mês selecionado (status NOT IN resolvido/cancelado)
- `X no mês` abaixo = total de SAFs abertos no mês (incluindo todos os status) — exibido apenas quando difere do número grande
- Em meses históricos: conta todos os tickets do período (sem filtro de status), pois todos já foram resolvidos/cancelados
- Contagem idêntica ao card "Todos" dentro do dashboard do setor (mesma query `getSectorStats`)

**ChatwootPanel (painel de atendimentos):**
- Fontes aumentadas: label `text-sm`, número `text-4xl`, subtítulo `text-sm`; ícones 15px

Tabela de conversas abertas com etiquetas coloridas (hash determinístico → cor Tailwind); clique na linha abre o modal de chat nativo.

**Backlog do mês (por setor):**
- Botão laranja "Backlog do mês" no header do card "CONVERSAS ABERTAS"
- Busca conversas de todos os status (open/resolved/pending/snoozed) do mês selecionado filtrando por `inbox_id` **e** `team_id` — garantindo contagem consistente com o card "X total" da landing
- Pagina até 6 páginas × 25 por status, para quando encontra itens anteriores ao mês
- Exibe nota CSAT por conversa (estrelas 1–5) e feedback textual quando disponível
- CSAT buscado com paginação (até 6 páginas), filtrando por `inbox_id` **e** `team_id`; casa por `conversation_id` direto **ou** `conversation.id` aninhado (varia por versão do Chatwoot)
- Navegação entre meses (mês atual é o limite superior)
- Clicar em uma conversa abre o modal de chat nativo para responder

**Backlog global (landing page):**
- Botão "Conversas WhatsApp" ao lado do título "Setores" na landing page — badge com total consolidado do mês
- Abre `GlobalChatwootBacklogModal`: agrega conversas de todos os 7 setores em paralelo (até 8 chamadas concorrentes)
- CSAT buscado em uma única chamada para a inbox compartilhada
- Filtros: **Setor** (select), Escola/Unidade, Departamento, Assunto
- Coluna extra "Setor" (badge laranja) na tabela; demais colunas idênticas ao backlog por setor
- Limite de 200 conversas por requisição para manter performance

**Estrutura da resposta CSAT (`/csat_survey_responses`):**
```json
{
  "id": 1,
  "rating": 5,
  "feedback_message": "",
  "conversation_id": 53,
  "contact": { "id": 62, "name": "...", "phone_number": "..." },
  "created_at": 1777926417
}
```
> `rating` é numérico (1–5). O join com conversas usa `conversation_id` (campo direto) com fallback para `conversation.id` aninhado, pois o formato varia entre versões do Chatwoot.

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
| `users` | Usuários do dashboard (email, senha hash bcrypt, role, departments, is_active, chatwoot_token) |
| `knowledge_base` | Artigos da base de conhecimento da Roxy (title, content, category, department, embedding `FLOAT8[]`, is_active) |
| `bot_settings` | Configuração do bot (key-value): `test_phone_numbers`, `enabled_departments`, `system_prompt` |
| `bot_conversations` | Estado da conversa do bot por `chatwoot_conversation_id` (active / awaiting_escalation / escalated / resolved) |

> As tabelas `users`, `knowledge_base`, `bot_settings` e `bot_conversations` são criadas/atualizadas via `POST /api/cron/migrate` (idempotente).

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
| `SAF_BASE_URL` | URL base do dfranquias (ex: `https://app.dfranquias.com.br`) |
| `SAF_LOGIN_URL` | Página de login |
| `SAF_LIST_URL` | Listagem de SAFs |
| `SAF_USERNAME` | Usuário da **conta compartilhada** — usado apenas pelo scraper |
| `SAF_PASSWORD` | Senha da **conta compartilhada** — usado apenas pelo scraper |

> Replies de atendentes usam credenciais individuais armazenadas no `localStorage` do navegador — não precisam de variável de ambiente.

### Chatwoot

| Variável | Descrição |
|---|---|
| `CHATWOOT_BASE_URL` | URL da instância (ex: `https://chatwoot.exemplo.com`) |
| `CHATWOOT_ACCOUNT_ID` | ID da conta (padrão `1`) |
| `CHATWOOT_API_TOKEN` | Token compartilhado — **deve ser de um Administrador**; usado como fallback quando o atendente não tem token pessoal |
| `CHATWOOT_WEBHOOK_SECRET` | (Opcional) Segredo para validar `x-chatwoot-signature` no webhook da Roxy |

> Cada atendente pode ter um **Access Token pessoal do Chatwoot** cadastrado no painel admin (campo "Token Chatwoot"). Quando presente, as mensagens enviadas por ele têm autoria nativa no Chatwoot.

### Bot Roxy / IA (RAG)

| Variável | Descrição |
|---|---|
| `OPENAI_API_KEY` | Chave da OpenAI — usada para embeddings (`text-embedding-3-small`) e respostas (`gpt-4o`) |

### Telegram

| Variável | Descrição |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token do bot |
| `TELEGRAM_CHAT_ID` | Chat ID do grupo Geral |
| `TELEGRAM_CHAT_ID_PDI` | Chat ID do grupo PD&I |
| `TELEGRAM_CHAT_ID_OPERACOES` | Chat ID do grupo Operações |
| `TELEGRAM_CHAT_ID_PEDAGOGICO` | Chat ID Pedagógico |
| `TELEGRAM_CHAT_ID_COMERCIAL` | Chat ID Comercial |
| `TELEGRAM_CHAT_ID_MKT` | Chat ID MKT |
| `TELEGRAM_CHAT_ID_TREINAMENTOS` | Chat ID Treinamentos |
| `TELEGRAM_CHAT_ID_FINANCEIRO` | Chat ID Financeiro |

> Se `TELEGRAM_CHAT_ID_OPERACOES` não estiver configurado, o código usa os grupos legados `TELEGRAM_CHAT_ID_ATENDIMENTO_ADM` e `TELEGRAM_CHAT_ID_MATERIAL_DIDATICO` como fallback.

### Autenticação (dashboard)

| Variável | Descrição |
|---|---|
| `JWT_SECRET` | Segredo para assinar JWTs de sessão — gere com `openssl rand -hex 32` |
| `SUPERADMIN_EMAIL` | Email do super admin criado na migration inicial |
| `SUPERADMIN_PASSWORD` | Senha do super admin criado na migration inicial |

> Após configurar as variáveis, rode `POST /api/cron/migrate` (com header `Authorization: Bearer <CRON_SECRET>`) uma única vez para criar a tabela `users` e o super admin. Depois acesse `/admin` para gerenciar usuários.

### API pública v1

| Variável | Descrição |
|---|---|
| `SAF_API_KEY` | Chave para autenticar consumidores externos — gere com `openssl rand -hex 32` |
| `WEBHOOK_URL_1` | URL para receber payload POST após cada scraper (opcional) |
| `WEBHOOK_URL_2` | Segunda URL de webhook (opcional; adicione quantas precisar) |
| `WEBHOOK_SECRET` | Segredo para assinar `X-SAF-Signature: sha256=<hex>` no payload (opcional) |

### Vercel

| Variável | Descrição |
|---|---|
| `VERCEL_APP_URL` | URL pública do deploy (ex: `https://safs.vercel.app`) |

---

## API pública v1

Endpoints REST para consumo externo. Autenticação via header `X-API-Key: <SAF_API_KEY>`.

### Endpoints

| Método | Endpoint | Auth | Descrição |
|---|---|---|---|
| `GET` | `/api/v1/health` | — | Status do banco; sem autenticação |
| `GET` | `/api/v1/sectors` | ✓ | Stats + SLA + WhatsApp de todos os setores |
| `GET` | `/api/v1/sectors/:slug` | ✓ | Setor individual (ex: `pd-i`, `operacoes`) |
| `GET` | `/api/v1/global` | ✓ | Totais consolidados de todos os setores |

Todos aceitam `?month=YYYY-MM` para filtrar por mês histórico.

### Formato de resposta

```json
{
  "month": "2026-06",
  "timestamp": "2026-06-01T18:00:00.000Z",
  "sectors": [
    {
      "slug": "pd-i",
      "name": "PD&I",
      "safs": { "open": 16, "overdue": 6, "awaiting": 12, "monthTotal": 44, "resolvedToday": 2 },
      "sla":  { "rate": 39, "atRisk": 1, "avgResolutionDays": 5.2, "avgFirstResponseHours": 3.1, "noDeadline": 8 },
      "whatsapp": { "open": 0, "pending": 3, "monthlyTotal": 8, "csatAvg": 4.6 },
      "subdepartments": [...]
    }
  ]
}
```

### Webhooks

Após cada execução do scraper (`/api/cron/scrape`), o servidor faz `POST` para `WEBHOOK_URL_1`, `WEBHOOK_URL_2`, etc. com o payload completo:

```json
{ "event": "scraper_complete", "timestamp": "...", "data": { "month": "...", "sectors": [...] } }
```

Se `WEBHOOK_SECRET` estiver configurado, o header `X-SAF-Signature: sha256=<hmac-hex>` é enviado para verificação.

## Painel super admin

Acessível em `/admin` — exclusivo para usuários com `role = superadmin`. Organizado em 3 abas.

**Aba Usuários:**
- Listar todos os usuários com status ativo/inativo
- Criar usuário: email, nome, senha, função (superadmin / usuário), departamentos designados, token Chatwoot
- Editar usuário: email, nome, departamentos, função, token Chatwoot
- Alterar senha individual
- Ativar / desativar usuário (toggle)
- Remover usuário (com confirmação)

**Aba Base de Conhecimento (RAG da Roxy):**
- Artigos por departamento (ou `global`) com título, conteúdo e categoria
- Criar artigo manualmente (texto) ou **importar PDF** (extraído, dividido em chunks de ~1500 chars e vetorizado automaticamente)
- Embedding gerado via OpenAI ao salvar (`text-embedding-3-small`)
- Filtro por departamento, toggle ativo/inativo, edição e remoção

**Aba Bot WhatsApp:**
- Toggle de ativação do bot **por departamento**
- **Números de teste** — bot só responde a esses números (vazio = responde a todos os departamentos ativos)
- Edição do **prompt do sistema** da Roxy

**Setup inicial (uma única vez):**
```bash
curl -X POST https://<seu-dominio>/api/cron/migrate \
  -H "Authorization: Bearer <CRON_SECRET>"
```

---

## Roxy — bot de IA com RAG

Assistente de IA que responde dúvidas no WhatsApp usando a base de conhecimento por departamento.

**Pipeline** (`src/lib/bot.ts` + `src/integrations/openai.ts`):
1. Webhook do Chatwoot (`POST /api/webhooks/chatwoot`, evento `message_created`) recebe a mensagem `incoming`
2. Valida número de teste e se o bot está habilitado para o departamento (mapeado por `teamId` do Chatwoot)
3. Gera embedding da pergunta e busca por similaridade de cosseno na `knowledge_base` do departamento
4. **Ancoragem em documento**: prioriza chunks do documento com melhor match (evita misturar assuntos), top-6 trechos
5. GPT-4o responde usando **somente** o contexto recuperado (grounding forte; se não souber, oferece transbordo)
6. Mostra "digitando…" enquanto processa; envia resposta + pergunta de escalada

**Fluxo de escalada:**
- 1ª interação: mensagem de boas-vindas da Roxy personalizada (nome + assunto), sem o usuário repetir a dúvida
- Palavras-chave (`ATENDENTE`, `HUMANO`, `CONSULTOR`, `NÃO`) → transborda para o time humano no Chatwoot
- Estado da conversa rastreado em `bot_conversations`

**Configuração do webhook no Chatwoot:**
`Settings → Integrations → Webhooks → New Webhook` → URL `https://<dominio>/api/webhooks/chatwoot` → evento `message_created`.

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
  // Opcional — para exibir conversas WhatsApp:
  chatwoot: {
    teamId:    X,    // ID do team no Chatwoot (GET /teams para listar)
    inboxId:   11,   // sempre 11 (inbox única WhatsApp – Rockfeller)
    inboxName: 'WhatsApp – Rockfeller',
  },
}
```

2. Adicione o chat ID Telegram em `getSectorTelegramChatIds` e como variável de ambiente no Vercel e GitHub.

3. Faça deploy — o dashboard genérico (`src/app/setor/[slug]/page.tsx`) é criado automaticamente.

> Para um setor com indicadores especiais (como PD&I), crie uma página dedicada em `src/app/setor/<slug>/page.tsx`.
>
> Para descobrir o `teamId` de um novo departamento: `GET /api/v1/accounts/{id}/teams` no Chatwoot ou use o endpoint `/api/chatwoot/discover` da aplicação.
