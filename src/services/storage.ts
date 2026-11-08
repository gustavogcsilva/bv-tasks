import type { StateStorage } from 'zustand/middleware';
import type { TaskAttachment } from '../features/tasks/types/task.types';

/**
 * Fallback em memória caso o localStorage esteja indisponível ou atinja limite de cota.
 */
const memoryFallback = new Map<string, string>();
let cachedStorageAvailable: boolean | null = null;

function isLocalStorageAvailable(): boolean {
  if (cachedStorageAvailable !== null) {
    return cachedStorageAvailable;
  }
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      cachedStorageAvailable = false;
      return false;
    }
    const testKey = '__bv_tasks_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    cachedStorageAvailable = true;
    return true;
  } catch {
    cachedStorageAvailable = false;
    return false;
  }
}

/**
 * Implementação de armazenamento resiliente compatível com Zustand persist.
 * Usa localStorage como armazenamento primário e faz fallback transparente para memória.
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      if (isLocalStorageAvailable()) {
        const item = window.localStorage.getItem(name);
        if (item !== null) return item;
      }
    } catch {
      // Continua para o fallback em memória
    }
    return memoryFallback.get(name) ?? null;
  },

  setItem: (name: string, value: string): void => {
    memoryFallback.set(name, value);
    try {
      if (isLocalStorageAvailable()) {
        window.localStorage.setItem(name, value);
      }
    } catch {
      // Se exceder a cota ou falhar, mantém garantido no fallback em memória
    }
  },

  removeItem: (name: string): void => {
    try {
      if (isLocalStorageAvailable()) {
        window.localStorage.removeItem(name);
      }
    } catch {
      // Ignora erro de remoção no localStorage
    }
    memoryFallback.delete(name);
  },
};

/**
 * Gera um identificador único UUID v4 compatível com todos os navegadores.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Converte um arquivo (Foto da Câmera, Imagem da Galeria ou PDF) em um TaskAttachment
 * persistível localmente.
 */
export function readFileAsAttachment(file: File): Promise<TaskAttachment> {
  return new Promise((resolve, reject) => {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|webp|heic|gif)$/i.test(file.name);

    if (!isPdf && !isImage) {
      reject(new Error('Formato não suportado. Envie uma imagem ou arquivo PDF.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      resolve({
        id: generateId(),
        name: file.name || (isPdf ? 'documento.pdf' : 'foto-camera.jpg'),
        type: isPdf ? 'pdf' : 'image',
        mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
        dataUrl,
        size: file.size,
        createdAt: new Date().toISOString(),
      });
    };
    reader.readAsDataURL(file);
  });
}
