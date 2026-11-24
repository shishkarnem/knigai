import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  List,
  Columns,
  BookOpen,
  Scroll,
  ArrowUpDown,
  Play,
  Pause,
  Eye,
  EyeOff,
  Headphones,
  Library,
  ArrowLeftRight,
} from 'lucide-react';
import { Book, Chapter } from '../../types';
import { NoirModal } from '../common/NoirModal';
import {
  readStoredReadingPosition,
  writeStoredReadingPosition,
  useReadingProgressSync,
} from '../reader/hooks/useReadingProgress';

interface MangaComicViewerProps {
  book: Book;
  chapters?: Chapter[];
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onExitReader?: () => void;
  onSwitchToTextReader?: () => void;
  onSwitchToAudioReader?: () => void;
  hasAudioMode?: boolean;
  userUid?: number;
}

interface ComicPageItem {
  id: string;
  url: string;
  title: string;
  chapterNum: number;
  caption?: string;
}

export const MangaComicViewer: React.FC<MangaComicViewerProps> = ({
  book,
  chapters = [],
  isFullscreen: controlledFullscreen,
  onToggleFullscreen,
  onExitReader,
  onSwitchToTextReader,
  onSwitchToAudioReader,
  hasAudioMode = false,
  userUid,
}) => {
  const [currentPage, setCurrentPage] = useState<number>(() => {
    return readStoredReadingPosition('manga', book.id, userUid) ?? 0;
  });
  const [internalFullscreen, setInternalFullscreen] = useState(true);
  const isFullscreen = controlledFullscreen !== undefined ? controlledFullscreen : internalFullscreen;

  const [isControlsHidden, setIsControlsHidden] = useState(false);
  const [isAutoplay, setIsAutoplay] = useState(false);
  const [autoplaySpeed, setAutoplaySpeed] = useState<1 | 2 | 3>(1);
  const [viewMode, setViewMode] = useState<'scroll' | 'single' | 'double'>('scroll');
  const [readDirection, setReadDirection] = useState<'ltr' | 'rtl'>('ltr');
  const [fitMode, setFitMode] = useState<'width' | 'height'>('width');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isJumpModalOpen, setIsJumpModalOpen] = useState(false);
  const [pageJumpInput, setPageJumpInput] = useState('');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const toggleFullscreen = useCallback(() => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
    } else {
      setInternalFullscreen((prev) => !prev);
    }
    setIsControlsHidden(false);
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

  // Autoplay smooth automatic scroll loop for Webtoon mode
  useEffect(() => {
    if (!isAutoplay || viewMode !== 'scroll') return;
    let animId: number;

    const scrollStep = () => {
      if (containerRef.current) {
        const delta = autoplaySpeed === 1 ? 0.95 : autoplaySpeed === 2 ? 1.9 : 3.0;
        containerRef.current.scrollTop += delta;

        const atBottom =
          containerRef.current.scrollHeight - containerRef.current.scrollTop <=
          containerRef.current.clientHeight + 4;
        if (atBottom) {
          setIsAutoplay(false);
          return;
        }
      }
      animId = requestAnimationFrame(scrollStep);
    };

    animId = requestAnimationFrame(scrollStep);
    return () => cancelAnimationFrame(animId);
  }, [isAutoplay, autoplaySpeed, viewMode]);

  // Build real comic/webtoon pages from cover, chapters, and illustrations (no broken external mock URLs)
  const comicPages: ComicPageItem[] = useMemo(() => {
    const pages: ComicPageItem[] = [];

    if (book.cover_config?.frontImageUrl) {
      pages.push({
        id: 'cover',
        url: book.cover_config.frontImageUrl,
        title: `Обложка · ${book.title}`,
        chapterNum: 0,
        caption: book.subtitle || book.author || book.title,
      });
    }

    if (chapters && chapters.length > 0) {
      chapters.forEach((chap) => {
        if (chap.illustration_url) {
          pages.push({
            id: `chap_${chap.chapter_number}_img`,
            url: chap.illustration_url,
            title: chap.title || `Глава ${chap.chapter_number}`,
            chapterNum: chap.chapter_number,
            caption: chap.synopsis || `Глава ${chap.chapter_number}`,
          });
        } else {
          pages.push({
            id: `chap_${chap.chapter_number}_panel`,
            url: '',
            title: chap.title || `Глава ${chap.chapter_number}`,
            chapterNum: chap.chapter_number,
            caption: chap.content?.slice(0, 520) || chap.synopsis || `Глава ${chap.chapter_number}`,
          });
        }
      });
    }

    if (pages.length === 0) {
      pages.push({
        id: 'empty_cover',
        url: '',
        title: book.title,
        chapterNum: 0,
        caption: book.synopsis_overview || 'Добавьте главы или иллюстрации в конструкторе, чтобы читать в режиме вебтуна или манги.',
      });
    }

    return pages;
  }, [book, chapters]);

  const restoredScrollDoneRef = useRef<boolean>(false);

  const { markUserNavigated, persistPosition } = useReadingProgressSync({
    bookId: book.id,
    userUid,
    mode: 'manga',
    onRestoreFromDb: (record) => {
      const idx =
        record.manga_page_index !== null && record.manga_page_index >= 0
          ? record.manga_page_index
          : 0;
      if (idx > 0) {
        setCurrentPage(idx);
        writeStoredReadingPosition('manga', book.id, userUid, idx);
        restoredScrollDoneRef.current = false;
      }
    },
  });

  // Restore scroll position once comic pages are rendered
  useEffect(() => {
    if (restoredScrollDoneRef.current || viewMode !== 'scroll' || comicPages.length === 0) return;
    restoredScrollDoneRef.current = true;
    if (currentPage > 0) {
      const clamped = Math.min(currentPage, comicPages.length - 1);
      setTimeout(() => {
        const el = document.getElementById(`comic-page-${clamped}`);
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, 60);
    }
  }, [comicPages.length, viewMode, currentPage]);

  // Persist current manga page per user + book
  useEffect(() => {
    if (comicPages.length === 0) return;
    const clamped = Math.max(0, Math.min(currentPage, comicPages.length - 1));
    const activeItem = comicPages[clamped];
    persistPosition(activeItem?.chapterNum || 1, clamped, chapters.length > 0 || comicPages.length > 0);
  }, [currentPage, comicPages, chapters.length, persistPosition]);

  // Live active page tracking while scrolling Webtoon strip
  useEffect(() => {
    if (viewMode !== 'scroll' || !containerRef.current) return;
    const root = containerRef.current;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestIdx = -1;
        let bestRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= bestRatio) {
            const rawIdx = entry.target.getAttribute('data-page-idx');
            const parsed = rawIdx !== null ? parseInt(rawIdx, 10) : -1;
            if (!isNaN(parsed) && parsed >= 0) {
              bestRatio = entry.intersectionRatio;
              bestIdx = parsed;
            }
          }
        }
        if (bestIdx >= 0) {
          markUserNavigated();
          setCurrentPage(bestIdx);
        }
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );

    const els = root.querySelectorAll('[data-page-idx]');
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [viewMode, comicPages.length, markUserNavigated]);

  const scrollToPage = useCallback(
    (idx: number) => {
      if (viewMode === 'scroll') {
        const el = document.getElementById(`comic-page-${idx}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    },
    [viewMode]
  );

  const pageStep = viewMode === 'double' ? 2 : 1;

  const goToNext = useCallback(() => {
    if (currentPage < comicPages.length - 1) {
      markUserNavigated();
      const nextP = Math.min(comicPages.length - 1, currentPage + (viewMode === 'scroll' ? 1 : pageStep));
      setCurrentPage(nextP);
      scrollToPage(nextP);
    }
  }, [currentPage, comicPages.length, pageStep, viewMode, scrollToPage, markUserNavigated]);

  const goToPrev = useCallback(() => {
    if (currentPage > 0) {
      markUserNavigated();
      const prevP = Math.max(0, currentPage - (viewMode === 'scroll' ? 1 : pageStep));
      setCurrentPage(prevP);
      scrollToPage(prevP);
    }
  }, [currentPage, pageStep, viewMode, scrollToPage, markUserNavigated]);

  const handleTurnLeft = useCallback(() => {
    if (readDirection === 'rtl') goToNext();
    else goToPrev();
  }, [readDirection, goToNext, goToPrev]);

  const handleTurnRight = useCallback(() => {
    if (readDirection === 'rtl') goToPrev();
    else goToNext();
  }, [readDirection, goToNext, goToPrev]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTocOpen || isJumpModalOpen) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        handleTurnRight();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        handleTurnLeft();
      } else if (e.key === ' ' && isFullscreen) {
        e.preventDefault();
        if (viewMode === 'scroll') setIsAutoplay((p) => !p);
        else goToNext();
      } else if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTocOpen, isJumpModalOpen, isFullscreen, viewMode, handleTurnLeft, handleTurnRight, goToNext, toggleFullscreen]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.changedTouches.length === 0 || viewMode === 'scroll') {
      touchStartRef.current = null;
      return;
    }
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x;
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y;
    touchStartRef.current = null;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) handleTurnRight();
      else handleTurnLeft();
    }
  };

  const handleJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(pageJumpInput, 10);
    if (!isNaN(val) && val >= 1 && val <= comicPages.length) {
      markUserNavigated();
      const targetIdx = val - 1;
      setCurrentPage(targetIdx);
      scrollToPage(targetIdx);
      setIsJumpModalOpen(false);
      setPageJumpInput('');
    }
  };

  const renderPanelCard = (pg: ComicPageItem, idx: number, compactDouble = false) => {
    if (pg.url) {
      return (
        <img
          src={pg.url}
          alt={pg.title}
          referrerPolicy="no-referrer"
          loading={idx < 3 ? 'eager' : 'lazy'}
          className={
            viewMode === 'scroll'
              ? `${fitMode === 'height' ? 'max-h-[92dvh] w-auto' : 'w-full h-auto'} object-contain block select-none`
              : `${fitMode === 'height' ? 'max-h-[82dvh]' : compactDouble ? 'max-h-[78dvh]' : 'max-h-[84dvh]'} max-w-full w-auto object-contain block select-none border border-zinc-800 shadow-2xl`
          }
        />
      );
    }

    return (
      <div className="w-full max-w-2xl min-h-[420px] sm:min-h-[500px] p-5 sm:p-8 bg-zinc-950/90 border-2 border-zinc-700 flex flex-col justify-between text-white">
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
          <span className="font-mono text-rose-500 text-[14px] font-bold truncate">
            {pg.title}
          </span>
          <span className="font-mono text-zinc-400 text-[14px] tabular-nums shrink-0">
            Стр. {idx + 1}/{comicPages.length}
          </span>
        </div>

        <div className="my-auto p-4 sm:p-6 bg-zinc-900/75 border border-zinc-700">
          <p className="text-[15px] sm:text-[17px] leading-relaxed font-['PT_Serif',serif] text-zinc-100 whitespace-pre-line">
            {pg.caption}
          </p>
        </div>

        <div className="flex items-center justify-between text-[14px] font-mono text-zinc-400 pt-2.5 border-t border-zinc-800">
          <span>{pg.chapterNum > 0 ? `Глава ${pg.chapterNum}` : 'Обложка'}</span>
          <span>KnigAI · Графика</span>
        </div>
      </div>
    );
  };

  const doubleSecondIdx = viewMode === 'double' && currentPage + 1 < comicPages.length ? currentPage + 1 : null;
  const spreadPair =
    doubleSecondIdx !== null
      ? readDirection === 'rtl'
        ? [doubleSecondIdx, currentPage]
        : [currentPage, doubleSecondIdx]
      : [currentPage];

  return (
    <div
      className={`w-full flex flex-col font-['PT_Serif',serif] select-none ${
        isFullscreen
          ? 'fixed inset-0 z-[200] bg-black text-white p-0 m-0 h-[100dvh] w-screen overflow-hidden flex flex-col'
          : 'relative noir-container border border-zinc-800 bg-zinc-950 p-2 sm:p-4 text-white'
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Top Controls Toolbar */}
      <div
        className={`w-full shrink-0 flex flex-wrap items-center justify-between gap-2 p-2 sm:px-3 bg-black/80 backdrop-blur-md border-b border-white/20 text-[14px] z-30 ${
          isFullscreen && isControlsHidden ? 'hidden' : ''
        }`}
      >
        {/* Left: Mode Indicator & Book Title */}
        <div className="flex items-center gap-2 min-w-0">
          {isFullscreen && onExitReader && (
            <button
              type="button"
              onClick={onExitReader}
              className="min-h-[44px] px-2.5 bg-zinc-900/90 border border-zinc-700 hover:border-white text-white font-bold transition flex items-center gap-1.5 cursor-pointer shrink-0"
              title="Вернуться в библиотеку"
            >
              <Library className="w-4 h-4 text-rose-500" />
              <span className="hidden lg:inline">Библиотека</span>
            </button>
          )}
          <div className="min-w-0">
            <span className="text-[14px] font-bold text-rose-500 block leading-none">
              {viewMode === 'scroll' ? 'Вебтун · Лента' : viewMode === 'double' ? 'Манга · Разворот' : 'Манга · Страница'}
            </span>
            <div className="text-[14px] font-bold text-white truncate max-w-[180px] sm:max-w-xs md:max-w-sm mt-0.5">
              {book.title}
            </div>
          </div>
        </div>

        {/* Center: View Modes & Zoom */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setViewMode('scroll');
              setIsAutoplay(false);
            }}
            className={`min-h-[44px] px-2.5 border font-bold text-[14px] transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'scroll'
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
            }`}
            title="Вертикальная лента вебтуна"
          >
            <Scroll className="w-4 h-4" />
            <span className="hidden sm:inline">Вебтун</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('single');
              setIsAutoplay(false);
            }}
            className={`min-h-[44px] px-2.5 border font-bold text-[14px] transition flex items-center gap-1.5 cursor-pointer ${
              viewMode === 'single'
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
            }`}
            title="Постраничное листание"
          >
            <BookOpen className="w-4 h-4" />
            <span className="hidden sm:inline">1 стр.</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('double');
              setIsAutoplay(false);
            }}
            className={`hidden md:flex min-h-[44px] px-2.5 border font-bold text-[14px] transition items-center gap-1.5 cursor-pointer ${
              viewMode === 'double'
                ? 'bg-rose-600 border-rose-500 text-white'
                : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
            }`}
            title="Разворот манги (2 страницы)"
          >
            <Columns className="w-4 h-4" />
            <span>2 стр.</span>
          </button>

          {viewMode !== 'scroll' && (
            <button
              type="button"
              onClick={() => setReadDirection((d) => (d === 'ltr' ? 'rtl' : 'ltr'))}
              className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-mono font-bold text-[14px] transition flex items-center gap-1 cursor-pointer"
              title="Направление чтения: Л→П (комикс) или П→Л (классическая манга)"
            >
              <ArrowLeftRight className="w-4 h-4 text-rose-500" />
              <span>{readDirection === 'rtl' ? 'П→Л' : 'Л→П'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setFitMode((m) => (m === 'width' ? 'height' : 'width'))}
            className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1 cursor-pointer"
            title="Переключить подгонку по ширине / высоте"
          >
            <ArrowUpDown className="w-4 h-4 text-rose-500" />
            <span className="hidden xl:inline">{fitMode === 'width' ? 'Ширина' : 'Высота'}</span>
          </button>

          <div className="hidden sm:flex items-center gap-1 bg-zinc-950 border border-zinc-700 px-1 min-h-[44px]">
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 15))}
              className="p-1.5 hover:text-rose-500 cursor-pointer"
              title="Уменьшить"
              aria-label="Уменьшить"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-[14px] font-mono tabular-nums px-1">{zoomLevel}%</span>
            <button
              type="button"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 15))}
              className="p-1.5 hover:text-rose-500 cursor-pointer"
              title="Увеличить"
              aria-label="Увеличить"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsTocOpen(true)}
            className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1.5 cursor-pointer"
            title="Оглавление панелей и глав"
          >
            <List className="w-4 h-4 text-rose-500" />
            <span className="hidden lg:inline">Главы</span>
          </button>
        </div>

        {/* Right: Mode Switchers & Fullscreen Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          {onSwitchToTextReader && (
            <button
              type="button"
              onClick={onSwitchToTextReader}
              className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-zinc-200 font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
              title="Переключиться на текстовую читалку"
            >
              <BookOpen className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Текст</span>
            </button>
          )}

          {hasAudioMode && onSwitchToAudioReader && (
            <button
              type="button"
              onClick={onSwitchToAudioReader}
              className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-zinc-200 font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
              title="Переключиться на аудиокнигу"
            >
              <Headphones className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Аудио</span>
            </button>
          )}

          {isFullscreen && (
            <button
              type="button"
              onClick={() => setIsControlsHidden(true)}
              className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-zinc-200 font-bold transition flex items-center gap-1 cursor-pointer text-[14px]"
              title="Скрыть панели управления"
            >
              <EyeOff className="w-4 h-4 text-rose-500" />
              <span className="hidden md:inline">Чистый экран</span>
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className={
              isFullscreen
                ? 'min-h-[44px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px] rounded-none'
                : 'relative group min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-500 border-2 border-white text-white font-bold shadow-[3px_3px_0px_0px_rgba(255,255,255,0.85)] transition flex items-center justify-center gap-2 cursor-pointer text-[14px] rounded-none'
            }
            title={isFullscreen ? 'Свернуть из полноэкранного режима (Esc)' : 'Открыть на весь экран'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="hidden sm:inline">Свернуть</span>
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

      {/* Floating Restore Button in Clean Webtoon/Manga Fullscreen Mode */}
      {isFullscreen && isControlsHidden && (
        <div className="fixed top-2.5 right-2.5 z-[120] flex items-center gap-1.5">
          {viewMode === 'scroll' && (
            <button
              type="button"
              onClick={() => setIsAutoplay((prev) => !prev)}
              className="min-h-[44px] px-3 bg-black/80 hover:bg-black border border-white/30 text-white text-[14px] font-mono flex items-center gap-1.5 backdrop-blur-md cursor-pointer"
              title={isAutoplay ? 'Остановить автоскролл' : 'Запустить автоскролл'}
            >
              {isAutoplay ? <Pause className="w-4 h-4 text-rose-500" /> : <Play className="w-4 h-4 text-rose-500 fill-current" />}
              <span>{isAutoplay ? `${autoplaySpeed}x` : 'Авто'}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsControlsHidden(false)}
            className="min-h-[44px] px-3 bg-black/80 hover:bg-black border border-white/40 text-white text-[14px] font-bold flex items-center gap-1.5 backdrop-blur-md cursor-pointer"
            title="Показать меню и навигацию"
          >
            <Eye className="w-4 h-4 text-rose-500" />
            <span className="font-mono tabular-nums">{currentPage + 1}/{comicPages.length}</span>
          </button>
        </div>
      )}

      {/* Main Viewport Area */}
      <div
        ref={containerRef}
        className={`w-full flex-1 min-h-0 overflow-auto bg-black flex justify-center relative ${
          isFullscreen ? '' : 'min-h-[540px] max-h-[75vh]'
        }`}
      >
        {viewMode === 'scroll' ? (
          /* Continuous Webtoon Vertical Scroll Strip */
          <div
            onClick={() => {
              if (isFullscreen) setIsControlsHidden((prev) => !prev);
            }}
            className="flex flex-col items-center gap-1.5 py-2 sm:py-4 px-1 cursor-pointer"
            style={{
              width: fitMode === 'width' ? `${zoomLevel}%` : 'auto',
              maxWidth: fitMode === 'width' ? '920px' : 'none',
            }}
          >
            {comicPages.map((pg, index) => (
              <div
                key={pg.id}
                id={`comic-page-${index}`}
                data-page-idx={index}
                className="w-full flex flex-col items-center bg-zinc-950 border border-zinc-800/80 relative"
              >
                {renderPanelCard(pg, index)}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/75 text-white font-mono tabular-nums text-[14px] border border-white/20 pointer-events-none">
                  {index + 1}/{comicPages.length}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Single Page or Double Spread Manga Reader with Ergonomic Tap Flip Zones */
          <div className="w-full h-full flex items-center justify-center p-2 sm:p-4 relative">
            {/* Left Tap Zone */}
            <button
              type="button"
              onClick={handleTurnLeft}
              aria-label="Листать влево"
              className="absolute left-0 top-0 bottom-0 w-1/4 z-20 flex items-center justify-start pl-2 sm:pl-4 bg-transparent hover:bg-white/5 transition group cursor-pointer"
            >
              <span className="min-w-[44px] min-h-[44px] bg-black/75 border border-white/30 text-white flex items-center justify-center opacity-70 group-hover:opacity-100">
                <ChevronLeft className="w-6 h-6" />
              </span>
            </button>

            {/* Center Tap Zone toggles HUD in fullscreen */}
            <div
              onClick={() => {
                if (isFullscreen) setIsControlsHidden((prev) => !prev);
              }}
              className="flex items-center justify-center gap-2 max-w-full max-h-full z-10 cursor-pointer"
              style={{
                width: fitMode === 'width' ? `${zoomLevel}%` : 'auto',
                maxWidth: viewMode === 'double' ? '1280px' : '900px',
              }}
            >
              {spreadPair.map((idx) => (
                <div key={comicPages[idx].id} className="flex items-center justify-center max-w-full">
                  {renderPanelCard(comicPages[idx], idx, viewMode === 'double')}
                </div>
              ))}
            </div>

            {/* Right Tap Zone */}
            <button
              type="button"
              onClick={handleTurnRight}
              aria-label="Листать вправо"
              className="absolute right-0 top-0 bottom-0 w-1/4 z-20 flex items-center justify-end pr-2 sm:pr-4 bg-transparent hover:bg-white/5 transition group cursor-pointer"
            >
              <span className="min-w-[44px] min-h-[44px] bg-black/75 border border-white/30 text-white flex items-center justify-center opacity-70 group-hover:opacity-100">
                <ChevronRight className="w-6 h-6" />
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Dedicated Bottom Thumb Navigation Bar (Webtoon scroller or Paged manga controls) */}
      {!(isFullscreen && isControlsHidden) && (
        <div className="w-full shrink-0 bg-black/85 backdrop-blur-md border-t border-white/20 px-2.5 py-2 flex flex-wrap items-center justify-between gap-2 text-[14px] z-30">
          {viewMode === 'scroll' ? (
            <>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={goToPrev}
                  disabled={currentPage === 0}
                  className="min-h-[44px] min-w-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white flex items-center justify-center disabled:opacity-35 cursor-pointer"
                  title="Предыдущая панель"
                >
                  <ChevronUp className="w-5 h-5 text-rose-500" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsAutoplay((p) => !p)}
                  className={`min-h-[44px] px-3 border font-bold flex items-center gap-1.5 cursor-pointer ${
                    isAutoplay ? 'bg-rose-600 border-rose-500 text-white' : 'bg-zinc-900 border-zinc-700 text-white hover:border-white'
                  }`}
                >
                  {isAutoplay ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 text-rose-500 fill-current" />}
                  <span>{isAutoplay ? 'Стоп' : 'Автоплей'}</span>
                </button>
                {isAutoplay && (
                  <button
                    type="button"
                    onClick={() => setAutoplaySpeed((s) => (s === 1 ? 2 : s === 2 ? 3 : 1))}
                    className="min-h-[44px] px-2.5 bg-zinc-900 border border-zinc-700 text-rose-400 font-mono font-bold cursor-pointer"
                  >
                    {autoplaySpeed}x
                  </button>
                )}
              </div>

              <div className="flex-1 min-w-[140px] flex items-center gap-2 px-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, comicPages.length - 1)}
                  value={currentPage}
                  onChange={(e) => {
                    const idx = parseInt(e.target.value, 10);
                    setCurrentPage(idx);
                    scrollToPage(idx);
                  }}
                  aria-label="Позиция в вебтуне"
                  className="w-full h-2 bg-zinc-800 accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsJumpModalOpen(true)}
                  className="min-h-[44px] px-3 bg-zinc-950 border border-zinc-700 hover:border-rose-500 text-white font-mono tabular-nums font-bold cursor-pointer"
                >
                  <span className="text-rose-500">Стр. </span>
                  {currentPage + 1}/{comicPages.length}
                </button>
                <button
                  type="button"
                  onClick={goToNext}
                  disabled={currentPage >= comicPages.length - 1}
                  className="min-h-[44px] min-w-[44px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white flex items-center justify-center disabled:opacity-35 cursor-pointer"
                  title="Следующая панель"
                >
                  <ChevronDown className="w-5 h-5 text-rose-500" />
                </button>
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleTurnLeft}
                className="min-h-[44px] px-3.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-rose-500" />
                <span>{readDirection === 'rtl' ? 'Далее' : 'Назад'}</span>
              </button>

              <div className="flex-1 min-w-[120px] flex items-center gap-2 px-1">
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, comicPages.length - 1)}
                  value={currentPage}
                  onChange={(e) => setCurrentPage(parseInt(e.target.value, 10))}
                  aria-label="Страница манги"
                  className="w-full h-2 bg-zinc-800 accent-rose-500 cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsJumpModalOpen(true)}
                  className="min-h-[44px] px-3 bg-zinc-950 border border-zinc-700 hover:border-rose-500 text-white font-mono tabular-nums font-bold cursor-pointer"
                >
                  {currentPage + 1}/{comicPages.length}
                </button>
                <button
                  type="button"
                  onClick={handleTurnRight}
                  className="min-h-[44px] px-3.5 bg-white text-black hover:bg-zinc-200 border border-white font-bold flex items-center gap-1 cursor-pointer"
                >
                  <span>{readDirection === 'rtl' ? 'Назад' : 'Вперёд'}</span>
                  <ChevronRight className="w-4 h-4 text-rose-600" />
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Table of Contents Modal */}
      <NoirModal
        isOpen={isTocOpen}
        onClose={() => setIsTocOpen(false)}
        title={`Оглавление (${comicPages.length} стр.)`}
        maxWidth="max-w-lg"
      >
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {comicPages.map((pg, idx) => (
            <button
              key={pg.id}
              type="button"
              onClick={() => {
                setCurrentPage(idx);
                scrollToPage(idx);
                setIsTocOpen(false);
              }}
              className={`min-h-[44px] p-2.5 text-left border flex items-center justify-between gap-3 transition cursor-pointer text-[14px] ${
                idx === currentPage
                  ? 'bg-rose-950/75 border-rose-500 text-white font-bold'
                  : 'bg-zinc-950/80 border-zinc-800 text-zinc-200 hover:border-white'
              }`}
            >
              <span className="truncate">{pg.title}</span>
              <span className="font-mono tabular-nums text-zinc-400 shrink-0">Стр. {idx + 1}</span>
            </button>
          ))}
        </div>
      </NoirModal>

      {/* Quick Page Jump Modal */}
      <NoirModal
        isOpen={isJumpModalOpen}
        onClose={() => setIsJumpModalOpen(false)}
        title="Переход к странице"
        maxWidth="max-w-sm"
      >
        <form onSubmit={handleJumpSubmit} className="flex flex-col gap-3">
          <p className="text-[14px] text-zinc-300">
            Введите номер страницы от 1 до {comicPages.length}:
          </p>
          <input
            type="number"
            min={1}
            max={comicPages.length}
            value={pageJumpInput}
            onChange={(e) => setPageJumpInput(e.target.value)}
            placeholder={`1 - ${comicPages.length}`}
            autoFocus
            className="w-full px-3 py-2 bg-zinc-900 border border-zinc-700 text-white font-mono text-[16px] font-bold focus:border-rose-500 outline-none"
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsJumpModalOpen(false)}
              className="min-h-[44px] px-4 py-2 bg-zinc-900 border border-zinc-700 text-zinc-200 font-bold text-[14px] hover:text-white cursor-pointer"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-4 py-2 bg-white text-black font-bold text-[14px] hover:bg-zinc-200 cursor-pointer"
            >
              Перейти
            </button>
          </div>
        </form>
      </NoirModal>
    </div>
  );
};
