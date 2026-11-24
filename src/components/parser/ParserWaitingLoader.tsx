import React, { useState, useEffect } from 'react';

interface ParserWaitingLoaderProps {
  mode: 'search' | 'import';
  targetTitle?: string;
}

export const ParserWaitingLoader: React.FC<ParserWaitingLoaderProps> = ({ mode, targetTitle }) => {
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    // Smooth progress simulation that rapidly reaches ~85% then paces until completed
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) return prev + Math.floor(Math.random() * 6) + 4;
        if (prev < 65) return prev + Math.floor(Math.random() * 4) + 2;
        if (prev < 88) return prev + Math.floor(Math.random() * 3) + 1;
        if (prev < 97) return prev + 1;
        return prev;
      });
    }, 180);

    return () => clearInterval(interval);
  }, []);

  const getStageMessage = () => {
    if (mode === 'import') {
      if (progress < 25) return 'Подключение к источнику и загрузка тома...';
      if (progress < 55) return 'Распаковка архива и парсинг структуры глав...';
      if (progress < 80) return 'Форматирование текста А5 и извлечение сносок...';
      if (progress < 95) return 'Синхронизация с базой данных и локальным кэшем...';
      return 'Финальная подготовка книги...';
    }

    if (progress < 22) return 'Инициализация поискового модуля и каталогов...';
    if (progress < 48) return 'Опрос Флибусты (OPDS), Самиздата и Либрусека...';
    if (progress < 72) return 'Поиск в открытых архивах и LibriVox (Аудио)...';
    if (progress < 90) return 'Анализ языка, объема символов и структуры томов...';
    return 'Формирование и сортировка каталога...';
  };

  return (
    <div className="w-full py-10 px-4 flex flex-col items-center justify-center select-none font-['PT_Serif',serif] relative overflow-hidden bg-black/60 border border-zinc-800">
      {/* 3D Animated Book Container (Inspired by Landing Page NeuroBook) */}
      <div className="relative w-40 h-28 mb-6 flex items-center justify-center [perspective:900px]">
        {/* Book Base / Spreads with 3D Depth */}
        <div className="relative w-32 h-24 flex items-center justify-center [transform-style:preserve-3d] [transform:rotateX(24deg)_rotateY(-18deg)]">
          {/* Left Fixed Sheet */}
          <div className="absolute left-1 w-16 h-22 bg-zinc-950 border-2 border-zinc-600 shadow-2xl flex flex-col justify-between p-1.5 [transform-origin:right_center]">
            <div className="space-y-1">
              <div className="h-1 bg-zinc-800 w-3/4" />
              <div className="h-1 bg-zinc-800 w-full" />
              <div className="h-1 bg-zinc-800 w-5/6" />
              <div className="h-1 bg-zinc-800 w-2/3" />
            </div>
            <div className="h-0.5 bg-rose-600/70 w-full" />
          </div>

          {/* Right Fixed Base Sheet */}
          <div className="absolute right-1 w-16 h-22 bg-zinc-900 border-2 border-zinc-600 shadow-2xl flex flex-col justify-between p-1.5 [transform-origin:left_center]">
            <div className="space-y-1">
              <div className="h-1 bg-zinc-700 w-5/6" />
              <div className="h-1 bg-zinc-700 w-full" />
              <div className="h-1 bg-zinc-700 w-3/4" />
              <div className="h-1 bg-zinc-700 w-1/2" />
            </div>
            <div className="flex justify-end">
              <span className="w-2 h-0.5 bg-rose-500" />
            </div>
          </div>

          {/* Central Glowing Book Spine */}
          <div className="absolute z-30 w-1.5 h-24 bg-gradient-to-b from-rose-500 via-rose-600 to-red-800 shadow-[0_0_12px_rgba(239,68,68,0.8)]" />

          {/* Flipping Page 1 */}
          <div
            className="absolute right-1 w-16 h-22 bg-zinc-100 text-black border border-zinc-400 p-1 flex flex-col justify-between [transform-origin:left_center] shadow-xl animate-[flipPage_2.2s_ease-in-out_infinite]"
            style={{
              animationDelay: '0s',
            }}
          >
            <div className="space-y-1 opacity-60">
              <div className="h-1 bg-zinc-600 w-4/5" />
              <div className="h-1 bg-zinc-600 w-full" />
              <div className="h-1 bg-zinc-600 w-2/3" />
            </div>
            <div className="h-0.5 bg-rose-600 w-1/2" />
          </div>

          {/* Flipping Page 2 */}
          <div
            className="absolute right-1 w-16 h-22 bg-zinc-200 text-black border border-zinc-400 p-1 flex flex-col justify-between [transform-origin:left_center] shadow-xl animate-[flipPage_2.2s_ease-in-out_infinite]"
            style={{
              animationDelay: '0.7s',
            }}
          >
            <div className="space-y-1 opacity-60">
              <div className="h-1 bg-zinc-600 w-full" />
              <div className="h-1 bg-zinc-600 w-3/4" />
              <div className="h-1 bg-zinc-600 w-4/5" />
            </div>
            <div className="h-0.5 bg-rose-600 w-1/3" />
          </div>

          {/* Flipping Page 3 */}
          <div
            className="absolute right-1 w-16 h-22 bg-zinc-300 text-black border border-zinc-400 p-1 flex flex-col justify-between [transform-origin:left_center] shadow-xl animate-[flipPage_2.2s_ease-in-out_infinite]"
            style={{
              animationDelay: '1.4s',
            }}
          >
            <div className="space-y-1 opacity-60">
              <div className="h-1 bg-zinc-600 w-2/3" />
              <div className="h-1 bg-zinc-600 w-full" />
              <div className="h-1 bg-zinc-600 w-5/6" />
            </div>
            <div className="h-0.5 bg-rose-600 w-2/3" />
          </div>
        </div>

        {/* Ambient Underglow */}
        <div className="absolute -bottom-2 w-28 h-4 bg-rose-600/25 blur-md rounded-none pointer-events-none" />
      </div>

      {/* Percentage Display */}
      <div className="flex items-baseline gap-1.5 mb-2 font-mono">
        <span className="font-['Rubik_Marker_Hatch',sans-serif] text-[32px] sm:text-[38px] font-black text-white tracking-widest leading-none">
          {progress}
        </span>
        <span className="font-['Rubik_Marker_Hatch',sans-serif] text-[20px] font-bold text-rose-500">
          %
        </span>
      </div>

      {/* Progress Bar Container */}
      <div className="w-full max-w-md h-3 bg-zinc-950 border border-zinc-700 relative overflow-hidden mb-3">
        <div
          className="h-full bg-gradient-to-r from-zinc-200 via-white to-rose-500 transition-all duration-200 ease-out relative"
          style={{ width: `${progress}%` }}
        >
          {/* Animated red tip at the leading edge */}
          <div className="absolute right-0 top-0 bottom-0 w-2 bg-rose-500 shadow-[0_0_8px_#ef4444]" />
        </div>
      </div>

      {/* Stage Message */}
      <p className="text-[14px] text-zinc-300 font-mono text-center max-w-lg leading-relaxed">
        {getStageMessage()}
      </p>

      {targetTitle && (
        <p className="text-[14px] text-zinc-400 font-serif italic text-center mt-1 truncate max-w-sm">
          «{targetTitle}»
        </p>
      )}

      {/* Inline Keyframes for 3D page flip */}
      <style>{`
        @keyframes flipPage {
          0% {
            transform: rotateY(0deg);
            opacity: 1;
          }
          70% {
            transform: rotateY(-180deg);
            opacity: 0.9;
          }
          100% {
            transform: rotateY(-180deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
