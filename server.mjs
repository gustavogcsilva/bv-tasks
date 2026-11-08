import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import pg from 'pg';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

// ============================================================================
// Configuração do Banco de Dados SQL (PostgreSQL Primário + Fallback Local Dev)
// ============================================================================

const DATABASE_URL = (process.env.DATABASE_URL || '').trim();
const usePostgres = Boolean(DATABASE_URL);

let pgPool = null;

if (usePostgres) {
  const isLocalDb =
    DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1');

  pgPool = new Pool({
    connectionString: DATABASE_URL,
    ssl: isLocalDb ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pgPool.on('error', (err) => {
    console.error('[B V Tasks SQL] Erro inesperado no pool PostgreSQL:', err.message);
  });
}

// Fallback limpo apenas para desenvolvimento local quando DATABASE_URL não estiver definida
const dataDir = path.join(__dirname, 'data');
const legacyDbFile = path.join(dataDir, 'bv-tasks.db.json');
const localDbFile = path.join(dataDir, 'bv-tasks-v8.db.json');

function initLocalStorageFallback() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  // Limpa banco legado anterior conforme solicitado
  if (fs.existsSync(legacyDbFile)) {
    try {
      fs.unlinkSync(legacyDbFile);
    } catch {
      // Ignora caso já removido
    }
  }
  if (!fs.existsSync(localDbFile)) {
    const emptyDb = { users: [], sessions: [], tasks: [], folders: [] };
    fs.writeFileSync(localDbFile, JSON.stringify(emptyDb, null, 2), 'utf-8');
  }
}

function readLocalDb() {
  initLocalStorageFallback();
  try {
    const parsed = JSON.parse(fs.readFileSync(localDbFile, 'utf-8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
    };
  } catch {
    return { users: [], sessions: [], tasks: [], folders: [] };
  }
}

function saveLocalDb(db) {
  initLocalStorageFallback();
  const payload = JSON.stringify(db, null, 2);
  const tmpFile = `${localDbFile}.tmp-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tmpFile, payload, 'utf-8');
    fs.renameSync(tmpFile, localDbFile);
  } catch {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // Ignora limpeza temporária
    }
    fs.writeFileSync(localDbFile, payload, 'utf-8');
  }
}

export async function initDatabase() {
  if (!usePostgres) {
    initLocalStorageFallback();
    console.log(
      '[B V Tasks DB] Modo Local ativo (defina DATABASE_URL com PostgreSQL no Render para persistência SQL definitiva).',
    );
    return;
  }

  const schemaSqlPath = path.join(__dirname, 'database', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaSqlPath, 'utf-8');
  await pgPool.query(schemaSql);
  // Limpa sessões expiradas na inicialização
  await pgPool.query('DELETE FROM bv_sessions WHERE expires_at < NOW()');
  console.log('[B V Tasks SQL] Banco PostgreSQL conectado e tabelas verificadas com sucesso.');
}

// ============================================================================
// Criptografia de Nível Bancário (PBKDF2-HMAC-SHA512 + Timing-Safe Equal)
// ============================================================================

const PBKDF2_ITERATIONS = 100000;
const SERVER_HMAC_SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash('sha256').update(DATABASE_URL || 'bv-tasks-local-secret-v8').digest('hex');

function hashSecret(secret, salt) {
  return crypto.pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
}

function verifySecret(secret, salt, storedHash) {
  if (!secret || !salt || !storedHash) return false;
  try {
    const computed = hashSecret(secret, salt);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function createSignedResetToken(email) {
  const exp = Date.now() + 30 * 60 * 1000; // 30 minutos
  const payload = `${email}|${exp}`;
  const sig = crypto.createHmac('sha256', SERVER_HMAC_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}|${sig}`, 'utf-8').toString('base64url');
}

function verifySignedResetToken(token, expectedEmail) {
  if (!token || !expectedEmail) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const [email, expStr, sig] = decoded.split('|');
    if (!email || !expStr || !sig) return false;
    if (email !== expectedEmail) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const expectedSig = crypto
      .createHmac('sha256', SERVER_HMAC_SECRET)
      .update(`${email}|${expStr}`)
      .digest('hex');
    const bufA = Buffer.from(sig, 'hex');
    const bufB = Buffer.from(expectedSig, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

// Proteção contra força bruta (Rate Limit em memória por IP)
const authAttemptsByIp = new Map();
const MAX_AUTH_ATTEMPTS = 25;
const RATE_WINDOW_MS = 15 * 60 * 1000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = authAttemptsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    authAttemptsByIp.set(ip, { count: 0, windowStart: now });
    return true;
  }
  return entry.count < MAX_AUTH_ATTEMPTS;
}

function recordFailedAuth(ip) {
  const now = Date.now();
  const entry = authAttemptsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    authAttemptsByIp.set(ip, { count: 1, windowStart: now });
  } else {
    entry.count += 1;
  }
}

