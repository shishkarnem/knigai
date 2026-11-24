import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Palette,
  Layers,
  Globe,
  Copy,
  Check,
  Lock,
  HardDrive,
  UploadCloud,
  Wifi,
  WifiOff,
  User,
  Headphones,
  Search,
  X,
} from 'lucide-react';
import { Book, Chapter, Character, WorldEntity, AppRoute, AppUser } from '../../types';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirModal } from '../../components/common/NoirModal';
import {
  deleteBook,
  updateBook,
  generateSlug,
  fetchChapters,
  fetchCharacters,
  fetchWorldEntities,
} from '../../services/db/bookRepository';
import { BasicPlotBadge } from '../../components/plots/BasicPlotBadge';
import { BASIC_PLOTS } from '../../constants/basicPlots';
import {
  isBookCachedLocally,
  saveBookToDeviceCache,
  removeBookFromDeviceCache,
  getCachedBookBundle,
  getAllCachedBooks,
  getOfflineStorageStats,
} from '../../services/storage/offlineCache';
import { ImportBookModal } from '../../components/book/ImportBookModal';
import { BookParserModal } from '../../components/parser/BookParserModal';
import { PublishPlatformsModal } from '../../components/publishing/PublishPlatformsModal';
import { RemixBookModal } from '../../components/book/RemixBookModal';
import { BookDetailsModal } from '../../components/book/details/BookDetailsModal';
import { BookReworkModal } from '../../components/book/remake/BookReworkModal';
import { BookSequelModal } from '../../components/book/remake/BookSequelModal';
import { LibraryBookActions } from '../../components/book/LibraryBookActions';
import { BookHeadersEditModal } from '../../components/book/details/BookHeadersEditModal';
import { getBookPermissions } from '../../services/book/bookPermissions';

interface LibraryPageProps {
  books: Book[];
  activeBook: Book | null;
  currentUser: AppUser | null;
  onSelectBook: (book: Book) => void;
  onBooksChanged: (books: Book[]) => void;
  onRefreshBooks?: () => void;
  onNavigate: (route: AppRoute) => void;
  onNavigateToReader?: (chapterNumber?: number) => void;
  onOpenNewBookModal: () => void;
  onOpenAuth?: () => void;
}

type LibraryTab = 'community' | 'my' | 'offline' | 'published' | 'drafts';

