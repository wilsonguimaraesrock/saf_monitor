-- ============================================================
-- MIGRATION 003 — Coluna department + tabela sector_contacts
-- Execute via: npx ts-node scripts/migrate.ts
-- ============================================================

-- 1. Adiciona coluna department em saf_tickets
--    Armazena o valor exato da coluna "Departamento" do dfranquias
--    (ex: "DSA JOY", "MyRock", "Comercial", "Pedagógico")
ALTER TABLE saf_tickets
  ADD COLUMN IF NOT EXISTS department VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_saf_tickets_department
  ON saf_tickets (department);

-- 2. Backfill: popula department a partir de priority_category para tickets PD&I existentes
--    Ajuste os nomes de departamento conforme aparecem no dfranquias se necessário.
UPDATE saf_tickets SET department = 'DSA JOY'             WHERE priority_category = 'dsa_joy'           AND department IS NULL;
UPDATE saf_tickets SET department = 'MyRock'              WHERE priority_category = 'myrock'             AND department IS NULL;
UPDATE saf_tickets SET department = 'Plataformas de Aulas' WHERE priority_category = 'plataformas_aulas' AND department IS NULL;
UPDATE saf_tickets SET department = 'Suporte E-mails'     WHERE priority_category = 'suporte_emails'     AND department IS NULL;

-- 3. Tabela de contatos Telegram por setor
--    Cada setor pode ter múltiplos chat IDs (grupos ou pessoas)
CREATE TABLE IF NOT EXISTS sector_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_slug  VARCHAR(100) NOT NULL,   -- ex: 'pd-i', 'comercial', 'geral'
  name         VARCHAR(255) NOT NULL,   -- nome do contato/grupo para exibição
  telegram_chat_id TEXT NOT NULL,       -- chat ID do Telegram (número negativo para grupos)
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sector_contacts_slug
  ON sector_contacts (sector_slug)
  WHERE active = true;

-- Exemplo de inserção (descomente e ajuste com os chat IDs reais após configurar o bot):
-- INSERT INTO sector_contacts (sector_slug, name, telegram_chat_id) VALUES
--   ('geral',    'SAF Geral',  '-100xxxxxxxxxx'),
--   ('pd-i',     'SAF PD&I',   '-100xxxxxxxxxx');
