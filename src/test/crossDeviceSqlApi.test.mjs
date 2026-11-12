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

  it('deve importar planejamento em lote via POST /api/tasks/bulk em transação única e gerar fechamento mensal via POST /api/ai/monthly-review', async () => {
    // Autentica ou registra usuário para testar bulk + AI review
    const userRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Executivo Bulk',
        email: 'bulk@bvtasks.com',
        password: 'SenhaBulk@2026',
      }),
    });
    const userJson = await userRes.json();
    expect(userRes.status).toBe(201);
    const token = userJson.token;

    // Sem autenticação deve retornar 401
    const unauthBulk = await fetch(`${baseUrl}/api/tasks/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: [] }),
    });
    expect(unauthBulk.status).toBe(401);

    // Payload inválido (sem título) deve retornar 400
    const badBulk = await fetch(`${baseUrl}/api/tasks/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tasks: [{ title: '', date: '2026-11-20' }],
      }),
    });
    expect(badBulk.status).toBe(400);

    // Inserção em lote válida (concluída + 2 pendentes no mês 2026-11)
    const bulkRes = await fetch(`${baseUrl}/api/tasks/bulk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        tasks: [
          {
            id: 'bulk-1',
            title: 'Auditoria Fiscal',
            date: '2026-11-05',
            time: '09:00',
            priority: 'high',
            scope: 'work',
            isCompleted: true,
          },
          {
            id: 'bulk-2',
            title: 'Revisão Orçamentária',
            date: '2026-11-18',
            time: '15:30',
            priority: 'high',
            scope: 'work',
            isCompleted: false,
          },
          {
            id: 'bulk-3',
            title: 'Curso Arquitetura Cloud',
            date: '2026-11-22',
            priority: 'medium',
            scope: 'study',
            isCompleted: false,
          },
        ],
      }),
    });
    expect(bulkRes.status).toBe(201);
    const bulkData = await bulkRes.json();
    expect(bulkData.ok).toBe(true);
    expect(bulkData.insertedCount).toBe(3);

    // Sem GEMINI_API_KEY configurada e sem mock deve responder 503 com missingApiKey: true
    const prevKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    try {
      const noKeyRes = await fetch(`${baseUrl}/api/ai/monthly-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ month: '2026-11' }),
      });
      expect(noKeyRes.status).toBe(503);
      const noKeyJson = await noKeyRes.json();
      expect(noKeyJson.missingApiKey).toBe(true);
    } finally {
      if (prevKey !== undefined) process.env.GEMINI_API_KEY = prevKey;
    }

    // Servidor auxiliar com geminiGenerateFn mockada valida cálculo de KPIs + retorno estruturado
    let capturedPromptPayload = null;
    const aiServer = createAppServer({
      geminiGenerateFn: async (input) => {
        capturedPromptPayload = input;
        return {
          diagnostico: 'Bom ritmo de entregas em 2026-11 (33% concluído), foco necessário em Trabalho.',
          proximosPassos: [
            'Priorizar Revisão Orçamentária logo na primeira semana.',
            'Reservar blocos matinais de 45 min para estudos.',
            'Encerrar pendências de alta prioridade até dia 10.',
          ],
          tarefasSugeridasProximoMes: [
            {
              title: 'Planejamento Estratégico 2026-12',
              description: 'Consolidar metas do mês seguinte',
              date: '2026-12-03',
              time: '09:00',
              priority: 'high',
              scope: 'work',
            },
          ],
        };
      },
      geminiAssistantFn: async (input) => {
        return {
          reply: `Metas estruturadas para ${input.currentDate} com foco em produtividade.`,
          suggestedTasks: [
            {
              title: 'Preparar pauta executiva',
              description: 'Definir prioridades da manhã',
              date: input.currentDate,
              time: '08:30',
              category: 'Trabalho',
              priority: 'Alta',
            },
          ],
        };
      },
    });

    await new Promise((resolve) => {
      aiServer.listen(0, '127.0.0.1', () => resolve());
    });
    const aiAddr = aiServer.address();
    try {
      const aiRes = await fetch(`http://127.0.0.1:${aiAddr.port}/api/ai/monthly-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ month: '2026-11' }),
      });
      expect(aiRes.status).toBe(200);
      const aiJson = await aiRes.json();
      expect(aiJson.ok).toBe(true);
      expect(aiJson.nextMonth).toBe('2026-12');
      expect(aiJson.stats).toMatchObject({
        total: 3,
        completed: 1,
        pending: 2,
        completionRate: 33,
      });
      expect(aiJson.review.proximosPassos).toHaveLength(3);
      expect(aiJson.review.tarefasSugeridasProximoMes[0].title).toBe(
        'Planejamento Estratégico 2026-12',
      );
      // Garante que apenas resumo + pendências foram enviados ao Gemini
      expect(capturedPromptPayload.pendingSummary).toHaveLength(2);

      // Testa POST /api/ai/assistant (Mini-Chatbot de Ação Rápida)
      const chatRes = await fetch(`http://127.0.0.1:${aiAddr.port}/api/ai/assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: 'Organize minha manhã de hoje em 1 tarefa de Trabalho',
          currentDate: '2026-11-11',
        }),
      });
      expect(chatRes.status).toBe(200);
      const chatJson = await chatRes.json();
      expect(chatJson.ok).toBe(true);
      expect(chatJson.reply).toContain('2026-11-11');
      expect(chatJson.suggestedTasks).toHaveLength(1);
      expect(chatJson.suggestedTasks[0]).toMatchObject({
        title: 'Preparar pauta executiva',
        date: '2026-11-11',
        time: '08:30',
        category: 'Trabalho',
        scope: 'work',
        priority: 'high',
      });

      // Testa GET /api/calendar/feed-token e GET /api/calendar/feed/:userToken.ics (Sincronização Apple Calendar webcal://)
      const feedTokenRes = await fetch(
        `http://127.0.0.1:${aiAddr.port}/api/calendar/feed-token`,
        {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      expect(feedTokenRes.status).toBe(200);
      const feedTokenJson = await feedTokenRes.json();
      expect(feedTokenJson.ok).toBe(true);
      expect(feedTokenJson.feedPath).toMatch(/^\/api\/calendar\/feed\/.+\.ics$/);

      const icsRes = await fetch(
        `http://127.0.0.1:${aiAddr.port}${feedTokenJson.feedPath}`,
      );
      expect(icsRes.status).toBe(200);
      expect(icsRes.headers.get('content-type')).toContain('text/calendar');
      const icsBody = await icsRes.text();
      expect(icsBody).toContain('BEGIN:VCALENDAR');
      expect(icsBody).toContain('Revisão Orçamentária');
      // Tarefas já concluídas não devem poluir o feed ativo de assinatura
      expect(icsBody).not.toContain('Auditoria Fiscal');

      // Teste de vulnerabilidade: token de calendário adulterado deve ser rejeitado (401)
      const forgedFeedRes = await fetch(
        `http://127.0.0.1:${aiAddr.port}/api/calendar/feed/forged_invalid_token.ics`,
      );
      expect(forgedFeedRes.status).toBe(401);
    } finally {
      await new Promise((resolve) => aiServer.close(() => resolve()));
    }
  });
});
