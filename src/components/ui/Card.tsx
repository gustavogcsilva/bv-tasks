import type { HTMLAttributes, PropsWithChildren } from 'react';

interface CardProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {}

export function Card({ children, className = '', ...rest }: CardProps) {
  return (
    <div
      className={`rounded-2xl border border-[#E5E4E0] bg-white shadow-[0_2px_12px_rgba(15,15,18,0.04)] transition-all duration-150 dark:border-[#27272A] dark:bg-[#141418] dark:shadow-none ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
