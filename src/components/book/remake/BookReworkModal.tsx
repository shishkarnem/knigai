import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  GitBranch,
  Layers,
  RefreshCw,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import {
  Book,
  BookReworkMode,
  BookReworkScope,
  Chapter,
  Character,
  WorldEntity,
} from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { NoirButton } from '../../common/NoirButton';
import { NoirStatus } from '../../common/NoirStatus';
import { NoirVoiceInput } from '../../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../../voice/NoirVoiceTextarea';
import { RubikMarkerHeading } from '../../landing/RubikMarkerHeading';
import { PricingInfoModalButton } from '../../billing/PricingInfoModalButton';
import {
  estimateTextOperationLetters,
  formatLettersCount,
} from '../../../services/billing/costCalculator';
import { TARGET_CHAPTER_CHARS } from '../../../services/ai/chapterBatchEngine';
import { orchestrateReworkChapterRange } from '../../../services/ai/rework/bookReworkService';
import { runWithGenerationOverlay } from '../../../services/ai/session/generationSession';

interface BookReworkModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapters: Chapter[];
  characters: Character[];
  worldEntities: WorldEntity[];
  initialChapterNumber?: number;
  initialMode?: BookReworkMode;
  initialScope?: BookReworkScope;
  userUid?: number;
  onChaptersUpdated: (chaps: Chapter[]) => void;
  onBookUpdated: (book: Book) => void;
  onBookBranched?: (newBook: Book, chaps: Chapter[]) => void;
}

