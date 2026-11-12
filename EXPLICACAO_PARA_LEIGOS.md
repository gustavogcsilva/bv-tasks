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
5. Para ativar o **Fechamento do Mês com IA (Google Gemini)**, adicione também no **Environment**:
   - Nome (`Key`): `GEMINI_API_KEY`
   - Valor (`Value`): sua chave gratuita gerada no Google AI Studio (`aistudio.google.com`).
6. Salve! Assim que terminar de publicar, aparecerá **🟢 Banco SQL PostgreSQL Conectado** na tela de login, e sua conta funcionará em qualquer computador, iPhone ou Android!

---

## 4. Novidades de Uso Diário (Celular, iPhone, Excel, IA e PDF Executivo) 📱✨

### 1. Visão Geral Global + Menu Mobile com 1 Mão
- Ao abrir o sistema, você já enxerga **todas as tarefas criadas de uma só vez** na **Visão Geral Global**, com busca rápida, filtros por **Status**, **Prioridade** e **Categoria**, além de poder alternar entre **Lista/Cards** (ótimo no celular) e **Tabela/Grid** (ideal no computador).
- No celular, o menu principal fica fixo na parte de baixo da tela (`Visão Geral`, `Agenda`, `+ Nova`, `Importar` e `IA Mês`) respeitando a barra inferior e o entalhe (*notch*) do iPhone.

### 2. Abrir com 1 Toque no iPhone (Tela de Início + App Atalhos da Apple)
- Abra o site no **Safari** do iPhone, toque no botão **Compartilhar** (quadradinho com seta para cima) → **Adicionar à Tela de Início**. O app abrirá em tela cheia, sem barra do navegador.
- Você também pode criar atalhos no app **Atalhos (Shortcuts)** do iPhone usando links diretos:
  - Criar nova tarefa direto: `SEU-SITE/?action=new-task`
  - Abrir Assistente IA (Chat): `SEU-SITE/?action=chat`
  - Abrir Importação em lote: `SEU-SITE/?action=import`
  - Abrir Fechamento IA do mês: `SEU-SITE/?action=ai-review`
  - Filtrar só as tarefas de Hoje: `SEU-SITE/?filter=today`

### 3. Sincronização Direta com o Calendário do iPhone (Apple Calendar + `webcal://`)
- **Envio Instantâneo (1 Toque):** Ao tocar em **📲 Sincronizar (.ics)** no iPhone, o app abre a folha nativa de compartilhamento da Apple para enviar todas as tarefas direto para o app **Calendário**.
- **Assinatura Automática (`webcal://`):** Na barra lateral ou na **Central de Sincronização**, toque em **"🔗 Copiar Link de Sincronização iOS"**. Depois, no iPhone, vá em **Ajustes → Apps → Calendário → Contas → Adicionar Conta → Outra → Adicionar Calendário Assinado** e cole o link para manter sua agenda sincronizada automaticamente!

### 4. Importar Planejamento em Lote (Excel, CSV, JSON ou ChatGPT)
- No botão **📥 Importar**, você pode:
  - **Baixar Planilha Modelo (.xlsx)** pronta para preencher no Excel ou Google Planilhas.
  - **Copiar Prompt para IA**, colar no ChatGPT para ele montar todo o seu mês e depois importar ou colar o JSON gerado.
  - Conferir tudo na tela de pré-visualização antes de salvar todas as tarefas de uma só vez no banco SQL.

### 5. Mini-Chatbot Assistente de Ação Rápida (Exclusivo para Tarefas)
- Toque em **🤖 Assistente IA** (no botão flutuante do computador ou na barra inferior do celular) e peça em linguagem natural, por exemplo: *"Divida minha meta da semana em 3 tarefas de Trabalho"* ou *"Organize minha rotina de estudos às 19h"*.
- O assistente gera os cards prontos dentro do chat e você adiciona tudo ao cronograma com 1 clique em **"Confirmar e Adicionar ao Cronograma"**.

### 6. Fechamento Inteligente do Mês com IA (Google Gemini)
- Em **✨ IA Mês**, o sistema calcula suas estatísticas do mês (concluídas, taxa de entrega e onde houve gargalo) e pede ao **Google Gemini** um diagnóstico objetivo, **3 próximos passos** práticos e sugestões para o próximo mês.
- Com um único clique em **"Aplicar Sugestões e Migrar Pendentes"**, as novas tarefas sugeridas são criadas e tudo o que ficou pendente é transferido automaticamente para o próximo mês.

### 7. Novo Relatório Executivo em PDF
- Ao clicar em **Exportar PDF**, o aplicativo gera um PDF moderno com faixa superior em Bordeaux & Dourado, o brasão **BVS Special**, **4 cards de indicadores (KPIs)** no topo, tabela organizada com status/prioridades coloridas, numeração `Página X de Y` e suporte direto ao compartilhamento nativo no iPhone (WhatsApp, Arquivos, E-mail).
