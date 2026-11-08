# B V Tasks 🍾🍷📖 — Executive Planner (Full Stack SQL + PWA iOS & Android)

Aplicação web progressiva (**PWA — Progressive Web App**) Full Stack com **Banco de Dados SQL (PostgreSQL)**, calendário executivo interativo, gerenciamento de pastas, captura com câmera do celular/PDFs, notificações nativas e sincronização multi-dispositivo real (**Computador ↔ iPhone ↔ Android**).

Construída no padrão **Apple Human Interface Guidelines (HIG)** com tipografia nativa de sistema, paleta **Vermelho Vinho (`#991B1B` / `#7F1D1D`) & Preto (`#09090B`)**, alternância entre **Modo Claro e Modo Escuro**, e logotipo exclusivo trazendo **Garrafa de Vinho + Taça de Vinho + Livro Aberto + Iniciais B V**.

---

## 🗄️ Arquitetura SQL Multi-Dispositivo (Fim do Login Volátil)

### Por que é necessário um Banco SQL no Render?
1. **Static Site vs. Web Service:** Um *Static Site* no Render serve apenas HTML/CSS/JS estáticos pelo CDN (não executa o servidor Node `server.mjs`). Sem o servidor Node + SQL, as contas ficam salvas apenas no navegador daquele aparelho específico (*login volátil*).
2. **Disco Efêmero no Plano Gratuito:** Mesmo em um *Web Service*, o disco local gratuito do Render é apagado toda vez que o container hiberna após 15 minutos sem uso.
3. **Solução Definitiva SQL (`PostgreSQL`):** O backend [`server.mjs`](./server.mjs) conecta-se nativamente ao **PostgreSQL** via variável `DATABASE_URL` e executa automaticamente o schema [`database/schema.sql`](./database/schema.sql) na inicialização, garantindo persistência permanente entre todos os seus aparelhos.

---

## ☁️ Como Ativar o Banco SQL no Render (Passo a Passo Rápido)

Você tem **duas opções gratuitas** para ativar a persistência SQL definitiva:

### Opção A — Automática em 1 Clique via Blueprint do Render (`render.yaml`)
1. No painel do [Render](https://dashboard.render.com/), remova o *Static Site* antigo (se desejar usar o mesmo nome) e clique em **New +** → **Blueprint**.
2. Selecione o repositório **`gustavogcsilva/bv-tasks`**.
3. O Render lerá o arquivo [`render.yaml`](./render.yaml) e criará automaticamente:
   - O banco SQL **PostgreSQL** (`bv-tasks-sql`);
   - O **Web Service Node.js** (`bv-tasks`) já conectado ao banco via `DATABASE_URL`!

### Opção B — Banco PostgreSQL Gratuito Permanente (Neon.tech ou Supabase) + Render Web Service
*(Recomendado caso queira um banco SQL gratuito que nunca expira após 30 dias)*:
1. Crie um projeto gratuito no **[Neon.tech](https://neon.tech)** ou **[Supabase](https://supabase.com)** e copie a **Connection String (`postgresql://...`)**.
2. No painel do Render, clique em **New +** → **Web Service** (⚠️ **não** escolha *Static Site*) e conecte o repositório `bv-tasks`:
   - **Runtime:** `Node`
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
3. Em **Environment Variables**, adicione:
   - `DATABASE_URL` = *(cole sua string `postgresql://...`)*
   - `NODE_ENV` = `production`
4. Pronto! Ao iniciar, o `server.mjs` criará automaticamente as tabelas `bv_users`, `bv_sessions`, `bv_folders` e `bv_tasks`!

---

## 🛡️ Segurança de Nível Bancário e Limpeza de Dados
- **Limpeza Total (`v8`):** Todos os dados de teste e caches antigos foram limpos automaticamente via migração `bv-tasks-sql-v8` e Service Worker `v8` (com bypass estrito em `/api/*`).
- **PBKDF2-HMAC-SHA512 (100.000 iterações):** Senhas e palavras-chave de recuperação protegidas com *salt* único de 16 bytes e comparação em tempo constante (`crypto.timingSafeEqual`).
- **Tokens de Recuperação Assinados (HMAC-SHA256):** Expiração de 30 minutos contra falsificação de links.
- **Isolamento Estrito por `user_id`:** Queries SQL parametrizadas (`$1, $2...`) imunes a SQL Injection; ao sair da conta, a memória local do aparelho é limpa imediatamente.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. (Opcional) Configurar DATABASE_URL no ambiente para testar direto no PostgreSQL
# Caso não definida, usa armazenamento limpo de desenvolvimento local
npm start

# 3. Rodar checagem de tipos, testes automatizados (24 testes) e build
npm run typecheck
npm test
npm run build
```

Para uma explicação simples e acessível, consulte [**EXPLICACAO_PARA_LEIGOS.md**](./EXPLICACAO_PARA_LEIGOS.md).
