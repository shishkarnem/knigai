import React, { useState } from 'react';
import { Search, BookOpen, Headphones, Globe, Filter, AlertCircle, History, Link as LinkIcon, Download, Layers } from 'lucide-react';
import { Book, Chapter, ParsedBookSearchResult, AppUser } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { parserService } from '../../services/parser/parserService';
import { ParserResultCard } from './ParserResultCard';
import { ParserWaitingLoader } from './ParserWaitingLoader';
import { BookDetailsModal } from '../book/details/BookDetailsModal';

interface BookParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  onBookImported: (book: Book, chapters: Chapter[]) => void;
  onNavigateToCover?: (book: Book) => void;
  existingBooks?: Book[];
  onOpenBookInReader?: (book: Book) => void;
}

export const BookParserModal: React.FC<BookParserModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onBookImported,
  onNavigateToCover,
  existingBooks = [],
  onOpenBookInReader,
}) => {
  // Catalog selection before search
  const [selectedCatalog, setSelectedCatalog] = useState<'flibusta' | 'samlib' | 'librusec' | 'audio' | 'all'>('flibusta');

  // Search input & parameters
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'title' | 'author' | 'series'>('title');
  const [preferredFormat, setPreferredFormat] = useState<string>('fb2.zip');
  const [language, setLanguage] = useState<'ru' | 'all'>('ru');
  const [directUrl, setDirectUrl] = useState('');
  const [showDirectUrlInput, setShowDirectUrlInput] = useState(false);

  // Search state
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<ParsedBookSearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailsItem, setDetailsItem] = useState<ParsedBookSearchResult | null>(null);

  // Persistent Search & Download History
  const [searchHistory, setSearchHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('knigai_parser_search_history');
      return saved ? JSON.parse(saved) : ['Гарри Поттер', 'Достоевский', 'Стругацкие', 'Толстой'];
    } catch {
      return ['Гарри Поттер', 'Достоевский', 'Стругацкие'];
    }
  });

  const [downloadedHistory, setDownloadedHistory] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('knigai_parser_downloaded_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const saveSearchQuery = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    const updated = [trimmed, ...searchHistory.filter((item) => item.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
    setSearchHistory(updated);
    try {
      localStorage.setItem('knigai_parser_search_history', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const clearSearchHistory = () => {
    setSearchHistory([]);
    try {
      localStorage.removeItem('knigai_parser_search_history');
    } catch {
      // ignore
    }
  };

  const handleSearchWithQuery = async (searchQuery: string) => {
    const q = searchQuery.trim();
    if (!q) return;

    setQuery(q);
    setIsSearching(true);
    setErrorMessage(null);
    setHasSearched(true);
    saveSearchQuery(q);

    try {
      const items = await parserService.search({
        query: q,
        catalog: selectedCatalog,
        searchType,
        preferredFormat,
        category: selectedCatalog === 'audio' ? 'audio' : 'books',
        language,
        limit: 20,
      });
      setResults(items);
    } catch (err: any) {
      console.error('Parser search error:', err);
      setErrorMessage('Не удалось выполнить поиск по выбранному каталогу. Попробуйте другой запрос или зеркало.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await handleSearchWithQuery(query);
  };

  const handleImport = async (item: ParsedBookSearchResult, chosenFormat?: string) => {
    setImportingId(item.id);
    setErrorMessage(null);

    try {
      const { book, chapters } = await parserService.importBook({
        item,
        user_uid: currentUser?.uid,
        chosenFormat: chosenFormat || preferredFormat,
      });

      setImportedIds((prev) => [...prev, item.id]);

      // Record in downloaded history
      const updatedDl = Array.from(new Set([...downloadedHistory, item.id, item.title.toLowerCase().trim()]));
      setDownloadedHistory(updatedDl);
      try {
        localStorage.setItem('knigai_parser_downloaded_history', JSON.stringify(updatedDl));
      } catch {
        // ignore
      }

      onBookImported(book, chapters);
    } catch (err: any) {
      console.error('Import book error:', err);
      setErrorMessage(err.message || 'Ошибка загрузки книги в библиотеку');
    } finally {
      setImportingId(null);
    }
  };

  const handleDirectUrlImport = async () => {
    const url = directUrl.trim();
    if (!url || !url.startsWith('http')) {
      setErrorMessage('Укажите корректную прямую ссылку на книгу (например с flibusta.su или flibusta.is)');
      return;
    }

    setImportingId('direct_url');
    setErrorMessage(null);

    try {
      const res = await fetch('/api/parser/import-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          user_uid: currentUser?.uid,
        }),
      });

      if (!res.ok) {
        const errTxt = await res.text();
        throw new Error(`Ошибка загрузки: ${errTxt}`);
      }

      const data = await res.json();
      onBookImported(data.book, data.chapters || []);
      setDirectUrl('');
      setShowDirectUrlInput(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка загрузки книги по прямой ссылке');
    } finally {
      setImportingId(null);
    }
  };

  const handleOpenCover = async (item: ParsedBookSearchResult) => {
    try {
      const { book, chapters } = await parserService.importBook({
        item,
        user_uid: currentUser?.uid,
        chosenFormat: preferredFormat,
      });
      onBookImported(book, chapters);
      if (onNavigateToCover) {
        onClose();
        onNavigateToCover(book);
      }
    } catch (err: any) {
      setErrorMessage('Ошибка перехода в редактор переплета: ' + err.message);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="поиск и парсинг книг по каталогам: флибуста, самиздат, либрусек, аудиоархивы"
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-5 text-white font-['PT_Serif',serif]">
        {/* Step 1: Catalog-First Selection Bar */}
        <div className="flex flex-col gap-2 p-3.5 bg-zinc-950/90 border border-zinc-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-mono text-zinc-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-rose-500" />
              <span>выберите каталог для поиска:</span>
            </span>
            <span className="text-rose-400 text-[14px] font-mono">
              {selectedCatalog === 'flibusta' ? 'флибуста: все форматы скачивания' : 'открытые каталоги'}
            </span>
          </div>

          {/* Catalog tabs in speech-bubble style (no horizontal scrollbar, wrap cleanly on mobile) */}
          <div className="flex flex-wrap gap-2 pt-1 font-mono">
            {[
              { id: 'flibusta', label: 'флибуста (flibusta)', desc: 'книги всех форматов, полные версии' },
              { id: 'samlib', label: 'самиздат (samlib)', desc: 'сетевая литература и авторы' },
              { id: 'librusec', label: 'либрусек (librusec)', desc: 'классические электронные архивы' },
              { id: 'audio', label: 'librivox (аудиокниги)', desc: 'аудиокниги с делением на главы' },
              { id: 'all', label: 'все архивы', desc: 'общий поиск по открытым источникам' },
            ].map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCatalog(cat.id as any)}
                className={`relative px-3.5 py-2 text-[14px] font-bold border transition-all cursor-pointer flex flex-col items-start ${
                  selectedCatalog === cat.id
                    ? 'bg-white text-black border-white shadow'
                    : 'bg-zinc-900/80 text-zinc-300 border-zinc-700/80 hover:border-white hover:text-white'
                }`}
              >
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Flibusta Specific Settings Panel */}
        {selectedCatalog === 'flibusta' && (
          <div className="p-3.5 bg-zinc-950/70 border border-zinc-800/90 flex flex-col gap-3 text-[14px]">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
              <span className="text-[14px] font-mono text-rose-400 flex items-center gap-1.5 font-bold">
                <Layers className="w-3.5 h-3.5 text-rose-500" />
                <span>настройки поиска и скачивания флибусты:</span>
              </span>

              <button
                type="button"
                onClick={() => setShowDirectUrlInput(!showDirectUrlInput)}
                className="text-[14px] font-mono text-zinc-400 hover:text-rose-400 underline cursor-pointer flex items-center gap-1"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                <span>{showDirectUrlInput ? 'скрыть прямую ссылку' : 'скачать по прямой ссылке с flibusta.su'}</span>
              </button>
            </div>

            {/* Direct URL input if toggled */}
            {showDirectUrlInput && (
              <div className="p-2.5 bg-black border border-rose-500/50 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  placeholder="Вставьте ссылку https://flibusta.su/book/1232-.../d/?f=fb2.zip или http://flibusta.is/b/..."
                  className="flex-1 bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-[14px] text-white outline-hidden focus:border-white"
                />
                <button
                  type="button"
                  onClick={handleDirectUrlImport}
                  disabled={importingId === 'direct_url' || !directUrl.trim()}
                  className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[14px] border border-rose-500 transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  <span>{importingId === 'direct_url' ? 'загрузка...' : 'скачать книгу'}</span>
                </button>
              </div>
            )}

            {/* Sub-row 1: Search type & format filter */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Search Type: Title, Author, Series */}
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[14px]">
                <span className="text-zinc-400 mr-1 text-[14px]">искать:</span>
                {[
                  { id: 'title', label: 'по названию' },
                  { id: 'author', label: 'по автору' },
                  { id: 'series', label: 'по книжной серии' },
                ].map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setSearchType(st.id as any)}
                    className={`px-2.5 py-1 border transition-all text-[14px] font-bold cursor-pointer ${
                      searchType === st.id
                        ? 'bg-rose-600 border-rose-500 text-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>

              {/* Preferred Format */}
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-[14px]">
                <span className="text-zinc-400 mr-1 text-[14px]">формат:</span>
                {[
                  { id: 'fb2.zip', label: 'fb2.zip (рекомендуется)' },
                  { id: 'epub', label: 'epub' },
                  { id: 'mobi', label: 'mobi' },
                  { id: 'txt.zip', label: 'txt.zip' },
                  { id: 'rtf.zip', label: 'rtf.zip' },
                  { id: 'a4.pdf', label: 'pdf a4' },
                ].map((fmt) => (
                  <button
                    key={fmt.id}
                    type="button"
                    onClick={() => setPreferredFormat(fmt.id)}
                    className={`px-2 py-0.5 border transition-all text-[14px] font-bold cursor-pointer ${
                      preferredFormat === fmt.id
                        ? 'bg-white text-black border-white'
                        : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-white'
                    }`}
                  >
                    {fmt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="flex-1 min-w-0">
              <NoirVoiceInput
                value={query}
                onValueChange={setQuery}
                voiceContext="parser_book_search"
                placeholder={
                  selectedCatalog === 'flibusta'
                    ? searchType === 'author'
                      ? 'Введите имя автора на Флибусте (например, «Достоевский»)...'
                      : searchType === 'series'
                      ? 'Введите название серии (например, «Гарри Поттер»)...'
                      : 'Введите название книги (например, «Мастер и Маргарита»)...'
                    : 'Введите название книги или автора для поиска...'
                }
              />
            </div>

            <NoirButton
              type="submit"
              variant="primary"
              disabled={isSearching || !query.trim()}
              icon={<Search className="w-4 h-4 text-black" />}
              className="text-[14px] font-bold min-h-[44px] px-6"
            >
              {isSearching ? 'поиск...' : 'найти'}
            </NoirButton>
          </div>

          {/* Search History chips */}
          {searchHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[14px]">
              <span className="text-zinc-400 font-mono text-[14px] flex items-center gap-1">
                <History className="w-3.5 h-3.5 text-zinc-400" />
                <span>история запросов:</span>
              </span>
              {searchHistory.map((hist, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSearchWithQuery(hist)}
                  className="px-2.5 py-0.5 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 hover:border-white text-zinc-300 hover:text-white font-mono text-[14px] transition cursor-pointer flex items-center gap-1"
                >
                  <span>{hist}</span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearSearchHistory}
                className="text-[14px] text-zinc-500 hover:text-rose-400 ml-1 underline cursor-pointer"
                title="Очистить историю запросов"
              >
                очистить
              </button>
            </div>
          )}

          {/* Language filter row */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 text-[14px]">
            <div className="flex flex-wrap items-center gap-1.5 font-mono text-[14px]">
              <span className="text-zinc-400">язык:</span>
              <button
                type="button"
                onClick={() => setLanguage('ru')}
                className={`min-h-[36px] px-2.5 border transition cursor-pointer ${
                  language === 'ru'
                    ? 'bg-rose-600 border-rose-500 text-white font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-white'
                }`}
              >
                только русский
              </button>
              <button
                type="button"
                onClick={() => setLanguage('all')}
                className={`min-h-[36px] px-2.5 border transition cursor-pointer ${
                  language === 'all'
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-zinc-950 text-zinc-400 border-zinc-800 hover:border-white'
                }`}
              >
                все языки
              </button>
            </div>

            <span className="text-zinc-400 font-mono text-[14px]">
              источник: <strong className="text-white">{selectedCatalog}</strong>
            </span>
          </div>
        </form>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/70 border border-rose-600 text-rose-200 text-[14px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Results area */}
        <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto pr-1">
          {importingId && (
            <div className="mb-2">
              <ParserWaitingLoader
                mode="import"
                targetTitle={results.find((r) => r.id === importingId)?.title || 'Книга'}
              />
            </div>
          )}

          {isSearching ? (
            <ParserWaitingLoader mode="search" targetTitle={query} />
          ) : results.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[14px] text-zinc-400 font-mono pb-2 border-b border-zinc-800">
                <span className="text-rose-400 font-mono text-[14px]">
                  найдено произведений: {results.length} (каталог: {selectedCatalog})
                </span>
                <span className="text-zinc-400 font-mono text-[14px]">
                  полные книги формата А5 со всеми главами
                </span>
              </div>

              {results.map((item) => {
                const itemTitleClean = (item.title || '').toLowerCase().trim();
                const matchedBook = existingBooks.find((b) => {
                  const bTitleClean = (b.title || '').toLowerCase().trim();
                  return bTitleClean === itemTitleClean || b.title.includes(item.title) || item.title.includes(b.title);
                });
                const isAlreadyInLibrary = Boolean(matchedBook) || downloadedHistory.includes(item.id) || downloadedHistory.includes(itemTitleClean);

                return (
                  <ParserResultCard
                    key={item.id}
                    item={item}
                    isImporting={importingId === item.id}
                    isImported={importedIds.includes(item.id)}
                    isAlreadyInLibrary={isAlreadyInLibrary}
                    onImport={handleImport}
                    onOpenCoverEditor={onNavigateToCover ? handleOpenCover : undefined}
                    onOpenDetails={(it) => setDetailsItem(it)}
                    onOpenReader={
                      matchedBook && onOpenBookInReader
                        ? () => {
                            onClose();
                            onOpenBookInReader(matchedBook);
                          }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ) : hasSearched ? (
            <div className="p-10 text-center flex flex-col items-center justify-center gap-2 text-zinc-400 border border-zinc-800">
              <BookOpen className="w-8 h-8 text-zinc-600" />
              <p className="text-[14px]">
                По запросу ничего не найдено в каталоге {selectedCatalog}. Попробуйте изменить формулировку или выбрать «Все архивы».
              </p>
            </div>
          ) : (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-2 text-zinc-500 border border-zinc-900">
              <p className="text-[14px]">
                Выберите каталог (например «Флибуста»), введите название книги или автора для поиска и скачивания в любом формате.
              </p>
            </div>
          )}
        </div>
      </div>

      <BookDetailsModal
        isOpen={Boolean(detailsItem)}
        onClose={() => setDetailsItem(null)}
        parsedItem={detailsItem}
        userUid={currentUser?.uid}
        isImportedParsed={Boolean(detailsItem && importedIds.includes(detailsItem.id))}
        isImportingParsed={Boolean(detailsItem && importingId === detailsItem.id)}
        onImportParsed={handleImport}
        onOpenCoverParsed={onNavigateToCover ? handleOpenCover : undefined}
      />
    </NoirModal>
  );
};
