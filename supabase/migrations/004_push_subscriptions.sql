-- ============================================================
-- MIGRATION 004 — Inscrições Web Push
-- Execute via: npm run db:migrate
-- ============================================================

-- Uma linha por navegador/dispositivo inscrito. O endpoint é único e é o
-- identificador que o push service (FCM, Mozilla, WNS) devolve ao navegador.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint     TEXT PRIMARY KEY,
  p256dh       TEXT NOT NULL,           -- chave pública do cliente (criptografia do payload)
  auth         TEXT NOT NULL,           -- segredo de autenticação do cliente
  user_email   VARCHAR(255),            -- quem inscreveu (para auditoria/limpeza)
  user_agent   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_email
  ON push_subscriptions (user_email);
