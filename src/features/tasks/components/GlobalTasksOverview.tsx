import React, { useMemo, useState } from 'react';
import { FolderManager } from '../../folders/components/FolderManager';
import {
  exportTasksToPdf,
  syncTasksWithPhoneCalendar,
} from '../../../services/notificationsAndCalendar';
import {
  Priority,
  SCOPE_CONFIG,
  Scope,
  Task,
  TaskAttachment,
  TaskFolder,
} from '../types/task.types';
import { TaskItem } from './TaskItem';

export type OverviewViewMode = 'cards' | 'table';
export type OverviewStatusFilter = 'all' | 'pending' | 'completed';

interface GlobalTasksOverviewProps {
  tasks: Task[];
  folders: TaskFolder[];
  selectedFolderId: string | 'all';
  onSelectFolder: (folderId: string | 'all') => void;
  onCreateFolder: (name: string, scope?: Scope) => void;
  onDeleteFolder: (folderId: string) => void;
  filterTodayOnly: boolean;
  todayIso: string;
  onToggleTodayOnly: (value: boolean) => void;
  onToggleTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onAddAttachment: (taskId: string, attachment: TaskAttachment) => void;
  onRemoveAttachment: (taskId: string, attachmentId: string) => void;
  onNewTask: () => void;
  onOpenImport: () => void;
  onOpenAiReview: () => void;
  recentlyCreatedTaskId: string | null;
  highlightedTaskId: string | null;
  userName?: string;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const PRIORITY_COLORS: Record<Priority, { text: string; bg: string }> = {
  high: { text: '#991B1B', bg: '#FEE2E2' },
  medium: { text: '#B45309', bg: '#FEF3C7' },
  low: { text: '#4B5563', bg: '#F3F4F6' },
};

/**
 * Visão Geral Global de todas as tarefas com busca em tempo real, filtros rápidos,
 * alternância entre Lista/Cards e Tabela/Grid, e Gaveta Deslizante (Bottom Sheet) no celular.
 */
export const GlobalTasksOverview: React.FC<GlobalTasksOverviewProps> = ({
  tasks,
  folders,
  selectedFolderId,
  onSelectFolder,
  onCreateFolder,
  onDeleteFolder,
  filterTodayOnly,
  todayIso,
  onToggleTodayOnly,
  onToggleTask,
  onDeleteTask,
  onAddAttachment,
  onRemoveAttachment,
  onNewTask,
  onOpenImport,
  onOpenAiReview,
  recentlyCreatedTaskId,
  highlightedTaskId,
  userName,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<OverviewStatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [scopeFilter, setScopeFilter] = useState<Scope | 'all'>('all');
  const [viewMode, setViewMode] = useState<OverviewViewMode>('cards');
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);

  const detailTask = useMemo(
    () => (detailTaskId ? tasks.find((t) => t.id === detailTaskId) ?? null : null),
    [detailTaskId, tasks],
  );

  const folderMap = useMemo(() => {
    const map = new Map<string, TaskFolder>();
    for (const folder of folders) {
      map.set(folder.id, folder);
    }
    return map;
  }, [folders]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (statusFilter !== 'all') count += 1;
    if (priorityFilter !== 'all') count += 1;
    if (scopeFilter !== 'all') count += 1;
    if (selectedFolderId !== 'all') count += 1;
    if (filterTodayOnly) count += 1;
    return count;
  }, [statusFilter, priorityFilter, scopeFilter, selectedFolderId, filterTodayOnly]);

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (filterTodayOnly && task.date !== todayIso) return false;
        if (selectedFolderId !== 'all' && task.folderId !== selectedFolderId) return false;
        if (statusFilter === 'pending' && task.isCompleted) return false;
        if (statusFilter === 'completed' && !task.isCompleted) return false;
        if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
        if (scopeFilter !== 'all' && task.scope !== scopeFilter) return false;

