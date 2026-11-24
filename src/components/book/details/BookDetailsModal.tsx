import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Calendar,
  Download,
  FileText,
  GitBranch,
  Globe,
  Headphones,
  Layers,
  Palette,
  RefreshCw,
  Sparkles,
  Tag,
  User,
  Users,
  Wand2,
} from 'lucide-react';
import {
  Book,
  Chapter,
  Character,
  ParsedBookSearchResult,
  WorldEntity,
} from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { RubikMarkerHeading } from '../../landing/RubikMarkerHeading';
import { BasicPlotBadge } from '../../plots/BasicPlotBadge';
import {
  fetchChapters,
  fetchCharacters,
  fetchWorldEntities,
} from '../../../services/db/bookRepository';
import { fetchBookRelations } from '../../../services/db/revisions/revisionRepository';
import { parserService } from '../../../services/parser/parserService';

const RELATION_LABELS: Record<string, string> = {
  sequel: 'Сиквел (продолжение)',
  prequel: 'Приквел (предыстория)',
  spinoff: 'Спин-офф (ответвление)',
  reboot: 'Переосмысление / Ремейк',
  standalone: 'Самостоятельная книга',
};

interface BookDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  book?: Book | null;
  parsedItem?: ParsedBookSearchResult | null;
  userUid?: number;
  isImportedParsed?: boolean;
  isImportingParsed?: boolean;
  onReadBook?: (book: Book, chapterNumber?: number) => void;
  onOpenRework?: (book: Book) => void;
  onOpenSequel?: (book: Book) => void;
  onImportParsed?: (item: ParsedBookSearchResult, chosenFormat?: string) => void;
  onOpenCoverParsed?: (item: ParsedBookSearchResult) => void;
  onSelectRelatedBook?: (book: Book) => void;
}

