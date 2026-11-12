import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import pg from 'pg';
import { GoogleGenAI, Type } from '@google/genai';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

// Carrega variáveis de .env e .env.example como fallback quando fora da suíte de testes (Vitest)
function loadEnvFileFallback() {
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return;
  for (const fileName of ['.env', '.env.example']) {
    const fullPath = path.join(__dirname, fileName);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eqIdx = line.indexOf('=');
        if (eqIdx <= 0) continue;
        const key = line.slice(0, eqIdx).trim();
        const val = line
          .slice(eqIdx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, '');
        if (key && val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    } catch {
      // Ignora erro de leitura de arquivo env opcional
    }
  }
}

loadEnvFileFallback();

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

export function createCalendarFeedToken(userId) {
  const cleanId = String(userId || '').trim();
  const payload = `cal|${cleanId}`;
  const sig = crypto.createHmac('sha256', SERVER_HMAC_SECRET).update(payload).digest('hex');
  return Buffer.from(`${cleanId}|${sig}`, 'utf-8').toString('base64url');
}

export function verifyCalendarFeedToken(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const decoded = Buffer.from(token.trim(), 'base64url').toString('utf-8');
    const sepIdx = decoded.lastIndexOf('|');
    if (sepIdx <= 0) return null;
    const userId = decoded.slice(0, sepIdx);
    const sig = decoded.slice(sepIdx + 1);
    if (!userId || !sig || !/^[0-9a-f]{64}$/i.test(sig)) return null;
    const expectedSig = crypto
      .createHmac('sha256', SERVER_HMAC_SECRET)
      .update(`cal|${userId}`)
      .digest('hex');
    const bufA = Buffer.from(sig, 'hex');
    const bufB = Buffer.from(expectedSig, 'hex');
    if (bufA.length !== bufB.length) return null;
    return crypto.timingSafeEqual(bufA, bufB) ? userId : null;
  } catch {
    return null;
  }
}

