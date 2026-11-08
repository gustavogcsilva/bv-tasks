import { beforeEach, describe, expect, it } from 'vitest';
import { sortTasks, useTaskStore } from '../stores/useTaskStore';
import {
  generateIcsContent,
  getGoogleCalendarUrl,
} from '../services/notificationsAndCalendar';
import type { Task } from '../features/tasks/types/task.types';

describe('useTaskStore — Autenticação (Google, E-mail, Recuperação), Tema Claro/Escuro, Calendário (.ics) e Tarefas', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useTaskStore.setState({
      tasks: [],
      folders: [],
      selectedDate: '2026-11-07',
      scopeFilter: 'all',
      selectedFolderId: 'all',
      theme: 'light',
      currentUser: null,
      registeredAccounts: [],
    });
  });

  it('deve criar conta com palavra-chave, recuperar senha por palavra-chave ou link de e-mail, e logar com Google', async () => {
    const res = await useTaskStore
      .getState()
      .registerAccount('Bruno Vinicius', 'bv@tasks.com', '123456', 'malbec');

    expect(res.ok).toBe(true);
    expect(useTaskStore.getState().currentUser?.name).toBe('Bruno Vinicius');

    // Simula esquecimento de senha e recuperação via palavra-chave ("malbec")
    useTaskStore.getState().logoutAccount();
    const wrongKeyword = await useTaskStore
      .getState()
      .resetPasswordWithKeyword('bv@tasks.com', 'errada', 'nova123456');
    expect(wrongKeyword.ok).toBe(false);

    const rightKeyword = await useTaskStore
      .getState()
      .resetPasswordWithKeyword('bv@tasks.com', 'malbec', 'nova123456');
    expect(rightKeyword.ok).toBe(true);
    expect(useTaskStore.getState().currentUser?.email).toBe('bv@tasks.com');

    // Simula recuperação via link enviado por e-mail
    useTaskStore.getState().logoutAccount();
    const linkRes = useTaskStore.getState().requestPasswordResetLink('bv@tasks.com');
    expect(linkRes.ok).toBe(true);
    expect(linkRes.resetLink).toContain('reset_token=');

    const emailReset = await useTaskStore
      .getState()
      .resetPasswordViaEmailLink('bv@tasks.com', 'senhaEmail99');
    expect(emailReset.ok).toBe(true);

    // Simula autenticação via Google
    useTaskStore.getState().logoutAccount();
    const googleRes = await useTaskStore.getState().loginWithGoogle({
      name: 'Bruno Google',
      email: 'bruno.google@gmail.com',
    });
    expect(googleRes.ok).toBe(true);
    expect(useTaskStore.getState().currentUser?.provider).toBe('google');
  });

  it('deve alternar entre modo claro (light) e escuro (dark)', () => {
    expect(useTaskStore.getState().theme).toBe('light');
    useTaskStore.getState().toggleTheme();
    expect(useTaskStore.getState().theme).toBe('dark');
    useTaskStore.getState().toggleTheme();
    expect(useTaskStore.getState().theme).toBe('light');
  });

  it('deve gerar arquivo .ics (iCalendar com VALARM) e URL do Google Calendar para sincronizar com o celular', () => {
    const task = useTaskStore.getState().addTask({
      title: 'Reunião Executiva B V',
      description: 'Apresentação de resultados',
      date: '2026-11-07',
      time: '14:30',
      priority: 'high',
      scope: 'work',
    });

    const ics = generateIcsContent([task]);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:[B V Tasks • Trabalho] Reunião Executiva B V');
    expect(ics).toContain('BEGIN:VALARM');

    const gcalUrl = getGoogleCalendarUrl(task);
    expect(gcalUrl).toContain('calendar.google.com/calendar/render');
  });

  it('deve ordenar tarefas por status de conclusão, Prioridade (Alta > Média > Baixa) e horário', () => {
    const sampleTasks: Task[] = [
      {
        id: '1',
        title: 'Tarefa Baixa Pessoal',
        date: '2026-11-07',
        priority: 'low',
        scope: 'personal',
        isCompleted: false,
        createdAt: '2026-11-07T08:00:00.000Z',
      },
      {
        id: '2',
        title: 'Tarefa Alta Concluída',
        date: '2026-11-07',
        priority: 'high',
        scope: 'work',
        isCompleted: true,
        createdAt: '2026-11-07T07:00:00.000Z',
      },
      {
        id: '3',
        title: 'Tarefa Média Estudo 14h',
        date: '2026-11-07',
        time: '14:00',
        priority: 'medium',
        scope: 'study',
        isCompleted: false,
        createdAt: '2026-11-07T09:00:00.000Z',
      },
      {
        id: '4',
        title: 'Tarefa Alta Trabalho Pendente',
        date: '2026-11-07',
        time: '10:00',
        priority: 'high',
        scope: 'work',
        isCompleted: false,
        createdAt: '2026-11-07T10:00:00.000Z',
      },
    ];

    const sorted = sortTasks(sampleTasks);
    expect(sorted.map((t) => t.title)).toEqual([
      'Tarefa Alta Trabalho Pendente',
      'Tarefa Média Estudo 14h',
      'Tarefa Baixa Pessoal',
      'Tarefa Alta Concluída',
    ]);
  });
});
