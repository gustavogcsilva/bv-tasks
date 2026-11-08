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
export async function sendTaskNotification(task: Task, customPrefix = 'Lembrete B.V.S Special'): Promise<boolean> {
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
      const summary = escapeIcsText(`[B.V.S Special • ${scopeLabel}] ${task.title}`);
      const description = escapeIcsText(
        task.description
          ? `${task.description} (Prioridade: ${task.priority})`
          : `Tarefa B.V.S Special — Escopo: ${scopeLabel}`,
      );

      return [
        'BEGIN:VEVENT',
        `UID:bvs-special-${task.id}@bvtasks.app`,
        `DTSTAMP:${stamp}Z`,
        `DTSTART:${dtStart}`,
        `DTEND:${dtEnd}`,
        `SUMMARY:${summary}`,
        `DESCRIPTION:${description}`,
        'BEGIN:VALARM',
        'TRIGGER:-PT15M',
        'ACTION:DISPLAY',
        `DESCRIPTION:Lembrete B.V.S Special: ${summary}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//B.V.S Special//Calendario e Tarefas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Exporta/Sincroniza uma ou mais tarefas abrindo o Calendário nativo do celular (.ics)
 */
export function syncTasksWithPhoneCalendar(tasks: Task[], filename = 'bvs-special-calendario.ics'): void {
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
  const title = encodeURIComponent(`[B.V.S Special • ${scopeLabel}] ${task.title}`);
  const details = encodeURIComponent(
    task.description ?? `Tarefa criada no B.V.S Special (${scopeLabel})`,
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dtStart}/${dtEnd}&details=${details}`;
}

/**
 * Converte caracteres acentuados e especiais para equivalentes seguros do encoding WinAnsi (PDF Type1 Standard Fonts)
 */
function sanitizePdfText(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .trim();
}

/**
 * Gera o binário de um documento PDF válido (padrão ISO 32000-1 / PDF 1.4)
 * contendo o relatório executivo das tarefas do B.V.S Special.
 */
export function generateTasksPdfBytes(
  tasks: Task[],
  options?: { title?: string; userName?: string },
): Uint8Array {
  const currentYear = new Date().getFullYear();
  const reportTitle = sanitizePdfText(options?.title || 'Relatorio de Tarefas - B.V.S Special');
  const userName = sanitizePdfText(options?.userName || 'Executivo B.V.S');
  const generatedAt = new Date().toLocaleDateString('pt-BR');

  const priorityLabelMap: Record<string, string> = {
    high: 'Alta',
    medium: 'Media',
    low: 'Baixa',
  };

  // Monta as linhas do relatório
  const lines: { text: string; bold?: boolean; size?: number; color?: string }[] = [
    { text: 'B.V.S SPECIAL - EXECUTIVE PLANNER', bold: true, size: 16, color: '0.6 0.1 0.1' },
    {
      text: `${reportTitle} | Usuario: ${userName} | Data: ${generatedAt}`,
      bold: false,
      size: 10,
      color: '0.35 0.35 0.38',
    },
    {
      text: '-----------------------------------------------------------------------------------------',
      size: 10,
      color: '0.6 0.1 0.1',
    },
  ];

  if (tasks.length === 0) {
    lines.push({
      text: 'Nenhuma tarefa registrada para o filtro ou periodo selecionado.',
      size: 11,
      color: '0.2 0.2 0.2',
    });
  } else {
    tasks.forEach((task, idx) => {
      const status = task.isCompleted ? '[CONCLUIDA]' : '[PENDENTE]';
      const scopeLabel = sanitizePdfText(SCOPE_CONFIG[task.scope]?.label ?? 'Trabalho');
      const prioLabel = priorityLabelMap[task.priority] ?? 'Media';
      const timeLabel = task.time ? ` as ${ sanitizePdfText(task.time) }` : '';
      const headerLine = `${idx + 1}. ${status} ${sanitizePdfText(task.title)}`;
      const metaLine = `   Data: ${sanitizePdfText(task.date)}${timeLabel} | Escopo: ${scopeLabel} | Prioridade: ${prioLabel}`;

      lines.push({
        text: headerLine.slice(0, 92),
        bold: true,
        size: 11,
        color: task.isCompleted ? '0.08 0.5 0.24' : '0.06 0.06 0.08',
      });
      lines.push({ text: metaLine.slice(0, 96), size: 9, color: '0.35 0.35 0.38' });

      if (task.description?.trim()) {
        const descLine = `   Obs.: ${sanitizePdfText(task.description.trim())}`;
        lines.push({ text: descLine.slice(0, 96), size: 9, color: '0.25 0.25 0.28' });
      }
      lines.push({ text: ' ', size: 6 });
    });
  }

  lines.push({
    text: '-----------------------------------------------------------------------------------------',
    size: 10,
    color: '0.6 0.1 0.1',
  });
  lines.push({
    text: `B.V.S Special - Created By Gustavo Geraldo © ${currentYear}`,
    bold: true,
    size: 9,
    color: '0.6 0.1 0.1',
  });

  // Constrói comandos gráficos PDF (A4: 595 x 842 pt)
  const ops: string[] = [];
  let y = 795;

  for (const line of lines) {
    if (y < 55) break; // Limite seguro da página A4
    const font = line.bold ? '/F2' : '/F1';
    const fontSize = line.size ?? 10;
    const rgb = line.color ?? '0.1 0.1 0.1';
    ops.push(`BT ${font} ${fontSize} Tf ${rgb} rg 42 ${y} Td (${line.text}) Tj ET`);
    y -= fontSize + 6;
  }

  const streamContent = ops.join('\n');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    `6 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(pdf);
}

/**
 * Gera e faz o download direto de um arquivo PDF (.pdf) das tarefas no celular ou computador.
 */
export function exportTasksToPdf(
  tasks: Task[],
  filename = 'bvs-special-tarefas.pdf',
  options?: { title?: string; userName?: string },
): boolean {
  if (typeof document === 'undefined') return false;

  const pdfBytes = generateTasksPdfBytes(tasks, options);
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  setTimeout(() => URL.revokeObjectURL(url), 2500);
  return true;
}
