import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function capitalizeWords(text: string): string {
  return text.replace(/(^|\s|-)([a-zà-ú])/g, (match) => match.toUpperCase());
}

export function formatBrazilianLiveDateTime(now: Date): {
  fullDateLabel: string;
  compactDateLabel: string;
  timeLabel: string;
} {
  const weekday = capitalizeWords(format(now, 'EEEE', { locale: ptBR }));
  const day = format(now, 'dd', { locale: ptBR });
  const month = capitalizeWords(format(now, 'MMMM', { locale: ptBR }));
  const year = format(now, 'yyyy', { locale: ptBR });
  const shortWeekday = capitalizeWords(format(now, 'EEE', { locale: ptBR }).replace('.', ''));
  const shortMonth = capitalizeWords(format(now, 'MMM', { locale: ptBR }).replace('.', ''));
  const timeLabel = format(now, 'HH:mm:ss');

  return {
    fullDateLabel: `${weekday}, ${day} de ${month} de ${year}`,
    compactDateLabel: `${shortWeekday}, ${day} ${shortMonth} ${year}`,
    timeLabel,
  };
}

/**
 * Relógio e Data Exata em Tempo Real sincronizado a cada segundo (1000ms) com o dispositivo local.
 * Utiliza `tabular-nums` para evitar deslocamento horizontal dos dígitos de segundos.
 */
export const LiveClockBadge: React.FC = () => {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => window.clearInterval(timerId);
  }, []);

  const { fullDateLabel, compactDateLabel, timeLabel } = formatBrazilianLiveDateTime(now);

  return (
    <div
      aria-label="Data e hora em tempo real"
      className="inline-flex min-h-[38px] items-center gap-2 rounded-xl border border-[#E6E2DA] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#27272A] shadow-2xs dark:border-[#27272A] dark:bg-[#18181B] dark:text-[#E4E4E7]"
    >
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-[#991B1B] animate-pulse dark:bg-[#F87171]"
        aria-hidden="true"
      />
      <span className="font-heading hidden md:inline text-[#3F3F46] dark:text-[#D4D4D8]">
        {fullDateLabel}
      </span>
      <span className="font-heading md:hidden text-[#3F3F46] dark:text-[#D4D4D8]">
        {compactDateLabel}
      </span>
      <span className="text-[#991B1B] dark:text-[#FCA5A5]" aria-hidden="true">
        •
      </span>
      <time
        dateTime={now.toISOString()}
        className="font-mono text-[12px] sm:text-[13px] font-extrabold tracking-tight text-[#6F1D2B] tabular-nums dark:text-[#FCA5A5]"
      >
        {timeLabel}
      </time>
    </div>
  );
};
