import { format } from 'date-fns';
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
import { generateId, safeLocalStorage } from '../services/storage';

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
  return [...tasks].sort(
    (left, right) =>
      Number(left.isCompleted) - Number(right.isCompleted) ||
      priorityRank[left.priority] - priorityRank[right.priority] ||
      (left.time ?? '99:99').localeCompare(right.time ?? '99:99') ||
      left.createdAt.localeCompare(right.createdAt),
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
  ) => { ok: boolean; error?: string };
  loginAccount: (email: string, password: string) => { ok: boolean; error?: string };
  loginWithGoogle: (
    googleProfile?: { name: string; email: string },
  ) => { ok: boolean; account: UserAccount };
  resetPasswordWithKeyword: (
    email: string,
    keyword: string,
    newPassword: string,
  ) => { ok: boolean; error?: string };
  requestPasswordResetLink: (
    email: string,
  ) => { ok: boolean; resetLink?: string; error?: string };
  resetPasswordViaEmailLink: (
    email: string,
    newPassword: string,
  ) => { ok: boolean; error?: string };
  logoutAccount: () => void;
}

export const useTaskStore = create<TaskStore>()(
  persist(
    (set, get) => ({
      tasks: [],
      folders: [
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
      ],
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
        set((state) => ({
          tasks: [...state.tasks, created],
        }));
        return created;
      },

      toggleTask: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, isCompleted: !task.isCompleted } : task,
          ),
        })),

      deleteTask: (id) =>
        set((state) => ({
          tasks: state.tasks.filter((task) => task.id !== id),
        })),

      markTaskNotified: (id) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === id ? { ...task, notified: true } : task,
          ),
        })),

      addAttachmentToTask: (taskId, attachment) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  attachments: [...(task.attachments ?? []), attachment],
                }
              : task,
          ),
        })),

      removeAttachmentFromTask: (taskId, attachmentId) =>
        set((state) => ({
          tasks: state.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  attachments: (task.attachments ?? []).filter((a) => a.id !== attachmentId),
                }
              : task,
          ),
        })),

      addFolder: (name, scope) => {
        const trimmed = name.trim();
        if (!trimmed) return null;
        const newFolder: TaskFolder = {
          id: generateId(),
          name: trimmed,
          ...(scope ? { scope } : {}),
          createdAt: new Date().toISOString(),
        };
        set((state) => ({
          folders: [...state.folders, newFolder],
        }));
        return newFolder;
      },

      deleteFolder: (id) =>
        set((state) => ({
          folders: state.folders.filter((f) => f.id !== id),
          selectedFolderId: state.selectedFolderId === id ? 'all' : state.selectedFolderId,
          tasks: state.tasks.map((task) =>
            task.folderId === id ? { ...task, folderId: undefined } : task,
          ),
        })),

      setSelectedDate: (selectedDate) => set({ selectedDate }),
      setScopeFilter: (scopeFilter) => set({ scopeFilter }),
      setSelectedFolderId: (selectedFolderId) => set({ selectedFolderId }),

      toggleTheme: () =>
        set((state) => ({
          theme: state.theme === 'light' ? 'dark' : 'light',
        })),

      setTheme: (theme) => set({ theme }),

      registerAccount: (name, email, password, recoveryKeyword) => {
        const trimmedName = name.trim();
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedKeyword = (recoveryKeyword ?? '').trim().toLowerCase();

        if (!trimmedName) {
          return { ok: false, error: 'Informe seu nome completo ou apelido.' };
        }
        if (!normalizedEmail || !normalizedEmail.includes('@')) {
          return { ok: false, error: 'Informe um e-mail válido.' };
        }
        if (password.length < 4) {
          return { ok: false, error: 'A senha deve ter pelo menos 4 caracteres.' };
        }

        const existing = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (existing) {
          if (existing.passwordHash === password) {
            set({ currentUser: existing });
            return { ok: true };
          }
          return { ok: false, error: 'Este e-mail já possui conta cadastrada. Faça login.' };
        }

        const newAccount: UserAccount = {
          id: generateId(),
          name: trimmedName,
          email: normalizedEmail,
          passwordHash: password,
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

      loginAccount: (email, password) => {
        const normalizedEmail = email.trim().toLowerCase();
        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account || account.passwordHash !== password) {
          return { ok: false, error: 'E-mail ou senha incorretos.' };
        }
        set({ currentUser: account });
        return { ok: true };
      },

      loginWithGoogle: (googleProfile) => {
        const email = (googleProfile?.email ?? 'usuario.google@gmail.com').trim().toLowerCase();
        const name = (googleProfile?.name ?? 'Conta Google B V').trim();

        const existing = get().registeredAccounts.find((a) => a.email === email);
        if (existing) {
          set({ currentUser: existing });
          return { ok: true, account: existing };
        }

        const googleAccount: UserAccount = {
          id: generateId(),
          name,
          email,
          passwordHash: `google-oauth-${generateId()}`,
          recoveryKeyword: 'google',
          provider: 'google',
          createdAt: new Date().toISOString(),
        };

        set((state) => ({
          registeredAccounts: [...state.registeredAccounts, googleAccount],
          currentUser: googleAccount,
        }));

        return { ok: true, account: googleAccount };
      },

      resetPasswordWithKeyword: (email, keyword, newPassword) => {
        const normalizedEmail = email.trim().toLowerCase();
        const normalizedKeyword = keyword.trim().toLowerCase();

        if (!normalizedEmail) {
          return { ok: false, error: 'Informe seu e-mail cadastrado.' };
        }
        if (!normalizedKeyword) {
          return { ok: false, error: 'Informe a palavra-chave de segurança.' };
        }
        if (newPassword.length < 4) {
          return { ok: false, error: 'A nova senha deve ter pelo menos 4 caracteres.' };
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
          passwordHash: newPassword,
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
        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account) {
          return { ok: false, error: 'Nenhuma conta encontrada com este e-mail.' };
        }
        const origin = typeof window !== 'undefined' ? window.location.origin : 'https://bv-tasks.onrender.com';
        const token = btoa(encodeURIComponent(normalizedEmail));
        const resetLink = `${origin}/?reset_token=${token}&email=${encodeURIComponent(normalizedEmail)}`;
        return { ok: true, resetLink };
      },

      resetPasswordViaEmailLink: (email, newPassword) => {
        const normalizedEmail = email.trim().toLowerCase();
        if (newPassword.length < 4) {
          return { ok: false, error: 'A nova senha deve ter pelo menos 4 caracteres.' };
        }
        const account = get().registeredAccounts.find((a) => a.email === normalizedEmail);
        if (!account) {
          return { ok: false, error: 'Conta não localizada.' };
        }
        const updatedAccount: UserAccount = {
          ...account,
          passwordHash: newPassword,
        };
        set((state) => ({
          registeredAccounts: state.registeredAccounts.map((a) =>
            a.id === account.id ? updatedAccount : a,
          ),
          currentUser: updatedAccount,
        }));
        return { ok: true };
      },

      logoutAccount: () => set({ currentUser: null }),
    }),
    {
      name: 'bv-tasks-storage',
      storage: createJSONStorage(() => safeLocalStorage),
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