function formatServerIcsDateTime(dateStr, timeStr, addMinutes = 0) {
  const [y, m, d] = String(dateStr || '2026-01-01')
    .split('-')
    .map((n) => Number(n) || 1);
  const [hh, mm] = String(timeStr || '09:00')
    .split(':')
    .map((n) => Number(n) || 0);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + addMinutes, 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}${pad(dt.getUTCMonth() + 1)}${pad(dt.getUTCDate())}T${pad(
    dt.getUTCHours(),
  )}${pad(dt.getUTCMinutes())}00`;
}

function escapeServerIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function buildServerIcsFeed(tasks, userName = 'BVS Special') {
  const stamp = formatServerIcsDateTime(new Date().toISOString().slice(0, 10), '09:00', 0);
  const scopeLabels = {
    work: 'Trabalho',
    personal: 'Pessoal',
    study: 'Estudo',
  };
  const activeTasks = (Array.isArray(tasks) ? tasks : []).filter((t) => !t.isCompleted);

  const events = activeTasks
    .map((task) => {
      const dtStart = formatServerIcsDateTime(task.date, task.time, 0);
      const dtEnd = formatServerIcsDateTime(task.date, task.time, 60);
      const scopeLabel = scopeLabels[task.scope] || 'Trabalho';
      const summary = escapeServerIcsText(`[BVS Special • ${scopeLabel}] ${task.title}`);
      const description = escapeServerIcsText(
        task.description
          ? `${task.description} (Prioridade: ${task.priority})`
          : `Tarefa BVS Special — Categoria: ${scopeLabel}`,
      );
      return [
        'BEGIN:VEVENT',
        `UID:bvs-special-${task.id}@bvtasks.app`,
        `DTSTAMP:${stamp}Z`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'STATUS:CONFIRMED',
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Lembrete BVS Special: ${summary}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BVS Special//Calendario Webcal iOS//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeServerIcsText(`BVS Special • ${userName}`)}`,
    'X-PUBLISHED-TTL:PT1H',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
  ];
  if (events) lines.push(events);
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
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

  async upsertTasksBulk(userId, tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return [];

    if (usePostgres) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        for (const task of tasks) {
          const createdAt = task.createdAt || new Date().toISOString();
          await client.query(
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
              task.id,
              userId,
              task.title,
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
        }
        await client.query('COMMIT');
        return tasks;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    const db = readLocalDb();
    for (const task of tasks) {
      const createdAt = task.createdAt || new Date().toISOString();
      const idx = db.tasks.findIndex((t) => t.user_id === userId && t.id === task.id);
      const record = {
        id: task.id,
        user_id: userId,
        title: task.title,
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
    }
    saveLocalDb(db);
    return tasks;
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

  async deleteTasksBulk(userId, taskIds) {
    const cleanIds = Array.from(
      new Set(
        (Array.isArray(taskIds) ? taskIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean),
      ),
    );
    if (cleanIds.length === 0) return 0;

    if (usePostgres) {
      const result = await pgPool.query(
        'DELETE FROM bv_tasks WHERE user_id = $1 AND id = ANY($2::text[])',
        [userId, cleanIds],
      );
      return Number(result?.rowCount ?? cleanIds.length);
    }

    const db = readLocalDb();
    const idSet = new Set(cleanIds);
    const beforeCount = db.tasks.length;
    db.tasks = db.tasks.filter((t) => !(t.user_id === userId && idSet.has(t.id)));
    saveLocalDb(db);
    return Math.max(0, beforeCount - db.tasks.length);
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

function isValidIsoDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

function normalizeScopeValue(raw) {
  const v = String(raw || 'work').trim().toLowerCase();
  if (v === 'personal' || v === 'pessoal') return 'personal';
  if (v === 'study' || v === 'estudo' || v === 'estudos') return 'study';
  return 'work';
}

function normalizePriorityValue(raw) {
  const v = String(raw || 'medium').trim().toLowerCase();
  if (v === 'high' || v === 'alta' || v === 'urgente') return 'high';
  if (v === 'low' || v === 'baixa') return 'low';
  return 'medium';
}

function normalizeBulkTaskPayload(rawTask) {
  if (!rawTask || typeof rawTask !== 'object') {
    return { error: 'Objeto de tarefa inválido.' };
  }
  const title = String(rawTask.title || '').trim().slice(0, 240);
  const date = String(rawTask.date || '').trim();
  if (!title) {
    return { error: 'Toda tarefa precisa de um título.' };
  }
  if (!isValidIsoDate(date)) {
    return { error: `Data inválida na tarefa "${title}": use o formato YYYY-MM-DD.` };
  }
  const rawTime = rawTask.time ? String(rawTask.time).trim() : '';
  const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : undefined;
  const description = rawTask.description
    ? String(rawTask.description).trim().slice(0, 1200)
    : undefined;

  return {
    task: {
      id: String(rawTask.id || '').trim() || `tsk_${crypto.randomUUID()}`,
      title,
      ...(description ? { description } : {}),
      date,
      ...(validTime ? { time: validTime } : {}),
      priority: normalizePriorityValue(rawTask.priority),
      scope: normalizeScopeValue(rawTask.scope),
      ...(rawTask.folderId ? { folderId: String(rawTask.folderId).trim() } : {}),
      attachments: Array.isArray(rawTask.attachments) ? rawTask.attachments.slice(0, 10) : [],
      isCompleted: Boolean(rawTask.isCompleted),
      notified: Boolean(rawTask.notified),
      createdAt:
        typeof rawTask.createdAt === 'string' && rawTask.createdAt
          ? rawTask.createdAt
          : new Date().toISOString(),
    },
  };
}

function getNextMonthKey(monthKey) {
  const [yStr, mStr] = monthKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function computeMonthlyReviewData(allTasks, monthKey) {
  const monthTasks = (Array.isArray(allTasks) ? allTasks : []).filter(
    (t) => typeof t.date === 'string' && t.date.startsWith(monthKey),
  );
  const completedTasks = monthTasks.filter((t) => Boolean(t.isCompleted));
  const pendingTasks = monthTasks.filter((t) => !t.isCompleted);

  const scopeLabels = {
    work: 'Trabalho',
    personal: 'Pessoal',
    study: 'Estudo',
  };

  const byScope = {
    work: { total: 0, completed: 0, pending: 0 },
    personal: { total: 0, completed: 0, pending: 0 },
    study: { total: 0, completed: 0, pending: 0 },
  };

  for (const task of monthTasks) {
    const scope = normalizeScopeValue(task.scope);
    byScope[scope].total += 1;
    if (task.isCompleted) byScope[scope].completed += 1;
    else byScope[scope].pending += 1;
  }

  let bottleneckScope = null;
  let maxPendingInScope = 0;
  for (const [scopeKey, counts] of Object.entries(byScope)) {
    if (counts.pending > maxPendingInScope) {
      maxPendingInScope = counts.pending;
      bottleneckScope = scopeLabels[scopeKey] || scopeKey;
    }
  }

  const total = monthTasks.length;
  const completed = completedTasks.length;
  const pending = pendingTasks.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const highPriorityPending = pendingTasks.filter((t) => t.priority === 'high').length;

  const summaryForAi = pendingTasks.slice(0, 40).map((t) => ({
    title: t.title,
    date: t.date,
    time: t.time || null,
    priority: t.priority,
    scope: t.scope,
    description: t.description ? String(t.description).slice(0, 140) : null,
  }));

  return {
    stats: {
      month: monthKey,
      total,
      completed,
      pending,
      completionRate,
      highPriorityPending,
      bottleneckScope,
      byScope,
    },
    pendingTasks,
    summaryForAi,
  };
}

function resolveGeminiApiKey() {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
    process.env.GEMINI_KEY,
    process.env.GOOGLE_GEMINI_API_KEY,
  ];

  for (const [envKey, envVal] of Object.entries(process.env)) {
    const normalizedKey = String(envKey || '').trim().toUpperCase();
    if (
      normalizedKey.includes('GEMINI') ||
      normalizedKey === 'GOOGLE_API_KEY' ||
      normalizedKey === 'API_KEY_GEMINI'
    ) {
      candidates.push(envVal);
    }
  }

  for (const raw of candidates) {
    const cleaned = String(raw || '')
      .trim()
      .replace(/^['"]+|['"]+$/g, '');
    if (
      cleaned &&
      cleaned !== 'sua_chave_gemini_aqui' &&
      cleaned !== 'configure_sua_chave_no_painel_render_ou_arquivo_env'
    ) {
      return cleaned;
    }
  }
  return '';
}

function buildSmartMonthlyReviewFallback({ month, nextMonth, stats, pendingSummary }) {
  const bottleneck = stats?.bottleneckCategoryLabel || 'Trabalho';
  const rate = Number(stats?.completionRate ?? 0);
  const total = Number(stats?.total ?? 0);
  const completed = Number(stats?.completed ?? 0);
  const pending = Number(stats?.pending ?? 0);

  const diagnostico =
    total === 0
      ? `No período ${month}, ainda não houve tarefas registradas no cronograma. Este é o momento ideal para estruturar suas metas principais de ${nextMonth} distribuindo prioridades entre Trabalho, Pessoal e Estudo.`
      : `No fechamento de ${month}, você concluiu ${completed} de ${total} tarefas (${rate}% de efetividade), restando ${pending} pendência(s). O principal gargalo concentrou-se em ${bottleneck}, indicando oportunidade de reservar blocos de foco dedicados no início de ${nextMonth}.`;

  const proximosPassos = [
    `Reservar os primeiros 45 minutos das manhãs da primeira semana de ${nextMonth} para atacar as demandas de alta prioridade em ${bottleneck}.`,
    pending > 0
      ? `Reagendar ou fatiar as ${pending} tarefa(s) pendente(s) de ${month} em entregas menores distribuídas nas duas primeiras semanas de ${nextMonth}.`
      : `Manter o ritmo de execução dividindo grandes metas de ${nextMonth} em checkpoints semanais às segundas e quintas-feiras.`,
    `Realizar uma revisão rápida toda sexta-feira na Visão Global do BVS Special para equilibrar a carga entre Trabalho, Estudo e Pessoal.`,
  ];

  const pendingItems = Array.isArray(pendingSummary) ? pendingSummary : [];
  const tarefasSugeridasProximoMes =
    pendingItems.length > 0
      ? pendingItems.slice(0, 4).map((item, idx) => ({
          title: `Concluir: ${String(item.title || 'Demanda prioritária').slice(0, 140)}`,
          description: `Ação retomada do fechamento de ${month} com foco prioritário na primeira quinzena de ${nextMonth}.`,
          date: `${nextMonth}-${String(Math.min(28, 3 + idx * 3)).padStart(2, '0')}`,
          time: item.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time) ? item.time : '09:00',
          priority: item.priority || 'high',
          scope: item.scope || 'work',
        }))
      : [
          {
            title: `Planejamento Executivo e Metas de ${nextMonth}`,
            description: `Definir prioridades críticas e revisar o cronograma mensal no BVS Special.`,
            date: `${nextMonth}-02`,
            time: '09:00',
            priority: 'high',
            scope: 'work',
          },
          {
            title: `Bloco de Foco Semanal — ${bottleneck}`,
            description: `Sessão dedicada para avançar nas entregas mais importantes da categoria ${bottleneck}.`,
            date: `${nextMonth}-06`,
            time: '14:00',
            priority: 'medium',
            scope: 'work',
          },
          {
            title: `Revisão de Evolução e Estudos do Mês`,
            description: `Consolidar aprendizados e organizar materiais de estudo do ciclo ${nextMonth}.`,
            date: `${nextMonth}-12`,
            time: '19:00',
            priority: 'medium',
            scope: 'study',
          },
        ];

  return {
    diagnostico,
    proximosPassos,
    tarefasSugeridasProximoMes,
  };
}

function addDaysToIso(baseIso, daysToAdd) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd));
  return dt.toISOString().slice(0, 10);
}

function getNextWeekdayIso(baseIso, targetWeekday) {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const currentDay = dt.getUTCDay();
  let diff = (targetWeekday - currentDay + 7) % 7;
  if (diff === 0) diff = 7;
  return addDaysToIso(baseIso, diff);
}

function buildSmartAssistantFallback({ message, currentDate }) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();

  const offTopicPatterns = [
    /\breceita\s+de\s+(bolo|pudim|pizza|lasanha|brigadeiro|pão|comida)\b/i,
    /\bpiada\b/i,
    /\bhoróscopo\b/i,
    /\bquem\s+(ganhou|descobriu|inventou|foi\s+o\s+presidente)\b/i,
    /\bqual\s+a\s+capital\b/i,
    /\bresultado\s+do\s+jogo\b/i,
    /\bprevisão\s+do\s+tempo\b/i,
  ];
  const hasTaskIntent =
    /\b(taref|agenda|agendar|lembr|reuni|estud|trabalh|fazer|meta|planej|rotina|cronograma|organizar|compr|pagar|enviar|entregar|revisar|aula|curso|treino|academia|médico|consulta|relatório|projeto|ligar|cliente|semana|amanhã|hoje|segunda|terça|quarta|quinta|sexta|sábado|domingo)\b/i.test(
      lower,
    );

  if (offTopicPatterns.some((rx) => rx.test(lower)) && !hasTaskIntent) {
    return {
      reply:
        'Oi! Sou a Vitorino, sua assistente virtual exclusiva de gestão de tarefas do B V Tasks, e posso ajudar apenas a criar, organizar ou planejar suas atividades.',
      suggestedTasks: [],
    };
  }

  if (
    /^(oi|olá|ola|bom\s+dia|boa\s+tarde|boa\s+noite|tudo\s+bem|ei|vitorino)[!,.?\s]*$/i.test(text)
  ) {
    return {
      reply:
        'Oi! Sou a Vitorino, sua assistente virtual. No que posso te ajudar hoje? Quer fazer algum tipo de planejamento?',
      suggestedTasks: [],
    };
  }

  let extractedTime;
  const timeColonMatch = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const timeHMatch = lower.match(/\b(?:às\s+|as\s+)?([01]?\d|2[0-3])\s*h(?:\s*([0-5]\d))?\b/);
  if (timeColonMatch) {
    extractedTime = `${timeColonMatch[1].padStart(2, '0')}:${timeColonMatch[2]}`;
  } else if (timeHMatch) {
    extractedTime = `${timeHMatch[1].padStart(2, '0')}:${(timeHMatch[2] || '00').padStart(2, '0')}`;
  } else if (/\b(pela\s+manhã|de\s+manhã|cedo)\b/.test(lower)) {
    extractedTime = '09:00';
  } else if (/\b(à\s+tarde|a\s+tarde|de\s+tarde)\b/.test(lower)) {
    extractedTime = '14:00';
  } else if (/\b(à\s+noite|a\s+noite|de\s+noite)\b/.test(lower)) {
    extractedTime = '19:30';
  }

  let category = 'Trabalho';
  if (
    /\b(estud|aula|curso|prova|faculdade|leitura|ler|livro|inglês|programação|revisão\s+de\s+matéria|tcc|apostila)\b/.test(
      lower,
    )
  ) {
    category = 'Estudo';
  } else if (
    /\b(pessoal|médico|consulta|dentista|academia|treino|compras|mercado|supermercado|família|casa|viagem|lazer|aniversário|boleto)\b/.test(
      lower,
    )
  ) {
    category = 'Pessoal';
  }

  let priority = 'medium';
  if (
    /\b(urgente?|alta\s+prioridade|prioridade\s+alta|cr[íi]tic[oa]?|imediato|importante|inadi[áa]vel)\b/.test(
      lower,
    )
  ) {
    priority = 'high';
  } else if (
    /\b(baixa\s+prioridade|prioridade\s+baixa|quando\s+der|sem\s+pressa|opcional)\b/.test(lower)
  ) {
    priority = 'low';
  }

  const weekdayMap = [
    { rx: /\bdomingo\b/, day: 0, label: 'Domingo' },
    { rx: /\bsegunda(?:-feira)?\b/, day: 1, label: 'Segunda-feira' },
    { rx: /\bterça(?:-feira)?\b|\bterca(?:-feira)?\b/, day: 2, label: 'Terça-feira' },
    { rx: /\bquarta(?:-feira)?\b/, day: 3, label: 'Quarta-feira' },
    { rx: /\bquinta(?:-feira)?\b/, day: 4, label: 'Quinta-feira' },
    { rx: /\bsexta(?:-feira)?\b/, day: 5, label: 'Sexta-feira' },
    { rx: /\bsábado\b|\bsabado\b/, day: 6, label: 'Sábado' },
  ];

  const matchedWeekdays = weekdayMap.filter((w) => w.rx.test(lower));

  let baseDate = currentDate;
  const isoMatch = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/);
  const brDateMatch = text.match(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(20\d{2}))?\b/);
  if (isoMatch) {
    baseDate = isoMatch[0];
  } else if (brDateMatch) {
    const year = brDateMatch[3] || currentDate.slice(0, 4);
    const month = brDateMatch[2].padStart(2, '0');
    const day = brDateMatch[1].padStart(2, '0');
    baseDate = `${year}-${month}-${day}`;
  } else if (/\bdepois\s+de\s+amanh[ãa]\b/.test(lower)) {
    baseDate = addDaysToIso(currentDate, 2);
  } else if (/\bamanh[ãa]\b/.test(lower)) {
    baseDate = addDaysToIso(currentDate, 1);
  } else if (matchedWeekdays.length === 1) {
    baseDate = getNextWeekdayIso(currentDate, matchedWeekdays[0].day);
  }

  let cleanTitle = text
    .replace(
      /^(?:por\s+favor\s*,?\s*)?(?:crie|criar|adicione|adicionar|agende|agendar|lembre(?:-me)?\s+de|preciso|quero|divida\s+minha\s+meta\s+de|divida|planeje|organizar|organize)\s+(?:uma\s+tarefa\s+(?:para\s+)?|tarefas?\s+para\s+)?/i,
      '',
    )
    .replace(/\b(?:para\s+)?(?:hoje|amanhã|amanha|depois\s+de\s+amanhã)\b/gi, '')
    .replace(/\b(?:às|as)\s+([01]?\d|2[0-3])(?:h|:)[0-5]?\d?\b/gi, '')
    .replace(/\b(?:com\s+)?prioridade\s+(?:alta|média|media|baixa)\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '');

  if (!cleanTitle) {
    cleanTitle = text.slice(0, 120);
  }
  cleanTitle = cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1);

  const countMatch = lower.match(/\bem\s+([2-6])\s+(?:tarefas|etapas|passos|partes)\b/);
  if (matchedWeekdays.length > 1) {
    const coreTopic =
      cleanTitle
        .replace(
          /\b(?:em\s+\d+\s+tarefas?\s*)?(?:na|no|para)?\s*(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)(?:-feira)?(?:\s*,\s*|\s+e\s+)?/gi,
          ' ',
        )
        .replace(/\s{2,}/g, ' ')
        .trim() || cleanTitle;

    const suggestedTasks = matchedWeekdays.map((wd, idx) => ({
      title: `${coreTopic} — Etapa ${idx + 1} (${wd.label})`,
      description: `Atividade planejada pelo Assistente BVS Special para ${wd.label}.`,
      date: getNextWeekdayIso(currentDate, wd.day),
      ...(extractedTime ? { time: extractedTime } : { time: '09:00' }),
      category,
      priority,
    }));

    return {
      reply: `Perfeito! Estruturei seu plano em ${suggestedTasks.length} tarefas distribuídas nos dias solicitados. Confira abaixo e clique em Confirmar para adicioná-las ao seu cronograma:`,
      suggestedTasks,
    };
  }

  if (countMatch) {
    const totalSteps = Math.min(6, Math.max(2, Number(countMatch[1]) || 3));
    const coreTopic =
      cleanTitle.replace(/\bem\s+[2-6]\s+(?:tarefas|etapas|passos|partes).*$/i, '').trim() ||
      cleanTitle;

    const stepLabels = [
      'Planejamento e levantamento inicial',
      'Execução e desenvolvimento principal',
      'Revisão técnica e validação',
      'Ajustes finais e consolidação',
      'Entrega e acompanhamento',
      'Documentação e fechamento',
    ];

    const suggestedTasks = Array.from({ length: totalSteps }, (_, idx) => ({
      title: `${coreTopic} — Etapa ${idx + 1}: ${stepLabels[idx] || `Fase ${idx + 1}`}`,
      description: `Etapa ${idx + 1} de ${totalSteps} gerada automaticamente para concluir a meta "${coreTopic}".`,
      date: addDaysToIso(baseDate, idx * 2),
      ...(extractedTime ? { time: extractedTime } : { time: '09:00' }),
      category,
      priority,
    }));

    return {
      reply: `Excelente meta! Dividi "${coreTopic}" em ${totalSteps} tarefas sequenciais prontas para execução. Revise os cartões abaixo e confirme com 1 clique:`,
      suggestedTasks,
    };
  }

  return {
    reply: `Preparei a tarefa "${cleanTitle}" na categoria ${category} para ${baseDate}${extractedTime ? ` às ${extractedTime}` : ''}. Toque em Confirmar abaixo para salvá-la no seu cronograma:`,
    suggestedTasks: [
      {
        title: cleanTitle,
        description: `Tarefa estruturada via Assistente IA BVS Special.`,
        date: baseDate,
        ...(extractedTime ? { time: extractedTime } : {}),
        category,
        priority,
      },
    ],
  };
}