export const LibraryPage: React.FC<LibraryPageProps> = ({
  books,
  activeBook,
  currentUser,
  onSelectBook,
  onBooksChanged,
  onRefreshBooks,
  onNavigate,
  onNavigateToReader,
  onOpenNewBookModal,
  onOpenAuth,
}) => {
  // If user is not logged in, default to community published books
  const [activeTab, setActiveTab] = useState<LibraryTab>(() => (currentUser ? 'my' : 'community'));
  const [headersEditBook, setHeadersEditBook] = useState<Book | null>(null);

  useEffect(() => {
    onRefreshBooks?.();
  }, [currentUser?.uid]);
  const [filterGenre, setFilterGenre] = useState('all');
  const [filterPlot, setFilterPlot] = useState('all');
  const [onlyWithAudio, setOnlyWithAudio] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Offline caching state
  const [cachedIds, setCachedIds] = useState<number[]>([]);
  const [cachingBookId, setCachingBookId] = useState<number | null>(null);
  const [cacheStats, setCacheStats] = useState({ count: 0, approxMb: '0.00' });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isParserModalOpen, setIsParserModalOpen] = useState(false);
  const [publishingBook, setPublishingBook] = useState<Book | null>(null);
  const [publishingChapters, setPublishingChapters] = useState<Chapter[]>([]);
  const [bookToDelete, setBookToDelete] = useState<Book | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [remixTargetBook, setRemixTargetBook] = useState<Book | null>(null);
  const [detailsBook, setDetailsBook] = useState<Book | null>(null);
  const [sequelTargetBook, setSequelTargetBook] = useState<Book | null>(null);
  const [reworkBundle, setReworkBundle] = useState<{
    book: Book;
    chapters: Chapter[];
    characters: Character[];
    entities: WorldEntity[];
  } | null>(null);

  const handleOpenRework = async (target: Book) => {
    if (!currentUser && onOpenAuth) {
      onOpenAuth();
      return;
    }
    const uid = target.user_uid || currentUser?.uid;
    const [chaps, chars, ents] = await Promise.all([
      fetchChapters(target.id, uid).catch(() => []),
      fetchCharacters(target.id, uid).catch(() => []),
      fetchWorldEntities(target.id, undefined, uid).catch(() => []),
    ]);
    setReworkBundle({ book: target, chapters: chaps, characters: chars, entities: ents });
  };

  const handleOpenPublishModal = async (book: Book) => {
    setPublishingBook(book);
    try {
      const chaps = await fetchChapters(book.id);
      setPublishingChapters(chaps);
    } catch {
      setPublishingChapters([]);
    }
  };

  // Sync cached status on mount and changes
  const refreshCacheStatus = () => {
    const cachedBooks = getAllCachedBooks();
    setCachedIds(cachedBooks.map((b) => b.id));
    setCacheStats(getOfflineStorageStats());
  };

  useEffect(() => {
    refreshCacheStatus();
  }, [books]);

  // Handle caching a book to device
  const handleCacheBook = async (book: Book) => {
    setCachingBookId(book.id);
    try {
      await saveBookToDeviceCache(book);
      refreshCacheStatus();
    } catch (err) {
      console.error('Failed to cache book:', err);
    } finally {
      setCachingBookId(null);
    }
  };

  // Handle removing a book from device cache
  const handleRemoveFromCache = (bookId: number) => {
    removeBookFromDeviceCache(bookId);
    refreshCacheStatus();
  };

  // Handle reading from device cache
  const handleReadFromCache = (book: Book) => {
    const bundle = getCachedBookBundle(book.id);
    if (bundle && bundle.book) {
      onSelectBook(bundle.book);
      onNavigate('reader');
    } else {
      // Fallback
      onSelectBook(book);
      onNavigate('reader');
    }
  };

  // Handle reading online
  const handleReadOnline = (book: Book, chapterNumber = 0) => {
    onSelectBook(book);
    if (onNavigateToReader) onNavigateToReader(chapterNumber);
    else onNavigate('reader');
  };

  const handleDeleteRequest = (book: Book) => {
    setBookToDelete(book);
  };

  const confirmDeleteBook = async () => {
    if (!bookToDelete) return;
    const bookId = bookToDelete.id;
    setDeleteLoading(true);
    try {
      await deleteBook(bookId);
      removeBookFromDeviceCache(bookId);
      const updated = books.filter((b) => b.id !== bookId);
      onBooksChanged(updated);
      refreshCacheStatus();
      if (activeBook?.id === bookId && updated.length > 0) {
        onSelectBook(updated[0]);
      }
    } catch (err) {
      console.error('Error deleting book:', err);
    } finally {
      setDeleteLoading(false);
      setBookToDelete(null);
    }
  };

  const handleTogglePublish = async (book: Book) => {
    const isNowPublished = !book.is_published;
    const slug = book.slug || generateSlug(book.title);
    const updated: Book = {
      ...book,
      is_published: isNowPublished,
      slug,
      status: isNowPublished ? 'completed' : 'draft',
    };
    await updateBook(updated);
    const nextList = books.map((b) => (b.id === book.id ? updated : b));
    onBooksChanged(nextList);
    if (activeBook?.id === book.id) {
      onSelectBook(updated);
    }
  };

  const handleCopyLink = (book: Book) => {
    const slug = book.slug || generateSlug(book.title);
    const fullUrl = `${window.location.origin}/read/${slug}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  // When a new book is imported from files
  const handleBookImported = (newBook: Book, chapters: Chapter[]) => {
    const updatedList = [newBook, ...books.filter((b) => b.id !== newBook.id)];
    onBooksChanged(updatedList);
    onSelectBook(newBook);
    refreshCacheStatus();
  };

  const allGenres = Array.from(new Set(books.flatMap((b) => b.genres || [])));

  // Source books list depending on activeTab (pulling directly from offline cache if activeTab is offline)
  let sourceBooks = books;
  if (activeTab === 'offline') {
    const offlineBooks = getAllCachedBooks();
    const map = new Map<number, Book>();
    offlineBooks.forEach((b) => map.set(b.id, b));
    books.filter((b) => cachedIds.includes(b.id)).forEach((b) => {
      if (!map.has(b.id)) map.set(b.id, b);
    });
    sourceBooks = Array.from(map.values());
  }

  // Filter books based on active tab
  const currentUidNum = currentUser?.uid != null ? Number(currentUser.uid) : null;
  const filteredBooks = sourceBooks.filter((b) => {
    const bookUidNum = b.user_uid != null ? Number(b.user_uid) : null;
    if (activeTab === 'community') {
      // All published books created by everyone or demo/shared books
      if (!b.is_published && bookUidNum) return false;
    } else if (activeTab === 'my') {
      // Books authored by the current user or guest's local books
      if (currentUidNum && bookUidNum && bookUidNum !== currentUidNum) return false;
      if (!currentUidNum && bookUidNum) return false;
    } else if (activeTab === 'offline') {
      // Books cached on this device
      if (!cachedIds.includes(Number(b.id))) return false;
    } else if (activeTab === 'published') {
      if (!b.is_published && bookUidNum) return false;
      if (currentUidNum && bookUidNum && bookUidNum !== currentUidNum) return false;
    } else if (activeTab === 'drafts') {
      if (b.is_published) return false;
      if (currentUidNum && bookUidNum && bookUidNum !== currentUidNum) return false;
    }

    if (filterGenre !== 'all' && (!b.genres || !b.genres.includes(filterGenre))) return false;
    if (filterPlot !== 'all' && (!b.basic_plots || !b.basic_plots.includes(filterPlot))) return false;
    const bookHasAnyAudio = Boolean(
      b.has_voice_tracks ||
        (b.voice_tracks_count && b.voice_tracks_count > 0) ||
        (b.audio_tracks && b.audio_tracks.length > 0) ||
        b.genres?.includes('Аудиокнига')
    );
    if (onlyWithAudio && !bookHasAnyAudio) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const haystack = [
        b.title,
        b.subtitle,
        b.author,
        b.synopsis_overview,
        b.series_name,
        b.format,
        ...(b.genres || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const communityPublishedCount = books.filter((b) => b.is_published || !b.user_uid).length;
  const myBooksCount = currentUidNum
    ? books.filter((b) => !b.user_uid || Number(b.user_uid) === currentUidNum).length
    : books.filter((b) => !b.user_uid).length;

  return (
    <div className="w-full flex flex-col gap-6 text-white font-['PT_Serif',serif]">
      {/* Top Header Banner */}
      <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="inline-flex items-center gap-2 text-rose-500 font-mono text-[14px]">
            <BookOpen className="w-4 h-4" />
            <span>{currentUser ? 'Библиотека книг и офлайн-кэш' : 'Общая библиотека опубликованных книг'}</span>
          </div>
          <h2 className="text-[20px] sm:text-[24px] font-bold text-white tracking-tight">
            {currentUser
              ? 'Библиотека произведений, рукописей и кэш'
              : 'Общая библиотека всех опубликованных книг'}
          </h2>
          <p className="text-[14px] text-zinc-300 leading-relaxed max-w-2xl">
            Читайте книги авторов по сети в читалке или загружайте их прямо в локальный кэш устройства для мгновенного чтения без интернета.
          </p>
        </div>

        {/* Action Buttons: Import, Online Parser & Create */}
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setIsParserModalOpen(true)}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2.5 bg-black hover:bg-zinc-900 border-2 border-white text-white font-bold text-[14px] transition-colors cursor-pointer flex items-center justify-center gap-2"
            title="Поиск книг и аудиокниг по каталогам Флибусты, Самиздата, Либрусека, Яндекс Книг и OPDS"
          >
            <Globe className="w-4 h-4 text-rose-500" />
            <span>Онлайн-поиск и аудиокниги</span>
          </button>

          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2.5 bg-black hover:bg-zinc-900 border-2 border-rose-600 text-white font-bold text-[14px] transition-colors cursor-pointer flex items-center justify-center gap-2"
          >
            <UploadCloud className="w-4 h-4 text-rose-500" />
            <span>Добавить свои файлы (PNG, EPUB, FB2, PDF, TXT)</span>
          </button>

          <NoirButton
            variant="primary"
            onClick={currentUser ? onOpenNewBookModal : () => (onOpenAuth ? onOpenAuth() : onOpenNewBookModal())}
            icon={<Plus className="w-4 h-4 text-black" />}
            className="flex-1 sm:flex-initial text-[14px] font-bold"
          >
            Создать новую книгу
          </NoirButton>
        </div>
      </div>

      {/* Offline Storage Status Bar */}
      <div className="p-3 bg-zinc-950/80 border border-zinc-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-[14px]">
        <div className="flex items-center gap-2.5">
          <HardDrive className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="text-zinc-300">
            Кэш устройства для офлайн-чтения:{' '}
            <strong className="text-white font-mono">{cacheStats.count}</strong> книг(и) ({cacheStats.approxMb} МБ).
          </span>
        </div>

        <div className="flex items-center gap-2 text-zinc-400 font-mono text-[14px]">
          <span className="flex items-center gap-1">
            <Wifi className="w-3.5 h-3.5 text-zinc-300" />
            <span>По сети</span>
          </span>
          <span className="text-zinc-600">/</span>
          <span className="flex items-center gap-1 text-rose-400">
            <WifiOff className="w-3.5 h-3.5 text-rose-400" />
            <span>Офлайн из кэша</span>
          </span>
        </div>
      </div>

      {/* Tabs Row: Vertical wrap on mobile, no horizontal scroll */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Community Tab (Always available) */}
          <button
            type="button"
            onClick={() => setActiveTab('community')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'community'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Globe className="w-4 h-4 text-rose-600" />
            <span>Общая библиотека ({communityPublishedCount})</span>
          </button>

          {/* Author's Personal Books (if registered) */}
          {currentUser && (
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={`min-h-[44px] px-4 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'my'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Мои книги ({myBooksCount})</span>
            </button>
          )}

          {/* Device Cache / Offline Tab */}
          <button
            type="button"
            onClick={() => setActiveTab('offline')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'offline'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4 text-rose-500" />
            <span>Кэш на устройстве ({cachedIds.length})</span>
          </button>

          {/* Published / Drafts tabs for author (visible on mobile & desktop without horizontal scroll) */}
          {currentUser && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('published')}
                className={`min-h-[44px] px-3 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'published'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                <span>Опубликованные</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('drafts')}
                className={`min-h-[44px] px-3 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
                  activeTab === 'drafts'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-rose-500" />
                <span>Черновики</span>
              </button>
            </>
          )}
        </div>

        {/* Filters: Search, Genre and Basic Plot */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial min-w-[220px] sm:w-64">
            <Search className="w-4 h-4 text-rose-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по библиотеке..."
              aria-label="Поиск по библиотеке"
              className="w-full min-h-[44px] pl-9 pr-9 noir-input text-[14px] bg-zinc-950"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Очистить поиск"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {allGenres.length > 0 && (
            <div className="flex items-center gap-1.5">
              <label htmlFor="library-genre-filter" className="text-[14px] text-zinc-400 shrink-0">
                Жанр:
              </label>
              <select
                id="library-genre-filter"
                value={filterGenre}
                onChange={(e) => setFilterGenre(e.target.value)}
                className="min-h-[44px] px-3 noir-input text-[14px] font-bold bg-zinc-950"
              >
                <option value="all">Все жанры</option>
                {allGenres.map((g) => (
                  <option key={g} value={g} className="bg-zinc-900 text-white">
                    {g}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <label htmlFor="library-plot-filter" className="text-[14px] text-zinc-400 shrink-0">
              Сюжет:
            </label>
            <select
              id="library-plot-filter"
              value={filterPlot}
              onChange={(e) => setFilterPlot(e.target.value)}
              className="min-h-[44px] px-3 noir-input text-[14px] font-bold bg-zinc-950"
            >
              <option value="all">Все сюжеты</option>
              {BASIC_PLOTS.map((p) => (
                <option key={p.id} value={p.id} className="bg-zinc-900 text-white">
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setOnlyWithAudio((v) => !v)}
            className={`min-h-[44px] px-3 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 ${
              onlyWithAudio
                ? 'bg-rose-600 border-white text-white'
                : 'bg-zinc-950 border-zinc-700 text-zinc-300 hover:border-white hover:text-white'
            }`}
            title="Показать только комбинированные книги с озвучкой и аудиокниги"
          >
            <Headphones className="w-4 h-4 shrink-0" />
            <span>С озвучкой</span>
          </button>
        </div>
      </div>

      {/* Books Grid */}
      {filteredBooks.length === 0 ? (
        <div className="noir-container p-12 text-center text-zinc-400 border border-zinc-800 flex flex-col items-center justify-center gap-3">
          <BookOpen className="w-12 h-12 text-zinc-600" />
          <p className="text-[16px] font-bold text-white">
            {activeTab === 'offline'
              ? 'В локальном кэше устройства пока нет сохраненных книг'
              : 'Книг в выбранной категории не найдено'}
          </p>
          <p className="text-[14px] text-zinc-400 max-w-md">
            {activeTab === 'offline'
              ? 'Перейдите в общую библиотеку и нажмите кнопку «Загрузить в кэш», чтобы читать книги без подключения к интернету.'
              : 'Вы можете добавить книгу из готового файла (PNG, EPUB, FB2, PDF, TXT) или создать новую книгу в конструкторе.'}
          </p>
          <div className="pt-2 flex flex-wrap gap-2 justify-center">
            {(searchQuery || filterGenre !== 'all' || filterPlot !== 'all' || onlyWithAudio) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilterGenre('all');
                  setFilterPlot('all');
                  setOnlyWithAudio(false);
                }}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[14px] transition-colors cursor-pointer"
              >
                Сбросить поиск и фильтры
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="px-4 py-2.5 bg-white text-black font-bold text-[14px] hover:bg-zinc-200 transition-colors cursor-pointer"
            >
              Импортировать книгу
            </button>
            {activeTab === 'offline' && (
              <button
                type="button"
                onClick={() => setActiveTab('community')}
                className="px-4 py-2.5 bg-zinc-900 border border-zinc-700 text-white font-bold text-[14px] hover:border-white transition-colors cursor-pointer"
              >
                Открыть общую библиотеку
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map((b) => {
            const isActive = activeBook?.id === b.id;
            const isCached = cachedIds.includes(b.id);
            const isCachingThis = cachingBookId === b.id;
            const coverImg = b.cover_config?.frontImageUrl;
            const slug = b.slug || generateSlug(b.title);
            const isCopied = copiedSlug === slug;
            const perms = getBookPermissions(b, currentUser);
            const hasVoiceTracks = Boolean(
              b.has_voice_tracks || (b.voice_tracks_count && b.voice_tracks_count > 0)
            );
            const isPureAudioBook = Boolean(
              b.content_type === 'audiobook' ||
                (b.genres?.includes('Аудиокнига') && !hasVoiceTracks) ||
                ((b.audio_tracks && b.audio_tracks.length > 0) && !hasVoiceTracks && !b.synopsis_overview)
            );
            const isAudioBook = isPureAudioBook || Boolean(b.audio_tracks && b.audio_tracks.length > 0 && !hasVoiceTracks);
            const voiceTrackTotal = b.voice_tracks_count || b.audio_tracks?.length || 1;

            return (
              <div
                key={b.id}
                className={`noir-container p-4 border transition-all flex flex-col justify-between gap-4 ${
                  isActive ? 'border-white ring-1 ring-white/60 bg-zinc-950' : 'border-zinc-700 hover:border-zinc-400'
                }`}
              >
                <div className="flex gap-4 items-start">
                  {/* Vertical A5 Thumbnail */}
                  <div className="w-24 sm:w-28 aspect-[148/210] bg-zinc-900 border border-zinc-700 relative overflow-hidden shrink-0 flex items-center justify-center">
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt={b.title}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="p-2 text-center flex flex-col items-center justify-center text-zinc-600">
                        {isAudioBook || hasVoiceTracks ? <Headphones className="w-6 h-6 mb-1 text-rose-500" /> : <Palette className="w-6 h-6 mb-1 text-zinc-500" />}
                        <span className="text-[14px] font-mono">{isAudioBook ? 'Аудио' : hasVoiceTracks ? 'Голос' : 'А5 обложка'}</span>
                      </div>
                    )}

                    {/* Cached badge on thumbnail */}
                    {isCached && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-black/90 border border-rose-500 text-rose-400 text-[14px] font-mono flex items-center gap-0.5">
                        <HardDrive className="w-3 h-3" />
                        <span>Кэш</span>
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 text-[14px] font-bold border ${
                          b.is_published
                            ? 'bg-zinc-900 border-white text-white'
                            : 'bg-zinc-950 border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {b.is_published ? 'опубликована' : 'черновик'}
                      </span>

                      {hasVoiceTracks && !isPureAudioBook ? (
                        <span className="px-2 py-0.5 text-[14px] font-mono border border-rose-500 bg-black text-rose-400 flex items-center gap-1 font-bold">
                          <Headphones className="w-3 h-3 text-rose-500" />
                          <span>Текст + Голос ({voiceTrackTotal})</span>
                        </span>
                      ) : isAudioBook ? (
                        <span className="px-2 py-0.5 text-[14px] font-mono border border-rose-500 bg-black text-rose-400 flex items-center gap-1 font-bold">
                          <Headphones className="w-3 h-3 text-rose-500" />
                          <span>Аудио ({b.audio_tracks?.length || b.target_chapters || 1} глав)</span>
                        </span>
                      ) : null}

                      {isCached && (
                        <span className="px-2 py-0.5 text-[14px] font-mono border border-rose-500 bg-rose-950/60 text-rose-300">
                          офлайн доступ
                        </span>
                      )}
                    </div>

                    <h3 className="text-[17px] font-bold text-white leading-tight break-words mt-1.5">
                      {b.title}
                    </h3>
                    <p className="text-[14px] text-zinc-400 mt-1">
                      {b.author || 'Автор KnigAI'}
                    </p>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {b.genres?.slice(0, 3).map((g, idx) => (
                        <span key={idx} className="px-2 py-0.5 bg-zinc-900 text-zinc-300 text-[14px] border border-zinc-800">
                          {g}
                        </span>
                      ))}
                    </div>

                    {b.basic_plots && b.basic_plots.length > 0 && (
                      <div className="mt-2">
                        <BasicPlotBadge plotIds={b.basic_plots} size="sm" />
                      </div>
                    )}

                    {b.series_name && (
                      <div className="mt-1.5 text-[14px] font-mono text-rose-400">
                        Серия: {b.series_name}{b.series_order ? ` #${b.series_order}` : ''}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2 text-[14px] text-zinc-400 font-mono">
                      <Layers className="w-3.5 h-3.5 text-zinc-400" />
                      <span>{b.target_chapters || 100} глав</span>
                    </div>
                  </div>
                </div>

                {b.synopsis_overview ? (
                  <button
                    type="button"
                    onClick={() => setDetailsBook(b)}
                    className="text-left text-[14px] text-zinc-300 hover:text-white leading-relaxed line-clamp-2 font-serif cursor-pointer transition-colors"
                    title="Нажмите, чтобы прочитать полное описание книги и паспорт"
                  >
                    {b.synopsis_overview}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setDetailsBook(b)}
                    className="text-left text-[14px] text-rose-400 hover:text-white underline font-serif cursor-pointer"
                  >
                    Открыть паспорт и описание книги →
                  </button>
                )}

                {/* Published Link Box */}
                {b.is_published && (
                  <div className="p-2.5 bg-zinc-950 border border-zinc-800 flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-[14px] text-zinc-400 block font-mono">Ссылка для читателей:</span>
                      <span className="text-[14px] font-mono text-zinc-200 truncate block">
                        /read/{slug}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(b)}
                      className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-white text-[14px] font-bold border border-zinc-700 transition flex items-center gap-1 cursor-pointer shrink-0"
                      title="Скопировать ссылку на чтение"
                    >
                      {isCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{isCopied ? 'Скопировано' : 'Копия'}</span>
                    </button>
                  </div>
                )}

                <LibraryBookActions
                  book={b}
                  isAudioBook={isAudioBook}
                  isCached={isCached}
                  isCachingThis={isCachingThis}
                  permissions={perms}
                  onReadOnline={() => handleReadOnline(b)}
                  onReadFromCache={() => handleReadFromCache(b)}
                  onCacheBook={() => handleCacheBook(b)}
                  onRemoveFromCache={() => handleRemoveFromCache(b.id)}
                  onOpenPublish={() => handleOpenPublishModal(b)}
                  onOpenRemix={() => {
                    if (!currentUser && onOpenAuth) onOpenAuth();
                    else setRemixTargetBook(b);
                  }}
                  onOpenConstructor={() => {
                    onSelectBook(b);
                    onNavigate('constructor');
                  }}
                  onOpenHeadersEdit={() => setHeadersEditBook(b)}
                  onOpenDetails={() => setDetailsBook(b)}
                  onOpenSequel={() => {
                    if (!currentUser && onOpenAuth) onOpenAuth();
                    else setSequelTargetBook(b);
                  }}
                  onOpenCover={() => {
                    onSelectBook(b);
                    onNavigate('cover');
                  }}
                  onTogglePublish={() => handleTogglePublish(b)}
                  onDeleteRequest={() => handleDeleteRequest(b)}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Import Book Modal (PNG, EPUB, FB2, PDF, TXT) */}
      <ImportBookModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        currentUser={currentUser}
        onBookImported={handleBookImported}
      />

      {/* Online Book & Audiobook Parser Modal (OPDS, Anna's Archive, LibriVox) */}
      <BookParserModal
        isOpen={isParserModalOpen}
        onClose={() => setIsParserModalOpen(false)}
        currentUser={currentUser}
        onBookImported={handleBookImported}
        existingBooks={books}
        onOpenBookInReader={(book) => {
          onSelectBook(book);
          onNavigate('reader');
        }}
        onNavigateToCover={(book) => {
          onSelectBook(book);
          onNavigate('cover');
        }}
      />

      {/* Delete Confirmation Modal */}
      {bookToDelete && (
        <NoirModal
          isOpen={Boolean(bookToDelete)}
          onClose={() => setBookToDelete(null)}
          title="Удаление произведения"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Вы действительно хотите удалить книгу <strong className="text-white">«{bookToDelete.title}»</strong> и все её главы?
            </p>
            <p className="text-[14px] text-zinc-400 font-mono">
              Книга будет удалена из базы данных и локального кэша устройства.
            </p>
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
              <NoirButton
                variant="outline"
                onClick={() => setBookToDelete(null)}
                disabled={deleteLoading}
              >
                Отмена
              </NoirButton>
              <button
                type="button"
                onClick={confirmDeleteBook}
                disabled={deleteLoading}
                className="min-h-[44px] px-5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[14px] transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <>
                    <HardDrive className="w-4 h-4 text-white animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <span>Да, удалить</span>
                )}
              </button>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Publishing to External Platforms Modal */}
      {publishingBook && (
        <PublishPlatformsModal
          isOpen={Boolean(publishingBook)}
          onClose={() => setPublishingBook(null)}
          book={publishingBook}
          chapters={publishingChapters}
        />
      )}

      {/* Remix / Fanfic Clone Modal */}
      {remixTargetBook && (
        <RemixBookModal
          isOpen={Boolean(remixTargetBook)}
          onClose={() => setRemixTargetBook(null)}
          sourceBook={remixTargetBook}
          currentUser={currentUser}
          onRemixCreated={(cloned) => {
            onBooksChanged([cloned.book, ...books]);
            onSelectBook(cloned.book);
            onNavigate('constructor');
          }}
        />
      )}

      {/* Centered Noir Book Details Modal */}
      {detailsBook && (
        <BookDetailsModal
          isOpen={Boolean(detailsBook)}
          onClose={() => setDetailsBook(null)}
          book={detailsBook}
          userUid={currentUser?.uid}
          onReadBook={(target, chapNum) => handleReadOnline(target, chapNum || 0)}
          onOpenRework={(target) => handleOpenRework(target)}
          onOpenSequel={(target) => {
            if (!currentUser && onOpenAuth) onOpenAuth();
            else setSequelTargetBook(target);
          }}
          onSelectRelatedBook={(relBook) => setDetailsBook(relBook)}
        />
      )}

      {/* Book Polish / Remake Modal */}
      {reworkBundle && (
        <BookReworkModal
          isOpen={Boolean(reworkBundle)}
          onClose={() => setReworkBundle(null)}
          book={reworkBundle.book}
          chapters={reworkBundle.chapters}
          characters={reworkBundle.characters}
          worldEntities={reworkBundle.entities}
          userUid={currentUser?.uid}
          onBookUpdated={(updBook) => {
            onBooksChanged(books.map((x) => (x.id === updBook.id ? updBook : x)));
            setReworkBundle((prev) => (prev ? { ...prev, book: updBook } : null));
          }}
          onChaptersUpdated={(updChaps) => {
            setReworkBundle((prev) => (prev ? { ...prev, chapters: updChaps } : null));
          }}
          onBookBranched={(newBook) => {
            onBooksChanged([newBook, ...books]);
            onSelectBook(newBook);
            setReworkBundle(null);
            onNavigate('chapters');
          }}
        />
      )}

      {/* Sequel / Prequel / Spin-off Generator Modal */}
      {sequelTargetBook && (
        <BookSequelModal
          isOpen={Boolean(sequelTargetBook)}
          onClose={() => setSequelTargetBook(null)}
          sourceBook={sequelTargetBook}
          userUid={currentUser?.uid}
          authorDefault={currentUser?.name}
          onSequelCreated={(created) => {
            onBooksChanged([created.book, ...books]);
            onSelectBook(created.book);
            onNavigate('chapters');
          }}
        />
      )}

      {/* Headers-Only Edit Modal for Parsed Books */}
      <BookHeadersEditModal
        isOpen={Boolean(headersEditBook)}
        onClose={() => setHeadersEditBook(null)}
        book={headersEditBook}
        onBookUpdated={(updated) => {
          onBooksChanged(books.map((item) => (item.id === updated.id ? updated : item)));
          if (activeBook?.id === updated.id) onSelectBook(updated);
        }}
      />
    </div>
  );
};
