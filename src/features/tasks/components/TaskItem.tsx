import { useRef, useState, type ChangeEvent } from 'react';
import { Badge } from '../../../components/ui/Badge';
import { Card } from '../../../components/ui/Card';
import {
  exportTasksToPdf,
  getGoogleCalendarUrl,
  sendTaskNotification,
  syncTasksWithPhoneCalendar,
} from '../../../services/notificationsAndCalendar';
import { readFileAsAttachment } from '../../../services/storage';
import {
  SCOPE_CONFIG,
  type Task,
  type TaskAttachment,
  type TaskFolder,
} from '../types/task.types';

const priorityColors = {
  high: '#DC2626',
  medium: '#D97706',
  low: '#059669',
} as const;

const priorityLabels = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
} as const;

interface TaskItemProps {
  task: Task;
  folder?: TaskFolder;
  isRecentlyCreated?: boolean;
  isHighlighted?: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onAddAttachment?: (attachment: TaskAttachment) => void;
  onRemoveAttachment?: (attachmentId: string) => void;
}

export function TaskItem({
  task,
  folder,
  isRecentlyCreated,
  isHighlighted,
  onToggle,
  onDelete,
  onAddAttachment,
  onRemoveAttachment,
}: TaskItemProps) {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<TaskAttachment | null>(null);
  const [notificationFeedback, setNotificationFeedback] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const scopeInfo = SCOPE_CONFIG[task.scope] ?? SCOPE_CONFIG.work;
  const attachments = task.attachments ?? [];

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0 || !onAddAttachment) return;

    for (const file of Array.from(files)) {
      try {
        const attachment = await readFileAsAttachment(file);
        onAddAttachment(attachment);
      } catch {
        // Ignora arquivo inválido
      }
    }
    event.target.value = '';
  }

  async function handleNotifyPhone() {
    const sent = await sendTaskNotification(task);
    setNotificationFeedback(
      sent
        ? 'Notificação enviada para o aparelho!'
        : 'Permita notificações no navegador do celular.',
    );
    setTimeout(() => setNotificationFeedback(null), 3000);
  }

  function handleSyncCalendar() {
    syncTasksWithPhoneCalendar([task], `bvs-special-task-${task.date}.ics`);
  }

  function handleExportTaskPdf() {
    exportTasksToPdf([task], `bvs-special-tarefa-${task.date}.pdf`, {
      title: `Ficha de Tarefa: ${task.title}`,
    });
  }

  const isPulsing = isRecentlyCreated || isHighlighted;

  return (
    <Card
      id={`task-card-${task.id}`}
      className={`flex min-h-[150px] overflow-hidden transition-all duration-300 ${
        task.isCompleted ? 'opacity-70' : ''
      } ${
        isPulsing
          ? 'animate-task-enter ring-2 ring-[#991B1B] shadow-xl shadow-[#991B1B]/25 animate-highlight-pulse scale-[1.01]'
          : ''
      }`}
    >
      {/* Barra lateral na cor do Escopo (Trabalho: Vinho, Pessoal: Azul, Estudo: Rosa) */}
      <div
        className="w-2 shrink-0"
        style={{ backgroundColor: scopeInfo.color }}
      />

      <div className="flex flex-1 flex-col justify-between gap-2.5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              label={scopeInfo.label}
              color={scopeInfo.color}
              backgroundColor={scopeInfo.bgLight}
            />
            {folder && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-[#F1EFEA] px-2.5 py-1 text-[11px] font-bold text-[#27272A] dark:bg-[#27272A] dark:text-[#E4E4E7]">
                📁 {folder.name}
              </span>
            )}
            <span
              className="text-[11px] font-bold"
              style={{ color: priorityColors[task.priority] }}
            >
              ● Prioridade {priorityLabels[task.priority]}
            </span>
          </div>
          {task.time ? (
            <span className="rounded-md bg-[#F8F7F4] px-2.5 py-0.5 text-[12px] font-bold text-[#3F3F46] dark:bg-[#27272A] dark:text-[#D4D4D8]">
              ⏰ {task.time}
            </span>
          ) : null}
        </div>

        <div>
          <h3
            className={`line-clamp-2 text-[16px] font-bold leading-snug ${
              task.isCompleted
                ? 'text-[#71717A] line-through dark:text-[#71717A]'
                : 'text-[#0F0F12] dark:text-[#FAFAFA]'
            }`}
          >
            {task.title}
          </h3>
          {task.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-[#52525B] dark:text-[#A1A1AA]">
              {task.description}
            </p>
          ) : null}
        </div>

        {/* Lista de Anexos (Imagens da Câmera ou PDFs) */}
        {attachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="group relative inline-flex items-center gap-2 rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] p-1.5 pr-2.5 text-[12px] dark:border-[#2E2E34] dark:bg-[#1C1C22]"
              >
                {att.type === 'image' ? (
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(att)}
                    className="flex cursor-pointer items-center gap-2 text-left font-semibold text-[#0F0F12] hover:text-[#991B1B] dark:text-[#F4F4F5]"
                  >
                    <img
                      src={att.dataUrl}
                      alt={att.name}
                      className="h-9 w-9 rounded-lg border border-[#E5E4E0] object-cover dark:border-[#2E2E34]"
                    />
                    <span className="max-w-[130px] truncate">{att.name}</span>
                  </button>
                ) : (
                  <a
                    href={att.dataUrl}
                    download={att.name}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 font-semibold text-[#991B1B] hover:underline dark:text-[#FCA5A5]"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#FEE2E2] text-[16px] dark:bg-[#3B1219]">
                      📄
                    </span>
                    <span className="max-w-[130px] truncate">{att.name}</span>
                  </a>
                )}

                {onRemoveAttachment && (
                  <button
                    type="button"
                    aria-label={`Remover anexo ${att.name}`}
                    onClick={() => onRemoveAttachment(att.id)}
                    className="ml-1 flex h-5 w-5 cursor-pointer items-center justify-center rounded-full bg-[#E5E4E0] text-[12px] text-[#52525B] hover:bg-[#FDECEC] hover:text-[#B91C1C] dark:bg-[#27272A] dark:text-[#D4D4D8]"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {notificationFeedback && (
          <p className="text-[11px] font-bold text-[#991B1B] dark:text-[#FCA5A5]">
            🔔 {notificationFeedback}
          </p>
        )}

        {/* Modal de Visualização de Foto da Câmera / Imagem */}
        {previewAttachment && (
          <div
            role="dialog"
            aria-label={`Visualizando ${previewAttachment.name}`}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
            onClick={() => setPreviewAttachment(null)}
          >
            <div
              className="relative max-h-[90dvh] max-w-lg overflow-hidden rounded-2xl bg-white p-3 shadow-2xl dark:bg-[#141418]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-bold text-[#0F0F12] dark:text-[#FAFAFA]">
                  {previewAttachment.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="cursor-pointer rounded-lg bg-[#F1EFEA] px-2.5 py-1 text-[12px] font-bold text-[#0F0F12] dark:bg-[#27272A] dark:text-[#FAFAFA]"
                >
                  Fechar
                </button>
              </div>
              <img
                src={previewAttachment.dataUrl}
                alt={previewAttachment.name}
                className="max-h-[75dvh] w-full rounded-xl object-contain"
              />
            </div>
          </div>
        )}

        {/* Inputs ocultos para Câmera do Celular e Upload de PDF/Imagem */}
        {onAddAttachment && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileSelect}
              className="hidden"
              aria-label={`Capturar foto para ${task.title}`}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              aria-label={`Anexar imagem ou PDF para ${task.title}`}
            />
          </>
        )}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 border-t border-[#F1EFEA] pt-2.5 dark:border-[#27272A]">
          <div className="flex flex-wrap items-center gap-1.5">
            {isConfirmingDelete ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onDelete}
                  className="min-h-[34px] cursor-pointer rounded-lg bg-[#FDECEC] px-3 text-[12px] font-bold text-[#B91C1C] transition-colors hover:bg-[#FADADA] active:scale-95"
                >
                  Confirmar exclusão
                </button>
                <button
                  type="button"
                  onClick={() => setIsConfirmingDelete(false)}
                  className="min-h-[34px] cursor-pointer px-2 text-[12px] font-semibold text-[#71717A] hover:text-[#0F0F12] dark:hover:text-white"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsConfirmingDelete(true)}
                className="min-h-[34px] cursor-pointer px-1.5 text-[12px] font-semibold text-[#B91C1C] transition-opacity hover:opacity-80 active:scale-95 dark:text-[#F87171]"
              >
                Excluir
              </button>
            )}

            {onAddAttachment && (
              <>
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-[32px] cursor-pointer rounded-lg bg-[#FEE2E2] px-2.5 text-[11px] font-bold text-[#991B1B] transition-colors hover:bg-[#FECACA] active:scale-95 dark:bg-[#3B1219] dark:text-[#FCA5A5]"
                >
                  📷 Câmera
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="min-h-[32px] cursor-pointer rounded-lg bg-[#F1EFEA] px-2.5 text-[11px] font-bold text-[#27272A] transition-colors hover:bg-[#E5E2DC] active:scale-95 dark:bg-[#27272A] dark:text-[#E4E4E7]"
                >
                  📎 Foto/PDF
                </button>
              </>
            )}

            {/* Notificação no Celular & Sincronização com Calendário Nativo (iOS / Android) */}
            <button
              type="button"
              onClick={handleNotifyPhone}
              title="Receber notificação desta tarefa no celular"
              className="min-h-[32px] cursor-pointer rounded-lg bg-[#F1EFEA] px-2.5 text-[11px] font-bold text-[#27272A] transition-colors hover:bg-[#E5E2DC] active:scale-95 dark:bg-[#27272A] dark:text-[#E4E4E7]"
            >
              🔔 Notificar
            </button>

            <button
              type="button"
              onClick={handleSyncCalendar}
              title="Sincronizar com o Calendário do iPhone / Android (.ics)"
              className="min-h-[32px] cursor-pointer rounded-lg bg-[#F1EFEA] px-2.5 text-[11px] font-bold text-[#27272A] transition-colors hover:bg-[#E5E2DC] active:scale-95 dark:bg-[#27272A] dark:text-[#E4E4E7]"
            >
              📅 Calendário (.ics)
            </button>

            <button
              type="button"
              onClick={handleExportTaskPdf}
              title="Gerar e exportar esta tarefa como arquivo PDF (.pdf)"
              className="min-h-[32px] cursor-pointer rounded-lg bg-[#FEE2E2] px-2.5 text-[11px] font-bold text-[#991B1B] transition-colors hover:bg-[#FECACA] active:scale-95 dark:bg-[#3B1219] dark:text-[#FCA5A5]"
            >
              📄 Exportar PDF
            </button>

            <a
              href={getGoogleCalendarUrl(task)}
              target="_blank"
              rel="noreferrer"
              title="Adicionar ao Google Calendar"
              className="inline-flex min-h-[32px] items-center rounded-lg bg-[#F1EFEA] px-2.5 text-[11px] font-bold text-[#27272A] transition-colors hover:bg-[#E5E2DC] dark:bg-[#27272A] dark:text-[#E4E4E7]"
            >
              Google Agenda
            </a>
          </div>

          <button
            type="button"
            role="checkbox"
            aria-checked={task.isCompleted}
            onClick={onToggle}
            className={`min-h-[34px] cursor-pointer rounded-[10px] px-3.5 text-[12px] font-bold transition-all active:scale-95 ${
              task.isCompleted
                ? 'bg-[#E8F4EE] text-[#15803D] dark:bg-[#143323] dark:text-[#86EFAC]'
                : 'bg-[#0F0F12] text-white hover:bg-[#27272A] dark:bg-[#991B1B] dark:hover:bg-[#7F1D1D]'
            }`}
          >
            {task.isCompleted ? '✓ Concluída' : 'Concluir'}
          </button>
        </div>
      </div>
    </Card>
  );
}
