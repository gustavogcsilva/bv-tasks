import { useEffect, useMemo, useState } from 'react';
import { format, isSameDay, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from './components/ui/Button';
import { Logo } from './components/ui/Logo';
import { AuthScreen } from './features/auth/components/AuthScreen';
import { CalendarStrip } from './features/calendar/components/CalendarStrip';
import { FolderManager } from './features/folders/components/FolderManager';
import { TaskItem } from './features/tasks/components/TaskItem';
import { TaskModal } from './features/tasks/components/TaskModal';
import { SCOPE_CONFIG, type TaskDraft } from './features/tasks/types/task.types';
import { useOnlineStatus } from './pwa/registerServiceWorker';
import {
  getNotificationPermission,
  requestNotificationPermission,
  sendTaskNotification,
  syncTasksWithPhoneCalendar,
} from './services/notificationsAndCalendar';
import { sortTasks, useTaskStore } from './stores/useTaskStore';

export function BVTasksApp() {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());
  const isOnline = useOnlineStatus();

  const theme = useTaskStore((state) => state.theme);
  const toggleTheme = useTaskStore((state) => state.toggleTheme);
  const currentUser = useTaskStore((state) => state.currentUser);
  const logoutAccount = useTaskStore((state) => state.logoutAccount);

  const tasks = useTaskStore((state) => state.tasks);
  const folders = useTaskStore((state) => state.folders);
  const selectedDateKey = useTaskStore((state) => state.selectedDate);
  const scopeFilter = useTaskStore((state) => state.scopeFilter);
  const selectedFolderId = useTaskStore((state) => state.selectedFolderId);
  const selectedDate = parseISO(selectedDateKey);

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

  // Sincroniza a classe .dark no elemento <html> para alternância Claro / Escuro
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', theme === 'dark');
    }
  }, [theme]);

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
          .filter((task) => isSameDay(parseISO(task.date), selectedDate))
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

  async function handleEnableNotifications() {
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? 'granted' : getNotificationPermission());
  }

  function createTask(
    draft: TaskDraft,
    options?: { syncWithPhoneCalendar?: boolean; notifyOnPhone?: boolean },
  ) {
    const created = addTask(draft);
    setIsModalVisible(false);

    if (options?.notifyOnPhone) {
      void sendTaskNotification(created, 'Nova Tarefa Agendada');
    }
    if (options?.syncWithPhoneCalendar) {
      syncTasksWithPhoneCalendar([created], `bv-task-${created.date}.ics`);
    }
  }

  return (
    <div className="min-h-dvh w-full bg-[#F8F7F4] text-[#0F0F12] transition-colors duration-200 dark:bg-[#09090B] dark:text-[#F4F4F5]">
      <div className="safe-area-container mx-auto flex min-h-dvh w-full max-w-6xl flex-col">
        {/* Cabeçalho Principal B V Tasks (Vermelho Vinho e Preto + Claro/Escuro) */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3 pt-1">
          <Logo size="md" showText />

          <div className="flex flex-wrap items-center gap-2">
            {!isOnline && (
              <span
                role="status"
                className="inline-flex items-center gap-1 rounded-full bg-[#FEF2F2] px-2.5 py-1 text-[11px] font-bold text-[#991B1B] dark:bg-[#3B1219] dark:text-[#FCA5A5]"
              >
                ● Offline
              </span>
            )}

            {/* Botão Claro / Escuro */}
            <button
              type="button"
              onClick={toggleTheme}
              aria-label="Alternar tema claro ou escuro"
              className="flex h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#E5E4E0] bg-white px-3 text-[12px] font-bold text-[#0F0F12] transition-colors hover:bg-[#F1EFEA] active:scale-95 dark:border-[#27272A] dark:bg-[#141418] dark:text-[#FAFAFA]"
            >
              <span>{theme === 'dark' ? '☀️ Claro' : '🌙 Escuro'}</span>
            </button>

            {/* Botão de Ativar Notificações no Celular */}
            {notifPermission !== 'granted' && notifPermission !== 'unsupported' && (
              <button
                type="button"
                onClick={handleEnableNotifications}
                className="flex h-[40px] cursor-pointer items-center gap-1.5 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 text-[12px] font-bold text-[#991B1B] transition-colors hover:bg-[#FEE2E2] active:scale-95 dark:border-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]"
              >
                🔔 Ativar Alertas
              </button>
            )}

            {/* Perfil do Usuário Autenticado */}
            <div className="hidden items-center gap-2 rounded-xl border border-[#E5E4E0] bg-white px-3 py-1.5 sm:flex dark:border-[#27272A] dark:bg-[#141418]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#991B1B] text-[11px] font-extrabold text-white">
                {currentUser.name.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[140px] truncate text-[12px] font-bold text-[#0F0F12] dark:text-[#FAFAFA]">
                {currentUser.name}
              </span>
              <button
                type="button"
                onClick={logoutAccount}
                title="Sair ou trocar de conta"
                className="ml-1 cursor-pointer text-[11px] font-semibold text-[#71717A] hover:text-[#B91C1C] dark:text-[#A1A1AA]"
              >
                Sair
              </button>
            </div>

            <button
              type="button"
              aria-label="Adicionar tarefa"
              onClick={() => setIsModalVisible(true)}
              className="flex h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-[14px] bg-gradient-to-r from-[#0F0F12] via-[#450A0A] to-[#991B1B] px-4 text-[14px] font-bold text-white shadow-md shadow-[#7F1D1D]/25 transition-all hover:opacity-95 active:scale-95"
            >
              <span className="text-[20px] leading-none font-normal">＋</span>
              <span>Nova tarefa</span>
            </button>
          </div>
        </header>

        {/* Layout Responsivo: Lado Esquerdo (Calendário + Pastas) | Lado Direito (Agenda e Tarefas) */}
        <main className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[380px_1fr] xl:grid-cols-[410px_1fr]">
          {/* Coluna Esquerda: Calendário com Cores por Escopo + Gerenciador de Pastas */}
          <aside className="flex flex-col gap-5">
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
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-serif text-[23px] font-bold text-[#0F0F12] dark:text-[#FAFAFA]">
                  Agenda
                </h2>
                <p className="mt-0.5 text-[13px] text-[#71717A] capitalize dark:text-[#A1A1AA]">
                  {dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {visibleTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      syncTasksWithPhoneCalendar(
                        visibleTasks,
                        `bv-tasks-${selectedDateKey}.ics`,
                      )
                    }
                    className="cursor-pointer rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-3 py-1.5 text-[11px] font-bold text-[#0F0F12] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#FAFAFA]"
                  >
                    📲 Sincronizar Dia no Celular (.ics)
                  </button>
                )}
                <span className="rounded-xl bg-[#F1EFEA] px-3 py-1.5 text-[12px] font-bold text-[#27272A] dark:bg-[#27272A] dark:text-[#E4E4E7]">
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

            {/* Lista de Tarefas ou Estado Vazio */}
            <div className="flex flex-1 flex-col pt-0.5">
              {visibleTasks.length === 0 ? (
                <div className="my-auto flex flex-col items-center gap-3 px-6 py-12 text-center">
                  <div className="flex h-[58px] w-[58px] items-center justify-center rounded-[20px] bg-[#FEE2E2] text-[26px] font-bold text-[#991B1B] dark:bg-[#3B1219] dark:text-[#FCA5A5]">
                    ✓
                  </div>
                  <h3 className="font-serif text-[19px] font-bold text-[#0F0F12] dark:text-[#FAFAFA]">
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

        <TaskModal
          visible={isModalVisible}
          selectedDate={selectedDate}
          folders={folders}
          defaultFolderId={selectedFolderId === 'all' ? '' : selectedFolderId}
          onClose={() => setIsModalVisible(false)}
          onSubmit={createTask}
        />
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
