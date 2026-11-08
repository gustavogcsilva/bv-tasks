import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { format, isValid, parse } from 'date-fns';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { readFileAsAttachment } from '../../../services/storage';
import {
  SCOPE_CONFIG,
  type Priority,
  type Scope,
  type TaskAttachment,
  type TaskDraft,
  type TaskFolder,
} from '../types/task.types';

interface TaskModalProps {
  visible: boolean;
  selectedDate: Date;
  folders?: TaskFolder[];
  defaultFolderId?: string;
  onClose: () => void;
  onSubmit: (
    draft: TaskDraft,
    options?: {
      syncWithPhoneCalendar?: boolean;
      notifyOnPhone?: boolean;
      exportAsPdf?: boolean;
    },
  ) => void;
}

const priorityOptions: { value: Priority; label: string; color: string }[] = [
  { value: 'high', label: 'Alta', color: '#DC2626' },
  { value: 'medium', label: 'Média', color: '#D97706' },
  { value: 'low', label: 'Baixa', color: '#059669' },
];

const scopeOptions: { value: Scope; label: string; color: string }[] = [
  { value: 'work', label: SCOPE_CONFIG.work.label, color: SCOPE_CONFIG.work.color },
  { value: 'personal', label: SCOPE_CONFIG.personal.label, color: SCOPE_CONFIG.personal.color },
  { value: 'study', label: SCOPE_CONFIG.study.label, color: SCOPE_CONFIG.study.color },
];

/**
 * Formata automaticamente o horário (HH:mm) com dois-pontos (:)
 * quando o usuário digita apenas números no celular ou computador.
 */
export function formatTimeMask(raw: string, prevValue = ''): string {
  // Se o usuário já digitou ou colou com ":", preserva apenas dígitos e um único ":"
  if (raw.includes(':')) {
    const cleaned = raw.replace(/[^\d:]/g, '');
    const [hours = '', minutes = ''] = cleaned.split(':');
    const h = hours.slice(0, 2);
    const m = minutes.slice(0, 2);
    // Se o usuário apagou os minutos e parou no ":", permite apagar o ":" ao pressionar Backspace
    if (prevValue.endsWith(':') && cleaned === h && !raw.endsWith(':')) {
      return h;
    }
    return m.length > 0 || raw.endsWith(':') ? `${h}:${m}` : h;
  }

  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length === 0) return '';

  // Se o usuário estiver apagando o ":" (ex: estava "14:" e apagou o ":")
  if (prevValue.endsWith(':') && digits.length === 2 && raw.length < prevValue.length) {
    return digits.slice(0, 1);
  }

  // Auto-completa 0 à esquerda se o 1º dígito for entre 3 e 9 (ex: "9" + "30" -> "09:30")
  if (digits.length >= 2 && Number(digits[0]) > 2) {
    const padded = `0${digits}`.slice(0, 4);
    return `${padded.slice(0, 2)}:${padded.slice(2)}`;
  }

  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Formata automaticamente a data (AAAA-MM-DD) com hífens (-)
 * quando o usuário digita apenas números no celular ou computador.
 */
export function formatDateMask(raw: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/**
 * Normaliza entradas rápidas de horário ao sair do campo ou enviar (ex: "9" -> "09:00", "930" -> "09:30", "14" -> "14:00")
 */
export function normalizeTimeOnSubmit(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 1) {
    return `0${digits}:00`;
  }
  if (digits.length === 2) {
    const h = Number(digits);
    if (h >= 0 && h <= 23) return `${digits}:00`;
  }
  if (digits.length === 3) {
    const h = `0${digits[0]}`;
    const m = digits.slice(1, 3);
    if (Number(m) <= 59) return `${h}:${m}`;
  }
  if (digits.length === 4) {
    const h = digits.slice(0, 2);
    const m = digits.slice(2, 4);
    if (Number(h) <= 23 && Number(m) <= 59) return `${h}:${m}`;
  }
  return trimmed;
}