function clearFailedAuth(ip) {
  authAttemptsByIp.delete(ip);
}

// ============================================================================
// Camada de Repositório Unificada (PostgreSQL / Local Fallback)
// ============================================================================

function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    provider: row.provider || 'email',
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? undefined,
    googleId: row.google_id ?? row.googleId ?? undefined,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at || row.createdAt || new Date().toISOString(),
  };
}

function mapTaskRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    date: row.date,
    time: row.time || undefined,
    priority: row.priority || 'medium',
    scope: row.scope || 'work',
    folderId: row.folder_id ?? row.folderId ?? undefined,
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    isCompleted: Boolean(row.is_completed ?? row.isCompleted),
    notified: Boolean(row.notified),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at || row.createdAt || new Date().toISOString(),
  };
}

function mapFolderRow(row) {
  return {
    id: row.id,
    name: row.name,
    ...(row.scope ? { scope: row.scope } : {}),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at || row.createdAt || new Date().toISOString(),
  };
}

const repo = {
  async findUserByEmail(email) {
    if (usePostgres) {
      const { rows } = await pgPool.query('SELECT * FROM bv_users WHERE email = $1 LIMIT 1', [
        email,
      ]);
      return rows[0] || null;
    }
    const db = readLocalDb();
    return db.users.find((u) => u.email === email) || null;
  },

  async findUserById(userId) {
    if (usePostgres) {
      const { rows } = await pgPool.query('SELECT * FROM bv_users WHERE id = $1 LIMIT 1', [
        userId,
      ]);
      return rows[0] || null;
    }
    const db = readLocalDb();
    return db.users.find((u) => u.id === userId) || null;
  },

  async createUser({ id, name, email, passwordHash, salt, recoveryKeywordHash, provider, avatarUrl, googleId }) {
    const createdAt = new Date().toISOString();
    if (usePostgres) {
      const { rows } = await pgPool.query(
        `INSERT INTO bv_users (id, name, email, password_hash, salt, recovery_keyword_hash, provider, avatar_url, google_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id,
          name,
          email,
          passwordHash,
          salt,
          recoveryKeywordHash,
          provider || 'email',
          avatarUrl || null,
          googleId || null,
          createdAt,
        ],
      );
      return rows[0];
    }
    const db = readLocalDb();
    const user = {
      id,
      name,
      email,
      password_hash: passwordHash,
      salt,
      recovery_keyword_hash: recoveryKeywordHash,
      provider: provider || 'email',
      avatar_url: avatarUrl || null,
      google_id: googleId || null,
      created_at: createdAt,
    };
    db.users.push(user);
    saveLocalDb(db);
    return user;
  },

  async updateUserGoogleMetadata(userId, { avatarUrl, googleId }) {
    if (usePostgres) {
      const { rows } = await pgPool.query(
        `UPDATE bv_users
         SET provider = 'google',
             avatar_url = COALESCE($2, avatar_url),
             google_id = COALESCE($3, google_id)
         WHERE id = $1
         RETURNING *`,
        [userId, avatarUrl || null, googleId || null],
      );
      return rows[0];
    }
    const db = readLocalDb();
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      user.provider = 'google';
      if (avatarUrl) user.avatar_url = avatarUrl;
      if (googleId) user.google_id = googleId;
      saveLocalDb(db);
    }
    return user;
  },

  async updateUserPassword(userId, passwordHash, salt, recoveryKeywordHash) {
    if (usePostgres) {
      const { rows } = await pgPool.query(
        `UPDATE bv_users
         SET password_hash = $2,
             salt = $3,
             recovery_keyword_hash = COALESCE($4, recovery_keyword_hash)
         WHERE id = $1
         RETURNING *`,
        [userId, passwordHash, salt, recoveryKeywordHash || null],
      );
      return rows[0];
    }
    const db = readLocalDb();
    const user = db.users.find((u) => u.id === userId);
    if (user) {
      user.password_hash = passwordHash;
      user.salt = salt;
      if (recoveryKeywordHash) user.recovery_keyword_hash = recoveryKeywordHash;
      saveLocalDb(db);
    }
    return user;
  },

  async createSession(userId) {
    const token = `tok_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 dias
    if (usePostgres) {
      await pgPool.query(
        `INSERT INTO bv_sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
        [token, userId, expiresAt],
      );
      return token;
    }
    const db = readLocalDb();
    const now = new Date();
    db.sessions = db.sessions.filter((s) => new Date(s.expires_at) > now);
    db.sessions.push({ token, user_id: userId, expires_at: expiresAt });
    saveLocalDb(db);
    return token;
  },

  async deleteSession(token) {
    if (!token) return;
    if (usePostgres) {
      await pgPool.query('DELETE FROM bv_sessions WHERE token = $1', [token]);
      return;
    }
    const db = readLocalDb();
    db.sessions = db.sessions.filter((s) => s.token !== token);
    saveLocalDb(db);
  },

  async getUserIdByToken(token) {
    if (!token) return null;
    if (usePostgres) {
      const { rows } = await pgPool.query(
        `SELECT user_id FROM bv_sessions WHERE token = $1 AND expires_at > NOW() LIMIT 1`,
        [token],
      );
      return rows[0]?.user_id || null;
    }
    const db = readLocalDb();
    const session = db.sessions.find(
      (s) => s.token === token && new Date(s.expires_at) > new Date(),
    );
    return session?.user_id || null;
  },

  async getUserData(userId) {
    if (usePostgres) {
      const [tasksRes, foldersRes] = await Promise.all([
        pgPool.query('SELECT * FROM bv_tasks WHERE user_id = $1 ORDER BY created_at ASC', [
          userId,
        ]),
        pgPool.query('SELECT * FROM bv_folders WHERE user_id = $1 ORDER BY created_at ASC', [
          userId,
        ]),
      ]);
      return {
        tasks: tasksRes.rows.map(mapTaskRow),
        folders: foldersRes.rows.map(mapFolderRow),
      };
    }
    const db = readLocalDb();
    return {
      tasks: db.tasks.filter((t) => t.user_id === userId).map(mapTaskRow),
      folders: db.folders.filter((f) => f.user_id === userId).map(mapFolderRow),
    };
  },

  async upsertTask(userId, task) {
    const id = String(task.id || '').trim();
    const title = String(task.title || '').trim();
    if (!id || !title) return;
    const createdAt = task.createdAt || new Date().toISOString();

    if (usePostgres) {
      await pgPool.query(
        `INSERT INTO bv_tasks (
          id, user_id, title, description, date, time, priority, scope, folder_id, attachments, is_completed, notified, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, NOW())
        ON CONFLICT (user_id, id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          date = EXCLUDED.date,
          time = EXCLUDED.time,
          priority = EXCLUDED.priority,
          scope = EXCLUDED.scope,
          folder_id = EXCLUDED.folder_id,
          attachments = EXCLUDED.attachments,
          is_completed = EXCLUDED.is_completed,
          notified = EXCLUDED.notified,
          updated_at = NOW()`,
        [
          id,
          userId,
          title,
          task.description || null,
          task.date,
          task.time || null,
          task.priority || 'medium',
          task.scope || 'work',
          task.folderId || null,
          JSON.stringify(Array.isArray(task.attachments) ? task.attachments : []),
          Boolean(task.isCompleted),
          Boolean(task.notified),
          createdAt,
        ],
      );
      return;
    }

    const db = readLocalDb();
    const idx = db.tasks.findIndex((t) => t.user_id === userId && t.id === id);
    const record = {
      id,
      user_id: userId,
      title,
      description: task.description || null,
      date: task.date,
      time: task.time || null,
      priority: task.priority || 'medium',
      scope: task.scope || 'work',
      folder_id: task.folderId || null,
      attachments: Array.isArray(task.attachments) ? task.attachments : [],
      is_completed: Boolean(task.isCompleted),
      notified: Boolean(task.notified),
      created_at: createdAt,
    };
    if (idx >= 0) db.tasks[idx] = record;
    else db.tasks.push(record);
    saveLocalDb(db);
  },

  async deleteTask(userId, taskId) {
    if (usePostgres) {
      await pgPool.query('DELETE FROM bv_tasks WHERE user_id = $1 AND id = $2', [
        userId,
        taskId,
      ]);
      return;
    }
    const db = readLocalDb();
    db.tasks = db.tasks.filter((t) => !(t.user_id === userId && t.id === taskId));
    saveLocalDb(db);
  },

  async upsertFolder(userId, folder) {
    const id = String(folder.id || '').trim();
    const name = String(folder.name || '').trim();
    if (!id || !name) return;
    const createdAt = folder.createdAt || new Date().toISOString();

    if (usePostgres) {
      await pgPool.query(
        `INSERT INTO bv_folders (id, user_id, name, scope, created_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id, id) DO UPDATE SET
           name = EXCLUDED.name,
           scope = EXCLUDED.scope`,
        [id, userId, name, folder.scope || null, createdAt],
      );
      return;
    }

    const db = readLocalDb();
    const idx = db.folders.findIndex((f) => f.user_id === userId && f.id === id);
    const record = {
      id,
      user_id: userId,
      name,
      scope: folder.scope || null,
      created_at: createdAt,
    };
    if (idx >= 0) db.folders[idx] = record;
    else db.folders.push(record);
    saveLocalDb(db);
  },

  async deleteFolder(userId, folderId) {
    if (usePostgres) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM bv_folders WHERE user_id = $1 AND id = $2', [
          userId,
          folderId,
        ]);
        await client.query(
          'UPDATE bv_tasks SET folder_id = NULL WHERE user_id = $1 AND folder_id = $2',
          [userId, folderId],
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return;
    }

    const db = readLocalDb();
    db.folders = db.folders.filter((f) => !(f.user_id === userId && f.id === folderId));
    db.tasks = db.tasks.map((t) =>
      t.user_id === userId && t.folder_id === folderId ? { ...t, folder_id: null } : t,
    );
    saveLocalDb(db);
  },

  async mergeSyncData(userId, tasks, folders) {
    if (Array.isArray(folders)) {
      for (const f of folders) {
        await repo.upsertFolder(userId, f);
      }
    }
    if (Array.isArray(tasks)) {
      for (const t of tasks) {
        await repo.upsertTask(userId, t);
      }
    }
    return repo.getUserData(userId);
  },

  async clearUserData(userId) {
    if (usePostgres) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM bv_tasks WHERE user_id = $1', [userId]);
        await client.query('DELETE FROM bv_folders WHERE user_id = $1', [userId]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
      return;
    }
    const db = readLocalDb();
    db.tasks = db.tasks.filter((t) => t.user_id !== userId);
    db.folders = db.folders.filter((f) => f.user_id !== userId);
    saveLocalDb(db);
  },
};

// ============================================================================
// Utilitários HTTP e Roteamento REST
// ============================================================================

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) {
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
  });
  res.end(JSON.stringify(data));
}

function extractBearerToken(req) {
  const authHeader = req.headers['authorization'] || '';
  return authHeader.replace(/^Bearer\s+/i, '').trim();
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

async function handleApiRequest(req, res, pathname) {
  const method = (req.method || 'GET').toUpperCase();
  const clientIp = getClientIp(req);

  // 1. Healthcheck e diagnóstico de persistência SQL
  if (method === 'GET' && pathname === '/api/health') {
    if (usePostgres) {
      try {
        await pgPool.query('SELECT 1');
        return sendJson(res, 200, {
          ok: true,
          status: 'ok',
          engine: 'postgresql',
          sqlPersistent: true,
          version: 'bv-tasks-v8',
          time: new Date().toISOString(),
        });
      } catch (err) {
        return sendJson(res, 503, {
          ok: false,
          status: 'db_error',
          engine: 'postgresql',
          sqlPersistent: false,
          error: 'Falha ao conectar no PostgreSQL: ' + (err?.message || 'erro desconhecido'),
        });
      }
    }
    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      engine: 'local-file',
      sqlPersistent: false,
      version: 'bv-tasks-v8',
      time: new Date().toISOString(),
    });
  }

  // Proteção Rate-Limit para rotas de autenticação
  if (pathname.startsWith('/api/auth/') && pathname !== '/api/auth/logout') {
    if (!checkRateLimit(clientIp)) {
      return sendJson(res, 429, {
        ok: false,
        error: 'Muitas tentativas seguidas. Aguarde alguns minutos por segurança.',
      });
    }
  }

  // 2. Registro de Conta (ou Login Transparente caso já exista com a mesma senha)
  if (method === 'POST' && pathname === '/api/auth/register') {
    try {
      const { name, email, password, recoveryKeyword } = await parseJsonBody(req);
      const trimmedName = String(name || '').trim();
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPassword = String(password || '').trim();
      const keyword = String(recoveryKeyword || 'vinho').trim().toLowerCase() || 'vinho';

      if (!trimmedName || trimmedName.length < 2) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe seu nome completo ou profissional.',
        });
      }
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um endereço de e-mail válido.' });
      }
      if (normalizedPassword.length < 6) {
        return sendJson(res, 400, {
          ok: false,
          error: 'A senha deve conter no mínimo 6 caracteres.',
        });
      }

      const existing = await repo.findUserByEmail(normalizedEmail);
      if (existing) {
        if (verifySecret(normalizedPassword, existing.salt, existing.password_hash)) {
          clearFailedAuth(clientIp);
          const token = await repo.createSession(existing.id);
          const userData = await repo.getUserData(existing.id);
          return sendJson(res, 200, {
            ok: true,
            user: sanitizeUser(existing),
            token,
            tasks: userData.tasks,
            folders: userData.folders,
          });
        }
        recordFailedAuth(clientIp);
        return sendJson(res, 409, {
          ok: false,
          error: 'Este e-mail já está cadastrado. Use a aba "Entrar" com sua senha.',
        });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashSecret(normalizedPassword, salt);
      const recoveryKeywordHash = hashSecret(keyword, salt);
      const created = await repo.createUser({
        id: `usr_${crypto.randomUUID()}`,
        name: trimmedName,
        email: normalizedEmail,
        passwordHash,
        salt,
        recoveryKeywordHash,
        provider: 'email',
      });

      clearFailedAuth(clientIp);
      const token = await repo.createSession(created.id);
      return sendJson(res, 201, {
        ok: true,
        user: sanitizeUser(created),
        token,
        tasks: [],
        folders: [],
      });
    } catch (err) {
      console.error('[Auth Register Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Erro interno ao cadastrar conta.' });
    }
  }

  // 3. Login Multi-Dispositivo (Computador, iPhone e Android compartilhando o mesmo SQL)
  if (method === 'POST' && pathname === '/api/auth/login') {
    try {
      const { email, password } = await parseJsonBody(req);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedPassword = String(password || '').trim();

      if (!normalizedEmail || !normalizedPassword) {
        return sendJson(res, 400, { ok: false, error: 'Informe seu e-mail e senha.' });
      }

      const user = await repo.findUserByEmail(normalizedEmail);
      if (!user || !verifySecret(normalizedPassword, user.salt, user.password_hash)) {
        recordFailedAuth(clientIp);
        return sendJson(res, 401, { ok: false, error: 'E-mail ou senha incorretos.' });
      }

      clearFailedAuth(clientIp);
      const token = await repo.createSession(user.id);
      const userData = await repo.getUserData(user.id);
      return sendJson(res, 200, {
        ok: true,
        user: sanitizeUser(user),
        token,
        tasks: userData.tasks,
        folders: userData.folders,
      });
    } catch (err) {
      console.error('[Auth Login Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Erro interno ao autenticar.' });
    }
  }

  // 4. Autenticação Google Multi-Dispositivo
  if (method === 'POST' && pathname === '/api/auth/google') {
    try {
      const { name, email, password, avatarUrl, googleId } = await parseJsonBody(req);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const trimmedName = String(name || '').trim() || normalizedEmail.split('@')[0];
      const normalizedPassword = password ? String(password).trim() : '';

      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return sendJson(res, 400, { ok: false, error: 'E-mail Google inválido.' });
      }

      let user = await repo.findUserByEmail(normalizedEmail);
      if (user) {
        // Se foi enviado com senha direta (sem GSI googleId), exige verificação da senha cadastrada
        if (!googleId && normalizedPassword) {
          if (!verifySecret(normalizedPassword, user.salt, user.password_hash)) {
            recordFailedAuth(clientIp);
            return sendJson(res, 401, {
              ok: false,
              error: 'Senha incorreta para esta conta Google cadastrada.',
            });
          }
        }
        user = await repo.updateUserGoogleMetadata(user.id, { avatarUrl, googleId });
      } else {
        const effectivePassword =
          normalizedPassword.length >= 6
            ? normalizedPassword
            : `google-oauth-${crypto.randomUUID()}`;
        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashSecret(effectivePassword, salt);
        const recoveryKeywordHash = hashSecret('google', salt);
        user = await repo.createUser({
          id: `usr_${crypto.randomUUID()}`,
          name: trimmedName,
          email: normalizedEmail,
          passwordHash,
          salt,
          recoveryKeywordHash,
          provider: 'google',
          avatarUrl,
          googleId,
        });
      }

      clearFailedAuth(clientIp);
      const token = await repo.createSession(user.id);
      const userData = await repo.getUserData(user.id);
      return sendJson(res, 200, {
        ok: true,
        user: sanitizeUser(user),
        token,
        tasks: userData.tasks,
        folders: userData.folders,
      });
    } catch (err) {
      console.error('[Auth Google Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Erro ao autenticar conta Google.' });
    }
  }

  // 5. Solicitação de Link Seguro de Redefinição de Senha (HMAC assinado + expiração 30 min)
  if (method === 'POST' && pathname === '/api/auth/request-reset') {
    try {
      const { email, origin } = await parseJsonBody(req);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        return sendJson(res, 400, { ok: false, error: 'Informe um e-mail válido.' });
      }
      const user = await repo.findUserByEmail(normalizedEmail);
      if (!user) {
        return sendJson(res, 404, {
          ok: false,
          error: 'Nenhuma conta encontrada com este e-mail.',
        });
      }
      const signedToken = createSignedResetToken(normalizedEmail);
      const safeOrigin = String(origin || 'https://bv-tasks.onrender.com').replace(/\/+$/, '');
      const resetLink = `${safeOrigin}/?reset_token=${encodeURIComponent(signedToken)}&email=${encodeURIComponent(normalizedEmail)}`;
      return sendJson(res, 200, { ok: true, resetLink });
    } catch {
      return sendJson(res, 500, { ok: false, error: 'Erro ao gerar link de recuperação.' });
    }
  }

  // 6. Redefinição de Senha por Palavra-Chave ou Token Assinado
  if (method === 'POST' && pathname === '/api/auth/reset-password') {
    try {
      const { email, keyword, token: resetToken, newPassword } = await parseJsonBody(req);
      const normalizedEmail = String(email || '').trim().toLowerCase();
      const normalizedNewPass = String(newPassword || '').trim();
      const normalizedKeyword = keyword ? String(keyword).trim().toLowerCase() : '';

      if (!normalizedEmail || normalizedNewPass.length < 6) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe o e-mail e uma nova senha de pelo menos 6 caracteres.',
        });
      }

      const user = await repo.findUserByEmail(normalizedEmail);
      if (!user) {
        recordFailedAuth(clientIp);
        return sendJson(res, 404, {
          ok: false,
          error: 'Nenhuma conta encontrada com este e-mail.',
        });
      }

      if (normalizedKeyword) {
        if (!verifySecret(normalizedKeyword, user.salt, user.recovery_keyword_hash)) {
          recordFailedAuth(clientIp);
          return sendJson(res, 401, {
            ok: false,
            error: 'Palavra-chave de segurança incorreta.',
          });
        }
      } else if (resetToken) {
        if (!verifySignedResetToken(resetToken, normalizedEmail)) {
          recordFailedAuth(clientIp);
          return sendJson(res, 401, {
            ok: false,
            error: 'Link de recuperação inválido ou expirado.',
          });
        }
      } else {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe a palavra-chave ou utilize um link de recuperação válido.',
        });
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      const newPasswordHash = hashSecret(normalizedNewPass, newSalt);
      const updatedKeywordHash = normalizedKeyword
        ? hashSecret(normalizedKeyword, newSalt)
        : undefined;

      const updatedUser = await repo.updateUserPassword(
        user.id,
        newPasswordHash,
        newSalt,
        updatedKeywordHash,
      );

      clearFailedAuth(clientIp);
      const sessionToken = await repo.createSession(user.id);
      const userData = await repo.getUserData(user.id);
      return sendJson(res, 200, {
        ok: true,
        user: sanitizeUser(updatedUser),
        token: sessionToken,
        tasks: userData.tasks,
        folders: userData.folders,
      });
    } catch (err) {
      console.error('[Reset Password Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Erro ao redefinir senha.' });
    }
  }

  // 7. Logout seguro da sessão atual (mantém outros dispositivos ativos se desejar)
  if (method === 'POST' && pathname === '/api/auth/logout') {
    const token = extractBearerToken(req);
    await repo.deleteSession(token);
    return sendJson(res, 200, { ok: true });
  }

  // ==========================================================================
  // Rotas Autenticadas de Tarefas e Pastas (Isoladas por user_id no SQL)
  // ==========================================================================

  const bearerToken = extractBearerToken(req);
  const userId = await repo.getUserIdByToken(bearerToken);
  if (!userId) {
    return sendJson(res, 401, {
      ok: false,
      error: 'Sessão expirada ou não autenticada. Faça login novamente.',
    });
  }

  // GET /api/sync -> Busca estado oficial do SQL
  if (method === 'GET' && pathname === '/api/sync') {
    const [user, userData] = await Promise.all([
      repo.findUserById(userId),
      repo.getUserData(userId),
    ]);
    return sendJson(res, 200, {
      ok: true,
      user: sanitizeUser(user),
      tasks: userData.tasks,
      folders: userData.folders,
      engine: usePostgres ? 'postgresql' : 'local-file',
    });
  }

  // POST /api/sync -> Faz merge transacional seguro e devolve estado oficial do SQL
  if (method === 'POST' && pathname === '/api/sync') {
    try {
      const { tasks, folders } = await parseJsonBody(req);
      const synced = await repo.mergeSyncData(userId, tasks, folders);
      return sendJson(res, 200, {
        ok: true,
        tasks: synced.tasks,
        folders: synced.folders,
        syncedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Sync Error]', err);
      return sendJson(res, 500, { ok: false, error: 'Erro ao sincronizar no banco SQL.' });
    }
  }

  // DELETE /api/sync/clear -> Limpa todas as tarefas e pastas do usuário no SQL
  if (method === 'DELETE' && pathname === '/api/sync/clear') {
    await repo.clearUserData(userId);
    return sendJson(res, 200, { ok: true, tasks: [], folders: [] });
  }

  // POST /api/tasks -> Cria ou atualiza uma tarefa individual no SQL
  if (method === 'POST' && pathname === '/api/tasks') {
    const { task } = await parseJsonBody(req);
    if (!task || !task.id) {
      return sendJson(res, 400, { ok: false, error: 'Tarefa inválida.' });
    }
    await repo.upsertTask(userId, task);
    return sendJson(res, 200, { ok: true });
  }

  // DELETE /api/tasks/:id -> Exclui uma tarefa individual no SQL (reflete em todos os aparelhos)
  if (method === 'DELETE' && pathname.startsWith('/api/tasks/')) {
    const taskId = pathname.slice('/api/tasks/'.length).trim();
    if (!taskId) {
      return sendJson(res, 400, { ok: false, error: 'ID da tarefa ausente.' });
    }
    await repo.deleteTask(userId, taskId);
    return sendJson(res, 200, { ok: true });
  }

  // POST /api/folders -> Cria ou atualiza pasta individual no SQL
  if (method === 'POST' && pathname === '/api/folders') {
    const { folder } = await parseJsonBody(req);
    if (!folder || !folder.id) {
      return sendJson(res, 400, { ok: false, error: 'Pasta inválida.' });
    }
    await repo.upsertFolder(userId, folder);
    return sendJson(res, 200, { ok: true });
  }

  // DELETE /api/folders/:id -> Exclui pasta individual no SQL
  if (method === 'DELETE' && pathname.startsWith('/api/folders/')) {
    const folderId = pathname.slice('/api/folders/'.length).trim();
    if (!folderId) {
      return sendJson(res, 400, { ok: false, error: 'ID da pasta ausente.' });
    }
    await repo.deleteFolder(userId, folderId);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 404, { ok: false, error: 'Endpoint da API não encontrado.' });
}

// ============================================================================
// Servidor HTTP Estático (SPA) + API Full Stack
// ============================================================================

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

export function createAppServer() {
  return http.createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }

    const origin = req.headers.origin;
    if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      let decodedPathname;
      try {
        decodedPathname = decodeURIComponent(parsedUrl.pathname);
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Bad Request');
        return;
      }

      if (decodedPathname.startsWith('/api/')) {
        return await handleApiRequest(req, res, decodedPathname);
      }

      let filePath = path.resolve(distDir, '.' + path.posix.normalize('/' + decodedPathname));
      if (filePath !== distDir && !filePath.startsWith(distDir + path.sep)) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType =
          parsedUrl.pathname === '/manifest.json'
            ? 'application/manifest+json; charset=utf-8'
            : MIME_TYPES[ext] || 'application/octet-stream';

        const headers = { 'Content-Type': contentType };
        if (parsedUrl.pathname === '/sw.js' || parsedUrl.pathname === '/index.html') {
          headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        } else if (parsedUrl.pathname.startsWith('/assets/')) {
          headers['Cache-Control'] = 'public, max-age=31536000, immutable';
        }

        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
        return;
      }

      if (/\.(js|mjs|css|png|jpg|jpeg|svg|ico|woff2?|map)$/i.test(parsedUrl.pathname)) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Asset not found');
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      });
      fs.createReadStream(indexHtmlPath).pipe(res);
    } catch (err) {
      console.error('[HTTP Server Error]', err);
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Internal Server Error');
    }
  });
}

// Inicia o servidor quando executado diretamente (node server.mjs / npm start)
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  if (!fs.existsSync(indexHtmlPath)) {
    console.log('[B V Tasks Server] Pasta dist não encontrada. Executando build de produção...');
    execSync('npm run build', { stdio: 'inherit' });
  }

  initDatabase()
    .then(() => {
      const port = Number(process.env.PORT) || 4173;
      const server = createAppServer();
      server.listen(port, '0.0.0.0', () => {
        console.log(
          `[B V Tasks] Servidor Full Stack ativo em http://0.0.0.0:${port} (Engine: ${
            usePostgres ? 'PostgreSQL SQL' : 'Local Dev File'
          })`,
        );
      });
    })
    .catch((err) => {
      console.error('[B V Tasks Fatal] Falha ao inicializar banco de dados:', err);
      process.exit(1);
    });
}
