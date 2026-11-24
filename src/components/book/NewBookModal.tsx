import React, { useState, useId, useEffect } from 'react';
import {
  Sparkles,
  Upload,
  BookOpen,
  Coins,
  CheckCircle,
  AlertCircle,
  Layers,
  GitBranch,
  MessageSquarePlus,
} from 'lucide-react';
import { Book, BookCreationMode, DraftFragment, ParsedChapter, AppUser } from '../../types';
import { BookSequelModal } from './remake/BookSequelModal';
import { NewBookDraftsSection } from './create/NewBookDraftsSection';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { BasicPlotSelector } from '../plots/BasicPlotSelector';
import {
  splitBookIntoChapters,
  mergeDraftFragments,
  parseUploadedFileToText,
} from '../../services/import/bookParser';
import { analyzeAndEnrichBookWithAi, BookAiAnalysisResult } from '../../services/import/bookImportAi';
import { INITIAL_LETTERS_BALANCE } from '../../services/auth/authService';
import { estimateBookImportVolume, formatLettersCount, lettersToRubles } from '../../services/billing/costCalculator';
import { BALANCE_CHANGED_EVENT, getAuthoritativeBalance } from '../../services/billing/transactionService';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';

interface NewBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  availableBooks?: Book[];
  onBookCreated: (
    title: string,
    genres: string[],
    basicPlots: string[],
    createdChapters?: ParsedChapter[],
    aiAnalysis?: BookAiAnalysisResult
  ) => Promise<void>;
  onSequelCreated?: (result: { book: Book; chapters: any[]; characters: any[] }) => void;
  onUserBalanceUpdated?: (newBalance: number) => void;
}

