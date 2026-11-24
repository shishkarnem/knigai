import React, { useRef, useEffect, useState } from 'react';
import { Mic, Square, Trash2, Loader2, Sparkles } from 'lucide-react';
import {
  useVoiceDictation,
  formatVoiceTimer,
  insertVoiceTextIntoElement,
} from '../../hooks/useVoiceDictation';
import { polishVoiceTextWithAi } from '../../services/voice/voiceSttService';
import { NoirNeuronSphere } from '../voice/NoirNeuronSphere';
import { NoirAudioPlayer } from '../voice/NoirAudioPlayer';

export interface NoirPromptTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  minRows?: number; // Minimum lines (default 2)
  maxRows?: number; // Maximum lines before auto-grow stops and scroll begins (default 10)
  voiceContext?: string;
  enableVoice?: boolean;
  enableAiPolish?: boolean;
}

/**
 * Noir-styled auto-expanding textarea for prompt and text generation with integrated ProTalk voice dictation.
 * - Minimum 2 lines height.
 * - Automatically grows up to 10 lines as user types.
 * - Manually resizable in height (resize-y).
 * - Beyond 10 lines: vertical scrollbar with red runner on transparent background.
 * - Integrated free ProTalk STT + permanent 'Голосовые' folder storage + optional AI punctuation.
 */
export const NoirPromptTextarea: React.FC<NoirPromptTextareaProps> = ({
  value,
  minRows = 2,
  maxRows = 10,
  voiceContext = 'prompt_textarea',
  enableVoice = true,
  enableAiPolish = true,
  className = '',
  onChange,
  disabled,
  placeholder,
  style,
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const strValue = typeof value === 'string' ? value : String(value ?? '');
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishNotice, setPolishNotice] = useState<string | null>(null);
  const [polishError, setPolishError] = useState<string | null>(null);

  const emitTextChange = (nextVal: string) => {
    if (!onChange) return;
    const syntheticEvent = {
      target: { value: nextVal },
      currentTarget: { value: nextVal },
    } as React.ChangeEvent<HTMLTextAreaElement>;
    onChange(syntheticEvent);
  };

  const {
    isRecording,
    isTranscribing,
    recordingSeconds,
    audioUrl,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  } = useVoiceDictation({
    fieldContext: voiceContext,
    onTextRecognized: (text) => {
      insertVoiceTextIntoElement(strValue, text, textareaRef.current, emitTextChange);
    },
  });

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;

    el.style.height = 'auto';

    const computed = window.getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight) || 22;
    const paddingTop = parseFloat(computed.paddingTop) || 10;
    const paddingBottom = parseFloat(computed.paddingBottom) || 10;
    const borderTop = parseFloat(computed.borderTopWidth) || 1;
    const borderBottom = parseFloat(computed.borderBottomWidth) || 1;
    const verticalPadding = paddingTop + paddingBottom + borderTop + borderBottom;

    const minHeight = minRows * lineHeight + verticalPadding;
    const maxHeight = maxRows * lineHeight + verticalPadding;

    const scrollHeight = el.scrollHeight + borderTop + borderBottom;
    const newHeight = Math.max(minHeight, Math.min(scrollHeight, maxHeight));
    el.style.height = `${newHeight}px`;

    el.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  useEffect(() => {
    adjustHeight();
  }, [strValue]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    adjustHeight();
    if (onChange) onChange(e);
  };

  const handleAiPolish = async () => {
    if (!strValue.trim() || isPolishing || isRecording || isTranscribing) return;
    setPolishError(null);
    setPolishNotice(null);
    setIsPolishing(true);
    try {
      const res = await polishVoiceTextWithAi({
        rawText: strValue,
        fieldContext: voiceContext,
      });
      emitTextChange(res.text);
      setPolishNotice(`ИИ-пунктуация (-${res.costLetters.toLocaleString('ru-RU')} б.)`);
    } catch (err: unknown) {
      setPolishError(err instanceof Error ? err.message : 'Ошибка ИИ-корректуры.');
    } finally {
      setIsPolishing(false);
    }
  };

  const activeError = errorMessage || polishError;

  return (
    <div className="w-full flex flex-col gap-1.5 min-w-0">
      <div className="relative w-full bg-zinc-950/80 border border-zinc-700 focus-within:border-rose-500 transition-colors rounded-none overflow-hidden">
        {isRecording && (
          <div className="absolute right-2 top-2 pointer-events-none opacity-85 z-0">
            <NoirNeuronSphere isRecording={true} size={86} pointCount={48} />
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          disabled={disabled || isRecording}
          onChange={handleChange}
          placeholder={isRecording ? 'Говорите в микрофон, идет запись...' : placeholder}
          className={`noir-prompt-textarea relative z-10 w-full p-3 bg-transparent border-0 text-white font-serif text-[14px] leading-relaxed resize-y rounded-none outline-none ${className}`}
          style={{
            minHeight: `${minRows * 22 + 20}px`,
            scrollbarWidth: 'thin',
            scrollbarColor: '#ef4444 transparent',
            ...style,
          }}
          {...props}
        />

        {enableVoice && (
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 bg-black/55 border-t border-zinc-800">
            <div className="flex flex-wrap items-center gap-2">
              {!isRecording ? (
                <button
                  type="button"
                  disabled={disabled || isTranscribing || isPolishing}
                  onClick={() => {
                    clearError();
                    setPolishError(null);
                    setPolishNotice(null);
                    startRecording();
                  }}
                  className="min-h-[44px] px-3 py-1.5 flex items-center gap-2 bg-zinc-900 hover:bg-white text-white hover:text-black border border-zinc-700 hover:border-white text-[14px] font-serif cursor-pointer disabled:opacity-40 rounded-none transition-colors"
                >
                  {isTranscribing ? (
                    <Loader2 className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
                  ) : (
                    <Mic className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>{isTranscribing ? 'Распознаю...' : 'Диктовать'}</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="min-h-[44px] px-3 py-1.5 flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 text-[14px] font-bold cursor-pointer rounded-none"
                  >
                    <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                    <span className="font-mono tabular-nums">{formatVoiceTimer(recordingSeconds)}</span>
                  </button>
                  <button
                    type="button"
                    onClick={cancelRecording}
                    aria-label="Отменить запись"
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 cursor-pointer rounded-none"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}

              {enableAiPolish && strValue.trim().length > 0 && !isRecording && (
                <button
                  type="button"
                  disabled={disabled || isTranscribing || isPolishing}
                  onClick={handleAiPolish}
                  title="Оформить пунктуацию через ИИ (1 токен = 1 буква)"
                  className="min-h-[44px] px-2.5 py-1.5 flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-800 text-[14px] font-serif cursor-pointer disabled:opacity-40 rounded-none transition-colors"
                >
                  {isPolishing ? (
                    <Loader2 className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-rose-500 shrink-0" />
                  )}
                  <span>ИИ-пунктуация</span>
                </button>
              )}
            </div>

            {polishNotice && (
              <span className="text-[14px] text-zinc-300 font-serif">{polishNotice}</span>
            )}
          </div>
        )}
      </div>

      {activeError && (
        <div className="px-3 py-2 bg-zinc-950/90 border border-rose-500/70 text-rose-300 text-[14px] font-serif rounded-none break-words">
          {activeError}
        </div>
      )}

      {enableVoice && audioUrl && !isRecording && (
        <NoirAudioPlayer audioUrl={audioUrl} label="Запись в папке «Голосовые»" />
      )}
    </div>
  );
};
