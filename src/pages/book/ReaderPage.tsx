import React, { useState, useMemo, useEffect } from 'react';
import { BookOpen, Download, Headphones, Maximize2, Scroll, Share2 } from 'lucide-react';
import { Book, BookAudioTrack, Chapter, Character, AudioTrack } from '../../types';
import { fetchBookAudioTracks, buildUnifiedAudioPlaylist } from '../../services/voice/bookAudioService';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirStatus } from '../../components/common/NoirStatus';
import { exportBookToPdf } from '../../services/export/pdfBookExport';
import { Book3DFlipViewer } from '../../components/reader/Book3DFlipViewer';
import { AudiobookPlayerView } from '../../components/audiobook/AudiobookPlayerView';
import { MangaComicViewer } from '../../components/manga/MangaComicViewer';
import { PublishPlatformsModal } from '../../components/publishing/PublishPlatformsModal';
import {
  ReaderSettings,
  DEFAULT_READER_SETTINGS,
  READER_BG_STYLES,
} from '../../components/reader/ReaderThemeSelector';

interface ReaderPageProps {
  book: Book;
  chapters: Chapter[];
  characters: Character[];
  userUid?: number;
  initialChapterNumber?: number;
  onOpenExportModal?: () => void;
  onExitReader?: () => void;
  onFullscreenChange?: (isFullscreen: boolean) => void;
}

