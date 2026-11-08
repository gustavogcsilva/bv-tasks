# 📖 Guia Simples: Como Funciona o Banco SQL e o Login em Qualquer Aparelho

Este guia explica de forma simples por que o login antes funcionava apenas em um aparelho, o que foi corrigido no código e como ligar o **Banco de Dados SQL** para salvar tudo para sempre.

---

## 1. Por que antes parecia um "Login Volátil" (só funcionava onde foi criado)? 🤔

Existiam **dois motivos técnicos** na hospedagem do Render:

1. **O site estava publicado como "Static Site" (Site Estático):**
   - Um *Static Site* serve apenas as telas visuais (como um folheto digital) — ele **não liga o motor do servidor** (`server.mjs`). Por isso, quando você criava uma conta no computador, ela ficava guardada apenas dentro do navegador daquele computador. Ao abrir o celular, o celular não sabia que aquela conta existia!
2. **Sim, você precisa de um Banco de Dados SQL (`PostgreSQL`):**
   - No plano gratuito do Render, arquivos comuns salvos em pasta são apagados toda vez que o servidor descansa por 15 minutos.
   - Já um **Banco de Dados SQL (PostgreSQL)** funciona como um **cofre permanente na nuvem**: você cria sua conta uma única vez (no computador ou no celular) e entra direto de qualquer outro aparelho usando o mesmo e-mail e senha!

---

## 2. Tudo o que já deixamos 100% pronto e limpo para você 🧹✨

1. **Limpeza Completa de Dados Antigos:**
   - Todos os cadastros antigos de teste, tarefas anteriores e pastas pré-criadas foram **100% zerados e limpos**. Ao abrir o aplicativo atualizado, ele remove automaticamente os dados velhos do navegador.
   - Também adicionamos um botão **"🧹 Limpar Todas as Tarefas e Pastas"** dentro da **Central de Sincronização** caso você queira zerar sua agenda a qualquer momento.
2. **Motor SQL PostgreSQL Criado (`server.mjs` + `database/schema.sql`):**
   - Você **não precisa escrever nenhum comando SQL**! Assim que conectar o banco PostgreSQL, o sistema cria sozinho as 4 tabelas oficiais (`bv_users`, `bv_sessions`, `bv_folders` e `bv_tasks`).
3. **Detector Inteligente na Tela de Login:**
   - A própria tela de login agora avisa com transparência quando o **🟢 Banco SQL PostgreSQL está Conectado** ou quando o Render ainda está em modo estático.
4. **Sincronização em Tempo Real entre Celular e Computador:**
   - Criou, concluiu ou apagou uma tarefa no celular? Ao olhar para o computador, a agenda atualiza automaticamente!

---

## 3. Como Ativar seu Banco SQL Gratuito em 3 Minutos 🚀

### Jeito 1 — Mais Rápido (Tudo dentro do próprio Render via Blueprint):
1. Entre no painel do **Render** (`dashboard.render.com`).
2. Se quiser substituir o site estático antigo, apague o *Static Site* anterior e clique no botão **New +** → **Blueprint**.
3. Escolha o seu repositório **`bv-tasks`**.
4. Clique em **Apply**: o Render vai criar sozinho o **Servidor Node** + o **Banco SQL PostgreSQL** já interligados!
*(Observação: o banco PostgreSQL gratuito do Render dura 30 dias no plano free; se quiser um banco gratuito para sempre sem prazo, use o Jeito 2 abaixo!)*

### Jeito 2 — Gratuito Para Sempre (Neon.tech ou Supabase + Render Web Service):
1. Crie uma conta gratuita no site **[Neon.tech](https://neon.tech)** (ou **[Supabase.com](https://supabase.com)**), crie um banco PostgreSQL e copie o link dele (começa com `postgresql://...`).
2. No painel do **Render**, clique em **New +** → **Web Service** *(importante: escolha **Web Service**, não Static Site!)*.
3. Conecte o repositório **`bv-tasks`** e confira os comandos:
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
4. Na aba **Environment**, adicione a variável:
   - Nome (`Key`): `DATABASE_URL`
   - Valor (`Value`): cole o link `postgresql://...` que você copiou.
5. Salve! Assim que terminar de publicar, aparecerá **🟢 Banco SQL PostgreSQL Conectado** na tela de login, e sua conta funcionará em qualquer computador, iPhone ou Android!
