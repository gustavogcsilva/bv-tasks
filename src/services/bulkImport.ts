import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import type { BulkImportRow, Priority, Scope } from '../features/tasks/types/task.types';

/**
 * Gera o prompt otimizado para o usuário copiar e colar no ChatGPT / IA
 * para criar seu cronograma mensal já estruturado para importação no BVS Special.
 */
export function buildAiSchedulePrompt(referenceDate = new Date()): string {
  const monthLabel = format(referenceDate, 'yyyy-MM');
  return [
    `Atue como meu Assistente Executivo de Planejamento no aplicativo BVS Special (B V Tasks).`,
    `Crie meu cronograma de tarefas para o mês ${monthLabel} em formato JSON (um array de objetos) E/OU tabela CSV pronta para importar.`,
    ``,
    `Regras estritas de formatação (use EXATAMENTE estes nomes de campos):`,
    `- "titulo": texto curto e objetivo da tarefa (obrigatório)`,
    `- "descricao": resumo ou observações da tarefa (opcional)`,
    `- "data": formato YYYY-MM-DD (ex: ${monthLabel}-15) (obrigatório)`,
    `- "hora": formato HH:MM 24h (ex: 09:30) ou vazio ""`,
    `- "categoria": apenas "Trabalho", "Pessoal" ou "Estudo"`,
    `- "prioridade": apenas "Alta", "Media" ou "Baixa"`,
    ``,
    `Exemplo de resposta JSON válida:`,
    `[`,
    `  {`,
    `    "titulo": "Fechamento Financeiro Mensal",`,
    `    "descricao": "Conferir fluxo de caixa e aprovar DRE",`,
    `    "data": "${monthLabel}-05",`,
    `    "hora": "09:30",`,
    `    "categoria": "Trabalho",`,
    `    "prioridade": "Alta"`,
    `  },`,
    `  {`,
    `    "titulo": "Revisão de Inglês Técnico",`,
    `    "descricao": "Praticar vocabulário executivo por 40 min",`,
    `    "data": "${monthLabel}-07",`,
    `    "hora": "19:00",`,
    `    "categoria": "Estudo",`,
    `    "prioridade": "Media"`,
    `  }`,
    `]`,
    ``,
    `Aguarde eu informar meus compromissos, metas e horários livres abaixo e então gere somente o JSON ou CSV limpo:`,
  ].join('\n');
}

/**
 * Copia texto para a área de transferência com fallback seguro para Safari/iOS WebView.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continua para fallback manual via textarea
    }
  }

  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Gera e faz o download da Planilha Modelo (.xlsx) com as 6 colunas oficiais e exemplos práticos.
 */
