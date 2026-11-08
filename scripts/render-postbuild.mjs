/**
 * Rede de segurança para o deploy no Render.
 *
 * Se o Static Site do Render estiver com "Publish Directory" vazio ou apontando para a raiz do
 * repositório (em vez de `dist`), o Render publica o index.html de CÓDIGO-FONTE, que referencia
 * /src/main.tsx — o navegador não consegue executar TSX e o site fica em branco.
 *
 * Este script roda apenas dentro do ambiente de build do Render (variável RENDER=true) e copia o
 * conteúdo compilado de dist/ para a raiz do clone temporário do Render. Assim o site funciona
 * tanto com Publish Directory = "dist" (configuração correta) quanto com a raiz.
 *
 * Localmente (sem RENDER=true) não faz nada, para nunca sobrescrever o index.html de desenvolvimento.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(rootDir, 'dist');

if (process.env.RENDER !== 'true') {
  process.exit(0);
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('[render-postbuild] dist/index.html não encontrado. O build falhou?');
  process.exit(1);
}

fs.cpSync(distDir, rootDir, { recursive: true, force: true });
console.log('[render-postbuild] Build copiado para a raiz (compatível com qualquer Publish Directory).');
