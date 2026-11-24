import { Book, Chapter, Character, WorldEntity } from '../../../types';
import { buildPlotPromptDirective } from '../../../constants/basicPlots';
import { buildRollingStoryContext, resolveChapterVolumeTargets } from '../chapterBatchEngine';
import { calculateAiUsageCost, lettersToRubles } from '../../billing/costCalculator';

export interface ChapterContextFactors {
  systemAndMetaChars: number;
  rollingHistoryChars: number;
  entitiesLoreChars: number;
  authorInstructionsChars: number;
  chapterCommentChars: number;
  activeDraftsChars: number;
  existingTextChars: number;
}

export interface ChapterCostBreakdown {
  targetPages: number;
  targetWords: number;
  targetChars: number;
  factors: ChapterContextFactors;
  totalContextChars: number;
  contextLetters: number;
  outputLetters: number;
  qa763ReserveLetters: number;
  totalEstimatedLetters: number;
  estimatedRubles: number;
  chaptersCount: number;
}

/**
 * Computes a complete, factor-by-factor cost estimate for chapter generation or AI editing.
 * Measures actual context sizes (rolling history, selected characters/locations/lore, style,
 * plot archetypes, author instructions, chapter AI comments, active included drafts, and
 * existing text in edit mode) so users see both Output text cost AND extra Context letters.
 */
export function estimateChapterGenerationCost(params: {
  book: Book;
  chapter: Chapter;
  allChapters?: Chapter[];
  prevChapter?: Chapter;
  prevPrevChapter?: Chapter;
  worldEntities?: WorldEntity[];
  activeCharacters?: Character[];
  targetPages?: number;
  targetWords?: number;
  mode?: 'generate' | 'edit';
  currentContentChars?: number;
  editInstructionChars?: number;
  activeDraftsChars?: number;
  inputMultiplier?: number;
  outputMultiplier?: number;
}): ChapterCostBreakdown {
  const {
    book,
    chapter,
    allChapters = [],
    prevChapter,
    prevPrevChapter,
    worldEntities = [],
    activeCharacters = [],
    mode = 'generate',
    currentContentChars = 0,
    editInstructionChars = 0,
    activeDraftsChars = 0,
    inputMultiplier = 1.0,
    outputMultiplier = 1.0,
  } = params;

  const vol = resolveChapterVolumeTargets({
    targetPages: params.targetPages,
    targetWords: params.targetWords,
  });

  const { rollingContext, entitiesCompact, styleBlock } = buildRollingStoryContext({
    book,
    chapter,
    allChapters,
    prevChapter,
    prevPrevChapter,
    worldEntities,
    activeCharacters,
  });

  const plotDirective = buildPlotPromptDirective(book.basic_plots);

  // System prompt wrapper + template instructions + chapter metadata + JSON schema
  const baseTemplateOverhead = mode === 'edit' ? 1250 : 1450;
  const chapterMetaChars =
    (book.title?.length || 0) +
    (book.genres || []).join(', ').length +
    (book.tone?.length || 0) +
    (chapter.title?.length || 0) +
    (chapter.synopsis?.length || 0) +
    editInstructionChars;

  const systemAndMetaChars =
    baseTemplateOverhead + chapterMetaChars + styleBlock.length + plotDirective.length;
  const rollingHistoryChars = rollingContext.length;
  const entitiesLoreChars = entitiesCompact.length;

  const bookInstTrimmed = (book.author_instructions || '').trim().slice(0, 1600);
  const authorInstructionsChars = bookInstTrimmed ? bookInstTrimmed.length + 78 : 0;

  const chapCommentTrimmed = (chapter.author_comment || '').trim().slice(0, 1400);
  const chapterCommentChars = chapCommentTrimmed ? chapCommentTrimmed.length + 72 : 0;

  const cappedDraftsChars = activeDraftsChars > 0 ? Math.min(3400, activeDraftsChars) + 64 : 0;
  const existingTextChars =
    mode === 'edit' && currentContentChars > 0 ? Math.min(6500, currentContentChars) + 80 : 0;

  const totalContextChars =
    systemAndMetaChars +
    rollingHistoryChars +
    entitiesLoreChars +
    authorInstructionsChars +
    chapterCommentChars +
    cappedDraftsChars +
    existingTextChars;

  const contextUsage = calculateAiUsageCost({
    inputChars: totalContextChars,
    outputChars: 0,
    inputMultiplier,
    outputMultiplier: 0,
  });
  const contextLetters = contextUsage.inputLetters;

  // Target prose characters + ~420 chars JSON wrapper (title, synopsis, footnotes, continuity_summary)
  const expectedOutputChars = vol.targetChars + 420;
  const outputUsage = calculateAiUsageCost({
    inputChars: 0,
    outputChars: expectedOutputChars,
    inputMultiplier: 0,
    outputMultiplier,
  });
  const outputLetters = outputUsage.outputLetters;

  // Lightweight 763 completion QA check (~280 letters on ~2.6k tail chars at 0.25x)
  const qa763ReserveLetters = vol.targetChars >= 6000 ? 280 : 0;

  const totalEstimatedLetters = contextLetters + outputLetters + qa763ReserveLetters;

  return {
    targetPages: vol.targetPages,
    targetWords: vol.targetWords,
    targetChars: vol.targetChars,
    factors: {
      systemAndMetaChars,
      rollingHistoryChars,
      entitiesLoreChars,
      authorInstructionsChars,
      chapterCommentChars,
      activeDraftsChars: cappedDraftsChars,
      existingTextChars,
    },
    totalContextChars,
    contextLetters,
    outputLetters,
    qa763ReserveLetters,
    totalEstimatedLetters,
    estimatedRubles: lettersToRubles(totalEstimatedLetters),
    chaptersCount: 1,
  };
}

