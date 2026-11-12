import React, { FormEvent, useRef, useState } from 'react';
import { apiAskTaskAssistant } from '../../../services/apiSync';
import {
  AssistantChatMessage,
  AssistantSuggestedTask,
  Priority,
  SCOPE_CONFIG,
  TaskDraft,
} from '../../tasks/types/task.types';

interface TaskAssistantChatProps {
  visible: boolean;
  currentDate: string; // YYYY-MM-DD
  hasPendingSync: boolean;
  onSyncBeforeAction: () => Promise<void>;
  onAddSuggestedTasks: (
    drafts: TaskDraft[],
  ) => Promise<{ ok: boolean; count: number; synced: boolean; error?: string }>;
  onOpen: () => void;
  onClose: () => void;
  onNotify?: (message: string) => void;
}

const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

const QUICK_PROMPTS = [
  'Dividir fechamento financeiro da semana em 3 tarefas de Trabalho',
  'Organizar rotina de estudos de inglês segunda, quarta e sexta às 19:30',
  'Criar checklist de revisão executiva para hoje às 14:00 com prioridade Alta',
];

/**
 * Mini-Chatbot Assistente de Ação Rápida (Exclusivo para Tarefas e Produtividade):
 * - Widget flutuante lateral no Desktop (md:) e Gaveta / Tela Cheia no Mobile (< 768px)
 * - Conectado ao Google Gemini 2.5 Flash (POST /api/ai/assistant) e inserção em lote (POST /api/tasks/bulk)
 */
