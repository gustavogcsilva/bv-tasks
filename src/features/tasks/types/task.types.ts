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

export interface BulkImportRow {
  rowNumber: number;
  title: string;
  description?: string;
  date: string;
  time?: string;
  scope: Scope;
  priority: Priority;
  rawDate?: string;
  rawCategory?: string;
  rawPriority?: string;
  isValid: boolean;
  errors: string[];
}

export interface MonthlyScopeStats {
  total: number;
  completed: number;
  pending: number;
}

export interface MonthlyReviewStats {
  month: string;
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
  highPriorityPending: number;
  bottleneckScope: string | null;
  byScope: Record<Scope, MonthlyScopeStats>;
}

export interface SuggestedMonthlyTask {
  title: string;
  description?: string;
  date: string;
  time?: string;
  priority: Priority;
  scope: Scope;
}

export interface MonthlyReviewPayload {
  diagnostico: string;
  proximosPassos: string[];
  tarefasSugeridasProximoMes: SuggestedMonthlyTask[];
}

export interface MonthlyReviewResponse {
  ok: boolean;
  month?: string;
  nextMonth?: string;
  stats?: MonthlyReviewStats;
  pendingTasksCount?: number;
  pendingTaskIds?: string[];
  review?: MonthlyReviewPayload;
  missingApiKey?: boolean;
  offline?: boolean;
  error?: string;
}

export interface AssistantSuggestedTask {
  title: string;
  description?: string;
  date: string;
  time?: string;
  category: 'Trabalho' | 'Pessoal' | 'Estudo' | string;
  scope: Scope;
  priority: Priority;
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  suggestedTasks?: AssistantSuggestedTask[];
  applied?: boolean;
}

export interface AssistantResponse {
  ok: boolean;
  reply?: string;
  suggestedTasks?: AssistantSuggestedTask[];
  missingApiKey?: boolean;
  offline?: boolean;
  error?: string;
}

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
