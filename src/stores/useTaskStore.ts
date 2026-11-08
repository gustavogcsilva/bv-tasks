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
  apiGoogleAuth,
  apiLogin,
  apiPullTasksAndFolders,
  apiPushTasksAndFolders,
  apiRegister,
  apiResetPassword,
  setStoredToken,
} from '../services/apiSync';
import { generateId, safeLocalStorage } from '../services/storage';

export type ScopeFilter = 'all' | Scope;

const priorityRank: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const DEFAULT_FOLDERS: TaskFolder[] = [
  {
    id: 'folder-work-default',
    name: 'Projetos & Clientes',
    scope: 'work',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'folder-study-default',
    name: 'Leituras & Cursos',
    scope: 'study',
    createdAt: '2026-01-01T00:00:01.000Z',
  },
  {
    id: 'folder-personal-default',
    name: 'Rotina Pessoal',
    scope: 'personal',
    createdAt: '2026-01-01T00:00:02.000Z',
  },
];

/**
 * Ordena as tarefas automaticamente com proteção contra dados legados:
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
  addTask: (draft: TaskDraft) => Task;
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
  ) => Promise<{ ok: boolean; error?: string }>;
  loginAccount: (
    email: string,
    password: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  loginWithGoogle: (
    googleProfile: { name: string; email: string; password?: string; avatarUrl?: string; googleId?: string },
  ) => Promise<{ ok: boolean; account: UserAccount }>;
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
  ) => Promise<{ ok: boolean; error?: string }>;
  syncWithDatabase: () => Promise<void>;
  logoutAccount: () => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      folders: DEFAULT_FOLDERS,
      selectedDate: format(new Date(), 'yyyy-MM-dd'),
      scopeFilter: 'all',
      selectedFolderId: 'all',
      theme: 'light',
      currentUser: null,
      registeredAccounts: [],

      addTask: (draft) => {
        const created: Task = {
          ...draft,
          id: generateId(),
          isCompleted: false,
          createdAt: new Date().toISOString(),
        };
        const nextTasks = [...get().tasks, created];
        set({ tasks: nextTasks });
        void apiPushTasksAndFolders(nextTasks, get().folders);
        return created;
      },

      toggleTask: (id) => {
        const nextTasks = get().tasks.map((task) =>
          task.id === id ? { ...task, isCompleted: !task.isCompleted } : task,
        );
        set({ tasks: nextTasks });
        void apiPushTasksAndFolders(nextTasks, get().folders);
      },

      deleteTask: (id) => {
        const nextTasks = get().tasks.filter((task) => task.id !== id);
        set({ tasks: nextTasks });
        void apiPushTasksAndFolders(nextTasks, get().folders);
      },

      markTaskNotified: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, notified: true } : task,
          ),
        })),

      addAttachmentToTask: (taskId, attachment) => {
        const nextTasks = get().tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                attachments: [...(task.attachments ?? []), attachment],
              }
            : task,
        );
        set({ tasks: nextTasks });
        void apiPushTasksAndFolders(nextTasks, get().folders);
      },

      removeAttachmentFromTask: (taskId, attachmentId) => {
        const nextTasks = get().tasks.map((task) =>
          task.id === taskId
            ? {
                ...task,
                attachments: (task.attachments ?? []).filter((a) => a.id !== attachmentId),
              }
            : task,
        );
        set({ tasks: nextTasks });
        void apiPushTasksAndFolders(nextTasks, get().folders);
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
        void apiPushTasksAndFolders(get().tasks, nextFolders);
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
        void apiPushTasksAndFolders(nextTasks, nextFolders);
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

        // Tenta registrar primeiro no Banco de Dados Central para sincronização entre dispositivos
        try {
          const apiRes = await apiRegister(
            trimmedName,
            normalizedEmail,
            normalizedPassword,
            normalizedKeyword,
          );
          if (apiRes.ok && apiRes.user) {
            const user = apiRes.user;
            set((state) => ({
              registeredAccounts: [
                ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
                user,
              ],
              currentUser: user,
            }));
            return { ok: true };
          } else if (apiRes.error && !apiRes.offline) {
            return { ok: false, error: apiRes.error };
          }
        } catch {
          // Continua para salvamento local resiliente
        }

        const existing = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (existing) {
          if (existing.passwordHash === normalizedPassword) {
            set({ currentUser: existing });
            return { ok: true };
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
        }));

        return { ok: true };
      },

      loginAccount: async (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedPassword = password.trim();

        // 1. Tenta autenticar no Banco de Dados Central (para celular e computador sincronizados)
        try {
          const apiRes = await apiLogin(normalizedEmail, normalizedPassword);
          if (apiRes.ok && apiRes.user) {
            const user = apiRes.user;
            set((state) => ({
              currentUser: user,
              registeredAccounts: [
                ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
                user,
              ],
            }));
            void get().syncWithDatabase();
            return { ok: true };
          } else if (apiRes.error && !apiRes.offline) {
            return { ok: false, error: apiRes.error };
          }
        } catch {
          // Fallback para cache local
        }

        // 2. Fallback offline local
        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account || account.passwordHash !== normalizedPassword) {
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
            account: {
              id: '',
              name: '',
              email: '',
              passwordHash: '',
              createdAt: '',
            },
          };
        }

        // Tenta autenticar no banco de dados central
        try {
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
              registeredAccounts: [
                ...state.registeredAccounts.filter((a) => a.email !== email),
                user,
              ],
            }));
            void get().syncWithDatabase();
            return { ok: true, account: user };
          }
        } catch {
          // Fallback offline
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
          passwordHash: `google-oauth-${generateId()}`,
          recoveryKeyword: 'google',
          provider: 'google',
          avatarUrl: googleProfile.avatarUrl,
          googleId: googleProfile.googleId,
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          registeredAccounts: [...state.registeredAccounts, googleAccount],
          currentUser: googleAccount,
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

        try {
          const apiRes = await apiResetPassword({
            email: normalizedEmail,
            keyword: normalizedKeyword,
            newPassword: normalizedNewPass,
          });
          if (apiRes.ok && apiRes.user) {
            set((state) => ({
              currentUser: apiRes.user,
              registeredAccounts: [
                ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
                apiRes.user!,
              ],
            }));
            return { ok: true };
          }
        } catch {
          // Fallback offline
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

      resetPasswordViaEmailLink: async (email, newPassword) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedNewPass = newPassword.trim();
        if (normalizedNewPass.length < 6) {
          return { ok: false, error: 'A nova senha deve ter pelo menos 6 caracteres.' };
        }

        try {
          const token = btoa(encodeURIComponent(normalizedEmail));
          const apiRes = await apiResetPassword({
            email: normalizedEmail,
            token,
            newPassword: normalizedNewPass,
          });
          if (apiRes.ok && apiRes.user) {
            set((state) => ({
              currentUser: apiRes.user,
              registeredAccounts: [
                ...state.registeredAccounts.filter((a) => a.email !== normalizedEmail),
                apiRes.user!,
              ],
            }));
            return { ok: true };
          }
        } catch {
          // Fallback offline
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

      syncWithDatabase: async () => {
        const currentUser = get().currentUser;
        if (!currentUser) return;

        try {
          const pullRes = await apiPullTasksAndFolders();
          if (pullRes.ok && pullRes.tasks && pullRes.folders) {
            const serverTaskMap = new Map(pullRes.tasks.map((t) => [t.id, t]));
            for (const lt of get().tasks) {
              if (!serverTaskMap.has(lt.id)) {
                serverTaskMap.set(lt.id, lt);
              }
            }
            const mergedTasks = Array.from(serverTaskMap.values());

            const serverFolderMap = new Map(pullRes.folders.map((f) => [f.id, f]));
            for (const lf of get().folders) {
              if (!serverFolderMap.has(lf.id)) {
                serverFolderMap.set(lf.id, lf);
              }
            }
            const mergedFolders = Array.from(serverFolderMap.values());

            set({ tasks: mergedTasks, folders: mergedFolders });
            await apiPushTasksAndFolders(mergedTasks, mergedFolders);
          } else {
            await apiPushTasksAndFolders(get().tasks, get().folders);
          }
        } catch {
          // Fallback offline silencioso
        }
      },

      logoutAccount: () => {
        setStoredToken(null);
        set({ currentUser: null });
      },
    }),
    {
      name: 'bv-tasks-storage',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      merge: (persistedState, currentState) => {
        const raw = (persistedState as Partial<TaskStore> | undefined) ?? {};
        const validDate =
          typeof raw.selectedDate === 'string' && isValid(parseISO(raw.selectedDate))
            ? raw.selectedDate
            : currentState.selectedDate;

        return {
          ...currentState,
          tasks: Array.isArray(raw.tasks) ? raw.tasks : currentState.tasks,
          folders: Array.isArray(raw.folders) ? raw.folders : currentState.folders,
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
      }),
    },
  ),
);
