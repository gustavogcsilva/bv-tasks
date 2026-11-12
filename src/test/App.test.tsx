import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App, { parseAppDeepLink } from '../App';
import { useTaskStore } from '../stores/useTaskStore';

describe('Integração da Interface BVS Special PWA (Vinho & Preto, Claro/Escuro, Google Auth e Calendário)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState({
      tasks: [],
      folders: [
        {
          id: 'folder-1',
          name: 'Projetos 2026',
          scope: 'work',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      selectedDate: '2026-11-07',
      scopeFilter: 'all',
      selectedFolderId: 'all',
      theme: 'light',
      currentUser: null,
      registeredAccounts: [],
    });
  });

  it('deve exibir a tela de autenticação com BVS Special, opção Google, Criar Conta e Esqueci a Senha, e entrar no app', async () => {
    render(<App />);

    expect(screen.getAllByText('BVS Special').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('button', { name: /Continuar com o Google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Esqueci a senha' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Seu nome'), {
      target: { value: 'Bruno V.' },
    });
    fireEvent.change(screen.getByLabelText('E-mail'), {
      target: { value: 'bruno@bvtasks.com' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), {
      target: { value: '123456' },
    });
    fireEvent.change(
      screen.getByLabelText('Palavra-chave de segurança (para recuperar senha)'),
      {
        target: { value: 'cabernet' },
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'Criar conta e acessar' }));

    await waitFor(() => {
      expect(screen.getByText('Tudo em dia')).toBeInTheDocument();
    });
    expect(screen.getByText('Trabalho (Vinho)')).toBeInTheDocument();
    expect(screen.getByText('Pessoal (Azul)')).toBeInTheDocument();
    expect(screen.getByText('Estudo (Rosa)')).toBeInTheDocument();
  });

  it('deve permitir alternar Claro/Escuro, criar tarefa, criar pasta e sincronizar com o calendário', () => {
    useTaskStore.setState({
      currentUser: {
        id: 'user-1',
        name: 'Bruno V.',
        email: 'bruno@bvtasks.com',
        passwordHash: '123456',
        recoveryKeyword: 'cabernet',
        provider: 'email',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    });

    render(<App />);

    // Alterna para Modo Escuro
    fireEvent.click(screen.getByRole('button', { name: 'Alternar tema claro ou escuro' }));
    expect(useTaskStore.getState().theme).toBe('dark');

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Título'), {
      target: { value: 'Degustação & Leitura Executiva' },
    });
    fireEvent.change(within(dialog).getByLabelText('Horário'), {
      target: { value: '19:00' },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Trabalho' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Alta' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // A tarefa importante aparece tanto na Agenda quanto na Barra de Menu Lateral
    const taskTitles = screen.getAllByText('Degustação & Leitura Executiva');
    expect(taskTitles.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Mini Status Bar')).toBeInTheDocument();
    expect(screen.getByText('📅 Calendário (.ics)')).toBeInTheDocument();
    expect(screen.getByText('🔔 Notificar')).toBeInTheDocument();

    // Testa criação de nova pasta
    fireEvent.click(screen.getByRole('button', { name: '+ Nova pasta' }));
    fireEvent.change(screen.getByLabelText('Nome da nova pasta'), {
      target: { value: 'Mestrado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar pasta' }));
    expect(screen.getByText('Mestrado')).toBeInTheDocument();

    // Conclui e exclui a tarefa
    fireEvent.click(screen.getByRole('checkbox'));
    expect(screen.getByText('✓ Concluída')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(useTaskStore.getState().tasks).toHaveLength(0);
  });

  it('deve auto-corrigir o horário com dois-pontos (:) ao digitar apenas números no celular ou computador', () => {
    useTaskStore.setState({
      currentUser: {
        id: 'user-1',
        name: 'Bruno V.',
        email: 'bruno@bvtasks.com',
        passwordHash: '123456',
        recoveryKeyword: 'cabernet',
        provider: 'email',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    });

    render(<App />);

    expect(screen.getAllByText('BVS Special').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('BVS SPECIAL').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Gustavo Geraldo/i)).toBeInTheDocument();
    expect(
      screen.getAllByText(new RegExp(String(new Date().getFullYear()))).length,
    ).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));
    const dialog = screen.getByRole('dialog');

    const titleInput = within(dialog).getByLabelText('Título');
    const timeInput = within(dialog).getByLabelText('Horário') as HTMLInputElement;

    fireEvent.change(titleInput, {
      target: { value: 'Reunião Mobile Sem Dois Pontos' },
    });

    // Simula digitar "1430" sem os dois-pontos (como ocorre no teclado numérico mobile)
    fireEvent.change(timeInput, {
      target: { value: '1430' },
    });
    expect(timeInput.value).toBe('14:30');

    // Simula digitar "930" -> deve auto-formatar para "09:30"
    fireEvent.change(timeInput, {
      target: { value: '930' },
    });
    expect(timeInput.value).toBe('09:30');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));
    expect(useTaskStore.getState().tasks[0]?.time).toBe('09:30');
  });

  it('deve exibir a Visão Geral Global com busca, alternância Lista/Cards vs Tabela/Grid e suporte a Deep Links da Apple', () => {
    useTaskStore.setState({
      currentUser: {
        id: 'user-1',
        name: 'Gustavo Geraldo',
        email: 'gustavo@bvtasks.com',
        passwordHash: '123456',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
      tasks: [
        {
          id: 't-global-1',
          title: 'Revisar Balanço Mensal',
          description: 'Conferir fluxo de caixa',
          date: '2026-11-10',
          time: '10:00',
          priority: 'high',
          scope: 'work',
          isCompleted: false,
          createdAt: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 't-global-2',
          title: 'Aula de Inglês Executivo',
          date: '2026-11-12',
          priority: 'medium',
          scope: 'study',
          isCompleted: true,
          createdAt: '2026-11-01T11:00:00.000Z',
        },
      ],
    });

    expect(parseAppDeepLink('?action=new-task')).toEqual({
      action: 'new-task',
      filterToday: false,
    });
    expect(parseAppDeepLink('?action=import&filter=today')).toEqual({
      action: 'import',
      filterToday: true,
    });
    expect(parseAppDeepLink('?action=ai-review')).toEqual({
      action: 'ai-review',
      filterToday: false,
    });
    expect(parseAppDeepLink('?action=chat')).toEqual({
      action: 'chat',
      filterToday: false,
    });

    render(<App />);

    // Ambas as tarefas aparecem juntas na Visão Geral Global
    expect(screen.getAllByText('Revisar Balanço Mensal').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Aula de Inglês Executivo')).toBeInTheDocument();

    // Clica na tarefa para abrir a Ficha Completa (Modal/Drawer de Detalhes)
    fireEvent.click(screen.getByText('Aula de Inglês Executivo'));
    expect(screen.getByText('Ficha Completa da Tarefa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhes da tarefa' }));

    // Alterna para visualização em Tabela/Grid (Desktop)
    fireEvent.click(screen.getByRole('button', { name: /Tabela\/Grid/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();

    // Busca em tempo real filtra resultados na Visão Geral Global
    fireEvent.change(screen.getByLabelText('Buscar tarefas'), {
      target: { value: 'Balanço' },
    });
    expect(screen.queryByText('Aula de Inglês Executivo')).not.toBeInTheDocument();

    // Abre o Mini-Chatbot Assistente IA
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente IA de Tarefas/i }));
    expect(
      screen.getByRole('dialog', { name: /Assistente IA de Tarefas/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Mensagem para o Assistente IA')).toBeInTheDocument();
  });

  it('deve abrir o modal Importar Planejamento e pré-visualizar JSON colado da IA', () => {
    useTaskStore.setState({
      currentUser: {
        id: 'user-1',
        name: 'Gustavo Geraldo',
        email: 'gustavo@bvtasks.com',
        passwordHash: '123456',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    });

    render(<App />);

    fireEvent.click(screen.getAllByRole('button', { name: /Importar/i })[0]);
    const dialog = screen.getByRole('dialog', { name: /Importar Planejamento em Lote/i });
    expect(dialog).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Baixar Planilha Modelo/i }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: /Copiar Prompt para IA/i }),
    ).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Colar JSON da IA/i }));
    fireEvent.change(within(dialog).getByLabelText(/Cole aqui o JSON gerado pela IA/i), {
      target: {
        value: JSON.stringify([
          {
            titulo: 'Fechamento Contábil',
            data: '2026-11-25',
            hora: '14:00',
            categoria: 'Trabalho',
            prioridade: 'Alta',
          },
        ]),
      },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /Pré-visualizar JSON/i }));

    expect(within(dialog).getAllByText('Fechamento Contábil').length).toBeGreaterThanOrEqual(1);
    expect(
      within(dialog).getByRole('button', { name: /Confirmar e Importar 1 Tarefa/i }),
    ).toBeEnabled();
  });
});
