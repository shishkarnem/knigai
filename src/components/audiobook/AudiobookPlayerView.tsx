import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Clock,
  BookOpen,
  List,
  FileText,
  Maximize2,
  Minimize2,
  Headphones,
  Scroll,
  Library,
  Disc,
} from 'lucide-react';
import { Book, Chapter, AudioTrack } from '../../types';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import {
  readStoredReadingPosition,
  writeStoredReadingPosition,
  useReadingProgressSync,
} from '../reader/hooks/useReadingProgress';
import { updateReadingChapter } from '../../services/db/bookRepository';

interface AudiobookPlayerViewProps {
  book: Book;
  chapters?: Chapter[];
  tracks: AudioTrack[];
  initialTrackIndex?: number;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onExitReader?: () => void;
  onSwitchToTextReader?: () => void;
  onSwitchToMangaReader?: () => void;
  hasMangaMode?: boolean;
  userUid?: number;
}

export const AudiobookPlayerView: React.FC<AudiobookPlayerViewProps> = ({
  book,
  chapters = [],
  tracks,
  initialTrackIndex = 0,
  isFullscreen: controlledFullscreen,
  onToggleFullscreen,
  onExitReader,
  onSwitchToTextReader,
  onSwitchToMangaReader,
  hasMangaMode = false,
  userUid,
}) => {
  const hasRealAudioTracks = tracks.length > 0;
  const effectiveItems = useMemo(() => {
    if (hasRealAudioTracks) {
      return tracks.map((t, i) => ({
        id: t.id || `track_${i}`,
        title: t.title || `Глава ${t.chapter_number || i + 1}`,
        url: t.url,
        chapter_number: t.chapter_number || i + 1,
        duration: t.duration,
        narrator_name: t.narrator_name,
        source_type: t.source_type,
      }));
    }
    if (chapters.length > 0) {
      return chapters.map((c, i) => ({
        id: `tts_ch_${c.id || c.chapter_number || i}`,
        title: c.title || `Глава ${c.chapter_number}`,
        url: '',
        chapter_number: c.chapter_number,
        duration: undefined,
        narrator_name: 'TTS-синтез',
        source_type: 'tts',
      }));
    }
    return [
      {
        id: 'tts_overview',
        title: book.title,
        url: '',
        chapter_number: 1,
        duration: undefined,
        narrator_name: 'TTS-синтез',
        source_type: 'tts',
      },
    ];
  }, [hasRealAudioTracks, tracks, chapters, book.title]);

  const [currentTrackIndex, setCurrentTrackIndex] = useState(() => {
    const base =
      initialTrackIndex > 0
        ? initialTrackIndex
        : readStoredReadingPosition('audio', book.id, userUid) ?? 0;
    return Math.min(Math.max(0, base), Math.max(0, effectiveItems.length - 1));
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(1.0);
  const [isMuted, setIsMuted] = useState(false);

  const [internalFullscreen, setInternalFullscreen] = useState(true);
  const isFullscreen = controlledFullscreen !== undefined ? controlledFullscreen : internalFullscreen;

  const [activeBottomPanel, setActiveBottomPanel] = useState<'none' | 'playlist' | 'text'>('playlist');
  const [coverImgError, setCoverImgError] = useState(false);

  // Sleep Timer state
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerSecondsRemaining, setSleepTimerSecondsRemaining] = useState<number | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastAudioSecDbSyncRef = useRef<number>(0);
  const restoredAudioSecRef = useRef<number | null>(null);
  const currentItem = effectiveItems[currentTrackIndex] || effectiveItems[0];

  const { markUserNavigated, persistPosition } = useReadingProgressSync({
    bookId: book.id,
    userUid,
    mode: 'audio',
    skipRestore: initialTrackIndex > 0,
    onRestoreFromDb: (record) => {
      const idx =
        record.audio_track_index !== null && record.audio_track_index >= 0
          ? record.audio_track_index
          : 0;
      if (typeof record.audio_time_sec === 'number' && record.audio_time_sec > 2) {
        restoredAudioSecRef.current = record.audio_time_sec;
      }
      if (idx > 0 && idx < effectiveItems.length) {
        setCurrentTrackIndex(idx);
        writeStoredReadingPosition('audio', book.id, userUid, idx);
      }
    },
  });

  useEffect(() => {
    if (effectiveItems.length === 0) return;
    const chapNum = currentItem?.chapter_number || 1;
    persistPosition(chapNum, currentTrackIndex, chapters.length > 0 || tracks.length > 0);
  }, [currentTrackIndex, currentItem, effectiveItems.length, chapters.length, tracks.length, persistPosition]);

  const toggleFullscreen = useCallback(() => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else {
      setInternalFullscreen((prev) => !prev);
    }
  }, [onToggleFullscreen]);

  // Lock body scroll in fullscreen
  useEffect(() => {
    if (isFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  // Associated chapter text
  const currentChapter = useMemo(() => {
    if (!currentItem) return null;
    if (currentItem.chapter_number) {
      return chapters.find((c) => c.chapter_number === currentItem.chapter_number) || null;
    }
    return chapters[currentTrackIndex] || null;
  }, [currentItem, currentTrackIndex, chapters]);

  const stopSpeech = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Cleanup TTS on unmount
  useEffect(() => {
    return () => stopSpeech();
  }, [stopSpeech]);

  const startSpeechPlayback = useCallback(
    (speedOverride?: number) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      const textToRead =
        currentChapter?.content?.trim() ||
        currentChapter?.synopsis?.trim() ||
        book.synopsis_overview ||
        currentItem?.title ||
        book.title;

      stopSpeech();
      const utterance = new SpeechSynthesisUtterance(textToRead.slice(0, 12000));
      utterance.lang = 'ru-RU';
      utterance.rate = speedOverride ?? playbackSpeed;
      utterance.volume = isMuted ? 0 : volume;
      utterance.onend = () => {
        if (currentTrackIndex < effectiveItems.length - 1 && sleepTimerMinutes !== -1) {
          setCurrentTrackIndex((p) => p + 1);
        } else {
          setIsPlaying(false);
        }
      };
      utterance.onerror = () => setIsPlaying(false);
      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
    },
    [book.synopsis_overview, book.title, currentChapter, currentItem?.title, currentTrackIndex, effectiveItems.length, isMuted, playbackSpeed, sleepTimerMinutes, stopSpeech, volume]
  );

  // Sync audio track change
  useEffect(() => {
    if (hasRealAudioTracks && audioRef.current && currentItem?.url) {
      audioRef.current.src = currentItem.url;
      audioRef.current.playbackRate = playbackSpeed;
      audioRef.current.volume = isMuted ? 0 : volume;
      setCurrentTime(0);
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    } else if (!hasRealAudioTracks && isPlaying) {
      startSpeechPlayback();
    }
  }, [currentTrackIndex]);

  // Sleep timer interval
  useEffect(() => {
    if (sleepTimerSecondsRemaining === null) return;
    if (sleepTimerSecondsRemaining <= 0) {
      if (audioRef.current) audioRef.current.pause();
      stopSpeech();
      setIsPlaying(false);
      setSleepTimerMinutes(null);
      setSleepTimerSecondsRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      setSleepTimerSecondsRemaining((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerSecondsRemaining, stopSpeech]);

  const handleSetSleepTimer = (minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    if (minutes === null || minutes < 0) {
      setSleepTimerSecondsRemaining(null);
    } else {
      setSleepTimerSecondsRemaining(minutes * 60);
    }
  };

  const togglePlayPause = useCallback(() => {
    if (hasRealAudioTracks && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      }
      return;
    }

    // TTS fallback when book has no attached MP3 audio files yet
    if (isPlaying) {
      stopSpeech();
      setIsPlaying(false);
    } else {
      startSpeechPlayback();
    }
  }, [hasRealAudioTracks, isPlaying, startSpeechPlayback, stopSpeech]);

  const seekRelative = useCallback(
    (seconds: number) => {
      if (!hasRealAudioTracks || !audioRef.current) return;
      const newTime = Math.max(0, Math.min(duration || 0, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    },
    [hasRealAudioTracks, duration]
  );

  // Keyboard shortcuts inside Audiobook Studio
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'SELECT' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        toggleFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        seekRelative(-15);
      } else if (e.key === 'ArrowRight') {
        seekRelative(15);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen, toggleFullscreen, togglePlayPause, seekRelative]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const ct = audioRef.current.currentTime;
      setCurrentTime(ct);
      if (!duration && audioRef.current.duration) {
        setDuration(audioRef.current.duration);
      }
      if (currentItem?.id) {
        try {
          localStorage.setItem(
            `knigai_audio_sec_${userUid || 'guest'}_${book.id}_${currentItem.id}`,
            String(Math.floor(ct))
          );
        } catch {
          // ignore
        }
      }
      const now = Date.now();
      if (userUid && now - lastAudioSecDbSyncRef.current > 5000) {
        lastAudioSecDbSyncRef.current = now;
        updateReadingChapter(
          book.id,
          currentItem?.chapter_number || 1,
          userUid,
          currentTrackIndex,
          'audio',
          Math.floor(ct)
        ).catch(() => {});
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    setDuration(d);
    let targetSec = 0;
    if (currentItem?.id) {
      try {
        const localSec = parseFloat(
          localStorage.getItem(`knigai_audio_sec_${userUid || 'guest'}_${book.id}_${currentItem.id}`) || '0'
        );
        if (Number.isFinite(localSec) && localSec > 1) targetSec = localSec;
      } catch {
        // ignore
      }
    }
    if (!targetSec && restoredAudioSecRef.current) {
      targetSec = restoredAudioSecRef.current;
      restoredAudioSecRef.current = null;
    }
    if (targetSec > 1 && targetSec < (d || 999999) - 2) {
      audioRef.current.currentTime = targetSec;
      setCurrentTime(targetSec);
    }
  };

  const handleEnded = () => {
    if (sleepTimerMinutes === -1) {
      setIsPlaying(false);
      setSleepTimerMinutes(null);
      setSleepTimerSecondsRemaining(null);
      return;
    }
    if (currentTrackIndex < effectiveItems.length - 1) {
      setCurrentTrackIndex((prev) => prev + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (hasRealAudioTracks && audioRef.current) {
      audioRef.current.playbackRate = speed;
    } else if (isPlaying) {
      startSpeechPlayback(speed);
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      setIsMuted(false);
      if (audioRef.current) audioRef.current.volume = volume || 1.0;
    } else {
      setIsMuted(true);
      if (audioRef.current) audioRef.current.volume = 0;
    }
  };

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const coverUrl = book.cover_config?.frontImageUrl;

  return (
    <div
      className={`w-full flex flex-col font-['PT_Serif',serif] ${
        isFullscreen
          ? 'fixed inset-0 z-[200] h-[100dvh] w-screen bg-black/95 backdrop-blur-xl text-white overflow-hidden flex flex-col'
          : 'relative noir-container border border-zinc-800 bg-zinc-950 p-4 sm:p-6 text-white'
      }`}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Top Studio Header Bar */}
      <div className="w-full shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 sm:px-6 py-2.5 bg-black/80 backdrop-blur-md border-b border-white/20">
        <div className="flex items-center gap-2.5 min-w-0">
          {isFullscreen && onExitReader && (
            <button
              type="button"
              onClick={onExitReader}
              className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:border-white text-white text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Вернуться в библиотеку"
            >
              <Library className="w-4 h-4 text-rose-500" />
              <span className="hidden md:inline">Библиотека</span>
            </button>
          )}
          <div className="w-9 h-9 bg-white text-black flex items-center justify-center font-bold shrink-0">
            <Headphones className="w-5 h-5 text-black" />
          </div>
          <div className="min-w-0">
            <span className="text-[14px] font-bold text-rose-500 block leading-none">
              {hasRealAudioTracks ? 'Аудиокнига · Студия' : 'Аудиокнига · Чтец (TTS)'}
            </span>
            <div className="text-[14px] font-mono tabular-nums text-zinc-300 mt-0.5">
              Глава {currentTrackIndex + 1} из {effectiveItems.length}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {onSwitchToTextReader && (
            <button
              type="button"
              onClick={onSwitchToTextReader}
              className="min-h-[44px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Переключиться на текстовую читалку"
            >
              <BookOpen className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Текст</span>
            </button>
          )}

          {hasMangaMode && onSwitchToMangaReader && (
            <button
              type="button"
              onClick={onSwitchToMangaReader}
              className="min-h-[44px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Переключиться на мангу / вебтун"
            >
              <Scroll className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Манга</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveBottomPanel((p) => (p === 'playlist' ? 'none' : 'playlist'))}
            className={`min-h-[44px] px-3 border text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeBottomPanel === 'playlist'
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
            }`}
          >
            <List className="w-4 h-4" />
            <span className="hidden sm:inline">Треклист</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveBottomPanel((p) => (p === 'text' ? 'none' : 'text'))}
            className={`min-h-[44px] px-3 border text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
              activeBottomPanel === 'text'
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span className="hidden sm:inline">Текст главы</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className={
              isFullscreen
                ? 'min-h-[44px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer rounded-none'
                : 'relative group min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-500 border-2 border-white text-white text-[14px] font-bold shadow-[3px_3px_0px_0px_rgba(255,255,255,0.85)] transition flex items-center justify-center gap-2 cursor-pointer rounded-none'
            }
            title={isFullscreen ? 'Свернуть плеер (Esc)' : 'Открыть на весь экран'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="hidden md:inline">Свернуть</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-4 h-4 text-white shrink-0" />
                <span className="whitespace-nowrap">На весь экран</span>
                <svg
                  aria-hidden="true"
                  className="absolute -bottom-[8px] left-3.5 w-[14px] h-[8px] overflow-visible pointer-events-none z-10"
                  viewBox="0 0 14 8"
                >
                  <polygon points="0,0 3.5,8 14,0" className="fill-rose-600 group-hover:fill-rose-500 transition-colors" />
                  <polyline points="0,0 3.5,8 14,0" fill="none" strokeWidth="1.5" strokeLinecap="square" className="stroke-white" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Fullscreen Playback Stage */}
      <div className="w-full flex-1 min-h-0 overflow-y-auto px-3 sm:px-6 lg:px-10 py-4 sm:py-6 flex flex-col gap-6 max-w-6xl mx-auto">
        <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left: Cover Jacket & Vinyl Disc */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center relative py-2">
            <div className="relative w-56 h-56 sm:w-72 sm:h-72 flex items-center justify-center">
              <div
                className={`absolute right-1 sm:right-0 w-48 h-48 sm:w-64 sm:h-64 bg-zinc-900 border-4 border-zinc-800 shadow-2xl flex items-center justify-center transition-transform duration-700 ${
                  isPlaying ? 'translate-x-10 sm:translate-x-14 animate-[spin_10s_linear_infinite]' : 'translate-x-4'
                }`}
              >
                <div className="w-20 h-20 bg-rose-600 border-4 border-zinc-950 flex flex-col items-center justify-center text-center p-1">
                  <Disc className="w-5 h-5 text-white mb-0.5" />
                  <span className="text-[14px] font-mono text-white">33 об</span>
                </div>
              </div>

              <div className="relative z-10 w-48 h-48 sm:w-64 sm:h-64 bg-zinc-950 border-2 border-white/80 shadow-2xl overflow-hidden shrink-0 flex items-center justify-center">
                {coverUrl && !coverImgError ? (
                  <img
                    src={coverUrl}
                    alt={book.title}
                    referrerPolicy="no-referrer"
                    onError={() => setCoverImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-zinc-900 flex flex-col items-center justify-center p-4 text-center gap-2">
                    <Headphones className="w-12 h-12 text-rose-500" />
                    <span className="text-[15px] font-bold text-white line-clamp-2">{book.title}</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/25 pointer-events-none" />
                <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
                  <p className="text-[14px] font-bold truncate">{book.title}</p>
                  <p className="text-[14px] text-zinc-300 truncate">{book.author}</p>
                </div>
              </div>
            </div>

            {sleepTimerSecondsRemaining !== null && (
              <div className="mt-4 px-3 py-1.5 bg-zinc-900/90 border border-rose-500/70 text-rose-300 text-[14px] font-mono tabular-nums flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-rose-500" />
                <span>Таймер сна: {formatTime(sleepTimerSecondsRemaining)}</span>
              </div>
            )}
          </div>

          {/* Right: Title, Scrubber, Ergonomic Transport Buttons & Studio Controls */}
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="px-2.5 py-0.5 bg-rose-950/80 border border-rose-600 text-rose-300 text-[14px] font-bold">
                  {hasRealAudioTracks
                    ? currentItem?.source_type === 'voice_record' || currentItem?.source_type === 'dictation_stt' || currentItem?.source_type === 'uploaded_file'
                      ? 'Авторская запись из облака'
                      : 'Аудио-издание'
                    : 'Встроенная озвучка (TTS)'}
                </span>
                {currentItem?.narrator_name && hasRealAudioTracks && (
                  <span className="px-2.5 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[14px]">
                    Чтец: {currentItem.narrator_name}
                  </span>
                )}
                <span className="text-zinc-400 text-[14px] font-mono tabular-nums">
                  {currentChapter ? `Глава ${currentChapter.chapter_number}` : `Дорожка ${currentTrackIndex + 1}`}
                </span>
              </div>

              <RubikMarkerHeading
                as="h1"
                text={currentItem?.title || book.title}
                className="text-[24px] sm:text-[32px] leading-tight"
              />
              <p className="text-[15px] text-zinc-300 font-bold mt-1">
                {book.author || 'Автор KnigAI'}
              </p>
            </div>

            {/* Scrubber */}
            {hasRealAudioTracks ? (
              <div className="flex flex-col gap-1.5 pt-1">
                <input
                  type="range"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  aria-label="Прогресс воспроизведения"
                  className="w-full h-2.5 bg-zinc-800 accent-rose-500 cursor-pointer border border-zinc-700"
                />
                <div className="flex items-center justify-between text-[14px] font-mono tabular-nums text-zinc-400">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
            ) : (
              <div className="p-3 bg-zinc-900/70 border border-zinc-800 text-[14px] text-zinc-300">
                Отдельный MP3-файл к книге не прикреплён — нажмите «Слушать», чтобы воспроизвести текст главы встроенным голосовым чтецом.
              </div>
            )}

            {/* Transport Controls (Thumb-Friendly >= 48px) */}
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 py-2">
              <button
                type="button"
                onClick={() => {
                  markUserNavigated();
                  setCurrentTrackIndex((prev) => Math.max(0, prev - 1));
                }}
                disabled={currentTrackIndex === 0}
                className="min-h-[48px] min-w-[48px] p-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white transition disabled:opacity-30 cursor-pointer flex items-center justify-center"
                title="Предыдущая глава"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {hasRealAudioTracks && (
                <button
                  type="button"
                  onClick={() => seekRelative(-15)}
                  className="min-h-[48px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white transition cursor-pointer flex items-center gap-1 text-[14px]"
                  title="Назад на 15 секунд"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="font-mono">15</span>
                </button>
              )}

              <button
                type="button"
                onClick={togglePlayPause}
                className="min-h-[52px] px-7 bg-white text-black hover:bg-rose-600 hover:text-white font-bold border-2 border-white transition flex items-center justify-center gap-2 cursor-pointer shadow-xl"
              >
                {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current ml-0.5" />}
                <span className="text-[16px]">{isPlaying ? 'Пауза' : 'Слушать'}</span>
              </button>

              {hasRealAudioTracks && (
                <button
                  type="button"
                  onClick={() => seekRelative(15)}
                  className="min-h-[48px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white transition cursor-pointer flex items-center gap-1 text-[14px]"
                  title="Вперед на 15 секунд"
                >
                  <span className="font-mono">15</span>
                  <RotateCw className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  markUserNavigated();
                  setCurrentTrackIndex((prev) => Math.min(effectiveItems.length - 1, prev + 1));
                }}
                disabled={currentTrackIndex >= effectiveItems.length - 1}
                className="min-h-[48px] min-w-[48px] p-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white transition disabled:opacity-30 cursor-pointer flex items-center justify-center"
                title="Следующая глава"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Speed, Sleep Timer, Volume */}
            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-zinc-800 text-[14px]">
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-zinc-400 font-mono mr-1">Скорость:</span>
                {[0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSpeedChange(s)}
                    className={`min-h-[38px] px-2.5 border font-mono text-[14px] font-bold cursor-pointer transition ${
                      playbackSpeed === s
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:border-zinc-500'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                <Clock className="w-4 h-4 text-zinc-400" />
                <label htmlFor="audio-sleep-timer" className="sr-only">Таймер сна</label>
                <select
                  id="audio-sleep-timer"
                  value={sleepTimerMinutes === null ? 'off' : sleepTimerMinutes}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'off') handleSetSleepTimer(null);
                    else handleSetSleepTimer(parseInt(val, 10));
                  }}
                  className="min-h-[38px] px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-white text-[14px] font-mono cursor-pointer"
                >
                  <option value="off">Таймер: выкл</option>
                  <option value="15">15 минут</option>
                  <option value="30">30 минут</option>
                  <option value="45">45 минут</option>
                  <option value="60">60 минут</option>
                  <option value="-1">До конца главы</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="min-h-[38px] min-w-[38px] flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
                  title={isMuted ? 'Включить звук' : 'Выключить звук'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  aria-label="Громкость"
                  className="w-20 h-2 bg-zinc-800 accent-rose-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Panel: Tracklist or Chapter Companion Text */}
        {activeBottomPanel === 'playlist' && (
          <div className="w-full p-4 bg-zinc-900/75 border border-zinc-800 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
              <h3 className="text-[15px] font-bold text-white flex items-center gap-2">
                <List className="w-4 h-4 text-rose-500" />
                <span>Главы аудиокниги ({effectiveItems.length})</span>
              </h3>
              <span className="text-[14px] font-mono text-zinc-400">Нажмите на главу для воспроизведения</span>
            </div>

            <div className="max-h-64 overflow-y-auto flex flex-col gap-1.5 pr-1">
              {effectiveItems.map((t, idx) => {
                const isSelected = idx === currentTrackIndex;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      markUserNavigated();
                      setCurrentTrackIndex(idx);
                    }}
                    className={`min-h-[44px] p-2.5 text-left border flex items-center justify-between gap-3 transition cursor-pointer text-[14px] ${
                      isSelected
                        ? 'bg-rose-950/80 border-rose-500 text-white font-bold'
                        : 'bg-zinc-950/85 border-zinc-800 text-zinc-200 hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 flex items-center justify-center font-mono tabular-nums text-[14px] bg-zinc-800 text-zinc-200 shrink-0">
                        {isSelected && isPlaying ? '▶' : `${idx + 1}`}
                      </span>
                      <span className="truncate">{t.title}</span>
                    </div>
                    {t.duration && (
                      <span className="font-mono tabular-nums text-zinc-400 text-[14px] shrink-0">
                        {formatTime(t.duration)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeBottomPanel === 'text' && (
          <div className="w-full p-4 bg-zinc-900/75 border border-zinc-800 flex flex-col gap-2">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <div className="flex items-center gap-2 font-bold text-[15px] text-white">
                <FileText className="w-4 h-4 text-rose-500" />
                <span>{currentChapter?.title || currentItem?.title}</span>
              </div>
              <span className="text-[14px] text-zinc-400 font-mono">Синхронное чтение</span>
            </div>
            <div className="p-3 bg-zinc-950/85 border border-zinc-800 text-zinc-100 leading-relaxed text-[15px] max-h-72 overflow-y-auto whitespace-pre-line">
              {currentChapter?.content || currentChapter?.synopsis || book.synopsis_overview || 'Текст данной главы не добавлен.'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
