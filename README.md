# B V Tasks • BVS Special 🍷📖 — Executive Planner (Full Stack SQL + PWA iOS, Android & Desktop)

Aplicação web progressiva (**PWA — Progressive Web App**) Full Stack com **Banco de Dados SQL (PostgreSQL)**, Visão Geral Global de tarefas, **Assistente Virtual Vitorino (IA)**, importação de planilhas com seletor de contexto, seleção e exclusão em lote, relógio em tempo real, relatórios executivos em PDF e sincronização nativa com **Apple Calendar (`webcal://` / `.ics`)**.

---

## ✨ Principais Funcionalidades e Módulos

### 1. 🗂️ Visão Geral Global + Seleção e Exclusão em Lote (`DELETE /api/tasks/bulk`)
- **Panorama Unificado:** Visualize todas as tarefas criadas de uma só vez com busca instantânea, filtros combináveis (Status, Prioridade, Categoria, Pasta, Mês e Somente Hoje) e alternância entre **Lista/Cards** (ideal para celular) e **Tabela/Grid** (ideal para desktop).
- **Seleção em Lote (Bulk Select) & Exclusão Múltipla:**
  - Checkbox **"Selecionar Todas (do mês/filtro atual)"** no topo da listagem e checkboxes individuais em cada card/linha (separados do botão de concluir).
  - Barra de ações responsiva exibindo a contagem de tarefas selecionadas e botão **"Excluir Selecionadas"** com confirmação rápida, disparando `DELETE /api/tasks/bulk` (`{ ids: [...] }`) para remoção atômica no banco de dados.

### 2. 📥 Importação de Planilha com Seletor de Contexto/Categoria (`POST /api/tasks/bulk`)
- Suporte a arquivos **`.xlsx`, `.xls`, `.csv` e `.json`** (além de download da Planilha Modelo `.xlsx` e gerador de Prompt para IA).
- **Seletor Visual de Contexto do Lote:** Permite escolher com 1 clique entre **Pessoal**, **Trabalho** ou **Estudo** antes ou durante a pré-visualização, classificando automaticamente todas as tarefas do lote importado e exibindo a categoria na tabela e nos cards de revisão antes de gravar no banco.

### 3. 👩‍💼 Vitorino — Sua Assistente Virtual de Planejamento (`POST /api/ai/assistant`)
- Assistente virtual ilustrada com **avatar exclusivo de menina executiva** (Vitorino) e saudação acolhedora:
  > *"Oi! Sou a Vitorino, sua assistente virtual. No que posso te ajudar hoje? Quer fazer algum tipo de planejamento?"*
- Cria tarefas, agendas semanais e divide metas complexas em etapas acionáveis com 1 clique em **Confirmar e Adicionar ao Cronograma**.

### 4. ✨ Fechamento Inteligente do Mês com IA (`POST /api/ai/monthly-review`)
- Analisa estatísticas mensais, taxa de conclusão e gargalos por categoria, gerando diagnóstico executivo, 3 próximos passos práticos e sugestões de tarefas para o mês seguinte, além de migrar pendências em lote.

### 5. 🕒 Relógio e Data em Tempo Real no Painel Principal
- Exibe no topo do painel a data completa por extenso em português e o horário exato atualizado a cada segundo (`setInterval` de `1000ms`), com tipografia `tabular-nums` para estabilidade visual dos segundos e versão compacta automática em telas de smartphone.

### 6. 📱 PWA iOS Nativo, Atalhos da Apple (Shortcuts) & Apple Calendar (`webcal://`)
- Configuração `display: "standalone"` com suporte a `safe-area-inset` e Deep Links (`/?action=new-task`, `/?action=import`, `/?action=chat`, `/?action=ai-review`, `/?filter=today`).
- Exportação `.ics` com Web Share API no iOS e feed de assinatura contínua `GET /api/calendar/feed/:userToken.ics` (`webcal://`).

### 7. 🧼 Rodapé Limpo e Minimalista
- Rodapé contínuo e sem divisórias exibindo **`B V Tasks • BVS Special`** com suporte ao espaçamento seguro inferior (`safe-bottom`).

---

## 🗄️ Arquitetura SQL Multi-Dispositivo e Segurança

- **Persistência SQL (`PostgreSQL`):** O servidor [`server.mjs`](./server.mjs) conecta-se ao PostgreSQL via `DATABASE_URL` e inicializa automaticamente o schema [`database/schema.sql`](./database/schema.sql) (`bv_users`, `bv_sessions`, `bv_folders`, `bv_tasks`).
- **Criptografia PBKDF2-HMAC-SHA512 (100.000 iterações):** Senhas e palavras-chave protegidas com *salt* único de 16 bytes e verificação `crypto.timingSafeEqual`.
- **Isolamento Estrito por `user_id`:** Todas as operações (incluindo `POST /api/tasks/bulk` e `DELETE /api/tasks/bulk`) utilizam queries SQL parametrizadas (`$1, $2...`) vinculadas ao usuário autenticado.

---

## 🚀 Como Executar Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor Full Stack
npm start

# 3. Executar verificação de tipos, suíte de testes e build de produção
npm run typecheck
npm test
npm run build
```

Para uma explicação passo a passo voltada a usuários finais, consulte [**EXPLICACAO_PARA_LEIGOS.md**](./EXPLICACAO_PARA_LEIGOS.md).
