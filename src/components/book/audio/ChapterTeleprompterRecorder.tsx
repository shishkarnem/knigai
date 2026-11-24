import React, { useState, useRef, useEffect } from 'react';
import { Mic, Pause, Play, Square, Trash2, Upload, Sparkles, BookOpen } from 'lucide-react';
import { NoirButton } from '../../common/NoirButton';
import { NoirNeuronSphere } from '../../voice/NoirNeuronSphere';
import { NoirAudioPlayer } from '../../voice/NoirAudioPlayer';
import { formatVoiceTimer } from '../../../hooks/useVoiceDictation';

interface ChapterTeleprompterRecorderProps {
  bookTitle: string;
  chapterTitle: string;
  chapterContent: string;
  chapterSynopsis: string;
  defaultNarrator: string;
  hasExistingText: boolean;
  uploading: boolean;
  onUploadRecorded: (payload: {
    blob: Blob;
    title: string;
    narratorName: string;
    durationSec: number;
    isPrimary: boolean;
    transcribe: boolean;
    sourceType: 'voice_record' | 'dictation_stt';
  }) => Promise<void>;
}

export const ChapterTeleprompterRecorder: React.FC<ChapterTeleprompterRecorderProps> = ({
  bookTitle,
  chapterTitle,
  chapterContent,
  chapterSynopsis,
  defaultNarrator,
  hasExistingText,
  uploading,
  onUploadRecorded,
}) => {
  const [recordingState, setRecordingState] = useState<'idle' | 'recording' | 'paused' | 'ready'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [recError, setRecError] = useState<string | null>(null);

  const [trackTitle, setTrackTitle] = useState(chapterTitle);
  const [narratorName, setNarratorName] = useState(defaultNarrator || 'Автор');
  const [isPrimary, setIsPrimary] = useState(true);
  const [alsoTranscribe, setAlsoTranscribe] = useState(!hasExistingText);

  const [prompterSize, setPrompterSize] = useState<14 | 16 | 18 | 20>(16);
  const [autoScroll, setAutoScroll] = useState(true);
  const prompterRef = useRef<HTMLDivElement | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTrackTitle(chapterTitle);
  }, [chapterTitle]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Smooth teleprompter auto-scroll while active recording
  useEffect(() => {
    if (scrollTimerRef.current) {
      clearInterval(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
    if (recordingState === 'recording' && autoScroll && prompterRef.current) {
      scrollTimerRef.current = setInterval(() => {
        if (prompterRef.current) {
          prompterRef.current.scrollTop += 1;
        }
      }, 65);
    }
    return () => {
      if (scrollTimerRef.current) clearInterval(scrollTimerRef.current);
    };
  }, [recordingState, autoScroll]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    timerRef.current = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);
  };

  const startRecording = async () => {
    setRecError(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setRecordedBlob(null);
    setSeconds(0);

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Браузер не поддерживает запись с микрофона.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : '';
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      mr.onstop = () => {
        stopTimer();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size > 0) {
          setRecordedBlob(blob);
          setPreviewUrl(URL.createObjectURL(blob));
          setRecordingState('ready');
        } else {
          setRecordingState('idle');
          setRecError('Запись оказалась пустой. Проверьте микрофон.');
        }
      };

      recorderRef.current = mr;
      mr.start(300);
      setRecordingState('recording');
      startTimer();
    } catch (err: unknown) {
      setRecError(err instanceof Error ? err.message : 'Нет доступа к микрофону.');
      setRecordingState('idle');
    }
  };

  const togglePauseResume = () => {
    const mr = recorderRef.current;
    if (!mr) return;
    if (recordingState === 'recording' && mr.state === 'recording') {
      mr.pause();
      stopTimer();
      setRecordingState('paused');
    } else if (recordingState === 'paused' && mr.state === 'paused') {
      mr.resume();
      startTimer();
      setRecordingState('recording');
    }
  };

  const stopRecording = () => {
    const mr = recorderRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.stop();
    }
  };

  const resetRecording = () => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    stopTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setSeconds(0);
    setRecordingState('idle');
  };

  const handleSave = async () => {
    if (!recordedBlob || uploading) return;
    await onUploadRecorded({
      blob: recordedBlob,
      title: trackTitle.trim() || chapterTitle,
      narratorName: narratorName.trim() || 'Автор',
      durationSec: seconds,
      isPrimary,
      transcribe: alsoTranscribe,
      sourceType: alsoTranscribe ? 'dictation_stt' : 'voice_record',
    });
    resetRecording();
  };

  const prompterText = chapterContent?.trim() || chapterSynopsis?.trim() || 'Текст главы пока пуст — вы можете надиктовать его прямо сейчас, включив распознавание речи ниже.';

  return (
    <div className="flex flex-col gap-4 text-white">
      {/* Teleprompter box */}
      <div className="border border-zinc-700 bg-zinc-950/75 flex flex-col">
        <div className="px-3 py-2 bg-black/70 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <div className="flex items-center gap-2 font-bold text-white">
            <BookOpen className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Суфлёр текста главы</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="accent-rose-600 w-4 h-4"
              />
              <span>Автопрокрутка</span>
            </label>
            <div className="flex items-center gap-1">
              {([14, 16, 18, 20] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setPrompterSize(sz)}
                  className={`min-h-[34px] px-2 border text-[14px] font-mono cursor-pointer rounded-none ${
                    prompterSize === sz
                      ? 'bg-white text-black border-white font-bold'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div
          ref={prompterRef}
          style={{ fontSize: `${prompterSize}px` }}
          className="p-3.5 max-h-52 overflow-y-auto font-serif leading-relaxed text-zinc-100 whitespace-pre-line"
        >
          {prompterText}
        </div>
      </div>

      {/* Live Recorder Controls */}
      <div className="p-4 border border-zinc-700 bg-black/70 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {(recordingState === 'recording' || recordingState === 'paused') && (
              <NoirNeuronSphere isRecording={recordingState === 'recording'} size={54} pointCount={36} />
            )}
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-white">
                {recordingState === 'idle' && 'Готово к записи живого чтения или диктовки'}
                {recordingState === 'recording' && 'Идёт запись голоса в микрофон...'}
                {recordingState === 'paused' && 'Запись на паузе'}
                {recordingState === 'ready' && 'Запись готова — проверьте и сохраните в папку книги'}
              </span>
              <span className="text-[14px] font-mono text-rose-400 tabular-nums">
                Длительность: {formatVoiceTimer(seconds)} · Папка «Книга: «{bookTitle}»»
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {recordingState === 'idle' && (
              <button
                type="button"
                onClick={startRecording}
                className="min-h-[44px] px-4 bg-rose-600 hover:bg-rose-500 text-white border border-white font-bold text-[14px] flex items-center gap-2 cursor-pointer rounded-none"
              >
                <Mic className="w-4 h-4 shrink-0" />
                <span>Начать запись голоса</span>
              </button>
            )}

            {(recordingState === 'recording' || recordingState === 'paused') && (
              <>
                <button
                  type="button"
                  onClick={togglePauseResume}
                  className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
                >
                  {recordingState === 'recording' ? (
                    <>
                      <Pause className="w-4 h-4 text-rose-500" />
                      <span>Пауза</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 text-rose-500" />
                      <span>Продолжить</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={stopRecording}
                  className="min-h-[44px] px-4 bg-white text-black hover:bg-zinc-200 border border-white text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
                >
                  <Square className="w-4 h-4 fill-current text-rose-600" />
                  <span>Завершить ({formatVoiceTimer(seconds)})</span>
                </button>
                <button
                  type="button"
                  onClick={resetRecording}
                  className="min-h-[44px] px-3 bg-zinc-950 hover:bg-rose-950/60 text-zinc-300 hover:text-white border border-zinc-700 text-[14px] flex items-center gap-1.5 cursor-pointer rounded-none"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Сброс</span>
                </button>
              </>
            )}
          </div>
        </div>

        {recError && (
          <div className="p-3 bg-rose-950/50 border border-rose-500 text-rose-200 text-[14px]">
            {recError}
          </div>
        )}

        {recordingState === 'ready' && previewUrl && (
          <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800">
            <NoirAudioPlayer audioUrl={previewUrl} label="Предпрослушивание записи перед загрузкой" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
              <div>
                <label className="block text-zinc-300 mb-1">Название аудиодорожки:</label>
                <input
                  type="text"
                  value={trackTitle}
                  onChange={(e) => setTrackTitle(e.target.value)}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                />
              </div>
              <div>
                <label className="block text-zinc-300 mb-1">Имя чтеца / диктора:</label>
                <input
                  type="text"
                  value={narratorName}
                  onChange={(e) => setNarratorName(e.target.value)}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 text-[14px]">
              <label className="flex items-center gap-2 text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  className="accent-rose-600 w-4 h-4"
                />
                <span>Сделать основной озвучкой этой главы</span>
              </label>

              <label className="flex items-center gap-2 text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoTranscribe}
                  onChange={(e) => setAlsoTranscribe(e.target.checked)}
                  className="accent-rose-600 w-4 h-4"
                />
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="w-4 h-4 text-rose-500" />
                  <span>Распознать речь и добавить в текст главы</span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <NoirButton variant="outline" onClick={resetRecording} disabled={uploading}>
                Перезаписать
              </NoirButton>
              <NoirButton
                variant="primary"
                loading={uploading}
                onClick={handleSave}
                icon={<Upload className="w-4 h-4 text-black" />}
              >
                Сохранить озвучку в папку книги
              </NoirButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
