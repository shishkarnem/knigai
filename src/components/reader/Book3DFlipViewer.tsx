import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { List, Sliders, RotateCcw, Maximize2, ChevronLeft, ChevronRight, SkipBack, SkipForward, BookOpen } from 'lucide-react';
import { PageFlip } from 'page-flip';
import { AudioTrack, Book, Chapter } from '../../types';
import { ReaderTheme, READER_THEMES, ReaderSettings, PAGE_STYLES, READING_FONTS, DEFAULT_READER_SETTINGS, READER_BG_STYLES } from './ReaderThemeSelector';
import { ReaderSettingsModal } from './ReaderSettingsModal';
import { BookFlipPage, PageData } from './BookFlipPage';
import { ReaderAudioBar } from './ReaderAudioBar';
import { DirectPageJumpModal, TableOfContentsModal } from './modals/ReaderJumpModals';
import { ReaderFullscreenHud } from './modals/ReaderFullscreenHud';
import { useBookPagination, calculateReaderDimensions } from './hooks/useBookPagination';
import { readStoredReadingPosition, writeStoredReadingPosition, useReadingProgressSync } from './hooks/useReadingProgress';

export interface Book3DFlipViewerProps {
  book: Book;
  chapters: Chapter[];
  fontSize?: number; // 14 to 20
  theme?: ReaderTheme;
  settings?: ReaderSettings;
  onSettingsChange?: (newSettings: ReaderSettings) => void;
  onResetSettings?: () => void;
  initialChapterIndex?: number;
  userUid?: number;
  onPageChange?: (page: number, totalPages: number) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onExitReader?: () => void;
  onSwitchToAudio?: () => void;
  onSwitchToManga?: () => void;
  hasAudioMode?: boolean;
  hasMangaMode?: boolean;
  audioTracks?: AudioTrack[];
  showAudioBar?: boolean;
  onToggleAudioBar?: () => void;
}

