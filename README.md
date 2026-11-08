# B V Tasks 🍾🍷📖 — Executive Planner (Web, iPhone iOS & Android PWA)

Aplicação web progressiva (**PWA — Progressive Web App**) Full Stack com banco de dados centralizado no Render, calendário executivo interativo, gerenciamento de pastas, captura com câmera do celular/PDFs, notificações nativas e sincronização móvel tanto **online quanto offline**.

Construída no padrão **Apple Human Interface Guidelines (HIG)** com **tipografia executiva de sistema** (San Francisco / Inter), paleta **Vermelho Vinho (`#991B1B` / `#7F1D1D`) & Preto (`#09090B`)**, alternância instantânea entre **Modo Claro e Modo Escuro**, e logotipo exclusivo trazendo **Garrafa de Vinho + Taça de Vinho + Livro Aberto + Iniciais B V**.

---

## 🎯 Destaques e Novas Funcionalidades

### 1. 🌐💾 Banco de Dados Central Cross-Device & Sincronização Segura
- **Persistência Central no Render (`server.mjs`):** Armazenamento de contas, credenciais criptografadas, tarefas e pastas em banco de dados central persistente com escritas atômicas e isolamento total por usuário.
- **Sincronização Computador ↔ Celular:** Contas e tarefas criadas no computador ficam imediatamente disponíveis no celular e vice-versa, acabando com a perda de sessão ou inconsistência de senhas entre aparelhos.
- **Resiliência Offline / Online:** Continua funcionando 100% mesmo se a conexão cair ou o servidor hibernar no plano gratuito do Render. Dados são mantidos no `localStorage`/IndexedDB local e sincronizados automaticamente na reconexão.

### 2. 🛡️🔒 Engenharia de Segurança & Criptografia de Nível Bancário
- **PBKDF2 com HMAC-SHA-512:** Senhas criptografadas usando padrões NIST com 10.000 iterações e sal (*salt*) criptográfico de 16 bytes aleatório exclusivo por conta.
- **Proteção contra Timing Attacks (`crypto.timingSafeEqual`):** Verificação de senhas em tempo constante para eliminar vulnerabilidades de temporização.
- **Isolamento de Dados Sigilosos:** Acesso a tarefas protegido por tokens seguros; cada usuário só acessa e manipula seus próprios dados.
- **Zero Bypass / Sem Visitante:** Entrada estritamente restrita a contas autenticadas (Google ou e-mail/senha com palavra-chave de recuperação).

### 3. 📱🔑 Correção de Entrada de Senha Mobile (iOS & Android)
- **Prevenção de Auto-Capitalização:** Campos de senha e e-mail configurados com `autoCapitalize="none"`, `autoCorrect="off"` e `spellCheck={false}` para evitar que o teclado móvel capitalize a primeira letra da senha incorretamente.
- **Revelação de Senha Segura:** Botão interativo `👁️ Ver senha` / `🙈 Ocultar` para confirmação visual antes do envio no celular.
- **Sanitização de Espaços:** Remoção automática de espaços acidentais no início ou final das credenciais.

### 4. 📊 Barra de Menu Lateral Idêntica no Celular e no Computador
- **Interface 100% Unificada:** O mesmo botão no cabeçalho (`☰ [Avatar/Inicial] [Nome] ⭐ [Qtd]`) está presente e acessível em qualquer tela.
- **Gaveta Lateral Deslizante & Painel Esquerdo:** No celular e no computador, exibe quem está logado, botão de logout, o **Mini Status Bar** (com barra de progresso e estatísticas de tarefas) e a lista completa de **Tarefas Importantes**.
- **"O que ela faz" & Atalho Direto:** Cada tarefa de alta prioridade exibe sua finalidade executiva e permite navegação direta na agenda com 1 toque e destaque pulsante.

### 5. ✍️ Tipografia Executiva Padronizada (Padrão Apple HIG)
- Adoção da tipografia nativa de sistema (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `Inter`, `system-ui`) sem distorções visuais ou fontes serifadas inadequadas.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor Full Stack local com Banco de Dados e API REST
npm start
# (O servidor sobe em http://localhost:4173)

# 3. Rodar checagem de tipos, testes automatizados e build de produção
npm run typecheck
npm test
npm run build
```

---

## ☁️ Deploy no Render (`render.yaml`)

O repositório está configurado para deploy automático contínuo como Web Service Node no **Render**:
- **Ambiente:** Node.js Web Service (`runtime: node`)
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`
- **URL em Produção:** [https://bv-tasks.onrender.com/](https://bv-tasks.onrender.com/)

Para uma explicação detalhada e simples para leigos, leia [**EXPLICACAO_PARA_LEIGOS.md**](./EXPLICACAO_PARA_LEIGOS.md).
