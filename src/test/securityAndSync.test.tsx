import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
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
});

describe('Sincronização Mobile (Online / Offline) e Animação de Tarefas', () => {
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
      screen.getByRole('button', { name: /Exportar Todas as Tarefas/i }),
    ).toBeInTheDocument();
  });
});