async function runGeminiMonthlyReview({ month, nextMonth, stats, pendingSummary, geminiGenerateFn }) {
  const prompt = [
    'Você é um Consultor Executivo de Produtividade do aplicativo BVS Special.',
    `Analise o fechamento do mês ${month} para planejamento do próximo mês ${nextMonth}.`,
    'Responda EXCLUSIVAMENTE em Português do Brasil em JSON válido seguindo o esquema solicitado.',
    'Dados consolidados (somente resumo estatístico e pendências):',
    JSON.stringify({
      mesAnalisado: month,
      proximoMes: nextMonth,
      estatisticas: stats,
      tarefasPendentes: pendingSummary,
    }),
    'Regras obrigatórias:',
    '1. diagnostico: escreva um resumo executivo direto (2 a 4 frases) avaliando a taxa de conclusão, o gargalo principal e prioridades.',
    '2. proximosPassos: exatamente 3 ações práticas e objetivas para destravar produtividade no próximo mês.',
    `3. tarefasSugeridasProximoMes: entre 2 e 5 tarefas estruturadas e acionáveis com datas dentro de ${nextMonth} (YYYY-MM-DD), priority ("high" | "medium" | "low") e scope ("work" | "personal" | "study").`,
  ].join('\n');

  let rawText = '';
  if (typeof geminiGenerateFn === 'function') {
    rawText = await geminiGenerateFn({
      model: 'gemini-2.5-flash',
      prompt,
      month,
      nextMonth,
      stats,
      pendingSummary,
    });
  } else {
    const apiKey = resolveGeminiApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                diagnostico: { type: Type.STRING },
                proximosPassos: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                tarefasSugeridasProximoMes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      date: { type: Type.STRING },
                      time: { type: Type.STRING },
                      priority: { type: Type.STRING },
                      scope: { type: Type.STRING },
                    },
                    required: ['title', 'date', 'priority', 'scope'],
                  },
                },
              },
              required: ['diagnostico', 'proximosPassos', 'tarefasSugeridasProximoMes'],
            },
          },
        });
        rawText = response?.text || '';
      } catch (err) {
        console.warn('[AI Monthly Review Fallback Activated]:', err?.message || err);
        rawText = JSON.stringify(
          buildSmartMonthlyReviewFallback({ month, nextMonth, stats, pendingSummary }),
        );
      }
    } else {
      rawText = JSON.stringify(
        buildSmartMonthlyReviewFallback({ month, nextMonth, stats, pendingSummary }),
      );
    }
  }

  const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  const diagnostico =
    String(parsed?.diagnostico || '').trim() ||
    `Mês ${month}: ${stats.completed} de ${stats.total} tarefas concluídas (${stats.completionRate}%).`;

  const stepsRaw = Array.isArray(parsed?.proximosPassos)
    ? parsed.proximosPassos.map((s) => String(s || '').trim()).filter(Boolean)
    : [];
  while (stepsRaw.length < 3) {
    stepsRaw.push(
      stepsRaw.length === 0
        ? 'Priorizar tarefas de alta criticidade no início da manhã.'
        : stepsRaw.length === 1
          ? 'Agrupar demandas da categoria com maior gargalo em blocos de foco.'
          : 'Revisar pendências migradas semanalmente na Visão Global.',
    );
  }
  const proximosPassos = stepsRaw.slice(0, 3);

  const fallbackDay = (idx) => `${nextMonth}-${String(Math.min(28, 3 + idx * 5)).padStart(2, '0')}`;
  const suggestedRaw = Array.isArray(parsed?.tarefasSugeridasProximoMes)
    ? parsed.tarefasSugeridasProximoMes
    : [];
  const tarefasSugeridasProximoMes = suggestedRaw
    .slice(0, 8)
    .map((item, idx) => {
      const candidateDate = String(item?.date || '').trim();
      const safeDate =
        isValidIsoDate(candidateDate) && candidateDate.startsWith(nextMonth)
          ? candidateDate
          : fallbackDay(idx);
      const rawTime = String(item?.time || '').trim();
      const safeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : undefined;
      return {
        title: String(item?.title || `Planejamento Executivo #${idx + 1}`).trim().slice(0, 200),
        description: String(item?.description || '').trim().slice(0, 600),
        date: safeDate,
        ...(safeTime ? { time: safeTime } : {}),
        priority: normalizePriorityValue(item?.priority),
        scope: normalizeScopeValue(item?.scope),
      };
    })
    .filter((t) => Boolean(t.title));

  return {
    diagnostico,
    proximosPassos,
    tarefasSugeridasProximoMes,
  };
}

