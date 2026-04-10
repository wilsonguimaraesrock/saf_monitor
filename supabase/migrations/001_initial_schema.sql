-- ============================================================
-- SCHEMA INICIAL — MONITORAMENTO DE SAFs
-- Execute no SQL Editor do Supabase ou via psql
-- ============================================================

-- ENUM: categorias prioritárias
CREATE TYPE saf_priority_category AS ENUM (
  'dsa_joy',
  'myrock',
  'plataformas_aulas',
  'suporte_emails',
  'outros',
  'nao_classificado'
);

-- ENUM: status do ticket
CREATE TYPE saf_status AS ENUM (
  'aberto',
  'em_andamento',
  'aguardando_nossa_resposta',
  'aguardando_franquia',
  'resolvido',
  'cancelado'
);

-- ENUM: severidade do alerta
CREATE TYPE alert_severity AS ENUM ('info', 'warning', 'critical');

-- -------------------------------------------------------
-- TABELA: saf_tickets
-- Representa cada chamado/ticket coletado do sistema SAF
-- -------------------------------------------------------
CREATE TABLE saf_tickets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id           TEXT NOT NULL UNIQUE,    -- ID original no sistema dfranquias
  number                TEXT,                    -- Número exibido do ticket
  title                 TEXT NOT NULL,
  description           TEXT,
  status                saf_status NOT NULL DEFAULT 'aberto',
  priority_category     saf_priority_category NOT NULL DEFAULT 'nao_classificado',
  priority_score        INTEGER DEFAULT 0,        -- 0-100
  franchise             TEXT,                    -- Nome da franquia
  service               TEXT,                    -- Serviço/área do SAF
  responsible           TEXT,                    -- Responsável atual
  opened_at             TIMESTAMPTZ,             -- Data de abertura no sistema origem
  due_at                TIMESTAMPTZ,             -- Prazo/SLA
  last_updated_at       TIMESTAMPTZ,             -- Última movimentação no sistema origem
  resolved_at           TIMESTAMPTZ,
  is_overdue            BOOLEAN DEFAULT FALSE,
  days_overdue          INTEGER DEFAULT 0,
  days_open             INTEGER DEFAULT 0,
  days_waiting_us       INTEGER DEFAULT 0,        -- Dias que estamos devendo resposta
  awaiting_our_response BOOLEAN DEFAULT FALSE,
  cluster_id            UUID,                    -- FK para saf_clusters (adicionada depois)
  raw_data              JSONB,                   -- HTML/JSON bruto capturado para auditoria
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saf_tickets_external_id    ON saf_tickets(external_id);
CREATE INDEX idx_saf_tickets_status         ON saf_tickets(status);
CREATE INDEX idx_saf_tickets_priority_cat   ON saf_tickets(priority_category);
CREATE INDEX idx_saf_tickets_priority_score ON saf_tickets(priority_score DESC);
CREATE INDEX idx_saf_tickets_opened_at      ON saf_tickets(opened_at);
CREATE INDEX idx_saf_tickets_is_overdue     ON saf_tickets(is_overdue) WHERE is_overdue = TRUE;
CREATE INDEX idx_saf_tickets_awaiting       ON saf_tickets(awaiting_our_response) WHERE awaiting_our_response = TRUE;

-- -------------------------------------------------------
-- TABELA: saf_ticket_updates
-- Histórico de cada interação/mensagem dentro de um ticket
-- -------------------------------------------------------
CREATE TABLE saf_ticket_updates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES saf_tickets(id) ON DELETE CASCADE,
  author      TEXT,
  content     TEXT,
  is_ours     BOOLEAN DEFAULT FALSE,  -- TRUE = foi nossa equipe que respondeu
  occurred_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_saf_ticket_updates_ticket  ON saf_ticket_updates(ticket_id);
CREATE INDEX idx_saf_ticket_updates_date    ON saf_ticket_updates(occurred_at DESC);

-- -------------------------------------------------------
-- TABELA: saf_ticket_snapshots
-- Snapshot diário de cada ticket para análise de tendência
-- -------------------------------------------------------
CREATE TABLE saf_ticket_snapshots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID NOT NULL REFERENCES saf_tickets(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  status            saf_status,
  priority_score    INTEGER,
  is_overdue        BOOLEAN,
  days_overdue      INTEGER,
  days_open         INTEGER,
  awaiting_our_response BOOLEAN,
  priority_category saf_priority_category,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (ticket_id, snapshot_date)
);

CREATE INDEX idx_snapshots_ticket   ON saf_ticket_snapshots(ticket_id);
CREATE INDEX idx_snapshots_date     ON saf_ticket_snapshots(snapshot_date DESC);

