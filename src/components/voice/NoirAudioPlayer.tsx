import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2 } from 'lucide-react';
import { formatVoiceTimer } from '../../hooks/useVoiceDictation';

export interface NoirAudioPlayerProps {
  audioUrl: string;
  label?: string;
}

/**
 * Sharp Noir audio playback bar for saved voice notes in 'Голосовые'.
 * Minimum 44x44px touch targets, >=14px text, zero rounded corners, strictly B&W + crimson.
 */
export const NoirAudioPlayer: React.FC<NoirAudioPlayerProps> = ({
  audioUrl,
  label = 'Запись голоса',
}) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    let mounted = true;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    const decodeDuration = async () => {
      try {
        const res = await fetch(audioUrl);
        if (!res.ok) return;
        const arr = await res.arrayBuffer();
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const decoded = await ctx.decodeAudioData(arr);
        if (mounted && Number.isFinite(decoded.duration)) {
          setDuration(decoded.duration);
        }
        await ctx.close().catch(() => {});
      } catch {
        // Fallback to native HTMLAudioElement loadedmetadata duration
      }
    };

    if (audioUrl) {
      decodeDuration();
    }

    return () => {
      mounted = false;
    };
  }, [audioUrl]);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (isPlaying) {
      el.pause();
      setIsPlaying(false);
    } else {
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setCurrentTime(t);
    if (audioRef.current) {
      audioRef.current.currentTime = t;
    }
  };

  return (
    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-2.5 bg-zinc-950/80 border border-zinc-700 text-white rounded-none w-full">
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d) && d > 0) {
            setDuration(d);
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={isPlaying ? 'Пауза' : 'Прослушать запись'}
        className="min-w-[44px] min-h-[44px] flex items-center justify-center bg-white text-black hover:bg-rose-600 hover:text-white border border-white hover:border-rose-500 transition-colors cursor-pointer shrink-0 rounded-none"
      >
        {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
      </button>

      <div className="flex-1 min-w-[140px] flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2 text-[14px] text-zinc-300 font-serif">
          <span className="flex items-center gap-1.5 truncate">
            <Volume2 className="w-4 h-4 text-rose-500 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          <span className="font-mono tabular-nums text-[14px] text-zinc-200 shrink-0">
            {formatVoiceTimer(currentTime)} / {formatVoiceTimer(duration)}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={Math.min(currentTime, duration > 0 ? duration : 1)}
          onChange={handleSeek}
          aria-label="Позиция воспроизведения голосовой записи"
          className="w-full h-2 bg-zinc-800 appearance-none cursor-pointer accent-rose-500 rounded-none"
        />
      </div>
    </div>
  );
};
