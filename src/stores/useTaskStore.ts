import { format, isValid, parseISO } from 'date-fns';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type {
  Priority,
  Scope,
  Task,
  TaskAttachment,
  TaskDraft,
  TaskFolder,
  ThemeMode,
  UserAccount,
} from '../features/tasks/types/task.types';
import {
  apiBulkTasks,
  apiCheckHealth,
  apiClearUserData,
  apiDeleteFolder,
  apiDeleteTask,
  apiGoogleAuth,
  apiLogin,
  apiLogout,
  apiPullTasksAndFolders,
  apiPushTasksAndFolders,
  apiRegister,
  apiResetPassword,
  apiUpsertFolder,
  apiUpsertTask,
  ensureCleanSlateMigration,
  type DbEngineStatus,
} from '../services/apiSync';
import { generateId, safeLocalStorage } from '../services/storage';

// Executa limpeza única de dados antigos/voláteis ao carregar a aplicação
ensureCleanSlateMigration();

export type ScopeFilter = 'all' | Scope;

const priorityRank: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/**
 * Ordena as tarefas automaticamente:
 * 1. Tarefas pendentes primeiro, concluídas por último
 * 2. Prioridade: Alta (high) > Média (medium) > Baixa (low)
 * 3. Horário definido (mais cedo primeiro)
 * 4. Ordem de criação (createdAt)
 */
export function sortTasks(tasks: Task[]): Task[] {
  if (!Array.isArray(tasks)) return [];
  return [...tasks].sort(
    (left, right) =>
      Number(Boolean(left.isCompleted)) - Number(Boolean(right.isCompleted)) ||
      (priorityRank[left.priority] ?? 1) - (priorityRank[right.priority] ?? 1) ||
      (left.time ?? '99:99').localeCompare(right.time ?? '99:99') ||
      (left.createdAt ?? '').localeCompare(right.createdAt ?? ''),
  );
}

