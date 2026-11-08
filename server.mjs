import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

// Diretório e arquivo do Banco de Dados Persistente B V Tasks
const dataDir = path.join(__dirname, 'data');
const dbFilePath = path.join(dataDir, 'bv-tasks.db.json');

// Garante que o diretório data/ existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// Inicializa o banco de dados se não existir
if (!fs.existsSync(dbFilePath)) {
  const initialDb = {
    users: [],
    tasks: [],
    folders: [],
    sessions: [],
  };
  fs.writeFileSync(dbFilePath, JSON.stringify(initialDb, null, 2), 'utf-8');
}

// Se a pasta dist ainda não foi gerada no ambiente do Render, executa o build automaticamente
if (!fs.existsSync(indexHtmlPath)) {
  console.log('[B V Tasks Server] Pasta dist não encontrada. Executando build de produção...');
  execSync('npm run build', { stdio: 'inherit' });
}

// ==========================================
// Módulo de Banco de Dados e Criptografia
// ==========================================

function readDatabase() {
  try {
    const raw = fs.readFileSync(dbFilePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      folders: Array.isArray(parsed.folders) ? parsed.folders : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch (err) {
    console.error('[DB Error] Falha ao ler banco de dados:', err);
    return { users: [], tasks: [], folders: [], sessions: [] };
  }
}

function saveDatabase(db) {
  try {
    const tmpFile = `${dbFilePath}.tmp-${Date.now()}`;
    fs.writeFileSync(tmpFile, JSON.stringify(db, null, 2), 'utf-8');
    fs.renameSync(tmpFile, dbFilePath);
  } catch (err) {
    console.error('[DB Error] Falha ao salvar banco de dados:', err);
  }
}

// Hash de senha criptográfico seguro usando PBKDF2 com SHA-512 e salt exclusivo
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
}

function verifyPassword(password, salt, storedHash) {
  if (!password || !salt || !storedHash) return false;
  try {
    const computed = hashPassword(password, salt);
    const bufA = Buffer.from(computed, 'hex');
    const bufB = Buffer.from(storedHash, 'hex');
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    provider: user.provider || 'email',
    avatarUrl: user.avatarUrl,
    googleId: user.googleId,
    createdAt: user.createdAt,
  };
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      // Limite de 15MB para permitir anexos de imagem/PDF nas tarefas
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

// Autentica token de sessão
function getAuthenticatedUserId(req, db) {
  const authHeader = req.headers['authorization'] || '';
  let token = authHeader.replace(/^Bearer\s+/i, '').trim();

  if (!token) {
    const parsedUrl = new URL(req.url, 'http://localhost');
    token = parsedUrl.searchParams.get('token') || '';
  }

  if (!token) return null;
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return null;

  // Validação de expiração (30 dias)
  if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
    return null;
  }

  return session.userId;
}

// ==========================================
// Rotas da API REST do Servidor
// ==========================================

async function handleApiRequest(req, res, pathname) {
  const method = req.method.toUpperCase();

  // 1. Healthcheck
  if (method === 'GET' && pathname === '/api/health') {
    return sendJson(res, 200, {
      status: 'ok',
      db: 'connected',
      version: 'bv-tasks-v7',
      time: new Date().toISOString(),
    });
  }

  // 2. Registro de Conta
  if (method === 'POST' && pathname === '/api/auth/register') {
    try {
      const { name, email, password, recoveryKeyword } = await parseJsonBody(req);
      const trimmedName = (name || '').trim();
      const normalizedEmail = (email || '').trim().toLowerCase();
      const normalizedPassword = (password || '').trim();
      const keyword = (recoveryKeyword || 'vinho').trim().toLowerCase();

      if (!trimmedName || trimmedName.length < 2) {
        return sendJson(res, 400, { ok: false, error: 'Informe seu nome completo ou profissional.' });
      }
      if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return sendJson(res, 400, { ok: false, error: 'Informe um endereço de e-mail válido.' });
      }
      if (normalizedPassword.length < 6) {
        return sendJson(res, 400, { ok: false, error: 'A senha deve conter no mínimo 6 caracteres.' });
      }

      const db = readDatabase();
      const existing = db.users.find((u) => u.email === normalizedEmail);
      if (existing) {
        // Se a senha bater com a existente, faz o login transparente
        if (verifyPassword(normalizedPassword, existing.salt, existing.passwordHash)) {
          const token = `tok_${crypto.randomBytes(32).toString('hex')}`;
          const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
          db.sessions.push({ token, userId: existing.id, expiresAt });
          saveDatabase(db);
          return sendJson(res, 200, { ok: true, user: sanitizeUser(existing), token });
        }
        return sendJson(res, 409, { ok: false, error: 'Este e-mail já possui conta cadastrada. Faça login.' });
      }

      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = hashPassword(normalizedPassword, salt);
      const newUser = {
        id: `usr_${crypto.randomUUID()}`,
        name: trimmedName,
        email: normalizedEmail,
        passwordHash,
        salt,
        recoveryKeyword: keyword,
        provider: 'email',
        createdAt: new Date().toISOString(),
      };

      const token = `tok_${crypto.randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      db.users.push(newUser);
      db.sessions.push({ token, userId: newUser.id, expiresAt });
      saveDatabase(db);

      return sendJson(res, 201, { ok: true, user: sanitizeUser(newUser), token });
    } catch {
      return sendJson(res, 500, { ok: false, error: 'Erro interno ao processar cadastro.' });
    }
  }

  // 3. Login de Conta (com verificação estrita para Celular e Computador)
  if (method === 'POST' && pathname === '/api/auth/login') {
    try {
      const { email, password } = await parseJsonBody(req);
      const normalizedEmail = (email || '').trim().toLowerCase();
      const normalizedPassword = (password || '').trim();

      if (!normalizedEmail || !normalizedPassword) {
        return sendJson(res, 400, { ok: false, error: 'Informe e-mail e senha.' });
      }

      const db = readDatabase();
      const user = db.users.find((u) => u.email === normalizedEmail);

      if (!user || !verifyPassword(normalizedPassword, user.salt, user.passwordHash)) {
        return sendJson(res, 401, { ok: false, error: 'E-mail ou senha incorretos.' });
      }

      const token = `tok_${crypto.randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.sessions.push({ token, userId: user.id, expiresAt });
      saveDatabase(db);

      return sendJson(res, 200, { ok: true, user: sanitizeUser(user), token });
    } catch {
      return sendJson(res, 500, { ok: false, error: 'Erro interno ao realizar login.' });
    }
  }

  // 4. Autenticação Direta do Google (como entrar no e-mail, sem JWT)
  if (method === 'POST' && pathname === '/api/auth/google') {
    try {
      const { email, name, password, avatarUrl, googleId } = await parseJsonBody(req);
      const normalizedEmail = (email || '').trim().toLowerCase();
      const normalizedPassword = (password || '').trim();

      if (!normalizedEmail || !normalizedEmail.includes('@')) {
        return sendJson(res, 400, { ok: false, error: 'Informe um e-mail Google válido.' });
      }

      const db = readDatabase();
      let user = db.users.find((u) => u.email === normalizedEmail);

      if (user) {
        // Se forneceu senha, valida caso a conta já tenha senha cadastrada
        if (normalizedPassword && user.passwordHash && user.provider !== 'google') {
          if (!verifyPassword(normalizedPassword, user.salt, user.passwordHash)) {
            return sendJson(res, 401, { ok: false, error: 'Senha incorreta para esta conta Google cadastrada.' });
          }
        }
        user.provider = 'google';
        if (avatarUrl) user.avatarUrl = avatarUrl;
        if (googleId) user.googleId = googleId;
      } else {
        const resolvedName = (name || '').trim() || normalizedEmail.split('@')[0];
        const salt = crypto.randomBytes(16).toString('hex');
        const pass = normalizedPassword || `g-pass-${crypto.randomBytes(12).toString('hex')}`;
        const passwordHash = hashPassword(pass, salt);

        user = {
          id: `usr_${crypto.randomUUID()}`,
          name: resolvedName,
          email: normalizedEmail,
          passwordHash,
          salt,
          recoveryKeyword: 'google',
          provider: 'google',
          avatarUrl,
          googleId,
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
      }

      const token = `tok_${crypto.randomBytes(32).toString('hex')}`;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.sessions.push({ token, userId: user.id, expiresAt });
      saveDatabase(db);

      return sendJson(res, 200, { ok: true, user: sanitizeUser(user), token });
    } catch {
      return sendJson(res, 500, { ok: false, error: 'Erro interno ao autenticar com o Google.' });
    }
  }

  // 5. Recuperação de Senha
  if (method === 'POST' && pathname === '/api/auth/reset-password') {
    try {
      const { email, keyword, newPassword, token } = await parseJsonBody(req);
      const normalizedEmail = (email || '').trim().toLowerCase();
      const normalizedNewPass = (newPassword || '').trim();

      if (normalizedNewPass.length < 6) {
        return sendJson(res, 400, { ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      }

      const db = readDatabase();
      const user = db.users.find((u) => u.email === normalizedEmail);
      if (!user) {
        return sendJson(res, 404, { ok: false, error: 'Nenhuma conta encontrada com este e-mail.' });
      }

      // Validação por palavra-chave ou token
      if (keyword) {
        const normalizedKeyword = keyword.trim().toLowerCase();
        if ((user.recoveryKeyword || '').toLowerCase() !== normalizedKeyword) {
          return sendJson(res, 403, { ok: false, error: 'Palavra-chave incorreta para este e-mail.' });
        }
      } else if (token) {
        const expectedToken = Buffer.from(encodeURIComponent(normalizedEmail)).toString('base64');
        if (token !== expectedToken) {
          return sendJson(res, 403, { ok: false, error: 'Token de redefinição inválido ou expirado.' });
        }
      } else {
        return sendJson(res, 400, { ok: false, error: 'Informe a palavra-chave de segurança ou token.' });
      }

      const newSalt = crypto.randomBytes(16).toString('hex');
      user.salt = newSalt;
      user.passwordHash = hashPassword(normalizedNewPass, newSalt);

      const sessionToken = `tok_${crypto.randomBytes(32).toString('hex')}`;
      db.sessions.push({ token: sessionToken, userId: user.id });
      saveDatabase(db);

      return sendJson(res, 200, { ok: true, user: sanitizeUser(user), token: sessionToken });
    } catch {
      return sendJson(res, 500, { ok: false, error: 'Erro ao redefinir senha.' });
    }
  }

  // 6. Sincronização de Tarefas e Pastas (GET - Puxa do Banco de Dados)
  if (method === 'GET' && pathname === '/api/sync') {
    const db = readDatabase();
    const userId = getAuthenticatedUserId(req, db);

    if (!userId) {
      return sendJson(res, 401, { ok: false, error: 'Não autorizado. Faça login.' });
    }

    const userTasks = db.tasks.filter((t) => t.userId === userId);
    const userFolders = db.folders.filter((f) => f.userId === userId);

    return sendJson(res, 200, {
      ok: true,
      tasks: userTasks,
      folders: userFolders,
      syncedAt: new Date().toISOString(),
    });
  }

  // 7. Sincronização de Tarefas e Pastas (POST - Salva no Banco de Dados)
  if (method === 'POST' && pathname === '/api/sync') {
    try {
      const db = readDatabase();
      const userId = getAuthenticatedUserId(req, db);

      if (!userId) {
        return sendJson(res, 401, { ok: false, error: 'Não autorizado. Faça login.' });
      }

      const { tasks, folders } = await parseJsonBody(req);

      if (Array.isArray(tasks)) {
        // Remove tarefas antigas desse usuário e salva as novas com o userId
        const otherTasks = db.tasks.filter((t) => t.userId !== userId);
        const mappedTasks = tasks.map((t) => ({ ...t, userId }));
        db.tasks = [...otherTasks, ...mappedTasks];
      }

      if (Array.isArray(folders)) {
        const otherFolders = db.folders.filter((f) => f.userId !== userId);
        const mappedFolders = folders.map((f) => ({ ...f, userId }));
        db.folders = [...otherFolders, ...mappedFolders];
      }

      saveDatabase(db);

      return sendJson(res, 200, {
        ok: true,
        tasksCount: Array.isArray(tasks) ? tasks.length : 0,
        foldersCount: Array.isArray(folders) ? folders.length : 0,
        syncedAt: new Date().toISOString(),
      });
    } catch {
      return sendJson(res, 500, { ok: false, error: 'Erro ao sincronizar tarefas no banco de dados.' });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'Endpoint da API não encontrado.' });
}

// ==========================================
// Servidor HTTP Estático e Roteamento
// ==========================================

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

const port = Number(process.env.PORT) || 4173;

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
};

const server = http.createServer(async (req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }

  // Suporte a CORS local para ambiente de desenvolvimento
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

    // Se for uma requisição para a API REST do Banco de Dados
    if (decodedPathname.startsWith('/api/')) {
      return await handleApiRequest(req, res, decodedPathname);
    }

    // Proteção contra Path Traversal: o arquivo resolvido precisa estar dentro de dist/
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

    // Se for um asset inexistente (.js, .css, etc.), retorna 404
    if (/\.(js|mjs|css|png|jpg|jpeg|svg|ico|woff2?|map)$/i.test(parsedUrl.pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Asset not found');
      return;
    }

    // SPA Fallback para rotas da aplicação
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    fs.createReadStream(indexHtmlPath).pipe(res);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`[B V Tasks] Servidor Full Stack e Banco de Dados ativo em http://0.0.0.0:${port}`);
});
