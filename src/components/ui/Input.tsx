import { useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

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
  };

export type InputProps = SingleLineProps | MultiLineProps;

export function Input(props: InputProps) {
  const generatedId = useId();
  const { label, onChangeText, multiline, className = '', id, ...rest } = props;
  const inputId = id ?? generatedId;

  // text-[16px] evita o zoom automático do Safari iOS ao focar no campo de texto
  const baseClasses =
    'w-full min-h-[48px] rounded-xl border border-[#D6D3CD] bg-white px-3.5 py-3 text-[16px] text-[#0F0F12] placeholder:text-[#8E8C84] outline-none transition-colors focus:border-[#991B1B] focus:ring-2 focus:ring-[#991B1B]/15 dark:border-[#2E2E34] dark:bg-[#1C1C22] dark:text-[#F4F4F5] dark:placeholder:text-[#71717A] dark:focus:border-[#DC2626]';

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        className="text-[13px] font-semibold tracking-tight text-[#27272A] dark:text-[#D4D4D8]"
      >
        {label}
      </label>
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
        <input
          id={inputId}
          onChange={(e) => {
            onChangeText?.(e.target.value);
            (rest as InputHTMLAttributes<HTMLInputElement>).onChange?.(e);
          }}
          className={`${baseClasses} ${className}`}
          {...(rest as InputHTMLAttributes<HTMLInputElement>)}
        />
      )}
    </div>
  );
}