export const TaskAssistantChat: React.FC<TaskAssistantChatProps> = ({
  visible,
  currentDate,
  hasPendingSync,
  onSyncBeforeAction,
  onAddSuggestedTasks,
  onOpen,
  onClose,
  onNotify,
}) => {
  const [messages, setMessages] = useState<AssistantChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      text: 'Olá! Sou o Assistente Executivo BVS Special (exclusivo para gestão de tarefas). Diga qual meta ou rotina deseja organizar e eu preparo as tarefas prontas para adicionar ao seu cronograma com 1 toque.',
      createdAt: new Date().toISOString(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [applyingMsgId, setApplyingMsgId] = useState<string | null>(null);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }, 60);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const trimmed = (customPrompt ?? inputText).trim();
    if (!trimmed || isSending) return;

    const userMsg: AssistantChatMessage = {
      id: `usr_${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!customPrompt) setInputText('');
    setIsSending(true);
    scrollToBottom();

    try {
      if (hasPendingSync) {
        await onSyncBeforeAction();
      }

      const historyPayload = nextHistory
        .filter((m) => m.id !== 'welcome-msg')
        .slice(-6)
        .map((m) => ({ role: m.role, text: m.text }));

      const response = await apiAskTaskAssistant(trimmed, currentDate, historyPayload);

      if (!response.ok) {
        const errorText =
          response.error || 'Não foi possível consultar o Assistente IA agora. Tente novamente em instantes.';

        setMessages((prev) => [
          ...prev,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            text: errorText,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `ai_${Date.now()}`,
            role: 'assistant',
            text:
              response.reply ||
              'Preparei as tarefas abaixo para o seu planejamento.',
            createdAt: new Date().toISOString(),
            suggestedTasks: response.suggestedTasks || [],
          },
        ]);
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: 'assistant',
          text:
            err instanceof Error
              ? err.message
              : 'Falha ao comunicar com o Assistente IA.',
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
      scrollToBottom();
    }
  };

  const handleSubmitForm = (e: FormEvent) => {
    e.preventDefault();
    void handleSendMessage();
  };

  const handleConfirmAddTasks = async (
    msgId: string,
    suggested: AssistantSuggestedTask[],
  ) => {
    if (!suggested || suggested.length === 0 || applyingMsgId) return;

    setApplyingMsgId(msgId);
    try {
      const drafts: TaskDraft[] = suggested.map((item) => ({
        title: item.title,
        description: item.description,
        date: item.date || currentDate,
        time: item.time,
        priority: item.priority || 'medium',
        scope: item.scope || 'work',
      }));

      const result = await onAddSuggestedTasks(drafts);
      if (result.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, applied: true } : m)),
        );
        if (onNotify) {
          onNotify(
            result.synced
              ? `✅ ${result.count} tarefa(s) do Assistente IA adicionada(s) ao cronograma!`
              : `✅ ${result.count} tarefa(s) adicionada(s) localmente ao cronograma!`,
          );
        }
      }
    } finally {
      setApplyingMsgId(null);
    }
  };

  return (
    <>
      {/* Botão Flutuante Desktop para abrir o Mini-Chatbot Assistente IA */}
      {!visible && (
        <button
          type="button"
          onClick={onOpen}
          aria-label="Abrir Assistente IA de Tarefas"
          className="fixed right-6 bottom-6 z-40 hidden min-h-[50px] cursor-pointer items-center gap-2.5 rounded-full border border-[#FDE68A]/50 bg-gradient-to-r from-[#0F0F12] via-[#450A0A] to-[#991B1B] px-5 py-3 text-[13px] font-bold text-white shadow-[0_10px_28px_rgba(111,29,43,0.45)] transition-transform hover:scale-[1.03] active:scale-95 md:flex"
        >
          <span className="text-[18px]" aria-hidden="true">
            🤖
          </span>
          <span className="font-heading">Assistente IA</span>
        </button>
      )}

      {visible && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-end bg-black/50 backdrop-blur-[2px] md:bg-black/25 md:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Assistente IA de Tarefas"
        >
          <div className="animate-sheet-up safe-bottom flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-[#E6E2DA] bg-white shadow-2xl md:h-[640px] md:max-h-[85dvh] md:w-[430px] md:rounded-[26px] dark:border-[#27272A] dark:bg-[#18181B]">
            {/* Cabeçalho do Mini-Chatbot */}
            <div className="flex items-center justify-between border-b border-[#450A0A]/20 bg-gradient-to-r from-[#0F0F12] via-[#450A0A] to-[#7F1D1D] px-4 py-3.5 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 text-[18px]">
                  🤖
                </span>
                <div>
                  <h2 className="font-heading text-[15px] font-bold leading-tight">
                    Assistente IA • BVS Special
                  </h2>
                  <p className="text-[11px] text-[#FDE68A]">
                    Exclusivo para Tarefas &amp; Cronograma (Gemini 2.5)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar Assistente IA"
                className="flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-xl bg-white/10 text-[15px] font-bold text-white hover:bg-white/20"
              >
                ✕
              </button>
            </div>

            {/* Sugestões Rápidas de Comando */}
            <div className="flex gap-1.5 overflow-x-auto border-b border-[#F1EFEA] bg-[#FAF7F2] px-3.5 py-2 dark:border-[#27272A] dark:bg-[#202026]">
              {QUICK_PROMPTS.map((promptText, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={isSending}
                  onClick={() => void handleSendMessage(promptText)}
                  className="min-h-[36px] shrink-0 cursor-pointer rounded-xl border border-[#E6E2DA] bg-white px-2.5 py-1 text-[11px] font-bold text-[#6F1D2B] transition-colors hover:bg-[#FDF4F5] active:scale-95 dark:border-[#3F3F46] dark:bg-[#18181B] dark:text-[#FCA5A5]"
                >
                  ⚡ {promptText.slice(0, 36)}...
                </button>
              ))}
            </div>

            {/* Histórico de Mensagens + Cards de Tarefas Sugeridas */}
            <div className="flex-1 space-y-3.5 overflow-y-auto p-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-[#6F1D2B] text-white'
                        : 'border border-[#E6E2DA] bg-[#FAF7F2] text-[#0F0F12] dark:border-[#27272A] dark:bg-[#202026] dark:text-[#F4F4F5]'
                    }`}
                  >
                    <p>{msg.text}</p>

                    {/* Cards de Tarefas Sugeridas pela IA */}
                    {msg.suggestedTasks && msg.suggestedTasks.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-[#E6E2DA] pt-2.5 dark:border-[#3F3F46]">
                        <span className="block text-[11px] font-extrabold uppercase tracking-wider text-[#6F1D2B] dark:text-[#FCA5A5]">
                          📋 {msg.suggestedTasks.length} Tarefa(s) Sugerida(s):
                        </span>

                        {msg.suggestedTasks.map((task, idx) => {
                          const cfg =
                            SCOPE_CONFIG[task.scope] ?? SCOPE_CONFIG.work;
                          return (
                            <div
                              key={idx}
                              className="rounded-xl border border-[#E6E2DA] bg-white p-2.5 text-[#0F0F12] shadow-2xs dark:border-[#3F3F46] dark:bg-[#18181B] dark:text-white"
                            >
                              <div className="text-[12px] font-bold">
                                {task.title}
                              </div>
                              {task.description && (
                                <p className="mt-0.5 text-[11px] text-[#52525B] dark:text-[#A1A1AA]">
                                  {task.description}
                                </p>
                              )}
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-bold">
                                <span className="rounded bg-[#FAF7F2] px-2 py-0.5 text-[#3F3F46] dark:bg-[#27272A] dark:text-[#E4E4E7]">
                                  📅 {task.date}{' '}
                                  {task.time ? `⏰ ${task.time}` : ''}
                                </span>
                                <span
                                  className="rounded px-2 py-0.5"
                                  style={{
                                    backgroundColor: cfg.bgLight,
                                    color: cfg.color,
                                  }}
                                >
                                  {task.category || cfg.label}
                                </span>
                                <span className="rounded bg-[#F1EFEA] px-2 py-0.5 text-[#3F3F46] dark:bg-[#27272A] dark:text-[#D4D4D8]">
                                  Prioridade{' '}
                                  {PRIORITY_LABELS[task.priority] || 'Média'}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          disabled={
                            Boolean(msg.applied) || applyingMsgId === msg.id
                          }
                          onClick={() =>
                            void handleConfirmAddTasks(
                              msg.id,
                              msg.suggestedTasks!,
                            )
                          }
                          className={`mt-2 flex min-h-[44px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3.5 text-[12px] font-bold transition-all active:scale-95 ${
                            msg.applied
                              ? 'bg-[#E8F4EE] text-[#15803D] dark:bg-[#143323] dark:text-[#86EFAC]'
                              : 'bg-[#6F1D2B] text-white shadow-sm hover:bg-[#581521]'
                          }`}
                        >
                          {msg.applied
                            ? '✓ Adicionadas ao Cronograma!'
                            : applyingMsgId === msg.id
                              ? 'Adicionando em lote...'
                              : 'Confirmar e Adicionar ao Cronograma'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex items-center gap-2 text-[12px] font-semibold text-[#71717A]">
                  <span className="animate-pulse">🤖</span>
                  <span>Estruturando tarefas com Gemini...</span>
                </div>
              )}
              <div ref={scrollEndRef} />
            </div>

            {/* Campo de Digitação */}
            <form
              onSubmit={handleSubmitForm}
              className="flex items-center gap-2 border-t border-[#F1EFEA] bg-[#FAF9F6] p-3 dark:border-[#27272A] dark:bg-[#141417]"
            >
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ex.: Dividir entrega do projeto em 3 tarefas amanhã..."
                aria-label="Mensagem para o Assistente IA"
                className="min-h-[44px] flex-1 rounded-xl border border-[#E6E2DA] bg-white px-3.5 text-[14px] text-[#0F0F12] placeholder-[#71717A] outline-none focus:border-[#6F1D2B] dark:border-[#3F3F46] dark:bg-[#202026] dark:text-white"
              />
              <button
                type="submit"
                disabled={!inputText.trim() || isSending}
                className="min-h-[44px] min-w-[44px] cursor-pointer rounded-xl bg-[#6F1D2B] px-4 text-[13px] font-bold text-white shadow-xs transition-colors hover:bg-[#581521] active:scale-95 disabled:opacity-50"
              >
                Enviar
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
