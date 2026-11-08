# B V Tasks 🍾🍷📖 — Executive Planner (Web, iPhone iOS & Android PWA)

Aplicação web progressiva (**PWA — Progressive Web App**) de calendário executivo interativo, gerenciamento de pastas, captura com câmera do celular/PDFs, notificações nativas e sincronização móvel tanto **online quanto offline**.

Construída no padrão **Apple Human Interface Guidelines (HIG)** com **tipografia executiva de sistema** (San Francisco / Inter), paleta **Vermelho Vinho (`#991B1B` / `#7F1D1D`) & Preto (`#09090B`)**, alternância instantânea entre **Modo Claro e Modo Escuro**, e logotipo exclusivo trazendo **Garrafa de Vinho + Taça de Vinho + Livro Aberto + Iniciais B V**.

---

## 🎯 Destaques e Novas Funcionalidades

### 1. 🛡️ Engenharia de Segurança & Autenticação Verificada
- **Eliminação Total de Convidados:** Acesso anônimo ou botões de visitante/convidado foram estritamente removidos.
- **Autenticação Real com Google (Google Identity Services / OAuth 2.0):**
  - Integração com `https://accounts.google.com/gsi/client`.
  - Validação rigorosa de tokens JWT: checagem de emissor oficial (`accounts.google.com`), validação de `email_verified: true`, verificação temporal de expiração e domínio verificado (`@gmail.com` ou Workspace).
  - Autenticação direta e segura vinculada ao e-mail legítimo da conta Google com senha de segurança.
- **Contas Próprias com Alta Segurança:**
  - Cadastro obrigatório com validação estrita de e-mail e senhas fortes (mínimo de 6 caracteres).
  - **Recuperação de Senha Dupla:**
    - 🔑 *Por Palavra-Chave:* Resposta à pergunta secreta com redefinição imediata de senha.
    - ✉️ *Por Link no E-mail:* Envio de link de recuperação com validação segura de token.
  - **Sessão Permanente:** O login permanece autenticado no aparelho sem necessidade de logar novamente a cada acesso.

### 2. ✍️ Tipografia Executiva Padronizada (Padrão Apple HIG)
- Remoção de fontes serifadas extravagantes e fora do padrão.
- Adoção da tipografia nativa de alta tecnologia Apple HIG (`-apple-system`, `BlinkMacSystemFont`, `SF Pro Display`, `Inter`, `system-ui`).
- Hierarquia visual limpa e elegante com excelente legibilidade em iPhones, telas retina, celulares Android e computadores.

### 3. ✨ Animação Fluida na Criação de Tarefas & Feedback Tátil
- **Entrada Animada com Destaque:** Ao criar uma tarefa, o modal fecha com suavidade e a nova tarefa entra na lista com animação fluida (`animate-task-enter`) acompanhada de um pulso de brilho bordô (`animate-highlight-pulse`).
- **Banner Executivo de Confirmação (Toast):** Notificação flutuante com confirmação visual e feedback tátil no celular via `navigator.vibrate`.

### 4. 📱🔄 Sincronização Mobile & Funcionamento 100% Offline / Online
- **Indicador Interativo de Conexão no Topo:**
  - `🟢 Sincronizado (Online)` quando conectado à internet.
  - `🟠 Modo Offline (Local Seguro)` quando sem conexão.
- **Central de Sincronização:** Mostra a contagem de tarefas verificadas, integridade 100% garantida (IndexedDB/localStorage) e botão para sincronizar manualmente com animação giratória.
- **Detecção Automática de Reconexão:** Ao recuperar o sinal (4G/5G/Wi-Fi), a aplicação sincroniza automaticamente e notifica o usuário.
- **Exportação para o Calendário Nativo do Celular (.ics & Google Agenda):** Sincronização em 1 toque com o Calendário do iPhone (Apple Calendar) e Android com alertas nativos pré-configurados.
- **Alertas no Celular:** Notificações disparadas no horário programado da tarefa (`HH:mm`).

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
- **Prevenção de Cache Legado:** Headers otimizados com `no-cache` para `index.html` e `sw.js`, e cache imutável de longo prazo para os assets estáticos com hash.

Para uma explicação acessível e detalhada para leigos, leia [**EXPLICACAO_PARA_LEIGOS.md**](./EXPLICACAO_PARA_LEIGOS.md).
