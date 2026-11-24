import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Layers, Play, Search, Plus, Square, Wand2, Maximize2, Sparkles } from 'lucide-react';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirStatus } from '../../components/common/NoirStatus';
import { saveChapter, fetchChapters, fetchWorldEntities, saveWorldEntity, updateBook } from '../../services/db/bookRepository';
import { BasicPlotBadge } from '../../components/plots/BasicPlotBadge';
import { orchestrateCascadeChapterRich, orchestrateSynopsisBatch } from '../../services/ai/orchestrator';
import { estimateA5Pages, GPT6_LUNA_SPECS } from '../../services/ai/chapterBatchEngine';
import { estimateBatchChaptersCost } from '../../services/ai/chapters/chapterCostEstimator';
import { estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { ChapterTextModal, ChapterEditModalNoir, ChapterArtModal } from '../../components/book/ChapterModals';
import { ChapterVolumeAndCostPanel } from '../../components/book/chapterGen/ChapterVolumeAndCostPanel';
import { ChapterCardItem } from '../../components/book/chapterGen/ChapterCardItem';
import { BookReworkModal } from '../../components/book/remake/BookReworkModal';
import { BookReadOnlyBanner } from '../../components/book/details/BookReadOnlyBanner';
import { FullscreenChapterWriter } from '../../components/writer/FullscreenChapterWriter';
import { AuthorAiCommentPanel } from '../../components/drafts/AuthorAiCommentPanel';
import { DraftsManagerPanel } from '../../components/drafts/DraftsManagerPanel';
import { fetchActiveAiDraftsContext, fetchDrafts } from '../../services/drafts/draftsRepository';
import { getCurrentUser } from '../../services/auth/authService';
import { getBookPermissions } from '../../services/book/bookPermissions';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';
import { PricingInfoModalButton } from '../../components/billing/PricingInfoModalButton';
import { isGenerationAbortedError, runWithGenerationOverlay } from '../../services/ai/session/generationSession';
import { Book, BookAudioTrack, Chapter, Character, WorldEntity } from '../../types';
import { ChapterAudioModal } from '../../components/book/audio/ChapterAudioModal';
import { fetchBookAudioTracks } from '../../services/voice/bookAudioService';
import { callProTalkDecision } from '../../services/ai/decision/protalkDecision';

interface ChaptersPageProps {
  book: Book;
  chapters: Chapter[];
  characters: Character[];
  onChaptersUpdated: (chaps: Chapter[]) => void;
  onBookUpdated?: (updatedBook: Book) => void;
  onNavigateToReader?: (chapNumber?: number) => void;
  userUid?: number;
}

export const ChaptersPage: React.FC<ChaptersPageProps> = ({
  book,
  chapters,
  characters,
  onChaptersUpdated,
  onBookUpdated,
  onNavigateToReader,
  userUid,
}) => {
  const currentUser = getCurrentUser();
  const perms = getBookPermissions(book, currentUser);
  const readOnly = !perms.canEditContent;

  const [activeRange, setActiveRange] = useState(1);
  const [search, setSearch] = useState('');
  const [editingChapter, setEditingChapter] = useState<Chapter | null>(null);
  const [inspectChapter, setInspectChapter] = useState<Chapter | null>(null);
  const [artChapter, setArtChapter] = useState<Chapter | null>(null);
  const [audioChapter, setAudioChapter] = useState<Chapter | null>(null);
  const [bookAudioTracks, setBookAudioTracks] = useState<BookAudioTrack[]>([]);
  const [writerChapter, setWriterChapter] = useState<Chapter | null>(null);
  const [showDraftsWorkspace, setShowDraftsWorkspace] = useState(false);
  const [activeAiDraftsCount, setActiveAiDraftsCount] = useState(0);
  const [worldEntities, setWorldEntities] = useState<WorldEntity[]>([]);
  const [cascadeLoading, setCascadeLoading] = useState(false);
  const [cascadeStatus, setCascadeStatus] = useState('');
  const [cascadeError, setCascadeError] = useState('');
  const [isReworkModalOpen, setIsReworkModalOpen] = useState(false);
  const [chapterScores, setChapterScores] = useState<Record<number, number>>({});
  const [scoringChapterId, setScoringChapterId] = useState<number | null>(null);

  // Selectable batch sizes & volume (pages A5 + words)
  const [synopsisCount, setSynopsisCount] = useState<number>(10);
  const [fullChaptersCount, setFullChaptersCount] = useState<number>(1);
  const [targetPages, setTargetPages] = useState<number>(10);
  const [targetWords, setTargetWords] = useState<number>(2000);
  const [activeDraftsChars, setActiveDraftsChars] = useState<number>(0);
  const cancelBatchRef = useRef(false);

  useEffect(() => {
    fetchDrafts({ userUid: userUid ?? book.user_uid, bookId: book.id, includeUnattached: false })
      .then((list) => setActiveAiDraftsCount(list.filter((d) => d.include_in_ai && d.status !== 'archive').length))
      .catch(() => {});
    fetchActiveAiDraftsContext({ bookId: book.id, userUid: userUid ?? book.user_uid })
      .then((res) => setActiveDraftsChars((res.bookDraftsBlock + res.chapterDraftsBlock).length))
      .catch(() => setActiveDraftsChars(0));
    fetchBookAudioTracks(book.id)
      .then(setBookAudioTracks)
      .catch(() => setBookAudioTracks([]));
  }, [book.id, userUid, book.user_uid]);

  // Sync fresh chapters from PostgreSQL on page mount / book switch / tab focus
  useEffect(() => {
    let active = true;
    const syncFreshChapters = () => {
      fetchChapters(book.id, userUid)
        .then((fresh) => {
          if (!active || !fresh) return;
          if (fresh.length > 0) {
            onChaptersUpdated(fresh);
          }
        })
        .catch(() => {});
    };
    syncFreshChapters();
    window.addEventListener('focus', syncFreshChapters);
    return () => {
      active = false;
      window.removeEventListener('focus', syncFreshChapters);
    };
  }, [book.id, userUid]);

  useEffect(() => {
    let active = true;
    fetchWorldEntities(book.id)
      .then(async (entities) => {
        if (!active) return;
        const existingCharNames = new Set(
          entities.filter((e) => e.entity_type === 'character').map((e) => e.name.trim().toLowerCase())
        );
        const synced = [...entities];
        for (const ch of characters || []) {
          if (ch.name && !existingCharNames.has(ch.name.trim().toLowerCase())) {
            const saved = await saveWorldEntity(
              {
                book_id: book.id,
                entity_type: 'character',
                name: ch.name,
                subtitle_or_role: ch.role || 'Персонаж',
                description: ch.description || '',
                attributes: { traits: ch.traits || [] },
                visual_prompt: ch.visual_prompt || '',
                image_url: ch.visual_card_url || '',
              },
              undefined,
              userUid
            );
            synced.push(saved);
            existingCharNames.add(ch.name.trim().toLowerCase());
          }
        }
        if (active) setWorldEntities(synced);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [book.id, characters, userUid]);

  const pageSize = 25;
  const filteredChapters = chapters.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.title.toLowerCase().includes(q) || (c.synopsis && c.synopsis.toLowerCase().includes(q));
  });

  const totalPages = Math.max(1, Math.ceil(Math.max(chapters.length, book.target_chapters) / pageSize));

  const pagedChapters = search
    ? filteredChapters
    : chapters.filter(
        (c) =>
          c.chapter_number > (activeRange - 1) * pageSize &&
          c.chapter_number <= activeRange * pageSize
      );

  const maxChapterNum = chapters.length > 0 ? Math.max(...chapters.map((c) => c.chapter_number)) : 0;
  const effectiveTargetChapters = Math.max(book.target_chapters, chapters.length);
  const remainingToPlan = Math.max(0, effectiveTargetChapters - chapters.length);
  const effectiveSynopsisCount = Math.max(1, synopsisCount);
  const plannedEndNum = maxChapterNum + effectiveSynopsisCount;
  const pendingDraftChapters = chapters
    .filter((c) => !c.content || c.content.trim().length < 100)
    .sort((a, b) => a.chapter_number - b.chapter_number);

  const handleCreateManualChapterAndOpenWriter = async (initialContent = '', initialTitle = '') => {
    if (readOnly) return;
    const nextNum = chapters.reduce((m, c) => Math.max(m, c.chapter_number), 0) + 1;
    const created = await saveChapter(
      {
        book_id: book.id,
        chapter_number: nextNum,
        title: initialTitle.trim() || `Глава ${nextNum}`,
        synopsis: initialContent ? initialContent.slice(0, 220) : '',
        content: initialContent,
        illustration_url: '',
        illustration_prompt: '',
        status: initialContent.trim().length > 100 ? 'ready' : 'draft',
      },
      undefined,
      userUid
    );
    const next = [...chapters, created].sort((a, b) => a.chapter_number - b.chapter_number);
    onChaptersUpdated(next);
    setShowDraftsWorkspace(false);
    setWriterChapter(created);
  };

  const handleCreateChapterForAiSetup = async () => {
    if (readOnly) return;
    const nextNum = chapters.reduce((m, c) => Math.max(m, c.chapter_number), 0) + 1;
    const created = await saveChapter(
      {
        book_id: book.id,
        chapter_number: nextNum,
        title: `Глава ${nextNum}`,
        synopsis: '',
        content: '',
        illustration_url: '',
        illustration_prompt: '',
        status: 'draft',
        entity_ids: [],
      },
      undefined,
      userUid
    );
    const next = [...chapters, created].sort((a, b) => a.chapter_number - b.chapter_number);
    onChaptersUpdated(next);
    setInspectChapter(created);
  };

  // Cascade Batch Synopsis (JSON) — exact chosen batch size + sync target_chapters
  const handleBatchSynopsis = async () => {
    if (readOnly) return;
    setCascadeLoading(true);
    setCascadeError('');
    cancelBatchRef.current = false;
    const start = maxChapterNum + 1;
    const end = start + effectiveSynopsisCount - 1;
    const initialMsg = `Генерация JSON-плана глав #${start}–#${end} (модель ${GPT6_LUNA_SPECS.modelId})...`;
    setCascadeStatus(initialMsg);

    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: `План синопсисов: главы #${start}–#${end}`,
          subtitle: `Книга «${book.title}»`,
          initialStatus: initialMsg,
          totalSteps: effectiveSynopsisCount,
          estimatedLetters: synopsisEstLetters,
          onRequestStop: () => {
            cancelBatchRef.current = true;
          },
        },
        async (ctx) => {
          const batch = await orchestrateSynopsisBatch({
            book: end > book.target_chapters ? { ...book, target_chapters: end } : book,
            startChapter: start,
            endChapter: end,
            characters,
            worldEntities,
            existingChapters: chapters,
            userUid,
            onProgress: (m) => {
              setCascadeStatus(m);
              ctx.setStatus(m);
            },
          });

          if (!batch || batch.length === 0) {
            setCascadeError('Нейросеть не вернула распознанный список глав. Попробуйте еще раз.');
            return;
          }

          ctx.setStatus('Сохраняем полученные синопсисы глав в базу данных...');
          const newChaps: Chapter[] = [...chapters];
          for (const item of batch) {
            const existingIdx = newChaps.findIndex((c) => c.chapter_number === item.chapter_number);
            if (existingIdx >= 0) {
              newChaps[existingIdx] = {
                ...newChaps[existingIdx],
                title: item.title,
                synopsis: item.synopsis,
                entity_ids: item.entity_ids?.length ? item.entity_ids : newChaps[existingIdx].entity_ids,
              };
              await saveChapter(newChaps[existingIdx], newChaps[existingIdx].id, userUid);
            } else {
              const created = await saveChapter(
                {
                  book_id: book.id,
                  chapter_number: item.chapter_number,
                  title: item.title,
                  synopsis: item.synopsis,
                  content: '',
                  illustration_url: '',
                  illustration_prompt: '',
                  status: 'draft',
                  entity_ids: item.entity_ids || [],
                },
                undefined,
                userUid
              );
              newChaps.push(created);
            }
          }

          const sortedChaps = newChaps.sort((a, b) => a.chapter_number - b.chapter_number);
          onChaptersUpdated(sortedChaps);

          const actualMin = batch[0].chapter_number;
          const actualMax = batch[batch.length - 1].chapter_number;
          const newMaxSaved = sortedChaps.reduce((m, c) => Math.max(m, c.chapter_number), 0);
          if (newMaxSaved > book.target_chapters) {
            const updatedBook = { ...book, target_chapters: Math.max(newMaxSaved, sortedChaps.length) };
            await updateBook(updatedBook);
            onBookUpdated?.(updatedBook);
          }

          ctx.setProgress(batch.length, batch.length);
          ctx.addApplied(`План глав #${actualMin}–#${actualMax} (${batch.length} шт.)`);
          setCascadeStatus(
            `План глав #${actualMin}–#${actualMax} (добавлено/обновлено: ${batch.length} шт.) сохранен и синхронизирован с базой данных.`
          );
        }
      );

      if (outcome.stopped) {
        setCascadeStatus(
          `Генерация плана остановлена. Списано по факту: ${formatLettersCount(outcome.spentLetters)} б.`
        );
      }
    } catch (err: unknown) {
      if (!isGenerationAbortedError(err)) {
        setCascadeError('Ошибка при генерации синопсиса: ' + (err instanceof Error ? err.message : ''));
      }
    } finally {
      setCascadeLoading(false);
    }
  };

  // Cascade Write N Full Chapters sequentially with user-chosen pages/words & rolling continuity context
  const handleCascadeWriteBatch = async () => {
    if (readOnly) return;
    if (pendingDraftChapters.length === 0) {
      setCascadeError('Все запланированные главы уже содержат текст. Сначала добавьте новые синопсисы или главы.');
      return;
    }

    const targets = pendingDraftChapters.slice(0, fullChaptersCount);
    setCascadeLoading(true);
    setCascadeError('');
    cancelBatchRef.current = false;

    let workingList = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);

    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: `Каскадная генерация глав (${targets.length} шт.)`,
          subtitle: `Книга «${book.title}» (~${targets.length * targetPages} стр. А5 / ~${targets.length * targetWords} сл.)`,
          initialStatus: `Запуск каскадного написания ${targets.length} глав...`,
          totalSteps: targets.length,
          estimatedLetters: batchBreakdown.totalEstimatedLetters,
          onRequestStop: () => {
            cancelBatchRef.current = true;
          },
        },
        async (ctx) => {
          let savedCount = 0;
          for (let i = 0; i < targets.length; i++) {
            if (cancelBatchRef.current || ctx.isCancelled()) {
              setCascadeStatus(`Пакетная генерация остановлена. Сохранено глав: ${savedCount} из ${targets.length}.`);
              break;
            }

            const targetChap = targets[i];
            const prev = workingList.find((c) => c.chapter_number === targetChap.chapter_number - 1);
            const prevPrev = workingList.find((c) => c.chapter_number === targetChap.chapter_number - 2);

            const stepMsg = `[${i + 1}/${targets.length}] Написание полной главы #${targetChap.chapter_number} «${targetChap.title}» (~${targetPages} стр. А5 / ~${targetWords} сл.)...`;
            setCascadeStatus(stepMsg);
            ctx.setStatus(stepMsg);

            try {
              const rich = await orchestrateCascadeChapterRich({
                book,
                chapter: targetChap,
                allChapters: workingList,
                prevChapter: prev,
                prevPrevChapter: prevPrev,
                activeCharacters: characters,
                worldEntities,
                styleConfig: book.style_config,
                targetPages,
                targetWords,
                userUid,
                onProgress: (m) => {
                  const fullMsg = `[${i + 1}/${targets.length}] Глава #${targetChap.chapter_number}: ${m}`;
                  setCascadeStatus(fullMsg);
                  ctx.setStatus(fullMsg);
                },
              });

              const updated: Chapter = {
                ...targetChap,
                title: rich.title || targetChap.title,
                synopsis: rich.synopsis || targetChap.synopsis,
                content: rich.content,
                footnotes: rich.footnotes.length > 0 ? rich.footnotes : targetChap.footnotes,
                entity_ids: rich.entity_ids.length > 0 ? rich.entity_ids : targetChap.entity_ids,
                continuity_summary: rich.continuity_summary,
                status: 'ready',
              };

              const saved = await saveChapter(updated, targetChap.id, userUid);
              workingList = workingList
                .map((c) => (c.id === targetChap.id ? saved : c))
                .sort((a, b) => a.chapter_number - b.chapter_number);
              onChaptersUpdated(workingList);
              savedCount++;
              ctx.setProgress(savedCount, targets.length);
              ctx.addApplied(`Глава #${saved.chapter_number} «${saved.title}»`);
            } catch (stepErr) {
              if (isGenerationAbortedError(stepErr)) {
                setCascadeStatus(
                  `Каскад остановлен пользователем. Применено и сохранено глав: ${savedCount} из ${targets.length}.`
                );
                break;
              }
              throw stepErr;
            }
          }

          if (!cancelBatchRef.current && !ctx.isCancelled()) {
            setCascadeStatus(`Готово! Сгенерировано и сохранено в базу данных глав: ${savedCount}.`);
          }
        }
      );

      if (outcome.stopped) {
        setCascadeStatus(
          `Операция остановлена. Списано по факту: ${formatLettersCount(outcome.spentLetters)} б., применено: ${outcome.appliedItems.length} шт.`
        );
      }
    } catch (err: unknown) {
      if (!isGenerationAbortedError(err)) {
        setCascadeError('Ошибка каскада текста: ' + (err instanceof Error ? err.message : ''));
      }
    } finally {
      setCascadeLoading(false);
    }
  };

  const handleScoreChapter763 = async (chap: Chapter) => {
    if (!chap.content || chap.content.trim().length < 100) return;
    setScoringChapterId(chap.id);
    setCascadeError('');
    try {
      const res = await callProTalkDecision({
        text: `Глава #${chap.chapter_number} «${chap.title}»\nСинопсис: ${chap.synopsis || ''}\n\nТекст главы:\n${chap.content}`,
        instruction:
          'Оцени литературное качество, ритм сцен, живость диалогов, атмосферу и раскрытие конфликта главы по шкале от 1 до 5.',
        options: '1::Слабый черновик;;2::Нужна переработка;;3::Хорошо;;4::Сильная глава;;5::Идеальная проза',
        decisionType: 'score',
        userUid,
        bookId: book.id,
        bookTitle: book.title,
        chapterNumber: chap.chapter_number,
        promptKey: 'decision_chapter_qa',
        operationDescription: `Оценка качества гл.#${chap.chapter_number} (763)`,
        alertLink: 'chapters',
      });
      const score = Math.max(1, Math.min(5, res.scoreNumber || 3));
      setChapterScores((prev) => ({ ...prev, [chap.id]: score }));
      setCascadeStatus(
        `Оценка 763 для главы #${chap.chapter_number}: ${score}/5 (списано ${formatLettersCount(res.costLetters)} букв).`
      );
    } catch (err: unknown) {
      setCascadeError('Ошибка оценки главы 763: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setScoringChapterId(null);
    }
  };

  const textReadyCount = chapters.filter((c) => c.content && c.content.trim().length > 100).length;
  const totalBookPages = chapters.reduce((acc, c) => acc + estimateA5Pages(c.content), 0);

  const targetBatchChapters = useMemo(
    () => pendingDraftChapters.slice(0, fullChaptersCount),
    [pendingDraftChapters, fullChaptersCount]
  );
  const fullBatchCountActual = Math.min(fullChaptersCount, Math.max(1, pendingDraftChapters.length));
  const batchBreakdown = useMemo(
    () =>
      estimateBatchChaptersCost({
        book,
        targetChapters: targetBatchChapters,
        allChapters: chapters,
        worldEntities,
        activeCharacters: characters,
        targetPages,
        targetWords,
        activeDraftsChars,
      }),
    [book, targetBatchChapters, chapters, worldEntities, characters, targetPages, targetWords, activeDraftsChars]
  );
  const synopsisEstLetters = estimateTextOperationLetters(1100 + worldEntities.length * 40, effectiveSynopsisCount * 360);

  return (
    <div className="w-full flex flex-col gap-6 text-white min-w-0">
      <BookReadOnlyBanner
        book={book}
        perms={perms}
        currentUser={currentUser}
        onBookUpdated={onBookUpdated}
        onNavigateToReader={onNavigateToReader ? () => onNavigateToReader(1) : undefined}
        sectionLabel="редактирование и перегенерация глав"
      />

      {/* Cascade Generation Bar */}
      <div className="noir-container p-4 sm:p-5 border-2 border-white flex flex-col gap-4 shadow-xl min-w-0">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[19px] font-bold text-white tracking-tight flex items-center gap-2">
              <Layers className="w-5 h-5 text-rose-500 shrink-0" />
              <span>Каскад сюжета и глав ({effectiveTargetChapters} глав)</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowDraftsWorkspace(!showDraftsWorkspace)}
                    className={`min-h-[38px] px-3 border text-[14px] font-bold transition cursor-pointer flex items-center gap-1.5 rounded-none ${
                      showDraftsWorkspace
                        ? 'bg-rose-600 text-white border-rose-500'
                        : 'bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border-zinc-700'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-rose-400" />
                    <span>Черновики и указания ИИ ({activeAiDraftsCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsReworkModalOpen(true)}
                    className="min-h-[38px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-rose-400 border border-rose-500 text-[14px] font-bold transition cursor-pointer flex items-center gap-1.5 rounded-none"
                  >
                    <Wand2 className="w-4 h-4" />
                    <span>Улучшить / Переделать книгу</span>
                  </button>
                </>
              )}
              <PricingInfoModalButton compact label="Тарифы" />
            </div>
          </div>
          <p className="text-[14px] text-zinc-300">
            Синопсисов: <strong className="text-white">{chapters.length} из {effectiveTargetChapters}</strong> · Текст готов:{' '}
            <strong className="text-white">{textReadyCount} из {chapters.length || effectiveTargetChapters}</strong> · Объем книги:{' '}
            <strong className="text-rose-400">~{totalBookPages} стр. А5</strong>
            {remainingToPlan > 0 && (
              <span className="text-zinc-400"> · осталось до цели: {remainingToPlan}</span>
            )}
          </p>
          {(book.author_instructions?.trim() || activeAiDraftsCount > 0) && (
            <div className="text-[14px] px-3 py-1.5 bg-rose-950/40 border border-rose-500/60 text-rose-200 flex flex-wrap items-center gap-2">
              <Sparkles className="w-4 h-4 text-rose-400 shrink-0" />
              <span>
                Учитывается в ИИ: {book.author_instructions?.trim() ? 'авторские указания к книге' : ''}
                {book.author_instructions?.trim() && activeAiDraftsCount > 0 ? ' + ' : ''}
                {activeAiDraftsCount > 0 ? `${activeAiDraftsCount} активных черновиков/заметок` : ''}
              </span>
            </div>
          )}
          {book.basic_plots && book.basic_plots.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-zinc-800">
              <span className="text-[14px] text-zinc-400">Сюжетная основа:</span>
              <BasicPlotBadge plotIds={book.basic_plots} size="sm" />
            </div>
          )}
        </div>

        {/* Batch Controls Grid: Hidden for readOnly (parsed/foreign) books */}
        {!readOnly && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-zinc-800">
            {/* 1. JSON Plan / Synopsis Batch */}
            <div className="p-3.5 bg-zinc-950/80 border border-zinc-700 flex flex-col justify-between gap-3 min-w-0">
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-white">1. План глав и синопсисов (JSON)</span>
                  <span className="text-[14px] text-zinc-400 font-mono">до 30 глав за запрос</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {GPT6_LUNA_SPECS.synopsisBatchOptions.map((n) => (
                    <button
                      key={`syn-${n}`}
                      type="button"
                      disabled={cascadeLoading}
                      onClick={() => setSynopsisCount(n)}
                      className={`min-h-[38px] px-3 text-[14px] font-bold border transition cursor-pointer ${
                        synopsisCount === n
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
                      }`}
                    >
                      +{n} глав
                    </button>
                  ))}
                </div>
              </div>

              <NoirButton
                variant="outline"
                onClick={handleBatchSynopsis}
                loading={cascadeLoading}
                icon={<Play className="w-4 h-4 text-rose-500" />}
                className="w-full"
              >
                {plannedEndNum > book.target_chapters
                  ? `План на +${effectiveSynopsisCount} глав (до гл. #${plannedEndNum}, ≈ ${formatLettersCount(synopsisEstLetters)} б.)`
                  : `План на +${effectiveSynopsisCount} глав (≈ ${formatLettersCount(synopsisEstLetters)} букв)`}
              </NoirButton>
            </div>

            {/* 2. Full Custom-Volume Chapters Batch Queue */}
            <div className="p-3.5 bg-zinc-950/80 border border-rose-500/70 flex flex-col justify-between gap-3 min-w-0">
              <div className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[14px] font-bold text-white">
                    2. Полные главы (~{targetPages} стр. А5 / ~{targetWords} слов)
                  </span>
                  <span className="text-[14px] text-rose-400 font-mono">Rolling-лор экономия</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {GPT6_LUNA_SPECS.fullChapterBatchOptions.map((n) => (
                    <button
                      key={`full-${n}`}
                      type="button"
                      disabled={cascadeLoading}
                      onClick={() => setFullChaptersCount(n)}
                      className={`min-h-[38px] px-3 text-[14px] font-bold border transition cursor-pointer ${
                        fullChaptersCount === n
                          ? 'bg-rose-600 text-white border-rose-500'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
                      }`}
                    >
                      {n} {n === 1 ? 'глава' : n <= 4 ? 'главы' : 'глав'}
                    </button>
                  ))}
                </div>

                <ChapterVolumeAndCostPanel
                  compact
                  title="Объём каждой главы и расчёт (текст + контекст)"
                  targetPages={targetPages}
                  targetWords={targetWords}
                  onChangeVolume={(p, w) => {
                    setTargetPages(p);
                    setTargetWords(w);
                  }}
                  breakdown={batchBreakdown}
                  disabled={cascadeLoading}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <NoirButton
                  variant="primary"
                  onClick={handleCascadeWriteBatch}
                  loading={cascadeLoading}
                  disabled={pendingDraftChapters.length === 0}
                  icon={<Play className="w-4 h-4 text-black" />}
                  className="flex-1"
                >
                  {pendingDraftChapters.length > 0
                    ? `Написать ${fullBatchCountActual} гл. (~${fullBatchCountActual * targetPages} стр., ≈ ${formatLettersCount(batchBreakdown.totalEstimatedLetters)} б., контекст +${formatLettersCount(batchBreakdown.contextLetters)} б.)`
                    : 'Нет пустых глав в плане'}
                </NoirButton>

                {cascadeLoading && (
                  <button
                    type="button"
                    onClick={() => {
                      cancelBatchRef.current = true;
                      setCascadeStatus('Остановка после завершения текущей главы...');
                    }}
                    className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-rose-700 text-white border border-rose-500 font-bold text-[14px] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Square className="w-3.5 h-3.5 text-rose-400" />
                    <span>Стоп</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {cascadeStatus && (
          <NoirStatus type={cascadeLoading ? 'loading' : 'info'} message={cascadeStatus} />
        )}
        {cascadeError && (
          <NoirStatus type="error" message={cascadeError} />
        )}
      </div>

      {/* Collapsible Book Drafts & Author AI Instructions Workspace */}
      {showDraftsWorkspace && !readOnly && (
        <div className="flex flex-col gap-4">
          <AuthorAiCommentPanel
            compact
            title="Общие указания автора для ИИ (учитываются в каждой главе)"
            value={book.author_instructions || ''}
            activeDraftsCount={activeAiDraftsCount}
            onSave={async (nextVal) => {
              const updated = { ...book, author_instructions: nextVal };
              await updateBook(updated);
              onBookUpdated?.(updated);
            }}
          />
          <DraftsManagerPanel
            book={book}
            chapters={chapters}
            userUid={userUid}
            onDraftsChanged={(list) => {
              const active = list.filter((d) => d.book_id === book.id && d.include_in_ai && d.status !== 'archive');
              setActiveAiDraftsCount(active.length);
              setActiveDraftsChars(active.reduce((s, d) => s + Math.min(1100, d.content.trim().length) + d.title.length + 8, 0));
            }}
            onAssembleChapter={(combinedText, suggestedTitle) =>
              handleCreateManualChapterAndOpenWriter(combinedText, suggestedTitle)
            }
          />
        </div>
      )}

      {/* Chapters Filter & Search Toolbar */}
      <div className="noir-container p-4 border border-zinc-700 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <Search className="w-4 h-4 text-zinc-500 shrink-0 hidden sm:block" />
          <NoirVoiceInput
            value={search}
            onValueChange={setSearch}
            voiceContext="chapter_search"
            placeholder="Поиск по названию или сюжету главы..."
          />
        </div>

        {/* Range switcher without horizontal scroll */}
        {!search && totalPages > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {Array.from({ length: totalPages }).map((_, i) => {
              const rangeIndex = i + 1;
              const start = (rangeIndex - 1) * pageSize + 1;
              const end = Math.min(rangeIndex * pageSize, Math.max(chapters.length, book.target_chapters));
              const isActive = activeRange === rangeIndex;
              return (
                <button
                  key={rangeIndex}
                  onClick={() => setActiveRange(rangeIndex)}
                  className={`min-h-[44px] px-3.5 text-[14px] font-bold border transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                  }`}
                >
                  {start}–{end}
                </button>
              );
            })}
          </div>
        )}

        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <NoirButton
              variant="primary"
              onClick={handleCreateChapterForAiSetup}
              icon={<Sparkles className="w-4 h-4 text-black" />}
            >
              Создать главу с ИИ
            </NoirButton>
            <NoirButton
              variant="outline"
              onClick={() => handleCreateManualChapterAndOpenWriter('', '')}
              icon={<Maximize2 className="w-4 h-4 text-rose-500" />}
            >
              Написать с нуля
            </NoirButton>
            <NoirButton
              variant="outline"
              onClick={() => {
                const nextNum = chapters.length + 1;
                const newChap: Chapter = {
                  id: Date.now(),
                  book_id: book.id,
                  chapter_number: nextNum,
                  title: `Глава ${nextNum}: Новый поворот`,
                  synopsis: '',
                  content: '',
                  illustration_url: '',
                  illustration_prompt: '',
                  status: 'draft',
                };
                setEditingChapter(newChap);
              }}
              icon={<Plus className="w-4 h-4" />}
            >
              Вставить вручную
            </NoirButton>
          </div>
        )}
      </div>

      {/* Chapters List */}
      <div className="flex flex-col gap-3">
        {pagedChapters.length === 0 ? (
          <div className="noir-container p-12 text-center text-zinc-400 border border-zinc-800">
            <p className="text-[16px] font-bold text-white">Главы не сформированы</p>
            <p className="text-[14px] text-zinc-400 mt-1">
              {readOnly
                ? 'У этой книги пока нет доступных глав.'
                : 'Выберите нужное количество глав выше и нажмите кнопку генерации плана или напишите главу в Режиме писателя.'}
            </p>
          </div>
        ) : (
          pagedChapters.map((chap) => (
            <ChapterCardItem
              key={chap.id || chap.chapter_number}
              chapter={chap}
              readOnly={readOnly}
              chapterScore={chapterScores[chap.id]}
              scoringLoading={scoringChapterId === chap.id}
              chapterAudioCount={
                bookAudioTracks.filter(
                  (t) => (chap.id && t.chapter_id === chap.id) || t.chapter_number === chap.chapter_number
                ).length
              }
              onOpenWriter={setWriterChapter}
              onOpenArt={setArtChapter}
              onOpenAudio={setAudioChapter}
              onOpenInspect={setInspectChapter}
              onOpenEdit={setEditingChapter}
              onScore763={handleScoreChapter763}
              onOpenReader={onNavigateToReader}
            />
          ))
        )}
      </div>

      {/* Chapter Text Modal / Inspector */}
      {inspectChapter && (
        <ChapterTextModal
          book={book}
          chapter={inspectChapter}
          allChapters={chapters}
          characters={characters}
          worldEntities={worldEntities}
          userUid={userUid}
          onClose={() => setInspectChapter(null)}
          onEntityCreated={(ent) => setWorldEntities((prev) => [ent, ...prev])}
          onOpenFullscreenWriter={(c) => {
            setInspectChapter(null);
            setWriterChapter(c);
          }}
          onChapterUpdated={(updated) => {
            const exists = chapters.some((c) => c.id === updated.id);
            const next = exists
              ? chapters.map((c) => (c.id === updated.id ? updated : c))
              : [...chapters, updated].sort((a, b) => a.chapter_number - b.chapter_number);
            onChaptersUpdated(next);
            setInspectChapter(updated);
          }}
        />
      )}

      {/* Chapter Edit Modal */}
      {editingChapter && (
        <ChapterEditModalNoir
          chapter={editingChapter}
          readOnly={readOnly}
          onClose={() => setEditingChapter(null)}
          onOpenWriter={(c) => {
            setEditingChapter(null);
            setWriterChapter(c);
          }}
          onOpenAiGenerator={async (c) => {
            const exists = chapters.some((ex) => ex.id === c.id);
            const saved = await saveChapter(c, exists ? c.id : undefined, userUid);
            const next = exists
              ? chapters.map((ex) => (ex.id === saved.id ? saved : ex))
              : [...chapters, saved].sort((a, b) => a.chapter_number - b.chapter_number);
            onChaptersUpdated(next);
            setEditingChapter(null);
            setInspectChapter(saved);
          }}
          onSave={async (updated) => {
            const exists = chapters.some((c) => c.id === updated.id);
            const saved = await saveChapter(updated, exists ? updated.id : undefined, userUid);
            const idx = chapters.findIndex((c) => c.id === saved.id || c.chapter_number === saved.chapter_number);
            let next: Chapter[];
            if (idx >= 0) {
              next = [...chapters];
              next[idx] = saved;
            } else {
              next = [...chapters, saved].sort((a, b) => a.chapter_number - b.chapter_number);
            }
            onChaptersUpdated(next);
            setEditingChapter(null);
          }}
        />
      )}

      {/* Illustration Studio Modal */}
      {artChapter && !readOnly && (
        <ChapterArtModal
          book={book}
          chapter={artChapter}
          characters={characters}
          worldEntities={worldEntities}
          userUid={userUid}
          onClose={() => setArtChapter(null)}
          onChapterUpdated={(updated) => {
            onChaptersUpdated(chapters.map((c) => (c.id === updated.id ? updated : c)));
            setArtChapter(updated);
          }}
        />
      )}

      {/* Book Rework / Polish / Remake Modal */}
      {isReworkModalOpen && !readOnly && (
        <BookReworkModal
          isOpen={isReworkModalOpen}
          onClose={() => setIsReworkModalOpen(false)}
          book={book}
          chapters={chapters}
          characters={characters}
          worldEntities={worldEntities}
          userUid={userUid}
          onBookUpdated={(updBook) => onBookUpdated?.(updBook)}
          onChaptersUpdated={onChaptersUpdated}
        />
      )}

      {/* Distraction-free Fullscreen Chapter Writer Mode (Word / Notepad + Voice + AI + Cloud Image Paste) */}
      {writerChapter && !readOnly && (
        <FullscreenChapterWriter
          isOpen={Boolean(writerChapter)}
          onClose={() => setWriterChapter(null)}
          book={book}
          chapter={writerChapter}
          allChapters={chapters}
          characters={characters}
          worldEntities={worldEntities}
          userUid={userUid}
          onChapterSaved={(saved) => {
            const exists = chapters.some((c) => c.id === saved.id);
            const next = exists
              ? chapters.map((c) => (c.id === saved.id ? saved : c))
              : [...chapters, saved].sort((a, b) => a.chapter_number - b.chapter_number);
            onChaptersUpdated(next);
            setWriterChapter(saved);
          }}
        />
      )}
      {/* Chapter Voice Studio Modal (Combined Book Audio + Teleprompter) */}
      {audioChapter && !readOnly && (
        <ChapterAudioModal
          book={book}
          chapter={audioChapter}
          allTracks={bookAudioTracks}
          userUid={userUid}
          defaultNarrator={currentUser?.name || book.author || 'Автор'}
          onClose={() => setAudioChapter(null)}
          onTracksUpdated={(nextTracks) => {
            setBookAudioTracks(nextTracks);
            fetchChapters(book.id, userUid).then(onChaptersUpdated).catch(() => {});
          }}
          onChapterUpdated={(saved) => {
            onChaptersUpdated(chapters.map((c) => (c.id === saved.id ? saved : c)));
            setAudioChapter(saved);
          }}
        />
      )}
    </div>
  );
};