export const Book3DFlipViewer: React.FC<Book3DFlipViewerProps> = ({
  book,
  chapters,
  fontSize = 16,
  theme = 'noir-dark',
  settings = DEFAULT_READER_SETTINGS,
  onSettingsChange,
  onResetSettings,
  initialChapterIndex = 0,
  userUid,
  onPageChange,
  isFullscreen: controlledFullscreen,
  onToggleFullscreen: onControlledToggleFullscreen,
  onExitReader,
  onSwitchToAudio,
  onSwitchToManga,
  hasAudioMode = false,
  hasMangaMode = false,
  audioTracks,
  showAudioBar = true,
  onToggleAudioBar,
}) => {
  const currentThemeConfig = READER_THEMES[theme] || READER_THEMES['noir-dark'];
  const pageStyleConfig = settings ? PAGE_STYLES[settings.pageStyle] || PAGE_STYLES.antique : null;
  const currentSheetBg = pageStyleConfig ? pageStyleConfig.sheetBg : currentThemeConfig.sheetBg;
  const currentSheetText = pageStyleConfig ? pageStyleConfig.sheetText : currentThemeConfig.sheetText;
  const currentHeaderBorder = pageStyleConfig ? pageStyleConfig.headerBorder : currentThemeConfig.headerBorder;
  const currentAccentColor = pageStyleConfig ? pageStyleConfig.accentColor : currentThemeConfig.accentColor;
  const fontConfig = settings ? READING_FONTS[settings.fontId] || READING_FONTS['pt-serif'] : READING_FONTS['pt-serif'];
  const activeFontSize = Math.max(14, settings?.fontSize || fontSize || 16);
  const lineSpacingValue = settings?.lineSpacing === 'compact' ? 1.35 : settings?.lineSpacing === 'relaxed' ? 1.85 : 1.55;

  // Reactive viewport window dimensions
  const [windowSize, setWindowSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));

  // Detect mobile viewport
  const isMobileScreen = windowSize.width < 768;

  // Refs for PageFlip DOM and book container
  const bookContainerRef = useRef<HTMLDivElement | null>(null);
  const stagingRef = useRef<HTMLDivElement | null>(null);
  const pageFlipInstanceRef = useRef<any>(null);

  // In-app distraction-free fullscreen mode (covers 100% of viewport, zero gaps)
  const [internalFullscreen, setInternalFullscreen] = useState(true);
  const isFullscreen = controlledFullscreen !== undefined ? controlledFullscreen : internalFullscreen;

  // Dynamic padding and borders: on mobile, snug padding to fit inside screen width without edge clipping
  const paddingClass = isFullscreen && isMobileScreen
    ? 'px-3.5 py-2'
    : isMobileScreen
    ? 'p-3'
    : settings?.margins === 'narrow'
    ? 'p-3 sm:p-5'
    : settings?.margins === 'wide'
    ? 'p-5 sm:p-8'
    : 'p-4 sm:p-6';

  const currentSheetBorder = isFullscreen && isMobileScreen
    ? 'border-0'
    : `border-2 ${pageStyleConfig ? pageStyleConfig.sheetBorder : currentThemeConfig.sheetBorder}`;

  // Modals state
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);
  const [isPageJumpModalOpen, setIsPageJumpModalOpen] = useState(false);
  const [pageJumpInput, setPageJumpInput] = useState('');

  // Fixed A5 spread dimensions state (2 pages = 1120x820 on PC)
  const [spreadDimensions, setSpreadDimensions] = useState<{ width: number; height: number }>({
    width: 1120,
    height: 820,
  });

  // Running headers and footers state
  const [customHeader, setCustomHeader] = useState(book.running_header || book.title);
  const [leftFooter, setLeftFooter] = useState('');
  const [rightFooter, setRightFooter] = useState(book.author || 'Издание автора');
  const [hideFooters, setHideFooters] = useState(false);

  useEffect(() => {
    setCustomHeader(book.running_header || book.title);
    setRightFooter(book.author || 'Издание автора');
  }, [book.id, book.title, book.running_header, book.author]);

  // Initialize page from user-scoped local storage (per user + per book)
  const [currentPage, setCurrentPage] = useState<number>(() => {
    return readStoredReadingPosition('text', book.id, userUid) ?? 0;
  });
  const currentPageRef = useRef<number>(currentPage);
  currentPageRef.current = currentPage;

  // Reload stored page if userUid changes while book remains mounted
  useEffect(() => {
    if (initialChapterIndex > 0) return;
    const stored = readStoredReadingPosition('text', book.id, userUid);
    if (stored !== null) {
      currentPageRef.current = stored;
      setCurrentPage(stored);
    } else if (!userUid) {
      currentPageRef.current = 0;
      setCurrentPage(0);
    }
  }, [book.id, userUid, initialChapterIndex]);

  // Version counter to trigger DOM reload for StPageFlip when settings, page dimensions or fullscreen change
  const [flipReloadTrigger, setFlipReloadTrigger] = useState(0);

  // Lock body scroll during in-app fullscreen mode
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

  // Window resize and orientation change handler (works in both normal and fullscreen modes)
  useEffect(() => {
    let resizeTimer: NodeJS.Timeout | null = null;
    const handleResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        setWindowSize({
          width: window.innerWidth,
          height: window.innerHeight,
        });
        setFlipReloadTrigger((prev) => prev + 1);
      }, 80);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  // Toggle in-app fullscreen mode
  const toggleFullscreen = useCallback(() => {
    if (onControlledToggleFullscreen) {
      onControlledToggleFullscreen();
    } else {
      setInternalFullscreen((prev) => !prev);
    }
    setFlipReloadTrigger((prev) => prev + 1);
  }, [onControlledToggleFullscreen]);

  useEffect(() => {
    setFlipReloadTrigger((prev) => prev + 1);
  }, [isFullscreen]);

  // Fullscreen HUD auto-hiding with 5-second timer
  const [isHudVisible, setIsHudVisible] = useState(false);
  const hudTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showHudTemporarily = useCallback(() => {
    setIsHudVisible(true);
    if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    hudTimeoutRef.current = setTimeout(() => {
      setIsHudVisible(false);
    }, 5000);
  }, []);

  // Show HUD briefly on fullscreen activation
  useEffect(() => {
    if (isFullscreen) {
      showHudTemporarily();
    } else {
      setIsHudVisible(false);
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    }
    return () => {
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
    };
  }, [isFullscreen, showHudTemporarily]);

  // Touch gesture for mobile: swipe down from top edge reveals HUD
  const touchStartYRef = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY;
    }
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartYRef.current !== null && e.touches.length > 0) {
      const currentY = e.touches[0].clientY;
      // If swipe started in top 120px and moved down > 25px
      if (touchStartYRef.current < 120 && currentY - touchStartYRef.current > 25) {
        showHudTemporarily();
        touchStartYRef.current = null;
      }
    }
  };
  const handleTouchEnd = () => {
    touchStartYRef.current = null;
  };


  // Dynamic pagination with accurate word & line capacity per page based on font size (10 to 20 pt)
  const computedPages = useBookPagination({
    book,
    chapters,
    activeFontSize,
    lineSpacingValue,
    settings,
    isFullscreen,
    viewportWidth: windowSize.width,
    viewportHeight: windowSize.height,
  });

  const computedPagesRef = useRef(computedPages);
  computedPagesRef.current = computedPages;
  const chaptersCountRef = useRef(chapters.length);
  chaptersCountRef.current = chapters.length;

  // Per-user, per-book PostgreSQL reading progress sync
  const { markUserNavigated, persistPosition } = useReadingProgressSync({
    bookId: book.id,
    userUid,
    mode: 'text',
    skipRestore: initialChapterIndex > 0,
    onRestoreFromDb: (record) => {
      const pages = computedPagesRef.current;
      let targetIdx: number | null = null;
      if (record.page_index !== null && record.page_index >= 0) {
        targetIdx = record.page_index;
      } else if (record.current_chapter > 1 && pages.length > 0) {
        const chapIdx = pages.findIndex((p) => p.chapterNumber === record.current_chapter);
        if (chapIdx >= 0) targetIdx = chapIdx;
      }
      if (targetIdx === null || targetIdx < 0) return;

      currentPageRef.current = targetIdx;
      setCurrentPage(targetIdx);
      writeStoredReadingPosition('text', book.id, userUid, targetIdx);

      if (chaptersCountRef.current > 0 && pages.length > 0) {
        const clamped = Math.max(0, Math.min(targetIdx, pages.length - 1));
        if (pageFlipInstanceRef.current) {
          try {
            pageFlipInstanceRef.current.turnToPage(clamped);
          } catch {
            setFlipReloadTrigger((prev) => prev + 1);
          }
        } else {
          setFlipReloadTrigger((prev) => prev + 1);
        }
      }
    },
  });

  // Trigger rebuild when pages configuration, chapters, or book identity changes
  useEffect(() => {
    setFlipReloadTrigger((prev) => prev + 1);
  }, [
    book.id,
    computedPages,
    activeFontSize,
    settings?.pageStyle,
    settings?.lineSpacing,
    theme,
  ]);

  // Mount StPageFlip with physics-based curl & shadow using cloned pages
  useEffect(() => {
    if (!bookContainerRef.current) return;

    if (pageFlipInstanceRef.current) {
      try {
        pageFlipInstanceRef.current.destroy();
      } catch {
        // ignore
      }
      pageFlipInstanceRef.current = null;
    }

    if (bookContainerRef.current) {
      bookContainerRef.current.innerHTML = '';
    }

    const timer = setTimeout(() => {
      if (!bookContainerRef.current || !stagingRef.current) return;

      const pageElements = stagingRef.current.querySelectorAll<HTMLElement>('.st-page');
      if (pageElements.length === 0) return;

      // Clean container inner content
      bookContainerRef.current.innerHTML = '';

      // Dedicated inner mount element for vanilla PageFlip
      const innerMount = document.createElement('div');
      innerMount.className = 'st-flip-mount w-full h-full';
      bookContainerRef.current.appendChild(innerMount);

      // Clone each page element so that React's staging DOM is completely preserved
      const clonedPages = Array.from(pageElements).map((el) => el.cloneNode(true) as HTMLElement);

      try {
        const { baseWidth, baseHeight, isSinglePage } = calculateReaderDimensions(
          windowSize.width,
          windowSize.height,
          isFullscreen
        );

        const calculatedSpreadWidth = isSinglePage ? baseWidth : baseWidth * 2;
        const calculatedSpreadHeight = baseHeight;
        setSpreadDimensions({ width: calculatedSpreadWidth, height: calculatedSpreadHeight });

        const requestedIdx =
          initialChapterIndex > 0
            ? computedPages.findIndex((p) => p.chapterNumber === initialChapterIndex)
            : -1;
        const resolvedStartPage =
          requestedIdx >= 0
            ? requestedIdx
            : Math.max(0, Math.min(currentPageRef.current, clonedPages.length - 1));

        const flipInstance = new PageFlip(innerMount, {
          width: baseWidth,
          height: baseHeight,
          size: 'fixed',
          minWidth: Math.floor(baseWidth * 0.5),
          maxWidth: Math.ceil(baseWidth * 1.6),
          minHeight: Math.floor(baseHeight * 0.5),
          maxHeight: Math.ceil(baseHeight * 1.6),
          drawShadow: true,
          maxShadowOpacity: 0.5,
          showCover: !isSinglePage,
          mobileScrollSupport: false,
          usePortrait: isSinglePage,
          startPage: resolvedStartPage,
          flippingTime: 420,
          useMouseEvents: true,
          swipeDistance: isSinglePage ? 12 : 25,
          clickEventForward: true,
        });

        flipInstance.loadFromHTML(clonedPages);

        // Portrait mode threshold optimization (responsive light swipe flip distance)
        try {
          const fc = (flipInstance as any).getFlipController?.();
          if (fc) {
            const origStopMove = fc.stopMove.bind(fc);
            fc.stopMove = function () {
              if (!this.calc) return;
              const pos = this.calc.getPosition();
              const bounds = this.getBoundsRect();
              const cornerY = 'bottom' === this.calc.getCorner() ? bounds.height : 0;
              const orientation = this.render.getOrientation();
              const dir = this.calc.getDirection();

              if (orientation === 'portrait') {
                if (dir === 0) {
                  // Forward: dragged from right inwards to left. Sensitive light swipe flip.
                  const shouldFlip = pos.x <= bounds.pageWidth * 0.85;
                  if (shouldFlip) {
                    this.animateFlippingTo(pos, { x: -bounds.pageWidth, y: cornerY }, true);
                  } else {
                    this.animateFlippingTo(pos, { x: bounds.pageWidth, y: cornerY }, false);
                  }
                  return;
                }

                if (dir === 1) {
                  // Backward: dragged from left inwards to right. Sensitive light swipe flip.
                  const shouldFlip = pos.x >= bounds.pageWidth * 0.15;
                  if (shouldFlip) {
                    this.animateFlippingTo(pos, { x: bounds.pageWidth, y: cornerY }, true);
                  } else {
                    this.animateFlippingTo(pos, { x: -bounds.pageWidth, y: cornerY }, false);
                  }
                  return;
                }
              }

              origStopMove();
            };
          }
        } catch {
          // ignore
        }

        flipInstance.on('flip', (e: { data: number }) => {
          const newIdx = e.data;
          if (chaptersCountRef.current === 0) return;
          markUserNavigated();
          currentPageRef.current = newIdx;
          setCurrentPage(newIdx);
          writeStoredReadingPosition('text', book.id, userUid, newIdx);
        });

        pageFlipInstanceRef.current = flipInstance;
      } catch (err) {
        console.error('Failed to initialize PageFlip:', err);
      }
    }, 60);

    return () => {
      clearTimeout(timer);
      if (pageFlipInstanceRef.current) {
        try {
          pageFlipInstanceRef.current.destroy();
        } catch {
          // ignore
        }
        pageFlipInstanceRef.current = null;
      }
      if (bookContainerRef.current) {
        bookContainerRef.current.innerHTML = '';
      }
    };
  }, [flipReloadTrigger]);

  // Jump to initial chapter if specified
  useEffect(() => {
    if (initialChapterIndex > 0 && computedPages.length > 0) {
      const targetIdx = computedPages.findIndex((p) => p.chapterNumber === initialChapterIndex);
      if (targetIdx >= 0) {
        markUserNavigated();
        currentPageRef.current = targetIdx;
        setCurrentPage(targetIdx);
        if (pageFlipInstanceRef.current) {
          try {
            pageFlipInstanceRef.current.turnToPage(targetIdx);
          } catch {
            // fallback handled by state
          }
        }
      }
    }
  }, [initialChapterIndex, computedPages, markUserNavigated]);

  // Sync current page with DB and parent callbacks
  useEffect(() => {
    if (computedPages.length === 0) return;

    const clampedIdx = Math.max(0, Math.min(currentPage, computedPages.length - 1));
    const activePage = computedPages[clampedIdx];
    const chapNum =
      activePage?.chapterNumber && activePage.chapterNumber > 0 && activePage.chapterNumber < 900
        ? activePage.chapterNumber
        : 1;

    persistPosition(chapNum, currentPage, chapters.length > 0);

    if (onPageChange) {
      onPageChange(clampedIdx, computedPages.length);
    }
  }, [currentPage, computedPages, chapters.length, persistPosition, onPageChange]);

  const goToNextPage = () => {
    markUserNavigated();
    if (pageFlipInstanceRef.current) {
      try {
        pageFlipInstanceRef.current.flipNext();
        return;
      } catch {
        // fallback
      }
    }
    if (currentPage < computedPages.length - 1) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const goToPrevPage = () => {
    markUserNavigated();
    if (pageFlipInstanceRef.current) {
      try {
        pageFlipInstanceRef.current.flipPrev();
        return;
      } catch {
        // fallback
      }
    }
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1);
    }
  };

  const turnToTargetPage = (idx: number) => {
    markUserNavigated();
    currentPageRef.current = idx;
    if (pageFlipInstanceRef.current) {
      try {
        pageFlipInstanceRef.current.flip(idx);
        return;
      } catch {
        // fallback
      }
    }
    setCurrentPage(idx);
  };

  // Quick Chapter Navigation (Пред. / След. глава)
  const goToPrevChapter = () => {
    const activePage = computedPages[currentPage] || computedPages[0];
    const curChap = activePage.chapterNumber;
    if (!curChap || curChap <= 1) {
      turnToTargetPage(0);
      return;
    }
    const prevChap = [...chapters].reverse().find((c) => c.chapter_number < curChap);
    if (prevChap) {
      const targetIdx = computedPages.findIndex((p) => p.chapterNumber === prevChap.chapter_number);
      if (targetIdx >= 0) {
        turnToTargetPage(targetIdx);
        return;
      }
    }
    turnToTargetPage(0);
  };

  const goToNextChapter = () => {
    const activePage = computedPages[currentPage] || computedPages[0];
    const curChap = activePage.chapterNumber;
    const nextChap = chapters.find((c) => c.chapter_number > curChap);
    if (nextChap) {
      const targetIdx = computedPages.findIndex((p) => p.chapterNumber === nextChap.chapter_number);
      if (targetIdx >= 0) {
        turnToTargetPage(targetIdx);
        return;
      }
    }
    turnToTargetPage(computedPages.length - 1);
  };

  const goToChapterByNumber = (chapNum: number) => {
    const targetIdx = computedPages.findIndex((p) => p.chapterNumber === chapNum);
    if (targetIdx >= 0) {
      turnToTargetPage(targetIdx);
    }
  };

  // Quick Direct Page Jump (от 1 до Total)
  const handlePageJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(pageJumpInput, 10);
    if (!isNaN(val) && val >= 1 && val <= computedPages.length) {
      turnToTargetPage(val - 1);
      setIsPageJumpModalOpen(false);
      setPageJumpInput('');
    }
  };

  // Keyboard navigation & Esc key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        goToNextPage();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        goToPrevPage();
      } else if (e.key === 'Escape' && isFullscreen) {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, computedPages.length, isFullscreen]);

  const activePageData = computedPages[currentPage] || computedPages[0];

  const effectiveAudioTracks = useMemo(() => {
    if (audioTracks && audioTracks.length > 0) return audioTracks;
    if (book.audio_tracks && book.audio_tracks.length > 0) return book.audio_tracks;
    return chapters
      .filter((c) => !!c.audio_url)
      .map((c) => ({
        id: `audio_ch_${c.id || c.chapter_number}`,
        title: c.title || `Глава ${c.chapter_number}`,
        url: c.audio_url!,
        chapter_number: c.chapter_number,
      }));
  }, [audioTracks, book.audio_tracks, chapters]);

  const handleBookContainerClick = (e: React.MouseEvent) => {
    const target = (e.target as HTMLElement).closest('[data-action]');
    if (!target) return;
    const action = target.getAttribute('data-action');
    if (action === 'toggle-quick-panel') {
      e.stopPropagation();
      if (hudTimeoutRef.current) clearTimeout(hudTimeoutRef.current);
      setIsHudVisible((prev) => !prev);
    } else if (action === 'toggle-fullscreen') {
      e.stopPropagation();
      toggleFullscreen();
    } else if (action === 'open-settings') {
      e.stopPropagation();
      setIsSettingsModalOpen(true);
    } else if (action === 'open-toc') {
      e.stopPropagation();
      setIsTocOpen(true);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={handleBookContainerClick}
      className={`w-full flex flex-col items-center select-none ${
        isFullscreen
          ? `fixed inset-0 z-[200] w-full h-[100dvh] h-screen ${
              READER_BG_STYLES[settings.bgStyle]?.wrapperClass || 'bg-black text-white'
            } p-0 sm:p-2 flex flex-col justify-stretch items-stretch overflow-hidden`
          : 'relative'
      }`}
    >
      {/* HIDDEN STAGING CONTAINER: React renders all pages here in its virtual DOM completely untouched by PageFlip */}
      <div
        ref={stagingRef}
        style={{
          position: 'absolute',
          left: '-99999px',
          top: '-99999px',
          width: '1000px',
          height: '1400px',
          visibility: 'hidden',
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        {computedPages.map((p, index) => (
          <BookFlipPage
            key={`stage-page-${index}`}
            page={p}
            index={index}
            paddingClass={paddingClass}
            currentSheetBg={currentSheetBg}
            currentSheetText={currentSheetText}
            currentSheetBorder={currentSheetBorder}
            currentHeaderBorder={currentHeaderBorder}
            currentAccentColor={currentAccentColor}
            fontCssFamily={fontConfig.cssFamily}
            activeFontSize={activeFontSize}
            lineSpacingValue={lineSpacingValue}
            customHeader={customHeader}
            book={book}
            settings={settings}
            pageStyleConfig={pageStyleConfig}
            hideFooters={hideFooters}
            leftFooter={leftFooter}
            rightFooter={rightFooter}
            totalPages={computedPages.length}
            isFullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
            onOpenSettings={() => setIsSettingsModalOpen(true)}
          />
        ))}
      </div>

      {/* FLOATING QUICK CONTROL PANEL FOR FULLSCREEN BOOK READING */}
      <ReaderFullscreenHud
        isFullscreen={isFullscreen}
        isHudVisible={isHudVisible}
        currentPage={currentPage}
        totalPages={computedPages.length}
        hasAudioMode={hasAudioMode}
        hasVoiceTracks={effectiveAudioTracks.length > 0}
        isAudioBarOpen={showAudioBar}
        hasMangaMode={hasMangaMode}
        onToggleFullscreen={toggleFullscreen}
        onExitReader={onExitReader}
        onPrevChapter={goToPrevChapter}
        onNextChapter={goToNextChapter}
        onPrevPage={goToPrevPage}
        onNextPage={goToNextPage}
        onOpenPageJump={() => setIsPageJumpModalOpen(true)}
        onOpenToc={() => setIsTocOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onHideHud={() => setIsHudVisible(false)}
        onShowHud={showHudTemporarily}
        onSwitchToAudio={onSwitchToAudio}
        onToggleAudioBar={onToggleAudioBar}
        onSwitchToManga={onSwitchToManga}
      />

      {/* NORMAL MODE TOOLBAR: Full set of controls when not in fullscreen */}
      {!isFullscreen && (
        <div className="w-full flex flex-wrap items-center justify-between gap-2 text-[14px] max-w-6xl xl:max-w-7xl pb-3 px-1">
          <div className="flex flex-wrap items-center gap-2">
            {/* Enter Fullscreen Mode */}
            <button
              type="button"
              onClick={toggleFullscreen}
              className="relative group min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-500 border-2 border-white text-white font-bold text-[14px] shadow-[3px_3px_0px_0px_rgba(255,255,255,0.85)] transition flex items-center justify-center gap-2 cursor-pointer rounded-none"
              title="Погружение в чтение (скрыть меню и шапку)"
            >
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
            </button>

            {/* Table of Contents - Icon only */}
            <button
              type="button"
              onClick={() => setIsTocOpen(true)}
              className="min-h-[40px] min-w-[40px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center justify-center cursor-pointer"
              title="Оглавление"
            >
              <List className="w-4 h-4 text-rose-500" />
            </button>

            {/* Reader Settings Modal */}
            <button
              type="button"
              onClick={() => setIsSettingsModalOpen(true)}
              className="min-h-[40px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Шрифт, размер, стили страниц, фон и колонтитулы"
            >
              <Sliders className="w-4 h-4 text-rose-500" />
              <span className="hidden sm:inline">Настройки</span>
            </button>

            {/* Previous Chapter Jump */}
            <button
              type="button"
              onClick={goToPrevChapter}
              className="min-h-[40px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1 cursor-pointer"
              title="Перейти к предыдущей главе"
            >
              <SkipBack className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden md:inline">Пред. глава</span>
            </button>

            {/* Quick Chapter Selector Dropdown */}
            {chapters.length > 0 && (
              <div className="hidden lg:flex items-center gap-1">
                <label htmlFor="reader-quick-chapter-select" className="sr-only">Глава</label>
                <select
                  id="reader-quick-chapter-select"
                  value={activePageData.chapterNumber || 0}
                  onChange={(e) => goToChapterByNumber(parseInt(e.target.value, 10))}
                  className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 text-white text-[14px] font-bold cursor-pointer max-w-[190px] truncate"
                >
                  <option value={0}>Обложка</option>
                  {chapters.map((c) => (
                    <option key={c.id || c.chapter_number} value={c.chapter_number}>
                      Гл. {c.chapter_number}: {c.title.slice(0, 24)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Next Chapter Jump */}
            <button
              type="button"
              onClick={goToNextChapter}
              className="min-h-[40px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-1 cursor-pointer"
              title="Перейти к следующей главе"
            >
              <span className="hidden md:inline">След. глава</span>
              <SkipForward className="w-3.5 h-3.5 text-rose-500" />
            </button>
          </div>

          {/* Strict Page Indicator and Direct Page Jump Button */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsPageJumpModalOpen(true)}
              className="min-h-[40px] px-3 bg-zinc-950 border border-zinc-700 hover:border-rose-500 text-white font-mono font-bold tracking-widest text-[14px] cursor-pointer flex items-center gap-1.5 transition"
              title="Нажмите для быстрого перехода к любой странице"
            >
              <span className="text-rose-500 font-bold">Стр.</span>
              <span className="text-[15px]">{currentPage + 1}/{computedPages.length}</span>
              <span className="text-[14px] text-zinc-400 underline ml-1 hidden sm:inline">перейти</span>
            </button>

            {/* Cover Jump */}
            <button
              type="button"
              onClick={() => turnToTargetPage(0)}
              className="min-h-[40px] px-3 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-zinc-300 hover:text-black font-bold transition flex items-center gap-1.5 cursor-pointer hidden sm:flex"
              title="Вернуться к началу"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Обложка</span>
            </button>
          </div>
        </div>
      )}

      {/* Synchronized Chapter Audio Bar («Текст + Голос») */}
      {showAudioBar && effectiveAudioTracks.length > 0 && (
        <div
          className={
            isFullscreen
              ? 'fixed bottom-16 left-2 right-2 sm:left-auto sm:right-4 sm:w-[460px] z-[115]'
              : 'w-full max-w-6xl xl:max-w-7xl px-1 mb-2'
          }
        >
          <ReaderAudioBar
            tracks={effectiveAudioTracks}
            bookTitle={book.title}
            bookId={book.id}
            userUid={userUid}
            currentChapterNumber={activePageData.chapterNumber}
            onClose={isFullscreen && onToggleAudioBar ? onToggleAudioBar : undefined}
            onAutoAdvanceChapter={(track) => {
              const idx = track.chapter_number ? computedPages.findIndex((p) => p.chapterNumber === track.chapter_number) : -1;
              if (idx >= 0) turnToTargetPage(idx);
            }}
            onTrackChange={(track) => {
              const idx = track.chapter_number ? computedPages.findIndex((p) => p.chapterNumber === track.chapter_number) : -1;
              if (idx >= 0) turnToTargetPage(idx);
            }}
          />
        </div>
      )}

      {/* StPageFlip Interactive 3D Canvas / DOM Container */}
      <div
        className={`w-full flex items-center justify-center ${
          isFullscreen ? 'flex-1 h-full w-full p-0 m-0 overflow-hidden' : 'py-2 sm:py-5 overflow-hidden px-1'
        }`}
      >
        <div
          ref={bookContainerRef}
          onClick={handleBookContainerClick}
          className={`st-flip-book mx-auto ${isFullscreen && isMobileScreen ? 'w-full h-full' : 'shadow-2xl'}`}
          style={{
            width: isFullscreen && isMobileScreen ? '100%' : `${spreadDimensions.width}px`,
            height: isFullscreen && isMobileScreen ? '100%' : `${spreadDimensions.height}px`,
            maxWidth: '100%',
            maxHeight: '100%',
          }}
        />
      </div>

      {/* Reader Bottom Navigation Bar: ONLY shown in normal mode, NOT in fullscreen */}
      {!isFullscreen && (
        <div className="w-full flex flex-wrap items-center justify-between gap-3 px-2 text-[14px] max-w-6xl xl:max-w-7xl mt-3">
          <div className="flex items-center gap-3">
            <span className="text-zinc-400 hidden lg:inline">
              Тяните за угол или используйте клавиши ← / → для перелистывания страниц.
            </span>
            {/* Mobile quick actions row */}
            <div className="flex sm:hidden items-center gap-1">
              <button
                type="button"
                onClick={goToPrevChapter}
                className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 text-white font-bold text-[14px]"
                title="Предыдущая глава"
              >
                ⏮ Гл.
              </button>
              <button
                type="button"
                onClick={goToNextChapter}
                className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-700 text-white font-bold text-[14px]"
                title="Следующая глава"
              >
                Гл. ⏭
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={goToPrevPage}
              disabled={currentPage === 0}
              className="min-h-[42px] px-4 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Назад</span>
            </button>
            <button
              type="button"
              onClick={goToNextPage}
              disabled={currentPage >= computedPages.length - 1}
              className="min-h-[42px] px-4 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition disabled:opacity-40 cursor-pointer flex items-center gap-1"
            >
              <span>Вперед</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* DIRECT PAGE JUMP MODAL */}
      <DirectPageJumpModal
        isOpen={isPageJumpModalOpen}
        onClose={() => setIsPageJumpModalOpen(false)}
        totalPages={computedPages.length}
        currentPage={currentPage}
        pageJumpInput={pageJumpInput}
        onPageJumpInputChange={setPageJumpInput}
        onSubmit={handlePageJumpSubmit}
        onGoToCover={() => {
          turnToTargetPage(0);
          setIsPageJumpModalOpen(false);
        }}
      />

      {/* DEDICATED SETTINGS MODAL */}
      {isSettingsModalOpen && (
        <ReaderSettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
          settings={settings}
          onChangeSettings={(newS) => {
            if (onSettingsChange) onSettingsChange(newS);
          }}
          onReset={() => {
            if (onResetSettings) onResetSettings();
          }}
          customHeader={customHeader}
          onCustomHeaderChange={setCustomHeader}
          leftFooter={leftFooter}
          onLeftFooterChange={setLeftFooter}
          rightFooter={rightFooter}
          onRightFooterChange={setRightFooter}
          hideFooters={hideFooters}
          onHideFootersChange={setHideFooters}
          bookTitle={book.title}
        />
      )}

      {/* Table of Contents Modal */}
      <TableOfContentsModal
        isOpen={isTocOpen}
        onClose={() => setIsTocOpen(false)}
        chapters={chapters}
        computedPages={computedPages}
        currentPage={currentPage}
        activeChapterNumber={activePageData.chapterNumber || 0}
        onSelectPage={turnToTargetPage}
      />
    </div>
  );
};
