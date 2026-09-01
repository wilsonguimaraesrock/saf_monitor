-- ============================================================
-- MIGRATION 005 — Cadastro de unidades e contatos de WhatsApp
-- Base do "iniciar conversa" (conversa ativa da franqueadora → escola).
-- Execute via: npm run db:migrate
-- ============================================================

-- Três estados, não dois: unidade encerrada (ex: BH Prado) não é a mesma
-- coisa que unidade operando sem número cadastrado. Sem essa distinção, a
-- escola fechada ficaria para sempre na lista de "faltando telefone".
DO $$ BEGIN
  CREATE TYPE unidade_status AS ENUM ('ativa', 'sem_numero', 'encerrada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS unidades (
  id            SERIAL PRIMARY KEY,
  -- Grafia EXATA do unitName usado pelo menu do WhatsApp (custom_attributes).
  -- É o que a conversa ativa vai gravar, para ficar idêntica à receptiva.
  nome          TEXT NOT NULL,
  uf            CHAR(2) NOT NULL,
  -- Nome normalizado (sem acento/pontuação, sem UF, sem prefixo "Rockfeller")
  -- usado para casar as grafias divergentes de saf_tickets.franchise.
  slug          TEXT NOT NULL,
  status        unidade_status NOT NULL DEFAULT 'ativa',
  -- "Franchising" é a própria franqueadora, não escola: fica fora do seletor.
  is_interna    BOOLEAN NOT NULL DEFAULT false,
  -- UUID da unidade no cadastro do menu (custom_attributes.unitId), quando conhecido
  unit_id_menu  UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, uf)
);

CREATE INDEX IF NOT EXISTS idx_unidades_status ON unidades (status);

CREATE TABLE IF NOT EXISTS contatos_whatsapp (
  id            SERIAL PRIMARY KEY,
  -- E.164 só dígitos, com 55 na frente (mesmo formato do source_id da inbox 11)
  telefone      TEXT NOT NULL UNIQUE,
  -- Nome a gravar no Chatwoot: unidade [· departamento]. Nunca o nome da
  -- pessoa — quem fala vem em custom_attributes.name a cada conversa.
  nome_sugerido TEXT NOT NULL,
  chatwoot_contact_id INTEGER,
  -- DDD de outro estado que o da unidade: não é erro (número antigo, divisa
  -- de estado), mas vale revisar antes de disparar mensagem.
  ddd_divergente BOOLEAN NOT NULL DEFAULT false,
  ativo         BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- N↔N de propósito: o mesmo franqueado pode responder por duas escolas com um
-- único número (confirmado no Chatwoot — contato #98 tem conversa de Jundiaí e
-- de Jundiai Medeiros). Telefone como coluna da unidade duplicaria a pessoa.
CREATE TABLE IF NOT EXISTS unidade_contatos (
  unidade_id    INTEGER NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  contato_id    INTEGER NOT NULL REFERENCES contatos_whatsapp(id) ON DELETE CASCADE,
  -- Departamento DA ESCOLA (financeiro, pedagógico...), quando a lista informar
  departamento  TEXT,
  principal     BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (unidade_id, contato_id)
);

CREATE INDEX IF NOT EXISTS idx_unidade_contatos_contato ON unidade_contatos (contato_id);

-- saf_tickets.franchise é texto livre: 158 grafias para 79 unidades reais
-- ("Floripa - Estreito", "Blumenau Humberto de Campos", "ROCKFELLER BARREIRO").
-- Esta tabela é o dicionário que liga ticket → unidade, para o botão
-- "chamar a escola" nascer com a unidade certa pré-selecionada.
CREATE TABLE IF NOT EXISTS unidade_aliases (
  id          SERIAL PRIMARY KEY,
  alias       TEXT NOT NULL UNIQUE,        -- grafia como vem no dfranquias
  alias_slug  TEXT NOT NULL,
  -- NULL quando não há unidade correspondente (encerrada ou fora do cadastro)
  unidade_id  INTEGER REFERENCES unidades(id) ON DELETE SET NULL,
  origem      TEXT NOT NULL DEFAULT 'seed',   -- seed | manual
  -- false = casamento por similaridade, precisa de conferência humana
  confirmado  BOOLEAN NOT NULL DEFAULT false,
  tickets     INTEGER NOT NULL DEFAULT 0,     -- volume observado, ajuda a priorizar revisão
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unidade_aliases_slug ON unidade_aliases (alias_slug);
