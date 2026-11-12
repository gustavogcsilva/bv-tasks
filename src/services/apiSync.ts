import type {
  AssistantResponse,
  MonthlyReviewResponse,
  Task,
  TaskFolder,
  UserAccount,
} from '../features/tasks/types/task.types';

const TOKEN_KEY = '__bv_tasks_sql_token_v8__';
const CLEAN_MIGRATION_KEY = '__bv_tasks_clean_slate_v8__';
const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * Executa limpeza única de dados antigos/voláteis salvos em versões anteriores
 * para garantir início 100% limpo em todos os navegadores e celulares.
 */
export function ensureCleanSlateMigration(): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    if (window.localStorage.getItem(CLEAN_MIGRATION_KEY) === 'done') return;

    const legacyKeys = [
      'bv-tasks-storage',
      '__bv_tasks_auth_token__',
      '@focuscalendar:tasks:v1',
      'focus-calendar-storage',
    ];
    for (const key of legacyKeys) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.setItem(CLEAN_MIGRATION_KEY, 'done');
  } catch {
    // Fallback silencioso em modo privado restrito
  }
}

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

export interface ApiAuthResponse {
  ok: boolean;
  user?: UserAccount;
  token?: string;
  tasks?: Task[];
  folders?: TaskFolder[];
  error?: string;
  offline?: boolean;
  backendMissing?: boolean;
}

export type DbEngineStatus = 'postgresql' | 'local-file' | 'static-no-backend' | 'offline';

async function safeFetchJson<T = Record<string, unknown>>(
  path: string,
  init: RequestInit,
): Promise<{
  status: number;
  ok: boolean;
  data: T | null;
  offline?: boolean;
  backendMissing?: boolean;
}> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      cache: 'no-store',
      ...init,
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();

    // Se o servidor retornou 404 texto/HTML (ex: Render configurado como Static Site sem Node/SQL)
    if (!contentType.includes('application/json')) {
      return {
        status: res.status,
        ok: false,
        data: null,
        offline: true,
        backendMissing: true,
      };
    }

    const data = (await res.json()) as T;
    return { status: res.status, ok: res.ok, data };
  } catch {
    return { status: 0, ok: false, data: null, offline: true };
  }
}

/**
 * Verifica a saúde do servidor e se o Banco de Dados SQL (PostgreSQL) está ativo
 */
export async function apiCheckHealth(): Promise<{
  ok: boolean;
  engine: DbEngineStatus;
  sqlPersistent: boolean;
  aiEnabled: boolean;
}> {
  const res = await safeFetchJson<{
    ok?: boolean;
    engine?: string;
    sqlPersistent?: boolean;
    aiEnabled?: boolean;
  }>('/api/health', { method: 'GET' });

  if (res.backendMissing) {
    return { ok: false, engine: 'static-no-backend', sqlPersistent: false, aiEnabled: false };
  }
  if (res.offline || !res.data) {
    return { ok: false, engine: 'offline', sqlPersistent: false, aiEnabled: false };
  }
  const engine = res.data.engine === 'postgresql' ? 'postgresql' : 'local-file';
  return {
    ok: Boolean(res.ok && res.data.ok),
    engine,
    sqlPersistent: Boolean(res.data.sqlPersistent),
    aiEnabled: Boolean(res.data.aiEnabled),
  };
}

/**
 * Registra conta no Banco SQL Central
 */
export async function apiRegister(
  name: string,
  email: string,
  password: string,
  recoveryKeyword?: string,
): Promise<ApiAuthResponse> {
  const res = await safeFetchJson<{
    ok?: boolean;
    user?: UserAccount;
    token?: string;
    tasks?: Task[];
    folders?: TaskFolder[];
    error?: string;
  }>('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: password.trim(),
      recoveryKeyword: (recoveryKeyword || '').trim().toLowerCase(),
    }),
  });

  if (res.offline) {
    return {
      ok: false,
      offline: true,
      backendMissing: res.backendMissing,
      error: 'Servidor offline ou inacessível.',
    };
  }

  if (res.ok && res.data?.ok && res.data.user) {
    if (res.data.token) setStoredToken(res.data.token);
    return {
      ok: true,
      user: res.data.user,
      token: res.data.token,
      tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
      folders: Array.isArray(res.data.folders) ? res.data.folders : [],
    };
  }

  return {
    ok: false,
    error: res.data?.error || 'Falha ao cadastrar no banco de dados.',
  };
}

