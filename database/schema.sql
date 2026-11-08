-- ============================================================================
-- B V Tasks — Schema Oficial do Banco de Dados SQL (PostgreSQL)
-- Compatível com: Render PostgreSQL, Neon Serverless Postgres e Supabase
-- Nota: O servidor (server.mjs) executa este schema automaticamente ao iniciar
--       quando a variável de ambiente DATABASE_URL está configurada.
-- ============================================================================

-- 1. Tabela de Usuários (Credenciais com PBKDF2-HMAC-SHA512 + Salt Único)
CREATE TABLE IF NOT EXISTS bv_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  recovery_keyword_hash TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'email',
  avatar_url TEXT,
  google_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bv_users_email ON bv_users (email);

-- 2. Tabela de Sessões Multi-Dispositivo (Computador, iPhone e Android simultâneos)
CREATE TABLE IF NOT EXISTS bv_sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES bv_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bv_sessions_user_id ON bv_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_bv_sessions_expires_at ON bv_sessions (expires_at);

-- 3. Tabela de Pastas (Isoladas estritamente por user_id)
CREATE TABLE IF NOT EXISTS bv_folders (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES bv_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_bv_folders_user_id ON bv_folders (user_id);

-- 4. Tabela de Tarefas (Isoladas estritamente por user_id + suporte a anexos JSONB)
CREATE TABLE IF NOT EXISTS bv_tasks (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES bv_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  time TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  scope TEXT NOT NULL DEFAULT 'work',
  folder_id TEXT,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  notified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_bv_tasks_user_date ON bv_tasks (user_id, date);
