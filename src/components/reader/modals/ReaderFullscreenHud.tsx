import React from 'react';
import {
  List,
  Sliders,
  Minimize2,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Scroll,
  Library,
  X,
} from 'lucide-react';

interface ReaderFullscreenHudProps {
  isFullscreen: boolean;
  isHudVisible: boolean;
  currentPage: number;
  totalPages: number;
  hasAudioMode?: boolean;
  hasVoiceTracks?: boolean;
  isAudioBarOpen?: boolean;
  hasMangaMode?: boolean;
  onToggleFullscreen: () => void;
  onExitReader?: () => void;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onOpenPageJump: () => void;
  onOpenToc: () => void;
  onOpenSettings: () => void;
  onHideHud: () => void;
  onShowHud: () => void;
  onSwitchToAudio?: () => void;
  onToggleAudioBar?: () => void;
  onSwitchToManga?: () => void;
}

export const ReaderFullscreenHud: React.FC<ReaderFullscreenHudProps> = ({
  isFullscreen,
  isHudVisible,
  currentPage,
  totalPages,
  hasAudioMode,
  hasVoiceTracks,
  isAudioBarOpen,
  hasMangaMode,
  onToggleFullscreen,
  onExitReader,
  onPrevChapter,
  onNextChapter,
  onPrevPage,
  onNextPage,
  onOpenPageJump,
  onOpenToc,
  onOpenSettings,
  onHideHud,
  onShowHud,
  onSwitchToAudio,
  onToggleAudioBar,
  onSwitchToManga,
}) => {
  if (!isFullscreen) return null;

  if (!isHudVisible) {
    return (
      <div className="fixed top-2 right-2 z-[110] flex items-center gap-1.5">
        <button
          type="button"
          onClick={onShowHud}
          className="min-h-[44px] px-3 bg-black/75 hover:bg-black border border-white/30 text-white text-[14px] font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition"
          title="Показать панель навигации и настроек"
        >
          <List className="w-4 h-4 text-rose-500" />
          <span className="font-mono tabular-nums">{currentPage + 1}/{totalPages}</span>
        </button>
        <button
          type="button"
          onClick={onToggleFullscreen}
          className="min-h-[44px] min-w-[44px] px-2.5 bg-black/75 hover:bg-white hover:text-black border border-white/30 text-white text-[14px] font-bold flex items-center justify-center backdrop-blur-md cursor-pointer transition"
          title="Свернуть из полноэкранного режима (Esc)"
          aria-label="Свернуть"
        >
          <Minimize2 className="w-4 h-4 text-rose-500" />
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Top Translucent Fullscreen HUD */}
      <div className="fixed top-1.5 left-1.5 right-1.5 sm:top-2.5 sm:left-3 sm:right-3 z-[110] flex flex-wrap items-center justify-between gap-1.5 p-2 bg-black/80 backdrop-blur-md border border-white/25 text-white max-w-6xl mx-auto shadow-2xl box-border">
        <div className="flex flex-wrap items-center gap-1.5">
          {onExitReader && (
            <button
              type="button"
              onClick={onExitReader}
              className="min-h-[44px] px-3 bg-zinc-900/90 border border-zinc-700 hover:border-white text-white font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
              title="Вернуться в библиотеку"
            >
              <Library className="w-4 h-4 text-rose-500" />
              <span className="hidden md:inline">Библиотека</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleFullscreen}
            className="min-h-[44px] px-3 bg-zinc-900/90 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
            title="Свернуть панель книги (Esc)"
          >
            <Minimize2 className="w-4 h-4 text-rose-500" />
            <span className="hidden sm:inline">Свернуть</span>
          </button>

          <button
            type="button"
            onClick={onPrevChapter}
            className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1 cursor-pointer text-[14px]"
            title="Предыдущая глава"
          >
            <SkipBack className="w-4 h-4 text-rose-500" />
            <span className="hidden xl:inline">Пред. гл.</span>
          </button>
        </div>

        {/* Center: Page Jump */}
        <button
          type="button"
          onClick={onOpenPageJump}
          className="min-h-[44px] px-3 bg-zinc-950/90 border border-zinc-700 hover:border-rose-500 text-white font-mono font-bold tabular-nums text-[14px] cursor-pointer flex items-center gap-1.5 transition"
          title="Нажмите для перехода к странице"
        >
          <span className="text-rose-500 font-bold">Стр.</span>
          <span>{currentPage + 1}/{totalPages}</span>
        </button>

        {/* Right Controls & Mode Switch */}
        <div className="flex flex-wrap items-center gap-1.5">
          {hasMangaMode && onSwitchToManga && (
            <button
              type="button"
              onClick={onSwitchToManga}
              className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:border-rose-500 text-zinc-200 hover:text-white font-bold transition flex items-center gap-1 cursor-pointer text-[14px]"
              title="Открыть в режиме манги / вебтуна"
            >
              <Scroll className="w-4 h-4 text-rose-500" />
              <span className="hidden md:inline">Манга</span>
            </button>
          )}

          {hasVoiceTracks && onToggleAudioBar && (
            <button
              type="button"
              onClick={onToggleAudioBar}
              className={`min-h-[44px] px-2.5 border font-bold transition flex items-center gap-1 cursor-pointer text-[14px] rounded-none ${
                isAudioBarOpen
                  ? 'bg-rose-600 border-white text-white'
                  : 'bg-zinc-900/90 border-zinc-700 hover:border-rose-500 text-zinc-200 hover:text-white'
              }`}
              title="Показать / скрыть плеер «Текст + Голос» прямо в книге"
            >
              <Headphones className="w-4 h-4 text-rose-400" />
              <span className="hidden md:inline">Текст+Голос</span>
            </button>
          )}

          {hasAudioMode && onSwitchToAudio && (
            <button
              type="button"
              onClick={onSwitchToAudio}
              className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:border-rose-500 text-zinc-200 hover:text-white font-bold transition flex items-center gap-1 cursor-pointer text-[14px]"
              title="Открыть в режиме аудиоплеера"
            >
              <Headphones className="w-4 h-4 text-rose-500" />
              <span className="hidden md:inline">Аудио</span>
            </button>
          )}

          <button
            type="button"
            onClick={onNextChapter}
            className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1 cursor-pointer text-[14px]"
            title="Следующая глава"
          >
            <span className="hidden xl:inline">След. гл.</span>
            <SkipForward className="w-4 h-4 text-rose-500" />
          </button>

          <button
            type="button"
            onClick={onOpenToc}
            className="min-h-[44px] min-w-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center justify-center gap-1.5 cursor-pointer text-[14px]"
            title="Оглавление"
          >
            <List className="w-4 h-4 text-rose-500" />
            <span className="hidden lg:inline">Оглавление</span>
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
            title="Настройки шрифта и бумаги"
          >
            <Sliders className="w-4 h-4 text-rose-500" />
            <span className="hidden md:inline">Настройки</span>
          </button>

          <button
            type="button"
            onClick={onHideHud}
            className="min-h-[44px] min-w-[44px] px-2 bg-zinc-900/90 border border-zinc-700 hover:bg-rose-600 hover:text-white text-zinc-300 font-bold transition flex items-center justify-center cursor-pointer text-[14px]"
            title="Скрыть меню для чистого чтения"
            aria-label="Скрыть меню"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Bottom Ergonomic Thumb-Zone Pager Bubbles */}
      <div className="fixed bottom-2.5 left-1/2 -translate-x-1/2 z-[110] flex items-center gap-2 px-2.5 py-1.5 bg-black/80 backdrop-blur-md border border-white/25 shadow-2xl">
        <button
          type="button"
          onClick={onPrevPage}
          disabled={currentPage === 0}
          className="min-h-[44px] px-3.5 bg-zinc-900/90 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold text-[14px] flex items-center gap-1 disabled:opacity-35 cursor-pointer transition"
        >
          <ChevronLeft className="w-4 h-4 text-rose-500" />
          <span>Назад</span>
        </button>

        <span className="px-2 font-mono tabular-nums text-[14px] font-bold text-zinc-200">
          {currentPage + 1}/{totalPages}
        </span>

        <button
          type="button"
          onClick={onNextPage}
          disabled={currentPage >= totalPages - 1}
          className="min-h-[44px] px-3.5 bg-white text-black hover:bg-zinc-200 border border-white font-bold text-[14px] flex items-center gap-1 disabled:opacity-35 cursor-pointer transition"
        >
          <span>Вперёд</span>
          <ChevronRight className="w-4 h-4 text-rose-600" />
        </button>
      </div>
    </>
  );
};
