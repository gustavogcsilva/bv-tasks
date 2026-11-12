import React, { useEffect, useMemo, useState } from 'react';
import { apiRequestMonthlyReview } from '../../../services/apiSync';
import {
  MonthlyReviewResponse,
  SCOPE_CONFIG,
  Task,
} from '../../tasks/types/task.types';

interface MonthlyReviewModalProps {
  visible: boolean;
  tasks: Task[];
  defaultMonth: string; // YYYY-MM
  hasPendingSync: boolean;
  onSyncBeforeReview: () => Promise<void>;
  onApplyAndMigrate: (
    tasksToUpsert: Task[],
  ) => Promise<{ ok: boolean; count: number; synced: boolean; error?: string }>;
  onClose: () => void;
  onNotify?: (message: string) => void;
}

/**
 * Desloca uma data YYYY-MM-DD para o próximo mês YYYY-MM mantendo o dia (limitado ao último dia do mês destino).
 */
function shiftDateToNextMonth(dateIso: string, targetMonth: string): string {
  const [yrStr, moStr] = targetMonth.split('-');
  const year = Number(yrStr);
  const month = Number(moStr);
  if (!year || !month) return `${targetMonth}-01`;

  const dayPart = Number(dateIso.slice(8, 10)) || 1;
  const maxDaysInTarget = new Date(year, month, 0).getDate();
  const safeDay = String(Math.min(dayPart, maxDaysInTarget)).padStart(2, '0');
  return `${targetMonth}-${safeDay}`;
}

/**
 * Modal / Bottom Sheet responsivo "Fechamento do Mês (IA)" conectado ao Google Gemini 2.5 Flash
 * e à rota transacional `POST /api/tasks/bulk`.
 */
