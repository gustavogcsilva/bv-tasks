import React from 'react';
import { VitorinoGirlAvatar } from '../features/ai-assistant/components/TaskAssistantChat';

export type WorkspaceTab = 'global' | 'agenda';

interface MobileBottomNavProps {
  activeTab: WorkspaceTab;
  onChangeTab: (tab: WorkspaceTab) => void;
  onNewTask: () => void;
  onOpenImport: () => void;
  onOpenAssistant: () => void;
}

/**
 * Barra de navegação inferior fixa exclusiva para smartphones (< 768px) com áreas de toque >= 44x44px
 * e suporte automático a `env(safe-area-inset-bottom)` no iOS/Android.
 */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onChangeTab,
  onNewTask,
  onOpenImport,
  onOpenAssistant,
}) => {
  return (
    <nav
      aria-label="Navegação rápida mobile"
      className="safe-bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E2DA] bg-white/95 px-2 pt-1.5 backdrop-blur-md shadow-[0_-6px_24px_rgba(24,24,27,0.08)] md:hidden dark:border-[#27272A] dark:bg-[#141417]/95"
    >
      <div className="mx-auto grid max-w-[540px] grid-cols-5 items-center gap-1">
        <button
          type="button"
          onClick={() => onChangeTab('global')}
          className={`flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold transition-colors active:scale-95 ${
            activeTab === 'global'
              ? 'bg-[#FDF4F5] text-[#6F1D2B] dark:bg-[#3A161D] dark:text-[#FCA5A5]'
              : 'text-[#52525B] hover:bg-[#F5F2EB] dark:text-[#A1A1AA] dark:hover:bg-[#27272A]'
          }`}
        >
          <span className="text-[16px] leading-none" aria-hidden="true">
            🗂️
          </span>
          <span>Visão Geral</span>
        </button>

        <button
          type="button"
          onClick={() => onChangeTab('agenda')}
          className={`flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold transition-colors active:scale-95 ${
            activeTab === 'agenda'
              ? 'bg-[#FDF4F5] text-[#6F1D2B] dark:bg-[#3A161D] dark:text-[#FCA5A5]'
              : 'text-[#52525B] hover:bg-[#F5F2EB] dark:text-[#A1A1AA] dark:hover:bg-[#27272A]'
          }`}
        >
          <span className="text-[16px] leading-none" aria-hidden="true">
            📅
          </span>
          <span>Agenda</span>
        </button>

        <button
          type="button"
          onClick={onNewTask}
          aria-label="Criar nova tarefa"
          className="flex min-h-[48px] min-w-[48px] -mt-3 cursor-pointer flex-col items-center justify-center rounded-2xl bg-[#6F1D2B] px-2 py-1.5 text-[10px] font-extrabold text-white shadow-[0_6px_16px_rgba(111,29,43,0.38)] transition-transform active:scale-95"
        >
          <span className="text-[18px] leading-none">+</span>
          <span>Nova</span>
        </button>

        <button
          type="button"
          onClick={onOpenImport}
          className="flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold text-[#52525B] transition-colors hover:bg-[#F5F2EB] active:scale-95 dark:text-[#A1A1AA] dark:hover:bg-[#27272A]"
        >
          <span className="text-[16px] leading-none" aria-hidden="true">
            📥
          </span>
          <span>Importar</span>
        </button>

        <button
          type="button"
          onClick={onOpenAssistant}
          className="flex min-h-[44px] min-w-[44px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-bold text-[#52525B] transition-colors hover:bg-[#F5F2EB] active:scale-95 dark:text-[#A1A1AA] dark:hover:bg-[#27272A]"
        >
          <VitorinoGirlAvatar size={20} />
          <span>Vitorino</span>
        </button>
      </div>
    </nav>
  );
};