export function downloadModelSpreadsheet(referenceDate = new Date()): void {
  const monthKey = format(referenceDate, 'yyyy-MM');
  const sampleRows = [
    {
      titulo: 'Reunião de Diretoria e Metas',
      descricao: 'Apresentar indicadores de performance e orçamento',
      data: `${monthKey}-10`,
      hora: '09:30',
      categoria: 'Trabalho',
      prioridade: 'Alta',
    },
    {
      titulo: 'Check-up Clínico Anual',
      descricao: 'Levar exames laboratoriais impressos',
      data: `${monthKey}-14`,
      hora: '14:00',
      categoria: 'Pessoal',
      prioridade: 'Media',
    },
    {
      titulo: 'Leitura Executiva e Pós-Graduação',
      descricao: 'Concluir módulo 3 de Estratégia Corporativa',
      data: `${monthKey}-18`,
      hora: '20:00',
      categoria: 'Estudo',
      prioridade: 'Baixa',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
    header: ['titulo', 'descricao', 'data', 'hora', 'categoria', 'prioridade'],
  });
  worksheet['!cols'] = [
    { wch: 32 },
    { wch: 42 },
    { wch: 14 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Planejamento');
  XLSX.writeFile(workbook, 'bvs-special-modelo-planejamento.xlsx');
}

function isValidCalendarYmd(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2150 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() === month - 1 &&
    dt.getUTCDate() === day
  );
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Converte datas em string YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, números seriais do Excel ou objetos Date.
 */
export function parseImportedDate(value: unknown): { date: string; valid: boolean } {
  if (value === null || value === undefined || value === '') {
    return { date: '', valid: false };
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = value.getMonth() + 1;
    const d = value.getDate();
    return {
      date: formatYmd(y, m, d),
      valid: isValidCalendarYmd(y, m, d),
    };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsedSerial = XLSX.SSF.parse_date_code(Math.floor(value));
    if (parsedSerial && isValidCalendarYmd(parsedSerial.y, parsedSerial.m, parsedSerial.d)) {
      return {
        date: formatYmd(parsedSerial.y, parsedSerial.m, parsedSerial.d),
        valid: true,
      };
    }
    return { date: String(value), valid: false };
  }

  const trimmed = String(value).trim();
  if (!trimmed) return { date: '', valid: false };

  // Caso venha número serial em string (ex: "46341")
  if (/^\d{5}(\.\d+)?$/.test(trimmed)) {
    const serial = Number(trimmed);
    const parsedSerial = XLSX.SSF.parse_date_code(Math.floor(serial));
    if (parsedSerial && isValidCalendarYmd(parsedSerial.y, parsedSerial.m, parsedSerial.d)) {
      return {
        date: formatYmd(parsedSerial.y, parsedSerial.m, parsedSerial.d),
        valid: true,
      };
    }
  }

  // Formato ISO: YYYY-MM-DD ou YYYY/MM/DD (opcional com T...)
  const isoPart = trimmed.split('T')[0];
  const isoMatch = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(isoPart);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidCalendarYmd(y, m, d)) {
      return { date: formatYmd(y, m, d), valid: true };
    }
    return { date: trimmed, valid: false };
  }

  // Formato Brasileiro: DD/MM/YYYY ou DD-MM-YYYY
  const brMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(trimmed);
  if (brMatch) {
    const d = Number(brMatch[1]);
    const m = Number(brMatch[2]);
    const rawYear = Number(brMatch[3]);
    const y = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (isValidCalendarYmd(y, m, d)) {
      return { date: formatYmd(y, m, d), valid: true };
    }
    return { date: trimmed, valid: false };
  }

  return { date: trimmed, valid: false };
}

/**
 * Converte horários em fração decimal do Excel, "09:30", "9:30", "09h30" ou "0930" para "HH:mm".
 */
export function parseImportedTime(value: unknown): { time?: string; valid: boolean } {
  if (value === null || value === undefined || value === '') {
    return { time: undefined, valid: true };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value >= 1 ? value - Math.floor(value) : value;
    if (fraction >= 0 && fraction < 1) {
      const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
      const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');
      return { time: `${hh}:${mm}`, valid: true };
    }
    return { time: undefined, valid: false };
  }

  const trimmed = String(value).trim();
  if (!trimmed) return { time: undefined, valid: true };

  // Aceita 09:30, 9:30, 09h30
  const colonMatch = /^(\d{1,2})[:hH](\d{2})(?::\d{2})?$/.exec(trimmed);
  if (colonMatch) {
    const hh = Number(colonMatch[1]);
    const mm = Number(colonMatch[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return { time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, valid: true };
    }
    return { time: trimmed, valid: false };
  }

  // Aceita apenas dígitos: "930" -> "09:30", "1430" -> "14:30"
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 3) {
    const hh = Number(digits[0]);
    const mm = Number(digits.slice(1));
    if (hh <= 9 && mm <= 59) {
      return { time: `0${hh}:${String(mm).padStart(2, '0')}`, valid: true };
    }
  }
  if (digits.length === 4) {
    const hh = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    if (hh <= 23 && mm <= 59) {
      return { time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, valid: true };
    }
  }

  return { time: trimmed, valid: false };
}

function normalizeHeaderKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

export function normalizeImportedCategory(raw: unknown): Scope {
  const norm = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (norm === 'pessoal' || norm === 'personal' || norm === 'casa' || norm === 'familia') {
    return 'personal';
  }
  if (norm === 'estudo' || norm === 'estudos' || norm === 'study' || norm === 'curso') {
    return 'study';
  }
  return 'work';
}

export function normalizeImportedPriority(raw: unknown): Priority {
  const norm = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

  if (norm === 'alta' || norm === 'high' || norm === 'urgente' || norm === 'critica') {
    return 'high';
  }
  if (norm === 'baixa' || norm === 'low' || norm === 'leve') {
    return 'low';
  }
  return 'medium';
}

function getFieldValue(record: Record<string, unknown>, aliases: string[]): unknown {
  for (const [rawKey, value] of Object.entries(record)) {
    const cleanKey = normalizeHeaderKey(rawKey);
    if (aliases.includes(cleanKey)) {
      return value;
    }
  }
  return undefined;
}