async function runGeminiTaskAssistant({
  message,
  currentDate,
  history,
  geminiAssistantFn,
}) {
  const safeCurrentDate = isValidIsoDate(currentDate)
    ? currentDate
    : new Date().toISOString().slice(0, 10);

  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-6)
    .map((entry) => {
      const role = entry?.role === 'assistant' ? 'Assistente' : 'Usuário';
      const text = String(entry?.text || '').trim().slice(0, 400);
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean)
    .join('\n');

  const systemPrompt = [
    'Você é a Vitorino, sua assistente virtual executiva de ação rápida do aplicativo B V Tasks (BVS Special).',
    'ESCOPO EXCLUSIVO: Você deve responder EXCLUSIVAMENTE sobre gestão de tarefas, produtividade, criação de cronogramas, divisão de metas em subtarefas e organização de horários.',
    'Se a mensagem do usuário fugir de tarefas/produtividade/organização pessoal ou profissional, recuse educadamente em 1 frase curta em "reply" apresentando-se como Vitorino e retorne "suggestedTasks": [].',
    `Data atual de referência: ${safeCurrentDate}.`,
    'Retorne SEMPRE um JSON válido com:',
    '- "reply": resposta curta, simpática, direta e cordial em português brasileiro (assinando ou falando como Vitorino quando apropriado).',
    '- "suggestedTasks": lista de tarefas acionáveis (vazia se nenhuma tarefa precisar ser criada), cada uma com "title", "description", "date" (YYYY-MM-DD), "time" (HH:MM opcional), "category" ("Trabalho", "Pessoal" ou "Estudo") e "priority" ("Alta", "Média" ou "Baixa").',
  ].join('\n');

  const fullPrompt = safeHistory
    ? `Histórico recente:\n${safeHistory}\n\nPedido atual do usuário: ${message}`
    : `Pedido do usuário: ${message}`;

  let rawText;
  if (typeof geminiAssistantFn === 'function') {
    rawText = await geminiAssistantFn({
      message,
      currentDate: safeCurrentDate,
      history: safeHistory,
      systemPrompt,
      fullPrompt,
    });
  } else {
    const apiKey = resolveGeminiApiKey();
    if (apiKey) {
      try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: fullPrompt,
          config: {
            systemInstruction: systemPrompt,
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                reply: { type: Type.STRING },
                suggestedTasks: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      title: { type: Type.STRING },
                      description: { type: Type.STRING },
                      date: { type: Type.STRING },
                      time: { type: Type.STRING },
                      category: { type: Type.STRING },
                      priority: { type: Type.STRING },
                    },
                    required: ['title', 'date', 'category', 'priority'],
                  },
                },
              },
              required: ['reply', 'suggestedTasks'],
            },
          },
        });
        rawText = response?.text || '';
      } catch (err) {
        console.warn('[AI Task Assistant Fallback Activated]:', err?.message || err);
        rawText = JSON.stringify(
          buildSmartAssistantFallback({ message, currentDate: safeCurrentDate }),
        );
      }
    } else {
      rawText = JSON.stringify(
        buildSmartAssistantFallback({ message, currentDate: safeCurrentDate }),
      );
    }
  }

  const parsed = typeof rawText === 'string' ? JSON.parse(rawText) : rawText;
  const reply =
    String(parsed?.reply || '').trim() ||
    'Aqui está a sugestão estruturada para o seu cronograma BVS Special.';

  const scopeToCategoryLabel = {
    work: 'Trabalho',
    personal: 'Pessoal',
    study: 'Estudo',
  };

  const rawSuggested = Array.isArray(parsed?.suggestedTasks) ? parsed.suggestedTasks : [];
  const suggestedTasks = rawSuggested
    .slice(0, 12)
    .map((item, idx) => {
      const candidateDate = String(item?.date || '').trim();
      const safeDate = isValidIsoDate(candidateDate) ? candidateDate : safeCurrentDate;
      const rawTime = String(item?.time || '').trim();
      const safeTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(rawTime) ? rawTime : undefined;
      const scope = normalizeScopeValue(item?.category || item?.scope);
      const priority = normalizePriorityValue(item?.priority);
      return {
        title: String(item?.title || `Tarefa Sugerida #${idx + 1}`).trim().slice(0, 200),
        description: String(item?.description || '').trim().slice(0, 600),
        date: safeDate,
        ...(safeTime ? { time: safeTime } : {}),
        category: scopeToCategoryLabel[scope] || 'Trabalho',
        scope,
        priority,
      };
    })
    .filter((t) => Boolean(t.title));

  return {
    reply,
    suggestedTasks,
  };
}

