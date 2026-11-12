import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { isIosSafariNotStandalone } from '../components/IosInstallBanner';
import {
  isValidEmail,
  validateName,
  validatePassword,
  verifyGoogleJwt,
} from '../services/authSecurity';
import { useTaskStore } from '../stores/useTaskStore';

function createMockJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify(payload));
  const sig = btoa('mock-signature');
  return `${header}.${body}.${sig}`;
}

describe('Engenharia de Segurança — Validação de Tokens Google e Proteção de Autenticação', () => {
  it('deve validar com sucesso um token JWT emitido legitimamente pelo Google com e-mail verificado', () => {
    const validPayload = {
      iss: 'accounts.google.com',
      sub: 'google-uid-12345',
      email: 'executivo@gmail.com',
      email_verified: true,
      name: 'Executivo B V',
      picture: 'https://lh3.googleusercontent.com/photo.jpg',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = createMockJwt(validPayload);
    const result = verifyGoogleJwt(token);

    expect(result.ok).toBe(true);
    expect(result.profile?.email).toBe('executivo@gmail.com');
    expect(result.profile?.name).toBe('Executivo B V');
    expect(result.profile?.id).toBe('google-uid-12345');
  });

  it('deve rejeitar tokens com emissor falso (não oficial do Google)', () => {
    const fakeIssuerPayload = {
      iss: 'malicious-issuer.com',
      email: 'hacker@gmail.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createMockJwt(fakeIssuerPayload);
    const result = verifyGoogleJwt(token);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Emissor do token não reconhecido');
  });

  it('deve rejeitar tokens expirados', () => {
    const expiredPayload = {
      iss: 'https://accounts.google.com',
      email: 'teste@gmail.com',
      email_verified: true,
      exp: Math.floor(Date.now() / 1000) - 120, // expirou há 2 minutos
    };
    const token = createMockJwt(expiredPayload);
    const result = verifyGoogleJwt(token);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('expirou');
  });

  it('deve rejeitar contas cujo e-mail ainda não foi verificado pelo Google', () => {
    const unverifiedEmailPayload = {
      iss: 'accounts.google.com',
      email: 'naoverificado@gmail.com',
      email_verified: false,
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createMockJwt(unverifiedEmailPayload);
    const result = verifyGoogleJwt(token);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('não foi verificado');
  });

  it('deve validar regras estritas de segurança para e-mail, senha e nome', () => {
    expect(isValidEmail('valido@gmail.com')).toBe(true);
    expect(isValidEmail('invalido-sem-arroba')).toBe(false);
    expect(isValidEmail('@semusuario.com')).toBe(false);

    expect(validatePassword('123456').valid).toBe(true);
    expect(validatePassword('12345').valid).toBe(false); // menos de 6 caracteres

    expect(validateName('BV').valid).toBe(true);
    expect(validateName(' ').valid).toBe(false);
  });

  it('NÃO deve conter botão de visitante/convidado (acesso sem autenticação estritamente proibido)', () => {
    window.localStorage.clear();
    useTaskStore.setState({ currentUser: null });

    render(<App />);

    // Garante que "Convidado" ou "Visitante" não existem na interface de login
    expect(screen.queryByText(/Convidado/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Testar Direto/i)).not.toBeInTheDocument();
  });

  it('deve autenticar com a Conta Google como se fosse entrar no e-mail (com e-mail e senha, sem exigir JWT)', async () => {
    window.localStorage.clear();
    useTaskStore.setState({ currentUser: null, registeredAccounts: [] });

    render(<App />);

    // Clica em Continuar com o Google
    fireEvent.click(screen.getByRole('button', { name: /Continuar com o Google/i }));

    expect(screen.getByText('Entrar com a Conta Google')).toBeInTheDocument();
    // Confirma que NÃO existe campo de JWT
    expect(screen.queryByText(/Token JWT/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('E-mail da sua Conta Google'), {
      target: { value: 'gestor.executivo@gmail.com' },
    });
    fireEvent.change(screen.getByLabelText('Senha da Conta Google'), {
      target: { value: 'senhaForte123' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Autenticar com o Google' }));

    // Confirma que entrou com a conta Google autenticada
    await waitFor(() => {
      expect(useTaskStore.getState().currentUser?.email).toBe('gestor.executivo@gmail.com');
    });
    expect(useTaskStore.getState().currentUser?.provider).toBe('google');
  });
});

describe('Barra de Menu Lateral (Quem está logado, Mini Status Bar e Tarefas Importantes)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState({
      currentUser: {
        id: 'user-auth-1',
        name: 'Bruno V.',
        email: 'bruno@bvtasks.com',
        passwordHash: '123456',
        provider: 'email',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
      tasks: [
        {
          id: 'task-imp-1',
          title: 'Revisão Contratual Urgente',
          description: 'Analisar cláusulas de entrega e conformidade financeira',
          date: '2026-11-10',
          time: '15:00',
          priority: 'high',
          scope: 'work',
          isCompleted: false,
          createdAt: '2026-11-07T00:00:00.000Z',
        },
        {
          id: 'task-normal-2',
          title: 'Organizar gaveta pessoal',
          date: '2026-11-07',
          priority: 'low',
          scope: 'personal',
          isCompleted: true,
          createdAt: '2026-11-07T00:00:00.000Z',
        },
      ],
      folders: [],
      selectedDate: '2026-11-07',
      scopeFilter: 'all',
      selectedFolderId: 'all',
      theme: 'light',
    });
  });

  it('deve demonstrar na Barra de Menu quem está logado e o Mini Status Bar com contagens', () => {
    render(<App />);

    // Barra de Menu no lado esquerdo com o usuário logado
    expect(screen.getAllByText('Bruno V.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('bruno@bvtasks.com')).toBeInTheDocument();

    // Mini Status Bar
    expect(screen.getByText('Mini Status Bar')).toBeInTheDocument();
    expect(screen.getByText('⭐ Importantes')).toBeInTheDocument();
  });

  it('deve exibir a tarefa importante com "O que faz:" e clicando nela ir direto para a tarefa', () => {
    render(<App />);

    // Verifica que a tarefa importante está listada na barra de menu (e também na Visão Geral Global)
    expect(screen.getAllByText('Revisão Contratual Urgente').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Analisar cláusulas de entrega/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Ver na agenda →')).toBeInTheDocument();

    // Clica no card da tarefa importante
    const importantCard = screen.getByRole('button', {
      name: /Revisão Contratual Urgente/i,
    });
    fireEvent.click(importantCard);

    // Deve ter navegado para a data da tarefa (2026-11-10)
    expect(useTaskStore.getState().selectedDate).toBe('2026-11-10');
  });

  it('deve exibir o botão de menu mobile para celulares e abrir a barra de menu em gaveta', () => {
    render(<App />);

    // Botão mobile no cabeçalho
    const mobileMenuButton = screen.getByRole('button', {
      name: /Abrir Menu e Tarefas Importantes/i,
    });
    expect(mobileMenuButton).toBeInTheDocument();

    // Abre a gaveta mobile
    fireEvent.click(mobileMenuButton);

    const drawerDialog = screen.getByRole('dialog', {
      name: /Menu Lateral do Usuário e Tarefas Importantes/i,
    });
    expect(drawerDialog).toBeInTheDocument();

    // Fecha a gaveta
    fireEvent.click(screen.getByRole('button', { name: 'Fechar menu' }));
    expect(screen.queryByRole('dialog', { name: /Menu Lateral do Usuário/i })).not.toBeInTheDocument();
  });

  it('o botão de menu deve ser responsivo e não possuir classe que o oculte no computador (lg:hidden)', () => {
    render(<App />);

    const menuButton = screen.getByRole('button', {
      name: /Abrir Menu e Tarefas Importantes/i,
    });
    expect(menuButton).toBeInTheDocument();
    // Garante que o menu está acessível em qualquer tela (computador e celular)
    expect(menuButton.className).not.toContain('lg:hidden');
  });
});

describe('Proteção de Entrada de Senha Mobile & Computador', () => {
  it('campos de senha e e-mail devem desativar autocapitalize, autocorrect e spellcheck e permitir alternar visibilidade', () => {
    useTaskStore.setState({ currentUser: null });
    render(<App />);

    const passwordInput = screen.getByLabelText('Senha') as HTMLInputElement;
    expect(passwordInput.getAttribute('autocapitalize')).toBe('none');
    expect(passwordInput.getAttribute('autocorrect')).toBe('off');
    expect(passwordInput.getAttribute('spellcheck')).toBe('false');
    expect(passwordInput.type).toBe('password');

    // Botão de revelar senha (ícone de olho)
    const toggleButton = screen.getByRole('button', { name: /Ver senha/i });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');

    fireEvent.click(screen.getByRole('button', { name: /Ocultar senha/i }));
    expect(passwordInput.type).toBe('password');
  });
});

describe('Sincronização Mobile (Online / Offline)', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState({
      currentUser: {
        id: 'user-auth-1',
        name: 'Bruno V.',
        email: 'bruno@bvtasks.com',
        passwordHash: '123456',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
      tasks: [],
      folders: [],
      selectedDate: '2026-11-07',
      scopeFilter: 'all',
      selectedFolderId: 'all',
      theme: 'light',
    });
  });

  it('deve exibir o botão de Sincronizado e abrir a Central de Sincronização Mobile', () => {
    render(<App />);

    const syncButton = screen.getByRole('button', { name: /Sincronizado|Modo Offline/i });
    expect(syncButton).toBeInTheDocument();

    fireEvent.click(syncButton);

    expect(screen.getByText('Central de Sincronização')).toBeInTheDocument();
    expect(screen.getByText(/Integridade Local:/i)).toBeInTheDocument();
    expect(screen.getByText(/100% íntegro/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Gerar e Exportar Todas as Tarefas como PDF/i }),
    ).toBeInTheDocument();
  });

  it('deve detectar Safari no iOS fora do modo standalone para exibir o banner de instalação', () => {
    const iosSafariUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

    expect(
      isIosSafariNotStandalone({
        userAgent: iosSafariUa,
        standalone: false,
      }),
    ).toBe(true);

    expect(
      isIosSafariNotStandalone({
        userAgent: iosSafariUa,
        standalone: true,
      }),
    ).toBe(false);

    expect(
      isIosSafariNotStandalone({
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.0.0 Mobile/15E148 Safari/604.1',
        standalone: false,
      }),
    ).toBe(false);
  });
});