export interface TaskStore {
  tasks: Task[];
  folders: TaskFolder[];
  selectedDate: string;
  scopeFilter: ScopeFilter;
  selectedFolderId: 'all' | string;
  theme: ThemeMode;
  currentUser: UserAccount | null;
  registeredAccounts: UserAccount[];
  pendingOfflineSync: boolean;
  dbEngine: DbEngineStatus;
  sqlPersistent: boolean;
  aiEnabled: boolean;
  addTask: (draft: TaskDraft) => Task;
  addTasksBulk: (drafts: TaskDraft[]) => Promise<{ ok: boolean; count: number; synced: boolean; error?: string }>;
  upsertTasksBulk: (tasksToUpsert: Task[]) => Promise<{ ok: boolean; count: number; synced: boolean; error?: string }>;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  markTaskNotified: (id: string) => void;
  addAttachmentToTask: (taskId: string, attachment: TaskAttachment) => void;
  removeAttachmentFromTask: (taskId: string, attachmentId: string) => void;
  addFolder: (name: string, scope?: Scope) => TaskFolder | null;
  deleteFolder: (id: string) => void;
  setSelectedDate: (date: string) => void;
  setScopeFilter: (filter: ScopeFilter) => void;
  setSelectedFolderId: (folderId: 'all' | string) => void;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  registerAccount: (
    name: string,
    email: string,
    password: string,
    recoveryKeyword?: string,
  ) => Promise<{ ok: boolean; error?: string; backendMissing?: boolean }>;
  loginAccount: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string; backendMissing?: boolean }>;
  loginWithGoogle: (googleProfile: {
    name: string;
    email: string;
    password?: string;
    avatarUrl?: string;
    googleId?: string;
  }) => Promise<{ ok: boolean; account: UserAccount; error?: string }>;
  resetPasswordWithKeyword: (
    email: string,
    keyword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  requestPasswordResetLink: (
    email: string,
  ) => { ok: boolean; resetLink?: string; error?: string };
  resetPasswordViaEmailLink: (
    email: string,
    newPassword: string,
    resetToken?: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  checkDatabaseHealth: () => Promise<void>;
  syncWithDatabase: () => Promise<void>;
  clearAllUserData: () => Promise<void>;
  logoutAccount: () => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      folders: [],
      selectedDate: format(new Date(), 'yyyy-MM-dd'),
      scopeFilter: 'all',
      selectedFolderId: 'all',
      theme: 'light',
      currentUser: null,
      registeredAccounts: [],
      pendingOfflineSync: false,
      dbEngine: 'offline',
      sqlPersistent: false,
      aiEnabled: false,

      addTask: (draft) => {
        const created: Task = {
          ...draft,
          id: generateId(),
          isCompleted: false,
          createdAt: new Date().toISOString(),
        };
        const nextTasks = [...get().tasks, created];
        set({ tasks: nextTasks });

        void apiUpsertTask(created).then((saved) => {
          if (!saved) set({ pendingOfflineSync: true });
        });
        return created;
      },

      addTasksBulk: async (drafts) => {
        if (!Array.isArray(drafts) || drafts.length === 0) {
          return { ok: false, count: 0, synced: false, error: 'Nenhuma tarefa válida selecionada.' };
        }
        const now = Date.now();
        const createdTasks: Task[] = drafts.map((draft, idx) => ({
          ...draft,
          id: generateId(),
          isCompleted: false,
          createdAt: new Date(now + idx).toISOString(),
        }));
        return get().upsertTasksBulk(createdTasks);
      },

      upsertTasksBulk: async (tasksToUpsert) => {
        if (!Array.isArray(tasksToUpsert) || tasksToUpsert.length === 0) {
          return { ok: false, count: 0, synced: false, error: 'Nenhuma tarefa para gravar.' };
        }
        const upsertMap = new Map(tasksToUpsert.map((t) => [t.id, t]));
        const existingUpdated = get().tasks.map((t) => upsertMap.get(t.id) ?? t);
        const existingIds = new Set(get().tasks.map((t) => t.id));
        const brandNew = tasksToUpsert.filter((t) => !existingIds.has(t.id));
        set({ tasks: [...existingUpdated, ...brandNew] });

        const apiRes = await apiBulkTasks(tasksToUpsert);
        if (apiRes.ok) {
          if (Array.isArray(apiRes.tasks)) {
            set({ tasks: apiRes.tasks, pendingOfflineSync: false });
          }
          return { ok: true, count: tasksToUpsert.length, synced: true };
        }
        if (apiRes.offline) {
          set({ pendingOfflineSync: true });
          return { ok: true, count: tasksToUpsert.length, synced: false };
        }
        return {
          ok: true,
          count: tasksToUpsert.length,
          synced: false,
          error: apiRes.error,
        };
      },

      toggleTask: (id) => {
        let updatedTask: Task | undefined;
        const nextTasks = get().tasks.map((task) => {
          if (task.id === id) {
            updatedTask = { ...task, isCompleted: !task.isCompleted };
            return updatedTask;
          }
          return task;
        });
        set({ tasks: nextTasks });

        if (updatedTask) {
          void apiUpsertTask(updatedTask).then((saved) => {
            if (!saved) set({ pendingOfflineSync: true });
          });
        }
      },

      deleteTask: (id) => {
        const nextTasks = get().tasks.filter((task) => task.id !== id);
        set({ tasks: nextTasks });
        void apiDeleteTask(id);
      },

      markTaskNotified: (id) => {
        let updatedTask: Task | undefined;
        const nextTasks = get().tasks.map((task) => {
          if (task.id === id) {
            updatedTask = { ...task, notified: true };
            return updatedTask;
          }
          return task;
        });
        set({ tasks: nextTasks });
        if (updatedTask) {
          void apiUpsertTask(updatedTask);
        }
      },

      addAttachmentToTask: (taskId, attachment) => {
        let updatedTask: Task | undefined;
        const nextTasks = get().tasks.map((task) => {
          if (task.id === taskId) {
            updatedTask = {
              ...task,
              attachments: [...(task.attachments ?? []), attachment],
            };
            return updatedTask;
          }
          return task;
        });
        set({ tasks: nextTasks });
        if (updatedTask) {
          void apiUpsertTask(updatedTask).then((saved) => {
            if (!saved) set({ pendingOfflineSync: true });
          });
        }
      },

      removeAttachmentFromTask: (taskId, attachmentId) => {
        let updatedTask: Task | undefined;
        const nextTasks = get().tasks.map((task) => {
          if (task.id === taskId) {
            updatedTask = {
              ...task,
              attachments: (task.attachments ?? []).filter((a) => a.id !== attachmentId),
            };
            return updatedTask;
          }
          return task;
        });
        set({ tasks: nextTasks });
        if (updatedTask) {
          void apiUpsertTask(updatedTask).then((saved) => {
            if (!saved) set({ pendingOfflineSync: true });
          });
        }
      },

      addFolder: (name, scope) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const newFolder: TaskFolder = {
          id: generateId(),
          name: trimmed,
          ...(scope ? { scope } : {}),
          createdAt: new Date().toISOString(),
        };
        const nextFolders = [...get().folders, newFolder];
        set({ folders: nextFolders });
        void apiUpsertFolder(newFolder).then((saved) => {
          if (!saved) set({ pendingOfflineSync: true });
        });
        return newFolder;
      },

      deleteFolder: (id) => {
        const nextFolders = get().folders.filter((f) => f.id !== id);
        const nextTasks = get().tasks.map((task) =>
          task.folderId === id ? { ...task, folderId: undefined } : task,
        );
        set({
          folders: nextFolders,
          selectedFolderId: get().selectedFolderId === id ? 'all' : get().selectedFolderId,
          tasks: nextTasks,
        });
        void apiDeleteFolder(id);
      },

      setSelectedDate: (selectedDate) => set({ selectedDate }),
      setScopeFilter: (scopeFilter) => set({ scopeFilter }),
      setSelectedFolderId: (selectedFolderId) => set({ selectedFolderId }),

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'light' ? 'dark' : 'light',
        })),

      setTheme: (theme) => set({ theme }),

      registerAccount: async (name, email, password, recoveryKeyword) => {
        const trimmedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = password.trim();
        const normalizedKeyword = (recoveryKeyword ?? '').trim().toLowerCase();

        if (!trimmedName || trimmedName.length < 2) {
          return { ok: false, error: 'Informe seu nome completo ou profissional.' };
        }
        if (!normalizedEmail || !normalizedEmail.includes('@') || normalizedEmail.length < 5) {
          return { ok: false, error: 'Informe um endereço de e-mail válido.' };
        }
        if (normalizedPassword.length < 6) {
          return { ok: false, error: 'A senha deve conter no mínimo 6 caracteres.' };
        }

        // 1. Autentica / Registra no Banco de Dados SQL Central
        const apiRes = await apiRegister(
          trimmedName,
          normalizedEmail,
          normalizedPassword,
          normalizedKeyword,
        );

        if (apiRes.ok && apiRes.user) {
          const user = apiRes.user;
          set((state) => ({
            currentUser: user,
            tasks: apiRes.tasks ?? [],
            folders: apiRes.folders ?? [],
            pendingOfflineSync: false,
            registeredAccounts: [
              ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
              user,
            ],
          }));
          void get().checkDatabaseHealth();
          return { ok: true };
        }

        if (!apiRes.offline) {
          return { ok: false, error: apiRes.error };
        }

        if (apiRes.backendMissing) {
          set({ dbEngine: 'static-no-backend', sqlPersistent: false });
        }

        // 2. Fallback offline local (apenas quando sem conexão de rede ou testes locais)
        const existing = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (existing) {
          if (existing.passwordHash === normalizedPassword) {
            set({ currentUser: existing });
            return { ok: true, backendMissing: apiRes.backendMissing };
          }
          return { ok: false, error: 'Este e-mail já possui conta cadastrada. Faça login.' };
        }

        const newAccount: UserAccount = {
          id: generateId(),
          name: trimmedName,
          email: normalizedEmail,
          passwordHash: normalizedPassword,
          recoveryKeyword: normalizedKeyword || 'vinho',
          provider: 'email',
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          registeredAccounts: [...state.registeredAccounts, newAccount],
          currentUser: newAccount,
          tasks: [],
          folders: [],
        }));

        return { ok: true, backendMissing: apiRes.backendMissing };
      },

      loginAccount: async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = password.trim();

        // 1. Login no Banco de Dados SQL Central (permite acessar de qualquer dispositivo)
        const apiRes = await apiLogin(normalizedEmail, normalizedPassword);
        if (apiRes.ok && apiRes.user) {
          const user = apiRes.user;
          set((state) => ({
            currentUser: user,
            tasks: apiRes.tasks ?? [],
            folders: apiRes.folders ?? [],
            pendingOfflineSync: false,
            registeredAccounts: [
              ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
              user,
            ],
          }));
          void get().checkDatabaseHealth();
          return { ok: true };
        }

        if (!apiRes.offline) {
          return { ok: false, error: apiRes.error };
        }

        if (apiRes.backendMissing) {
          set({ dbEngine: 'static-no-backend', sqlPersistent: false });
        }

        // 2. Fallback offline local
        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account || account.passwordHash !== normalizedPassword) {
          if (apiRes.backendMissing) {
            return {
              ok: false,
              backendMissing: true,
              error:
                'Servidor SQL ainda não conectado no Render (serviço atual está como Static Site). Ative o Web Service + PostgreSQL no Render para login entre dispositivos.',
            };
          }
          return { ok: false, error: 'E-mail ou senha incorretos.' };
        }

        set({ currentUser: account });
        return { ok: true };
      },

      loginWithGoogle: async (googleProfile) => {
        const email = (googleProfile.email ?? '').trim().toLowerCase();
        const name = (googleProfile.name ?? '').trim() || email.split('@')[0];

        if (!email || !email.includes('@')) {
          return {
            ok: false,
            error: 'E-mail Google inválido.',
            account: {
              id: '',
              name: '',
              email: '',
              passwordHash: '',
              createdAt: '',
            },
          };
        }

        const apiRes = await apiGoogleAuth({
          email,
          name,
          password: googleProfile.password,
          avatarUrl: googleProfile.avatarUrl,
          googleId: googleProfile.googleId,
        });

        if (apiRes.ok && apiRes.user) {
          const user = apiRes.user;
          set((state) => ({
            currentUser: user,
            tasks: apiRes.tasks ?? [],
            folders: apiRes.folders ?? [],
            pendingOfflineSync: false,
            registeredAccounts: [
              ...state.registeredAccounts.filter((a) => a.email !== email),
              user,
            ],
          }));
          void get().checkDatabaseHealth();
          return { ok: true, account: user };
        }

        if (!apiRes.offline) {
          return {
            ok: false,
            error: apiRes.error,
            account: {
              id: '',
              name: '',
              email: '',
              passwordHash: '',
              createdAt: '',
            },
          };
        }

        if (apiRes.backendMissing) {
          set({ dbEngine: 'static-no-backend', sqlPersistent: false });
        }

        const existing = get().registeredAccounts.find((a) => a.email === email);
        if (existing) {
          const updated: UserAccount = {
            ...existing,
            provider: 'google',
            avatarUrl: googleProfile.avatarUrl ?? existing.avatarUrl,
            googleId: googleProfile.googleId ?? existing.googleId,
          };
          set((state) => ({
            currentUser: updated,
            registeredAccounts: state.registeredAccounts.map((a) =>
              a.id === existing.id ? updated : a,
            ),
          }));
          return { ok: true, account: updated };
        }

        const googleAccount: UserAccount = {
          id: generateId(),
          name,
          email,
          passwordHash: googleProfile.password?.trim() || `google-oauth-${generateId()}`,
          recoveryKeyword: 'google',
          provider: 'google',
          avatarUrl: googleProfile.avatarUrl,
          googleId: googleProfile.googleId,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          registeredAccounts: [...state.registeredAccounts, googleAccount],
          currentUser: googleAccount,
          tasks: [],
          folders: [],
        }));

        return { ok: true, account: googleAccount };
      },

      resetPasswordWithKeyword: async (email, keyword, newPassword) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedKeyword = keyword.trim().toLowerCase();
        const normalizedNewPass = newPassword.trim();

        if (!normalizedEmail) {
          return { ok: false, error: 'Informe seu e-mail cadastrado.' };
        }
        if (!normalizedKeyword) {
          return { ok: false, error: 'Informe a palavra-chave de segurança.' };
        }
        if (normalizedNewPass.length < 6) {
          return { ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' };
        }

        const apiRes = await apiResetPassword({
          email: normalizedEmail,
          keyword: normalizedKeyword,
          newPassword: normalizedNewPass,
        });

        if (apiRes.ok && apiRes.user) {
          set((state) => ({
            currentUser: apiRes.user,
            tasks: apiRes.tasks ?? [],
            folders: apiRes.folders ?? [],
            pendingOfflineSync: false,
            registeredAccounts: [
              ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
              apiRes.user!,
            ],
          }));
          return { ok: true };
        }

        if (!apiRes.offline) {
          return { ok: false, error: apiRes.error };
        }

        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account) {
          return { ok: false, error: 'Nenhuma conta encontrada com este e-mail.' };
        }
        if ((account.recoveryKeyword ?? '').toLowerCase() !== normalizedKeyword) {
          return { ok: false, error: 'Palavra-chave incorreta para este e-mail.' };
        }

        const updatedAccount: UserAccount = {
          ...account,
          passwordHash: normalizedNewPass,
        };

        set((state) => ({
          registeredAccounts: state.registeredAccounts.map((a) =>
            a.id === account.id ? updatedAccount : a,
          ),
          currentUser: updatedAccount,
        }));

        return { ok: true };
      },

      requestPasswordResetLink: (email) => {
        const normalizedEmail = email.trim().toLowerCase();
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          return { ok: false, error: 'Informe um e-mail válido para receber o link.' };
        }
        const origin =
          typeof window !== 'undefined' ? window.location.origin : 'https://bv-tasks.onrender.com';
        const token = btoa(encodeURIComponent(normalizedEmail));
        const resetLink = `${origin}/?reset_token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
        return { ok: true, resetLink };
      },

      resetPasswordViaEmailLink: async (email, newPassword, resetToken) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedNewPass = newPassword.trim();
        if (normalizedNewPass.length < 6) {
          return { ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' };
        }

        const token = resetToken || btoa(encodeURIComponent(normalizedEmail));
        const apiRes = await apiResetPassword({
          email: normalizedEmail,
          token,
          newPassword: normalizedNewPass,
        });

        if (apiRes.ok && apiRes.user) {
          set((state) => ({
            currentUser: apiRes.user,
            tasks: apiRes.tasks ?? [],
            folders: apiRes.folders ?? [],
            pendingOfflineSync: false,
            registeredAccounts: [
              ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
              apiRes.user!,
            ],
          }));
          return { ok: true };
        }

        if (!apiRes.offline) {
          return { ok: false, error: apiRes.error };
        }

        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account) {
          return { ok: false, error: 'Conta não localizada.' };
        }
        const updatedAccount: UserAccount = {
          ...account,
          passwordHash: normalizedNewPass,
        };
        set((state) => ({
          registeredAccounts: state.registeredAccounts.map((a) =>
            a.id === account.id ? updatedAccount : a,
          ),
          currentUser: updatedAccount,
        }));
        return { ok: true };
      },

      checkDatabaseHealth: async () => {
        const health = await apiCheckHealth();
        set({
          dbEngine: health.engine,
          sqlPersistent: health.sqlPersistent,
          aiEnabled: health.aiEnabled,
        });
      },

      syncWithDatabase: async () => {
        const user = get().currentUser;
        if (!user) return;

        await get().checkDatabaseHealth();

        // Se havia alterações feitas enquanto offline, envia primeiro para o SQL
        if (get().pendingOfflineSync) {
          const pushRes = await apiPushTasksAndFolders(get().tasks, get().folders);
          if (pushRes.ok) {
            set({
              tasks: pushRes.tasks ?? get().tasks,
              folders: pushRes.folders ?? get().folders,
              pendingOfflineSync: false,
            });
            return;
          }
        }

        // Busca o estado oficial atualizado do Banco SQL
        const pullRes = await apiPullTasksAndFolders();
        if (pullRes.ok) {
          set({
            tasks: pullRes.tasks ?? [],
            folders: pullRes.folders ?? [],
            pendingOfflineSync: false,
          });
        }
      },

      clearAllUserData: async () => {
        set({
          tasks: [],
          folders: [],
          selectedFolderId: 'all',
          pendingOfflineSync: false,
        });
        await apiClearUserData();
      },

      logoutAccount: () => {
        void apiLogout();
        set({
          currentUser: null,
          tasks: [],
          folders: [],
          selectedFolderId: 'all',
          pendingOfflineSync: false,
        });
      },
    }),
    {
      name: 'bv-tasks-sql-v8',
      version: 8,
      storage: createJSONStorage(() => safeLocalStorage),
      merge: (persistedState, currentState) => {
        const raw = (persistedState as Partial<TaskStore> | undefined) ?? {};
        const validDate =
          typeof raw.selectedDate === 'string' && isValid(parseISO(raw.selectedDate))
            ? raw.selectedDate
            : currentState.selectedDate;

        return {
          ...currentState,
          tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
          folders: Array.isArray(raw.folders) ? raw.folders : [],
          selectedDate: validDate,
          scopeFilter:
            raw.scopeFilter === 'work' ||
            raw.scopeFilter === 'personal' ||
            raw.scopeFilter === 'study' ||
            raw.scopeFilter === 'all'
              ? raw.scopeFilter
              : 'all',
          selectedFolderId:
            typeof raw.selectedFolderId === 'string' ? raw.selectedFolderId : 'all',
          theme: raw.theme === 'dark' || raw.theme === 'light' ? raw.theme : 'light',
          currentUser:
            raw.currentUser && typeof raw.currentUser.name === 'string' ? raw.currentUser : null,
          registeredAccounts: Array.isArray(raw.registeredAccounts) ? raw.registeredAccounts : [],
          pendingOfflineSync: Boolean(raw.pendingOfflineSync),
        };
      },
      partialize: (state) => ({
        tasks: state.tasks,
        folders: state.folders,
        selectedDate: state.selectedDate,
        scopeFilter: state.scopeFilter,
        selectedFolderId: state.selectedFolderId,
        theme: state.theme,
        currentUser: state.currentUser,
        registeredAccounts: state.registeredAccounts,
        pendingOfflineSync: state.pendingOfflineSync,
      }),
    },
  ),
);