async function handleApiRequest(req, res, pathname, serverOptions = {}) {
  const method = (req.method || 'GET').toUpperCase();
  const clientIp = getClientIp(req);

  // 1. Healthcheck e diagnóstico de persistência SQL
  if (method === 'GET' && pathname === '/api/health') {
    const aiEnabled = true;
    if (usePostgres) {
      try {
        await pgPool.query('SELECT 1');
        return sendJson(res, 200, {
          ok: true,
          status: 'ok',
          engine: 'postgresql',
          sqlPersistent: true,
          aiEnabled,
          version: 'bv-tasks-v12',
          time: new Date().toISOString(),
        });
      } catch (err) {
        return sendJson(res, 503, {
          ok: false,
          status: 'db_error',
          engine: 'postgresql',
          sqlPersistent: false,
          aiEnabled,
          error: 'Falha ao conectar no PostgreSQL: ' + (err?.message || 'erro desconhecido'),
        });
      }
    }
    return sendJson(res, 200, {
      ok: true,
      status: 'ok',
      engine: 'local-file',
      sqlPersistent: false,
      aiEnabled,
      version: 'bv-tasks-v12',
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

  // 8. Feed de Assinatura Automática iOS / Apple Calendar (GET /api/calendar/feed/:userToken.ics)
  if (
    method === 'GET' &&
    pathname.startsWith('/api/calendar/feed/') &&
    pathname.endsWith('.ics')
  ) {
    const rawSegment = pathname
      .slice('/api/calendar/feed/'.length, -'.ics'.length)
      .trim();
    if (!rawSegment) {
      return sendJson(res, 401, { ok: false, error: 'Token do calendário ausente.' });
    }

    let feedUserId = verifyCalendarFeedToken(rawSegment);
    if (!feedUserId) {
      feedUserId = await repo.getUserIdByToken(rawSegment);
    }

    if (!feedUserId) {
      return sendJson(res, 401, { ok: false, error: 'Token do feed de calendário inválido.' });
    }

    const [feedUser, feedData] = await Promise.all([
      repo.findUserById(feedUserId),
      repo.getUserData(feedUserId),
    ]);
    if (!feedUser) {
      return sendJson(res, 404, { ok: false, error: 'Usuário do calendário não encontrado.' });
    }

    const icsPayload = buildServerIcsFeed(feedData.tasks, feedUser.name);
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="cronograma-bv.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(icsPayload);
    return;
  }

  // ==========================================================================
  // Rotas Autenticadas de Tarefas e Pastas (Isoladas por user_id no SQL)
  // ==========================================================================

  const bearerToken = extractBearerToken(req);
  const userId = await repo.getUserIdByToken(bearerToken);
  if (
    !userId &&
    pathname !== '/api/ai/assistant' &&
    pathname !== '/api/ai/monthly-review'
  ) {
    return sendJson(res, 401, {
      ok: false,
      error: 'Sessão expirada ou não autenticada. Faça login novamente.',
    });
  }

  // GET /api/calendar/feed-token -> Gera link assinado seguro para assinatura webcal:// no iOS
  if (method === 'GET' && pathname === '/api/calendar/feed-token') {
    const feedToken = createCalendarFeedToken(userId);
    return sendJson(res, 200, {
      ok: true,
      feedToken,
      feedPath: `/api/calendar/feed/${feedToken}.ics`,
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

  // POST /api/tasks/bulk -> Inserção/Atualização em lote em uma única transação SQL
  if (method === 'POST' && pathname === '/api/tasks/bulk') {
    try {
      const body = await parseJsonBody(req);
      const rawList = Array.isArray(body?.tasks) ? body.tasks : null;
      if (!rawList || rawList.length === 0) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Envie uma lista não vazia em "tasks" para importação em lote.',
        });
      }
      if (rawList.length > 1000) {
        return sendJson(res, 400, {
          ok: false,
          error: 'O limite por importação em lote é de 1.000 tarefas por vez.',
        });
      }

      const validTasks = [];
      const errors = [];
      rawList.forEach((item, index) => {
        const resNorm = normalizeBulkTaskPayload(item);
        if (resNorm.error || !resNorm.task) {
          errors.push(`Linha ${index + 1}: ${resNorm.error || 'Dados inválidos'}`);
        } else {
          validTasks.push(resNorm.task);
        }
      });

      if (errors.length > 0) {
        return sendJson(res, 400, {
          ok: false,
          error: errors[0],
          errors: errors.slice(0, 10),
        });
      }

      const insertedTasks = await repo.upsertTasksBulk(userId, validTasks);
      const userData = await repo.getUserData(userId);
      return sendJson(res, 201, {
        ok: true,
        insertedCount: insertedTasks.length,
        insertedTasks,
        tasks: userData.tasks,
      });
    } catch (err) {
      console.error('[Bulk Tasks Error]', err);
      return sendJson(res, 500, {
        ok: false,
        error: 'Erro interno na transação em lote das tarefas.',
      });
    }
  }

  // POST /api/ai/monthly-review -> Fechamento inteligente do mês com Google Gemini 2.5 Flash
  if (method === 'POST' && pathname === '/api/ai/monthly-review') {
    try {
      const body = await parseJsonBody(req);
      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const requestedMonth = String(body?.month || defaultMonth).trim();

      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Mês inválido. Use o formato YYYY-MM (ex.: 2026-11).',
        });
      }

      const nextMonth = getNextMonthKey(requestedMonth);
      const userData = userId ? await repo.getUserData(userId) : { tasks: [] };
      const clientTasks = Array.isArray(body?.tasks) ? body.tasks : [];
      const sourceTasks =
        Array.isArray(userData?.tasks) && userData.tasks.length > 0
          ? userData.tasks
          : clientTasks;
      const { stats, pendingTasks, summaryForAi } = computeMonthlyReviewData(
        sourceTasks,
        requestedMonth,
      );

      const review = await runGeminiMonthlyReview({
        month: requestedMonth,
        nextMonth,
        stats,
        pendingSummary: summaryForAi,
        geminiGenerateFn: serverOptions.geminiGenerateFn,
      });

      return sendJson(res, 200, {
        ok: true,
        month: requestedMonth,
        nextMonth,
        stats,
        pendingTasksCount: pendingTasks.length,
        pendingTaskIds: pendingTasks.map((t) => t.id),
        review,
      });
    } catch (err) {
      console.error('[AI Monthly Review Error]', err);
      return sendJson(res, 500, {
        ok: false,
        error: 'Erro ao consultar o Gemini para o fechamento mensal. Tente novamente.',
      });
    }
  }

  // POST /api/ai/assistant -> Mini-Chatbot Assistente de Ação Rápida (Exclusivo para Tarefas)
  if (method === 'POST' && pathname === '/api/ai/assistant') {
    try {
      const body = await parseJsonBody(req);
      const message = String(body?.message || '').trim();
      if (!message) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Digite uma mensagem ou meta para o Assistente de Tarefas.',
        });
      }
      if (message.length > 1500) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Mensagem muito longa (máximo de 1.500 caracteres).',
        });
      }

      const currentDate = String(
        body?.currentDate || new Date().toISOString().slice(0, 10),
      ).trim();
      const history = Array.isArray(body?.history) ? body.history : [];

      const assistantResult = await runGeminiTaskAssistant({
        message,
        currentDate,
        history,
        geminiAssistantFn: serverOptions.geminiAssistantFn,
      });

      return sendJson(res, 200, {
        ok: true,
        reply: assistantResult.reply,
        suggestedTasks: assistantResult.suggestedTasks,
      });
    } catch (err) {
      console.error('[AI Assistant Error]', err);
      return sendJson(res, 500, {
        ok: false,
        error: 'Erro ao consultar o Assistente IA de tarefas. Tente novamente.',
      });
    }
  }

  // DELETE /api/tasks/bulk -> Exclui múltiplas tarefas em lote de uma só vez no SQL
  if (method === 'DELETE' && pathname === '/api/tasks/bulk') {
    try {
      const body = await parseJsonBody(req);
      const rawIds = Array.isArray(body?.ids) ? body.ids : null;
      if (!rawIds || rawIds.length === 0) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Envie uma lista não vazia em "ids" para exclusão em lote.',
        });
      }
      if (rawIds.length > 1000) {
        return sendJson(res, 400, {
          ok: false,
          error: 'O limite por exclusão em lote é de 1.000 tarefas por vez.',
        });
      }
      const cleanIds = Array.from(
        new Set(
          rawIds
            .map((id) => String(id || '').trim().slice(0, 128))
            .filter(Boolean),
        ),
      );
      if (cleanIds.length === 0) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Nenhum ID de tarefa válido informado.',
        });
      }

      const deletedCount = await repo.deleteTasksBulk(userId, cleanIds);
      const userData = await repo.getUserData(userId);
      return sendJson(res, 200, {
        ok: true,
        deletedCount,
        deletedIds: cleanIds,
        tasks: userData.tasks,
      });
    } catch (err) {
      console.error('[Bulk Delete Tasks Error]', err);
      return sendJson(res, 500, {
        ok: false,
        error: 'Erro interno ao excluir tarefas em lote.',
      });
    }
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

export function createAppServer(serverOptions = {}) {
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
        return await handleApiRequest(req, res, decodedPathname, serverOptions);
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
          parsedUrl.pathname === '/manifest.json' || parsedUrl.pathname === '/manifest.webmanifest'
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
