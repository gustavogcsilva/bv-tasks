# B V Tasks 🍾🍷📖 — Executive Planner (Web, iPhone iOS & Android PWA)

Aplicação web progressiva (**PWA — Progressive Web App**) de calendário executivo interativo, gerenciamento de pastas, captura com câmera do celular/PDFs, notificações nativas e sincronização móvel tanto **online quanto offline**.

Construída no padrão **Apple Human Interface Guidelines (HIG)** com **tipografia executiva de sistema** (San Francisco / Inter), paleta **Vermelho Vinho (`#991B1B` / `#7F1D1D`) & Preto (`#09090B`)**, alternância instantânea entre **Modo Claro e Modo Escuro**, e logotipo exclusivo trazendo **Garrafa de Vinho + Taça de Vinho + Livro Aberto + Iniciais B V**.

---

## 🎯 Destaques e Novas Funcionalidades

### 1. 📊 Barra de Menu Lateral com Usuário Logado e Mini Status Bar (Mobile & Desktop)
- **Quem Está Logado:** No lado esquerdo, a Barra de Menu exibe a foto/avatar do usuário, nome completo, e-mail e selo da conta (`Google` ou `B V Tasks`), com botão rápido para deslogar.
- **Total Compatibilidade com Celulares:**
  - Em telas menores (smartphones), um botão com avatar e atalho de menu (`☰ [Avatar] [Nome] ⭐`) fica sempre visível no cabeçalho.
  - Ao tocar, abre-se uma gaveta lateral animada (*slide-in drawer*) que garante 100% de visibilidade no celular.
- **Mini Status Bar Executivo:**
  - Painel com contagem em tempo real: **Tarefas Criadas**, **⭐ Importantes (Alta Prioridade)** e **✓ Concluídas**, além de barra de progresso visual percentual.
- **Tarefas Importantes & "O que elas fazem":**
  - Lista detalhada de tarefas de prioridade Alta com título, escopo, data/hora e a descrição clara do que cada tarefa faz.
  - **Navegação Direta:** Ao clicar em qualquer tarefa importante na barra de menu, o aplicativo muda automaticamente a data do calendário, rola a tela suavemente até a tarefa e ativa um destaque pulsante com borda vermelho vinho (`animate-highlight-pulse`).

### 2. 🔐 Autenticação Google Estilo Login de E-mail (Sem Token JWT)
- **Login com Google Intuitivo e Familiar:**
  - Ao conectar com o Google, o usuário informa seu e-mail (`@gmail.com` ou Google Workspace) e senha de acesso da conta de forma simples e direta, idêntica à experiência de acessar o próprio e-mail.
  - **Zero JWT:** Não há nenhum campo técnico ou solicitação de tokens criptográficos ao usuário.
  - Validação rigorosa de formato e preservação da sessão permanente no aparelho via armazenamento local seguro.

### 3. ✍️ Tipografia Executiva Padronizada (Padrão Apple HIG)
- Remoção de fontes serifadas extravagantes e fora do padrão.
- Adoção da tipografia nativa de alta tecnologia Apple HIG (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `Inter`, `system-ui`).
- Hierarquia visual limpa e elegante com excelente legibilidade em iPhones, telas retina, celulares Android e computadores.

### 4. ✨ Animação Fluida na Criação de Tarefas & Feedback Tátil
- **Entrada Animada com Destaque:** Ao criar uma tarefa, o modal fecha com suavidade e a nova tarefa entra na lista com animação fluida (`animate-task-enter`) acompanhada de um pulso de brilho bordô (`animate-highlight-pulse`).
- **Banner Executivo de Confirmação (Toast):** Notificação flutuante com confirmação visual e feedback tátil no celular via `navigator.vibrate`.

### 5. 📱🔄 Sincronização Mobile & Funcionamento 100% Offline / Online
- **Indicador Interativo de Conexão no Topo:**
  - `🟢 Sincronizado (Online)` quando conectado à internet.
  - `🟠 Modo Offline (Local Seguro)` quando sem conexão.
- **Central de Sincronização:** Mostra a contagem de tarefas verificadas, integridade 100% garantida (IndexedDB/localStorage) e botão para sincronizar manualmente com animação giratória.
- **Detecção Automática de Reconexão:** Ao recuperar o sinal (4G/5G/Wi-Fi), a aplicação sincroniza automaticamente e notifica o usuário.
- **Exportação para o Calendário Nativo do Celular (.ics & Google Agenda):** Sincronização em 1 toque com o Calendário do iPhone (Apple Calendar) e Android com alertas nativos pré-configurados.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento
npm run dev

# 3. Rodar checagem de tipos, testes e build de produção
npm run typecheck
npm test
npm run build
```

---

## ☁️ Deploy no Render (`render.yaml`)

O repositório está configurado para deploy automático contínuo no **Render**:
- **Ambiente:** Static Site
- **Build Command:** `npm ci && npm run build`
- **Publish Directory:** `dist`
- **URL em Produção:** [https://bv-tasks.onrender.com/](https://bv-tasks.onrender.com/)

Para uma explicação acessível e detalhada para leigos, leia [**EXPLICACAO_PARA_LEIGOS.md**](./EXPLICACAO_PARA_LEIGOS.md).
