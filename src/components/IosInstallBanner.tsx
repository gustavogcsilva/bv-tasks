import React, { useEffect, useState } from 'react';
import { safeLocalStorage } from '../services/storage';

const DISMISS_STORAGE_KEY = 'bv_ios_install_banner_dismissed_v1';

export interface IosEnvironmentLike {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone?: boolean;
  matchMedia?: (query: string) => { matches: boolean };
}

/**
 * Detecta Safari no iPhone/iPad/iPod executando fora do modo PWA standalone (`navigator.standalone !== true`).
 */
export function isIosSafariNotStandalone(env?: IosEnvironmentLike): boolean {
  const nav =
    env ??
    (typeof navigator !== 'undefined'
      ? (navigator as unknown as IosEnvironmentLike)
      : undefined);

  if (!nav) {
    return false;
  }

  const ua = String(nav.userAgent ?? '');
  const platform = String(nav.platform ?? '');
  const maxTouchPoints = Number(nav.maxTouchPoints ?? 0);

  const isIosDevice =
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === 'MacIntel' && maxTouchPoints > 1);

  if (!isIosDevice) {
    return false;
  }

  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  const isSafariEngine = /Safari/i.test(ua) && /WebKit/i.test(ua) && !isOtherIosBrowser;

  if (!isSafariEngine) {
    return false;
  }

  const mediaQueryStandalone =
    typeof env?.matchMedia === 'function'
      ? env.matchMedia('(display-mode: standalone)').matches
      : typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)').matches
        : false;

  const navigatorStandalone =
    env?.standalone !== undefined
      ? env.standalone
      : typeof window !== 'undefined'
        ? (window.navigator as Navigator & { standalone?: boolean }).standalone
        : undefined;

  return navigatorStandalone !== true && !mediaQueryStandalone;
}

/** Ícone oficial de Compartilhar do iOS (caixa com seta para cima). */
function AppleShareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mx-1 inline-block align-text-bottom text-[#6F1D2B] dark:text-[#FCA5A5]"
    >
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/**
 * Banner discreto exibido apenas no Safari do iOS quando o app ainda não foi instalado na Tela de Início.
 */
export const IosInstallBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = safeLocalStorage.getItem(DISMISS_STORAGE_KEY) === '1';
    if (!dismissed && isIosSafariNotStandalone()) {
      setVisible(true);
    }
  }, []);

  if (!visible) {
    return null;
  }

  const handleDismiss = () => {
    safeLocalStorage.setItem(DISMISS_STORAGE_KEY, '1');
    setVisible(false);
  };

  return (
    <aside
      aria-label="Guia rápido para instalar na Tela de Início do iPhone"
      className="flex items-center justify-between gap-3 rounded-[18px] border border-[#E5D3D6] bg-gradient-to-r from-[#FDF6F7] via-[#FAF7F2] to-[#FFFFFF] px-4 py-3 text-[12px] text-[#3F3F46] shadow-xs dark:border-[#4C1D24] dark:bg-gradient-to-r dark:from-[#261317] dark:to-[#18181B] dark:text-[#E4E4E7]"
    >
      <div className="flex items-start gap-2.5 sm:items-center">
        <span
          className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#6F1D2B] text-white sm:mt-0"
          aria-hidden="true"
        >
          📱
        </span>
        <p className="leading-relaxed">
          <strong className="font-bold text-[#6F1D2B] dark:text-[#FCA5A5]">
            Acesso com 1 toque no iPhone:
          </strong>{' '}
          Toque em <span className="font-semibold">Compartilhar</span>
          <AppleShareIcon />
          <span>→</span>{' '}
          <span className="font-semibold">Adicionar à Tela de Início</span> para abrir sem barra do Safari.
        </p>
      </div>

      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fechar aviso de instalação no iOS"
        className="flex min-h-[44px] min-w-[44px] shrink-0 cursor-pointer items-center justify-center rounded-xl border border-[#E6E2DA] bg-white px-2.5 text-[12px] font-bold text-[#52525B] transition-colors hover:bg-[#F5F2EB] active:scale-95 dark:border-[#3F3F46] dark:bg-[#27272A] dark:text-[#D4D4D8]"
      >
        ✕
      </button>
    </aside>
  );
};
