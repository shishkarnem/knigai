import React from 'react';
import { Mic, Square, Trash2, Loader2 } from 'lucide-react';
import {
  useVoiceDictation,
  formatVoiceTimer,
  insertVoiceTextIntoElement,
} from '../../hooks/useVoiceDictation';

export interface NoirVoiceMicButtonProps {
  value: string;
  onChange: (nextVal: string) => void;
  targetRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  fieldContext?: string;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  className?: string;
  onErrorChange?: (err: string | null) => void;
  onAudioSaved?: (audioUrl: string, shortUrl: string) => void;
}

/**
 * Compact Noir microphone control with >=44x44px touch hitbox, B&W + crimson accent, zero corner radius.
 */
export const NoirVoiceMicButton: React.FC<NoirVoiceMicButtonProps> = ({
  value,
  onChange,
  targetRef,
  fieldContext = 'text_field',
  disabled = false,
  label,
  compact = true,
  className = '',
  onErrorChange,
  onAudioSaved,
}) => {
  const {
    isRecording,
    isTranscribing,
    recordingSeconds,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  } = useVoiceDictation({
    fieldContext,
    onTextRecognized: (text) => {
      insertVoiceTextIntoElement(value, text, targetRef?.current ?? null, onChange);
    },
    onAudioSaved,
  });

  React.useEffect(() => {
    if (onErrorChange) onErrorChange(errorMessage);
  }, [errorMessage, onErrorChange]);

  return (
    <div className={`inline-flex flex-col items-end gap-1 shrink-0 ${className}`}>
      <div className="inline-flex items-center gap-1 shrink-0">
        {isTranscribing ? (
          <div
            className="min-h-[44px] px-3 flex items-center gap-2 bg-zinc-900 border border-rose-500/60 text-white text-[14px] font-serif rounded-none"
            title="Распознавание речи через голосовой модуль ИИ"
          >
            <Loader2 className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
            {!compact && <span>Распознаю...</span>}
          </div>
        ) : isRecording ? (
          <>
            <button
              type="button"
              onClick={stopRecording}
              title="Остановить запись и распознать речь"
              className="min-h-[44px] px-3 flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 text-[14px] font-bold cursor-pointer rounded-none transition-colors shrink-0"
            >
              <Square className="w-3.5 h-3.5 fill-current shrink-0" />
              <span className="font-mono tabular-nums">{formatVoiceTimer(recordingSeconds)}</span>
            </button>
            <button
              type="button"
              onClick={cancelRecording}
              title="Отменить запись"
              aria-label="Отменить запись"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 cursor-pointer rounded-none transition-colors shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              clearError();
              startRecording();
            }}
            title={label || 'Надиктовать голосом (бесплатно)'}
            aria-label={label || 'Голосовой ввод'}
            className={`min-w-[44px] min-h-[44px] ${
              compact && !label ? 'px-2.5' : 'px-3.5'
            } flex items-center justify-center gap-2 bg-zinc-900 hover:bg-white text-white hover:text-black border border-zinc-700 hover:border-white text-[14px] font-serif cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed rounded-none transition-colors shrink-0`}
          >
            <Mic className="w-4 h-4 text-rose-500 shrink-0" />
            {label && <span className="whitespace-nowrap">{label}</span>}
          </button>
        )}
      </div>

      {!onErrorChange && errorMessage && (
        <div className="p-2 bg-zinc-950/90 border border-rose-500/70 text-rose-300 text-[14px] font-serif max-w-xs text-left rounded-none">
          {errorMessage}
        </div>
      )}
    </div>
  );
};
