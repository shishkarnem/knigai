import React, { useRef, useState } from 'react';
import { NoirVoiceMicButton } from './NoirVoiceMicButton';

export interface NoirVoiceInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (nextVal: string) => void;
  voiceContext?: string;
  containerClassName?: string;
  onEnter?: () => void;
}

/**
 * Universal drop-in replacement for single-line text inputs with integrated Noir voice dictation.
 * Maintains zero corner radius, minimum 44px touch targets, >=14px PT Serif typography, and mobile safety.
 */
export const NoirVoiceInput: React.FC<NoirVoiceInputProps> = ({
  value,
  onValueChange,
  voiceContext = 'input_field',
  containerClassName = '',
  className = '',
  placeholder,
  disabled = false,
  onEnter,
  onKeyDown,
  type = 'text',
  ...rest
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  return (
    <div className={`w-full flex flex-col gap-1.5 min-w-0 ${containerClassName}`}>
      <div className="w-full flex items-stretch bg-zinc-950/85 border border-zinc-700 focus-within:border-white transition-colors rounded-none min-w-0">
        <input
          ref={inputRef}
          type={type}
          value={value}
          disabled={disabled}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && onEnter) {
              onEnter();
            }
            if (onKeyDown) {
              onKeyDown(e);
            }
          }}
          placeholder={placeholder}
          className={`flex-1 min-w-0 min-h-[44px] px-3.5 py-2 bg-transparent text-white placeholder-zinc-500 font-serif text-[14px] focus:outline-none rounded-none ${className}`}
          {...rest}
        />

        <NoirVoiceMicButton
          value={value}
          onChange={onValueChange}
          targetRef={inputRef}
          fieldContext={voiceContext}
          disabled={disabled}
          compact
          onErrorChange={setVoiceError}
          className="border-l border-zinc-800"
        />
      </div>

      {voiceError && (
        <div className="px-3 py-2 bg-zinc-950/90 border border-rose-500/60 text-rose-300 text-[14px] font-serif leading-snug rounded-none break-words">
          {voiceError}
        </div>
      )}
    </div>
  );
};
