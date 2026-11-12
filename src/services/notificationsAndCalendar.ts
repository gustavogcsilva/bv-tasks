import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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
export async function sendTaskNotification(task: Task, customPrefix = 'Lembrete BVS Special'): Promise<boolean> {
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
          tag: `bvs-special-${task.id}`,
        });
        return true;
      }
    }

    new Notification(title, {
      body,
      icon: '/apple-touch-icon.png',
      tag: `bvs-special-${task.id}`,
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
      const summary = escapeIcsText(`[BVS Special • ${scopeLabel}] ${task.title}`);
      const description = escapeIcsText(
        task.description
          ? `${task.description} (Prioridade: ${task.priority})`
          : `Tarefa BVS Special — Escopo: ${scopeLabel}`,
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
        `DESCRIPTION:Lembrete BVS Special: ${summary}`,
        'END:VALARM',
        'END:VEVENT',
      ].join('\r\n');
    })
    .join('\r\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BVS Special//Calendario e Tarefas//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    events,
    'END:VCALENDAR',
  ].join('\r\n');
}

/**
 * Exporta/Sincroniza uma ou mais tarefas abrindo o Calendário nativo do iPhone/Android via Web Share API
 * (`navigator.share` com `new File([icsContent], 'cronograma-bv.ics', { type: 'text/calendar' })`),
 * mantendo o download direto (.ics) como fallback no Desktop.
 */
export function syncTasksWithPhoneCalendar(
  tasks: Task[],
  filename = 'cronograma-bv.ics',
): void {
  if (tasks.length === 0 || typeof document === 'undefined') return;

  const safeFilename = filename.toLowerCase().endsWith('.ics')
    ? filename
    : `${filename}.ics`;
  const icsContent = generateIcsContent(tasks);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });

  const downloadFallback = () => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  };

  try {
    const isMobileOrIos =
      typeof navigator !== 'undefined' &&
      (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent || '') ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

    if (
      isMobileOrIos &&
      typeof navigator !== 'undefined' &&
      typeof navigator.share === 'function' &&
      typeof File !== 'undefined'
    ) {
      const icsFile = new File([icsContent], safeFilename, { type: 'text/calendar' });
      const canShareFiles =
        typeof navigator.canShare === 'function'
          ? navigator.canShare({ files: [icsFile] })
          : true;

      if (canShareFiles) {
        void navigator
          .share({
            files: [icsFile],
            title: 'Cronograma BVS Special (.ics)',
            text: 'Adicionar tarefas ao Calendário do iPhone / Android',
          })
          .catch((err: unknown) => {
            if (err instanceof Error && err.name === 'AbortError') return;
            downloadFallback();
          });
        return;
      }
    }
  } catch {
    // Segue para download direto do .ics
  }

  downloadFallback();
}

/**
 * Gera URL direta de sincronização com o Google Calendar (Android / iOS / Web)
 */
