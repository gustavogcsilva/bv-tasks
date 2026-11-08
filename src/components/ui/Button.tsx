import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

interface ButtonProps extends PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> {
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'plain' | 'danger';
  loading?: boolean;
}

export function Button({
  children,
  onPress,
  onClick,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  type = 'button',
  ...rest
}: ButtonProps) {
  const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
    primary:
      'bg-gradient-to-r from-[#7F1D1D] to-[#991B1B] text-white shadow-md shadow-[#7F1D1D]/25 hover:from-[#651515] hover:to-[#7F1D1D]',
    secondary:
      'bg-[#F4EBEB] text-[#7F1D1D] hover:bg-[#EADADA] dark:bg-[#271518] dark:text-[#FCA5A5] dark:hover:bg-[#351B20]',
    plain:
      'bg-transparent text-[#7F1D1D] hover:bg-[#7F1D1D]/10 dark:text-[#FCA5A5]',
    danger:
      'bg-[#FDECEC] text-[#B91C1C] hover:bg-[#FADADA] dark:bg-[#3B1219] dark:text-[#FCA5A5]',
  };

  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={(event) => {
        onPress?.();
        onClick?.(event);
      }}
      className={`inline-flex min-h-[48px] cursor-pointer items-center justify-center rounded-[14px] px-[18px] text-[15px] font-bold tracking-tight transition-all duration-150 active:scale-[0.98] active:opacity-85 disabled:cursor-not-allowed disabled:opacity-55 ${variantClasses[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <span
          aria-label="Carregando"
          className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : (
        children
      )}
    </button>
  );
}
