import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');

// Se a pasta dist ainda não foi gerada no ambiente do Render, executa o build automaticamente
if (!fs.existsSync(indexHtmlPath)) {
  console.log('[B V Tasks Server] Pasta dist não encontrada. Executando build de produção...');
  execSync('npm run build', { stdio: 'inherit' });
}

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

const server = http.createServer((req, res) => {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
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

    // Se for um arquivo estático inexistente (.js, .css, .png), retorna 404 real para não quebrar módulos ES
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
  console.log(`[B V Tasks] Servidor de produção ativo em http://0.0.0.0:${port}`);
});