export function getGoogleCalendarUrl(task: Task): string {
  const dtStart = formatIcsDateTime(task.date, task.time, 0);
  const dtEnd = formatIcsDateTime(task.date, task.time, 60);
  const scopeLabel = SCOPE_CONFIG[task.scope]?.label ?? 'Tarefa';
  const title = encodeURIComponent(`[BVS Special • ${scopeLabel}] ${task.title}`);
  const details = encodeURIComponent(
    task.description ?? `Tarefa criada no BVS Special (${scopeLabel})`,
  );

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dtStart}/${dtEnd}&details=${details}`;
}

export interface PdfExportOptions {
  title?: string;
  userName?: string;
  periodLabel?: string;
}

/**
 * Converte string YYYY-MM-DD para DD/MM/YYYY amigável em português no relatório executivo.
 */
function formatDisplayDateBr(dateStr: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || '').trim());
  if (!match) return dateStr || '-';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/**
 * Desenha o brasão vetorial BVS Special no cabeçalho do PDF (Garrafa + Taça + Livro Aberto).
 */
function drawBvsCrestOnPdf(doc: jsPDF, x: number, y: number, sizeMm: number): void {
  const s = sizeMm / 24;

  // Fundo escuro com moldura dourada
  doc.setFillColor(15, 15, 18);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, sizeMm, sizeMm, 2.2, 2.2, 'FD');

  // Garrafa de Vinho (esquerda)
  doc.setFillColor(24, 24, 27);
  doc.setDrawColor(253, 230, 138);
  doc.setLineWidth(0.35);
  doc.rect(x + 7.2 * s, y + 3.2 * s, 2.2 * s, 3.0 * s, 'FD');
  doc.setFillColor(220, 38, 38);
  doc.rect(x + 7.0 * s, y + 3.2 * s, 2.6 * s, 1.0 * s, 'F');
  doc.setFillColor(24, 24, 27);
  doc.roundedRect(x + 6.0 * s, y + 6.2 * s, 4.6 * s, 7.6 * s, 0.8 * s, 0.8 * s, 'FD');
  doc.setFillColor(153, 27, 27);
  doc.rect(x + 6.7 * s, y + 8.5 * s, 3.2 * s, 3.2 * s, 'F');

  // Taça de Vinho (direita)
  doc.setFillColor(220, 38, 38);
  doc.triangle(
    x + 12.6 * s,
    y + 7.0 * s,
    x + 17.6 * s,
    y + 7.0 * s,
    x + 15.1 * s,
    y + 11.2 * s,
    'F',
  );
  doc.setDrawColor(253, 230, 138);
  doc.setLineWidth(0.4);
  doc.line(x + 12.3 * s, y + 6.0 * s, x + 17.9 * s, y + 6.0 * s);
  doc.line(x + 15.1 * s, y + 11.0 * s, x + 15.1 * s, y + 14.0 * s);
  doc.line(x + 13.4 * s, y + 14.0 * s, x + 16.8 * s, y + 14.0 * s);

  // Livro Aberto na base
  doc.setFillColor(250, 250, 250);
  doc.setDrawColor(253, 230, 138);
  doc.roundedRect(x + 4.4 * s, y + 15.2 * s, 15.2 * s, 3.6 * s, 0.6 * s, 0.6 * s, 'FD');
  doc.setDrawColor(153, 27, 27);
  doc.setLineWidth(0.5);
  doc.line(x + 12.0 * s, y + 15.2 * s, x + 12.0 * s, y + 18.8 * s);

  // Badge BVS SPECIAL
  doc.setFillColor(9, 9, 11);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.3);
  doc.roundedRect(x + 2.4 * s, y + 19.6 * s, 19.2 * s, 3.2 * s, 0.7 * s, 0.7 * s, 'FD');
  doc.setTextColor(253, 230, 138);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(4.6);
  doc.text('BVS SPECIAL', x + sizeMm / 2, y + 21.8 * s, { align: 'center' });
}

/**
 * Gera o binário de um relatório PDF executivo moderno e diferenciado usando jsPDF + jsPDF-AutoTable:
 * - Faixa superior colorida + filete dourado + brasão vetorial BVS Special
 * - Período analisado, usuário e data/hora de emissão
 * - Cards de KPIs no topo (Total, Concluídas com %, Pendentes, Alta Prioridade)
 * - Tabela limpa com zebra-striping, badges coloridos de Prioridade e Status
 * - Quebra automática de página sem cortar linhas e rodapé "Página X de Y"
 */
export function generateTasksPdfBytes(
  tasks: Task[],
  options?: PdfExportOptions,
): Uint8Array {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: false,
  });

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const marginX = 14;
  const contentWidth = pageWidth - marginX * 2;
  const currentYear = new Date().getFullYear();

  const reportTitle = (options?.title || 'Relatorio Executivo de Tarefas').trim();
  const userName = (options?.userName || 'Gustavo Geraldo').trim();

  // Dedução automática do período analisado caso não informado
  const sortedDates = tasks
    .map((t) => t.date)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const derivedPeriod =
    options?.periodLabel ||
    (sortedDates.length === 0
      ? 'Todo o Planejamento'
      : sortedDates[0] === sortedDates[sortedDates.length - 1]
        ? formatDisplayDateBr(sortedDates[0])
        : `${formatDisplayDateBr(sortedDates[0])} a ${formatDisplayDateBr(
            sortedDates[sortedDates.length - 1],
          )}`);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const generatedDateTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} as ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`;

  // 1. Cabeçalho Executivo Estilizado (Faixa Bordeaux + Filete Dourado)
  const headerHeight = 38;
  doc.setFillColor(69, 10, 10); // Vinho escuro profundo #450A0A
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setFillColor(127, 29, 29); // Gradiente visual bordeaux
  doc.rect(0, 0, pageWidth, 8, 'F');
  doc.setFillColor(212, 175, 55); // Filete dourado inferior #D4AF37
  doc.rect(0, headerHeight, pageWidth, 1.4, 'F');

  // Brasão vetorial BVS Special no cabeçalho
  drawBvsCrestOnPdf(doc, marginX, 7, 24);

  // Títulos principais ao lado do logo
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(253, 230, 138);
  doc.text('BVS SPECIAL  |  EXECUTIVE PLANNER', marginX + 28, 12.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15.5);
  doc.setTextColor(255, 255, 255);
  const titleLines = doc.splitTextToSize(reportTitle, 95);
  doc.text(titleLines[0] || 'Relatorio Executivo', marginX + 28, 19.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(228, 228, 231);
  doc.text(`Periodo analisado: ${derivedPeriod}`, marginX + 28, 25.5);
  doc.text(`Emitido em: ${generatedDateTime}`, marginX + 28, 30.2);

  // Bloco de Metadados à direita
  const metaBoxW = 54;
  const metaBoxX = pageWidth - marginX - metaBoxW;
  doc.setFillColor(38, 8, 10);
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(0.35);
  doc.roundedRect(metaBoxX, 8.5, metaBoxW, 23, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(253, 230, 138);
  doc.text('GESTOR / CONTA', metaBoxX + 3.5, 13.5);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text(userName.slice(0, 24), metaBoxX + 3.5, 18.0);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.8);
  doc.setTextColor(253, 230, 138);
  doc.text('REGISTROS NO DOCUMENTO', metaBoxX + 3.5, 23.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(228, 228, 231);
  doc.text(`${tasks.length} tarefa(s) listadas`, metaBoxX + 3.5, 27.8);

  // 2. Dashboard com 4 Cards de KPIs no topo
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const pendingCount = totalCount - completedCount;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const highPriorityCount = tasks.filter((t) => t.priority === 'high' && !t.isCompleted).length;

  const kpiY = 44.5;
  const kpiGap = 3.5;
  const kpiW = (contentWidth - kpiGap * 3) / 4;
  const kpiH = 19;

  const kpis: Array<{
    label: string;
    value: string;
    sub: string;
    bg: [number, number, number];
    border: [number, number, number];
    accent: [number, number, number];
    text: [number, number, number];
  }> = [
    {
      label: 'TOTAL DE TAREFAS',
      value: String(totalCount),
      sub: 'Escopo do relatorio',
      bg: [248, 247, 244],
      border: [226, 224, 219],
      accent: [24, 24, 27],
      text: [15, 15, 18],
    },
    {
      label: 'CONCLUIDAS',
      value: `${completedCount} (${completionPct}%)`,
      sub: 'Taxa de conclusao',
      bg: [240, 253, 244],
      border: [187, 247, 208],
      accent: [22, 163, 74],
      text: [21, 128, 61],
    },
    {
      label: 'PENDENTES',
      value: String(pendingCount),
      sub: 'Aguardando acao',
      bg: [255, 247, 237],
      border: [254, 215, 170],
      accent: [217, 119, 6],
      text: [180, 83, 9],
    },
    {
      label: 'ALTA PRIORIDADE',
      value: String(highPriorityCount),
      sub: 'Criticas pendentes',
      bg: [254, 242, 242],
      border: [254, 202, 202],
      accent: [185, 28, 28],
      text: [153, 27, 27],
    },
  ];

  kpis.forEach((card, idx) => {
    const cx = marginX + idx * (kpiW + kpiGap);
    doc.setFillColor(...card.bg);
    doc.setDrawColor(...card.border);
    doc.setLineWidth(0.35);
    doc.roundedRect(cx, kpiY, kpiW, kpiH, 2.2, 2.2, 'FD');

    // Tarja superior colorida do card
    doc.setFillColor(...card.accent);
    doc.roundedRect(cx, kpiY, kpiW, 1.5, 0.7, 0.7, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(card.label, cx + 3.2, kpiY + 5.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12.5);
    doc.setTextColor(...card.text);
    doc.text(card.value, cx + 3.2, kpiY + 12.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(card.sub, cx + 3.2, kpiY + 16.6);
  });

  // 3. Tabela Executiva com Zebra-Striping e Badges Coloridos via jsPDF-AutoTable
  if (tasks.length === 0) {
    doc.setFillColor(250, 249, 247);
    doc.setDrawColor(226, 224, 219);
    doc.roundedRect(marginX, 70, contentWidth, 26, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(39, 39, 42);
    doc.text('Nenhuma tarefa encontrada para os filtros selecionados.', pageWidth / 2, 81, {
      align: 'center',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      'Crie novas tarefas ou importe seu planejamento no aplicativo BVS Special.',
      pageWidth / 2,
      88,
      { align: 'center' },
    );
  } else {
    const scopeNameMap: Record<string, string> = {
      work: 'Trabalho',
      personal: 'Pessoal',
      study: 'Estudo',
    };
    const priorityNameMap: Record<string, string> = {
      high: 'Alta',
      medium: 'Media',
      low: 'Baixa',
    };

    const tableRows = tasks.map((task) => {
      const desc = task.description?.trim() ? `\nObs.: ${task.description.trim()}` : '';
      const timeStr = task.time ? `\nas ${task.time}` : '\nDia todo';
      return {
        statusRaw: task.isCompleted ? 'CONCLUIDA' : 'PENDENTE',
        titleBlock: `${task.title}${desc}`,
        scopeRaw: scopeNameMap[task.scope] || 'Trabalho',
        scopeKey: task.scope,
        dateTime: `${formatDisplayDateBr(task.date)}${timeStr}`,
        priorityRaw: priorityNameMap[task.priority] || 'Media',
        priorityKey: task.priority,
      };
    });

    autoTable(doc, {
      startY: 69,
      margin: { top: 26, bottom: 20, left: marginX, right: marginX },
      rowPageBreak: 'avoid',
      showHead: 'everyPage',
      theme: 'striped',
      headStyles: {
        fillColor: [69, 10, 10],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
      },
      bodyStyles: {
        fontSize: 8.2,
        textColor: [24, 24, 27],
        cellPadding: { top: 3.2, bottom: 3.2, left: 3, right: 3 },
        valign: 'middle',
        lineColor: [235, 233, 228],
        lineWidth: 0.2,
      },
      alternateRowStyles: {
        fillColor: [250, 249, 247],
      },
      columns: [
        { header: 'STATUS', dataKey: 'statusRaw' },
        { header: 'TAREFA & OBSERVACOES', dataKey: 'titleBlock' },
        { header: 'CATEGORIA', dataKey: 'scopeRaw' },
        { header: 'DATA / HORA', dataKey: 'dateTime' },
        { header: 'PRIORIDADE', dataKey: 'priorityRaw' },
      ],
      body: tableRows,
      columnStyles: {
        statusRaw: { cellWidth: 25, halign: 'center' },
        titleBlock: { cellWidth: 83, halign: 'left' },
        scopeRaw: { cellWidth: 24, halign: 'center' },
        dateTime: { cellWidth: 26, halign: 'center' },
        priorityRaw: { cellWidth: 24, halign: 'center' },
      },
      willDrawCell: (data) => {
        if (data.section === 'body') {
          // Oculta o texto padrão das colunas com badges desenhados manualmente
          if (
            data.column.dataKey === 'statusRaw' ||
            data.column.dataKey === 'priorityRaw' ||
            data.column.dataKey === 'scopeRaw'
          ) {
            data.cell.text = [''];
          }
        }
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const rowRaw = tableRows[data.row.index];
        if (!rowRaw) return;

        const cellCenterX = data.cell.x + data.cell.width / 2;
        const cellCenterY = data.cell.y + data.cell.height / 2;
        const badgeW = data.cell.width - 4;
        const badgeH = 5.6;
        const badgeX = cellCenterX - badgeW / 2;
        const badgeY = cellCenterY - badgeH / 2;

        if (data.column.dataKey === 'statusRaw') {
          const isDone = rowRaw.statusRaw === 'CONCLUIDA';
          doc.setFillColor(...(isDone ? [220, 252, 231] : [244, 244, 245]) as [number, number, number]);
          doc.setDrawColor(...(isDone ? [134, 239, 172] : [212, 212, 216]) as [number, number, number]);
          doc.setLineWidth(0.25);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.6);
          doc.setTextColor(...(isDone ? [21, 128, 61] : [63, 63, 70]) as [number, number, number]);
          doc.text(rowRaw.statusRaw, cellCenterX, cellCenterY + 1.1, { align: 'center' });
        }

        if (data.column.dataKey === 'scopeRaw') {
          const palette: Record<
            string,
            { bg: [number, number, number]; fg: [number, number, number] }
          > = {
            work: { bg: [254, 226, 226], fg: [153, 27, 27] },
            personal: { bg: [219, 234, 254], fg: [37, 99, 235] },
            study: { bg: [252, 231, 243], fg: [219, 39, 119] },
          };
          const colors = palette[rowRaw.scopeKey] || palette.work;
          doc.setFillColor(...colors.bg);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.8);
          doc.setTextColor(...colors.fg);
          doc.text(rowRaw.scopeRaw, cellCenterX, cellCenterY + 1.1, { align: 'center' });
        }

        if (data.column.dataKey === 'priorityRaw') {
          const palette: Record<
            string,
            {
              bg: [number, number, number];
              border: [number, number, number];
              fg: [number, number, number];
            }
          > = {
            high: { bg: [254, 226, 226], border: [252, 165, 165], fg: [185, 28, 28] },
            medium: { bg: [254, 243, 199], border: [252, 211, 77], fg: [180, 83, 9] },
            low: { bg: [209, 250, 229], border: [110, 231, 183], fg: [4, 120, 87] },
          };
          const colors = palette[rowRaw.priorityKey] || palette.medium;
          doc.setFillColor(...colors.bg);
          doc.setDrawColor(...colors.border);
          doc.setLineWidth(0.25);
          doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 1.5, 1.5, 'FD');

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.8);
          doc.setTextColor(...colors.fg);
          doc.text(rowRaw.priorityRaw.toUpperCase(), cellCenterX, cellCenterY + 1.1, {
            align: 'center',
          });
        }
      },
      didDrawPage: (data) => {
        // Cabeçalho compacto automático nas páginas 2+
        if (data.pageNumber > 1) {
          doc.setFillColor(69, 10, 10);
          doc.rect(0, 0, pageWidth, 18, 'F');
          doc.setFillColor(212, 175, 55);
          doc.rect(0, 18, pageWidth, 0.9, 'F');

          drawBvsCrestOnPdf(doc, marginX, 2.5, 13);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(255, 255, 255);
          doc.text('BVS Special - Continuacao do Relatorio Executivo', marginX + 16, 8.5);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.setTextColor(228, 228, 231);
          doc.text(
            `Periodo: ${derivedPeriod}  |  Emitido em: ${generatedDateTime}`,
            marginX + 16,
            13.5,
          );
        }
      },
    });
  }

  // 4. Rodapé Oficial com numeração exata "Página X de Y" em TODAS as páginas
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerLineY = pageHeight - 13;
    doc.setDrawColor(212, 175, 55);
    doc.setLineWidth(0.35);
    doc.line(marginX, footerLineY, pageWidth - marginX, footerLineY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(153, 27, 27);
    doc.text('BVS Special', marginX, footerLineY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(113, 113, 122);
    doc.text(
      `  |  Created By Gustavo Geraldo (c) ${currentYear} - Todos os direitos reservados`,
      marginX + 17.5,
      footerLineY + 5,
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(63, 63, 70);
    doc.text(`Pagina ${i} de ${totalPages}`, pageWidth - marginX, footerLineY + 5, {
      align: 'right',
    });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

function isMobileShareDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isTouchMac =
    /Macintosh/i.test(ua) && typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android/i.test(ua) || isTouchMac;
}

/**
 * Gera e exporta o relatório PDF:
 * - No iPhone/iOS/Android compatível, usa o compartilhamento nativo (navigator.share) com fallback automático para download direto.
 * - No computador, faz o download direto instantâneo.
 */
export function exportTasksToPdf(
  tasks: Task[],
  filename = 'bvs-special-tarefas.pdf',
  options?: PdfExportOptions,
): boolean {
  if (typeof document === 'undefined') return false;

  const finalFilename = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  const pdfBytes = generateTasksPdfBytes(tasks, options);
  const blobBuffer = new Uint8Array(pdfBytes);
  const blob = new Blob([blobBuffer], { type: 'application/pdf' });

  const triggerDownload = () => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', finalFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  };

  // Compartilhamento nativo no iOS / Mobile via Web Share API Level 2 (files)
  if (isMobileShareDevice() && typeof File !== 'undefined' && typeof navigator !== 'undefined') {
    try {
      const pdfFile = new File([blob], finalFilename, { type: 'application/pdf' });
      const navWithShare = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (typeof navWithShare.share === 'function' && navWithShare.canShare?.({ files: [pdfFile] })) {
        void navWithShare
          .share({
            files: [pdfFile],
            title: options?.title || 'BVS Special — Relatório de Tarefas',
          })
          .catch((err: unknown) => {
            // Se o usuário cancelou o share sheet manualmente, não força download duplo
            if (err instanceof Error && err.name === 'AbortError') return;
            triggerDownload();
          });
        return true;
      }
    } catch {
      // Fallback direto para download padrão
    }
  }

  triggerDownload();
  return true;
}
