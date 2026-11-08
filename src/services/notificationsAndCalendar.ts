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
  const title = encodeURIComponent(`[BVS Special • ${scopeLabel}] ${task.title}`);
  const details = encodeURIComponent(
    task.description ?? `Tarefa criada no BVS Special (${scopeLabel})`,
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
 * Gera o binário de um documento PDF de alto padrão executivo (ISO 32000-1 / PDF 1.4)
 * com cabeçalho bordeaux, logo vetorial BVS Special, KPIs, tabela estilizada e rodapé oficial.
 */
export function generateTasksPdfBytes(
  tasks: Task[],
  options?: { title?: string; userName?: string },
): Uint8Array {
  const currentYear = new Date().getFullYear();
  const rawTitle = options?.title || 'Relatorio Executivo de Tarefas';
  const reportTitle = sanitizePdfText(rawTitle);
  const rawUser = options?.userName || 'Gustavo Geraldo';
  const userName = sanitizePdfText(rawUser);

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const generatedDateTime = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(
    now.getHours(),
  )}:${pad(now.getMinutes())}`;

  // Métricas para os Cards de KPI
  const totalCount = tasks.length;
  const completedCount = tasks.filter((t) => t.isCompleted).length;
  const pendingCount = totalCount - completedCount;
  const highPriorityCount = tasks.filter((t) => t.priority === 'high' && !t.isCompleted).length;

  const priorityLabelMap: Record<string, string> = {
    high: 'ALTA',
    medium: 'MEDIA',
    low: 'BAIXA',
  };

  // Separa as tarefas em páginas de acordo com a altura disponível
  // Página 1: y começa em 615 após cabeçalho completo e cards de KPI
  // Páginas 2+: y começa em 745 após cabeçalho compacto
  const pagesOps: string[][] = [];
  let currentPageOps: string[] = [];
  let currentY = 615;
  const bottomMargin = 55;

  function startNewPage() {
    if (currentPageOps.length > 0) {
      pagesOps.push(currentPageOps);
    }
    currentPageOps = [];
    currentY = 745;
  }

  // Prepara a primeira página
  // Desenho do Cabeçalho Executivo Completo da Página 1
  currentPageOps.push(
    // 1. Banner Superior Bordeaux Escuro
    '0.27 0.04 0.04 rg 0 726 595 116 re f',
    // 2. Linha Dourada de Prestígio
    '0.85 0.68 0.25 RG 2.5 w 0 724 m 595 724 l S',
    // 3. Brasão do Logo BVS Special (x=36, y=736, w=66, h=66)
    '0.06 0.06 0.08 rg 36 736 66 66 re f',
    '0.85 0.68 0.25 RG 1.5 w 36 736 66 66 re S',
    '0.85 0.68 0.25 RG 0.5 w 39 739 60 60 re S',
    // 3.1 Garrafa de vinho vetorial dentro do brasão
    '0.05 0.05 0.06 rg 52 776 5 14 re f',
    '0.85 0.12 0.15 rg 51 785 7 5 re f',
    '0.10 0.10 0.12 rg 48 752 13 24 re f',
    '0.60 0.10 0.12 rg 49 757 11 13 re f',
    '0.85 0.68 0.25 RG 0.6 w 48 752 13 24 re S',
    // 3.2 Taça de vinho vetorial dentro do brasão
    '0.10 0.10 0.12 rg 68 763 15 15 re f',
    '0.85 0.12 0.15 rg 69 765 13 10 re f',
    '0.85 0.68 0.25 RG 1.5 w 75 754 m 75 763 l S',
    '0.85 0.68 0.25 RG 1.5 w 70 754 m 80 754 l S',
    // 3.3 Livro aberto na base do brasão
    '0.96 0.96 0.96 rg 43 744 52 8 re f',
    '0.60 0.10 0.12 RG 1.5 w 69 744 m 69 752 l S',
    // 3.4 Inscrição BVS SPECIAL na base do brasão
    'BT /F2 6.5 Tf 0.95 0.85 0.45 rg 43 738 Td (BVS SPECIAL) Tj ET',
    // 4. Tipografia de Título ao lado do Brasão
    'BT /F2 8.5 Tf 0.95 0.85 0.45 rg 114 804 Td (EXECUTIVE PLANNER - RELATORIO CORPORATIVO) Tj ET',
    'BT /F2 22 Tf 1 1 1 rg 114 782 Td (BVS Special) Tj ET',
    `BT /F1 10.5 Tf 0.92 0.90 0.88 rg 114 766 Td (${reportTitle.slice(0, 52)}) Tj ET`,
    'BT /F1 8 Tf 0.80 0.78 0.75 rg 114 750 Td (Sistema Executivo de Planejamento e Alta Produtividade) Tj ET',
    // 5. Painel de Metadados Executivos à Direita
    '0.18 0.03 0.04 rg 382 736 177 66 re f',
    '0.85 0.68 0.25 RG 0.8 w 382 736 177 66 re S',
    `BT /F2 7.5 Tf 0.95 0.85 0.45 rg 390 790 Td (EMISSAO:) Tj /F1 7.5 Tf 1 1 1 rg 440 790 Td (${generatedDateTime}) Tj ET`,
    `BT /F2 7.5 Tf 0.95 0.85 0.45 rg 390 776 Td (USUARIO:) Tj /F1 7.5 Tf 1 1 1 rg 440 776 Td (${userName.slice(0, 20)}) Tj ET`,
    `BT /F2 7.5 Tf 0.95 0.85 0.45 rg 390 762 Td (REGISTROS:) Tj /F1 7.5 Tf 1 1 1 rg 440 762 Td (${totalCount} tarefa(s)) Tj ET`,
    'BT /F2 7 Tf 0.95 0.35 0.35 rg 390 748 Td ([ DOCUMENTO EXECUTIVO CONFIDENCIAL ]) Tj ET',
    // 6. Dashboard de KPIs (4 Cards de Métricas)
    // Card 1: Total
    '0.96 0.96 0.95 rg 36 660 124 48 re f',
    '0.85 0.83 0.80 RG 1 w 36 660 124 48 re S',
    '0.30 0.30 0.35 rg 36 705 124 3 re f',
    `BT /F2 16 Tf 0.08 0.08 0.10 rg 48 679 Td (${totalCount}) Tj ET`,
    'BT /F2 7.5 Tf 0.40 0.40 0.45 rg 48 668 Td (TOTAL DE TAREFAS) Tj ET',
    // Card 2: Concluídas
    '0.94 0.98 0.95 rg 169 660 124 48 re f',
    '0.70 0.88 0.75 RG 1 w 169 660 124 48 re S',
    '0.08 0.55 0.22 rg 169 705 124 3 re f',
    `BT /F2 16 Tf 0.08 0.55 0.22 rg 181 679 Td (${completedCount}) Tj ET`,
    'BT /F2 7.5 Tf 0.08 0.50 0.20 rg 181 668 Td (TAREFAS CONCLUIDAS) Tj ET',
    // Card 3: Pendentes
    '0.99 0.97 0.93 rg 302 660 124 48 re f',
    '0.92 0.80 0.65 RG 1 w 302 660 124 48 re S',
    '0.85 0.45 0.05 rg 302 705 124 3 re f',
    `BT /F2 16 Tf 0.85 0.45 0.05 rg 314 679 Td (${pendingCount}) Tj ET`,
    'BT /F2 7.5 Tf 0.75 0.40 0.05 rg 314 668 Td (TAREFAS PENDENTES) Tj ET',
    // Card 4: Alta Prioridade
    '0.99 0.94 0.94 rg 435 660 124 48 re f',
    '0.95 0.75 0.75 RG 1 w 435 660 124 48 re S',
    '0.75 0.08 0.10 rg 435 705 124 3 re f',
    `BT /F2 16 Tf 0.75 0.08 0.10 rg 447 679 Td (${highPriorityCount}) Tj ET`,
    'BT /F2 7.5 Tf 0.75 0.08 0.10 rg 447 668 Td (ALTA PRIORIDADE) Tj ET',
    // 7. Cabeçalho da Tabela de Tarefas
    '0.20 0.03 0.04 rg 36 630 523 20 re f',
    '0.85 0.68 0.25 RG 0.5 w 36 630 523 20 re S',
    'BT /F2 8 Tf 1 1 1 rg 46 636 Td (STATUS) Tj ET',
    'BT /F2 8 Tf 1 1 1 rg 125 636 Td (TAREFA & ESCOPO) Tj ET',
    'BT /F2 8 Tf 1 1 1 rg 375 636 Td (DATA & HORARIO) Tj ET',
    'BT /F2 8 Tf 1 1 1 rg 480 636 Td (PRIORIDADE) Tj ET',
  );

  currentY = 624;

  if (tasks.length === 0) {
    currentPageOps.push(
      '0.98 0.98 0.97 rg 36 565 523 50 re f',
      '0.88 0.86 0.84 RG 1 w 36 565 523 50 re S',
      'BT /F2 11 Tf 0.25 0.25 0.28 rg 50 592 Td (Nenhuma tarefa cadastrada para o filtro ou periodo selecionado.) Tj ET',
      'BT /F1 9 Tf 0.50 0.50 0.55 rg 50 578 Td (Planeje suas metas de Trabalho, Pessoal ou Estudo no BVS Special.) Tj ET',
    );
  } else {
    tasks.forEach((task, idx) => {
      const hasDescription = Boolean(task.description?.trim());
      const cardHeight = hasDescription ? 48 : 36;

      // Se não couber na página atual, inicia uma nova página
      if (currentY - cardHeight < bottomMargin + 10) {
        startNewPage();
        // Cabeçalho Compacto para Páginas Subsequentes (Página 2, 3...)
        currentPageOps.push(
          '0.27 0.04 0.04 rg 0 782 595 60 re f',
          '0.85 0.68 0.25 RG 2 w 0 780 m 595 780 l S',
          '0.06 0.06 0.08 rg 36 786 48 48 re f',
          '0.85 0.68 0.25 RG 1 w 36 786 48 48 re S',
          'BT /F2 7 Tf 0.95 0.85 0.45 rg 40 806 Td (BVS SPECIAL) Tj ET',
          'BT /F2 14 Tf 1 1 1 rg 96 812 Td (BVS Special - Relatorio de Tarefas (Continuacao)) Tj ET',
          `BT /F1 8.5 Tf 0.88 0.86 0.84 rg 96 798 Td (Emitido em ${generatedDateTime} | Gestor: ${userName}) Tj ET`,
          // Tabela Header na página de continuação
          '0.20 0.03 0.04 rg 36 754 523 20 re f',
          '0.85 0.68 0.25 RG 0.5 w 36 754 523 20 re S',
          'BT /F2 8 Tf 1 1 1 rg 46 760 Td (STATUS) Tj ET',
          'BT /F2 8 Tf 1 1 1 rg 125 760 Td (TAREFA & ESCOPO) Tj ET',
          'BT /F2 8 Tf 1 1 1 rg 375 760 Td (DATA & HORARIO) Tj ET',
          'BT /F2 8 Tf 1 1 1 rg 480 760 Td (PRIORIDADE) Tj ET',
        );
        currentY = 748;
      }

      const cardBottomY = currentY - cardHeight;
      const isEven = idx % 2 === 0;

      // Cores por escopo: Trabalho = Vinho, Pessoal = Azul, Estudo = Rosa
      const scopeColorRgb =
        task.scope === 'personal'
          ? '0.15 0.40 0.85'
          : task.scope === 'study'
            ? '0.85 0.15 0.45'
            : '0.60 0.10 0.10';

      const scopeName =
        task.scope === 'personal' ? 'Pessoal' : task.scope === 'study' ? 'Estudo' : 'Trabalho';

      // Cor de fundo alternada sutil
      const bgRgb = isEven ? '0.985 0.985 0.98' : '0.96 0.96 0.95';
      currentPageOps.push(
        `${bgRgb} rg 36 ${cardBottomY} 523 ${cardHeight} re f`,
        '0.88 0.86 0.84 RG 0.5 w 36 ${cardBottomY} 523 ${cardHeight} re S',
        // Barra lateral indicadora de escopo
        `${scopeColorRgb} rg 36 ${cardBottomY} 4.5 ${cardHeight} re f`,
      );

      // Badge de Status
      const statusText = task.isCompleted ? '[ CONCLUIDA ]' : '[ PENDENTE ]';
      const statusColor = task.isCompleted ? '0.08 0.55 0.22' : '0.40 0.40 0.45';
      currentPageOps.push(
        `BT /F2 8 Tf ${statusColor} rg 46 ${cardBottomY + cardHeight - 16} Td (${statusText}) Tj ET`,
      );

      // Título da Tarefa
      const cleanTitle = sanitizePdfText(task.title).slice(0, 48);
      const titleColor = task.isCompleted ? '0.45 0.45 0.48' : '0.08 0.08 0.10';
      currentPageOps.push(
        `BT /F2 9.5 Tf ${titleColor} rg 125 ${cardBottomY + cardHeight - 16} Td (${cleanTitle}) Tj ET`,
      );

      // Sub-linha do escopo
      currentPageOps.push(
        `BT /F1 7.5 Tf ${scopeColorRgb} rg 125 ${cardBottomY + cardHeight - 27} Td (Escopo: ${scopeName}) Tj ET`,
      );

      // Data e Horário
      const timeInfo = task.time ? ` as ${sanitizePdfText(task.time)}` : ' (dia todo)';
      currentPageOps.push(
        `BT /F1 8.5 Tf 0.25 0.25 0.28 rg 375 ${cardBottomY + cardHeight - 16} Td (${sanitizePdfText(task.date)}${timeInfo}) Tj ET`,
      );

      // Badge de Prioridade
      const prioLabel = priorityLabelMap[task.priority] ?? 'MEDIA';
      const prioColor =
        task.priority === 'high'
          ? '0.75 0.08 0.10'
          : task.priority === 'low'
            ? '0.08 0.55 0.22'
            : '0.85 0.45 0.05';
      currentPageOps.push(
        `BT /F2 8.5 Tf ${prioColor} rg 480 ${cardBottomY + cardHeight - 16} Td (${prioLabel}) Tj ET`,
      );

      // Linha de Descrição (caso exista)
      if (hasDescription && task.description) {
        const cleanDesc = sanitizePdfText(task.description).slice(0, 80);
        currentPageOps.push(
          `BT /F1 7.5 Tf 0.45 0.45 0.48 rg 125 ${cardBottomY + 8} Td (Obs.: ${cleanDesc}) Tj ET`,
        );
      }

      currentY -= cardHeight + 4;
    });
  }

  // Encerra a última página em andamento
  if (currentPageOps.length > 0) {
    pagesOps.push(currentPageOps);
  }

  const totalPages = Math.max(1, pagesOps.length);

  // Adiciona o Rodapé Oficial em TODAS as páginas geradas
  pagesOps.forEach((pageOps, pageIdx) => {
    pageOps.push(
      '0.85 0.68 0.25 RG 0.8 w 36 38 m 559 38 l S',
      'BT /F2 7.5 Tf 0.55 0.08 0.10 rg 36 26 Td (BVS Special) Tj ET',
      `BT /F1 7.5 Tf 0.40 0.40 0.45 rg 92 26 Td (| Created By Gustavo Geraldo (c) ${currentYear} - Todos os direitos reservados) Tj ET`,
      `BT /F2 7.5 Tf 0.40 0.40 0.45 rg 486 26 Td (Pagina ${pageIdx + 1} de ${totalPages}) Tj ET`,
    );
  });

  // Montagem do Arquivo PDF ISO 32000-1 / PDF 1.4
  // Objetos fixos:
  // 1 0 obj: Catalog
  // 2 0 obj: Pages
  // 3 0 obj: Font F1 (Helvetica)
  // 4 0 obj: Font F2 (Helvetica-Bold)
  // Depois para cada página i:
  // Objeto Page (5 + 2*i) e Objeto Stream (6 + 2*i)
  const fontF1ObjNum = 3;
  const fontF2ObjNum = 4;
  const pageObjStart = 5;

  const pageObjRefs: string[] = [];
  const pageObjects: string[] = [];

  pagesOps.forEach((ops, idx) => {
    const pageNum = pageObjStart + idx * 2;
    const streamNum = pageNum + 1;
    pageObjRefs.push(`${pageNum} 0 R`);

    const streamBody = ops.join('\n');
    const pageObj = `${pageNum} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontF1ObjNum} 0 R /F2 ${fontF2ObjNum} 0 R >> >> /Contents ${streamNum} 0 R >>\nendobj\n`;
    const streamObj = `${streamNum} 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`;
    pageObjects.push(pageObj, streamObj);
  });

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${totalPages} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>\nendobj\n',
    ...pageObjects,
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
