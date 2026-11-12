import React, { ChangeEvent, useMemo, useRef, useState } from 'react';
import {
  buildAiSchedulePrompt,
  copyTextToClipboard,
  downloadModelSpreadsheet,
  parseJsonScheduleText,
  parseSpreadsheetFile,
} from '../../../services/bulkImport';
import {
  BulkImportRow,
  Priority,
  SCOPE_CONFIG,
  Scope,
  TaskDraft,
  TaskFolder,
} from '../../tasks/types/task.types';

interface BulkImportModalProps {
  visible: boolean;
  folders: TaskFolder[];
  onClose: () => void;
  onImportTasks: (
    drafts: TaskDraft[],
  ) => Promise<{ ok: boolean; count: number; synced: boolean; error?: string }>;
  onNotify?: (message: string) => void;
}

const PRIORITY_BADGES: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const CONTEXT_OPTIONS: Array<{
  scope: Scope;
  label: 'Pessoal' | 'Trabalho' | 'Estudo';
  icon: string;
  subtitle: string;
}> = [
  {
    scope: 'personal',
    label: 'Pessoal',
    icon: '🏠',
    subtitle: 'Rotina, família, saúde e compromissos',
  },
  {
    scope: 'work',
    label: 'Trabalho',
    icon: '💼',
    subtitle: 'Reuniões, entregas e metas executivas',
  },
  {
    scope: 'study',
    label: 'Estudo',
    icon: '📚',
    subtitle: 'Cursos, leituras, pós e certificações',
  },
];

/**
 * Modal / Bottom Sheet responsivo para importação de planejamento em lote (.xlsx, .xls, .csv, .json),
 * download da planilha modelo e prompt otimizado para geração de cronogramas com IA.
 */
