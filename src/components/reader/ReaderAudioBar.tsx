import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  ListMusic,
  Gauge,
  Disc,
  Mic,
  X,
} from 'lucide-react';
import { AudioTrack } from '../../types';
import { updateReadingChapter } from '../../services/db/bookRepository';

interface ReaderAudioBarProps {
  tracks: AudioTrack[];
  bookTitle: string;
  bookId?: number;
  userUid?: number;
  currentChapterNumber?: number;
  onTrackChange?: (track: AudioTrack, trackIndex: number) => void;
  onAutoAdvanceChapter?: (nextTrack: AudioTrack) => void;
  onClose?: () => void;
}

export const ReaderAudioBar: React.FC<ReaderAudioBarProps> = ({
  tracks,
  bookTitle,
  bookId,
  userUid,
  currentChapterNumber,
  onTrackChange,
  onAutoAdvanceChapter,
  onClose,
}) => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [showTrackList, setShowTrackList] = useState(false);
  const [autoTurnOnEnd, setAutoTurnOnEnd] = useState(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastDbSyncRef = useRef<number>(0);

  const currentTrack = tracks[currentTrackIndex] || tracks[0];

  const chapterTracks = useMemo(() => {
    if (!currentChapterNumber) return [];
    return tracks
      .map((t, idx) => ({ track: t, idx }))
      .filter((item) => item.track.chapter_number === currentChapterNumber);
  }, [tracks, currentChapterNumber]);

  const hasCurrentChapterTrack = chapterTracks.length > 0;

  // Auto-sync track when reader flips to a different chapter
  useEffect(() => {
    if (!currentChapterNumber || tracks.length === 0) return;
    const currentInThisChapter = currentTrack?.chapter_number === currentChapterNumber;
    if (currentInThisChapter) return;
    const primaryMatch = tracks.findIndex(
      (t) => t.chapter_number === currentChapterNumber && t.is_primary
    );
    const anyMatch =
      primaryMatch !== -1
        ? primaryMatch
        : tracks.findIndex((t) => t.chapter_number === currentChapterNumber);
    if (anyMatch !== -1 && anyMatch !== currentTrackIndex) {
      setCurrentTrackIndex(anyMatch);
    }
  }, [currentChapterNumber, tracks, currentTrack?.chapter_number, currentTrackIndex]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate, currentTrackIndex]);

  // Restore saved time for the active track
  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    const d = audioRef.current.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);

    if (bookId && currentTrack?.id) {
      try {
        const key = `knigai_audio_sec_${userUid || 'guest'}_${bookId}_${currentTrack.id}`;
        const savedSec = parseFloat(localStorage.getItem(key) || '0');
        if (Number.isFinite(savedSec) && savedSec > 1 && savedSec < (d || 999999) - 2) {
          audioRef.current.currentTime = savedSec;
          setCurrentTime(savedSec);
        }
      } catch {
        // ignore storage errors
      }
    }
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn('Audio play error:', e));
    }
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const ct = audioRef.current.currentTime;
    setCurrentTime(ct);
    if (audioRef.current.duration && !isNaN(audioRef.current.duration)) {
      setDuration(audioRef.current.duration);
    }
    if (bookId && currentTrack?.id) {
      try {
        const key = `knigai_audio_sec_${userUid || 'guest'}_${bookId}_${currentTrack.id}`;
        localStorage.setItem(key, String(Math.floor(ct)));
      } catch {
        // ignore
      }
      const now = Date.now();
      if (userUid && now - lastDbSyncRef.current > 5000) {
        lastDbSyncRef.current = now;
        updateReadingChapter(
          bookId,
          currentTrack.chapter_number || currentChapterNumber || 1,
          userUid,
          currentTrackIndex,
          'audio',
          Math.floor(ct)
        ).catch(() => {});
      }
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  const handleTrackSelect = (index: number, keepPlaying = true, notifyPageTurn = true) => {
    setCurrentTrackIndex(index);
    setShowTrackList(false);
    const chosen = tracks[index];
    if (notifyPageTurn && onTrackChange && chosen) {
      onTrackChange(chosen, index);
    }
    if (keepPlaying) {
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
        }
      }, 100);
    }
  };

  const handlePrev = () => {
    if (currentTrackIndex > 0) handleTrackSelect(currentTrackIndex - 1);
  };

  const handleNext = () => {
    if (currentTrackIndex < tracks.length - 1) {
      handleTrackSelect(currentTrackIndex + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const handleEnded = () => {
    // Advance to the next chapter's primary track if autoTurnOnEnd is enabled
    const nextChapterTrackIdx = tracks.findIndex(
      (t, idx) =>
        idx > currentTrackIndex &&
        t.chapter_number &&
        t.chapter_number !== currentTrack?.chapter_number
    );
    const targetIdx = nextChapterTrackIdx !== -1 ? nextChapterTrackIdx : currentTrackIndex + 1;
    if (targetIdx < tracks.length) {
      const nextTrack = tracks[targetIdx];
      handleTrackSelect(targetIdx, true, false);
      if (autoTurnOnEnd && nextTrack && onAutoAdvanceChapter) {
        onAutoAdvanceChapter(nextTrack);
      }
    } else {
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const next = !isMuted;
    audioRef.current.muted = next;
    setIsMuted(next);
  };

  const handleCycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2];
    const nextSpeed = speeds[(speeds.indexOf(playbackRate) + 1) % speeds.length];
    setPlaybackRate(nextSpeed);
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (!tracks || tracks.length === 0) return null;

  return (
    <div className="w-full bg-black/85 border-2 border-white p-3 text-white backdrop-blur-md shadow-2xl flex flex-col gap-2 font-['PT_Serif',serif] relative z-30 rounded-none">
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Top row: Track Title, Narrator & Rate */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-7 h-7 bg-zinc-950 border border-rose-600 flex items-center justify-center shrink-0">
            <Disc className={`w-4 h-4 text-rose-500 ${isPlaying ? 'animate-spin' : ''}`} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[14px] font-bold text-white truncate">
              {currentTrack?.title || bookTitle}
            </span>
            <span className="text-[14px] text-zinc-300 font-mono truncate">
              {currentTrack?.narrator_name ? `Чтец: ${currentTrack.narrator_name} · ` : ''}
              дорожка {currentTrackIndex + 1}/{tracks.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setAutoTurnOnEnd((v) => !v)}
            className={`min-h-[36px] px-2.5 border text-[14px] font-bold cursor-pointer rounded-none transition-colors ${
              autoTurnOnEnd
                ? 'bg-rose-950/70 border-rose-500 text-rose-300'
                : 'bg-zinc-950 border-zinc-700 text-zinc-400'
            }`}
            title="Автоматически перелистывать на следующую главу после окончания аудио"
          >
            {autoTurnOnEnd ? 'Автопереход: вкл' : 'Автопереход: выкл'}
          </button>

          <button
            type="button"
            onClick={handleCycleSpeed}
            className="min-h-[36px] px-2.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-700 text-zinc-200 text-[14px] font-mono cursor-pointer flex items-center gap-1 rounded-none"
            title="Скорость воспроизведения"
          >
            <Gauge className="w-3.5 h-3.5 text-rose-500" />
            <span>{playbackRate}x</span>
          </button>

          <button
            type="button"
            onClick={() => setShowTrackList(!showTrackList)}
            className={`min-h-[36px] px-2.5 border text-[14px] font-mono cursor-pointer flex items-center gap-1 rounded-none transition-colors ${
              showTrackList
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-950 hover:bg-zinc-900 border-zinc-700 text-zinc-300'
            }`}
            title="Список глав и аудиодорожек"
          >
            <ListMusic className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Дорожки</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] min-w-[36px] px-2 bg-zinc-950 border border-zinc-700 hover:border-white text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer rounded-none"
              title="Скрыть аудиопанель"
              aria-label="Скрыть аудиопанель"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Multiple narrators for current chapter or unvoiced chapter indicator */}
      {currentChapterNumber && currentChapterNumber > 0 && !hasCurrentChapterTrack && (
        <div className="px-2.5 py-1.5 bg-zinc-950/90 border border-zinc-800 text-[14px] text-zinc-300 flex flex-wrap items-center justify-between gap-2">
          <span>Для главы {currentChapterNumber} авторская запись не добавлена.</span>
          <button
            type="button"
            onClick={() => handleTrackSelect(0)}
            className="text-rose-400 hover:text-white underline font-bold cursor-pointer"
          >
            К первой озвученной главе →
          </button>
        </div>
      )}

      {chapterTracks.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[14px]">
          <span className="text-zinc-400 inline-flex items-center gap-1 mr-1">
            <Mic className="w-3.5 h-3.5 text-rose-500" />
            <span>Варианты озвучки:</span>
          </span>
          {chapterTracks.map(({ track, idx }) => (
            <button
              key={track.id}
              type="button"
              onClick={() => handleTrackSelect(idx)}
              className={`min-h-[34px] px-2.5 border text-[14px] cursor-pointer rounded-none ${
                idx === currentTrackIndex
                  ? 'bg-white text-black border-white font-bold'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-white'
              }`}
            >
              {track.narrator_name || track.title}
            </button>
          ))}
        </div>
      )}

      {/* Progress scrubber */}
      <div className="flex items-center gap-2 w-full text-[14px] font-mono text-zinc-400">
        <span className="w-12 text-right text-zinc-300">{formatTime(currentTime)}</span>
        <input
          type="range"
          min={0}
          max={duration || 100}
          step={0.5}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 accent-rose-500 cursor-pointer h-1.5 bg-zinc-800 rounded-none"
        />
        <span className="w-12 text-zinc-400">{formatTime(duration)}</span>
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 pt-0.5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentTrackIndex === 0}
            className="min-h-[38px] w-9 bg-zinc-950 border border-zinc-800 hover:border-white disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center cursor-pointer rounded-none"
            title="Предыдущая дорожка"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="min-h-[40px] px-5 bg-white text-black hover:bg-zinc-200 border-2 border-white font-bold text-[14px] flex items-center gap-2 cursor-pointer shadow-lg rounded-none"
          >
            {isPlaying ? (
              <>
                <Pause className="w-4 h-4 fill-black" />
                <span>Пауза</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-black" />
                <span>Слушать</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={currentTrackIndex === tracks.length - 1}
            className="min-h-[38px] w-9 bg-zinc-950 border border-zinc-800 hover:border-white disabled:opacity-30 disabled:pointer-events-none text-white flex items-center justify-center cursor-pointer rounded-none"
            title="Следующая дорожка"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="hidden sm:flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="text-zinc-400 hover:text-white cursor-pointer"
            title={isMuted ? 'Включить звук' : 'Без звука'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const val = parseFloat(e.target.value);
              setVolume(val);
              if (audioRef.current) {
                audioRef.current.volume = val;
                audioRef.current.muted = false;
                setIsMuted(false);
              }
            }}
            className="w-16 accent-rose-500 cursor-pointer h-1.5 bg-zinc-800 rounded-none"
          />
        </div>
      </div>

      {/* Dropdown Track List Modal */}
      {showTrackList && (
        <div className="mt-1 p-3 bg-black/95 border-2 border-white flex flex-col gap-1.5 max-h-56 overflow-y-auto rounded-none">
          <span className="text-[14px] font-bold text-rose-400 font-mono pb-1 border-b border-zinc-800">
            Озвученные дорожки ({tracks.length}):
          </span>
          {tracks.map((t, idx) => (
            <button
              key={t.id || idx}
              type="button"
              onClick={() => handleTrackSelect(idx)}
              className={`min-h-[38px] px-2.5 py-1.5 text-left text-[14px] border transition flex items-center justify-between gap-2 cursor-pointer rounded-none ${
                idx === currentTrackIndex
                  ? 'bg-rose-950/80 border-rose-500 text-white font-bold'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
              }`}
            >
              <span className="truncate">
                {idx + 1}. {t.title}
                {t.narrator_name ? ` (${t.narrator_name})` : ''}
              </span>
              {t.duration && (
                <span className="font-mono text-zinc-400 text-[14px] shrink-0">
                  {formatTime(t.duration)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