export function TaskModal({
  visible,
  selectedDate,
  folders = [],
  defaultFolderId = '',
  onClose,
  onSubmit,
}: TaskModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => format(selectedDate, 'yyyy-MM-dd'));
  const [time, setTime] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [scope, setScope] = useState<Scope>('work');
  const [folderId, setFolderId] = useState<string>(defaultFolderId);
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [syncCalendar, setSyncCalendar] = useState(false);
  const [notifyPhone, setNotifyPhone] = useState(false);
  const [exportPdfOnCreate, setExportPdfOnCreate] = useState(false);
  const [error, setError] = useState('');

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (visible) {
      setDate(format(selectedDate, 'yyyy-MM-dd'));
      setFolderId(defaultFolderId && defaultFolderId !== 'all' ? defaultFolderId : '');
      setError('');
    }
  }, [selectedDate, visible, defaultFolderId]);

  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  if (!visible) {
    return null;
  }

  async function handleFilesChosen(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      try {
        const attachment = await readFileAsAttachment(file);
        setAttachments((prev) => [...prev, attachment]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao anexar arquivo.');
      }
    }
    event.target.value = '';
  }

  function removeDraftAttachment(id: string) {
    setAttachments((prev) => prev.filter((item) => item.id !== id));
  }

  function handleTimeChange(nextRaw: string) {
    setTime((prev) => formatTimeMask(nextRaw, prev));
    if (error) setError('');
  }

  function handleDateChange(nextRaw: string) {
    if (nextRaw.includes('-')) {
      setDate(nextRaw.replace(/[^\d-]/g, '').slice(0, 10));
    } else {
      setDate(formatDateMask(nextRaw));
    }
    if (error) setError('');
  }

  function handleSubmit(event?: FormEvent) {
    event?.preventDefault();
    const trimmedTitle = title.trim();
    const trimmedDate = date.trim();
    const normalizedTime = normalizeTimeOnSubmit(time);
    const parsedDate = parse(trimmedDate, 'yyyy-MM-dd', new Date());

    if (!trimmedTitle) {
      setError('Informe um título para a tarefa.');
      return;
    }
    if (!isValid(parsedDate) || format(parsedDate, 'yyyy-MM-dd') !== trimmedDate) {
      setError('Use uma data válida no formato AAAA-MM-DD.');
      return;
    }
    if (normalizedTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(normalizedTime)) {
      setError('Informe um horário válido no formato HH:mm (ex.: 09:30 ou 14:00).');
      return;
    }

    onSubmit(
      {
        title: trimmedTitle,
        ...(description.trim() ? { description: description.trim() } : {}),
        date: trimmedDate,
        ...(normalizedTime ? { time: normalizedTime } : {}),
        priority,
        scope,
        ...(folderId ? { folderId } : {}),
        ...(attachments.length > 0 ? { attachments } : {}),
      },
      {
        syncWithPhoneCalendar: syncCalendar,
        notifyOnPhone: notifyPhone,
        exportAsPdf: exportPdfOnCreate,
      },
    );
    resetFields();
  }

  function resetFields() {
    setTitle('');
    setDescription('');
    setTime('');
    setPriority('medium');
    setScope('work');
    setFolderId('');
    setAttachments([]);
    setSyncCalendar(false);
    setNotifyPhone(false);
    setExportPdfOnCreate(false);
    setError('');
  }

  function close() {
    resetFields();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      className="animate-modal-backdrop fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-[2px] sm:items-center sm:p-4"
    >
      <div aria-hidden="true" onClick={close} className="fixed inset-0" />

      <div className="animate-modal-content safe-bottom relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[24px] bg-[#F8F7F4] px-[22px] pt-2.5 pb-7 shadow-2xl sm:rounded-[24px] dark:border dark:border-[#27272A] dark:bg-[#141418]">
        <div className="mx-auto mb-4 h-1 w-[38px] shrink-0 rounded-full bg-[#D6D3CD] sm:hidden dark:bg-[#3F3F46]" />

        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2
              id="task-modal-title"
              className="font-editorial text-[22px] sm:text-[24px] font-bold tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]"
            >
              Nova tarefa
            </h2>
            <p className="font-heading mt-0.5 text-[13px] font-medium text-[#71717A] dark:text-[#A1A1AA]">
              Planeje seu foco em Trabalho, Pessoal ou Estudo no BVS Special
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={close}
            className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-full bg-[#E5E4E0] text-[22px] leading-none text-[#27272A] transition-colors hover:bg-[#D6D3CD] active:scale-95 dark:bg-[#27272A] dark:text-[#FAFAFA]"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5 overflow-y-auto pb-1">
          <Input
            autoFocus
            label="Título"
            onChangeText={setTitle}
            placeholder="Ex.: Revisar contrato ou estudar capítulo 4"
            value={title}
          />

          <Input
            label="Descrição (opcional)"
            multiline
            onChangeText={setDescription}
            placeholder="Adicione observações ou links importantes"
            value={description}
          />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
            <Input
              label="Data"
              type="text"
              inputMode="numeric"
              maxLength={10}
              onChangeText={handleDateChange}
              placeholder="AAAA-MM-DD"
              value={date}
            />
            <Input
              label="Horário"
              type="text"
              inputMode="numeric"
              maxLength={5}
              onChangeText={handleTimeChange}
              onBlur={() => setTime((prev) => normalizeTimeOnSubmit(prev))}
              placeholder="HH:mm (ex.: 14:30)"
              value={time}
            />
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[#27272A] dark:text-[#D4D4D8]">
              Escopo (Cor no Calendário)
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Escopo">
              {scopeOptions.map((option) => (
                <OptionChip
                  key={option.value}
                  label={option.label}
                  color={option.color}
                  selected={scope === option.value}
                  onPress={() => setScope(option.value)}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[#27272A] dark:text-[#D4D4D8]">
              Prioridade
            </span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Prioridade">
              {priorityOptions.map((option) => (
                <OptionChip
                  key={option.value}
                  label={option.label}
                  color={option.color}
                  selected={priority === option.value}
                  onPress={() => setPriority(option.value)}
                />
              ))}
            </div>
          </div>

          {/* Seleção de Pasta */}
          {folders.length > 0 && (
            <div className="flex flex-col gap-2">
              <label
                htmlFor="task-folder-select"
                className="text-[13px] font-semibold text-[#27272A] dark:text-[#D4D4D8]"
              >
                Pasta (opcional)
              </label>
              <select
                id="task-folder-select"
                value={folderId}
                onChange={(e) => setFolderId(e.target.value)}
                className="min-h-[46px] w-full rounded-xl border border-[#D6D3CD] bg-white px-3.5 text-[15px] text-[#0F0F12] outline-none focus:border-[#991B1B] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5]"
              >
                <option value="">Sem pasta específica</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    📁 {folder.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Câmera do Celular e Upload de Imagens / PDFs */}
          <div className="flex flex-col gap-2">
            <span className="text-[13px] font-semibold text-[#27272A] dark:text-[#D4D4D8]">
              Fotos da Câmera ou Arquivos PDF
            </span>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFilesChosen}
              className="hidden"
              aria-label="Usar câmera do celular"
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.pdf"
              multiple
              onChange={handleFilesChosen}
              className="hidden"
              aria-label="Escolher imagem ou PDF"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-[#FECACA] bg-[#FEE2E2] px-3.5 text-[13px] font-bold text-[#991B1B] transition-colors hover:bg-[#FECACA] active:scale-95 dark:border-[#7F1D1D] dark:bg-[#3B1219] dark:text-[#FCA5A5]"
              >
                📷 Usar Câmera do Celular
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border border-[#D6D3CD] bg-white px-3.5 text-[13px] font-bold text-[#27272A] transition-colors hover:bg-[#F1EFEA] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5]"
              >
                📎 Anexar Imagem ou PDF
              </button>
            </div>

            {attachments.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-2 rounded-xl border border-[#D6D3CD] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#0F0F12] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5]"
                  >
                    <span>{att.type === 'pdf' ? '📄' : '🖼️'}</span>
                    <span className="max-w-[140px] truncate">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => removeDraftAttachment(att.id)}
                      className="ml-1 text-[#B91C1C] hover:opacity-80"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Opções de Notificação, Exportação PDF e Sincronização com Calendário do Celular */}
          <div className="flex flex-col gap-2 rounded-2xl border border-[#E5E4E0] bg-white p-3 dark:border-[#2E2E34] dark:bg-[#1C1C22]">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-[#27272A] dark:text-[#E4E4E7]">
              <input
                type="checkbox"
                checked={notifyPhone}
                onChange={(e) => setNotifyPhone(e.target.checked)}
                className="h-4 w-4 accent-[#991B1B]"
              />
              <span>🔔 Enviar notificação no celular ao salvar/no horário</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-[#27272A] dark:text-[#E4E4E7]">
              <input
                type="checkbox"
                checked={syncCalendar}
                onChange={(e) => setSyncCalendar(e.target.checked)}
                className="h-4 w-4 accent-[#991B1B]"
              />
              <span>📅 Sincronizar com o Calendário do Celular (iPhone / Android)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] font-semibold text-[#27272A] dark:text-[#E4E4E7]">
              <input
                type="checkbox"
                checked={exportPdfOnCreate}
                onChange={(e) => setExportPdfOnCreate(e.target.checked)}
                className="h-4 w-4 accent-[#991B1B]"
              />
              <span>📄 Gerar arquivo da tarefa e exportar como PDF (.pdf)</span>
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-[13px] font-medium text-[#B91C1C] dark:text-[#FCA5A5]">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="mt-1 w-full">
            Criar tarefa
          </Button>
        </form>
      </div>
    </div>
  );
}

interface OptionChipProps {
  label: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}

function OptionChip({ label, color, selected, onPress }: OptionChipProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPress}
      style={selected ? { backgroundColor: color, borderColor: color } : undefined}
      className={`min-h-[39px] cursor-pointer rounded-xl border px-[15px] text-[13px] font-bold transition-all active:scale-95 ${
        selected
          ? 'text-white shadow-sm'
          : 'border-[#D6D3CD] bg-white text-[#52525B] hover:border-[#A1A1AA] dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#D4D4D8]'
      }`}
    >
      {label}
    </button>
  );
}
