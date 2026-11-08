import { describe, expect, it, vi } from 'vitest';
import { generateId, safeLocalStorage } from '../services/storage';

describe('Serviço de Persistência (safeLocalStorage & generateId)', () => {
  it('deve salvar, ler e remover dados do localStorage quando disponível', () => {
    safeLocalStorage.setItem('test-key', '{"hello":"world"}');
    expect(safeLocalStorage.getItem('test-key')).toBe('{"hello":"world"}');

    safeLocalStorage.removeItem('test-key');
    expect(safeLocalStorage.getItem('test-key')).toBeNull();
  });

  it('deve usar fallback em memória sem lançar erro caso o localStorage esteja bloqueado', () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError / Safari Private Mode');
    });

    expect(() => safeLocalStorage.setItem('fallback-key', 'valor-seguro')).not.toThrow();
    expect(safeLocalStorage.getItem('fallback-key')).toBe('valor-seguro');

    safeLocalStorage.removeItem('fallback-key');
    expect(safeLocalStorage.getItem('fallback-key')).toBeNull();

    setItemSpy.mockRestore();
  });

  it('deve gerar identificadores únicos válidos com generateId', () => {
    const id1 = generateId();
    const id2 = generateId();

    expect(id1).toMatch(/^[0-9a-f-]{36}$/i);
    expect(id1).not.toBe(id2);
  });
});