/**
 * Converte registros brutos (de Excel, CSV ou JSON) em linhas validadas de pré-visualização.
 */
export function normalizeImportedRecords(rawRecords: Record<string, unknown>[]): BulkImportRow[] {
  if (!Array.isArray(rawRecords)) return [];

  return rawRecords
    .map((record, index) => {
      const rowNumber = index + 1;
      const rawTitle = getFieldValue(record, ['titulo', 'title', 'tarefa', 'nome', 'assunto']);
      const rawDesc = getFieldValue(record, [
        'descricao',
        'description',
        'obs',
        'observacao',
        'observacoes',
        'detalhes',
      ]);
      const rawDate = getFieldValue(record, ['data', 'date', 'dia', 'vencimento']);
      const rawTime = getFieldValue(record, ['hora', 'horario', 'time']);
      const rawCategory = getFieldValue(record, [
        'categoria',
        'category',
        'escopo',
        'scope',
        'area',
      ]);
      const rawPriority = getFieldValue(record, ['prioridade', 'priority', 'criticidade']);

      const title = String(rawTitle ?? '').trim();
      const description = String(rawDesc ?? '').trim();
      const parsedDate = parseImportedDate(rawDate);
      const parsedTime = parseImportedTime(rawTime);
      const scope = normalizeImportedCategory(rawCategory);
      const priority = normalizeImportedPriority(rawPriority);

      const errors: string[] = [];
      if (!title) errors.push('Título obrigatório ausente.');
      if (!parsedDate.valid) {
        errors.push(`Data inválida ("${String(rawDate ?? '').trim() || 'vazia'}") — use YYYY-MM-DD ou DD/MM/AAAA.`);
      }
      if (!parsedTime.valid) {
        errors.push(`Hora inválida ("${String(rawTime ?? '').trim()}") — use HH:MM.`);
      }

      return {
        rowNumber,
        title,
        ...(description ? { description } : {}),
        date: parsedDate.date,
        ...(parsedTime.time ? { time: parsedTime.time } : {}),
        scope,
        priority,
        rawDate: rawDate !== undefined && rawDate !== null ? String(rawDate) : undefined,
        rawCategory: rawCategory !== undefined && rawCategory !== null ? String(rawCategory) : undefined,
        rawPriority: rawPriority !== undefined && rawPriority !== null ? String(rawPriority) : undefined,
        isValid: errors.length === 0,
        errors,
      } satisfies BulkImportRow;
    })
    .filter((row) => {
      // Remove linhas completamente em branco no fim de planilhas Excel
      const isBlankRow = !row.title && !row.description && !row.rawDate;
      return !isBlankRow;
    });
}

/**
 * Faz o parse de um texto JSON colado (array direto ou { tasks / tarefas: [...] }).
 */
export function parseJsonScheduleText(rawText: string): BulkImportRow[] {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const parsed = JSON.parse(cleaned) as unknown;
  let records: unknown[] = [];

  if (Array.isArray(parsed)) {
    records = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.tasks)) records = obj.tasks;
    else if (Array.isArray(obj.tarefas)) records = obj.tarefas;
    else if (Array.isArray(obj.items)) records = obj.items;
  }

  if (!Array.isArray(records)) {
    throw new Error('O JSON deve conter uma lista ([...]) de tarefas.');
  }

  return normalizeImportedRecords(
    records.filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object')),
  );
}

/**
 * Lê arquivos .xlsx, .xls, .csv ou .json selecionados no celular (Arquivos/iCloud/Android) ou computador.
 */
export async function parseSpreadsheetFile(file: File): Promise<BulkImportRow[]> {
  const lowerName = file.name.toLowerCase();

  if (lowerName.endsWith('.json') || file.type === 'application/json') {
    const text = await file.text();
    return parseJsonScheduleText(text);
  }

  if (lowerName.endsWith('.csv') || file.type === 'text/csv') {
    const csvText = await file.text();
    const workbook = XLSX.read(csvText, { type: 'string', raw: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) return [];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      workbook.Sheets[firstSheetName],
      { defval: '', raw: true },
    );
    return normalizeImportedRecords(records);
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', raw: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[firstSheetName],
    { defval: '', raw: true },
  );
  return normalizeImportedRecords(records);
}