export const NewBookModal: React.FC<NewBookModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  availableBooks = [],
  onBookCreated,
  onSequelCreated,
  onUserBalanceUpdated,
}) => {
  const [creationMode, setCreationMode] = useState<BookCreationMode | 'sequel'>('scratch');
  const [sequelSourceBook, setSequelSourceBook] = useState<Book | null>(null);
  const fileInputId = useId();

  // Mode 1: Scratch state
  const [scratchTitle, setScratchTitle] = useState('');
  const [scratchGenre, setScratchGenre] = useState('Темное фэнтези');
  const [scratchPlots, setScratchPlots] = useState<string[]>(['overcoming-the-monster']);

  // Mode 2: Drafts state
  const [draftTitle, setDraftTitle] = useState('');
  const [draftsList, setDraftsList] = useState<DraftFragment[]>([]);

  // Mode 3: Full Book state
  const [fullBookTitle, setFullBookTitle] = useState('');
  const [fullBookContent, setFullBookContent] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');

  // Book-level AI directives / fanfic canon / author comments
  const [authorInstructions, setAuthorInstructions] = useState('');

  // Processing & Loading State
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Current authoritative balance
  const [liveBalance, setLiveBalance] = useState<number>(currentUser?.letters_balance ?? INITIAL_LETTERS_BALANCE);
  const currentBalance = liveBalance;

  useEffect(() => {
    if (!isOpen) return;
    if (currentUser?.uid) {
      getAuthoritativeBalance(currentUser.uid)
        .then(setLiveBalance)
        .catch(() => setLiveBalance(currentUser.letters_balance ?? INITIAL_LETTERS_BALANCE));
    }
    const handleBal = (e: Event) => {
      const custom = e as CustomEvent<{ balance?: number }>;
      if (typeof custom.detail?.balance === 'number') {
        setLiveBalance(custom.detail.balance);
      }
    };
    window.addEventListener(BALANCE_CHANGED_EVENT, handleBal);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, handleBal);
  }, [isOpen, currentUser?.uid, currentUser?.letters_balance]);

  // Calculate volume & costs for Mode 2 (Drafts)
  const draftsCombinedText = draftsList.map((d) => d.content).join('\n\n');
  const draftsCost = estimateBookImportVolume(draftsCombinedText, true);

  // Calculate volume & costs for Mode 3 (Full book)
  const fullBookCost = estimateBookImportVolume(fullBookContent, true);

  // Handler: Upload single full book file
  const handleUploadFullBookFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    setIsProcessing(true);
    setProcessingStatus(`Анализ структуры файла ${file.name}...`);
    try {
      const parsed = await parseUploadedFileToText(file);
      setFullBookContent(parsed.text);
      setUploadedFileName(file.name);
      if (!fullBookTitle && parsed.detectedTitle) {
        setFullBookTitle(parsed.detectedTitle);
      }
    } catch (err: unknown) {
      setErrorMessage('Ошибка при чтении книги: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
      e.target.value = '';
    }
  };

  // Final submission for creating the book
  const handleSubmit = async () => {
    setErrorMessage('');

    // Mode 1: Scratch
    if (creationMode === 'scratch') {
      const title = scratchTitle.trim() || 'Новая книга';
      setIsProcessing(true);
      try {
        const scratchAnalysis: BookAiAnalysisResult | undefined = authorInstructions.trim()
          ? {
              title,
              synopsis_overview: '',
              genres: [scratchGenre],
              basic_plots: scratchPlots,
              characters: [],
              world_entities: [],
              chaptersWithSynopses: [],
              author_instructions: authorInstructions.trim(),
            }
          : undefined;
        await onBookCreated(title, [scratchGenre], scratchPlots, undefined, scratchAnalysis);
        onClose();
      } catch (err: unknown) {
        setErrorMessage('Ошибка создания книги: ' + (err instanceof Error ? err.message : ''));
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // Mode 2: From Drafts
    if (creationMode === 'drafts') {
      if (draftsList.length === 0) {
        setErrorMessage('Добавьте хотя бы один черновик или фрагмент текста.');
        return;
      }

      if (currentBalance < draftsCost.lettersCost) {
        setErrorMessage(
          `Недостаточно букв на балансе. Требуется: ${draftsCost.lettersCost.toLocaleString()} букв, на балансе: ${currentBalance.toLocaleString()} букв.`
        );
        return;
      }

      setIsProcessing(true);
      setProcessingStatus('Объединение черновиков и распределение по главам...');

      try {
        const { chapters } = mergeDraftFragments(draftsList);
        const title = draftTitle.trim() || draftsList[0].title || 'Сборник черновиков';

        const outcome = await runWithGenerationOverlay(
          {
            title: `Разбор черновиков «${title}»`,
            subtitle: `Глав к анализу: ${chapters.length}`,
            initialStatus: 'ИИ анализирует сюжет, персонажей и составляет синопсис глав...',
            totalSteps: 1,
            estimatedLetters: draftsCost.lettersCost,
          },
          async (ctx) => {
            const aiResult = await analyzeAndEnrichBookWithAi(title, chapters, {
              userUid: currentUser?.uid,
              authorInstructions,
              onProgress: (m) => {
                setProcessingStatus(m);
                ctx.setStatus(m);
              },
            });
            aiResult.drafts = draftsList;

            if (currentUser?.uid) {
              const freshBal = await getAuthoritativeBalance(currentUser.uid);
              setLiveBalance(freshBal);
              onUserBalanceUpdated?.(freshBal);
            }

            ctx.setStatus('Сохранение книги в библиотеку...');
            await onBookCreated(
              aiResult.title,
              aiResult.genres,
              aiResult.basic_plots,
              aiResult.chaptersWithSynopses,
              aiResult
            );
            ctx.addApplied(`Книга «${aiResult.title}» (${chapters.length} гл.) сохранена в библиотеку`);
            ctx.setProgress(1, 1);
            return aiResult;
          }
        );

        if (outcome.stopped && !outcome.result) {
          setErrorMessage('Операция остановлена. Списано только за отправленный запрос; черновики сохранены.');
          return;
        }
        onClose();
      } catch (err: unknown) {
        setErrorMessage('Ошибка при импорте черновиков: ' + (err instanceof Error ? err.message : ''));
      } finally {
        setIsProcessing(false);
        setProcessingStatus('');
      }
      return;
    }

    // Mode 3: Full Book
    if (creationMode === 'full-book') {
      if (!fullBookContent.trim()) {
        setErrorMessage('Загрузите файл книги или вставьте текст произведения.');
        return;
      }

      if (currentBalance < fullBookCost.lettersCost) {
        setErrorMessage(
          `Недостаточно букв на балансе. Требуется: ${fullBookCost.lettersCost.toLocaleString()} букв, на балансе: ${currentBalance.toLocaleString()} букв.`
        );
        return;
      }

      setIsProcessing(true);
      setProcessingStatus('Код автоматически разбивает книгу на главы (экономия токенов)...');

      try {
        const rawTitle = fullBookTitle.trim() || uploadedFileName.replace(/\.[^/.]+$/, '') || 'Импортированная книга';
        const parsedChapters = splitBookIntoChapters(fullBookContent, rawTitle);

        const outcome = await runWithGenerationOverlay(
          {
            title: `Импорт и ИИ-разбор «${rawTitle}»`,
            subtitle: `Выделено глав: ${parsedChapters.length}`,
            initialStatus: `Выделено глав: ${parsedChapters.length}. ИИ составляет синопсисы и карточки мира...`,
            totalSteps: 1,
            estimatedLetters: fullBookCost.lettersCost,
          },
          async (ctx) => {
            const aiResult = await analyzeAndEnrichBookWithAi(rawTitle, parsedChapters, {
              userUid: currentUser?.uid,
              authorInstructions,
              onProgress: (m) => {
                setProcessingStatus(m);
                ctx.setStatus(m);
              },
            });

            if (currentUser?.uid) {
              const freshBal = await getAuthoritativeBalance(currentUser.uid);
              setLiveBalance(freshBal);
              onUserBalanceUpdated?.(freshBal);
            }

            ctx.setStatus('Фиксация книги и персонажей на сервере...');
            await onBookCreated(
              aiResult.title,
              aiResult.genres,
              aiResult.basic_plots,
              aiResult.chaptersWithSynopses,
              aiResult
            );
            ctx.addApplied(`Книга «${aiResult.title}» (${parsedChapters.length} гл.) и карточки мира сохранены`);
            ctx.setProgress(1, 1);
            return aiResult;
          }
        );

        if (outcome.stopped && !outcome.result) {
          setErrorMessage('Операция остановлена. Списано только за отправленный запрос; текст книги сохранен.');
          return;
        }
        onClose();
      } catch (err: unknown) {
        setErrorMessage('Ошибка импорта книги: ' + (err instanceof Error ? err.message : ''));
      } finally {
        setIsProcessing(false);
        setProcessingStatus('');
      }
    }
  };

  return (
    <NoirModal isOpen={isOpen} onClose={onClose} title="Создание книги в KnigAI" maxWidth="max-w-4xl">
      <div className="flex flex-col gap-5 text-white max-h-[82vh] overflow-y-auto pr-1 select-none">
        {/* User Balance Header Badge */}
        <div className="noir-container p-3 sm:p-4 border border-zinc-700 bg-zinc-950/90 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-rose-500" />
            <div>
              <span className="text-[14px] text-zinc-400">Ваш баланс:</span>{' '}
              <strong className="text-[15px] font-mono text-white">
                {currentBalance.toLocaleString()} букв
              </strong>
              <span className="text-[14px] text-zinc-400 ml-1">
                (≈ {Math.round((currentBalance / 100000) * 15).toLocaleString()} ₽)
              </span>
            </div>
          </div>
          <div className="text-[14px] font-mono text-zinc-400">
            Тариф: <strong className="text-white">100 000 букв = 15 ₽</strong> (без подписок)
          </div>
        </div>

        {/* 3 Creation Mode Buttons */}
        <div>
          <label className="block text-[14px] font-bold text-white mb-2">
            Выберите режим создания:
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setCreationMode('scratch')}
              className={`p-3 text-left border transition cursor-pointer flex flex-col justify-between min-h-[90px] ${
                creationMode === 'scratch'
                  ? 'bg-white text-black border-white font-bold'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-rose-600" />
                <span className="text-[15px] font-bold">1. Создать с нуля</span>
              </div>
              <p className="text-[14px] opacity-75 mt-1 leading-snug">
                Классический конструктор с чистым холстом и выбором сюжета.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setCreationMode('drafts')}
              className={`p-3 text-left border transition cursor-pointer flex flex-col justify-between min-h-[90px] ${
                creationMode === 'drafts'
                  ? 'bg-white text-black border-white font-bold'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-rose-600" />
                <span className="text-[15px] font-bold">2. Из черновиков</span>
              </div>
              <p className="text-[14px] opacity-75 mt-1 leading-snug">
                Поочередная загрузка фрагментов и их объединение в единую книгу.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setCreationMode('full-book')}
              className={`p-3 text-left border transition cursor-pointer flex flex-col justify-between min-h-[90px] ${
                creationMode === 'full-book'
                  ? 'bg-white text-black border-white font-bold'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-rose-600" />
                <span className="text-[15px] font-bold">3. Из готовой книги</span>
              </div>
              <p className="text-[14px] opacity-75 mt-1 leading-snug">
                Загрузка epub, fb2, txt, docx, pdf или вставка полного текста.
              </p>
            </button>
          </div>

          {availableBooks.length > 0 && (
            <button
              type="button"
              onClick={() => setCreationMode('sequel')}
              className={`p-3 text-left border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                creationMode === 'sequel'
                  ? 'bg-rose-600 text-white border-rose-500 font-bold'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-rose-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <GitBranch className={`w-4 h-4 ${creationMode === 'sequel' ? 'text-white' : 'text-rose-500'}`} />
                <span className="text-[15px] font-bold">4. Продолжение (Сиквел, Приквел, Спин-офф из библиотеки)</span>
              </div>
              <span className={`text-[14px] ${creationMode === 'sequel' ? 'text-rose-100' : 'text-zinc-400'}`}>
                На основе вашей книги или книги из общей библиотеки ({availableBooks.length})
              </span>
            </button>
          )}
        </div>

        {/* MODE 4: SEQUEL / PREQUEL FROM EXISTING BOOK */}
        {creationMode === 'sequel' && (
          <div className="flex flex-col gap-3 pt-2 border-t border-zinc-800">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Выберите первоисточник (свою книгу или книгу из общей библиотеки), чтобы ИИ перенёс канон, персонажей и создал связанное продолжение:
            </p>
            <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
              {availableBooks.map((ab) => (
                <button
                  key={ab.id}
                  type="button"
                  onClick={() => setSequelSourceBook(ab)}
                  className="p-3 bg-zinc-950/80 hover:bg-zinc-900 border border-zinc-800 hover:border-rose-500 text-left flex items-center justify-between gap-3 transition cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <h4 className="text-[15px] font-bold text-white truncate">{ab.title}</h4>
                    <p className="text-[14px] text-zinc-400 truncate">
                      {ab.author} · {ab.target_chapters} глав
                    </p>
                  </div>
                  <span className="px-3 py-1.5 bg-rose-600 text-white font-bold text-[14px] shrink-0">
                    Выбрать →
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* MODE 1: CREATE FROM SCRATCH */}
        {creationMode === 'scratch' && (
          <div className="flex flex-col gap-4 pt-2 border-t border-zinc-800">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Название будущей книги:
              </label>
              <NoirVoiceInput
                value={scratchTitle}
                onValueChange={setScratchTitle}
                voiceContext="new_book_title"
                placeholder="Например: Сердце пустоты..."
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Ведущий литературный жанр:
              </label>
              <select
                value={scratchGenre}
                onChange={(e) => setScratchGenre(e.target.value)}
                className="w-full min-h-[44px] px-3 noir-input text-[14px]"
              >
                <option value="Темное фэнтези">Темное фэнтези</option>
                <option value="Киберпанк">Киберпанк</option>
                <option value="Детектив нуар">Детектив нуар</option>
                <option value="Комедия">Комедия</option>
                <option value="Фанфик">Фанфик</option>
                <option value="Ужасы и хоррор">Ужасы и хоррор</option>
                <option value="Поэма и стихи">Поэма и стихи</option>
                <option value="Космоопера">Космоопера</option>
                <option value="Исекай (Попаданцы)">Исекай (Попаданцы)</option>
                <option value="Постапокалипсис">Постапокалипсис</option>
              </select>
            </div>

            <div className="pt-2 border-t border-zinc-800">
              <BasicPlotSelector
                selectedPlotIds={scratchPlots}
                onChange={setScratchPlots}
                maxSelections={3}
              />
            </div>
          </div>
        )}

        {/* MODE 2: FROM DRAFTS */}
        {creationMode === 'drafts' && (
          <NewBookDraftsSection
            draftTitle={draftTitle}
            onDraftTitleChange={setDraftTitle}
            draftsList={draftsList}
            onDraftsListChange={setDraftsList}
            draftsCost={draftsCost}
            currentBalance={currentBalance}
            userUid={currentUser?.uid}
            isProcessing={isProcessing}
            onSetBusy={(busy, statusTxt) => {
              setIsProcessing(busy);
              if (statusTxt !== undefined) setProcessingStatus(statusTxt);
            }}
            onError={setErrorMessage}
          />
        )}

        {/* MODE 3: FROM FULL BOOK */}
        {creationMode === 'full-book' && (
          <div className="flex flex-col gap-4 pt-2 border-t border-zinc-800">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Название книги:
              </label>
              <NoirVoiceInput
                value={fullBookTitle}
                onValueChange={setFullBookTitle}
                voiceContext="new_book_full_title"
                placeholder="Например: Война миров..."
              />
            </div>

            {/* File Upload Trigger */}
            <div className="flex flex-wrap items-center gap-2">
              <label
                htmlFor={`full-book-upload-${fileInputId}`}
                className="min-h-[44px] px-4 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-2 cursor-pointer text-[14px]"
              >
                <Upload className="w-4 h-4 text-rose-500" />
                <span>Загрузить файл книги (epub, fb2, txt, docx, pdf)</span>
              </label>
              <input
                id={`full-book-upload-${fileInputId}`}
                type="file"
                accept=".epub,.fb2,.txt,.docx,.doc,.pdf"
                onChange={handleUploadFullBookFile}
                className="hidden"
              />
              {uploadedFileName && (
                <span className="text-[14px] text-zinc-300 font-mono border border-zinc-700 px-2 py-1">
                  Загружен: {uploadedFileName}
                </span>
              )}
            </div>

            {/* Direct Text Paste */}
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Или вставьте полный текст книги сюда:
              </label>
              <NoirVoiceTextarea
                value={fullBookContent}
                onValueChange={setFullBookContent}
                voiceContext="new_book_full_content"
                placeholder="Вставьте полный текст книги с главами или продиктуйте фрагмент..."
                minRows={6}
              />
            </div>

            {/* Chapter Pre-Split & Cost Calculator */}
            {fullBookContent.trim().length > 0 && (
              <div className="noir-container p-3.5 bg-zinc-950 border border-zinc-700 flex flex-col gap-2 text-[14px]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-1.5">
                  <div className="font-bold text-white flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-rose-500" />
                    <span>Автоматический анализ объема произведения:</span>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[14px] font-mono border ${
                      currentBalance >= fullBookCost.lettersCost
                        ? 'bg-zinc-900 text-white border-white'
                        : 'bg-rose-950 text-rose-300 border-rose-500'
                    }`}
                  >
                    {currentBalance >= fullBookCost.lettersCost
                      ? 'Хватает средств на балансе'
                      : 'Недостаточно букв на балансе'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[14px]">
                  <div>
                    <span className="text-zinc-400 block">Символов:</span>
                    <strong className="text-white">{formatLettersCount(fullBookCost.charCount)}</strong>
                    <span className="text-zinc-500 block">без пробелов: {formatLettersCount(fullBookCost.nonSpaceCharCount)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Слов / глав:</span>
                    <strong className="text-white">{formatLettersCount(fullBookCost.wordCount)}</strong>
                    <span className="text-zinc-500 block">глав: {splitBookIntoChapters(fullBookContent).length}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Стоимость ИИ:</span>
                    <strong className="text-rose-400">{formatLettersCount(fullBookCost.lettersCost)} букв</strong>
                    <span className="text-zinc-400 block">≈ {fullBookCost.rublesCost} ₽</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Ваш баланс:</span>
                    <strong className="text-white">{formatLettersCount(currentBalance)}</strong>
                    <span className="text-zinc-500 block">≈ {lettersToRubles(currentBalance)} ₽</span>
                  </div>
                </div>

                <p className="text-[14px] text-zinc-400 pt-1.5 border-t border-zinc-900 leading-snug">
                  Экономия токенов (763): парсер делит главы без затрат нейросети, а Decisions 763 автоматически подбирает до 5 жанров, стиль и до 3 сюжетов KnigAI по льготному тарифу 0.25×.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Author AI Directives across Scratch / Drafts / Full Book */}
        {creationMode !== 'sequel' && (
          <div className="p-3.5 bg-zinc-950/90 border border-rose-500/60 flex flex-col gap-2">
            <label className="text-[14px] font-bold text-white flex items-center gap-2">
              <MessageSquarePlus className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Пожелания и инструкции нейросети (учитываются при создании и во всех главах):</span>
            </label>
            <NoirVoiceTextarea
              value={authorInstructions}
              onValueChange={setAuthorInstructions}
              voiceContext="new_book_author_instructions"
              minRows={2}
              maxRows={6}
              placeholder="Стиль прозы, детали фанфика, ключевые правила мира, характер диалогов или что обязательно учесть/избегать..."
            />
          </div>
        )}

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-600 text-rose-200 text-[14px] flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Processing status banner */}
        {isProcessing && processingStatus && (
          <div className="p-3 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[14px] flex items-center gap-2 font-mono">
            <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent animate-spin shrink-0" />
            <span>{processingStatus}</span>
          </div>
        )}

        {/* Bottom Actions */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800 sticky bottom-0 bg-black/90 py-2">
          <NoirButton variant="subtle" onClick={onClose} disabled={isProcessing}>
            Отмена
          </NoirButton>
          {creationMode !== 'sequel' && (
            <NoirButton
              variant="primary"
              onClick={handleSubmit}
              loading={isProcessing}
              icon={<Sparkles className="w-4 h-4 text-black" />}
            >
              {creationMode === 'scratch'
                ? 'Создать книгу'
                : creationMode === 'drafts'
                ? `Объединить и создать (${draftsCost.lettersCost.toLocaleString()} букв)`
                : `Импортировать книгу (${fullBookCost.lettersCost.toLocaleString()} букв)`}
            </NoirButton>
          )}
        </div>
      </div>

      {sequelSourceBook && (
        <BookSequelModal
          isOpen={Boolean(sequelSourceBook)}
          onClose={() => setSequelSourceBook(null)}
          sourceBook={sequelSourceBook}
          userUid={currentUser?.uid}
          authorDefault={currentUser?.name}
          onSequelCreated={(created) => {
            onSequelCreated?.(created);
            setSequelSourceBook(null);
            onClose();
          }}
        />
      )}
    </NoirModal>
  );
};