export const ReaderPage: React.FC<ReaderPageProps> = ({
  book,
  chapters,
  characters,
  userUid,
  initialChapterNumber = 0,
  onOpenExportModal,
  onExitReader,
  onFullscreenChange,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(true);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isPublishPlatformsModalOpen, setIsPublishPlatformsModalOpen] = useState(false);
  const [dbAudioTracks, setDbAudioTracks] = useState<BookAudioTrack[]>([]);
  const [showSyncAudioInText, setShowSyncAudioInText] = useState<boolean>(false);

  // Open in fullscreen and fetch dedicated book_audio_tracks when entering Reader or selecting a book
  useEffect(() => {
    let active = true;
    setIsFullscreen(true);
    fetchBookAudioTracks(book.id)
      .then((list) => {
        if (!active) return;
        setDbAudioTracks(list);
        if (list.length > 0) {
          setShowSyncAudioInText(true);
        }
      })
      .catch(() => {
        if (active) setDbAudioTracks([]);
      });
    return () => {
      active = false;
    };
  }, [book.id]);

  // Notify parent layout so global header/chrome hides in all fullscreen modes
  useEffect(() => {
    onFullscreenChange?.(isFullscreen);
  }, [isFullscreen, onFullscreenChange]);

  useEffect(() => {
    return () => {
      onFullscreenChange?.(false);
    };
  }, [onFullscreenChange]);

  // Persistent Reader Settings (Font size 14-20, 10 fonts, page styles, background styles)
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    try {
      const saved = localStorage.getItem('knigai_reader_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed.fontSize === 'number') {
          return {
            ...DEFAULT_READER_SETTINGS,
            ...parsed,
            fontSize: Math.max(14, parsed.fontSize),
          };
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_READER_SETTINGS;
  });

  const handleSettingsChange = (newSettings: ReaderSettings) => {
    const safeSettings = {
      ...newSettings,
      fontSize: Math.max(14, newSettings.fontSize),
    };
    setSettings(safeSettings);
    try {
      localStorage.setItem('knigai_reader_settings', JSON.stringify(safeSettings));
    } catch {
      // ignore
    }
  };

  const bookChapters = useMemo(
    () => chapters.filter((c) => !c.book_id || Number(c.book_id) === Number(book.id)),
    [chapters, book.id]
  );

  const bookCharacters = useMemo(
    () => characters.filter((c) => !c.book_id || Number(c.book_id) === Number(book.id)),
    [characters, book.id]
  );

  const handleExport = async () => {
    setExportLoading(true);
    setExportError(null);
    try {
      await exportBookToPdf(book, bookChapters, bookCharacters, userUid);
    } catch (e: unknown) {
      setExportError('Ошибка при экспорте книги в PDF: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setExportLoading(false);
    }
  };

  // Audio tracks unified from book_audio_tracks DB + chapter.audio_url + book.audio_tracks
  const allAudioTracks: AudioTrack[] = useMemo(
    () => buildUnifiedAudioPlaylist(dbAudioTracks, book, bookChapters),
    [dbAudioTracks, book, bookChapters]
  );

  // Format detection for manga/webtoons/comics and pure vs combined audiobooks
  const isMangaOrComic = useMemo(() => {
    const fmt = (book.format || '').toLowerCase();
    const cType = (book.content_type || '').toLowerCase();
    const origUrl = (book.original_file_url || '').toLowerCase();
    const genres = (book.genres || []).map((g) => g.toLowerCase());
    return (
      fmt === 'cbz' ||
      fmt === 'cbr' ||
      fmt === 'manga' ||
      fmt === 'comic' ||
      fmt === 'webtoon' ||
      cType === 'manga' ||
      cType === 'comic' ||
      cType === 'webtoon' ||
      origUrl.endsWith('.cbz') ||
      origUrl.endsWith('.cbr') ||
      genres.some(
        (g) =>
          g.includes('манга') ||
          g.includes('комикс') ||
          g.includes('вебтун') ||
          g.includes('manga') ||
          g.includes('comic') ||
          g.includes('webtoon')
      )
    );
  }, [book]);

  const hasSubstantialText = useMemo(
    () =>
      bookChapters.some(
        (c) =>
          Boolean(c.content) &&
          c.content.trim().length > 150 &&
          !c.content.includes('Аудиозапись главы')
      ),
    [bookChapters]
  );

  const isAudiobookOnly = useMemo(() => {
    const fmt = (book.format || '').toLowerCase();
    const cType = (book.content_type || '').toLowerCase();
    const origUrl = (book.original_file_url || '').toLowerCase();
    const genres = (book.genres || []).map((g) => g.toLowerCase());
    const isAudioFmt =
      fmt === 'mp3' ||
      fmt === 'm4a' ||
      fmt === 'm4b' ||
      fmt === 'audiobook' ||
      fmt === 'audio' ||
      cType === 'audiobook' ||
      origUrl.endsWith('.mp3') ||
      origUrl.endsWith('.m4b') ||
      origUrl.endsWith('.m4a') ||
      origUrl.endsWith('.aac') ||
      genres.some((g) => g.includes('аудио') || g.includes('audio'));
    // Hybrid books with real chapter text open in 3D text mode with synchronized voice bar
    return (isAudioFmt || allAudioTracks.length > 0) && !hasSubstantialText && cType !== 'hybrid';
  }, [book, allAudioTracks, hasSubstantialText]);

  const [activeMode, setActiveMode] = useState<'text' | 'audio' | 'manga'>(() => {
    if (isAudiobookOnly) return 'audio';
    if (isMangaOrComic) return 'manga';
    return 'text';
  });

  useEffect(() => {
    if (isAudiobookOnly) {
      setActiveMode('audio');
    } else if (isMangaOrComic) {
      setActiveMode('manga');
    } else {
      setActiveMode('text');
      setShowSyncAudioInText(allAudioTracks.length > 0);
    }
  }, [book.id, isAudiobookOnly, isMangaOrComic, allAudioTracks.length]);

  const hasAudioMode = allAudioTracks.length > 0 || isAudiobookOnly || bookChapters.length > 0;
  const hasMangaMode = isMangaOrComic || bookChapters.some((c) => !!c.illustration_url) || Boolean(book.cover_config?.frontImageUrl);

  const initialAudioTrackIndex = useMemo(() => {
    if (!initialChapterNumber || allAudioTracks.length === 0) return 0;
    const found = allAudioTracks.findIndex((t) => t.chapter_number === initialChapterNumber);
    return found >= 0 ? found : 0;
  }, [initialChapterNumber, allAudioTracks]);

  return (
    <div
      className={
        isFullscreen
          ? "w-full text-white font-['PT_Serif',serif]"
          : "w-full flex flex-col gap-4 text-white font-['PT_Serif',serif] max-w-7xl mx-auto pb-24 lg:pb-8"
      }
    >
      {/* Top Toolbar (Visible when minimized from fullscreen) */}
      {!isFullscreen && (
        <div className="noir-container p-3.5 sm:p-4 border border-zinc-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-white text-black flex items-center justify-center font-bold shrink-0">
              {activeMode === 'audio' ? (
                <Headphones className="w-5 h-5 text-black" />
              ) : activeMode === 'manga' ? (
                <Scroll className="w-5 h-5 text-black" />
              ) : (
                <BookOpen className="w-5 h-5 text-black" />
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-white truncate">
                {book.title}
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[14px] text-zinc-400">Формат:</span>
                <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-rose-400 font-mono text-[14px] font-bold">
                  {book.format || (isMangaOrComic ? 'CBZ/Манга' : isAudiobookOnly ? 'MP3/Аудио' : 'FB2/Текст')}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Format / Mode Switcher Buttons (wrap nicely on mobile) */}
            <div className="flex flex-wrap items-center gap-1 bg-zinc-900 border border-zinc-700 p-0.5">
              <button
                type="button"
                onClick={() => {
                  setActiveMode('text');
                  setShowSyncAudioInText(false);
                }}
                className={`min-h-[38px] px-3 py-1 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  activeMode === 'text' && !showSyncAudioInText
                    ? 'bg-white text-black'
                    : 'text-zinc-300 hover:text-white'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Книга</span>
              </button>

              {allAudioTracks.length > 0 && hasSubstantialText && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMode('text');
                    setShowSyncAudioInText(true);
                  }}
                  className={`min-h-[38px] px-3 py-1 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeMode === 'text' && showSyncAudioInText
                      ? 'bg-rose-600 text-white'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Headphones className="w-4 h-4" />
                  <span>Текст + Голос</span>
                </button>
              )}

              {hasAudioMode && (
                <button
                  type="button"
                  onClick={() => setActiveMode('audio')}
                  className={`min-h-[38px] px-3 py-1 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeMode === 'audio'
                      ? 'bg-rose-600 text-white'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Headphones className="w-4 h-4" />
                  <span>Аудиоплеер</span>
                </button>
              )}

              {hasMangaMode && (
                <button
                  type="button"
                  onClick={() => setActiveMode('manga')}
                  className={`min-h-[38px] px-3 py-1 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    activeMode === 'manga'
                      ? 'bg-rose-600 text-white'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <Scroll className="w-4 h-4" />
                  <span>Манга</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              className="relative group w-full sm:w-auto min-h-[44px] px-4 py-2 bg-rose-600 hover:bg-rose-500 border-2 border-white text-white font-bold text-[14px] shadow-[3px_3px_0px_0px_rgba(255,255,255,0.85)] transition flex items-center justify-center gap-2 cursor-pointer rounded-none"
              title="Развернуть на весь экран"
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

            <button
              type="button"
              onClick={() => setIsPublishPlatformsModalOpen(true)}
              className="min-h-[40px] px-3.5 bg-zinc-950 hover:bg-zinc-900 border border-rose-500 hover:border-white text-rose-400 font-bold text-[14px] transition flex items-center gap-1.5 cursor-pointer"
              title="Опубликовать в Флибусту, Самиздат, Либрусек и Яндекс Книги"
            >
              <Share2 className="w-4 h-4 text-rose-500" />
              <span>Выложить на платформы</span>
            </button>

            {onOpenExportModal && (
              <NoirButton
                variant="outline"
                onClick={onOpenExportModal}
                icon={<Download className="w-4 h-4 text-white" />}
              >
                Файлы для типографии
              </NoirButton>
            )}
            <NoirButton
              variant="primary"
              onClick={handleExport}
              loading={exportLoading}
              icon={<Download className="w-4 h-4 text-black" />}
            >
              {exportLoading ? 'Сборка PDF...' : 'Скачать блок (PDF)'}
            </NoirButton>
          </div>
        </div>
      )}

      {exportError && <NoirStatus type="error" message={exportError} />}

      {/* RENDER VIEWER ACCORDING TO FORMAT AND MODE */}
      {activeMode === 'audio' ? (
        <AudiobookPlayerView
          key={book.id}
          book={book}
          chapters={bookChapters}
          tracks={allAudioTracks}
          initialTrackIndex={initialAudioTrackIndex}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((p) => !p)}
          onExitReader={onExitReader}
          onSwitchToTextReader={() => setActiveMode('text')}
          onSwitchToMangaReader={() => setActiveMode('manga')}
          hasMangaMode={hasMangaMode}
          userUid={userUid}
        />
      ) : activeMode === 'manga' ? (
        <MangaComicViewer
          key={book.id}
          book={book}
          chapters={bookChapters}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen((p) => !p)}
          onExitReader={onExitReader}
          onSwitchToTextReader={() => setActiveMode('text')}
          onSwitchToAudioReader={() => setActiveMode('audio')}
          hasAudioMode={hasAudioMode}
          userUid={userUid}
        />
      ) : (
        <div
          className={`w-full flex justify-center py-2 sm:py-4 px-0 sm:px-1 transition-all ${
            READER_BG_STYLES[settings.bgStyle]?.wrapperClass || 'bg-black text-white'
          }`}
        >
          <Book3DFlipViewer
            key={book.id}
            book={book}
            chapters={bookChapters}
            fontSize={settings.fontSize}
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onResetSettings={() => handleSettingsChange(DEFAULT_READER_SETTINGS)}
            initialChapterIndex={initialChapterNumber}
            userUid={userUid}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((p) => !p)}
            onExitReader={onExitReader}
            onSwitchToAudio={() => setActiveMode('audio')}
            onSwitchToManga={() => setActiveMode('manga')}
            hasAudioMode={hasAudioMode}
            hasMangaMode={hasMangaMode}
            audioTracks={allAudioTracks}
            showAudioBar={showSyncAudioInText}
            onToggleAudioBar={() => setShowSyncAudioInText((prev) => !prev)}
          />
        </div>
      )}

      {/* Publish to External Platforms Modal */}
      <PublishPlatformsModal
        isOpen={isPublishPlatformsModalOpen}
        onClose={() => setIsPublishPlatformsModalOpen(false)}
        book={book}
        chapters={bookChapters}
      />
    </div>
  );
};
