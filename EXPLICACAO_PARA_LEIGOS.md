# 📖 Guia Simples: Tudo o que foi feito no B V Tasks

Este guia foi feito com linguagem clara e simples para que qualquer pessoa entenda todas as novidades e melhorias que foram adicionadas no aplicativo **B V Tasks**.

---

## 1. Banco de Dados Centralizado (Computador e Celular Conectados) 🌐💾

- **O Problema que Existia Antes:**
  - Antes, quando você criava uma conta no computador, os dados ficavam guardados apenas na memória daquele navegador específico. Quando você abria o celular, o aplicativo dizia "senha incorreta" ou pedia para criar a conta de novo, porque o celular ainda não conhecia a conta feita no computador.
- **A Solução Implementada:**
  - Criamos um **banco de dados real e centralizado no servidor do Render** (`server.mjs`).
  - Agora, ao criar sua conta no computador, ela fica imediatamente salva no banco central. Quando você abre o celular, a mesma conta e senha funcionam perfeitamente!
  - **Sincronização Automática:** Todas as tarefas e pastas que você criar no computador aparecem no celular, e o que você fizer no celular aparece no computador.
  - **Continua Funcionando Offline:** Se o sinal do celular cair ou se o servidor estiver reiniciando, o aplicativo não quebra: ele guarda tudo no aparelho e, assim que a internet voltar, envia tudo para o banco central com total segurança.

---

## 2. Correção de "Senha Incorreta" no Celular 📱🔑

- **Por que a senha dava incorreta no celular?**
  - Os teclados inteligentes dos celulares (tanto no iPhone quanto no Android) têm o hábito de colocar a **primeira letra em maiúscula** automaticamente, além de ativar o corretor de texto e às vezes inserir um espaço no final. Por isso, a senha digitada no celular ficava diferente da criada no computador.
- **O que foi corrigido:**
  - Desativamos a maiúscula automática (`autocapitalize="none"`) e o corretor ortográfico nos campos de e-mail e senha.
  - O sistema agora limpa espaços invisíveis no início ou fim do texto.
  - **Botão de Ver a Senha (Ícone do Olho):** Adicionamos o botão `👁️ Ver senha` para que você possa ver exatamente o que está digitando no celular antes de clicar em entrar.

---

## 3. Barra de Menu Lateral Idêntica no Celular e no Computador 👤⭐

- **Mesmo Menu em Qualquer Tela:**
  - O menu e a navegação agora são 100% idênticos e responsivos tanto no celular quanto no computador.
  - No topo da tela (ao lado da logo), existe sempre o botão oficial:
    `☰ [Sua Foto/Inicial] [Seu Nome] ⭐ [Qtd de Tarefas Importantes]`
  - Ao clicar nele no computador ou tocar nele no celular, abre-se a gaveta lateral com:
    1. **Quem Está Logado:** Seu nome, sua foto ou inicial, seu e-mail, o selo da conta (`Google` ou `B V Tasks`) e o botão para **Sair**.
    2. **Mini Status Bar:** Uma barra de progresso visual com a porcentagem do seu dia concluída, e 3 caixas com o total de tarefas criadas, tarefas importantes e tarefas prontas.
    3. **Tarefas Importantes:** Lista com todas as tarefas de Alta Prioridade, mostrando o título, a data, o horário, a cor (Vinho para Trabalho, Azul para Pessoal, Rosa para Estudo) e o texto **"O que ela faz"** detalhando o objetivo da tarefa.
    4. **Clique Direto:** Clicando em qualquer tarefa da lista, o aplicativo vai direto para o dia dela no calendário e faz ela piscar suavemente na tela.

---

## 4. Segurança de Nível Bancário e Sigilo dos Seus Dados 🛡️🔒

- As tarefas e senhas são dados sigilosos e confidenciais. Por isso, implementamos as mais rigorosas práticas de segurança da engenharia de software:
  - **Criptografia Forte (PBKDF2 com SHA-512):** Nenhuma senha é salva como texto puro. Cada senha recebe um código aleatório exclusivo (*salt*) e é transformada em uma chave criptográfica irreversível.
  - **Proteção contra Ataques de Tempo (`timingSafeEqual`):** A verificação de senhas é feita com comparação em tempo constante, impedindo que hackers descubram caracteres da senha medindo o tempo de resposta do servidor.
  - **Isolamento de Contas:** As suas tarefas só podem ser lidas e alteradas por você mesmo através do seu token de segurança exclusivo. Ninguém mais tem acesso aos seus dados.
  - **Sem Acesso Convidado:** Não permitimos nenhum tipo de entrada anônima ou não verificada. Apenas contas reais autenticadas conseguem acessar as tarefas.

---

## 5. Como o Aplicativo Roda no Render 🚀

- Atualizamos a configuração do Render (`render.yaml`) para rodar como um serviço web Node.js completo.
- O servidor cuida de entregar o aplicativo de forma ultra-rápida, processa as chamadas de banco de dados e mantém a PWA funcionando como um aplicativo nativo no seu iPhone e Android!