export const MonthlyReviewModal: React.FC<MonthlyReviewModalProps> = ({
  visible,
  tasks,
  defaultMonth,
  hasPendingSync,
  onSyncBeforeReview,
  onApplyAndMigrate,
  onClose,
  onNotify,
}) => {
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [migratePending, setMigratePending] = useState(true);
  const [selectedSuggestionIdx, setSelectedSuggestionIdx] = useState<number[]>([]);
  const [result, setResult] = useState<MonthlyReviewResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setSelectedMonth(defaultMonth);
    }
  }, [visible, defaultMonth]);

  const monthPendingTasks = useMemo(
    () =>
      tasks.filter(
        (task) => !task.isCompleted && task.date.startsWith(selectedMonth),
      ),
    [tasks, selectedMonth],
  );

  if (!visible) {
    return null;
  }

  const handleGenerateReview = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    setResult(null);

    try {
      if (hasPendingSync) {
        await onSyncBeforeReview();
      }
      const response = await apiRequestMonthlyReview(selectedMonth, tasks);
      if (!response.ok || !response.review) {
        setErrorMsg(
          response.error || 'Não foi possível gerar o fechamento do mês agora. Tente novamente.',
        );
        return;
      }

      setResult(response);
      setSelectedSuggestionIdx(
        response.review.tarefasSugeridasProximoMes.map((_, idx) => idx),
      );
    } catch (error) {
      setErrorMsg(
        error instanceof Error ? error.message : 'Falha de comunicação com o servidor de IA.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSuggestion = (index: number) => {
    setSelectedSuggestionIdx((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const handleApplyAndMigrate = async () => {
    if (!result?.review || !result.nextMonth || isApplying) return;

    setIsApplying(true);
    setErrorMsg(null);

    try {
      const targetMonth = result.nextMonth;
      const nowIso = new Date().toISOString();
      const tasksPayload: Task[] = [];

      // 1. Sugestões selecionadas do Gemini como novas tarefas do próximo mês
      result.review.tarefasSugeridasProximoMes.forEach((suggested, index) => {
        if (!selectedSuggestionIdx.includes(index)) return;
        const safeDate =
          suggested.date && suggested.date.startsWith(targetMonth)
            ? suggested.date
            : `${targetMonth}-0${Math.min(9, index + 2)}`;

        tasksPayload.push({
          id:
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `ai_${Date.now()}_${index}`,
          title: suggested.title,
          description: suggested.description,
          date: safeDate,
          time: suggested.time,
          priority: suggested.priority,
          scope: suggested.scope,
          isCompleted: false,
          createdAt: nowIso,
        });
      });

      // 2. Migrar tarefas pendentes do mês analisado para o próximo mês
      if (migratePending) {
        for (const pendingTask of monthPendingTasks) {
          tasksPayload.push({
            ...pendingTask,
            date: shiftDateToNextMonth(pendingTask.date, targetMonth),
          });
        }
      }

      if (tasksPayload.length === 0) {
        setErrorMsg('Selecione ao menos uma sugestão ou mantenha a migração de pendentes marcada.');
        return;
      }

      const saveResult = await onApplyAndMigrate(tasksPayload);
      if (saveResult.ok) {
        if (onNotify) {
          onNotify(
            saveResult.synced
              ? `${saveResult.count} tarefa(s) aplicada(s) e migrada(s) para ${targetMonth}!`
              : `${saveResult.count} tarefa(s) salva(s) localmente para ${targetMonth}.`,
          );
        }
        onClose();
      } else {
        setErrorMsg(saveResult.error || 'Erro ao aplicar sugestões e migrar pendentes.');
      }
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-xs md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Fechamento Inteligente do Mês com IA"
    >
      <div className="animate-sheet-up safe-bottom flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[#E6E2DA] bg-white shadow-2xl md:max-w-[760px] md:rounded-[26px] dark:border-[#27272A] dark:bg-[#18181B]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-[#F1EFEA] px-5 py-4 dark:border-[#27272A]">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F1D2B] dark:text-[#FCA5A5]">
              Google Gemini 2.5 Flash
            </span>
            <h2 className="font-heading text-[20px] font-bold text-[#0F0F12] dark:text-white">
              ✨ Fechamento do Mês (IA)
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de fechamento do mês"
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl bg-[#F1EFEA] text-[15px] font-bold text-[#0F0F12] hover:bg-[#E6E2DA] dark:bg-[#27272A] dark:text-white"
          >
            ✕
          </button>
        </div>

        {/* Corpo */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Seletor de Mês + Ação de Análise */}
          <div className="flex flex-col gap-3 rounded-2xl border border-[#E6E2DA] bg-[#FAF7F2] p-4 sm:flex-row sm:items-end sm:justify-between dark:border-[#27272A] dark:bg-[#202026]">
            <div className="flex-1">
              <label
                htmlFor="ai-review-month"
                className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-[#52525B] dark:text-[#A1A1AA]"
              >
                Mês de Referência para Análise
              </label>
              <input
                id="ai-review-month"
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="min-h-[44px] w-full rounded-xl border border-[#E6E2DA] bg-white px-3 text-[14px] font-bold text-[#0F0F12] dark:border-[#3F3F46] dark:bg-[#18181B] dark:text-white"
              />
            </div>

            <button
              type="button"
              disabled={isLoading || !selectedMonth}
              onClick={handleGenerateReview}
              className="min-h-[46px] cursor-pointer rounded-xl bg-[#6F1D2B] px-5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#581521] active:scale-95 disabled:opacity-60"
            >
              {isLoading ? 'Analisando com Gemini...' : '✨ Gerar Fechamento Inteligente'}
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1215] dark:text-[#FCA5A5]"
            >
              {errorMsg}
            </div>
          )}

          {/* Resultados da IA */}
          {result?.stats && result.review && (
            <div className="space-y-4">
              {/* Mini KPIs do mês */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div className="rounded-xl border border-[#ECE8DF] bg-white p-3 dark:border-[#27272A] dark:bg-[#202026]">
                  <span className="text-[10px] font-bold uppercase text-[#71717A]">Total do Mês</span>
                  <p className="font-heading text-[20px] font-bold text-[#0F0F12] dark:text-white">
                    {result.stats.total}
                  </p>
                </div>
                <div className="rounded-xl border border-[#D1FAE5] bg-[#F0FDF4] p-3 dark:border-[#14532D] dark:bg-[#0F2417]">
                  <span className="text-[10px] font-bold uppercase text-[#15803D]">Conclusão</span>
                  <p className="font-heading text-[20px] font-bold text-[#166534] dark:text-[#86EFAC]">
                    {result.stats.completionRate}%
                  </p>
                </div>
                <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-3 dark:border-[#78350F] dark:bg-[#241B0D]">
                  <span className="text-[10px] font-bold uppercase text-[#B45309]">Pendentes</span>
                  <p className="font-heading text-[20px] font-bold text-[#92400E] dark:text-[#FCD34D]">
                    {result.stats.pending}
                  </p>
                </div>
                <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 dark:border-[#7F1D1D] dark:bg-[#2A1215]">
                  <span className="text-[10px] font-bold uppercase text-[#991B1B]">Gargalo</span>
                  <p className="font-heading mt-1 text-[14px] font-bold text-[#7F1D1D] dark:text-[#FCA5A5]">
                    {result.stats.bottleneckScope || 'Equilibrado'}
                  </p>
                </div>
              </div>

              {/* Diagnóstico */}
              <div className="rounded-2xl border border-[#E5D3D6] bg-[#FDF6F7] p-4 dark:border-[#4C1D24] dark:bg-[#261317]">
                <h3 className="font-heading text-[14px] font-bold text-[#6F1D2B] dark:text-[#FCA5A5]">
                  📊 Diagnóstico de Desempenho
                </h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#27272A] dark:text-[#E4E4E7]">
                  {result.review.diagnostico}
                </p>
              </div>

              {/* 3 Próximos Passos */}
              <div className="rounded-2xl border border-[#E6E2DA] bg-white p-4 dark:border-[#27272A] dark:bg-[#202026]">
                <h3 className="font-heading text-[14px] font-bold text-[#0F0F12] dark:text-white">
                  🎯 3 Ações Práticas Recomendadas
                </h3>
                <ol className="mt-2 space-y-2 text-[13px] text-[#3F3F46] dark:text-[#D4D4D8]">
                  {result.review.proximosPassos.map((step, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#6F1D2B] text-[11px] font-bold text-white">
                        {idx + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Sugestões de Tarefas para o Próximo Mês */}
              <div className="space-y-2">
                <h3 className="font-heading text-[14px] font-bold text-[#0F0F12] dark:text-white">
                  🗓️ Sugestões para {result.nextMonth}
                </h3>
                <div className="space-y-2">
                  {result.review.tarefasSugeridasProximoMes.map((item, idx) => {
                    const checked = selectedSuggestionIdx.includes(idx);
                    const cfg = SCOPE_CONFIG[item.scope] ?? SCOPE_CONFIG.work;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => toggleSuggestion(idx)}
                        className={`flex min-h-[48px] w-full cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                          checked
                            ? 'border-[#6F1D2B] bg-[#FDF4F5] dark:border-[#991B1B] dark:bg-[#2B1217]'
                            : 'border-[#E6E2DA] bg-white opacity-60 dark:border-[#27272A] dark:bg-[#202026]'
                        }`}
                      >
                        <span
                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[12px] font-bold ${
                            checked
                              ? 'border-[#6F1D2B] bg-[#6F1D2B] text-white'
                              : 'border-[#A1A1AA] bg-white'
                          }`}
                        >
                          {checked ? '✓' : ''}
                        </span>
                        <div className="flex-1">
                          <div className="text-[13px] font-bold text-[#0F0F12] dark:text-white">
                            {item.title}
                          </div>
                          {item.description && (
                            <p className="mt-0.5 text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                              {item.description}
                            </p>
                          )}
                          <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                            <span className="rounded bg-[#FAF7F2] px-2 py-0.5 text-[#3F3F46]">
                              📅 {item.date} {item.time ? `⏰ ${item.time}` : ''}
                            </span>
                            <span
                              className="rounded px-2 py-0.5"
                              style={{ backgroundColor: cfg.bgLight, color: cfg.color }}
                            >
                              {cfg.label}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Opção de Migrar Pendências */}
              <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] px-4 py-3 text-[13px] font-semibold text-[#0F0F12] dark:border-[#27272A] dark:bg-[#202026] dark:text-white">
                <input
                  type="checkbox"
                  checked={migratePending}
                  onChange={(e) => setMigratePending(e.target.checked)}
                  className="h-5 w-5 accent-[#6F1D2B]"
                />
                <span>
                  Migrar automaticamente <strong>{monthPendingTasks.length}</strong> tarefa(s)
                  pendente(s) de {selectedMonth} para {result.nextMonth}
                </span>
              </label>
            </div>
          )}
        </div>

        {/* Rodapé */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#F1EFEA] bg-[#FAF9F6] px-5 py-3.5 dark:border-[#27272A] dark:bg-[#141417]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] cursor-pointer rounded-xl border border-[#E6E2DA] bg-white px-4 text-[13px] font-bold text-[#52525B] dark:border-[#27272A] dark:bg-[#27272A] dark:text-[#D4D4D8]"
          >
            Fechar
          </button>

          {result?.review && (
            <button
              type="button"
              disabled={isApplying}
              onClick={handleApplyAndMigrate}
              className="min-h-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-5 text-[13px] font-bold text-white shadow-sm hover:bg-[#581521] active:scale-95 disabled:opacity-60"
            >
              {isApplying
                ? 'Aplicando em lote...'
                : 'Aplicar Sugestões e Migrar Pendentes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
