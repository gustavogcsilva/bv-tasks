export type Priority = 'high' | 'medium' | 'low';

export type Scope = 'work' | 'personal' | 'study';

export type ThemeMode = 'light' | 'dark';

export interface TaskAttachment {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  mimeType: string;
  dataUrl: string;
  size: number;
  createdAt: string;
}

export interface TaskFolder {
  id: string;
  name: string;
  scope?: Scope;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  date: string;
  time?: string;
  priority: Priority;
  scope: Scope;
  folderId?: string;
  attachments?: TaskAttachment[];
  notified?: boolean;
  isCompleted: boolean;
  createdAt: string;
}

export type TaskDraft = Omit<Task, 'id' | 'isCompleted' | 'createdAt'>;

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  recoveryKeyword?: string;
  provider?: 'email' | 'google';
  avatarUrl?: string;
  googleId?: string;
  createdAt: string;
}

export const SCOPE_CONFIG: Record<
  Scope,
  {
    label: string;
    color: string;
    bgLight: string;
    borderLight: string;
    dotClass: string;
  }
> = {
  work: {
    label: 'Trabalho',
    color: '#991B1B', // Vermelho Vinho (Bordeaux)
    bgLight: '#FEE2E2',
    borderLight: '#FECACA',
    dotClass: 'bg-[#991B1B]',
  },
  personal: {
    label: 'Pessoal',
    color: '#2563EB', // Azul Executivo
    bgLight: '#DBEAFE',
    borderLight: '#BFDBFE',
    dotClass: 'bg-[#2563EB]',
  },
  study: {
    label: 'Estudo',
    color: '#DB2777', // Rosa Rosé
    bgLight: '#FCE7F3',
    borderLight: '#FBCFE8',
    dotClass: 'bg-[#DB2777]',
  },
};
