import React, { useRef, useState, useEffect, useImperativeHandle } from 'react';
import { Mic, Square, Trash2, Loader2, Sparkles, Eraser } from 'lucide-react';
import {
  useVoiceDictation,
  formatVoiceTimer,
  insertVoiceTextIntoElement,
} from '../../hooks/useVoiceDictation';
import { polishVoiceTextWithAi } from '../../services/voice/voiceSttService';
import { NoirNeuronSphere } from './NoirNeuronSphere';
import { NoirAudioPlayer } from './NoirAudioPlayer';

export interface NoirVoiceTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> {
  value: string;
  onValueChange: (nextVal: string) => void;
  voiceContext?: string;
  autoExpand?: boolean;
  minRows?: number;
  maxRows?: number;
  enableAiPolish?: boolean;
  showClear?: boolean;
  containerClassName?: string;
}

/**
 * Full-featured Noir voice-enabled textarea with 3D neural sphere during recording,
 * persistent 'Голосовые' audio playback, optional AI punctuation polish, and >=14px text.
 */
export const NoirVoiceTextarea = React.forwardRef<HTMLTextAreaElement, NoirVoiceTextareaProps>(({
  value,
  onValueChange,
  voiceContext = 'textarea_field',
  autoExpand = false,
  minRows = 3,
  maxRows = 12,
  enableAiPolish = true,
  showClear = false,
  containerClassName = '',
  className = '',
  placeholder = 'Введите текст или продиктуйте голосом...',
  disabled = false,
  rows,
  style,
  ...rest
}, forwardedRef) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(forwardedRef, () => textareaRef.current as HTMLTextAreaElement, []);
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishNotice, setPolishNotice] = useState<string | null>(null);
  const [polishError, setPolishError] = useState<string | null>(null);

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
      insertVoiceTextIntoElement(value, text, textareaRef.current, onValueChange);
    },
  });

  useEffect(() => {
    if (!autoExpand) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const computed = window.getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight) || 22;
    const padY = (parseFloat(computed.paddingTop) || 12) + (parseFloat(computed.paddingBottom) || 12);
    const borderY =
      (parseFloat(computed.borderTopWidth) || 1) + (parseFloat(computed.borderBottomWidth) || 1);
    const minH = minRows * lineHeight + padY + borderY;
    const maxH = maxRows * lineHeight + padY + borderY;
    const scrollH = el.scrollHeight + borderY;
    el.style.height = `${Math.max(minH, Math.min(scrollH, maxH))}px`;
    el.style.overflowY = scrollH > maxH ? 'auto' : 'hidden';
  }, [value, autoExpand, minRows, maxRows]);

  const handleAiPolish = async () => {
    if (!value.trim() || isPolishing || isRecording || isTranscribing) return;
    setPolishError(null);
    setPolishNotice(null);
    setIsPolishing(true);
    try {
      const res = await polishVoiceTextWithAi({
        rawText: value,
        fieldContext: voiceContext,
      });
      onValueChange(res.text);
      setPolishNotice(`Текст оформлен ИИ (-${res.costLetters.toLocaleString('ru-RU')} букв)`);
    } catch (err: unknown) {
      setPolishError(err instanceof Error ? err.message : 'Ошибка ИИ-корректуры.');
    } finally {
      setIsPolishing(false);
    }
  };

  const activeError = errorMessage || polishError;

  return (
    <div className={`w-full flex flex-col gap-2 min-w-0 ${containerClassName}`}>
      <div className="relative w-full bg-zinc-950/85 border border-zinc-700 focus-within:border-white transition-colors rounded-none overflow-hidden">
        {isRecording && (
          <div className="absolute right-3 top-3 pointer-events-none opacity-85 z-0">
            <NoirNeuronSphere isRecording={true} size={96} pointCount={56} />
          </div>
        )}

        <textarea
          ref={textareaRef}
          value={value}
          rows={rows ?? minRows}
          disabled={disabled || isRecording}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder={isRecording ? 'Говорите в микрофон, идет запись речи...' : placeholder}
          style={{
            scrollbarWidth: 'thin',
            scrollbarColor: '#ef4444 transparent',
            ...style,
          }}
          className={`relative z-10 w-full p-3 bg-transparent text-white placeholder-zinc-500 font-serif text-[14px] leading-relaxed focus:outline-none resize-y rounded-none ${className}`}
          {...rest}
        />

        {/* Voice toolbar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-3 py-2 bg-black/50 border-t border-zinc-800">
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
                className="min-h-[44px] px-3.5 py-2 flex items-center gap-2 bg-zinc-900 hover:bg-white text-white hover:text-black border border-zinc-700 hover:border-white text-[14px] font-serif cursor-pointer disabled:opacity-40 rounded-none transition-colors"
              >
                {isTranscribing ? (
                  <Loader2 className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
                ) : (
                  <Mic className="w-4 h-4 text-rose-500 shrink-0" />
                )}
                <span>{isTranscribing ? 'Распознаю речь...' : 'Диктовать'}</span>
              </button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={stopRecording}
                  className="min-h-[44px] px-3.5 py-2 flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white border border-rose-400 text-[14px] font-bold cursor-pointer rounded-none transition-colors"
                >
                  <Square className="w-3.5 h-3.5 fill-current shrink-0" />
                  <span>
                    Стоп (<span className="font-mono tabular-nums">{formatVoiceTimer(recordingSeconds)}</span>)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={cancelRecording}
                  title="Отменить запись без распознавания"
                  aria-label="Отменить запись"
                  className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 text-[14px] cursor-pointer rounded-none"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Отменить</span>
                </button>
              </div>
            )}

            {enableAiPolish && value.trim().length > 0 && !isRecording && (
              <button
                type="button"
                disabled={disabled || isTranscribing || isPolishing}
                onClick={handleAiPolish}
                title="Расставить знаки препинания и разбить на абзацы через ИИ (1 токен = 1 буква)"
                className="min-h-[44px] px-3 py-2 flex items-center gap-1.5 bg-zinc-950 hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 text-[14px] font-serif cursor-pointer disabled:opacity-40 rounded-none transition-colors"
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

          <div className="flex items-center gap-2">
            {polishNotice && (
              <span className="text-[14px] text-zinc-300 font-serif">{polishNotice}</span>
            )}
            {showClear && value.length > 0 && !isRecording && (
              <button
                type="button"
                onClick={() => onValueChange('')}
                className="min-h-[44px] px-2.5 flex items-center gap-1.5 text-[14px] text-zinc-400 hover:text-rose-400 cursor-pointer rounded-none"
              >
                <Eraser className="w-4 h-4" />
                <span>Очистить</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {activeError && (
        <div className="p-3 bg-zinc-950/90 border border-rose-500/70 text-rose-300 text-[14px] font-serif rounded-none break-words">
          {activeError}
        </div>
      )}

      {audioUrl && !isRecording && (
        <NoirAudioPlayer audioUrl={audioUrl} label="Сохранено в папку «Голосовые»" />
      )}
    </div>
  );
});

NoirVoiceTextarea.displayName = 'NoirVoiceTextarea';