/**
 * Autentica login no Banco SQL Central (compartilhado entre Computador, iPhone e Android)
 */
export async function apiLogin(email: string, password: string): Promise<ApiAuthResponse> {
  const res = await safeFetchJson<{
    ok?: boolean;
    user?: UserAccount;
    token?: string;
    tasks?: Task[];
    folders?: TaskFolder[];
    error?: string;
  }>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: email.trim().toLowerCase(),
      password: password.trim(),
    }),
  });

  if (res.offline) {
    return {
      ok: false,
      offline: true,
      backendMissing: res.backendMissing,
      error: 'Servidor offline ou inacessível.',
    };
  }

  if (res.ok && res.data?.ok && res.data.user) {
    if (res.data.token) setStoredToken(res.data.token);
    return {
      ok: true,
      user: res.data.user,
      token: res.data.token,
      tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
      folders: Array.isArray(res.data.folders) ? res.data.folders : [],
    };
  }

  return {
    ok: false,
    error: res.data?.error || 'E-mail ou senha incorretos.',
  };
}

/**
 * Autenticação com Conta Google no Banco SQL Central
 */
export async function apiGoogleAuth(googleProfile: {
  name: string;
  email: string;
  password?: string;
  avatarUrl?: string;
  googleId?: string;
}): Promise<ApiAuthResponse> {
  const res = await safeFetchJson<{
    ok?: boolean;
    user?: UserAccount;
    token?: string;
    tasks?: Task[];
    folders?: TaskFolder[];
    error?: string;
  }>('/api/auth/google', {
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

  if (res.offline) {
    return {
      ok: false,
      offline: true,
      backendMissing: res.backendMissing,
      error: 'Servidor offline ou inacessível.',
    };
  }

  if (res.ok && res.data?.ok && res.data.user) {
    if (res.data.token) setStoredToken(res.data.token);
    return {
      ok: true,
      user: res.data.user,
      token: res.data.token,
      tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
      folders: Array.isArray(res.data.folders) ? res.data.folders : [],
    };
  }

  return {
    ok: false,
    error: res.data?.error || 'Falha ao autenticar com o Google.',
  };
}

/**
 * Encerra a sessão atual no servidor e limpa o token local
 */
export async function apiLogout(): Promise<void> {
  const token = getStoredToken();
  setStoredToken(null);
  if (!token) return;
  await safeFetchJson('/api/auth/logout', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
}

/**
 * Solicita link assinado (HMAC) de recuperação de senha no servidor
 */
export async function apiRequestResetLink(
  email: string,
  origin: string,
): Promise<{ ok: boolean; resetLink?: string; error?: string; offline?: boolean }> {
  const res = await safeFetchJson<{ ok?: boolean; resetLink?: string; error?: string }>(
    '/api/auth/request-reset',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        origin,
      }),
    },
  );

  if (res.offline) {
    return { ok: false, offline: true };
  }
  if (res.ok && res.data?.ok && res.data.resetLink) {
    return { ok: true, resetLink: res.data.resetLink };
  }
  return { ok: false, error: res.data?.error || 'Conta não encontrada.' };
}

/**
 * Redefinição de senha no Banco SQL Central
 */
export async function apiResetPassword(params: {
  email: string;
  newPassword: string;
  keyword?: string;
  token?: string;
}): Promise<ApiAuthResponse> {
  const res = await safeFetchJson<{
    ok?: boolean;
    user?: UserAccount;
    token?: string;
    tasks?: Task[];
    folders?: TaskFolder[];
    error?: string;
  }>('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: params.email.trim().toLowerCase(),
      newPassword: params.newPassword.trim(),
      keyword: params.keyword ? params.keyword.trim().toLowerCase() : undefined,
      token: params.token,
    }),
  });

  if (res.offline) {
    return { ok: false, offline: true, backendMissing: res.backendMissing };
  }
  if (res.ok && res.data?.ok && res.data.user) {
    if (res.data.token) setStoredToken(res.data.token);
    return {
      ok: true,
      user: res.data.user,
      token: res.data.token,
      tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
      folders: Array.isArray(res.data.folders) ? res.data.folders : [],
    };
  }
  return { ok: false, error: res.data?.error || 'Falha ao redefinir senha.' };
}