-- -------------------------------------------------------
-- TABELA: saf_categories
-- Regras de classificação por categoria prioritária
-- -------------------------------------------------------
CREATE TABLE saf_categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        saf_priority_category NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  keywords    TEXT[] NOT NULL DEFAULT '{}',  -- palavras-chave para match
  color       TEXT DEFAULT '#6b7280',
  icon        TEXT DEFAULT '📋',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO saf_categories (slug, label, keywords, color, icon) VALUES
  ('dsa_joy',            'DSA JOY',             ARRAY['dsa','joy','dsa joy'],                              '#8b5cf6', '🎮'),
  ('myrock',             'MyRock',              ARRAY['myrock','my rock','rock'],                          '#f97316', '🎸'),
  ('plataformas_aulas',  'Plataformas de Aulas', ARRAY['plataforma','aula','lms','ead','curso','ensino'],   '#06b6d4', '📚'),
  ('suporte_emails',     'Suporte Emails',       ARRAY['email','e-mail','smtp','caixa','outlook','gmail'], '#10b981', '📧'),
  ('outros',             'Outros',               ARRAY[]::TEXT[],                                          '#6b7280', '📋'),
  ('nao_classificado',   'Não Classificado',     ARRAY[]::TEXT[],                                          '#d1d5db', '❓');

-- -------------------------------------------------------
-- TABELA: saf_clusters
-- Grupos de tickets semelhantes por tema/assunto
-- -------------------------------------------------------
CREATE TABLE saf_clusters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label           TEXT NOT NULL,
  keywords        TEXT[] DEFAULT '{}',
  ticket_count    INTEGER DEFAULT 0,
  is_spike        BOOLEAN DEFAULT FALSE,   -- volume anormalmente alto
  spike_threshold INTEGER DEFAULT 5,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- FK de tickets para clusters
ALTER TABLE saf_tickets ADD CONSTRAINT fk_cluster
  FOREIGN KEY (cluster_id) REFERENCES saf_clusters(id) ON DELETE SET NULL;

CREATE INDEX idx_saf_tickets_cluster ON saf_tickets(cluster_id);

-- -------------------------------------------------------
-- TABELA: alerts
-- Alertas gerados e enviados (deduplicação por hash)
-- -------------------------------------------------------
CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type            TEXT NOT NULL,          -- 'overdue','awaiting','oldest','spike','critical'
  severity        alert_severity NOT NULL DEFAULT 'info',
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  hash            TEXT NOT NULL,          -- SHA256 do conteúdo para deduplicação
  sent_via        TEXT[],                 -- ['whatsapp','email']
  sent_at         TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (hash)
);

CREATE INDEX idx_alerts_type       ON alerts(type);
CREATE INDEX idx_alerts_severity   ON alerts(severity);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- -------------------------------------------------------
-- TABELA: cron_runs
-- Log de execuções do agente/scheduler
-- -------------------------------------------------------
CREATE TABLE cron_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type        TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'on_demand'
  status          TEXT NOT NULL DEFAULT 'running',    -- 'running' | 'success' | 'error'
  triggered_by    TEXT,
  tickets_found   INTEGER DEFAULT 0,
  tickets_new     INTEGER DEFAULT 0,
  tickets_updated INTEGER DEFAULT 0,
  alerts_sent     INTEGER DEFAULT 0,
  error_message   TEXT,
  error_stack     TEXT,
  duration_ms     INTEGER,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  finished_at     TIMESTAMPTZ
);

CREATE INDEX idx_cron_runs_status     ON cron_runs(status);
CREATE INDEX idx_cron_runs_started_at ON cron_runs(started_at DESC);

-- -------------------------------------------------------
-- TABELA: daily_stats
-- Snapshot diário de indicadores agregados para histórico
-- -------------------------------------------------------
CREATE TABLE daily_stats (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date                 DATE NOT NULL UNIQUE,
  total_open                INTEGER DEFAULT 0,
  total_overdue             INTEGER DEFAULT 0,
  total_awaiting_our        INTEGER DEFAULT 0,
  total_critical            INTEGER DEFAULT 0,
  total_resolved_today      INTEGER DEFAULT 0,
  avg_response_time_hours   NUMERIC(8,2),
  avg_resolution_time_hours NUMERIC(8,2),
  -- por categoria
  count_dsa_joy             INTEGER DEFAULT 0,
  count_myrock              INTEGER DEFAULT 0,
  count_plataformas_aulas   INTEGER DEFAULT 0,
  count_suporte_emails      INTEGER DEFAULT 0,
  count_outros              INTEGER DEFAULT 0,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- -------------------------------------------------------
-- TABELA: settings
-- Configurações ajustáveis pelo operador sem deploy
-- -------------------------------------------------------
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value, description) VALUES
  ('alert_overdue_min',             '1',   'Mínimo de tickets atrasados para disparar alerta'),
  ('alert_awaiting_days_threshold', '3',   'Dias aguardando resposta para alertar'),
  ('alert_oldest_top_n',            '10',  'Quantos tickets mais antigos listar no alerta'),
  ('alert_volume_spike_percent',    '20',  'Crescimento % no volume que dispara alerta de spike'),
  ('priority_score_overdue_weight', '40',  'Peso do fator "atrasado" no score 0-100'),
  ('priority_score_days_open_cap',  '30',  'Dias máximos considerados no fator idade'),
  ('whatsapp_enabled',              'true','Enviar alertas via WhatsApp'),
  ('scraper_max_pages',             '50',  'Número máximo de páginas no scraping');

-- -------------------------------------------------------
-- FUNÇÃO: atualiza updated_at automaticamente
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_saf_tickets_updated_at
  BEFORE UPDATE ON saf_tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_saf_clusters_updated_at
  BEFORE UPDATE ON saf_clusters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
