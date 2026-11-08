import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useTaskStore } from '../stores/useTaskStore';

describe('Integração da Interface B V Tasks PWA (Vinho & Preto, Claro/Escuro, Google Auth e Calendário)', () => {
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

  it('deve exibir a tela de autenticação com opção Google, Criar Conta e Esqueci a Senha, e entrar no app', () => {
    render(<App />);

    expect(screen.getByText('B V Tasks')).toBeInTheDocument();
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

    expect(screen.getByText('Tudo em dia')).toBeInTheDocument();
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
});