/**
 * Aggregates cost & context breakdown across a batch of sequential chapters.
 */
export function estimateBatchChaptersCost(params: {
  book: Book;
  targetChapters: Chapter[];
  allChapters: Chapter[];
  worldEntities: WorldEntity[];
  activeCharacters: Character[];
  targetPages: number;
  targetWords: number;
  activeDraftsChars?: number;
  inputMultiplier?: number;
  outputMultiplier?: number;
}): ChapterCostBreakdown {
  const { targetChapters, allChapters } = params;
  const vol = resolveChapterVolumeTargets({
    targetPages: params.targetPages,
    targetWords: params.targetWords,
  });

  if (targetChapters.length === 0) {
    const sampleChap: Chapter = {
      id: 0,
      book_id: params.book.id,
      chapter_number: allChapters.length + 1,
      title: 'Новая глава',
      synopsis: 'Ключевая сцена по плану книги',
      content: '',
      illustration_url: '',
      illustration_prompt: '',
      status: 'draft',
    };
    const single = estimateChapterGenerationCost({
      ...params,
      chapter: sampleChap,
    });
    return { ...single, chaptersCount: 0 };
  }

  let rollingWork = [...allChapters];
  const acc: ChapterContextFactors = {
    systemAndMetaChars: 0,
    rollingHistoryChars: 0,
    entitiesLoreChars: 0,
    authorInstructionsChars: 0,
    chapterCommentChars: 0,
    activeDraftsChars: 0,
    existingTextChars: 0,
  };
  let totalContextChars = 0;
  let contextLetters = 0;
  let outputLetters = 0;
  let qa763ReserveLetters = 0;

  for (const chap of targetChapters) {
    const prev = rollingWork.find((c) => c.chapter_number === chap.chapter_number - 1);
    const prevPrev = rollingWork.find((c) => c.chapter_number === chap.chapter_number - 2);
    const est = estimateChapterGenerationCost({
      ...params,
      chapter: chap,
      allChapters: rollingWork,
      prevChapter: prev,
      prevPrevChapter: prevPrev,
    });
    acc.systemAndMetaChars += est.factors.systemAndMetaChars;
    acc.rollingHistoryChars += est.factors.rollingHistoryChars;
    acc.entitiesLoreChars += est.factors.entitiesLoreChars;
    acc.authorInstructionsChars += est.factors.authorInstructionsChars;
    acc.chapterCommentChars += est.factors.chapterCommentChars;
    acc.activeDraftsChars += est.factors.activeDraftsChars;
    acc.existingTextChars += est.factors.existingTextChars;
    totalContextChars += est.totalContextChars;
    contextLetters += est.contextLetters;
    outputLetters += est.outputLetters;
    qa763ReserveLetters += est.qa763ReserveLetters;

    // Simulate continuity summary growth for subsequent chapters in the same cascade
    const simulatedPrev: Chapter = {
      ...chap,
      content: 'x'.repeat(Math.min(1200, vol.targetChars)),
      continuity_summary: chap.continuity_summary || chap.synopsis || chap.title,
    };
    const idx = rollingWork.findIndex((c) => c.chapter_number === chap.chapter_number);
    if (idx >= 0) rollingWork[idx] = simulatedPrev;
    else rollingWork = [...rollingWork, simulatedPrev];
  }

  const totalEstimatedLetters = contextLetters + outputLetters + qa763ReserveLetters;
  return {
    targetPages: vol.targetPages,
    targetWords: vol.targetWords,
    targetChars: vol.targetChars * targetChapters.length,
    factors: acc,
    totalContextChars,
    contextLetters,
    outputLetters,
    qa763ReserveLetters,
    totalEstimatedLetters,
    estimatedRubles: lettersToRubles(totalEstimatedLetters),
    chaptersCount: targetChapters.length,
  };
}
