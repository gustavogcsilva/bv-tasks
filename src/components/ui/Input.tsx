import { useId, useState, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface BaseInputProps {
  label: string;
  onChangeText?: (value: string) => void;
  multiline?: boolean;
}

type SingleLineProps = BaseInputProps &
  InputHTMLAttributes<HTMLInputElement> & {
    multiline?: false;
  };

type MultiLineProps = BaseInputProps &
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    multiline: true;
    type?: never;
  };

export type InputProps = SingleLineProps | MultiLineProps;

export function Input(props: InputProps) {
  const generatedId = useId();
  const [showPassword, setShowPassword] = useState(false);
  const { label, onChangeText, multiline, className = '', id, type, ...rest } = props;
  const inputId = id ?? generatedId;

  const isPassword = type === 'password';
  const resolvedType = isPassword ? (showPassword ? 'text' : 'password') : type;

  // text-[16px] evita o zoom automático do Safari iOS ao focar no campo de texto
  const baseClasses =
    'w-full min-h-[48px] rounded-xl border border-[#D6D3CD] bg-white px-3.5 py-3 text-[16px] text-[#0F0F12] placeholder:text-[#8E8C84] outline-none transition-colors focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/15 dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5] dark:placeholder:text-[#71717A] dark:focus:border-[#DC2626]';

  // Configurações essenciais para evitar auto-capitalização incorreta no teclado do celular (iOS / Android)
  const isSensitiveField = isPassword || type === 'email';
  const autoCapitalize = isSensitiveField ? 'none' : (rest as InputHTMLAttributes<HTMLInputElement>).autoCapitalize;
  const autoCorrect = isSensitiveField ? 'off' : (rest as InputHTMLAttributes<HTMLInputElement>).autoCorrect;
  const spellCheck = isSensitiveField ? false : (rest as InputHTMLAttributes<HTMLInputElement>).spellCheck;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={inputId}
          className="text-[13px] font-semibold tracking-tight text-[#27272A] dark:text-[#D4D4D8]"
        >
          {label}
        </label>
        {isPassword && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
            className="cursor-pointer text-[11px] font-bold text-[#71717A] hover:text-[#991B1B] dark:text-[#A1A1AA] dark:hover:text-[#FCA5A5]"
          >
            {showPassword ? '🙈 Ocultar' : '👁️ Ver senha'}
          </button>
        )}
      </div>

      {multiline ? (
        <textarea
          id={inputId}
          rows={3}
          onChange={(e) => {
            onChangeText?.(e.target.value);
            (rest as TextareaHTMLAttributes<HTMLTextAreaElement>).onChange?.(e);
          }}
          className={`${baseClasses} min-h-[84px] resize-none ${className}`}
          {...(rest as TextareaHTMLAttributes<HTMLTextAreaElement>)}
        />
      ) : (
        <div className="relative flex w-full items-center">
          <input
            id={inputId}
            type={resolvedType}
            autoCapitalize={autoCapitalize}
            autoCorrect={autoCorrect}
            spellCheck={spellCheck}
            onChange={(e) => {
              onChangeText?.(e.target.value);
              (rest as InputHTMLAttributes<HTMLInputElement>).onChange?.(e);
            }}
            className={`${baseClasses} ${isPassword ? 'pr-11' : ''} ${className}`}
            {...(rest as InputHTMLAttributes<HTMLInputElement>)}
          />
        </div>
      )}
    </div>
  );
}
