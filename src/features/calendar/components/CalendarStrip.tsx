import { useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  getDaysInMonth,
  isSameDay,
  isSameMonth,
  setDate as setDayOfMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SCOPE_CONFIG, type Scope, type Task } from '../../tasks/types/task.types';

interface CalendarStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  tasks?: Task[];
}

const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export function CalendarStrip({ selectedDate, onSelectDate, tasks = [] }: CalendarStripProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selectedDate));

  useEffect(() => {
    if (!isSameMonth(selectedDate, visibleMonth)) {
      setVisibleMonth(startOfMonth(selectedDate));
    }
  }, [selectedDate, visibleMonth]);

  const scopesByDate = useMemo(() => {
    const map = new Map<string, Set<Scope>>();
    for (const task of tasks) {
      const existing = map.get(task.date) ?? new Set<Scope>();
      existing.add(task.scope);
      map.set(task.date, existing);
    }
    return map;
  }, [tasks]);

  const monthDays = useMemo(
    () => eachDayOfInterval({ start: startOfMonth(visibleMonth), end: endOfMonth(visibleMonth) }),
    [visibleMonth],
  );

  const calendarGridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(visibleMonth), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [visibleMonth]);

  function changeMonth(direction: -1 | 1) {
    const targetMonth =
      direction === 1 ? addMonths(visibleMonth, 1) : subMonths(visibleMonth, 1);
    setVisibleMonth(targetMonth);
    onSelectDate(
      setDayOfMonth(targetMonth, Math.min(selectedDate.getDate(), getDaysInMonth(targetMonth))),
    );
  }

  function changeWeek(direction: -1 | 1) {
    const nextDate = direction === 1 ? addWeeks(selectedDate, 1) : subWeeks(selectedDate, 1);
    setVisibleMonth(startOfMonth(nextDate));
    onSelectDate(nextDate);
  }

  function goToToday() {
    const today = new Date();
    setVisibleMonth(startOfMonth(today));
    onSelectDate(today);
  }

  const isSelectedToday = isSameDay(selectedDate, new Date());

  return (
    <section
      aria-label="Calendário"
      className="rounded-3xl border border-[#E5E4E0] bg-white p-4 shadow-[0_4px_20px_rgba(15,15,18,0.04)] sm:p-5 dark:border-[#27272A] dark:bg-[#141418]"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-[18px] font-bold capitalize tracking-tight text-[#0F0F12] dark:text-[#FAFAFA]">
            {format(visibleMonth, 'MMMM yyyy', { locale: ptBR })}
          </h2>
          {!isSelectedToday && (
            <button
              type="button"
              onClick={goToToday}
              className="cursor-pointer rounded-lg bg-[#FEE2E2] px-2.5 py-1 text-[11px] font-bold text-[#991B1B] transition-colors hover:bg-[#FECACA] active:scale-95 dark:bg-[#3B1219] dark:text-[#FCA5A5]"
            >
              Hoje
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Semana anterior"
            title="Semana anterior (-7 dias)"
            onClick={() => changeWeek(-1)}
            className="flex h-[32px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-2 text-[11px] font-bold text-[#27272A] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1E1E24] dark:text-[#D4D4D8]"
          >
            -7d
          </button>
          <button
            type="button"
            aria-label="Próxima semana"
            title="Próxima semana (+7 dias)"
            onClick={() => changeWeek(1)}
            className="flex h-[32px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] px-2 text-[11px] font-bold text-[#27272A] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1E1E24] dark:text-[#D4D4D8]"
          >
            +7d
          </button>
          <button
            type="button"
            aria-label="Mês anterior"
            title="Mês anterior"
            onClick={() => changeMonth(-1)}
            className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] text-[20px] leading-none text-[#27272A] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1E1E24] dark:text-[#D4D4D8]"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            title="Próximo mês"
            onClick={() => changeMonth(1)}
            className="flex h-[32px] w-[32px] cursor-pointer items-center justify-center rounded-xl border border-[#E5E4E0] bg-[#F8F7F4] text-[20px] leading-none text-[#27272A] transition-colors hover:bg-[#ECE9E2] active:scale-95 dark:border-[#2E2E34] dark:bg-[#1E1E24] dark:text-[#D4D4D8]"
          >
            ›
          </button>
        </div>
      </div>

      <div className="mb-1.5 grid grid-cols-7 text-center">
        {WEEKDAYS.map((dayLabel, idx) => (
          <span
            key={idx}
            className="py-1 text-[11px] font-extrabold text-[#71717A] dark:text-[#A1A1AA]"
          >
            {dayLabel}
          </span>
        ))}
      </div>

      <div role="listbox" aria-label="Dias do mês" className="grid grid-cols-7 gap-1">
        {calendarGridDays.map((day) => {
          const inCurrentMonth = isSameMonth(day, visibleMonth);
          const isSelected = isSameDay(day, selectedDate);
          const isToday = isSameDay(day, new Date());
          const dayKey = format(day, 'yyyy-MM-dd');
          const dayScopes = scopesByDate.get(dayKey);

          const hasWork = dayScopes?.has('work') ?? false;
          const hasPersonal = dayScopes?.has('personal') ?? false;
          const hasStudy = dayScopes?.has('study') ?? false;

          return (
            <button
              key={dayKey}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
              onClick={() => onSelectDate(day)}
              className={`relative flex h-[48px] cursor-pointer flex-col items-center justify-center rounded-2xl transition-all duration-150 active:scale-95 ${
                isSelected
                  ? 'bg-gradient-to-br from-[#0F0F12] to-[#7F1D1D] font-extrabold text-white shadow-md shadow-[#7F1D1D]/30 dark:from-[#991B1B] dark:to-[#450A0A]'
                  : inCurrentMonth
                    ? isToday
                      ? 'border border-[#991B1B]/50 bg-[#FEF2F2] font-bold text-[#991B1B] dark:bg-[#271518] dark:text-[#FCA5A5]'
                      : 'bg-[#F8F7F4] font-semibold text-[#0F0F12] hover:bg-[#ECE9E2] dark:bg-[#1C1C22] dark:text-[#F4F4F5] dark:hover:bg-[#27272F]'
                    : 'bg-transparent text-[#A1A1AA] opacity-50 hover:opacity-80 dark:text-[#52525B]'
              }`}
            >
              <span className="text-[14px] leading-none">{format(day, 'd')}</span>

              <span className="mt-1.5 flex min-h-[6px] items-center justify-center gap-1">
                {hasWork && (
                  <span
                    title="Trabalho (Vinho)"
                    className={`h-1.5 w-1.5 rounded-full ${
                      isSelected ? 'bg-[#FECACA] ring-1 ring-white' : 'bg-[#991B1B]'
                    }`}
                  />
                )}
                {hasPersonal && (
                  <span
                    title="Pessoal (Azul)"
                    className={`h-1.5 w-1.5 rounded-full ${
                      isSelected ? 'bg-[#93C5FD] ring-1 ring-white' : 'bg-[#2563EB]'
                    }`}
                  />
                )}
                {hasStudy && (
                  <span
                    title="Estudo (Rosa)"
                    className={`h-1.5 w-1.5 rounded-full ${
                      isSelected ? 'bg-[#F9A8D4] ring-1 ring-white' : 'bg-[#DB2777]'
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legenda de Cores no Rodapé do Calendário */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#E5E4E0] pt-3 text-[11px] font-bold text-[#52525B] dark:border-[#27272A] dark:text-[#A1A1AA]">
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: SCOPE_CONFIG.work.color }}
          />
          <span>Trabalho (Vinho)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: SCOPE_CONFIG.personal.color }}
          />
          <span>Pessoal (Azul)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: SCOPE_CONFIG.study.color }}
          />
          <span>Estudo (Rosa)</span>
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] text-[#71717A] dark:text-[#71717A]">
        {monthDays.length} dias em {format(visibleMonth, 'MMMM', { locale: ptBR })}
      </p>
    </section>
  );
}