/**
 * Puxa todas as tarefas e pastas salvas do usuário no Banco SQL
 */
export async function apiPullTasksAndFolders(): Promise<{
  ok: boolean;
  tasks?: Task[];
  folders?: TaskFolder[];
  unauthorized?: boolean;
  offline?: boolean;
}> {
  if (!getStoredToken()) return { ok: false, unauthorized: true };
  const res = await safeFetchJson<{
    ok?: boolean;
    tasks?: Task[];
    folders?: TaskFolder[];
  }>('/api/sync', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (res.offline) return { ok: false, offline: true };
  if (res.status === 401) return { ok: false, unauthorized: true };
  if (!res.ok || !res.data?.ok) return { ok: false };

  return {
    ok: true,
    tasks: Array.isArray(res.data.tasks) ? res.data.tasks : [],
    folders: Array.isArray(res.data.folders) ? res.data.folders : [],
  };
}

/**
 * Envia tarefas e pastas locais pendentes e recebe estado unificado do Banco SQL
 */
export async function apiPushTasksAndFolders(
  tasks: Task[],
  folders: TaskFolder[],
): Promise<{ ok: boolean; tasks?: Task[]; folders?: TaskFolder[]; offline?: boolean }> {
  if (!getStoredToken()) return { ok: false };
  const res = await safeFetchJson<{
    ok?: boolean;
    tasks?: Task[];
    folders?: TaskFolder[];
  }>('/api/sync', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tasks, folders }),
  });

  if (res.offline) return { ok: false, offline: true };
  return {
    ok: Boolean(res.ok && res.data?.ok),
    tasks: Array.isArray(res.data?.tasks) ? res.data.tasks : undefined,
    folders: Array.isArray(res.data?.folders) ? res.data.folders : undefined,
  };
}

export async function apiUpsertTask(task: Task): Promise<boolean> {
  if (!getStoredToken()) return false;
  const res = await safeFetchJson('/api/tasks', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ task }),
  });
  return Boolean(res.ok);
}

