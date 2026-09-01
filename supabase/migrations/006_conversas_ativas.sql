-- ============================================================
-- MIGRATION 006 — Auditoria de atendimentos ativos
-- Conversas iniciadas pela franqueadora via ChatBot Whats Franquias.
-- Execute via: npm run db:migrate
-- ============================================================

CREATE TABLE IF NOT EXISTS conversas_ativas (
  id            SERIAL PRIMARY KEY,
  -- Identificador do handoff no chatbot; UNIQUE para clique repetido não
  -- gerar duas linhas do mesmo atendimento.
  handoff_id    TEXT NOT NULL UNIQUE,
  chatwoot_conversation_id INTEGER NOT NULL,
  -- Setor do painel onde o atendente clicou (nosso slug, não o do chatbot)
  sector_slug   TEXT,

  -- Cadastro do chatbot: guardamos id E nome. O id serve para rastrear, o
  -- nome para o relatório continuar legível se o cadastro dele mudar depois.
  unit_id              TEXT NOT NULL,
  unit_name            TEXT,
  whatsapp_number_id   TEXT NOT NULL,
  whatsapp_number      TEXT,
  department_id        TEXT NOT NULL,
  department_name      TEXT,
  subdepartment_id     TEXT NOT NULL,
  subdepartment_name   TEXT,
  subject_id           TEXT NOT NULL,
  subject_name         TEXT,

  -- Quem abriu, sempre vindo da sessão (nunca do corpo da requisição)
  agent_id      TEXT NOT NULL,
  agent_name    TEXT NOT NULL,
  agent_email   TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversas_ativas_conv
  ON conversas_ativas (chatwoot_conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversas_ativas_periodo
  ON conversas_ativas (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversas_ativas_setor
  ON conversas_ativas (sector_slug, created_at DESC);
