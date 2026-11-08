import { SCOPE_CONFIG, type Task } from '../features/tasks/types/task.types';

/**
 * Verifica se a API de Notificações está disponível no navegador/aparelho.
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * Retorna o status atual da permissão de notificações ('granted' | 'denied' | 'default' | 'unsupported').
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

/**
 * Solicita permissão do usuário para enviar notificações no celular (Android / iOS PWA) e computador.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) return false;
  if (Notification.permission === 'granted') return true;

  try {
    const result = await Notification.requestPermission();
    return result === 'granted';
  } catch {
    return false;
  }
}

/**
 * Dispara uma notificação nativa no celular/computador para uma tarefa específica.
 * Usa ServiceWorkerRegistration.showNotification (compatível com Android e iOS PWA)
 * com fallback para o construtor Notification padrão.
 */
export async function sendTaskNotification(task: Task, customPrefix = 'Lembrete B V Tasks'): Promise<boolean> {
  if (!isNotificationSupported()) return false;

  if (Notification.permission !== 'granted') {
    const granted = await requestNotificationPermission();
    if (!granted) return false;
  }

  const scopeLabel = SCOPE_CONFIG[task.scope]?.label ?? 'Tarefa';
  const timeInfo = task.time ? ` às ${task.time}` : '';
  const title = `${customPrefix}: ${task.title}`;
  const body = `[${scopeLabel}] Data: ${task.date}${timeInfo}${
    task.description ? ` — ${task.description}` : ''
  }`;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, {
          body,
          icon: '/apple-touch-icon.png',
          badge: '/apple-touch-icon.png',
          tag: `bv-task-${task.id}`,
        });
        return true;
      }
    }

    new Notification(title, {
      body,
      icon: '/apple-touch-icon.png',
      tag: `bv-task-${task.id}`,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Formata data YYYY-MM-DD e hora HH:mm para o padrão iCalendar (YYYYMMDDTHHMMSS)
 */
function formatIcsDateTime(dateStr: string, timeStr?: string, addMinutes = 0): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = (timeStr && /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '09:00')
    .split(':')
    .map(Number);

  const dt = new Date(year, (month || 1) - 1, day || 1, hour || 9, (minute || 0) + addMinutes, 0);
  const pad = (n: number) => String(n).padStart(2, '0');

  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(
    dt.getHours(),
  )}${pad(dt.getMinutes())}00`;
}

function escapeIcsText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

/**
 * Gera o conteúdo de um arquivo .ics (iCalendar RFC 5545) com alarme nativo (VALARM)
 * para sincronizar tarefas diretamente com o Calendário do iPhone (Apple Calendar),
 * Android (Google / Samsung Calendar) ou Outlook.
 */
export function generateIcsContent(tasks: Task[]): string {
  const stamp = formatIcsDateTime(new Date().toISOString().slice(0, 10), '09:00');

  const events = tasks
    .map((task) => {
      const dtStart = formatIcsDateTime(task.date, task.time, 0);
      const dtEnd = formatIcsDateTime(task.date, task.time, 60);
      const scopeLabel = SCOPE_CONFIG[task.scope]?.label ?? 'Tarefa';
      const summary = escapeIcsText(`[B V Tasks • ${scopeLabel}] ${task.title}`);
      const description = escapeIcsText(
        task.description
          ? `${task.description} (Prioridade: ${task.priority})`
          : `Tarefa B V Tasks — Escopo: ${scopeLabel}`,
      );

      return [
        'BEGIN:VEVENT',
        `UID:bv-tasks-${task.id}@bvtasks.app`,
        `DTSTAMP:${stamp}Z`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Lembrete B V Tasks: ${summary}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//B V Tasks//Calendario e Tarefas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Exporta/Sincroniza uma ou mais tarefas abrindo o Calendário nativo do celular (.ics)
 */
export function syncTasksWithPhoneCalendar(tasks: Task[], filename = 'bv-tasks-calendario.ics'): void {
  if (tasks.length === 0 || typeof document === 'undefined') return;

  const icsContent = generateIcsContent(tasks);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Gera URL direta de sincronização com o Google Calendar (Android / iOS / Web)
 */
export function getGoogleCalendarUrl(task: Task): string {
  const dtStart = formatIcsDateTime(task.date, task.time, 0);
  const dtEnd = formatIcsDateTime(task.date, task.time, 60);
  const scopeLabel = SCOPE_CONFIG[task.scope]?.label ?? 'Tarefa';
  const title = encodeURIComponent(`[B V Tasks • ${scopeLabel}] ${task.title}`);
  const details = encodeURIComponent(
    task.description ?? `Tarefa criada no B V Tasks (${scopeLabel})`,
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dtStart}/${dtEnd}&details=${details}`;
}
