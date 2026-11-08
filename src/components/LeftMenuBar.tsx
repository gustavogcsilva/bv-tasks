import { useMemo } from 'react';
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SCOPE_CONFIG, type Task, type UserAccount } from '../features/tasks/types/task.types';

interface LeftMenuBarProps {
  currentUser: UserAccount;
  tasks: Task[];
  onLogout: () => void;
  onSelectTask: (task: Task) => void;
  isMobileDrawer?: boolean;
  onCloseMobileDrawer?: () => void;
  onSyncCalendar?: () => void;
  onExportPdf?: () => void;
}

export function LeftMenuBar({
  currentUser,
  tasks,
  onLogout,
  onSelectTask,
  isMobileDrawer = false,
  onCloseMobileDrawer,
  onSyncCalendar,
  onExportPdf,
}: LeftMenuBarProps) {
  // Filtra as tarefas de alta prioridade (importantes)
  const importantTasks = useMemo(() => {
    return tasks
      .filter((task) => task.priority === 'high')
      .sort((a, b) => {
        // Pendentes primeiro, depois por data
        return (
          Number(Boolean(a.isCompleted)) - Number(Boolean(b.isCompleted)) ||
          (a.date ?? '').localeCompare(b.date ?? '') ||
          (a.time ?? '99:99').localeCompare(b.time ?? '99:99')
        );
      });
  }, [tasks]);

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.isCompleted).length;
  const pendingImportantCount = importantTasks.filter((t) => !t.isCompleted).length;
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  function formatTaskDate(dateStr: string) {
    const parsed = parseISO(dateStr);
    if (!isValid(parsed)) return dateStr;
    return format(parsed, "dd 'de' MMM", { locale: ptBR });
  }

  return (
    <div
      aria-label="Barra de Menu e Status do Usuário"
      className="flex flex-col gap-4 rounded-3xl border border-[#E5E4E0] bg-white p-4 shadow-[0_4px_20px_rgba(15,15,18,0.04)] sm:p-5 dark:border-[#27272A] dark:bg-[#141418]"
    >
      {/* Topo da Barra de Menu: Quem está logado */}
      <div className="flex items-center justify-between border-b border-[#F1EFEA] pb-3.5 dark:border-[#27272A]">
        <div className="flex items-center gap-3">
          {currentUser.avatarUrl ? (
            <img
              src={currentUser.avatarUrl}
              alt={currentUser.name}
              className="h-11 w-11 rounded-2xl border-2 border-[#991B1B] object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#09090B] via-[#450A0A] to-[#991B1B] text-[15px] font-black text-white shadow-md shadow-[#991B1B]/20">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
          )}

          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-[14px] font-extrabold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
                {currentUser.name}
              </span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                  currentUser.provider === 'google'
                    ? 'bg-[#EBF5FF] text-[#2563EB] dark:bg-[#1E293B] dark:text-[#60A5FA]'
                    : 'bg-[#FEF2F2] text-[#991B1B] dark:bg-[#271518] dark:text-[#FCA5A5]'
                }`}
              >
                {currentUser.provider === 'google' ? 'Google' : 'B.V.S Special'}
              </span>
            </div>
            <span className="max-w-[190px] truncate text-[11px] font-medium text-[#71717A] dark:text-[#A1A1AA]">
              {currentUser.email}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onLogout}
            title="Sair da conta"
            className="cursor-pointer rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-2.5 py-1.5 text-[11px] font-bold text-[#71717A] transition-colors hover:bg-[#FEE2E2] hover:text-[#991B1B] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#A1A1AA] dark:hover:bg-[#3B1219] dark:hover:text-[#FCA5A5]"
          >
            Sair
          </button>
          {isMobileDrawer && onCloseMobileDrawer && (
            <button
              type="button"
              onClick={onCloseMobileDrawer}
              aria-label="Fechar menu"
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-xl bg-[#F1EFEA] text-[16px] font-bold text-[#52525B] dark:bg-[#27272A] dark:text-[#D4D4D8]"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Mini Status Bar com Resumo das Tarefas */}
      <div className="flex flex-col gap-2 rounded-2xl border border-[#E5E4E0] bg-[#F8F7F4] p-3 text-[12px] dark:border-[#27272A] dark:bg-[#1C1C22]">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-extrabold tracking-wider text-[#71717A] uppercase dark:text-[#A1A1AA]">
            Mini Status Bar
          </span>
          <span className="text-[11px] font-bold text-[#991B1B] dark:text-[#F87171]">
            {progressPercent}% Concluído
          </span>
        </div>

        {/* Barra de Progresso Visual */}
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#E5E4E0] dark:bg-[#2E2E34]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#991B1B] to-[#DC2626] transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1 text-center">
          <div className="rounded-xl bg-white p-1.5 shadow-2xs dark:bg-[#141418]">
            <span className="block text-[10px] font-semibold text-[#71717A] dark:text-[#A1A1AA]">
              Criadas
            </span>
            <span className="text-[14px] font-black text-[#0F0F12] dark:text-[#FAFAFA]">
              {totalTasks}
            </span>
          </div>

          <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-1.5 shadow-2xs dark:border-[#7F1D1D] dark:bg-[#271518]">
            <span className="block text-[10px] font-bold text-[#991B1B] dark:text-[#FCA5A5]">
              ⭐ Importantes
            </span>
            <span className="text-[14px] font-black text-[#991B1B] dark:text-[#FCA5A5]">
              {importantTasks.length}
            </span>
          </div>

          <div className="rounded-xl bg-white p-1.5 shadow-2xs dark:bg-[#141418]">
            <span className="block text-[10px] font-semibold text-[#71717A] dark:text-[#A1A1AA]">
              Prontas
            </span>
            <span className="text-[14px] font-black text-[#16A34A] dark:text-[#86EFAC]">
              {completedTasks}
            </span>
          </div>
        </div>
      </div>

      {/* Lista de Tarefas Importantes Criadas e O Que Elas Fazem */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-extrabold text-[#0F0F12] dark:text-[#FAFAFA]">
              ⭐ Tarefas Importantes
            </span>
            {pendingImportantCount > 0 && (
              <span className="flex h-5 items-center justify-center rounded-full bg-[#991B1B] px-1.5 text-[10px] font-black text-white">
                {pendingImportantCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold text-[#71717A] dark:text-[#A1A1AA]">
            Toque para ir direto
          </span>
        </div>

        {importantTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D6D3CD] p-4 text-center dark:border-[#2E2E34]">
            <span className="text-[20px]">⭐</span>
            <p className="mt-1 text-[12px] font-semibold text-[#0F0F12] dark:text-[#FAFAFA]">
              Nenhuma tarefa de Alta Prioridade
            </p>
            <p className="mt-0.5 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
              Ao criar uma tarefa com prioridade Alta, ela aparecerá aqui com descrição e atalho
              direto.
            </p>
          </div>
        ) : (
          <div className="no-scrollbar flex max-h-[320px] flex-col gap-2 overflow-y-auto pr-0.5">
            {importantTasks.map((task) => {
              const scopeConfig = SCOPE_CONFIG[task.scope] ?? SCOPE_CONFIG.work;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onSelectTask(task)}
                  className={`group relative flex cursor-pointer flex-col gap-1.5 rounded-2xl border p-3 text-left transition-all active:scale-[0.98] ${
                    task.isCompleted
                      ? 'border-[#E5E4E0] bg-[#F8F7F4]/60 opacity-60 dark:border-[#27272A] dark:bg-[#18181C]/60'
                      : 'border-[#FECACA] bg-white shadow-xs hover:border-[#991B1B] hover:shadow-md hover:shadow-[#991B1B]/10 dark:border-[#7F1D1D]/70 dark:bg-[#1A1517] dark:hover:border-[#DC2626]'
                  }`}
                >
                  {/* Linha 1: Badges de Prioridade, Escopo e Horário */}
                  <div className="flex flex-wrap items-center justify-between gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-[#DC2626] px-1.5 py-0.5 text-[9px] font-black text-white">
                        Alta
                      </span>
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[9px] font-extrabold"
                        style={{
                          backgroundColor: scopeConfig.bgLight,
                          color: scopeConfig.color,
                        }}
                      >
                        {scopeConfig.label}
                      </span>
                    </div>

                    <span className="text-[10px] font-semibold text-[#71717A] dark:text-[#A1A1AA]">
                      📅 {formatTaskDate(task.date)} {task.time ? `• ⏰ ${task.time}` : ''}
                    </span>
                  </div>

                  {/* Linha 2: Título da Tarefa */}
                  <h4
                    className={`line-clamp-1 text-[13px] font-extrabold ${
                      task.isCompleted
                        ? 'line-through text-[#71717A]'
                        : 'text-[#0F0F12] group-hover:text-[#991B1B] dark:text-[#FAFAFA] dark:group-hover:text-[#FCA5A5]'
                    }`}
                  >
                    {task.title}
                  </h4>

                  {/* Linha 3: O que ela faz (descrição) */}
                  <div className="rounded-lg bg-[#F8F7F4] px-2 py-1 text-[11px] dark:bg-[#141418]">
                    <span className="font-bold text-[#52525B] dark:text-[#D4D4D8]">
                      O que faz:{' '}
                    </span>
                    <span className="text-[#71717A] dark:text-[#A1A1AA]">
                      {task.description?.trim() || 'Foco executivo de alta prioridade.'}
                    </span>
                  </div>

                  {/* Linha 4: Indicador de ação ao clicar */}
                  <div className="flex items-center justify-end pt-0.5 text-[10px] font-bold text-[#991B1B] dark:text-[#FCA5A5]">
                    <span>Ver na agenda →</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Ações rápidas de exportação para Calendário (.ics) e Arquivo PDF (.pdf) */}
      {(onSyncCalendar || onExportPdf) && (
        <div className="flex flex-col gap-2">
          {onExportPdf && (
            <button
              type="button"
              onClick={onExportPdf}
              className="flex min-h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 text-[11px] font-bold text-[#991B1B] transition-colors hover:bg-[#FEE2E2] active:scale-95 dark:border-[#7F1D1D] dark:bg-[#271518] dark:text-[#FCA5A5]"
            >
              <span>📄 Gerar e Exportar Tarefas como PDF (.pdf)</span>
            </button>
          )}
          {onSyncCalendar && (
            <button
              type="button"
              onClick={onSyncCalendar}
              className="flex min-h-[38px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-3 text-[11px] font-bold text-[#0F0F12] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#27272A] dark:bg-[#1C1C22] dark:text-[#FAFAFA]"
            >
              <span>📲 Sincronizar com Calendário do Celular (.ics)</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
