import React, { useState, useEffect, useMemo } from 'react';
import { History, Layers, Maximize2, RotateCcw, Save, Sparkles, Wand2 } from 'lucide-react';
import { Book, Chapter, ChapterRevision, Character, WorldEntity } from '../../types';
import { NoirButton } from '../common/NoirButton';
import { NoirModal } from '../common/NoirModal';
import { NoirStatus } from '../common/NoirStatus';
import { MarkdownBookEditor } from '../editor/MarkdownBookEditor';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { AuthorAiCommentPanel } from '../drafts/AuthorAiCommentPanel';
import { BookReworkModal } from './remake/BookReworkModal';
import { ChapterVolumeAndCostPanel } from './chapterGen/ChapterVolumeAndCostPanel';
import { ChapterEntitiesSelectorPanel } from './chapterGen/ChapterEntitiesSelectorPanel';
import { saveChapter } from '../../services/db/bookRepository';
import { getCurrentUser } from '../../services/auth/authService';
import { getBookPermissions } from '../../services/book/bookPermissions';
import { fetchActiveAiDraftsContext } from '../../services/drafts/draftsRepository';
import {
  fetchChapterRevisions,
  restoreChapterRevision,
  saveChapterRevision,
} from '../../services/db/revisions/revisionRepository';
import {
  orchestrateCascadeChapterRich,
  orchestrateEditChapterWithAi,
  pickChapterEntities,
} from '../../services/ai/orchestrator';
import { estimateA5Pages } from '../../services/ai/chapterBatchEngine';
import { estimateChapterGenerationCost } from '../../services/ai/chapters/chapterCostEstimator';
import { estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';

export { ChapterArtModal } from './chapterGen/ChapterArtModal';

export function ChapterTextModal({
  book,
  chapter,
  allChapters,
  characters,
  worldEntities,
  userUid,
  onClose,
  onChapterUpdated,
  onEntityCreated,
  onOpenFullscreenWriter,
}: {
  book: Book;
  chapter: Chapter;
  allChapters: Chapter[];
  characters: Character[];
  worldEntities: WorldEntity[];
  userUid?: number;
  onClose: () => void;
  onChapterUpdated: (chap: Chapter) => void;
  onEntityCreated?: (newEntity: WorldEntity) => void;
  onOpenFullscreenWriter?: (chap: Chapter) => void;
}) {
  const perms = getBookPermissions(book, getCurrentUser());
  const readOnly = !perms.canEditContent;
  const [content, setContent] = useState(chapter.content || '');
  const [title, setTitle] = useState(chapter.title);
  const [synopsis, setSynopsis] = useState(chapter.synopsis || '');
  const [authorComment, setAuthorComment] = useState(chapter.author_comment || '');
  const [editInstruction, setEditInstruction] = useState('');
  const [selectedEntityIds, setSelectedEntityIds] = useState<number[]>(chapter.entity_ids || []);
  const [targetPages, setTargetPages] = useState<number>(10);
  const [targetWords, setTargetWords] = useState<number>(2000);
  const [activeDraftsChars, setActiveDraftsChars] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [editingAi, setEditingAi] = useState(false);
  const [pickingEntities, setPickingEntities] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [revisions, setRevisions] = useState<ChapterRevision[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);
  const [restoringRevId, setRestoringRevId] = useState<number | null>(null);
  const [isReworkOpen, setIsReworkOpen] = useState(false);

  const loadRevisions = () => {
    fetchChapterRevisions(book.id, chapter.chapter_number).then(setRevisions).catch(() => {});
  };

  useEffect(() => {
    setSelectedEntityIds(chapter.entity_ids || []);
    setTitle(chapter.title);
    setSynopsis(chapter.synopsis || '');
    setContent(chapter.content || '');
    setAuthorComment(chapter.author_comment || '');
    loadRevisions();
    fetchActiveAiDraftsContext({
      bookId: book.id,
      chapterNumber: chapter.chapter_number,
      userUid: userUid ?? book.user_uid,
    })
      .then((res) => setActiveDraftsChars((res.bookDraftsBlock + res.chapterDraftsBlock).length))
      .catch(() => setActiveDraftsChars(0));
  }, [chapter.id, chapter.title, chapter.synopsis, chapter.content, chapter.entity_ids, chapter.author_comment, book.id, book.user_uid, chapter.chapter_number, userUid]);

  const prev = allChapters.find((c) => c.chapter_number === chapter.chapter_number - 1);
  const prevPrev = allChapters.find((c) => c.chapter_number === chapter.chapter_number - 2);
  const hasExistingText = content.trim().length > 80;

  const chapterDraftForCalc = useMemo<Chapter>(
    () => ({ ...chapter, title, synopsis, author_comment: authorComment, entity_ids: selectedEntityIds }),
    [chapter, title, synopsis, authorComment, selectedEntityIds]
  );

  const chapterBreakdown = useMemo(
    () =>
      estimateChapterGenerationCost({
        book,
        chapter: chapterDraftForCalc,
        allChapters,
        prevChapter: prev,
        prevPrevChapter: prevPrev,
        worldEntities,
        activeCharacters: characters,
        targetPages,
        targetWords,
        mode: hasExistingText ? 'edit' : 'generate',
        currentContentChars: content.length,
        editInstructionChars: editInstruction.length,
        activeDraftsChars,
      }),
    [book, chapterDraftForCalc, allChapters, prev, prevPrev, worldEntities, characters, targetPages, targetWords, hasExistingText, content.length, editInstruction.length, activeDraftsChars]
  );

  const generateBreakdown = useMemo(
    () =>
      hasExistingText
        ? estimateChapterGenerationCost({
            book,
            chapter: chapterDraftForCalc,
            allChapters,
            prevChapter: prev,
            prevPrevChapter: prevPrev,
            worldEntities,
            activeCharacters: characters,
            targetPages,
            targetWords,
            mode: 'generate',
            activeDraftsChars,
          })
        : chapterBreakdown,
    [hasExistingText, chapterBreakdown, book, chapterDraftForCalc, allChapters, prev, prevPrev, worldEntities, characters, targetPages, targetWords, activeDraftsChars]
  );

  const handlePickEntities = async () => {
    setPickingEntities(true);
    setErrorMsg('');
    try {
      const out = await runWithGenerationOverlay(
        {
          title: `Подбор сущностей для гл. #${chapter.chapter_number}`,
          subtitle: `Книга: «${book.title}»`,
          initialStatus: `Анализ главы #${chapter.chapter_number} и отбор сущностей мира...`,
          totalSteps: 1,
          estimatedLetters: estimateTextOperationLetters(1400 + worldEntities.length * 80, 400),
        },
        async (ctx) => {
          const picked = await pickChapterEntities({
            book, chapter: { ...chapter, title, synopsis }, prevChapter: prev, worldEntities, characters, userUid, onProgress: ctx.setStatus,
          });
          setSelectedEntityIds(picked);
          const updated: Chapter = { ...chapter, title, synopsis, content, author_comment: authorComment, entity_ids: picked };
          await saveChapter(updated, chapter.id, userUid);
          onChapterUpdated(updated);
          ctx.addApplied(`Отобрано и сохранено сущностей: ${picked.length} шт.`);
          ctx.setProgress(1, 1);
          return picked;
        }
      );
      if (out.result) setStatusMsg(`ИИ подобрал сущностей для главы: ${out.result.length} шт.`);
    } catch (e: unknown) {
      setErrorMsg('Не удалось подобрать сущности: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setPickingEntities(false);
    }
  };

  const handleCascade = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const out = await runWithGenerationOverlay(
        {
          title: `Генерация главы #${chapter.chapter_number}`,
          subtitle: `«${title}» (~${targetPages} стр. А5 / ~${targetWords} сл.)`,
          initialStatus: `Каскадная генерация главы #${chapter.chapter_number}...`,
          totalSteps: 1,
          estimatedLetters: generateBreakdown.totalEstimatedLetters,
        },
        async (ctx) => {
          if (content.trim()) {
            await saveChapterRevision({
              bookId: book.id, chapterId: chapter.id, chapterNumber: chapter.chapter_number,
              title, synopsis, content, revisionNote: 'Снимок перед перегенерацией главы', mode: 'remake',
            });
          }
          const rich = await orchestrateCascadeChapterRich({
            book, chapter: { ...chapter, title, synopsis, author_comment: authorComment, entity_ids: selectedEntityIds }, allChapters,
            prevChapter: prev, prevPrevChapter: prevPrev, activeCharacters: characters,
            worldEntities, styleConfig: book.style_config, targetPages, targetWords, userUid, onProgress: ctx.setStatus,
          });
          const activeIds = selectedEntityIds.length > 0 ? selectedEntityIds : rich.entity_ids;
          setSelectedEntityIds(activeIds);
          setTitle(rich.title || title);
          setSynopsis(rich.synopsis || synopsis);
          setContent(rich.content);
          const updated: Chapter = {
            ...chapter, title: rich.title || title, synopsis: rich.synopsis || synopsis, content: rich.content,
            author_comment: authorComment, footnotes: rich.footnotes.length > 0 ? rich.footnotes : chapter.footnotes,
            entity_ids: activeIds, continuity_summary: rich.continuity_summary, status: 'ready',
          };
          await saveChapter(updated, chapter.id, userUid);
          onChapterUpdated(updated);
          loadRevisions();
          ctx.addApplied(`Глава #${chapter.chapter_number} (~${rich.estimatedPages} стр. А5) сохранена`);
          ctx.setProgress(1, 1);
          return rich;
        }
      );
      if (out.result) {
        setStatusMsg(`Глава #${chapter.chapter_number} (~${out.result.estimatedPages} стр. А5, ${out.result.content.length} симв.) сохранена в базе данных!`);
      }
    } catch (e: unknown) {
      setErrorMsg('Ошибка каскада: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setLoading(false);
    }
  };

  const handleEditWithAi = async () => {
    setEditingAi(true);
    setErrorMsg('');
    try {
      const out = await runWithGenerationOverlay(
        {
          title: `ИИ-редактура главы #${chapter.chapter_number}`,
          subtitle: `«${title}» (~${targetPages} стр. А5 / ~${targetWords} сл.)`,
          initialStatus: `Нейросеть изменяет и расширяет главу #${chapter.chapter_number}...`,
          totalSteps: 1,
          estimatedLetters: chapterBreakdown.totalEstimatedLetters,
        },
        async (ctx) => {
          if (content.trim()) {
            await saveChapterRevision({
              bookId: book.id, chapterId: chapter.id, chapterNumber: chapter.chapter_number,
              title, synopsis, content,
              revisionNote: editInstruction ? `Перед ИИ-правкой: ${editInstruction.slice(0, 80)}` : 'Снимок перед ИИ-правкой',
              mode: 'edit',
            });
          }
          const revised = await orchestrateEditChapterWithAi({
            book, chapter: { ...chapter, title, synopsis, author_comment: authorComment, entity_ids: selectedEntityIds }, currentTitle: title,
            currentContent: content, editInstruction, allChapters, activeCharacters: characters,
            worldEntities, styleConfig: book.style_config, targetPages, targetWords, userUid, onProgress: ctx.setStatus,
          });
          const activeIds = selectedEntityIds.length > 0 ? selectedEntityIds : revised.entity_ids;
          setSelectedEntityIds(activeIds);
          setTitle(revised.title || title);
          setSynopsis(revised.synopsis || synopsis);
          setContent(revised.content);
          const updated: Chapter = {
            ...chapter, title: revised.title || title, synopsis: revised.synopsis || synopsis, content: revised.content,
            author_comment: authorComment, footnotes: revised.footnotes.length > 0 ? revised.footnotes : chapter.footnotes,
            entity_ids: activeIds, continuity_summary: revised.continuity_summary, status: 'ready',
          };
          await saveChapter(updated, chapter.id, userUid);
          onChapterUpdated(updated);
          loadRevisions();
          ctx.addApplied(`Глава #${chapter.chapter_number} после редактуры (~${revised.estimatedPages} стр. А5) сохранена`);
          ctx.setProgress(1, 1);
          return revised;
        }
      );
      if (out.result) {
        setStatusMsg(`Глава #${chapter.chapter_number} изменена и расширена ИИ (~${out.result.estimatedPages} стр. А5, ${out.result.content.length} симв.) и сохранена в БД!`);
      }
    } catch (e: unknown) {
      setErrorMsg('Ошибка изменения главы ИИ: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setEditingAi(false);
    }
  };

  const handleRestoreRevision = async (rev: ChapterRevision) => {
    setRestoringRevId(rev.id);
    setErrorMsg('');
    try {
      const restored = await restoreChapterRevision({
        bookId: book.id,
        currentChapter: { ...chapter, title, content },
        revision: rev,
        userUid,
      });
      setTitle(restored.title);
      setContent(restored.content || '');
      onChapterUpdated(restored);
      loadRevisions();
      setStatusMsg(`Глава #${chapter.chapter_number} откачена к версии от ${new Date(rev.created_at).toLocaleString('ru-RU')}.`);
    } catch (e: unknown) {
      setErrorMsg('Не удалось откатить ревизию: ' + (e instanceof Error ? e.message : ''));
    } finally {
      setRestoringRevId(null);
    }
  };

  const handleSave = async () => {
    if (readOnly) return;
    const updated: Chapter = {
      ...chapter,
      title,
      synopsis,
      content,
      author_comment: authorComment,
      entity_ids: selectedEntityIds,
      status: content.length > 100 ? 'ready' : chapter.status,
    };
    await saveChapter(updated, chapter.id, userUid);
    onChapterUpdated(updated);
    setStatusMsg('Текст, синопсис, указания ИИ и сущности главы сохранены в базе данных!');
  };

  const handleSaveChapterComment = async (nextComment: string) => {
    setAuthorComment(nextComment);
    if (readOnly) return;
    const updated: Chapter = { ...chapter, title, synopsis, content, author_comment: nextComment, entity_ids: selectedEntityIds };
    await saveChapter(updated, chapter.id, userUid);
    onChapterUpdated(updated);
  };

  return (
    <NoirModal isOpen={true} onClose={onClose} title={`Глава #${chapter.chapter_number}: ${title}`} maxWidth="max-w-4xl">
      <div className="flex flex-col gap-3.5 text-white max-h-[82vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between pb-2 border-b border-zinc-700 gap-2">
          <div className="flex-1 min-w-[200px]">
            <NoirVoiceInput
              value={title}
              onValueChange={setTitle}
              voiceContext="chapter_title"
              disabled={readOnly}
              className="text-[16px] font-bold"
            />
          </div>
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2">
              {onOpenFullscreenWriter && (
                <NoirButton
                  variant="outline"
                  onClick={() => onOpenFullscreenWriter({ ...chapter, title, content, author_comment: authorComment, entity_ids: selectedEntityIds })}
                  icon={<Maximize2 className="w-4 h-4 text-rose-500" />}
                >
                  Режим писателя
                </NoirButton>
              )}
              <NoirButton variant="primary" onClick={handleSave} icon={<Save className="w-4 h-4 text-black" />}>
                Сохранить
              </NoirButton>
            </div>
          )}
        </div>

        {prev && (
          <div className="p-2.5 bg-zinc-950 border border-zinc-800 text-[14px] text-zinc-300">
            <strong className="text-white">Контекст главы #{prev.chapter_number}:</strong> {prev.synopsis || 'Вводные события'}
          </div>
        )}

        {/* Editable Chapter Synopsis for Manual Generation & AI Context */}
        <div className="p-3 bg-zinc-950/85 border border-zinc-800 flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-white">
            Синопсис / план событий главы #{chapter.chapter_number}:
          </label>
          <NoirVoiceTextarea
            minRows={2}
            value={synopsis}
            onValueChange={setSynopsis}
            disabled={readOnly}
            voiceContext="chapter_synopsis_inline"
            placeholder="Кратко опишите ключевую сцену, конфликт или поворот, который нейросеть должна раскрыть..."
          />
        </div>

        {/* Interactive World Entities Selector + Inline Entity Creation */}
        <ChapterEntitiesSelectorPanel
          book={book}
          worldEntities={worldEntities}
          selectedEntityIds={selectedEntityIds}
          onChangeSelectedIds={setSelectedEntityIds}
          onEntityCreated={(newEntity) => onEntityCreated?.(newEntity)}
          userUid={userUid}
          readOnly={readOnly}
          onAiPickEntities={readOnly ? undefined : handlePickEntities}
          aiPickLoading={pickingEntities}
          aiPickEstLetters={estimateTextOperationLetters(900 + worldEntities.length * 80, 240)}
        />

        {/* Volume (Pages A5 + Words) & Live Output vs Extra Context Cost Breakdown */}
        {!readOnly && (
          <ChapterVolumeAndCostPanel
            targetPages={targetPages}
            targetWords={targetWords}
            onChangeVolume={(p, w) => {
              setTargetPages(p);
              setTargetWords(w);
            }}
            breakdown={chapterBreakdown}
            disabled={loading || editingAi}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[14px] text-zinc-400">
            Сейчас в тексте: <strong className="text-white">{content.split(/\s+/).filter(Boolean).length}</strong> сл. ·{' '}
            <strong className="text-rose-400">~{estimateA5Pages(content)} стр. А5</strong> ({content.length} симв.)
          </span>
          {!readOnly && (
            <NoirButton variant="outline" onClick={handleCascade} loading={loading} icon={<Sparkles className="w-4 h-4 text-rose-500" />}>
              {content
                ? `Перегенерировать (~${targetPages} стр. А5 / ${targetWords} сл., ≈ ${formatLettersCount(generateBreakdown.totalEstimatedLetters)} б.)`
                : `Написать главу (~${targetPages} стр. А5 / ${targetWords} сл., ≈ ${formatLettersCount(generateBreakdown.totalEstimatedLetters)} б.)`}
            </NoirButton>
          )}
        </div>

        {/* Author AI Comment specifically for this chapter */}
        <AuthorAiCommentPanel
          compact
          title={`Комментарий автора для ИИ к гл. #${chapter.chapter_number}`}
          value={authorComment}
          readOnly={readOnly}
          onSave={handleSaveChapterComment}
        />

        {/* AI Chapter Edit & Custom-Volume Expansion Bar */}
        {!readOnly && (
          <div className="p-3 bg-zinc-950/80 border border-rose-500/60 flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[14px] font-bold text-white">
                Изменить и развернуть текущий текст через ИИ (~{targetPages} стр. А5 / ~{targetWords} слов):
              </span>
              <span className="text-[14px] font-mono text-zinc-300">
                ≈ {formatLettersCount(chapterBreakdown.totalEstimatedLetters)} б.{' '}
                <span className="text-rose-400">(+{formatLettersCount(chapterBreakdown.contextLetters)} б. контекст)</span>
              </span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="flex-1 min-w-0">
                <NoirVoiceInput
                  value={editInstruction}
                  onValueChange={setEditInstruction}
                  voiceContext="chapter_ai_edit_instruction"
                  placeholder="Что изменить (необязательно): добавить сцену, углубить диалоги, переписать финал..."
                />
              </div>
              <NoirButton
                variant="primary"
                onClick={handleEditWithAi}
                loading={editingAi}
                disabled={loading}
                icon={<Wand2 className="w-4 h-4 text-black" />}
                className="shrink-0"
              >
                Изменить ИИ (~{targetPages} стр.)
              </NoirButton>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsReworkOpen(true)}
                className="min-h-[38px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-rose-400 border border-rose-500/70 text-[14px] font-bold transition cursor-pointer flex items-center gap-1.5 rounded-none"
              >
                <Layers className="w-4 h-4" />
                <span>Ремейк / каскад от главы #{chapter.chapter_number} и далее</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRevisions(!showRevisions)}
                className="min-h-[38px] px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700 text-[14px] font-bold transition cursor-pointer flex items-center gap-1.5 rounded-none"
              >
                <History className="w-4 h-4 text-rose-500" />
                <span>История версий ({revisions.length})</span>
              </button>
            </div>
          </div>
        )}

        {/* Version History Rollback Panel */}
        {showRevisions && (
          <div className="p-3 bg-zinc-950/85 border border-zinc-700 flex flex-col gap-2">
            <span className="text-[14px] font-bold text-white">
              Сохранённые снимки главы #{chapter.chapter_number} (откат в 1 клик):
            </span>
            {revisions.length === 0 ? (
              <p className="text-[14px] text-zinc-400">
                Снимки создаются автоматически перед каждым ИИ-ремейком, перегенерацией или редактурой.
              </p>
            ) : (
              <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                {revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className="p-2.5 bg-black/60 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[14px]"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="text-rose-400 font-mono font-bold mr-2">
                        [{rev.mode === 'remake' ? 'Ремейк' : 'Редактура'}]
                      </span>
                      <span className="text-white font-bold">{rev.title}</span>
                      <span className="text-zinc-400 block">
                        {new Date(rev.created_at).toLocaleString('ru-RU')} · {rev.content.length} симв.
                        {rev.revision_note ? ` · ${rev.revision_note}` : ''}
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={restoringRevId === rev.id}
                      onClick={() => handleRestoreRevision(rev)}
                      className="min-h-[36px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 font-bold text-[14px] cursor-pointer flex items-center gap-1 rounded-none shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                      <span>{restoringRevId === rev.id ? 'Откат...' : 'Откатить'}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {statusMsg && <NoirStatus type="info" message={statusMsg} />}
        {errorMsg && <NoirStatus type="error" message={errorMsg} />}

        <MarkdownBookEditor
          value={content}
          onChange={setContent}
          placeholder="Вставьте сюда свой текст или сгенерируйте каскадом (поддерживается форматирование Markdown)..."
        />

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
          <NoirButton variant="subtle" onClick={onClose}>
            Закрыть
          </NoirButton>
        </div>
      </div>

      {isReworkOpen && (
        <BookReworkModal
          isOpen={isReworkOpen}
          onClose={() => setIsReworkOpen(false)}
          book={book}
          chapters={allChapters}
          characters={characters}
          worldEntities={worldEntities}
          initialChapterNumber={chapter.chapter_number}
          initialScope="from_current"
          userUid={userUid}
          onBookUpdated={() => {}}
          onChaptersUpdated={(updatedList) => {
            const match = updatedList.find((c) => c.chapter_number === chapter.chapter_number);
            if (match) {
              setTitle(match.title);
              setContent(match.content || '');
              onChapterUpdated(match);
            }
            loadRevisions();
          }}
        />
      )}
    </NoirModal>
  );
}

export function ChapterEditModalNoir({
  chapter,
  readOnly = false,
  onClose,
  onSave,
  onOpenWriter,
  onOpenAiGenerator,
}: {
  chapter: Chapter;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (chap: Chapter) => void;
  onOpenWriter?: (chap: Chapter) => void;
  onOpenAiGenerator?: (chap: Chapter) => void;
}) {
  const [num, setNum] = useState(chapter.chapter_number);
  const [title, setTitle] = useState(chapter.title);
  const [synopsis, setSynopsis] = useState(chapter.synopsis || '');
  const [authorComment, setAuthorComment] = useState(chapter.author_comment || '');
  const [content, setContent] = useState(chapter.content || '');

  return (
    <NoirModal isOpen={true} onClose={onClose} title={`Редактирование главы #${num}`} maxWidth="max-w-2xl">
      <div className="flex flex-col gap-4 text-white max-h-[82vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-1">
            <label className="block text-[14px] font-bold text-white mb-1">Номер:</label>
            <input
              type="number"
              disabled={readOnly}
              value={num}
              onChange={(e) => setNum(parseInt(e.target.value, 10) || 1)}
              className="w-full min-h-[44px] px-2 noir-input text-center font-bold text-[16px]"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-[14px] font-bold text-white mb-1">Название:</label>
            <NoirVoiceInput
              value={title}
              onValueChange={setTitle}
              disabled={readOnly}
              voiceContext="chapter_edit_title"
            />
          </div>
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">Синопсис главы:</label>
          <NoirVoiceTextarea
            minRows={3}
            value={synopsis}
            onValueChange={setSynopsis}
            disabled={readOnly}
            voiceContext="chapter_edit_synopsis"
            placeholder="Краткое содержание событий главы..."
          />
        </div>

        <div>
          <label className="block text-[14px] font-bold text-rose-400 mb-1">
            Комментарий автора для ИИ (учитывается при написании и редактуре):
          </label>
          <NoirVoiceTextarea
            minRows={2}
            value={authorComment}
            onValueChange={setAuthorComment}
            disabled={readOnly}
            voiceContext="chapter_ai_comment"
            placeholder="Пожелания по сценам, темпу, конфликту или репликам этой главы..."
          />
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">Ручной ввод текста:</label>
          <NoirVoiceTextarea
            minRows={6}
            value={content}
            onValueChange={setContent}
            disabled={readOnly}
            voiceContext="chapter_edit_content"
            placeholder="Текст главы..."
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            {!readOnly && onOpenAiGenerator && (
              <NoirButton
                variant="outline"
                onClick={() => onOpenAiGenerator({ ...chapter, chapter_number: num, title, synopsis, author_comment: authorComment, content })}
                icon={<Sparkles className="w-4 h-4 text-rose-500" />}
              >
                Сущности и ИИ-генерация
              </NoirButton>
            )}
            {!readOnly && onOpenWriter && (
              <NoirButton
                variant="outline"
                onClick={() => onOpenWriter({ ...chapter, chapter_number: num, title, synopsis, author_comment: authorComment, content })}
                icon={<Maximize2 className="w-4 h-4 text-rose-500" />}
              >
                В Режим писателя
              </NoirButton>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NoirButton variant="subtle" onClick={onClose}>
              Отмена
            </NoirButton>
            {!readOnly && (
              <NoirButton
                variant="primary"
                onClick={() => onSave({ ...chapter, chapter_number: num, title, synopsis, author_comment: authorComment, content })}
              >
                Сохранить
              </NoirButton>
            )}
          </div>
        </div>
      </div>
    </NoirModal>
  );
}