export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  visible,
  folders,
  onClose,
  onImportTasks,
  onNotify,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [selectedContextScope, setSelectedContextScope] = useState<Scope | null>(null);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('');
  const [jsonPasteOpen, setJsonPasteOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  const validRows = useMemo(() => rows.filter((r) => r.isValid), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => !r.isValid), [rows]);

  if (!visible) {
    return null;
  }

  const applyBatchContextToList = (list: BulkImportRow[], targetScope: Scope | null) => {
    if (!targetScope) return list;
    return list.map((row) => ({
      ...row,
      scope: targetScope,
    }));
  };

  const handleSelectContextScope = (scope: Scope) => {
    setSelectedContextScope(scope);
    setRows((prev) => applyBatchContextToList(prev, scope));
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setParseError(null);
    setFileName(file.name);

    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.length === 0) {
        setParseError('Nenhuma linha encontrada na planilha/arquivo selecionado.');
        setRows([]);
      } else {
        setRows(applyBatchContextToList(parsed, selectedContextScope));
      }
    } catch (error) {
      setParseError(
        error instanceof Error
          ? `Erro ao ler arquivo: ${error.message}`
          : 'Não foi possível ler o arquivo selecionado.',
      );
      setRows([]);
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const handleParseJsonPaste = () => {
    if (!jsonText.trim()) {
      setParseError('Cole um texto JSON válido antes de pré-visualizar.');
      return;
    }
    setParseError(null);
    try {
      const parsed = parseJsonScheduleText(jsonText);
      if (parsed.length === 0) {
        setParseError('Nenhuma tarefa válida encontrada no JSON informado.');
        setRows([]);
      } else {
        setFileName('JSON colado da IA');
        setRows(applyBatchContextToList(parsed, selectedContextScope));
        setJsonPasteOpen(false);
      }
    } catch (error) {
      setParseError(
        error instanceof Error ? `JSON inválido: ${error.message}` : 'Erro ao interpretar o JSON.',
      );
    }
  };

  const handleCopyPrompt = async () => {
    const prompt = buildAiSchedulePrompt();
    const ok = await copyTextToClipboard(prompt);
    setPromptCopied(true);
    setTimeout(() => setPromptCopied(false), 3000);
    if (onNotify) {
      onNotify(
        ok
          ? 'Prompt para IA copiado! Cole no ChatGPT para gerar seu cronograma.'
          : 'Prompt preparado. Copie manualmente se o navegador bloqueou a área de transferência.',
      );
    }
  };

  const handleRemovePreviewRow = (rowNumber: number) => {
    setRows((prev) => prev.filter((r) => r.rowNumber !== rowNumber));
  };

  const handleConfirmImport = async () => {
    if (validRows.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    setParseError(null);

    try {
      const drafts: TaskDraft[] = validRows.map((row) => ({
        title: row.title,
        description: row.description,
        date: row.date,
        time: row.time,
        priority: row.priority,
        scope: row.scope,
        folderId: selectedFolderId || undefined,
      }));

      const result = await onImportTasks(drafts);
      if (result.ok) {
        if (onNotify) {
          onNotify(
            result.synced
              ? `${result.count} tarefa(s) importada(s) em lote para o banco!`
              : `${result.count} tarefa(s) importada(s) localmente (aguardando conexão).`,
          );
        }
        setRows([]);
        setFileName(null);
        setJsonText('');
        onClose();
      } else {
        setParseError(result.error || 'Não foi possível concluir a importação em lote.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-xs md:items-center md:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importar Planejamento em Lote"
    >
      <div className="animate-sheet-up safe-bottom flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[#E6E2DA] bg-white shadow-2xl md:max-w-[820px] md:rounded-[26px] dark:border-[#27272A] dark:bg-[#18181B]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between border-b border-[#F1EFEA] px-5 py-4 dark:border-[#27272A]">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#6F1D2B] dark:text-[#FCA5A5]">
              Entrada Rápida de Cronograma
            </span>
            <h2 className="font-heading text-[20px] font-bold text-[#0F0F12] dark:text-white">
              📥 Importar Planejamento
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela de importação"
            className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl bg-[#F1EFEA] text-[15px] font-bold text-[#0F0F12] hover:bg-[#E6E2DA] dark:bg-[#27272A] dark:text-white"
          >
            ✕
          </button>
        </div>

        {/* Corpo rolável */}
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Ações Rápidas: Modelo (.xlsx), Prompt IA e Upload */}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => downloadModelSpreadsheet()}
              className="flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] px-4 text-[13px] font-bold text-[#0F0F12] transition-colors hover:bg-[#F1ECE2] active:scale-95 dark:border-[#27272A] dark:bg-[#27272A] dark:text-white"
            >
              📥 Baixar Planilha Modelo (.xlsx)
            </button>

            <button
              type="button"
              onClick={handleCopyPrompt}
              className="flex min-h-[46px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E5D3D6] bg-[#FDF4F5] px-4 text-[13px] font-bold text-[#6F1D2B] transition-colors hover:bg-[#FCE7E9] active:scale-95 dark:border-[#4C1D24] dark:bg-[#3B1219] dark:text-[#FCA5A5]"
            >
              {promptCopied ? '✓ Prompt Copiado!' : '✨ Copiar Prompt para IA'}
            </button>
          </div>

          {/* Seletor de Arquivo adaptado para Arquivos/iCloud/Android/Desktop */}
          <div className="rounded-2xl border-2 border-dashed border-[#D6D1C7] bg-[#FAF9F6] p-4 text-center dark:border-[#3F3F46] dark:bg-[#202026]">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv,application/json"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Selecionar arquivo Excel, CSV ou JSON"
            />
            <p className="text-[13px] font-semibold text-[#3F3F46] dark:text-[#E4E4E7]">
              Selecione no app <strong>Arquivos / iCloud Drive / Downloads</strong> (.xlsx, .xls, .csv ou .json)
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                disabled={isParsing}
                onClick={() => fileInputRef.current?.click()}
                className="min-h-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-5 text-[13px] font-bold text-white shadow-sm hover:bg-[#581521] active:scale-95 disabled:opacity-60"
              >
                {isParsing ? 'Lendo arquivo...' : '📂 Selecionar Arquivo'}
              </button>

              <button
                type="button"
                onClick={() => setJsonPasteOpen((prev) => !prev)}
                className="min-h-[44px] cursor-pointer rounded-xl border border-[#E6E2DA] bg-white px-4 text-[12px] font-bold text-[#3F3F46] hover:bg-[#F5F2EB] dark:border-[#3F3F46] dark:bg-[#27272A] dark:text-[#E4E4E7]"
              >
                {jsonPasteOpen ? 'Ocultar campo JSON' : '📋 Colar JSON da IA'}
              </button>
            </div>
            {fileName && (
              <p className="mt-2 text-[12px] font-bold text-[#15803D] dark:text-[#86EFAC]">
                Arquivo carregado: {fileName}
              </p>
            )}
          </div>

          {/* Área Opcional para Colar JSON do ChatGPT */}
          {jsonPasteOpen && (
            <div className="space-y-2 rounded-2xl border border-[#E6E2DA] bg-white p-3.5 dark:border-[#27272A] dark:bg-[#202026]">
              <label
                htmlFor="bulk-json-input"
                className="block text-[12px] font-bold text-[#3F3F46] dark:text-[#D4D4D8]"
              >
                Cole aqui o JSON gerado pela IA:
              </label>
              <textarea
                id="bulk-json-input"
                rows={5}
                value={jsonText}
                onChange={(e) => setJsonText(e.target.value)}
                placeholder='[{"titulo":"Reunião Mensal","descricao":"Alinhar metas","data":"2026-11-15","hora":"09:30","categoria":"Trabalho","prioridade":"Alta"}]'
                className="w-full rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] p-3 font-mono text-[12px] text-[#0F0F12] outline-none focus:border-[#6F1D2B] dark:border-[#3F3F46] dark:bg-[#18181B] dark:text-white"
              />
              <button
                type="button"
                onClick={handleParseJsonPaste}
                className="min-h-[44px] cursor-pointer rounded-xl bg-[#0F0F12] px-4 text-[12px] font-bold text-white dark:bg-[#6F1D2B]"
              >
                Pré-visualizar JSON
              </button>
            </div>
          )}

          {/* Seletor Visual Destacado de Contexto/Categoria do Lote Importado (Pessoal, Trabalho, Estudo) */}
          <div className="rounded-2xl border border-[#E6E2DA] bg-[#FAF9F6] p-3.5 sm:p-4 dark:border-[#27272A] dark:bg-[#202026]">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#6F1D2B] dark:text-[#FCA5A5]">
                  Contexto / Categoria do Lote Importado
                </span>
                <p className="text-[12px] text-[#52525B] dark:text-[#A1A1AA]">
                  Escolha uma opção para classificar automaticamente todas as tarefas importadas neste lote:
                </p>
              </div>
              {selectedContextScope && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-extrabold"
                  style={{
                    backgroundColor: SCOPE_CONFIG[selectedContextScope].bgLight,
                    color: SCOPE_CONFIG[selectedContextScope].color,
                  }}
                >
                  ✓ Lote classificado como {SCOPE_CONFIG[selectedContextScope].label}
                </span>
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Contexto padrão do lote importado"
              className="grid grid-cols-1 gap-2 sm:grid-cols-3"
            >
              {CONTEXT_OPTIONS.map((opt) => {
                const cfg = SCOPE_CONFIG[opt.scope];
                const isSelected = selectedContextScope === opt.scope;
                return (
                  <button
                    key={opt.scope}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectContextScope(opt.scope)}
                    className={`flex min-h-[54px] cursor-pointer items-center gap-3 rounded-xl border-2 p-3 text-left transition-all active:scale-[0.98] ${
                      isSelected
                        ? 'shadow-sm'
                        : 'border-[#E6E2DA] bg-white hover:border-[#D6D1C7] dark:border-[#3F3F46] dark:bg-[#18181B]'
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: cfg.color,
                            backgroundColor: cfg.bgLight,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[17px]"
                      style={{
                        backgroundColor: isSelected ? cfg.color : cfg.bgLight,
                        color: isSelected ? '#FFFFFF' : cfg.color,
                      }}
                    >
                      {opt.icon}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className="font-heading text-[13px] font-extrabold"
                          style={isSelected ? { color: cfg.color } : undefined}
                        >
                          {opt.label}
                        </span>
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded-full border text-[10px] font-black ${
                            isSelected
                              ? 'border-transparent text-white'
                              : 'border-[#D4D4D8] bg-transparent dark:border-[#52525B]'
                          }`}
                          style={isSelected ? { backgroundColor: cfg.color } : undefined}
                        >
                          {isSelected ? '✓' : ''}
                        </span>
                      </div>
                      <p className="truncate text-[11px] font-medium text-[#71717A] dark:text-[#A1A1AA]">
                        {opt.subtitle}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Pasta de Destino (Opcional) */}
          {folders.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <label
                htmlFor="bulk-folder-select"
                className="text-[12px] font-bold text-[#52525B] dark:text-[#A1A1AA]"
              >
                Vincular todas as tarefas importadas à pasta (opcional):
              </label>
              <select
                id="bulk-folder-select"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                className="min-h-[44px] rounded-xl border border-[#E6E2DA] bg-[#FAF7F2] px-3 text-[13px] font-semibold text-[#0F0F12] dark:border-[#27272A] dark:bg-[#27272A] dark:text-white"
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

          {parseError && (
            <div
              role="alert"
              className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-3 text-[12px] font-bold text-[#991B1B] dark:border-[#7F1D1D] dark:bg-[#2A1215] dark:text-[#FCA5A5]"
            >
              {parseError}
            </div>
          )}

          {/* Pré-visualização (Cards no mobile, Tabela no desktop) */}
          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-heading text-[15px] font-bold text-[#0F0F12] dark:text-white">
                  Pré-visualização ({rows.length} linha(s))
                </h3>
                <div className="flex items-center gap-2 text-[12px] font-bold">
                  <span className="rounded-lg bg-[#E8F4EE] px-2.5 py-1 text-[#15803D]">
                    ✓ {validRows.length} válida(s)
                  </span>
                  {invalidRows.length > 0 && (
                    <span className="rounded-lg bg-[#FEE2E2] px-2.5 py-1 text-[#991B1B]">
                      ⚠ {invalidRows.length} com erro (ignoradas)
                    </span>
                  )}
                </div>
              </div>

              {/* Mobile Preview: Cards */}
              <div className="grid grid-cols-1 gap-2.5 md:hidden">
                {rows.map((row) => {
                  const cfg = SCOPE_CONFIG[row.scope];
                  return (
                    <div
                      key={row.rowNumber}
                      className={`rounded-xl border p-3 ${
                        row.isValid
                          ? 'border-[#E6E2DA] bg-white dark:border-[#27272A] dark:bg-[#202026]'
                          : 'border-[#FECACA] bg-[#FEF2F2] dark:border-[#7F1D1D] dark:bg-[#2A1215]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[13px] font-bold text-[#0F0F12] dark:text-white">
                            {row.title || '(Sem título)'}
                          </div>
                          {row.description && (
                            <p className="mt-0.5 line-clamp-2 text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                              {row.description}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemovePreviewRow(row.rowNumber)}
                          aria-label={`Remover linha ${row.rowNumber}`}
                          className="min-h-[44px] min-w-[44px] shrink-0 rounded-lg text-[12px] font-bold text-[#991B1B]"
                        >
                          ✕
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                        <span className="rounded bg-[#FAF7F2] px-2 py-0.5 text-[#3F3F46] dark:bg-[#27272A] dark:text-[#E4E4E7]">
                          📅 {row.date} {row.time ? `⏰ ${row.time}` : ''}
                        </span>
                        <span
                          className="rounded px-2 py-0.5"
                          style={{ backgroundColor: cfg.bgLight, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                        <span className="rounded bg-[#F1EFEA] px-2 py-0.5 text-[#3F3F46]">
                          {PRIORITY_BADGES[row.priority]}
                        </span>
                      </div>

                      {!row.isValid && (
                        <p className="mt-1.5 text-[11px] font-bold text-[#991B1B]">
                          Erros: {row.errors.join(' | ')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Desktop Preview: Tabela */}
              <div className="hidden max-h-[290px] overflow-auto rounded-xl border border-[#E6E2DA] md:block dark:border-[#27272A]">
                <table className="w-full border-collapse text-left text-[12px]">
                  <thead className="sticky top-0 bg-[#FAF7F2] text-[11px] font-bold uppercase text-[#52525B] dark:bg-[#202026] dark:text-[#A1A1AA]">
                    <tr>
                      <th className="px-3 py-2.5">Status</th>
                      <th className="px-3 py-2.5">Título</th>
                      <th className="px-3 py-2.5">Data</th>
                      <th className="px-3 py-2.5">Hora</th>
                      <th className="px-3 py-2.5">Categoria</th>
                      <th className="px-3 py-2.5">Prioridade</th>
                      <th className="px-3 py-2.5 text-right">Remover</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F1EFEA] dark:divide-[#27272A]">
                    {rows.map((row) => (
                      <tr
                        key={row.rowNumber}
                        className={row.isValid ? '' : 'bg-[#FEF2F2] dark:bg-[#2A1215]/70'}
                      >
                        <td className="px-3 py-2 font-bold">
                          {row.isValid ? (
                            <span className="text-[#15803D]">✓ OK</span>
                          ) : (
                            <span className="text-[#991B1B]" title={row.errors.join(', ')}>
                              ⚠ {row.errors[0]}
                            </span>
                          )}
                        </td>
                        <td className="max-w-[230px] truncate px-3 py-2 font-semibold text-[#0F0F12] dark:text-white">
                          {row.title || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{row.date || '—'}</td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono">{row.time || '—'}</td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                            style={{
                              backgroundColor: SCOPE_CONFIG[row.scope].bgLight,
                              color: SCOPE_CONFIG[row.scope].color,
                            }}
                          >
                            {SCOPE_CONFIG[row.scope].label}
                          </span>
                        </td>
                        <td className="px-3 py-2">{PRIORITY_BADGES[row.priority]}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemovePreviewRow(row.rowNumber)}
                            className="cursor-pointer rounded px-2 py-1 font-bold text-[#991B1B] hover:bg-[#FEE2E2]"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Rodapé com Ações */}
        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#F1EFEA] bg-[#FAF9F6] px-5 py-3.5 dark:border-[#27272A] dark:bg-[#141417]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] cursor-pointer rounded-xl border border-[#E6E2DA] bg-white px-4 text-[13px] font-bold text-[#52525B] dark:border-[#27272A] dark:bg-[#27272A] dark:text-[#D4D4D8]"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={validRows.length === 0 || isSubmitting}
            onClick={handleConfirmImport}
            className="min-h-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#581521] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting
              ? 'Importando para o banco...'
              : `Confirmar e Importar ${validRows.length} Tarefa(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};