export const BookDetailsModal: React.FC<BookDetailsModalProps> = ({
  isOpen,
  onClose,
  book,
  parsedItem,
  userUid,
  isImportedParsed = false,
  isImportingParsed = false,
  onReadBook,
  onOpenRework,
  onOpenSequel,
  onImportParsed,
  onOpenCoverParsed,
  onSelectRelatedBook,
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'chapters' | 'universe'>('overview');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [entities, setEntities] = useState<WorldEntity[]>([]);
  const [parentBook, setParentBook] = useState<Book | null>(null);
  const [childBooks, setChildBooks] = useState<Book[]>([]);
  const [enrichedParsed, setEnrichedParsed] = useState<ParsedBookSearchResult | null>(parsedItem || null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  useEffect(() => {
    setActiveTab('overview');
  }, [book?.id, parsedItem?.id, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    if (book) {
      let alive = true;
      setLoadingDetails(true);
      Promise.all([
        fetchChapters(book.id, book.user_uid || userUid).catch(() => []),
        fetchCharacters(book.id, book.user_uid || userUid).catch(() => []),
        fetchWorldEntities(book.id, undefined, book.user_uid || userUid).catch(() => []),
        fetchBookRelations(book, userUid).catch(() => ({ parentBook: null, childBooks: [] })),
      ]).then(([chaps, chars, ents, rel]) => {
        if (!alive) return;
        setChapters(chaps || []);
        setCharacters(chars || []);
        setEntities(ents || []);
        setParentBook(rel.parentBook);
        setChildBooks(rel.childBooks || []);
        setLoadingDetails(false);
      });
      return () => {
        alive = false;
      };
    }

    if (parsedItem) {
      setEnrichedParsed(parsedItem);
      const bId = parsedItem.bookId || parsedItem.bookMeta?.flibustaBookId;
      if (
        parsedItem.source === 'flibusta' &&
        bId &&
        (!parsedItem.description ||
          parsedItem.description.includes('Откройте «Подробнее»') ||
          !parsedItem.genres?.length)
      ) {
        let alive = true;
        setLoadingDetails(true);
        parserService
          .fetchFlibustaDetails(bId)
          .then((details) => {
            if (!alive) return;
            setEnrichedParsed((prev) =>
              prev
                ? {
                    ...prev,
                    ...details,
                    description: details.description || prev.description,
                    genres: details.genres?.length ? details.genres : prev.genres,
                    series: details.series || prev.series,
                    seriesNumber: details.seriesNumber || prev.seriesNumber,
                    bookMeta: { ...(prev.bookMeta || {}), ...(details.bookMeta || {}) },
                  }
                : null
            );
          })
          .finally(() => {
            if (alive) setLoadingDetails(false);
          });
        return () => {
          alive = false;
        };
      }
    }
  }, [isOpen, book?.id, parsedItem?.id, userUid]);

  if (!isOpen || (!book && !enrichedParsed)) return null;

  const displayTitle = book ? book.title : enrichedParsed!.title;
  const displayAuthor = book ? book.author : enrichedParsed!.author;
  const displayCover = book
    ? book.cover_config?.frontImageUrl
    : enrichedParsed!.highResCoverUrl || enrichedParsed!.coverUrl;
  const displayDescription = book
    ? book.synopsis_overview || book.cover_config?.backBlurb
    : enrichedParsed!.description;
  const displayGenres = book ? book.genres || [] : enrichedParsed!.genres || [];
  const displaySeries = book ? book.series_name : enrichedParsed!.series;
  const displaySeriesOrder = book ? book.series_order : enrichedParsed!.seriesNumber;
  const meta = book ? book.book_meta : enrichedParsed!.bookMeta;
  const isAudio = book
    ? Boolean((book.audio_tracks && book.audio_tracks.length > 0) || book.content_type === 'audiobook' || book.genres?.includes('Аудиокнига'))
    : enrichedParsed?.contentType === 'audiobook';
  const totalWords = chapters.reduce((acc, c) => acc + (c.content ? c.content.split(/\s+/).filter(Boolean).length : 0), 0);
  const readyChapters = chapters.filter((c) => c.content && c.content.trim().length > 100).length;

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Паспорт произведения"
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-5 text-white font-['PT_Serif',serif]">
        {/* Hero Card: Cover + Core Metadata */}
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 p-4 bg-zinc-950/75 border border-zinc-700 rounded-none">
          <div className="w-32 sm:w-36 aspect-[148/210] bg-zinc-900 border border-zinc-600 shrink-0 self-center sm:self-start overflow-hidden relative flex items-center justify-center">
            {displayCover ? (
              <img
                src={displayCover}
                alt={displayTitle}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-zinc-500 p-2 text-center gap-1">
                {isAudio ? <Headphones className="w-7 h-7 text-rose-500" /> : <BookOpen className="w-7 h-7 text-zinc-400" />}
                <span className="text-[14px] font-mono">А5 обложка</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-mono">
              {book?.relation_type && RELATION_LABELS[book.relation_type] && (
                <span className="px-2.5 py-0.5 bg-rose-950/90 border border-rose-500 text-rose-200 font-bold flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5 text-rose-400" />
                  <span>{RELATION_LABELS[book.relation_type]}</span>
                </span>
              )}
              {displaySeries && (
                <span className="px-2.5 py-0.5 bg-zinc-900 border border-rose-500/70 text-rose-300 font-bold">
                  Серия: {displaySeries}{displaySeriesOrder ? ` #${displaySeriesOrder}` : ''}
                </span>
              )}
              {book?.format && (
                <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300">
                  {book.format}
                </span>
              )}
              {enrichedParsed?.sourceName && (
                <span className="px-2.5 py-0.5 bg-zinc-900 border border-zinc-600 text-rose-300 flex items-center gap-1">
                  <Globe className="w-3.5 h-3.5 text-rose-500" />
                  <span>{enrichedParsed.sourceName}</span>
                </span>
              )}
            </div>

            <RubikMarkerHeading
              text={displayTitle}
              as="h2"
              className="text-[22px] sm:text-[26px] leading-tight text-white break-words"
            />

            <p className="text-[15px] text-zinc-300 flex items-center gap-1.5">
              <User className="w-4 h-4 text-rose-500 shrink-0" />
              <span>{displayAuthor || 'Автор KnigAI'}</span>
            </p>

            {book?.subtitle && (
              <p className="text-[14px] text-zinc-400 italic">{book.subtitle}</p>
            )}

            {displayGenres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {displayGenres.map((g, i) => (
                  <span
                    key={`${g}-${i}`}
                    className="px-2.5 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[14px] flex items-center gap-1"
                  >
                    <Tag className="w-3 h-3 text-rose-500" />
                    <span>{g}</span>
                  </span>
                ))}
              </div>
            )}

            {book?.basic_plots && book.basic_plots.length > 0 && (
              <div className="pt-1">
                <BasicPlotBadge plotIds={book.basic_plots} size="sm" />
              </div>
            )}

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-zinc-800 text-[14px] font-mono">
              <div className="p-2 bg-black/50 border border-zinc-800">
                <span className="text-zinc-400 block">Глав:</span>
                <strong className="text-white">
                  {book ? `${chapters.length || book.target_chapters} (готово ${readyChapters})` : `~${enrichedParsed?.a5PagesEstimate || meta?.pageCountEstimate || '—'} стр.`}
                </strong>
              </div>
              <div className="p-2 bg-black/50 border border-zinc-800">
                <span className="text-zinc-400 block">Объём:</span>
                <strong className="text-rose-400">
                  {book
                    ? totalWords > 0
                      ? `${totalWords.toLocaleString('ru-RU')} слов`
                      : `~${meta?.pageCountEstimate || book.cover_config?.pageCountEstimate || 120} стр. А5`
                    : enrichedParsed?.sizeFormatted || meta?.sizeText || 'Полное издание'}
                </strong>
              </div>
              <div className="p-2 bg-black/50 border border-zinc-800">
                <span className="text-zinc-400 block">Год / Язык:</span>
                <strong className="text-white">
                  {(meta?.year || enrichedParsed?.year || '—')} · {(meta?.language || enrichedParsed?.language || 'русский')}
                </strong>
              </div>
              <div className="p-2 bg-black/50 border border-zinc-800">
                <span className="text-zinc-400 block">Перевод / Изд.:</span>
                <strong className="text-zinc-200 truncate block">
                  {meta?.translator || enrichedParsed?.translator || meta?.publisher || enrichedParsed?.publisher || 'Оригинал'}
                </strong>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Bubble Tabs (wrapping cleanly on mobile, zero horizontal scroll) */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`relative min-h-[42px] px-4 py-1.5 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 rounded-none ${
              activeTab === 'overview'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-white hover:text-white'
            }`}
          >
            <FileText className="w-4 h-4 text-rose-500" />
            <span>Аннотация и паспорт</span>
          </button>

          {book && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('chapters')}
                className={`relative min-h-[42px] px-4 py-1.5 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 rounded-none ${
                  activeTab === 'chapters'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-white hover:text-white'
                }`}
              >
                <Layers className="w-4 h-4 text-rose-500" />
                <span>Синопсис глав ({chapters.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('universe')}
                className={`relative min-h-[42px] px-4 py-1.5 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 rounded-none ${
                  activeTab === 'universe'
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-white hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 text-rose-500" />
                <span>Персонажи и лор ({characters.length + entities.length})</span>
              </button>
            </>
          )}
        </div>

        {/* TAB 1: Overview & Full Annotation */}
        {activeTab === 'overview' && (
          <div className="flex flex-col gap-4">
            <div className="p-4 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <h4 className="text-[16px] font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-rose-500" />
                  <span>Развернутая аннотация и описание</span>
                </h4>
                {loadingDetails && (
                  <span className="text-[14px] font-mono text-rose-400">Загрузка сведений...</span>
                )}
              </div>

              <div className="text-[15px] text-zinc-200 leading-relaxed whitespace-pre-line font-['PT_Serif',serif]">
                {displayDescription ||
                  'Подробная аннотация отсутствует для этого издания. Вы можете отредактировать описание в конструкторе или запустить ИИ-анализ глав.'}
              </div>
            </div>

            {/* Extended Publication Details */}
            {(meta?.isbn || meta?.originalLanguage || meta?.publisher || meta?.translator || book?.setting || book?.tone) && (
              <div className="p-4 bg-zinc-950/70 border border-zinc-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
                {book?.setting && (
                  <div>
                    <span className="text-zinc-400 font-mono block">Сеттинг мира:</span>
                    <span className="text-zinc-200">{book.setting}</span>
                  </div>
                )}
                {book?.tone && (
                  <div>
                    <span className="text-zinc-400 font-mono block">Тон повествования:</span>
                    <span className="text-zinc-200">{book.tone}</span>
                  </div>
                )}
                {(meta?.translator || enrichedParsed?.translator) && (
                  <div>
                    <span className="text-zinc-400 font-mono block">Переводчик:</span>
                    <span className="text-zinc-200">{meta?.translator || enrichedParsed?.translator}</span>
                  </div>
                )}
                {(meta?.publisher || enrichedParsed?.publisher) && (
                  <div>
                    <span className="text-zinc-400 font-mono block">Издательство:</span>
                    <span className="text-zinc-200">{meta?.publisher || enrichedParsed?.publisher}</span>
                  </div>
                )}
                {(meta?.isbn || enrichedParsed?.isbn || book?.cover_config?.isbn) && (
                  <div>
                    <span className="text-zinc-400 font-mono block">ISBN:</span>
                    <span className="text-zinc-200 font-mono">
                      {meta?.isbn || enrichedParsed?.isbn || book?.cover_config?.isbn}
                    </span>
                  </div>
                )}
                {(meta?.originalLanguage || enrichedParsed?.originalLanguage) && (
                  <div>
                    <span className="text-zinc-400 font-mono block">Язык оригинала:</span>
                    <span className="text-zinc-200">{meta?.originalLanguage || enrichedParsed?.originalLanguage}</span>
                  </div>
                )}
              </div>
            )}

            {/* Series / Sequels / Parent Links */}
            {(parentBook || childBooks.length > 0) && (
              <div className="p-4 bg-zinc-950/75 border border-rose-500/50 flex flex-col gap-2.5">
                <h4 className="text-[15px] font-bold text-white flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-rose-500" />
                  <span>Связи книжной серии и продолжения</span>
                </h4>
                {parentBook && (
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-black/50 border border-zinc-800 text-[14px]">
                    <span>
                      Основано на книге: <strong className="text-white">«{parentBook.title}»</strong> ({parentBook.author})
                    </span>
                    {onSelectRelatedBook && (
                      <button
                        type="button"
                        onClick={() => onSelectRelatedBook(parentBook)}
                        className="px-3 py-1 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 font-bold text-[14px] cursor-pointer"
                      >
                        Открыть источник
                      </button>
                    )}
                  </div>
                )}
                {childBooks.map((cb) => (
                  <div
                    key={cb.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-black/50 border border-zinc-800 text-[14px]"
                  >
                    <span>
                      {RELATION_LABELS[cb.relation_type || 'sequel'] || 'Продолжение'}:{' '}
                      <strong className="text-rose-400">«{cb.title}»</strong>
                    </span>
                    {onSelectRelatedBook && (
                      <button
                        type="button"
                        onClick={() => onSelectRelatedBook(cb)}
                        className="px-3 py-1 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 font-bold text-[14px] cursor-pointer"
                      >
                        Открыть книгу
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Chapter Outline / Synopses */}
        {activeTab === 'chapters' && book && (
          <div className="flex flex-col gap-2.5 max-h-[45vh] overflow-y-auto pr-1">
            {chapters.length === 0 ? (
              <div className="p-6 text-center bg-zinc-950/70 border border-zinc-800 text-[14px] text-zinc-400">
                Главы и поглавный синопсис ещё не сформированы.
              </div>
            ) : (
              chapters.map((ch) => {
                const isReady = Boolean(ch.content && ch.content.trim().length > 100);
                return (
                  <div
                    key={ch.id || ch.chapter_number}
                    className="p-3 bg-zinc-950/80 border border-zinc-800 hover:border-zinc-500 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2 py-0.5 bg-white text-black font-bold font-mono text-[14px]">
                          #{ch.chapter_number}
                        </span>
                        <h5 className="text-[15px] font-bold text-white break-words">{ch.title}</h5>
                        <span className={`text-[14px] font-mono ${isReady ? 'text-rose-400' : 'text-zinc-500'}`}>
                          {isReady ? `· ${ch.content.split(/\s+/).filter(Boolean).length} слов` : '· план'}
                        </span>
                      </div>
                      {ch.synopsis && (
                        <p className="text-[14px] text-zinc-300 mt-1.5 leading-relaxed">{ch.synopsis}</p>
                      )}
                    </div>
                    {isReady && onReadBook && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onReadBook(book, ch.chapter_number);
                        }}
                        className="min-h-[38px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 text-[14px] font-bold cursor-pointer shrink-0"
                      >
                        Читать главу →
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 3: Characters & World Entities */}
        {activeTab === 'universe' && book && (
          <div className="flex flex-col gap-3 max-h-[45vh] overflow-y-auto pr-1">
            {characters.length === 0 && entities.length === 0 ? (
              <div className="p-6 text-center bg-zinc-950/70 border border-zinc-800 text-[14px] text-zinc-400">
                Библия персонажей и лора пока пуста. Персонажи появятся после генерации или анализа книги.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {characters.map((c) => (
                  <div key={`char-${c.id}`} className="p-3 bg-zinc-950/80 border border-zinc-800 flex gap-3 items-start">
                    {c.visual_card_url && (
                      <img
                        src={c.visual_card_url}
                        alt={c.name}
                        className="w-16 h-20 object-cover border border-zinc-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="min-w-0">
                      <span className="text-[14px] font-mono text-rose-400 block">{c.role}</span>
                      <h5 className="text-[15px] font-bold text-white break-words">{c.name}</h5>
                      <p className="text-[14px] text-zinc-300 mt-1 line-clamp-3">{c.description}</p>
                    </div>
                  </div>
                ))}
                {entities.map((e) => (
                  <div key={`ent-${e.id}`} className="p-3 bg-zinc-950/80 border border-zinc-800 flex gap-3 items-start">
                    {e.image_url && (
                      <img
                        src={e.image_url}
                        alt={e.name}
                        className="w-16 h-20 object-cover border border-zinc-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <div className="min-w-0">
                      <span className="text-[14px] font-mono text-zinc-400 block">{e.subtitle_or_role || e.entity_type}</span>
                      <h5 className="text-[15px] font-bold text-white break-words">{e.name}</h5>
                      <p className="text-[14px] text-zinc-300 mt-1 line-clamp-3">{e.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-zinc-800">
          {book ? (
            <div className="flex flex-wrap items-center gap-2">
              {onReadBook && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onReadBook(book);
                  }}
                  className="relative min-h-[44px] px-4 bg-white hover:bg-zinc-200 text-black font-bold text-[14px] border-2 border-white transition cursor-pointer flex items-center gap-1.5 rounded-none"
                >
                  {isAudio ? <Headphones className="w-4 h-4 text-black" /> : <BookOpen className="w-4 h-4 text-black" />}
                  <span>{isAudio ? 'Слушать аудиокнигу' : 'Открыть в читалке'}</span>
                </button>
              )}

              {onOpenRework && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenRework(book);
                  }}
                  className="relative min-h-[44px] px-4 bg-zinc-900 hover:bg-white hover:text-black text-white font-bold text-[14px] border border-rose-500 transition cursor-pointer flex items-center gap-1.5 rounded-none"
                >
                  <Wand2 className="w-4 h-4 text-rose-500" />
                  <span>Редактура / Ремейк</span>
                </button>
              )}

              {onOpenSequel && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenSequel(book);
                  }}
                  className="relative min-h-[44px] px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[14px] border border-rose-500 transition cursor-pointer flex items-center gap-1.5 rounded-none"
                >
                  <Sparkles className="w-4 h-4 text-white" />
                  <span>Создать продолжение</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {onImportParsed && (
                <button
                  type="button"
                  onClick={() => onImportParsed(enrichedParsed!)}
                  disabled={isImportingParsed || isImportedParsed}
                  className="relative min-h-[44px] px-4 bg-white hover:bg-zinc-200 text-black font-bold text-[14px] border-2 border-white transition cursor-pointer flex items-center gap-1.5 rounded-none disabled:opacity-60"
                >
                  <Download className="w-4 h-4 text-black" />
                  <span>
                    {isImportingParsed
                      ? 'Загрузка...'
                      : isImportedParsed
                      ? 'Добавлено в библиотеку'
                      : 'Импортировать в KnigAI'}
                  </span>
                </button>
              )}

              {onOpenCoverParsed && (
                <button
                  type="button"
                  onClick={() => onOpenCoverParsed(enrichedParsed!)}
                  className="relative min-h-[44px] px-4 bg-zinc-900 hover:bg-white hover:text-black text-white font-bold text-[14px] border border-zinc-600 transition cursor-pointer flex items-center gap-1.5 rounded-none"
                >
                  <Palette className="w-4 h-4 text-rose-500" />
                  <span>Редактор переплета</span>
                </button>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 bg-zinc-950 hover:bg-zinc-800 text-zinc-300 border border-zinc-700 font-bold text-[14px] transition cursor-pointer rounded-none ml-auto"
          >
            Закрыть
          </button>
        </div>
      </div>
    </NoirModal>
  );
};
