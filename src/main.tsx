import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './pwa/registerServiceWorker';
import './styles/index.css';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro inesperado ao carregar a interface.',
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[B V Tasks ErrorBoundary]:', error, info);
  }

  handleResetAndReload = () => {
    try {
      window.localStorage.removeItem('bv-tasks-storage');
      window.localStorage.removeItem('focus-calendar-tasks');
    } catch {
      // Ignora erro de storage
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh w-full flex-col items-center justify-center bg-[#09090B] p-6 text-center text-white">
          <div className="max-w-md rounded-3xl border border-[#991B1B]/40 bg-[#141418] p-7 shadow-2xl">
            <h1 className="font-serif text-2xl font-bold text-white">B V Tasks</h1>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              Detectamos dados antigos em cache no navegador. Clique abaixo para sincronizar a nova
              versão.
            </p>
            <button
              type="button"
              onClick={this.handleResetAndReload}
              className="mt-5 w-full cursor-pointer rounded-xl bg-[#991B1B] px-4 py-3 text-sm font-bold text-white hover:bg-[#7F1D1D]"
            >
              Recarregar Aplicação
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Registra o Service Worker para suporte Offline e PWA
registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado no index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
);
