-- Migration 007: Classificação de atendimentos (prioridade e complexidade)
-- Permite marcar prioridade (baixa, media, alta, urgente) e complexidade (baixa, media, alta) por conversa.

CREATE TABLE IF NOT EXISTS atendimento_classificacao (
  chatwoot_conversation_id INT PRIMARY KEY,
  prioridade               TEXT CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
  complexidade             TEXT CHECK (complexidade IN ('baixa', 'media', 'alta')),
  updated_by_id            INT,
  updated_by_name          TEXT,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atendimento_classificacao_prio
  ON atendimento_classificacao (prioridade);

CREATE INDEX IF NOT EXISTS idx_atendimento_classificacao_comp
  ON atendimento_classificacao (complexidade);
