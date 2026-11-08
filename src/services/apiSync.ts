import type { Task, TaskFolder, UserAccount } from '../features/tasks/types/task.types';

const TOKEN_KEY = '__bv_tasks_auth_token__';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Fallback silencioso
  }
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Registra a conta no Banco de Dados Central
 */
export async function apiRegister(
  name: string,
  email: string,
  password: string,
  recoveryKeyword?: string,
): Promise<{ ok: boolean; user?: UserAccount; token?: string; error?: string; offline?: boolean }> {
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim(),
        recoveryKeyword: (recoveryKeyword || '').trim().toLowerCase(),
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.token) setStoredToken(data.token);
      return { ok: true, user: data.user, token: data.token };
    }
    return { ok: false, error: data.error || 'Falha ao cadastrar no banco de dados.' };
  } catch {
    return { ok: false, offline: true, error: 'Servidor offline ou inacessível.' };
  }
}

/**
 * Autentica o login no Banco de Dados Central (para celular e computador sincronizados)
 */
export async function apiLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean; user?: UserAccount; token?: string; error?: string; offline?: boolean }> {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        password: password.trim(),
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.token) setStoredToken(data.token);
      return { ok: true, user: data.user, token: data.token };
    }
    return { ok: false, error: data.error || 'E-mail ou senha incorretos.' };
  } catch {
    return { ok: false, offline: true, error: 'Servidor offline ou inacessível.' };
  }
}

/**
 * Autenticação com a Conta Google no Banco de Dados Central
 */
export async function apiGoogleAuth(googleProfile: {
  name: string;
  email: string;
  password?: string;
  avatarUrl?: string;
  googleId?: string;
}): Promise<{ ok: boolean; user?: UserAccount; token?: string; error?: string; offline?: boolean }> {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: googleProfile.name.trim(),
        email: googleProfile.email.trim().toLowerCase(),
        password: googleProfile.password ? googleProfile.password.trim() : undefined,
        avatarUrl: googleProfile.avatarUrl,
        googleId: googleProfile.googleId,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.token) setStoredToken(data.token);
      return { ok: true, user: data.user, token: data.token };
    }
    return { ok: false, error: data.error || 'Falha ao autenticar com o Google.' };
  } catch {
    return { ok: false, offline: true, error: 'Servidor offline ou inacessível.' };
  }
}

/**
 * Redefinição de senha no Banco de Dados Central
 */
export async function apiResetPassword(params: {
  email: string;
  newPassword: string;
  keyword?: string;
  token?: string;
}): Promise<{ ok: boolean; user?: UserAccount; error?: string; offline?: boolean }> {
  try {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: params.email.trim().toLowerCase(),
        newPassword: params.newPassword.trim(),
        keyword: params.keyword ? params.keyword.trim().toLowerCase() : undefined,
        token: params.token,
      }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (data.token) setStoredToken(data.token);
      return { ok: true, user: data.user };
    }
    return { ok: false, error: data.error || 'Falha ao redefinir senha no banco de dados.' };
  } catch {
    return { ok: false, offline: true, error: 'Servidor offline.' };
  }
}

/**
 * Puxa todas as tarefas e pastas salvas do usuário no Banco de Dados
 */
export async function apiPullTasksAndFolders(): Promise<{
  ok: boolean;
  tasks?: Task[];
  folders?: TaskFolder[];
  offline?: boolean;
}> {
  try {
    const res = await fetch('/api/sync', {
      method: 'GET',
      headers: getAuthHeaders(),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return {
      ok: true,
      tasks: Array.isArray(data.tasks) ? data.tasks : [],
      folders: Array.isArray(data.folders) ? data.folders : [],
    };
  } catch {
    return { ok: false, offline: true };
  }
}

/**
 * Envia e sincroniza tarefas e pastas com o Banco de Dados Central
 */
export async function apiPushTasksAndFolders(
  tasks: Task[],
  folders: TaskFolder[],
): Promise<{ ok: boolean; offline?: boolean }> {
  try {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ tasks, folders }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false, offline: true };
  }
}
