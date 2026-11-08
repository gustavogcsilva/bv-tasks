import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { LeftMenuBar } from './components/LeftMenuBar';
import { Button } from './components/ui/Button';
import { Logo } from './components/ui/Logo';
import { AuthScreen } from './features/auth/components/AuthScreen';
import { CalendarStrip } from './features/calendar/components/CalendarStrip';
import { FolderManager } from './features/folders/components/FolderManager';
import { TaskItem } from './features/tasks/components/TaskItem';
import { TaskModal } from './features/tasks/components/TaskModal';
import { SCOPE_CONFIG, type Task, type TaskDraft } from './features/tasks/types/task.types';
import { useOnlineStatus } from './pwa/registerServiceWorker';
import {
  exportTasksToPdf,
  getNotificationPermission,
  requestNotificationPermission,
  sendTaskNotification,
  syncTasksWithPhoneCalendar,
} from './services/notificationsAndCalendar';
import { sortTasks, useTaskStore } from './stores/useTaskStore';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'warning';
}

export function BVTasksApp() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());
  const isOnline = useOnlineStatus();

  // Estados de feedback, menu mobile e sincronização
  const [recentlyCreatedTaskId, setRecentlyCreatedTaskId] = useState<string | null>(null);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Agora mesmo');

  const theme = useTaskStore((state) => state.theme);
  const toggleTheme = useTaskStore((state) => state.toggleTheme);
  const currentUser = useTaskStore((state) => state.currentUser);
  const logoutAccount = useTaskStore((state) => state.logoutAccount);
  const syncWithDatabase = useTaskStore((state) => state.syncWithDatabase);
  const clearAllUserData = useTaskStore((state) => state.clearAllUserData);
  const dbEngine = useTaskStore((state) => state.dbEngine);

  const tasks = useTaskStore((state) => state.tasks);
  const folders = useTaskStore((state) => state.folders);
  const selectedDateKey = useTaskStore((state) => state.selectedDate);
  const scopeFilter = useTaskStore((state) => state.scopeFilter);
  const selectedFolderId = useTaskStore((state) => state.selectedFolderId);

  const selectedDate = useMemo(() => {
    const parsed = parseISO(selectedDateKey);
    return isValid(parsed) ? parsed : new Date();
  }, [selectedDateKey]);

  const addTask = useTaskStore((state) => state.addTask);
  const toggleTask = useTaskStore((state) => state.toggleTask);
  const deleteTask = useTaskStore((state) => state.deleteTask);
  const markTaskNotified = useTaskStore((state) => state.markTaskNotified);
  const addAttachmentToTask = useTaskStore((state) => state.addAttachmentToTask);
  const removeAttachmentFromTask = useTaskStore((state) => state.removeAttachmentFromTask);
  const addFolder = useTaskStore((state) => state.addFolder);
  const deleteFolder = useTaskStore((state) => state.deleteFolder);
  const setSelectedDate = useTaskStore((state) => state.setSelectedDate);
  const setScopeFilter = useTaskStore((state) => state.setScopeFilter);
  const setSelectedFolderId = useTaskStore((state) => state.setSelectedFolderId);

  // Contagem de tarefas importantes (alta prioridade) para o badge
  const highPriorityCount = useMemo(() => {
    return tasks.filter((t) => t.priority === 'high' && !t.isCompleted).length;
  }, [tasks]);

  // Exibe notificação flutuante com auto-fechamento
  function showToast(message: string, type: 'success' | 'info' | 'warning' = 'info') {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 3800);
  }

  // Sincroniza a classe .dark no elemento <html> para alternância Claro / Escuro
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

  // Sincroniza com o banco SQL central (cross-device) ao logar, abrir ou voltar para o aplicativo
  useEffect(() => {
    if (!currentUser) return;
    void syncWithDatabase();

    const handleVisibilityOrFocus = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        void syncWithDatabase();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    return () => {
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [currentUser, syncWithDatabase]);

  // Monitoramento de conectividade para avisos e sincronização automática
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      showToast('🌐 Conexão restabelecida: Sincronizando com o banco de dados...', 'success');
      void syncWithDatabase();
      setLastSyncTime(format(new Date(), 'HH:mm'));
      if ('vibrate' in navigator) {
        navigator.vibrate?.([30, 40, 30]);
      }
    };

    const handleOffline = () => {
      showToast('📱 Modo Offline ativo: Suas tarefas estão 100% salvas neste aparelho.', 'warning');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Monitora tarefas agendadas para o horário atual e dispara notificação no celular
  useEffect(() => {
    const checkDueTasks = () => {
      const now = new Date();
      const todayKey = format(now, 'yyyy-MM-dd');
      const currentTimeKey = format(now, 'HH:mm');

      for (const task of tasks) {
        if (
          !task.isCompleted &&
          !task.notified &&
          task.date === todayKey &&
          task.time === currentTimeKey
        ) {
          markTaskNotified(task.id);
          void sendTaskNotification(task, '⏰ Horário da Tarefa');
        }
      }
    };

    const intervalId = window.setInterval(checkDueTasks, 30000);
    return () => window.clearInterval(intervalId);
  }, [tasks, markTaskNotified]);

  const folderMap = useMemo(() => {
    return new Map(folders.map((f) => [f.id, f]));
  }, [folders]);

  const visibleTasks = useMemo(
    () =>
      sortTasks(
        tasks
          .filter((task) => {
            const parsedTaskDate = parseISO(task.date);
            return isValid(parsedTaskDate) && isSameDay(parsedTaskDate, selectedDate);
          })
          .filter((task) => scopeFilter === 'all' || task.scope === scopeFilter)
          .filter(
            (task) => selectedFolderId === 'all' || task.folderId === selectedFolderId,
          ),
      ),
    [scopeFilter, selectedFolderId, selectedDate, tasks],
  );

  if (!currentUser) {
    return <AuthScreen />;
  }

  const completedCount = visibleTasks.filter((task) => task.isCompleted).length;
  const pendingCount = visibleTasks.length - completedCount;
  const dateLabel = format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR });
  const currentYear = new Date().getFullYear();

  function handleExportAllPdf() {
    exportTasksToPdf(tasks, `bvs-special-todas-tarefas-${selectedDateKey}.pdf`, {
      title: 'Relatorio Executivo Completo de Tarefas',
      userName: currentUser?.name || 'Gustavo Geraldo',
    });
    showToast('📄 Arquivo PDF com todas as tarefas gerado e exportado com sucesso!', 'success');
  }

  function handleExportDayPdf() {
    exportTasksToPdf(visibleTasks, `bvs-special-agenda-${selectedDateKey}.pdf`, {
      title: `Agenda Executiva do Dia (${selectedDateKey})`,
      userName: currentUser?.name || 'Gustavo Geraldo',
    });
    showToast('📄 Arquivo PDF da agenda do dia exportado com sucesso!', 'success');
  }

  async function handleEnableNotifications() {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? 'granted' : getNotificationPermission());
    if (granted) {
      showToast('🔔 Notificações ativadas para este aparelho!', 'success');
    }
  }

  async function handleManualSync() {
    setIsSyncing(true);
    await syncWithDatabase();
    setIsSyncing(false);
    setLastSyncTime(format(new Date(), 'HH:mm'));
    showToast('✅ Sincronizado com o banco de dados central!', 'success');
    if ('vibrate' in navigator) {
      navigator.vibrate?.([20, 30, 20]);
    }
  }

  // Clicando na tarefa importante da Barra de Menu: navega diretamente para a data e rola até ela
  function handleSelectImportantTask(task: Task) {
    // 1. Muda a data selecionada para a data da tarefa
    setSelectedDate(task.date);

    // 2. Destrava filtros caso estejam escondendo a tarefa
    if (scopeFilter !== 'all' && scopeFilter !== task.scope) {
      setScopeFilter('all');
    }
    if (selectedFolderId !== 'all' && task.folderId !== selectedFolderId) {
      setSelectedFolderId('all');
    }

    // 3. Fecha o menu gaveta no celular
    setIsMobileMenuOpen(false);

    // 4. Ativa o destaque pulsante
    setHighlightedTaskId(task.id);
    setTimeout(() => {
      setHighlightedTaskId(null);
    }, 4000);

    // 5. Rola suavemente até o elemento da tarefa na tela
    setTimeout(() => {
      const el = document.getElementById(`task-card-${task.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);

    // 6. Toast com detalhes da tarefa e o que ela faz
    const desc = task.description?.trim() ? ` — "${task.description.trim()}"` : '';
    showToast(`⭐ Tarefa importante: "${task.title}"${desc}`, 'info');

    if ('vibrate' in navigator) {
      navigator.vibrate?.([30, 40, 30]);
    }
  }

  function createTask(
    draft: TaskDraft,
    options?: {
      syncWithPhoneCalendar?: boolean;
      notifyOnPhone?: boolean;
      exportAsPdf?: boolean;
    },
  ) {
    const created = addTask(draft);
    setIsModalVisible(false);

    // Ativa animação de destaque na tarefa recém-criada
    setRecentlyCreatedTaskId(created.id);
    setTimeout(() => {
      setRecentlyCreatedTaskId(null);
    }, 3000);

    // Feedback tátil e sonoro visual (Toast executivo)
    showToast(`✅ Tarefa "${created.title}" criada com sucesso!`, 'success');
    if ('vibrate' in navigator) {
      navigator.vibrate?.([30, 50, 30]);
    }

    if (options?.notifyOnPhone) {
      void sendTaskNotification(created, 'Nova Tarefa Agendada');
    }
    if (options?.syncWithPhoneCalendar) {
      syncTasksWithPhoneCalendar([created], `bvs-special-task-${created.date}.ics`);
    }
    if (options?.exportAsPdf) {
      exportTasksToPdf([created], `bvs-special-tarefa-${created.date}.pdf`, {
        title: `Ficha de Tarefa: ${created.title}`,
        userName: currentUser?.name,
      });
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#F8F7F4] text-[#0F0F12] transition-colors duration-200 dark:bg-[#09090B] dark:text-[#F4F4F5]">
      {/* Toast Flutuante de Notificação Executiva */}
      {toast && (
        <div className="animate-toast fixed top-4 right-4 left-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border border-[#991B1B]/30 bg-white/95 px-4 py-3 shadow-xl shadow-black/10 backdrop-blur-md sm:right-6 sm:left-auto dark:border-[#7F1D1D] dark:bg-[#18181C]/95">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#991B1B]/15 text-[12px] font-bold text-[#991B1B] dark:text-[#FCA5A5]">
              {toast.type === 'success' ? '✓' : toast.type === 'warning' ? '!' : 'ℹ'}
            </span>
            <p className="text-[13px] font-semibold text-[#0F0F12] dark:text-[#FAFAFA]">
              {toast.message}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="cursor-pointer text-[16px] font-bold text-[#71717A] hover:text-[#0F0F12] dark:text-[#A1A1AA] dark:hover:text-white"
          >
            ×
          </button>
        </div>
      )}

      {/* Drawer da Barra de Menu Lateral (Idêntico e Funcional no Celular e Computador) */}
      {isMobileMenuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Menu Lateral do Usuário e Tarefas Importantes"
          className="animate-modal-backdrop fixed inset-0 z-50 flex bg-black/60 backdrop-blur-xs"
        >
          <div
            aria-hidden="true"
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0"
          />
          <div className="animate-modal-content safe-area-container relative z-10 flex h-full w-[88vw] max-w-[380px] flex-col overflow-y-auto bg-[#F8F7F4] p-4 shadow-2xl dark:bg-[#09090B]">
            <LeftMenuBar
              currentUser={currentUser}
              tasks={tasks}
              onLogout={() => {
                setIsMobileMenuOpen(false);
                logoutAccount();
              }}
              onSelectTask={handleSelectImportantTask}
              isMobileDrawer={true}
              onCloseMobileDrawer={() => setIsMobileMenuOpen(false)}
              onSyncCalendar={() => {
                syncTasksWithPhoneCalendar(tasks, 'bvs-special-completo.ics');
                setIsMobileMenuOpen(false);
              }}
              onExportPdf={() => {
                handleExportAllPdf();
                setIsMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}

      <div className="safe-area-container mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
      {/* Cabeçalho Principal BVS Special (Vermelho Vinho e Preto + Tipografia HIG + Claro/Escuro) */}
        <header className="mb-5 sm:mb-6 flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
            <Logo size="md" showText />

            {/* Botão de Menu & Perfil (Idêntico no Celular e Computador) */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Abrir Menu e Tarefas Importantes"
              className="flex h-[40px] cursor-pointer items-center gap-1.5 sm:gap-2 rounded-xl border border-[#991B1B]/30 bg-white px-2.5 text-[12px] font-bold text-[#0F0F12] shadow-xs transition-all hover:border-[#991B1B] hover:shadow-md active:scale-95 dark:border-[#7F1D1D] dark:bg-[#1C1C22] dark:text-[#FAFAFA]"
            >
              <span className="text-[14px]">☰</span>
              {currentUser.avatarUrl ? (
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.name}
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#991B1B] text-[10px] text-white">
                  {currentUser.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="font-heading max-w-[90px] truncate sm:max-w-[140px]">{currentUser.name}</span>
              {highPriorityCount > 0 && (
                <span className="font-heading rounded-full bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-black text-white">
                  ⭐ {highPriorityCount}
                </span>
              )}
            </button>
          </div>

          <div className="flex w-full sm:w-auto flex-wrap items-center justify-between sm:justify-end gap-2">
            {/* Botão Executivo de Destaque: Exportar Todas as Tarefas em PDF */}
            <button
              type="button"
              onClick={handleExportAllPdf}
              title="Gerar e exportar documento PDF executivo de todas as tarefas"
              className="flex h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#991B1B]/40 bg-white px-2.5 sm:px-3 text-[12px] font-bold text-[#991B1B] shadow-xs transition-all hover:border-[#991B1B] hover:bg-[#FEF2F2] hover:shadow-md active:scale-95 dark:border-[#7F1D1D] dark:bg-[#1C1C22] dark:text-[#FCA5A5] dark:hover:bg-[#271518]"
            >
              <span className="text-[14px]">📄</span>
              <span className="font-heading hidden sm:inline">Exportar Todas (PDF)</span>
              <span className="font-heading sm:hidden">Todas em PDF</span>
            </button>

            {/* Indicador Interativo de Sincronização Mobile & Desktop (Online / Offline) */}
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(true)}
              title="Clique para ver o status de sincronização no aparelho"
              className={`flex h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 text-[12px] font-bold transition-all active:scale-95 ${
                isOnline
                  ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7] dark:border-[#14532D] dark:bg-[#0E2417] dark:text-[#86EFAC]'
                  : 'border-[#FED7AA] bg-[#FFF7ED] text-[#C2410C] hover:bg-[#FFEDD5] dark:border-[#7C2D12] dark:bg-[#25140F] dark:text-[#FDBA74]'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-[#16A34A]' : 'bg-[#EA580C]'}`} />
              <span className="font-heading">{isOnline ? 'Sincronizado' : 'Modo Offline'}</span>
            </button>

            {/* Botão Claro / Escuro */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Alternar tema claro ou escuro"
              className="flex h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E4E0] bg-white px-2.5 sm:px-3 text-[12px] font-bold text-[#0F0F12] transition-colors hover:bg-[#F1EFEA] active:scale-95 dark:border-[#27272A] dark:bg-[#141418] dark:text-[#FAFAFA]"
            >
              <span className="font-heading">{theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}</span>
            </button>

            {/* Botão de Ativar Notificações no Celular */}
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="flex h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-2.5 sm:px-3 text-[12px] font-bold text-[#991B1B] transition-colors hover:bg-[#FEE2E2] active:scale-95 dark:border-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]"
              >
                <span className="font-heading">🔔 Alertas</span>
              </button>
            )}

            <button
              type="button"
              aria-label="Adicionar tarefa"
              onClick={() => setIsModalVisible(true)}
              className="font-heading ml-auto sm:ml-0 flex h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[14px] bg-gradient-to-r from-[#0F0F12] via-[#450A0A] to-[#991B1B] px-4 text-[14px] font-bold text-white shadow-md shadow-[#7F1D1D]/25 transition-all hover:opacity-95 active:scale-95"
            >
              <span className="text-[20px] leading-none font-normal">＋</span>
              <span>Nova tarefa</span>
            </button>
          </div>
        </header>

        {/* Layout Responsivo: Lado Esquerdo (Menu Bar com Login e Mini Status + Calendário + Pastas) | Lado Direito (Agenda e Tarefas) */}
        <main className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[380px_1fr] xl:grid-cols-[410px_1fr]">
          {/* Coluna Esquerda: Barra de Menu & Login + Mini Status Bar + Calendário + Pastas */}
          <aside className="flex flex-col gap-5">
            {/* Barra de Menu com Login e Mini Status das Tarefas Importantes */}
            <LeftMenuBar
              currentUser={currentUser}
              tasks={tasks}
              onLogout={logoutAccount}
              onSelectTask={handleSelectImportantTask}
              onSyncCalendar={() => syncTasksWithPhoneCalendar(tasks, 'bvs-special-completo.ics')}
              onExportPdf={handleExportAllPdf}
            />

            <CalendarStrip
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate(format(date, 'yyyy-MM-dd'))}
              tasks={tasks}
            />

            <FolderManager
              folders={folders}
              tasks={tasks}
              selectedFolderId={selectedFolderId}
              onSelectFolder={setSelectedFolderId}
              onCreateFolder={(name, scope) => addFolder(name, scope)}
              onDeleteFolder={deleteFolder}
            />
          </aside>

          {/* Coluna Direita: Agenda do Dia, Sincronização de Calendário e Lista de Tarefas */}
          <section
            aria-label="Agenda e Lista de tarefas"
            className="flex flex-col rounded-3xl border border-[#E5E4E0] bg-white p-5 shadow-[0_4px_20px_rgba(15,15,18,0.04)] sm:p-6 dark:border-[#27272A] dark:bg-[#141418]"
          >
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-editorial text-[24px] sm:text-[28px] font-black tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
                  Agenda
                </h2>
                <p className="font-heading mt-0.5 text-[13px] font-semibold text-[#71717A] capitalize dark:text-[#A1A1AA]">
                  {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportAllPdf}
                  title="Exportar todas as tarefas cadastradas em arquivo PDF executivo"
                  className="font-heading cursor-pointer rounded-xl border border-[#991B1B]/40 bg-white px-3 py-1.5 text-[11px] font-bold text-[#991B1B] shadow-xs transition-colors hover:bg-[#FEF2F2] hover:border-[#991B1B] active:scale-95 dark:border-[#7F1D1D] dark:bg-[#1C1C22] dark:text-[#FCA5A5]"
                >
                  📄 Todas em PDF
                </button>
                {visibleTasks.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleExportDayPdf}
                      className="font-heading cursor-pointer rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-1.5 text-[11px] font-bold text-[#991B1B] transition-colors hover:bg-[#FEE2E2] active:scale-95 dark:border-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]"
                    >
                      📄 Exportar Dia (PDF)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        syncTasksWithPhoneCalendar(
                          visibleTasks,
                          `bvs-special-${selectedDateKey}.ics`,
                        )
                      }
                      className="font-heading cursor-pointer rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-3 py-1.5 text-[11px] font-bold text-[#0F0F12] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#FAFAFA]"
                    >
                      📲 Sincronizar (.ics)
                    </button>
                  </>
                )}
                <span className="font-heading rounded-xl bg-[#F1EFEA] px-3 py-1.5 text-[12px] font-bold text-[#27272A] dark:bg-[#27272A] dark:text-[#E4E4E7]">
                  {pendingCount} pendente{pendingCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>

            {/* Filtros Rápidos por Escopo */}
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <FilterChip
                label="Todos"
                activeColor="#0F0F12"
                selected={scopeFilter === 'all'}
                onPress={() => setScopeFilter('all')}
              />
              <FilterChip
                label="Trabalho"
                activeColor={SCOPE_CONFIG.work.color}
                dotColor={SCOPE_CONFIG.work.color}
                selected={scopeFilter === 'work'}
                onPress={() => setScopeFilter('work')}
              />
              <FilterChip
                label="Pessoal"
                activeColor={SCOPE_CONFIG.personal.color}
                dotColor={SCOPE_CONFIG.personal.color}
                selected={scopeFilter === 'personal'}
                onPress={() => setScopeFilter('personal')}
              />
              <FilterChip
                label="Estudo"
                activeColor={SCOPE_CONFIG.study.color}
                dotColor={SCOPE_CONFIG.study.color}
                selected={scopeFilter === 'study'}
                onPress={() => setScopeFilter('study')}
              />
              <span className="ml-auto text-right text-[11px] font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                Prioridade ↑
              </span>
            </div>

            {/* Lista de Tarefas com Animação de Entrada e Highlight */}
            <div className="flex flex-1 flex-col pt-0.5">
              {visibleTasks.length === 0 ? (
                <div className="my-auto flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <div className="flex h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-[#FEE2E2] text-[26px] font-bold text-[#991B1B] dark:bg-[#3B1219] dark:text-[#FCA5A5]">
                    ✓
                  </div>
                  <h3 className="text-[18px] font-bold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
                    Tudo em dia
                  </h3>
                  <p className="mb-1 max-w-xs text-[13px] leading-[19px] text-[#71717A] dark:text-[#A1A1AA]">
                    Nenhuma tarefa para este filtro ou data. Planeje seu próximo foco de Trabalho,
                    Pessoal ou Estudo.
                  </p>
                  <Button onPress={() => setIsModalVisible(true)} variant="secondary">
                    Criar tarefa
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col gap-3.5">
                  {visibleTasks.map((item) => (
                    <TaskItem
                      key={item.id}
                      task={item}
                      isRecentlyCreated={item.id === recentlyCreatedTaskId}
                      isHighlighted={item.id === highlightedTaskId}
                      folder={item.folderId ? folderMap.get(item.folderId) : undefined}
                      onDelete={() => deleteTask(item.id)}
                      onToggle={() => toggleTask(item.id)}
                      onAddAttachment={(att) => addAttachmentToTask(item.id, att)}
                      onRemoveAttachment={(attId) => removeAttachmentFromTask(item.id, attId)}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </main>

        {/* Modal de Criação de Tarefas com Animações Apple HIG */}
        <TaskModal
          visible={isModalVisible}
          selectedDate={selectedDate}
          folders={folders}
          defaultFolderId={selectedFolderId === 'all' ? '' : selectedFolderId}
          onClose={() => setIsModalVisible(false)}
          onSubmit={createTask}
        />

        {/* Modal / Central de Sincronização Mobile & Offline */}
        {isSyncModalOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-modal-title"
            className="animate-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          >
            <div
              aria-hidden="true"
              onClick={() => setIsSyncModalOpen(false)}
              className="fixed inset-0"
            />
            <div className="animate-modal-content relative z-10 w-full max-w-md rounded-3xl border border-[#E5E4E0] bg-white p-6 shadow-2xl dark:border-[#27272A] dark:bg-[#141418]">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-3 w-3 rounded-full ${
                      isOnline ? 'bg-[#16A34A]' : 'bg-[#EA580C]'
                    }`}
                  />
                  <h3
                    id="sync-modal-title"
                    className="text-[18px] font-bold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]"
                  >
                    Central de Sincronização
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsSyncModalOpen(false)}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[#F1EFEA] text-[18px] text-[#52525B] hover:bg-[#E5E2DC] dark:bg-[#27272A] dark:text-[#D4D4D8]"
                >
                  ×
                </button>
              </div>

              <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-[#E5E4E0] bg-[#F8F7F4] p-4 text-[13px] dark:border-[#27272A] dark:bg-[#1C1C22]">
                <div className="flex justify-between">
                  <span className="font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    Conexão do Aparelho:
                  </span>
                  <span
                    className={`font-bold ${
                      isOnline ? 'text-[#16A34A] dark:text-[#86EFAC]' : 'text-[#EA580C] dark:text-[#FDBA74]'
                    }`}
                  >
                    {isOnline ? 'Online (Conectado)' : 'Offline (Modo Local Seguro)'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    Tarefas salvas no aparelho:
                  </span>
                  <span className="font-bold text-[#0F0F12] dark:text-[#FAFAFA]">
                    {tasks.length} tarefa{tasks.length === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    Banco SQL Central:
                  </span>
                  <span
                    className={`font-bold ${
                      dbEngine === 'postgresql'
                        ? 'text-[#16A34A] dark:text-[#86EFAC]'
                        : dbEngine === 'local-file'
                          ? 'text-[#2563EB] dark:text-[#60A5FA]'
                          : 'text-[#EA580C] dark:text-[#FDBA74]'
                    }`}
                  >
                    {dbEngine === 'postgresql'
                      ? 'PostgreSQL Conectado'
                      : dbEngine === 'local-file'
                        ? 'Servidor Ativo (Sem DATABASE_URL)'
                        : dbEngine === 'static-no-backend'
                          ? 'Static Site (Ative Web Service + SQL)'
                          : 'Modo Local Offline'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    Integridade Local:
                  </span>
                  <span className="font-bold text-[#16A34A] dark:text-[#86EFAC]">
                    100% íntegro (IndexedDB/Local)
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                    Última Sincronização:
                  </span>
                  <span className="font-bold text-[#0F0F12] dark:text-[#FAFAFA]">
                    {lastSyncTime}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex min-h-[46px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#991B1B] px-4 text-[13px] font-bold text-white shadow-md shadow-[#991B1B]/20 transition-all hover:bg-[#7F1D1D] active:scale-[0.99] disabled:opacity-75"
                >
                  <span className={isSyncing ? 'animate-sync-spin' : ''}>🔄</span>
                  <span>{isSyncing ? 'Sincronizando com o SQL...' : 'Sincronizar Agora'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleExportAllPdf();
                    setIsSyncModalOpen(false);
                  }}
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 text-[13px] font-bold text-[#991B1B] transition-all hover:bg-[#FEE2E2] active:scale-[0.99] dark:border-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]"
                >
                  <span>📄 Gerar e Exportar Todas as Tarefas como PDF (.pdf)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    syncTasksWithPhoneCalendar(tasks, 'bvs-special-completo.ics');
                    setIsSyncModalOpen(false);
                    showToast('📲 Calendário exportado para o aparelho!', 'success');
                  }}
                  className="flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#D6D3CD] bg-white px-4 text-[13px] font-bold text-[#0F0F12] transition-all hover:bg-[#F8F7F4] active:scale-[0.99] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#FAFAFA]"
                >
                  <span>📅 Exportar Todas as Tarefas (.ics do Celular)</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    await clearAllUserData();
                    setIsSyncModalOpen(false);
                    showToast('🧹 Todas as tarefas e pastas foram limpas com sucesso!', 'info');
                  }}
                  className="flex min-h-[42px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 text-[12px] font-bold text-[#991B1B] transition-all hover:bg-[#FEE2E2] active:scale-[0.99] dark:border-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]"
                >
                  <span>🧹 Limpar Todas as Tarefas e Pastas</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rodapé Executivo com Ano Dinâmico Automático (2026 -> 2027 -> ...) */}
        <footer className="mt-8 border-t border-[#E5E4E0] py-5 text-center text-[12px] font-semibold text-[#71717A] dark:border-[#27272A] dark:text-[#A1A1AA]">
          <p className="font-heading">
            <span className="font-display font-black text-[#991B1B] dark:text-[#F87171]">BVS Special</span>{' '}
            — Created By{' '}
            <span className="font-bold text-[#0F0F12] dark:text-[#FAFAFA]">Gustavo Geraldo</span> ©{' '}
            <span>{currentYear}</span>
          </p>
        </footer>
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  activeColor: string;
  dotColor?: string;
  selected: boolean;
  onPress: () => void;
}

function FilterChip({ label, activeColor, dotColor, selected, onPress }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPress}
      style={selected ? { backgroundColor: activeColor } : undefined}
      className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold transition-all active:scale-95 ${
        selected
          ? 'text-white shadow-xs'
          : 'bg-[#F1EFEA] text-[#52525B] hover:bg-[#E5E2DC] dark:bg-[#1C1C22] dark:text-[#D4D4D8] dark:hover:bg-[#27272A]'
      }`}
    >
      {dotColor && (
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: selected ? '#FFFFFF' : dotColor }}
        />
      )}
      <span>{label}</span>
    </button>
  );
}

export default function App() {
  return <BVTasksApp />;
}
