import React, { useState, useEffect } from 'react';
import {
  BookPlus,
  Sliders,
  Compass,
  BookText,
  Save,
  Search,
  Plus,
  Filter,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Palette,
  Layers,
} from 'lucide-react';
import { Book, GenreWeight, BookStyleConfig } from '../../types';
import { GenreItem, GENRE_CATEGORIES, TONE_OPTIONS, AUDIENCE_OPTIONS } from '../../services/genres/GenrePresets';
import { getAllCombinedGenres, addCustomGenre } from '../../services/genres/genresService';
import { getDefaultStyle } from '../../services/genres/StylePresets';
import { StyleConstructorPanel } from '../../components/style/StyleConstructorPanel';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirModal } from '../../components/common/NoirModal';
import { NoirStatus } from '../../components/common/NoirStatus';
import { BasicPlotSelector } from '../../components/plots/BasicPlotSelector';
import { orchestrateWorldConcept } from '../../services/ai/orchestrator';
import { saveNewBook, updateBook, checkBookTitleUnique } from '../../services/db/bookRepository';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../../components/voice/NoirVoiceTextarea';
import { PricingInfoModalButton } from '../../components/billing/PricingInfoModalButton';
import { estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { BookDetailsModal } from '../../components/book/details/BookDetailsModal';
import { BookReadOnlyBanner } from '../../components/book/details/BookReadOnlyBanner';
import { BookConceptMetadataCard } from '../../components/book/details/BookConceptMetadataCard';
import { BookDraftsAndAiTab } from '../../components/drafts/BookDraftsAndAiTab';
import { getCurrentUser } from '../../services/auth/authService';
import { getBookPermissions } from '../../services/book/bookPermissions';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';
import { classifyBookOrDraftWith763 } from '../../services/ai/decision/bookClassifier763';

interface ConstructorPageProps {
  currentBook: Book | null;
  onBookCreated: (book: Book) => void;
  onProceedToChapters: () => void;
  userUid?: number;
  onOpenNewBookModal?: () => void;
}

export const ConstructorPage: React.FC<ConstructorPageProps> = ({
  currentBook,
  onBookCreated,
  onProceedToChapters,
  userUid,
  onOpenNewBookModal,
}) => {
  const currentUser = getCurrentUser();
  const perms = currentBook ? getBookPermissions(currentBook, currentUser) : null;
  const readOnly = Boolean(currentBook && perms && !perms.canEditContent);

  // Navigation between Constructor sub-sections: Genres, Style, Concept, Drafts & AI Comments
  const [activeSubTab, setActiveSubTab] = useState<'genres' | 'style' | 'concept' | 'drafts'>('genres');

  // Genres state
  const [allGenres, setAllGenres] = useState<GenreItem[]>([]);
  const [genreSearch, setGenreSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Все категории');
  const [isAddGenreModalOpen, setIsAddGenreModalOpen] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [newGenreName, setNewGenreName] = useState('');
  const [newGenreCategory, setNewGenreCategory] = useState('Авторские');
  const [newGenreDesc, setNewGenreDesc] = useState('');

  const [selectedGenres, setSelectedGenres] = useState<GenreWeight[]>(
    currentBook?.genre_weights || [
      { genre: 'Темное фэнтези', weight: 45 },
      { genre: 'Киберпанк', weight: 35 },
      { genre: 'Детектив нуар', weight: 20 },
    ]
  );

  // Style state (separate from genres)
  const [activeStyle, setActiveStyle] = useState<BookStyleConfig>(
    currentBook?.style_config || getDefaultStyle()
  );

  // Concept & Plot state
  const [selectedPlots, setSelectedPlots] = useState<string[]>(
    currentBook?.basic_plots && currentBook.basic_plots.length > 0
      ? currentBook.basic_plots
      : ['overcoming-the-monster']
  );
  const [tone, setTone] = useState(currentBook?.tone || TONE_OPTIONS[1]);
  const [audience, setAudience] = useState(currentBook?.audience || AUDIENCE_OPTIONS[1]);
  const [setting, setSetting] = useState(
    currentBook?.setting ||
      'Нео-Венеция 2240 года, где древние магические каналы пересекаются с квантовыми дата-центрами и парящими дирижаблями синдикатов.'
  );
  const [conflict, setConflict] = useState(
    currentBook?.synopsis_overview
      ? 'Противостояние верховным синдикатам за контроль над источником эфира'
      : 'Похищение квантового кристалла с памятью исчезнувшей династии магов, способного отключить защитный купол над городом.'
  );
  const [authorInstructions, setAuthorInstructions] = useState(currentBook?.author_instructions || '');
  const [targetChapters, setTargetChapters] = useState(currentBook?.target_chapters || 100);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error' | 'loading'; text: string } | null>(null);

  const [title, setTitle] = useState(currentBook?.title || '');
  const [titleUniqueStatus, setTitleUniqueStatus] = useState<{ checked: boolean; isUnique: boolean; message?: string }>({
    checked: true,
    isUnique: true,
  });
  const [savingTitle, setSavingTitle] = useState(false);

  useEffect(() => {
    if (currentBook) {
      setTitle(currentBook.title);
      setAuthorInstructions(currentBook.author_instructions || '');
      if (currentBook.style_config) {
        setActiveStyle(currentBook.style_config);
      }
      setSelectedPlots(
        currentBook.basic_plots && currentBook.basic_plots.length > 0
          ? currentBook.basic_plots
          : ['overcoming-the-monster']
      );
      setTitleUniqueStatus({ checked: true, isUnique: true });
    }
  }, [currentBook]);

  useEffect(() => {
    loadGenres();
  }, [userUid]);

  const loadGenres = async () => {
    try {
      const list = await getAllCombinedGenres(userUid);
      setAllGenres(list);
    } catch (e) {
      console.warn('Failed to load genres:', e);
    }
  };

  const handleTitleChange = (newVal: string) => {
    setTitle(newVal);
    if (!newVal.trim()) {
      setTitleUniqueStatus({ checked: true, isUnique: false, message: 'Название книги не может быть пустым' });
      return;
    }

    checkBookTitleUnique(newVal, currentBook?.id, userUid).then((res) => {
      if (!res.isUnique) {
        setTitleUniqueStatus({
          checked: true,
          isUnique: false,
          message: `Книга с названием «${res.existingTitle}» уже есть в базе`,
        });
      } else {
        setTitleUniqueStatus({
          checked: true,
          isUnique: true,
          message: 'Название уникально и свободно для использования',
        });
      }
    });
  };

  const handleSaveTitleOnly = async () => {
    if (!currentBook || !title.trim() || readOnly) return;
    setSavingTitle(true);
    try {
      const res = await checkBookTitleUnique(title, currentBook.id, userUid);
      if (!res.isUnique) {
        setTitleUniqueStatus({
          checked: true,
          isUnique: false,
          message: `Книга с названием «${res.existingTitle}» уже есть в базе`,
        });
        setStatusMsg({ type: 'error', text: `Книга с названием «${res.existingTitle}» уже зарегистрирована в базе.` });
        return;
      }

      const updated: Book = {
        ...currentBook,
        title: title.trim(),
        cover_config: {
          ...currentBook.cover_config,
          frontTitle: title.trim(),
          spineText: `${title.trim()} — ${currentBook.author || 'Автор'}`,
        },
      };

      await updateBook(updated);
      onBookCreated(updated);
      setStatusMsg({ type: 'success', text: `Название книги успешно обновлено на «${title.trim()}» в базе данных!` });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка сохранения названия: ' + (err instanceof Error ? err.message : '') });
    } finally {
      setSavingTitle(false);
    }
  };

  const handleCreateCustomGenre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGenreName.trim() || readOnly) return;
    try {
      const created = await addCustomGenre(newGenreName, newGenreCategory, newGenreDesc, userUid);
      setAllGenres((prev) => [created, ...prev]);
      toggleGenre(created.name);
      setIsAddGenreModalOpen(false);
      setNewGenreName('');
      setNewGenreDesc('');
      setStatusMsg({ type: 'success', text: `Пользовательский жанр «${created.name}» сохранен в базе данных!` });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка при создании жанра: ' + (err instanceof Error ? err.message : '') });
    }
  };

  const toggleGenre = (genreName: string) => {
    if (readOnly) return;
    const existing = selectedGenres.find((g) => g.genre === genreName);
    if (existing) {
      if (selectedGenres.length <= 1) return;
      setSelectedGenres(selectedGenres.filter((g) => g.genre !== genreName));
    } else {
      if (selectedGenres.length >= 5) return;
      setSelectedGenres([...selectedGenres, { genre: genreName, weight: 30 }]);
    }
  };

  const updateWeight = (genreName: string, val: number) => {
    if (readOnly) return;
    setSelectedGenres(
      selectedGenres.map((g) => (g.genre === genreName ? { ...g, weight: val } : g))
    );
  };

  const handleSaveStyleConfig = async () => {
    if (readOnly) return;
    if (!currentBook) {
      setStatusMsg({ type: 'info', text: 'Стиль зафиксирован для нового концепта книги.' });
      return;
    }
    try {
      const updated: Book = {
        ...currentBook,
        style_config: activeStyle,
      };
      await updateBook(updated);
      onBookCreated(updated);
      setStatusMsg({ type: 'success', text: `Стиль «${activeStyle.styleName}» сохранен в базе данных книги!` });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка сохранения стиля: ' + (err instanceof Error ? err.message : '') });
    }
  };

  const handleClassifyWith763 = async () => {
    if (readOnly) return;
    const sample = [title, currentBook?.subtitle, setting, conflict, currentBook?.synopsis_overview].filter(Boolean).join('\n\n');
    if (sample.trim().length < 10) {
      setStatusMsg({ type: 'error', text: 'Заполните название, сеттинг, конфликт или синопсис для классификации 763.' });
      return;
    }
    setLoading(true);
    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: 'Авто-классификация ИИ (763)',
          subtitle: 'Подбор до 5 жанров, литературного стиля и до 3 сюжетов KnigAI',
          initialStatus: 'Запуск Decisions API 763 (~typesafe/jev-latest)...',
          totalSteps: 1,
          estimatedLetters: 900,
        },
        async (ctx) => {
          const cls = await classifyBookOrDraftWith763({
            text: sample,
            title: title || currentBook?.title,
            userUid,
            bookId: currentBook?.id,
            onProgress: (m) => ctx.setStatus(m),
          });
          setSelectedGenres(cls.genreWeights);
          setActiveStyle(cls.styleConfig);
          setSelectedPlots(cls.basicPlots);
          if (currentBook) {
            const updated: Book = {
              ...currentBook,
              genres: cls.genres,
              genre_weights: cls.genreWeights,
              style_config: cls.styleConfig,
              basic_plots: cls.basicPlots,
            };
            await updateBook(updated);
            onBookCreated(updated);
          }
          ctx.addApplied(`Подобрано: ${cls.genres.length} жанр., стиль «${cls.styleConfig.styleName}», ${cls.basicPlots.length} сюжет.`);
          ctx.setProgress(1, 1);
          return cls;
        }
      );
      if (outcome.result) {
        setStatusMsg({
          type: 'success',
          text: `763 подобрала жанры (${outcome.result.genres.join(', ')}), стиль «${outcome.result.styleConfig.styleName}» и сюжеты KnigAI (${outcome.result.basicPlots.length} шт.).`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка классификации 763' });
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateConcept = async () => {
    if (readOnly) return;
    setLoading(true);
    setStatusMsg({ type: 'loading', text: 'Нейросеть смешивает жанры, сюжетные шаблоны KnigAI и формирует мир книги...' });
    try {
      const genresList = selectedGenres.map((g) => `${g.genre} (${g.weight}%)`);
      const estLetters = estimateTextOperationLetters(1400 + setting.length + conflict.length + authorInstructions.length, 2200);
      const outcome = await runWithGenerationOverlay(
        {
          title: 'Генерация концепта книги и мира',
          subtitle: `Жанров: ${selectedGenres.length} • Глав: ${targetChapters}`,
          initialStatus: 'Нейросеть смешивает жанры, сюжетные шаблоны KnigAI и формирует мир...',
          totalSteps: 1,
          estimatedLetters: estLetters,
        },
        async (ctx) => {
          const concept = await orchestrateWorldConcept({
            genres: genresList,
            basicPlots: selectedPlots,
            tone,
            audience,
            setting,
            conflict,
            authorInstructions,
            targetChapters,
            onProgress: (m) => {
              setStatusMsg({ type: 'loading', text: m });
              ctx.setStatus(m);
            },
            userUid,
          });

          const bookData: Omit<Book, 'id'> = {
            title: concept.title,
            subtitle: concept.subtitle,
            author: currentBook?.author || 'Автор KnigAI',
            genres: selectedGenres.map((g) => g.genre),
            genre_weights: selectedGenres,
            basic_plots: selectedPlots,
            style_config: activeStyle,
            target_chapters: targetChapters,
            status: 'draft',
            synopsis_overview: concept.worldDescription,
            setting,
            tone,
            audience,
            author_instructions: authorInstructions,
            cover_config: currentBook?.cover_config || {
              frontTitle: concept.title,
              frontSubtitle: concept.subtitle,
              authorName: 'Автор KnigAI',
              spineText: `${concept.title} — Автор KnigAI`,
              backBlurb: concept.worldDescription.slice(0, 320) + '...',
              genreLabel: selectedGenres.map((g) => g.genre).join(' / '),
              frontImageUrl: '',
              spineColor: '#18181b',
              paperType: 'cream',
              pageCountEstimate: targetChapters * 3 + 12,
              isbn: '978-5-00-184920-4',
              barcodeText: 'Издание формата А5',
            },
          };

          const savedBook = currentBook
            ? await updateBook({ ...bookData, id: currentBook.id, user_uid: userUid }).then(() => ({
                ...bookData,
                id: currentBook.id,
                user_uid: userUid,
              }))
            : await saveNewBook(bookData, userUid);

          onBookCreated(savedBook);
          setTitle(savedBook.title);
          ctx.addApplied(`Концепт книги «${savedBook.title}» сохранен в БД`);
          ctx.setProgress(1, 1);
          return savedBook;
        }
      );
      if (outcome.stopped && !outcome.result) {
        setStatusMsg({ type: 'info', text: 'Генерация концепта остановлена пользователем.' });
      } else if (outcome.result) {
        setStatusMsg({
          type: 'success',
          text: `Концепт «${outcome.result.title}» зафиксирован в базе данных и готов к каскаду глав!`,
        });
      }
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка генерации' });
    } finally {
      setLoading(false);
    }
  };

  const filteredGenres = allGenres.filter((g) => {
    if (selectedCategory !== 'Все категории' && g.category !== selectedCategory) return false;
    if (genreSearch.trim()) {
      const q = genreSearch.toLowerCase();
      return g.name.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="w-full flex flex-col gap-6 text-white">
      {currentBook && perms && readOnly && (
        <BookReadOnlyBanner
          book={currentBook}
          perms={perms}
          currentUser={currentUser}
          onBookUpdated={onBookCreated}
          sectionLabel="редактирование концепта, жанров и настроек"
        />
      )}

      {/* Intro Box */}
      <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-700">
          <div>
            <h2 className="text-[20px] font-bold text-white tracking-tight">
              Конструктор книги: Жанры, Стиль и Мироустройство
            </h2>
            <p className="text-[14px] text-zinc-400 mt-0.5">
              Жанры, стиль, черновики и указания для ИИ настраиваются отдельно и учитываются нейросетью во всей книге.
            </p>
          </div>
          {currentBook && (
            <div className="px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-[14px] font-bold text-white shrink-0">
              Текущая книга: <span className="underline">{currentBook.title}</span>
            </div>
          )}
        </div>

        {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

        {/* Source Switcher: Создать с нуля / Из черновиков / Из готовой книги */}
        <div className="p-3 bg-zinc-950 border border-zinc-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-[14px] text-zinc-400 font-bold tracking-wider">Источник книги:</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 text-[14px] bg-zinc-900 border border-zinc-700 text-white font-medium">
                {currentBook ? `«${currentBook.title}»` : 'Новая книга'}
              </span>
              <span className="text-zinc-500 text-[14px] hidden sm:inline">|</span>
              <span className="text-[14px] text-zinc-300">
                Создать с нуля · Из черновиков · Из готовой книги (FB2 / EPUB / TXT)
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && (
              <NoirButton
                variant="outline"
                onClick={handleClassifyWith763}
                loading={loading}
                icon={<Sparkles className="w-4 h-4 text-rose-500" />}
              >
                Автоподбор 763 (5 жанров · стиль · 3 сюжета)
              </NoirButton>
            )}
            {onOpenNewBookModal && (
              <NoirButton
                variant="outline"
                onClick={onOpenNewBookModal}
                icon={<BookPlus className="w-4 h-4 text-rose-500" />}
              >
                Сменить источник / Загрузить файл
              </NoirButton>
            )}
          </div>
        </div>

        {/* Book Title Editor with Real-Time Uniqueness Check */}
        <div className="p-4 bg-zinc-950 border border-zinc-700 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <label className="text-[14px] font-bold text-white flex items-center gap-2">
              <BookText className="w-4 h-4 text-white" />
              <span>Название книги (проверка уникальности в базе данных):</span>
            </label>

            {titleUniqueStatus.message && (
              <div
                className={`flex items-center gap-1.5 text-[14px] font-bold px-2.5 py-1 border ${
                  titleUniqueStatus.isUnique
                    ? 'text-white bg-zinc-900 border-zinc-600'
                    : 'text-rose-200 bg-rose-950/70 border-rose-600'
                }`}
              >
                {titleUniqueStatus.isUnique ? (
                  <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{titleUniqueStatus.message}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch gap-2.5">
            <NoirVoiceInput
              value={title}
              onValueChange={handleTitleChange}
              voiceContext="book_title"
              disabled={readOnly}
              placeholder="Введите название будущей книги..."
              className="text-[15px] font-bold"
              containerClassName="flex-1 min-w-0"
            />

            {currentBook && !readOnly && (
              <NoirButton
                variant="outline"
                onClick={handleSaveTitleOnly}
                loading={savingTitle}
                disabled={!title.trim() || !titleUniqueStatus.isUnique}
                icon={<Save className="w-4 h-4 text-white" />}
                className="shrink-0"
              >
                Зафиксировать название
              </NoirButton>
            )}
          </div>
        </div>

        {/* Separated Wrapping Sub-Tabs (zero horizontal scroll): Genres / Style / Concept / Drafts & AI */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap items-stretch gap-2 pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={() => setActiveSubTab('genres')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'genres'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Конструктор жанров ({selectedGenres.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('style')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'style'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Конструктор стиля ({activeStyle.styleName || 'По умолчанию'})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('concept')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'concept'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Сюжет и мир</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('drafts')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'drafts'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 text-rose-400" />
            <span>Черновики и указания ИИ</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: GENRES CONSTRUCTOR */}
      {activeSubTab === 'genres' && (
        <div className="flex flex-col gap-6">
          {/* Selected genres and weights */}
          <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-zinc-700">
              <div>
                <h3 className="text-[17px] font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-white" />
                  <span>Выбранные жанры для книги (от 1 до 5):</span>
                </h3>
                <p className="text-[14px] text-zinc-400">
                  Настройте пропорции влияния каждого жанра на атмосферу и события.
                </p>
              </div>

              {!readOnly && (
                <NoirButton
                  variant="outline"
                  onClick={() => setIsAddGenreModalOpen(true)}
                  icon={<Plus className="w-4 h-4 text-white" />}
                >
                  Создать свой жанр
                </NoirButton>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedGenres.map((g) => (
                <div key={g.genre} className="p-3.5 bg-zinc-950 border border-zinc-700 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[14px] text-white truncate">{g.genre}</span>
                    <button
                      type="button"
                      onClick={() => toggleGenre(g.genre)}
                      className="text-zinc-400 hover:text-rose-400 text-[14px] px-1 cursor-pointer"
                      title="Удалить жанр"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={5}
                      max={100}
                      step={5}
                      value={g.weight}
                      onChange={(e) => updateWeight(g.genre, parseInt(e.target.value, 10))}
                      className="flex-1 accent-white cursor-pointer"
                    />
                    <span className="font-mono text-[14px] font-bold text-white w-10 text-right">
                      {g.weight}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Catalog of 100 genres */}
          <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="flex-1 min-w-0 flex items-center gap-2">
                <Search className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:block" />
                <NoirVoiceInput
                  value={genreSearch}
                  onValueChange={setGenreSearch}
                  voiceContext="genre_search"
                  placeholder="Поиск по 100 жанрам литературы..."
                />
              </div>

              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-zinc-400 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="min-h-[44px] px-3 noir-input text-[14px] font-bold"
                >
                  {GENRE_CATEGORIES.map((c) => (
                    <option key={c} value={c} className="bg-zinc-900 text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {filteredGenres.map((item) => {
                const isSelected = selectedGenres.some((g) => g.genre === item.name);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleGenre(item.name)}
                    className={`p-2.5 text-left border flex flex-col justify-between transition cursor-pointer ${
                      isSelected
                        ? 'bg-white text-black border-white font-bold shadow-md'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
                    }`}
                  >
                    <span className="text-[14px] leading-snug line-clamp-2">{item.name}</span>
                    <span
                      className={`text-[14px] font-mono mt-1 ${
                        isSelected ? 'text-zinc-800' : 'text-zinc-400'
                      }`}
                    >
                      {item.category}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: STYLE CONSTRUCTOR (Separate from Genres) */}
      {activeSubTab === 'style' && (
        <StyleConstructorPanel
          activeStyle={activeStyle}
          onChangeStyle={setActiveStyle}
          onSaveStyle={handleSaveStyleConfig}
          userUid={userUid}
        />
      )}

      {/* SECTION 3: CONCEPT & PLOT ARCHETYPES */}
      {activeSubTab === 'concept' && (
        <div className="flex flex-col gap-6">
          {/* Booker's 7 Basic Plots */}
          <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
            <BasicPlotSelector
              selectedPlotIds={selectedPlots}
              onChange={(plots) => setSelectedPlots(plots)}
            />
          </div>

          {/* Tone, Audience, Setting, Conflict */}
          <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
            <h3 className="text-[17px] font-bold text-white flex items-center gap-2 pb-2 border-b border-zinc-700">
              <Compass className="w-4 h-4 text-white" />
              <span>Параметры мира и масштаба:</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Тональность повествования:
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  {TONE_OPTIONS.map((t) => (
                    <option key={t} value={t} className="bg-zinc-900 text-white">
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Целевая аудитория:
                </label>
                <select
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  {AUDIENCE_OPTIONS.map((a) => (
                    <option key={a} value={a} className="bg-zinc-900 text-white">
                      {a}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Целевой объем книги:
                </label>
                <select
                  value={targetChapters}
                  onChange={(e) => setTargetChapters(parseInt(e.target.value, 10))}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  {[5, 10, 20, 50, 100].map((num) => (
                    <option key={num} value={num} className="bg-zinc-900 text-white">
                      {num} глав (полный роман)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Сеттинг и среда действия:
              </label>
              <NoirVoiceTextarea
                minRows={2}
                maxRows={8}
                value={setting}
                onValueChange={setSetting}
                voiceContext="book_setting"
                placeholder="Опишите мир, эпоху и атмосферу книги или продиктуйте голосом..."
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Центральный конфликт:
              </label>
              <NoirVoiceTextarea
                minRows={2}
                maxRows={8}
                value={conflict}
                onValueChange={setConflict}
                voiceContext="book_conflict"
                disabled={readOnly}
                placeholder="Опишите главную интригу и конфликт или продиктуйте голосом..."
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Комментарий / пожелания автора для нейросети:
              </label>
              <NoirVoiceTextarea
                minRows={2}
                maxRows={6}
                value={authorInstructions}
                onValueChange={setAuthorInstructions}
                voiceContext="book_author_instructions"
                disabled={readOnly}
                placeholder="Укажите важные детали, стиль речи, табу или акценты для ИИ (можно голосом)..."
              />
            </div>

            {!readOnly && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-zinc-800">
                <div className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-400">
                  <span>
                    Списание ≈ <strong className="text-zinc-200 font-mono">{formatLettersCount(estimateTextOperationLetters(950 + setting.length + conflict.length + authorInstructions.length, 1800))}</strong> букв (1 токен = 1 буква).
                  </span>
                  <PricingInfoModalButton compact label="Тарифы ИИ" />
                </div>
                <NoirButton
                  variant="primary"
                  onClick={handleGenerateConcept}
                  loading={loading}
                  icon={<Sparkles className="w-4 h-4 text-black" />}
                >
                  Сгенерировать мир и концепцию книги
                </NoirButton>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: PERSONAL DRAFTS, OCR NOTES & AUTHOR AI INSTRUCTIONS */}
      {activeSubTab === 'drafts' && (
        <BookDraftsAndAiTab
          currentBook={currentBook}
          userUid={userUid}
          readOnly={readOnly}
          onBookUpdated={onBookCreated}
          onProceedToChapters={onProceedToChapters}
          authorInstructionsValue={authorInstructions}
          onAuthorInstructionsLocalChange={setAuthorInstructions}
        />
      )}

      {/* Book Metadata Preview / Editor */}
      {currentBook && (
        <BookConceptMetadataCard
          currentBook={currentBook}
          selectedPlots={selectedPlots}
          activeStyle={activeStyle}
          readOnly={readOnly}
          onBookUpdated={onBookCreated}
          onProceedToChapters={onProceedToChapters}
          onOpenDetails={() => setIsDetailsOpen(true)}
          onStatusMessage={setStatusMsg}
        />
      )}

      {isAddGenreModalOpen && (
        <NoirModal isOpen={isAddGenreModalOpen} onClose={() => setIsAddGenreModalOpen(false)} title="Создание своего литературного жанра" maxWidth="max-w-md">
          <form onSubmit={handleCreateCustomGenre} className="flex flex-col gap-3 text-white">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">Название жанра:</label>
              <NoirVoiceInput required value={newGenreName} onValueChange={setNewGenreName} voiceContext="custom_genre_name" placeholder="Например: Нео-шаманизм, Кибер-рок..." />
            </div>
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">Категория:</label>
              <select value={newGenreCategory} onChange={(e) => setNewGenreCategory(e.target.value)} className="w-full min-h-[44px] px-3 noir-input text-[14px]">
                {GENRE_CATEGORIES.filter((c) => c !== 'Все категории').map((c) => (
                  <option key={c} value={c} className="bg-zinc-900 text-white">{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">Краткое описание эстетики и тропов:</label>
              <NoirVoiceTextarea minRows={3} maxRows={8} value={newGenreDesc} onValueChange={setNewGenreDesc} voiceContext="custom_genre_description" placeholder="Опишите характерные элементы жанра..." />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" type="button" onClick={() => setIsAddGenreModalOpen(false)}>Отмена</NoirButton>
              <NoirButton variant="primary" type="submit" icon={<Sparkles className="w-4 h-4 text-black" />}>Создать и сохранить в базу</NoirButton>
            </div>
          </form>
        </NoirModal>
      )}

      {currentBook && isDetailsOpen && (
        <BookDetailsModal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          book={currentBook}
          userUid={userUid}
          onSelectRelatedBook={(relBook) => {
            onBookCreated(relBook);
            setIsDetailsOpen(false);
          }}
        />
      )}
    </div>
  );
};
