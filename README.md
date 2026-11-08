# B V Tasks 🍾🍷📖 — Executive Planner (Web, iPhone iOS & Android PWA)

Aplicação web progressiva (**PWA — Progressive Web App**) de calendário interativo, pastas, captura de câmera/PDFs, notificações nativas e sincronização com o calendário do celular.

Projetada com **tipografia executiva profissional** (*Playfair Display* + *Plus Jakarta Sans*), paleta **Vermelho Vinho (`#991B1B` / `#7F1D1D`) & Preto (`#0F0F12`)**, alternância entre **Modo Claro e Modo Escuro**, e logo exclusiva trazendo **Garrafa de Vinho + Taça de Vinho + Livro Aberto + Iniciais B V**.

---

## 🎯 Funcionalidades Principais

- **Logo Exclusiva (Garrafa + Taça de Vinho + Livro + B V):** Brasão vetorial executivo em Vermelho Vinho, Preto e Dourado ([`Logo.tsx`](./src/components/ui/Logo.tsx) e [`public/icon.svg`](./public/icon.svg)).
- **Tipografia Profissional & Modo Claro / Escuro (`☀️ Claro` / `🌙 Escuro`):**
  - Fontes executivas (*Playfair Display* para títulos e *Plus Jakarta Sans* para interface e leitura).
  - Alternância instantânea entre tema **Claro** (Marfim, Preto e Vinho Bordeaux) e **Escuro** (Preto Ônix `#09090B` e Vermelho Vinho).
- **Autenticação Completa (Google + E-mail/Senha + Recuperação Dupla):**
  - **Continuar com o Google:** Login rápido em 1 toque com conta Google.
  - **E-mail e Senha com Sessão Permanente:** Uma vez criada a conta, o acesso permanece salvo no aparelho.
  - **Recuperação de Senha ("Esqueci a senha"):**
    1. **🔑 Por Palavra-Chave:** Pergunta pela palavra-chave de segurança cadastrada e permite criar uma nova senha na hora.
    2. **✉️ Por Link no E-mail:** Gera e envia um link de redefinição para o e-mail para criação de uma nova senha.
- **Notificações no Celular & Sincronização com o Calendário Nativo (iPhone e Android):**
  - **🔔 Notificações Nativas:** Envia alertas diretamente no celular (via Web Notifications API & Service Worker) ao agendar, testar ou atingir o horário (`HH:mm`) da tarefa.
  - **📅 Sincronização com Calendário do Celular (`.ics` & Google Agenda):** Exporta tarefas individuais ou o dia inteiro no padrão universal *iCalendar (`.ics`)* com alarme nativo (`VALARM`) para o **Calendário da Apple (iPhone)** e **Google/Samsung Calendar (Android)**.
- **Calendário à Esquerda + Pastas + Câmera/PDFs:**
  - Layout responsivo para iPhone, Android, Tablets e Computadores.
  - Indicadores por escopo nos dias do calendário: **Trabalho (Vinho)**, **Pessoal (Azul)** e **Estudo (Rosa)**.
  - Uso direto da **Câmera do Celular (`📷 Câmera`)** e upload de **Imagens e PDFs (`📎 Foto/PDF`)** por tarefa.

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

## ☁️ Alocação no Render (`render.yaml`)

O projeto inclui o arquivo [`render.yaml`](./render.yaml) pronto para deploy gratuito no **Render**:
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`

Para uma explicação simples e acessível para leigos, leia [**EXPLICACAO_PARA_LEIGOS.md**](./EXPLICACAO_PARA_LEIGOS.md).
