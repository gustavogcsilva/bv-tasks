// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppServer, initDatabase } from '../../server.mjs';

describe('Persistência Multi-Dispositivo Real (Computador ↔ Celular) & Segurança da API SQL', () => {
  let baseUrl = '';
  let server;
  const dataDir = path.resolve(process.cwd(), 'data');

  beforeAll(async () => {
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
    await initDatabase();
    server = createAppServer();
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => {
      server.close(() => resolve());
    });
    if (fs.existsSync(dataDir)) {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  });

  it('deve criar conta no Dispositivo A (PC) e entrar direto no Dispositivo B (Celular) sem recriar usuário, sincronizando tarefas e exclusões', async () => {
    // 1. Dispositivo A (Computador): Registra conta
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Gustavo Executivo',
        email: 'gustavo@bvtasks.com',
        password: 'SenhaSegura@2026',
        recoveryKeyword: 'reserva',
      }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.ok).toBe(true);
    const pcToken = regData.token;
    expect(pcToken).toMatch(/^tok_/);

    // 2. Dispositivo A (Computador): Cria pasta e duas tarefas sigilosas
    await fetch(`${baseUrl}/api/folders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pcToken}`,
      },
      body: JSON.stringify({
        folder: {
          id: 'fld-1',
          name: 'Diretoria',
          scope: 'work',
          createdAt: '2026-11-08T00:00:00.000Z',
        },
      }),
    });

    await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pcToken}`,
      },
      body: JSON.stringify({
        task: {
          id: 'tsk-1',
          title: 'Aprovar Orçamento Anual',
          description: 'Validar planilha consolidada',
          date: '2026-11-08',
          time: '09:00',
          priority: 'high',
          scope: 'work',
          folderId: 'fld-1',
          isCompleted: false,
          createdAt: '2026-11-08T00:01:00.000Z',
        },
      }),
    });

    await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${pcToken}`,
      },
      body: JSON.stringify({
        task: {
          id: 'tsk-2',
          title: 'Tarefa Temporária',
          date: '2026-11-08',
          priority: 'low',
          scope: 'personal',
          isCompleted: false,
          createdAt: '2026-11-08T00:02:00.000Z',
        },
      }),
    });

    // 3. Dispositivo B (Celular Novo — sem nada salvo localmente): Faz Login direto!
    const mobileLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '  GUSTAVO@bvtasks.com ',
        password: ' SenhaSegura@2026 ',
      }),
    });
    expect(mobileLoginRes.status).toBe(200);
    const mobileData = await mobileLoginRes.json();
    expect(mobileData.ok).toBe(true);
    expect(mobileData.user.name).toBe('Gustavo Executivo');
    expect(mobileData.folders).toHaveLength(1);
    expect(mobileData.tasks).toHaveLength(2);

    const mobileToken = mobileData.token;

    // 4. Dispositivo B (Celular): Conclui tsk-1 e exclui tsk-2
    await fetch(`${baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${mobileToken}`,
      },
      body: JSON.stringify({
        task: {
          ...mobileData.tasks[0],
          isCompleted: true,
        },
      }),
    });

    await fetch(`${baseUrl}/api/tasks/tsk-2`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${mobileToken}` },
    });

    // 5. Volta ao Dispositivo A (Computador): Sincroniza e vê exatamente o que foi feito no celular
    const pcSyncRes = await fetch(`${baseUrl}/api/sync`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${pcToken}` },
    });
    const pcSyncData = await pcSyncRes.json();
    expect(pcSyncData.ok).toBe(true);
    expect(pcSyncData.tasks).toHaveLength(1);
    expect(pcSyncData.tasks[0].id).toBe('tsk-1');
    expect(pcSyncData.tasks[0].isCompleted).toBe(true);
  });

  it('deve garantir sigilo absoluto entre usuários, rejeitar tokens forjados e permitir limpeza total de dados', async () => {
    const otherRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Outro Usuário',
        email: 'outro@bvtasks.com',
        password: 'OutraSenha@99',
      }),
    });
    const otherData = await otherRes.json();
    expect(otherData.tasks).toHaveLength(0);
    expect(otherData.folders).toHaveLength(0);

    // Tentativa de reset de senha com token base64 forjado DEVE falhar (401)
    const forgedToken = Buffer.from('gustavo@bvtasks.com').toString('base64');
    const forgedReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'gustavo@bvtasks.com',
        token: forgedToken,
        newPassword: 'HackPassword123',
      }),
    });
    expect(forgedReset.status).toBe(401);

    // Link assinado legítimo gerado pelo servidor funciona com segurança
    const reqLink = await fetch(`${baseUrl}/api/auth/request-reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'gustavo@bvtasks.com',
        origin: 'https://bv-tasks.onrender.com',
      }),
    });
    const linkData = await reqLink.json();
    expect(linkData.ok).toBe(true);
    const validToken = new URL(linkData.resetLink).searchParams.get('reset_token');

    const validReset = await fetch(`${baseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'gustavo@bvtasks.com',
        token: validToken,
        newPassword: 'NovaSenhaConfirmada@2026',
      }),
    });
    expect(validReset.status).toBe(200);
    const resetBody = await validReset.json();

    // Limpeza completa de todas as tarefas e pastas (DELETE /api/sync/clear)
    const clearRes = await fetch(`${baseUrl}/api/sync/clear`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${resetBody.token}` },
    });
    const clearData = await clearRes.json();
    expect(clearData.ok).toBe(true);
    expect(clearData.tasks).toEqual([]);
    expect(clearData.folders).toEqual([]);
  });
});