export async function apiDeleteTask(taskId: string): Promise<boolean> {
  if (!getStoredToken()) return false;
  const res = await safeFetchJson(`/api/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return Boolean(res.ok);
}

export async function apiUpsertFolder(folder: TaskFolder): Promise<boolean> {
  if (!getStoredToken()) return false;
  const res = await safeFetchJson('/api/folders', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ folder }),
  });
  return Boolean(res.ok);
}

export async function apiDeleteFolder(folderId: string): Promise<boolean> {
  if (!getStoredToken()) return false;
  const res = await safeFetchJson(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return Boolean(res.ok);
}

export async function apiClearUserData(): Promise<boolean> {
  if (!getStoredToken()) return false;
  const res = await safeFetchJson('/api/sync/clear', {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return Boolean(res.ok);
}

/**
 * Exclui múltiplas tarefas em lote no Banco SQL (DELETE /api/tasks/bulk)
 */
export async function apiDeleteTasksBulk(ids: string[]): Promise<{
  ok: boolean;
  deletedCount?: number;
  tasks?: Task[];
  offline?: boolean;
  error?: string;
}> {
  if (!getStoredToken()) {
    return { ok: false, offline: true, error: 'Sessão local sem token remoto.' };
  }
  const res = await safeFetchJson<{
    ok?: boolean;
    deletedCount?: number;
    tasks?: Task[];
    error?: string;
  }>('/api/tasks/bulk', {
    method: 'DELETE',
    headers: getAuthHeaders(),
    body: JSON.stringify({ ids }),
  });

  if (res.offline) {
    return { ok: false, offline: true, error: 'Sem conexão com o servidor no momento.' };
  }
  if (!res.ok || !res.data?.ok) {
    return {
      ok: false,
      error: res.data?.error || 'Falha ao excluir tarefas em lote no servidor.',
    };
  }
  return {
    ok: true,
    deletedCount: res.data.deletedCount ?? ids.length,
    tasks: Array.isArray(res.data.tasks) ? res.data.tasks : undefined,
  };
}

/**
 * Insere ou atualiza várias tarefas em lote em uma única transação no Banco SQL (POST /api/tasks/bulk)
 */
export async function apiBulkTasks(tasks: Task[]): Promise<{
  ok: boolean;
  tasks?: Task[];
  insertedCount?: number;
  offline?: boolean;
  error?: string;
}> {
  if (!getStoredToken()) {
    return { ok: false, offline: true, error: 'Sessão local sem token remoto.' };
  }
  const res = await safeFetchJson<{
    ok?: boolean;
    insertedCount?: number;
    tasks?: Task[];
    error?: string;
  }>('/api/tasks/bulk', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tasks }),
  });

  if (res.offline) {
    return { ok: false, offline: true, error: 'Sem conexão com o servidor no momento.' };
  }
  if (!res.ok || !res.data?.ok) {
    return {
      ok: false,
      error: res.data?.error || 'Falha ao gravar tarefas em lote no servidor.',
    };
  }
  return {
    ok: true,
    insertedCount: res.data.insertedCount ?? tasks.length,
    tasks: Array.isArray(res.data.tasks) ? res.data.tasks : undefined,
  };
}

/**
 * Solicita o Fechamento Inteligente do Mês com Google Gemini 2.5 Flash (POST /api/ai/monthly-review)
 */
export async function apiRequestMonthlyReview(
  month: string,
  tasks: Task[] = [],
): Promise<MonthlyReviewResponse> {
  const res = await safeFetchJson<MonthlyReviewResponse>('/api/ai/monthly-review', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ month, tasks }),
  });

  if (res.offline || !res.data) {
    return {
      ok: false,
      offline: true,
      error: res.backendMissing
        ? 'Backend Node não detectado neste domínio (verifique o Web Service no Render).'
        : 'Servidor indisponível ou sem conexão de internet no momento.',
    };
  }

  return res.data;
}

/**
 * Solicita ao backend o link assinado de assinatura automática do Calendário iOS (webcal:// e https://)
 */
export async function apiGetCalendarFeedUrl(): Promise<{
  ok: boolean;
  webcalUrl?: string;
  httpsUrl?: string;
  feedToken?: string;
  offline?: boolean;
  error?: string;
}> {
  if (!getStoredToken()) {
    return {
      ok: false,
      offline: true,
      error: 'Conecte-se à sua conta no servidor para gerar o link webcal:// do iPhone.',
    };
  }

  const res = await safeFetchJson<{
    ok?: boolean;
    feedToken?: string;
    feedPath?: string;
    error?: string;
  }>('/api/calendar/feed-token', {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (res.offline || !res.data?.ok || !res.data.feedPath) {
    return {
      ok: false,
      offline: Boolean(res.offline),
      error:
        res.data?.error ||
        'Não foi possível obter o link de sincronização do calendário no momento.',
    };
  }

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://bv-tasks.onrender.com';
  const baseHost = (API_BASE || origin).replace(/\/+$/, '');
  const httpsUrl = `${baseHost}${res.data.feedPath}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//i, 'webcal://');

  return {
    ok: true,
    feedToken: res.data.feedToken,
    httpsUrl,
    webcalUrl,
  };
}

/**
 * Envia mensagem para o Mini-Chatbot Assistente de Ação Rápida (POST /api/ai/assistant)
 */
export async function apiAskTaskAssistant(
  message: string,
  currentDate: string,
  history: Array<{ role: 'user' | 'assistant'; text: string }> = [],
): Promise<AssistantResponse> {
  const res = await safeFetchJson<AssistantResponse>('/api/ai/assistant', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ message, currentDate, history }),
  });

  if (res.offline || !res.data) {
    return {
      ok: false,
      offline: true,
      error: res.backendMissing
        ? 'Backend Node não detectado neste domínio.'
        : 'Servidor indisponível ou sem conexão no momento.',
    };
  }

  return res.data;
}