        if (query) {
          const scopeLabel = (SCOPE_CONFIG[task.scope]?.label || '').toLowerCase();
          const folderName = task.folderId
            ? (folderMap.get(task.folderId)?.name || '').toLowerCase()
            : '';
          const haystack = `${task.title} ${task.description ?? ''} ${scopeLabel} ${folderName} ${task.date}`.toLowerCase();
          if (!haystack.includes(query)) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        const timeA = a.time || '99:99';
        const timeB = b.time || '99:99';
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        const prioWeight: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
        return prioWeight[a.priority] - prioWeight[b.priority];
      });
  }, [
    tasks,
    searchQuery,
    filterTodayOnly,
    todayIso,
    selectedFolderId,
    statusFilter,
    priorityFilter,
    scopeFilter,
    folderMap,
  ]);

  const kpis = useMemo(() => {
    const total = filteredTasks.length;
    const completed = filteredTasks.filter((t) => t.isCompleted).length;
    const pending = total - completed;
    const highPriority = filteredTasks.filter((t) => !t.isCompleted && t.priority === 'high').length;
    return { total, completed, pending, highPriority };
  }, [filteredTasks]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setPriorityFilter('all');
    setScopeFilter('all');
    onSelectFolder('all');
    onToggleTodayOnly(false);
  };

  const handleExportFilteredPdf = () => {
    exportTasksToPdf(filteredTasks, `bvs-special-visao-global-${todayIso}.pdf`, {
      title: filterTodayOnly
        ? 'Relatorio Executivo - Tarefas de Hoje'
        : 'Relatorio Executivo - Visao Geral Global',
      userName,
    });
  };

  const renderFilterControls = (compactMobile = false) => (
    <div className="flex flex-col gap-3">
      {/* Filtro de Status + Hoje */}
      <div>
        <span className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-[#71717A] dark:text-[#A1A1AA]">
          Status &amp; Período
        </span>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'Todas' },
              { id: 'pending', label: 'Pendentes' },
              { id: 'completed', label: 'Concluídas' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setStatusFilter(item.id)}
              className={`min-h-[44px] sm:min-h-[36px] cursor-pointer rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-95 ${
                statusFilter === item.id
                  ? 'border-[#6F1D2B] bg-[#6F1D2B] text-white'
                  : 'border-[#E6E2DA] bg-white text-[#3F3F46] hover:bg-[#FAF7F2] dark:border-[#27272A] dark:bg-[#1C1C21] dark:text-[#D4D4D8]'
              }`}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={() => onToggleTodayOnly(!filterTodayOnly)}
            className={`min-h-[44px] sm:min-h-[36px] cursor-pointer rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-95 ${
              filterTodayOnly
                ? 'border-[#15803D] bg-[#E8F4EE] text-[#15803D] dark:border-[#166534] dark:bg-[#143323] dark:text-[#86EFAC]'
                : 'border-[#E6E2DA] bg-white text-[#3F3F46] hover:bg-[#FAF7F2] dark:border-[#27272A] dark:bg-[#1C1C21] dark:text-[#D4D4D8]'
            }`}
          >
            ☀️ Somente Hoje
          </button>
        </div>
      </div>

      {/* Filtro de Categoria & Prioridade */}
      <div className={`grid gap-3 ${compactMobile ? 'grid-cols-1' : 'sm:grid-cols-2'}`}>
        <div>
          <span className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-[#71717A] dark:text-[#A1A1AA]">
            Categoria
          </span>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`min-h-[44px] sm:min-h-[36px] cursor-pointer rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-95 ${
                scopeFilter === 'all'
                  ? 'border-[#0F0F12] bg-[#0F0F12] text-white dark:border-[#FAFAFA] dark:bg-[#FAFAFA] dark:text-[#0F0F12]'
                  : 'border-[#E6E2DA] bg-white text-[#3F3F46] hover:bg-[#FAF7F2] dark:border-[#27272A] dark:bg-[#1C1C21] dark:text-[#D4D4D8]'
              }`}
            >
              Todas
            </button>
            {(['work', 'personal', 'study'] as const).map((sc) => {
              const cfg = SCOPE_CONFIG[sc];
              const active = scopeFilter === sc;
              return (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setScopeFilter(sc)}
                  className="flex min-h-[44px] sm:min-h-[36px] cursor-pointer items-center gap-1.5 rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-95"
                  style={
                    active
                      ? { backgroundColor: cfg.color, borderColor: cfg.color, color: '#FFFFFF' }
                      : { backgroundColor: cfg.bgLight, borderColor: cfg.borderLight, color: cfg.color }
                  }
                >
                  <span
                    className={`h-2 w-2 rounded-full ${active ? 'bg-white' : cfg.dotClass}`}
                    aria-hidden="true"
                  />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[11px] font-bold tracking-wider uppercase text-[#71717A] dark:text-[#A1A1AA]">
            Prioridade
          </span>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'Todas' },
                { id: 'high', label: '🔴 Alta' },
                { id: 'medium', label: '🟡 Média' },
                { id: 'low', label: '⚪ Baixa' },
              ] as const
            ).map((prio) => (
              <button
                key={prio.id}
                type="button"
                onClick={() => setPriorityFilter(prio.id)}
                className={`min-h-[44px] sm:min-h-[36px] cursor-pointer rounded-xl border px-3 text-[12px] font-bold transition-colors active:scale-95 ${
                  priorityFilter === prio.id
                    ? 'border-[#6F1D2B] bg-[#6F1D2B] text-white'
                    : 'border-[#E6E2DA] bg-white text-[#3F3F46] hover:bg-[#FAF7F2] dark:border-[#27272A] dark:bg-[#1C1C21] dark:text-[#D4D4D8]'
                }`}
              >
                {prio.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Faixa de Resumo KPI + Ações Rápidas */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#ECE8DF] bg-white px-3.5 py-3 shadow-xs dark:border-[#27272A] dark:bg-[#18181B]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#71717A] dark:text-[#A1A1AA]">
            Visão Atual
          </span>
          <p className="font-heading mt-0.5 text-[22px] font-bold text-[#0F0F12] dark:text-white">
            {kpis.total}
          </p>
        </div>

        <div className="rounded-2xl border border-[#D1FAE5] bg-[#F0FDF4] px-3.5 py-3 shadow-xs dark:border-[#14532D] dark:bg-[#0F2417]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#15803D] dark:text-[#86EFAC]">
            Concluídas
          </span>
          <p className="font-heading mt-0.5 text-[22px] font-bold text-[#166534] dark:text-[#BBF7D0]">
            {kpis.completed}
          </p>
        </div>

        <div className="rounded-2xl border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-3 shadow-xs dark:border-[#78350F] dark:bg-[#241B0D]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#B45309] dark:text-[#FCD34D]">
            Pendentes
          </span>
          <p className="font-heading mt-0.5 text-[22px] font-bold text-[#92400E] dark:text-[#FDE68A]">
            {kpis.pending}
          </p>
        </div>

        <div className="rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-3 shadow-xs dark:border-[#7F1D1D] dark:bg-[#2A1215]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#991B1B] dark:text-[#FCA5A5]">
            Alta Prioridade
          </span>
          <p className="font-heading mt-0.5 text-[22px] font-bold text-[#7F1D1D] dark:text-[#FECACA]">
            {kpis.highPriority}
          </p>
        </div>
      </div>

      {/* Barra de Busca + Botões de Controle (Responsiva) */}
      <div className="rounded-[20px] border border-[#E6E2DA] bg-white p-3.5 shadow-xs dark:border-[#27272A] dark:bg-[#18181B]">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <span
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-[#71717A]"
              aria-hidden="true"
            >
              🔍
            </span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefa, observação, pasta ou data..."
              aria-label="Buscar tarefas"
              className="min-h-[44px] w-full rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] pl-10 pr-3.5 text-[15px] text-[#0F0F12] placeholder-[#71717A] outline-none transition-colors focus:border-[#6F1D2B] focus:bg-white dark:border-[#27272A] dark:bg-[#27272A] dark:text-white dark:placeholder-[#A1A1AA] sm:text-[14px]"
            />
          </div>

          {/* Alternador Lista/Cards x Tabela/Grid + Filtros Mobile + Ações Rápidas */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Botão para abrir Bottom Sheet de filtros no celular */}
            <button
              type="button"
              onClick={() => setIsFilterSheetOpen(true)}
              className="flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] px-3 text-[12px] font-bold text-[#0F0F12] active:scale-95 md:hidden dark:border-[#27272A] dark:bg-[#27272A] dark:text-white"
            >
              <span>🎛️ Filtros</span>
              {activeFilterCount > 0 && (
                <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#6F1D2B] px-1.5 text-[11px] font-extrabold text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Toggle Lista/Cards vs Tabela/Grid */}
            <div
              role="group"
              aria-label="Modo de visualização das tarefas"
              className="inline-flex rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] p-1 dark:border-[#27272A] dark:bg-[#27272A]"
            >
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                aria-pressed={viewMode === 'cards'}
                className={`min-h-[38px] cursor-pointer rounded-lg px-3 text-[12px] font-bold transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-white text-[#6F1D2B] shadow-xs dark:bg-[#18181B] dark:text-[#FCA5A5]'
                    : 'text-[#71717A] hover:text-[#0F0F12] dark:text-[#A1A1AA] dark:hover:text-white'
                }`}
              >
                📇 Lista/Cards
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                aria-pressed={viewMode === 'table'}
                className={`min-h-[38px] cursor-pointer rounded-lg px-3 text-[12px] font-bold transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white text-[#6F1D2B] shadow-xs dark:bg-[#18181B] dark:text-[#FCA5A5]'
                    : 'text-[#71717A] hover:text-[#0F0F12] dark:text-[#A1A1AA] dark:hover:text-white'
                }`}
              >
                📊 Tabela/Grid
              </button>
            </div>

            <button
              type="button"
              onClick={handleExportFilteredPdf}
              title="Exportar a visão filtrada atual em PDF Executivo"
              className="flex min-h-[44px] sm:min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#FDF4F5] px-3 text-[12px] font-bold text-[#6F1D2B] transition-colors hover:bg-[#FCE7E9] active:scale-95 dark:bg-[#3B1219] dark:text-[#FCA5A5]"
            >
              📄 Exportar PDF
            </button>
          </div>
        </div>

        {/* Filtros Completos Visíveis no Desktop/Tablet */}
        <div className="mt-3.5 hidden border-t border-[#F1EFEA] pt-3.5 md:block dark:border-[#27272A]">
          {renderFilterControls(false)}

          {(activeFilterCount > 0 || searchQuery.trim()) && (
            <div className="mt-3 flex items-center justify-between text-[12px]">
              <span className="font-semibold text-[#52525B] dark:text-[#A1A1AA]">
                Mostrando {filteredTasks.length} de {tasks.length} tarefa(s)
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="cursor-pointer font-bold text-[#6F1D2B] hover:underline dark:text-[#FCA5A5]"
              >
                Limpar todos os filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Lista / Grid de Resultados */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[24px] border border-dashed border-[#DFDCD4] bg-white/80 px-6 py-14 text-center dark:border-[#27272A] dark:bg-[#18181B]/70">
          <span className="text-[40px]" aria-hidden="true">
            {tasks.length === 0 ? '🍷' : '🔎'}
          </span>
          <h3 className="font-heading mt-3 text-[18px] font-bold text-[#0F0F12] dark:text-white">
            {tasks.length === 0 ? 'Tudo em dia' : 'Nenhuma tarefa encontrada'}
          </h3>
          <p className="mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-[#52525B] dark:text-[#A1A1AA]">
            {tasks.length === 0
              ? 'Crie uma tarefa manual, importe seu cronograma (.xlsx/.csv/.json) ou gere o planejamento com IA.'
              : 'Nenhuma tarefa corresponde aos filtros aplicados na busca atual.'}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            {tasks.length === 0 ? (
              <>
                <button
                  type="button"
                  onClick={onNewTask}
                  className="min-h-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-5 text-[13px] font-bold text-white shadow-sm hover:bg-[#581521] active:scale-95"
                >
                  + Criar Primeira Tarefa
                </button>
                <button
                  type="button"
                  onClick={onOpenImport}
                  className="min-h-[44px] cursor-pointer rounded-xl border border-[#E6E2DA] bg-white px-4 text-[13px] font-bold text-[#0F0F12] hover:bg-[#FAF7F2] active:scale-95 dark:border-[#27272A] dark:bg-[#27272A] dark:text-white"
                >
                  📥 Importar Planejamento
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleResetFilters}
                className="min-h-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-5 text-[13px] font-bold text-white active:scale-95"
              >
                Limpar Filtros
              </button>
            )}
          </div>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              showDateBadge
              folder={task.folderId ? folderMap.get(task.folderId) : undefined}
              isRecentlyCreated={recentlyCreatedTaskId === task.id}
              isHighlighted={highlightedTaskId === task.id}
              onToggle={() => onToggleTask(task.id)}
              onDelete={() => onDeleteTask(task.id)}
              onOpenDetails={() => setDetailTaskId(task.id)}
              onAddAttachment={(att) => onAddAttachment(task.id, att)}
              onRemoveAttachment={(attId) => onRemoveAttachment(task.id, attId)}
            />
          ))}
        </div>
      ) : (
        /* Modo Tabela / Grid Executivo */
        <div className="overflow-hidden rounded-[22px] border border-[#E6E2DA] bg-white shadow-xs dark:border-[#27272A] dark:bg-[#18181B]">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#E6E2DA] bg-[#FAF7F2] text-[11px] font-bold uppercase tracking-wider text-[#52525B] dark:border-[#27272A] dark:bg-[#202026] dark:text-[#A1A1AA]">
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Tarefa</th>
                  <th className="px-4 py-3.5">Categoria</th>
                  <th className="px-4 py-3.5">Data / Hora</th>
                  <th className="px-4 py-3.5">Prioridade</th>
                  <th className="px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1EFEA] dark:divide-[#27272A]">
                {filteredTasks.map((task) => {
                  const cfg = SCOPE_CONFIG[task.scope] ?? SCOPE_CONFIG.work;
                  const prio = PRIORITY_COLORS[task.priority] ?? PRIORITY_COLORS.medium;
                  const folder = task.folderId ? folderMap.get(task.folderId) : undefined;
                  const brDate = task.date.split('-').reverse().join('/');

                  return (
                    <tr
                      key={task.id}
                      className={`transition-colors hover:bg-[#FAF7F2]/70 dark:hover:bg-[#222228] ${
                        task.isCompleted ? 'opacity-65' : ''
                      }`}
                    >
                      <td className="px-4 py-3 align-middle">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={task.isCompleted}
                          onClick={() => onToggleTask(task.id)}
                          className={`min-h-[44px] sm:min-h-[34px] cursor-pointer rounded-lg px-3 text-[11px] font-bold transition-colors active:scale-95 ${
                            task.isCompleted
                              ? 'bg-[#E8F4EE] text-[#15803D] dark:bg-[#143323] dark:text-[#86EFAC]'
                              : 'bg-[#0F0F12] text-white hover:bg-[#27272A] dark:bg-[#6F1D2B]'
                          }`}
                        >
                          {task.isCompleted ? '✓ Concluída' : 'Concluir'}
                        </button>
                      </td>

                      <td className="max-w-[300px] px-4 py-3 align-middle">
                        <button
                          type="button"
                          onClick={() => setDetailTaskId(task.id)}
                          className={`cursor-pointer text-left font-semibold text-[#0F0F12] hover:text-[#6F1D2B] hover:underline dark:text-white dark:hover:text-[#FCA5A5] ${
                            task.isCompleted ? 'line-through text-[#71717A]' : ''
                          }`}
                        >
                          {task.title}
                        </button>
                        {task.description && (
                          <div className="mt-0.5 line-clamp-1 text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                            {task.description}
                          </div>
                        )}
                        {folder && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded bg-[#F1EFEA] px-2 py-0.5 text-[10px] font-bold text-[#3F3F46] dark:bg-[#27272A] dark:text-[#E4E4E7]">
                            📁 {folder.name}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ backgroundColor: cfg.bgLight, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                      </td>

                      <td className="whitespace-nowrap px-4 py-3 align-middle font-semibold text-[#3F3F46] dark:text-[#D4D4D8]">
                        <div>{brDate}</div>
                        <div className="text-[11px] text-[#71717A] dark:text-[#A1A1AA]">
                          {task.time ? `⏰ ${task.time}` : 'Dia todo'}
                        </div>
                      </td>

                      <td className="px-4 py-3 align-middle">
                        <span
                          className="inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold"
                          style={{ backgroundColor: prio.bg, color: prio.text }}
                        >
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right align-middle">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              exportTasksToPdf([task], `bvs-special-tarefa-${task.date}.pdf`, {
                                title: `Ficha: ${task.title}`,
                                userName,
                              })
                            }
                            className="min-h-[44px] sm:min-h-[34px] cursor-pointer rounded-lg bg-[#FEE2E2] px-2.5 text-[11px] font-bold text-[#991B1B] hover:bg-[#FECACA]"
                          >
                            PDF
                          </button>

                          {confirmDeleteId === task.id ? (
                            <button
                              type="button"
                              onClick={() => {
                                onDeleteTask(task.id);
                                setConfirmDeleteId(null);
                              }}
                              className="min-h-[44px] sm:min-h-[34px] cursor-pointer rounded-lg bg-[#991B1B] px-2.5 text-[11px] font-bold text-white"
                            >
                              Confirmar
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(task.id)}
                              className="min-h-[44px] sm:min-h-[34px] cursor-pointer rounded-lg bg-[#F1EFEA] px-2.5 text-[11px] font-bold text-[#B91C1C] hover:bg-[#FDECEC] dark:bg-[#27272A]"
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gaveta Deslizante (Bottom Sheet) de Filtros & Pastas para Smartphone (< 768px) */}
      {isFilterSheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-[2px] md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Filtros e pastas de tarefas"
        >
          <div className="animate-sheet-up safe-bottom max-h-[86dvh] w-full overflow-y-auto rounded-t-[26px] border-t border-[#E6E2DA] bg-white p-5 shadow-2xl dark:border-[#27272A] dark:bg-[#18181B]">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[#D4D4D8] dark:bg-[#3F3F46]" />

            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-heading text-[18px] font-bold text-[#0F0F12] dark:text-white">
                🎛️ Filtros &amp; Pastas
              </h3>
              <button
                type="button"
                onClick={() => setIsFilterSheetOpen(false)}
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl bg-[#F1EFEA] text-[14px] font-bold text-[#0F0F12] dark:bg-[#27272A] dark:text-white"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-5">
              {renderFilterControls(true)}

              <FolderManager
                folders={folders}
                tasks={tasks}
                selectedFolderId={selectedFolderId}
                onSelectFolder={(folderId) => {
                  onSelectFolder(folderId);
                }}
                onCreateFolder={onCreateFolder}
                onDeleteFolder={onDeleteFolder}
              />

              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onOpenImport();
                    setIsFilterSheetOpen(false);
                  }}
                  className="min-h-[44px] cursor-pointer rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] px-3 text-[12px] font-bold text-[#0F0F12] dark:border-[#27272A] dark:bg-[#27272A] dark:text-white"
                >
                  📥 Importar Lote
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onOpenAiReview();
                    setIsFilterSheetOpen(false);
                  }}
                  className="min-h-[44px] cursor-pointer rounded-xl border border-[#E5D3D6] bg-[#FDF4F5] px-3 text-[12px] font-bold text-[#6F1D2B] dark:border-[#4C1D24] dark:bg-[#3B1219] dark:text-[#FCA5A5]"
                >
                  ✨ Fechamento IA
                </button>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    handleResetFilters();
                    setIsFilterSheetOpen(false);
                  }}
                  className="min-h-[46px] flex-1 cursor-pointer rounded-xl border border-[#E6E2DA] bg-white text-[13px] font-bold text-[#52525B] dark:border-[#27272A] dark:bg-[#27272A] dark:text-[#D4D4D8]"
                >
                  Limpar
                </button>
                <button
                  type="button"
                  onClick={() => setIsFilterSheetOpen(false)}
                  className="min-h-[46px] flex-[1.5] cursor-pointer rounded-xl bg-[#6F1D2B] text-[13px] font-bold text-white shadow-sm"
                >
                  Ver {filteredTasks.length} Tarefa(s)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal / Drawer de Detalhes da Tarefa ao Clicar */}
      {detailTask && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-xs md:items-center md:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Detalhes da tarefa ${detailTask.title}`}
        >
          <div className="animate-sheet-up safe-bottom w-full max-w-[540px] rounded-t-[26px] border border-[#E6E2DA] bg-white p-5 shadow-2xl md:rounded-[24px] dark:border-[#27272A] dark:bg-[#18181B]">
            <div className="flex items-start justify-between gap-3 border-b border-[#F1EFEA] pb-3.5 dark:border-[#27272A]">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F1D2B] dark:text-[#FCA5A5]">
                  Ficha Completa da Tarefa
                </span>
                <h3 className="font-heading mt-0.5 text-[18px] font-bold text-[#0F0F12] dark:text-white">
                  {detailTask.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailTaskId(null)}
                aria-label="Fechar detalhes da tarefa"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl bg-[#F1EFEA] text-[14px] font-bold text-[#0F0F12] dark:bg-[#27272A] dark:text-white"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3 text-[13px]">
              {detailTask.description ? (
                <p className="rounded-xl bg-[#FAF7F2] p-3.5 leading-relaxed text-[#3F3F46] dark:bg-[#202026] dark:text-[#D4D4D8]">
                  {detailTask.description}
                </p>
              ) : (
                <p className="italic text-[#71717A]">Sem observações adicionais cadastradas.</p>
              )}

              <div className="flex flex-wrap gap-2 text-[12px] font-bold">
                <span className="rounded-lg bg-[#FAF7F2] px-3 py-1.5 text-[#0F0F12] dark:bg-[#27272A] dark:text-white">
                  📅 {detailTask.date.split('-').reverse().join('/')}{' '}
                  {detailTask.time ? `• ⏰ ${detailTask.time}` : '• Dia todo'}
                </span>
                <span
                  className="rounded-lg px-3 py-1.5"
                  style={{
                    backgroundColor: SCOPE_CONFIG[detailTask.scope].bgLight,
                    color: SCOPE_CONFIG[detailTask.scope].color,
                  }}
                >
                  {SCOPE_CONFIG[detailTask.scope].label}
                </span>
                <span
                  className="rounded-lg px-3 py-1.5"
                  style={{
                    backgroundColor: PRIORITY_COLORS[detailTask.priority].bg,
                    color: PRIORITY_COLORS[detailTask.priority].text,
                  }}
                >
                  Prioridade {PRIORITY_LABELS[detailTask.priority]}
                </span>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1EFEA] pt-4 dark:border-[#27272A]">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    syncTasksWithPhoneCalendar([detailTask], `bvs-special-${detailTask.date}.ics`)
                  }
                  className="min-h-[44px] cursor-pointer rounded-xl bg-[#F1EFEA] px-3.5 text-[12px] font-bold text-[#0F0F12] dark:bg-[#27272A] dark:text-white"
                >
                  📅 Apple Calendar (.ics)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    exportTasksToPdf([detailTask], `bvs-special-tarefa-${detailTask.date}.pdf`, {
                      title: `Ficha: ${detailTask.title}`,
                      userName,
                    })
                  }
                  className="min-h-[44px] cursor-pointer rounded-xl bg-[#FEE2E2] px-3.5 text-[12px] font-bold text-[#991B1B]"
                >
                  📄 Exportar PDF
                </button>
              </div>

              <button
                type="button"
                onClick={() => onToggleTask(detailTask.id)}
                className="min-h-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-4 text-[12px] font-bold text-white"
              >
                {detailTask.isCompleted ? '✓ Concluída (Reabrir)' : 'Marcar como Concluída'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
