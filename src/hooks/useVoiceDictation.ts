import { useState, useRef, useEffect, useCallback } from 'react';
import { pickSupportedAudioMime, transcribeVoiceBlob } from '../services/voice/voiceSttService';

export interface UseVoiceDictationOptions {
  fieldContext?: string;
  maxDurationSeconds?: number;
  onTextRecognized?: (recognizedText: string) => void;
  onAudioSaved?: (audioUrl: string, shortUrl: string) => void;
}

export function formatVoiceTimer(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function insertVoiceTextIntoElement(
  currentValue: string,
  recognizedText: string,
  element: HTMLInputElement | HTMLTextAreaElement | null,
  onChange: (nextVal: string) => void
): void {
  const cleanChunk = recognizedText.trim();
  if (!cleanChunk) return;

  if (element && typeof element.selectionStart === 'number' && typeof element.selectionEnd === 'number') {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);

    const needsLeadingSpace = before.length > 0 && !/[\s\n(\[«"']$/.test(before);
    const needsTrailingSpace = after.length > 0 && !/^[\s\n.,!?;:)\]»"']/.test(after);
    const inserted = `${needsLeadingSpace ? ' ' : ''}${cleanChunk}${needsTrailingSpace ? ' ' : ''}`;
    const nextValue = `${before}${inserted}${after}`;

    onChange(nextValue);

    const nextCursorPos = before.length + inserted.length;
    setTimeout(() => {
      try {
        element.focus();
        element.setSelectionRange(nextCursorPos, nextCursorPos);
      } catch {
        // ignore selection errors on non-text elements
      }
    }, 15);
    return;
  }

  const trimmedExisting = currentValue.trimEnd();
  const nextValue = trimmedExisting ? `${trimmedExisting} ${cleanChunk}` : cleanChunk;
  onChange(nextValue);
}

export function useVoiceDictation(options: UseVoiceDictationOptions = {}) {
  const {
    fieldContext = 'text_field',
    maxDurationSeconds = 180,
    onTextRecognized,
    onAudioSaved,
  } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);
  const localBlobUrlRef = useRef<string | null>(null);

  const onTextRef = useRef(onTextRecognized);
  const onAudioRef = useRef(onAudioSaved);
  onTextRef.current = onTextRecognized;
  onAudioRef.current = onAudioSaved;

  const cleanupStreamsAndTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupStreamsAndTimer();
      if (localBlobUrlRef.current) {
        URL.revokeObjectURL(localBlobUrlRef.current);
      }
    };
  }, [cleanupStreamsAndTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      cancelledRef.current = false;
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    cleanupStreamsAndTimer();
  }, [cleanupStreamsAndTimer]);

  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    setErrorMessage(null);
    chunksRef.current = [];
    cleanupStreamsAndTimer();
  }, [cleanupStreamsAndTimer]);

  const startRecording = useCallback(async () => {
    if (isRecording || isTranscribing) return;
    setErrorMessage(null);
    cancelledRef.current = false;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Браузер не поддерживает запись с микрофона. Введите текст вручную.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const supportedMime = pickSupportedAudioMime();
      const recorder = supportedMime
        ? new MediaRecorder(stream, { mimeType: supportedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      startTimeRef.current = Date.now();

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        cleanupStreamsAndTimer();

        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }

        const durationSec = Math.max(0.5, (Date.now() - startTimeRef.current) / 1000);
        const blobMime = recorder.mimeType || supportedMime || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: blobMime });
        chunksRef.current = [];

        if (audioBlob.size < 256) {
          setErrorMessage('Запись слишком короткая или пустая. Попробуйте продиктовать чуть дольше.');
          return;
        }

        if (localBlobUrlRef.current) {
          URL.revokeObjectURL(localBlobUrlRef.current);
        }
        const localUrl = URL.createObjectURL(audioBlob);
        localBlobUrlRef.current = localUrl;
        setAudioUrl(localUrl);

        setIsTranscribing(true);
        try {
          const res = await transcribeVoiceBlob({
            blob: audioBlob,
            durationSec,
            fieldContext,
          });

          const playableUrl = res.shortUrl || res.fileUrl || localUrl;
          setAudioUrl(playableUrl);
          if (onAudioRef.current) {
            onAudioRef.current(res.fileUrl, res.shortUrl);
          }

          if (res.text) {
            if (onTextRef.current) {
              onTextRef.current(res.text);
            }
          } else {
            setErrorMessage('Речь не распознана. Говорите ближе к микрофону и повторите запись.');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Ошибка сети при распознавании речи.';
          setErrorMessage(msg);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          const next = prev + 1;
          if (next >= maxDurationSeconds) {
            stopRecording();
          }
          return next;
        });
      }, 1000);
    } catch (err: unknown) {
      cleanupStreamsAndTimer();
      const errName = err instanceof DOMException ? err.name : '';
      const msg = err instanceof Error ? err.message : '';
      if (
        errName === 'NotAllowedError' ||
        errName === 'PermissionDeniedError' ||
        msg.toLowerCase().includes('permission') ||
        msg.toLowerCase().includes('notallowed')
      ) {
        setErrorMessage('Доступ к микрофону запрещен. Разрешите микрофон в настройках браузера и обновите страницу.');
      } else {
        setErrorMessage('Не удалось подключить микрофон. Проверьте устройство ввода.');
      }
    }
  }, [isRecording, isTranscribing, fieldContext, maxDurationSeconds, cleanupStreamsAndTimer, stopRecording]);

  const clearError = useCallback(() => setErrorMessage(null), []);
  const clearAudio = useCallback(() => setAudioUrl(null), []);

  return {
    isRecording,
    isTranscribing,
    recordingSeconds,
    audioUrl,
    errorMessage,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
    clearAudio,
  };
}