export const BookReworkModal: React.FC<BookReworkModalProps> = ({
  isOpen,
  onClose,
  book,
  chapters,
  characters,
  worldEntities,
  initialChapterNumber,
  initialMode = 'edit',
  initialScope = 'current',
  userUid,
  onChaptersUpdated,
  onBookUpdated,
  onBookBranched,
}) => {
  const sortedChapters = useMemo(
    () => [...chapters].sort((a, b) => a.chapter_number - b.chapter_number),
    [chapters]
  );

  const firstChapNum = sortedChapters[0]?.chapter_number || 1;
  const [mode, setMode] = useState<BookReworkMode>(initialMode);
  const [scope, setScope] = useState<BookReworkScope>(initialScope);
  const [startChapter, setStartChapter] = useState<number>(initialChapterNumber || firstChapNum);
  const [thoughts, setThoughts] = useState('');
  const [createBranch, setCreateBranch] = useState(false);
  const [branchTitle, setBranchTitle] = useState(`[Переделка] ${book.title}`);
  const [updateSynopsesFirst, setUpdateSynopsesFirst] = useState(initialMode === 'remake');

  const [running, setRunning] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [doneCount, setDoneCount] = useState(0);
  const abortRef = useRef({ cancelled: false });

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setScope(initialScope);
      setStartChapter(initialChapterNumber || sortedChapters[0]?.chapter_number || 1);
      setUpdateSynopsesFirst(initialMode === 'remake');
      setBranchTitle(`[Переделка] ${book.title}`);
      setStatusMsg('');
      setErrorMsg('');
      setDoneCount(0);
      abortRef.current.cancelled = false;
    }
  }, [isOpen, initialMode, initialScope, initialChapterNumber, book.id, book.title]);

  const affectedCount = useMemo(() => {
    if (sortedChapters.length === 0) return 0;
    if (scope === 'all') return sortedChapters.length;
    if (scope === 'current') return sortedChapters.some((c) => c.chapter_number === startChapter) ? 1 : 0;
    return sortedChapters.filter((c) => c.chapter_number >= startChapter).length;
  }, [sortedChapters, scope, startChapter]);

  const estLettersPerChapter = estimateTextOperationLetters(
    2400 + thoughts.length,
    TARGET_CHAPTER_CHARS
  );
  const synopsisPassLetters =
    updateSynopsesFirst || mode === 'remake'
      ? estimateTextOperationLetters(1400 + thoughts.length, affectedCount * 420)
      : 0;
  const totalEstLetters = affectedCount * estLettersPerChapter + synopsisPassLetters;

  const handleStart = async () => {
    if (sortedChapters.length === 0) {
      setErrorMsg('В этой книге пока нет глав для переработки. Сначала создайте план глав.');
      return;
    }
    if (mode === 'remake' && !thoughts.trim()) {
      setErrorMsg('Для полного ремейка укажите новые мысли, повороты или пожелания.');
      return;
    }

    abortRef.current.cancelled = false;
    setRunning(true);
    setErrorMsg('');
    setDoneCount(0);
    setStatusMsg('Запуск конвейера переработки книги...');

    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: mode === 'remake' ? 'Полный ремейк книги' : 'Литературная редактура книги',
          subtitle: `«${book.title}» (${affectedCount} гл.)`,
          initialStatus: 'Запуск конвейера переработки книги...',
          totalSteps: affectedCount,
          estimatedLetters: totalEstLetters,
          onRequestStop: () => {
            abortRef.current.cancelled = true;
          },
        },
        async (ctx) => {
          const result = await orchestrateReworkChapterRange({
            book,
            chapters: sortedChapters,
            mode,
            scope,
            startChapterNumber: startChapter,
            thoughts,
            createBranch,
            branchTitle,
            updateSynopsesFirst: updateSynopsesFirst || mode === 'remake',
            worldEntities,
            characters,
            userUid,
            abortRef: abortRef.current,
            onProgress: (msg) => {
              setStatusMsg(msg);
              ctx.setStatus(msg);
            },
            onChapterSaved: (_updated, workingList) => {
              setDoneCount((prev) => prev + 1);
              if (!createBranch) {
                onChaptersUpdated(workingList);
              }
            },
            onBookUpdated: (updBook) => {
              if (!createBranch) {
                onBookUpdated(updBook);
              }
            },
          });

          if (createBranch && onBookBranched) {
            onBookBranched(result.book, result.chapters);
          } else {
            onBookUpdated(result.book);
            onChaptersUpdated(result.chapters);
          }

          return result;
        }
      );

      if (outcome.stopped) {
        setStatusMsg(
          `Операция остановлена. Списано по факту: ${formatLettersCount(outcome.spentLetters)} б., применено: ${outcome.appliedItems.length} шт.`
        );
      } else if (outcome.result) {
        setStatusMsg(
          `Готово! Обработано глав: ${outcome.result.processedCount}. ${
            createBranch
              ? 'Создана новая книга-ветка.'
              : 'Предыдущие версии сохранены в Истории версий.'
          }`
        );
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка переработки текста');
    } finally {
      setRunning(false);
    }
  };

  if (!isOpen) return null;

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={running ? () => {} : onClose}
      title="Улучшение и переделка книги"
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        <div className="p-3.5 bg-zinc-950/75 border border-zinc-700 flex flex-col gap-1">
          <RubikMarkerHeading
            text={`Переработка: ${book.title}`}
            as="h3"
            className="text-[20px] leading-snug text-white break-words"
          />
          <p className="text-[14px] text-zinc-400">
            Выберите глубину переработки: аккуратная редактура текста или полный ремейк по новым мыслям с сохранением отката версий.
          </p>
        </div>

        {/* 1. Transformation Mode */}
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
            <Wand2 className="w-4 h-4 text-rose-500" />
            <span>1. Режим переработки текста:</span>
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={running}
              onClick={() => {
                setMode('edit');
                setUpdateSynopsesFirst(false);
              }}
              className={`p-3.5 text-left border transition cursor-pointer flex flex-col gap-1 rounded-none ${
                mode === 'edit'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-950/80 text-zinc-200 border-zinc-700 hover:border-white'
              }`}
            >
              <span className="text-[15px] font-bold flex items-center gap-1.5">
                <RefreshCw className={`w-4 h-4 ${mode === 'edit' ? 'text-rose-600' : 'text-rose-500'}`} />
                <span>Литературная редактура</span>
              </span>
              <span className={`text-[14px] ${mode === 'edit' ? 'text-zinc-800' : 'text-zinc-400'}`}>
                Сохраняет сюжет, факты и героев, но улучшает слог, диалоги, ритм и глубину сцен.
              </span>
            </button>

            <button
              type="button"
              disabled={running}
              onClick={() => {
                setMode('remake');
                setUpdateSynopsesFirst(true);
              }}
              className={`p-3.5 text-left border transition cursor-pointer flex flex-col gap-1 rounded-none ${
                mode === 'remake'
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-zinc-950/80 text-zinc-200 border-zinc-700 hover:border-white'
              }`}
            >
              <span className="text-[15px] font-bold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-white" />
                <span>Полный ремейк по мыслям</span>
              </span>
              <span className={`text-[14px] ${mode === 'remake' ? 'text-rose-100' : 'text-zinc-400'}`}>
                Перестраивает синопсисы и полностью переписывает главы с нуля по новым идеям.
              </span>
            </button>
          </div>
        </div>

        {/* 2. Scope Selection */}
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
            <Layers className="w-4 h-4 text-rose-500" />
            <span>2. Охват глав ({sortedChapters.length} в книге):</span>
          </span>
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'current' as const, label: `Только глава #${startChapter}` },
              { id: 'from_current' as const, label: `От главы #${startChapter} до конца` },
              { id: 'all' as const, label: `Вся книга с 1-й главы (${sortedChapters.length} гл.)` },
            ].map((sc) => (
              <button
                key={sc.id}
                type="button"
                disabled={running}
                onClick={() => setScope(sc.id)}
                className={`relative min-h-[42px] px-3.5 py-1.5 text-[14px] font-bold border transition cursor-pointer rounded-none ${
                  scope === sc.id
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-white hover:text-white'
                }`}
              >
                <span>{sc.label}</span>
              </button>
            ))}
          </div>

          {scope !== 'all' && sortedChapters.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1">
              <label className="text-[14px] text-zinc-300 font-bold shrink-0">
                Стартовая глава:
              </label>
              <select
                disabled={running}
                value={startChapter}
                onChange={(e) => setStartChapter(Number(e.target.value))}
                className="flex-1 min-h-[42px] px-3 noir-input text-[14px] rounded-none"
              >
                {sortedChapters.map((ch) => (
                  <option key={ch.id || ch.chapter_number} value={ch.chapter_number} className="bg-zinc-950 text-white">
                    #{ch.chapter_number} — {ch.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 3. New thoughts & guidance */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-white">
            3. {mode === 'remake' ? 'Новые мысли и повороты сюжета:' : 'Что именно улучшить в тексте:'}
          </label>
          <NoirVoiceTextarea
            minRows={3}
            maxRows={8}
            value={thoughts}
            onValueChange={setThoughts}
            voiceContext="book_rework_thoughts"
            placeholder={
              mode === 'remake'
                ? 'Опишите новый вектор сюжета, смену мотивации героев, неожиданные твисты или стиль (можно надиктовать голосом)...'
                : 'Например: убери воду, добавь жёсткого нуар-напряжения в диалогах, глубже раскрой детали окружения...'
            }
          />
        </div>

        {/* 4. Branching & Synopsis Options */}
        <div className="p-3.5 bg-zinc-950/75 border border-zinc-800 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={running}
              onClick={() => setCreateBranch(false)}
              className={`min-h-[40px] px-3.5 py-1.5 text-[14px] font-bold border transition cursor-pointer rounded-none ${
                !createBranch
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
              }`}
            >
              Обновить в текущей книге (сохранить откат версий)
            </button>
            <button
              type="button"
              disabled={running}
              onClick={() => setCreateBranch(true)}
              className={`min-h-[40px] px-3.5 py-1.5 text-[14px] font-bold border transition cursor-pointer flex items-center gap-1.5 rounded-none ${
                createBranch
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
              }`}
            >
              <GitBranch className="w-4 h-4" />
              <span>Ответвить как новую книгу-ремейк</span>
            </button>
          </div>

          {createBranch && (
            <div>
              <label className="block text-[14px] text-zinc-300 mb-1 font-bold">
                Название новой ветки книги:
              </label>
              <NoirVoiceInput
                value={branchTitle}
                onValueChange={setBranchTitle}
                voiceContext="rework_branch_title"
              />
            </div>
          )}

          {mode === 'edit' && (
            <label className="flex items-center gap-2 text-[14px] text-zinc-300 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={updateSynopsesFirst}
                onChange={(e) => setUpdateSynopsesFirst(e.target.checked)}
                disabled={running}
                className="w-4 h-4 accent-rose-600"
              />
              <span>Также освежить синопсисы выбранных глав перед редактурой текста</span>
            </label>
          )}
        </div>

        {/* Status & Errors */}
        {statusMsg && (
          <NoirStatus
            type={running ? 'loading' : 'info'}
            message={`${statusMsg}${running && affectedCount > 1 ? ` (готово: ${doneCount}/${affectedCount})` : ''}`}
          />
        )}
        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Cost estimate + Footer buttons */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
          <div className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-300">
            <span>
              Глав: <strong className="text-white">{affectedCount}</strong> · Оценка:{' '}
              <strong className="text-rose-400 font-mono">
                ≈ {formatLettersCount(totalEstLetters)} букв
              </strong>
            </span>
            <PricingInfoModalButton compact label="Тарифы" />
          </div>

          <div className="flex flex-wrap items-center gap-2 justify-end">
            {running ? (
              <button
                type="button"
                onClick={() => {
                  abortRef.current.cancelled = true;
                  setStatusMsg('Остановка после завершения текущей главы...');
                }}
                className="min-h-[44px] px-4 bg-zinc-900 hover:bg-rose-700 text-white border border-rose-500 font-bold text-[14px] cursor-pointer flex items-center gap-1.5 rounded-none"
              >
                <Square className="w-4 h-4 text-rose-400" />
                <span>Стоп (сохранит готовые)</span>
              </button>
            ) : (
              <>
                <NoirButton variant="subtle" onClick={onClose}>
                  Закрыть
                </NoirButton>
                <NoirButton
                  variant="primary"
                  onClick={handleStart}
                  disabled={affectedCount === 0}
                  icon={<Sparkles className="w-4 h-4 text-black" />}
                >
                  {mode === 'remake' ? 'Запустить ремейк' : 'Запустить редактуру'}
                </NoirButton>
              </>
            )}
          </div>
        </div>
      </div>
    </NoirModal>
  );
};
