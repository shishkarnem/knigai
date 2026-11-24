import { getPromptConfig, renderPrompt } from '../../db/promptRepository';
import { generateProTalkTextWithUsage } from '../protalkText';
import { resolvePublicUrlMap } from '../protalkImage';
import { Book, Character, Chapter, WorldEntity, BookStyleConfig } from '../../../types';
import { buildPlotPromptDirective } from '../../../constants/basicPlots';
import { checkSufficientBalance, recordAiUsage } from '../../billing/transactionService';
import { calculateAiUsageCost, formatLettersCount } from '../../billing/costCalculator';
import { isGenerationStopRequested } from '../session/generationSession';
import {
  buildChapterRevisionPrompt,
  buildRollingStoryContext,
  estimateA5Pages,
  ParsedFullChapterResult,
  parseFullChapterJson,
  resolveChapterVolumeTargets,
} from '../chapterBatchEngine';
import { callProTalkDecision } from '../decision/protalkDecision';
import { loadBookAuthorAiContext } from '../context/authorContextBuilder';

async function shouldSkipContinuationBy763(params: {
  bookId: number;
  bookTitle: string;
  chapterNumber: number;
  synopsis: string;
  content: string;
  userUid?: number;
}): Promise<boolean> {
  if (params.content.length < 6000) return false;
  try {
    const res = await callProTalkDecision({
      text: `Синопсис главы: ${params.synopsis}\n\nКонцовка написанной главы:\n${params.content.slice(-2600)}`,
      instruction:
        'Проверь: является ли финал этого фрагмента логически и драматургически завершённым окончанием главы без обрыва сцены?',
      options: 'true::Финал главы полностью завершён;;false::Сцена оборвана, нужно дописать продолжение',
      decisionType: 'noul',
      aiModel: '~typesafe/jev-latest',
      userUid: params.userUid,
      bookId: params.bookId,
      bookTitle: params.bookTitle,
      chapterNumber: params.chapterNumber,
      promptKey: 'decision_chapter_qa',
      operationDescription: `Контроль завершённости гл.#${params.chapterNumber} (763)`,
      alertLink: 'chapters',
    });
    return res.boolResult && res.probability >= 0.72;
  } catch {
    return false;
  }
}

async function assertChapterCanAfford(userUid: number | undefined, estimatedLetters: number) {
  if (!userUid) return;
  const check = await checkSufficientBalance(userUid, estimatedLetters);
  if (!check.ok) {
    throw new Error(
      `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(estimatedLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
    );
  }
}

async function resolveEntityAndCharMedia(
  worldEntities?: WorldEntity[],
  activeCharacters?: Character[]
): Promise<{ worldEntities: WorldEntity[]; activeCharacters: Character[] }> {
  const entities = worldEntities || [];
  const chars = activeCharacters || [];
  const rawUrls = [
    ...entities.map((e) => e.image_url),
    ...chars.map((c) => c.visual_card_url),
  ];
  const urlMap = await resolvePublicUrlMap(rawUrls);
  return {
    worldEntities: entities.map((e) => ({
      ...e,
      image_url: (e.image_url && urlMap.get(e.image_url.trim())) || e.image_url,
    })),
    activeCharacters: chars.map((c) => ({
      ...c,
      visual_card_url:
        (c.visual_card_url && urlMap.get(c.visual_card_url.trim())) || c.visual_card_url,
    })),
  };
}

export async function orchestrateCascadeChapterRich(params: {
  book: Book;
  chapter: Chapter;
  allChapters?: Chapter[];
  prevChapter?: Chapter;
  prevPrevChapter?: Chapter;
  activeCharacters?: Character[];
  worldEntities?: WorldEntity[];
  styleConfig?: BookStyleConfig;
  targetPages?: number;
  targetWords?: number;
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ParsedFullChapterResult & { tokensUsed: number; estimatedPages: number }> {
  const cfg = await getPromptConfig('chapter_cascade');
  const plotDirective = buildPlotPromptDirective(params.book.basic_plots);
  const vol = resolveChapterVolumeTargets({
    targetPages: params.targetPages,
    targetWords: params.targetWords,
  });

  const effectiveBook: Book = params.styleConfig
    ? { ...params.book, style_config: params.styleConfig }
    : params.book;

  const { worldEntities: resolvedEntities, activeCharacters: resolvedChars } =
    await resolveEntityAndCharMedia(params.worldEntities, params.activeCharacters);

  const { rollingContext, entitiesCompact, styleBlock } = buildRollingStoryContext({
    book: effectiveBook,
    chapter: params.chapter,
    allChapters: params.allChapters,
    prevChapter: params.prevChapter,
    prevPrevChapter: params.prevPrevChapter,
    worldEntities: resolvedEntities,
    activeCharacters: resolvedChars,
  });

  const authorCtx = await loadBookAuthorAiContext({
    book: effectiveBook,
    chapter: params.chapter,
    userUid: params.userUid,
  });

  const basePrompt = renderPrompt(
    cfg.template,
    {
      title: params.book.title,
      chapter_number: params.chapter.chapter_number,
      chapter_title: params.chapter.title,
      chapter_synopsis: params.chapter.synopsis || 'Развернутое развитие ключевой линии главы',
      rolling_context: rollingContext,
      entities_compact: entitiesCompact,
      style_block: styleBlock,
      plot_directive: plotDirective,
      genres: (params.book.genres || []).join(', '),
      tone: params.book.tone || 'напряженный нуар',
      target_chars: `${vol.targetChars}–${vol.targetCharsMax}`,
    },
    cfg.system_instruction
  );
  const volumeDirective = `[ЗАДАННЫЙ АВТОРОМ ОБЪЁМ ГЛАВЫ]: ровно ~${vol.targetPages} книжных страниц А5 (~${vol.targetWords} слов, ${vol.targetChars}–${vol.targetCharsMax} символов с пробелами, ${vol.recommendedScenes} драматических сцен). Строго ориентируйся на этот объём слов и страниц.`;
  const promptParts = [basePrompt, volumeDirective];
  if (authorCtx.combinedPromptBlock) promptParts.push(authorCtx.combinedPromptBlock);
  const prompt = promptParts.join('\n\n');

  const est = calculateAiUsageCost({
    inputChars: prompt.length,
    outputChars: vol.targetChars + 420,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });
  await assertChapterCanAfford(params.userUid, est.totalLetters);

  const isolatedChatId = `knigai_ch_${params.book.id}_${params.chapter.chapter_number}_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const aiRes = await generateProTalkTextWithUsage(prompt, params.onProgress, 260, params.userUid, isolatedChatId);

  let totalTokensUsed = aiRes.tokensTotal;

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: aiRes.text.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    bookId: params.book.id,
    bookTitle: params.book.title,
    chapterNumber: params.chapter.chapter_number,
    description: `Генерация главы #${params.chapter.chapter_number} «${params.chapter.title}» (${vol.targetPages} стр. А5 / ~${vol.targetWords} слов)`,
    alertLink: 'chapters',
  });

  const validEntityIds = new Set((params.worldEntities || []).map((e) => e.id));
  const parsed = parseFullChapterJson(
    aiRes.text,
    params.chapter.title,
    params.chapter.synopsis || '',
    validEntityIds
  );

  if (parsed.entity_ids.length === 0 && params.chapter.entity_ids && params.chapter.entity_ids.length > 0) {
    parsed.entity_ids = params.chapter.entity_ids;
  }

  // Length Safeguard with 763 completion check scaled to user's chosen targetChars
  const needsContinuation =
    !isGenerationStopRequested() &&
    parsed.content.length < vol.minAcceptableChars &&
    parsed.content.length > 200 &&
    !(await shouldSkipContinuationBy763({
      bookId: params.book.id,
      bookTitle: params.book.title,
      chapterNumber: params.chapter.chapter_number,
      synopsis: parsed.synopsis || params.chapter.synopsis || '',
      content: parsed.content,
      userUid: params.userUid,
    }));

  if (needsContinuation) {
    const missingChars = Math.max(2000, vol.targetChars - parsed.content.length);
    if (params.onProgress) {
      params.onProgress(
        `Глава #${params.chapter.chapter_number}: получено ${parsed.content.length} симв. (~${estimateA5Pages(parsed.content)} стр.), дописываем финальные сцены (+${missingChars} симв.)...`
      );
    }
    const tailSnippet = parsed.content.slice(-1100);
    const continuePrompt = `Продолжи художественную прозу главы #${params.chapter.chapter_number} («${parsed.title}») книги «${params.book.title}».
Нужно органично дописать ещё 2-3 глубокие сцены объемом ${missingChars}–${missingChars + 2500} символов до логической кульминации и моста к следующей главе.
Синопсис целиком: ${parsed.synopsis || params.chapter.synopsis || ''}
Персонажи и законы мира:
${entitiesCompact.slice(0, 900)}
${authorCtx.chapterCommentBlock ? `\n${authorCtx.chapterCommentBlock}` : ''}
Хвост уже написанного текста (продолжай с этого места без повторов):
«...${tailSnippet}»

Верни СТРОГО JSON-объект без лишнего текста:
{
  "continuation_content": "Новый текст продолжения объемом ${missingChars}+ символов с абзацами через \\n\\n",
  "continuity_summary": "Обновленный краткий итог всей главы (до 350 знаков)"
}`;

    try {
      const contChatId = `knigai_cont_${params.book.id}_${params.chapter.chapter_number}_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
      const contRes = await generateProTalkTextWithUsage(
        continuePrompt,
        params.onProgress,
        220,
        params.userUid,
        contChatId
      );
      totalTokensUsed += contRes.tokensTotal;

      await recordAiUsage({
        userUid: params.userUid,
        promptKey: cfg.key,
        inputChars: continuePrompt.length,
        outputChars: contRes.text.length,
        inputMultiplier: cfg.input_cost_multiplier,
        outputMultiplier: cfg.output_cost_multiplier,
        exactTokens: contRes.tokensTotal,
        tokensIn: contRes.tokensIn,
        tokensOut: contRes.tokensOut,
        bookId: params.book.id,
        bookTitle: params.book.title,
        chapterNumber: params.chapter.chapter_number,
        description: `Дозаполнение главы #${params.chapter.chapter_number} до 10 стр. А5`,
        alertLink: 'chapters',
      });

      const contParsed = parseFullChapterJson(
        contRes.text.replace('"continuation_content"', '"content"'),
        parsed.title,
        parsed.synopsis,
        validEntityIds
      );
      if (contParsed.content && contParsed.content.length > 300) {
        parsed.content = `${parsed.content.trim()}\n\n* * *\n\n${contParsed.content.trim()}`;
        if (contParsed.continuity_summary) {
          parsed.continuity_summary = contParsed.continuity_summary;
        }
      }
    } catch (contErr) {
      console.warn('Chapter continuation notice:', contErr);
    }
  }

  return {
    ...parsed,
    tokensUsed: totalTokensUsed,
    estimatedPages: estimateA5Pages(parsed.content),
  };
}

export async function orchestrateEditChapterWithAi(params: {
  book: Book;
  chapter: Chapter;
  currentTitle: string;
  currentContent: string;
  editInstruction?: string;
  allChapters?: Chapter[];
  activeCharacters?: Character[];
  worldEntities?: WorldEntity[];
  styleConfig?: BookStyleConfig;
  targetPages?: number;
  targetWords?: number;
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ParsedFullChapterResult & { tokensUsed: number; estimatedPages: number }> {
  const vol = resolveChapterVolumeTargets({
    targetPages: params.targetPages,
    targetWords: params.targetWords,
  });
  const plotDirective = buildPlotPromptDirective(params.book.basic_plots);
  const effectiveBook: Book = params.styleConfig
    ? { ...params.book, style_config: params.styleConfig }
    : params.book;

  const { worldEntities: resolvedEntities, activeCharacters: resolvedChars } =
    await resolveEntityAndCharMedia(params.worldEntities, params.activeCharacters);

  const { rollingContext, entitiesCompact, styleBlock } = buildRollingStoryContext({
    book: effectiveBook,
    chapter: params.chapter,
    allChapters: params.allChapters,
    worldEntities: resolvedEntities,
    activeCharacters: resolvedChars,
  });

  const authorCtx = await loadBookAuthorAiContext({
    book: effectiveBook,
    chapter: params.chapter,
    userUid: params.userUid,
  });

  const basePrompt = buildChapterRevisionPrompt({
    book: effectiveBook,
    chapterNumber: params.chapter.chapter_number,
    currentTitle: params.currentTitle || params.chapter.title,
    synopsis: params.chapter.synopsis || '',
    currentContent: params.currentContent,
    editInstruction: params.editInstruction,
    rollingContext,
    entitiesCompact,
    styleBlock,
    plotDirective,
    targetPages: vol.targetPages,
    targetWords: vol.targetWords,
  });
  const prompt = authorCtx.combinedPromptBlock
    ? `${basePrompt}\n\n${authorCtx.combinedPromptBlock}`
    : basePrompt;

  const est = calculateAiUsageCost({ inputChars: prompt.length, outputChars: vol.targetChars + 420 });
  await assertChapterCanAfford(params.userUid, est.totalLetters);

  const editChatId = `knigai_edit_${params.book.id}_${params.chapter.chapter_number}_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
  const aiRes = await generateProTalkTextWithUsage(prompt, params.onProgress, 260, params.userUid, editChatId);
  let totalTokensUsed = aiRes.tokensTotal;

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: 'chapter_cascade',
    inputChars: prompt.length,
    outputChars: aiRes.text.length,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    bookId: params.book.id,
    bookTitle: params.book.title,
    chapterNumber: params.chapter.chapter_number,
    description: `ИИ-правка главы #${params.chapter.chapter_number} «${params.currentTitle}» (~${vol.targetPages} стр. А5 / ~${vol.targetWords} слов)`,
    alertLink: 'chapters',
  });

  const validEntityIds = new Set((params.worldEntities || []).map((e) => e.id));
  const parsed = parseFullChapterJson(
    aiRes.text,
    params.currentTitle || params.chapter.title,
    params.chapter.synopsis || '',
    validEntityIds
  );

  if (parsed.entity_ids.length === 0 && params.chapter.entity_ids?.length) {
    parsed.entity_ids = params.chapter.entity_ids;
  }

  const needsEditContinuation =
    !isGenerationStopRequested() &&
    parsed.content.length < vol.minAcceptableChars &&
    parsed.content.length > 200 &&
    !(await shouldSkipContinuationBy763({
      bookId: params.book.id,
      bookTitle: params.book.title,
      chapterNumber: params.chapter.chapter_number,
      synopsis: parsed.synopsis || params.chapter.synopsis || '',
      content: parsed.content,
      userUid: params.userUid,
    }));

  if (needsEditContinuation) {
    const missingChars = Math.max(2000, vol.targetChars - parsed.content.length);
    if (params.onProgress) {
      params.onProgress(`Дозапись финальных сцен после правки (+${missingChars} симв.)...`);
    }
    const contPrompt = `Допиши финальные сцены главы #${params.chapter.chapter_number} («${parsed.title}») книги «${params.book.title}» объёмом +${missingChars} символов, логично завершив главу.
Хвост: «...${parsed.content.slice(-1100)}»
Верни СТРОГО JSON: {"continuation_content":"Текст продолжения через \\n\\n","continuity_summary":"Итог главы до 350 знаков"}`;
    try {
      const contRes = await generateProTalkTextWithUsage(
        contPrompt,
        params.onProgress,
        220,
        params.userUid,
        `knigai_editcont_${params.book.id}_${params.chapter.chapter_number}_${Date.now()}`
      );
      totalTokensUsed += contRes.tokensTotal;
      await recordAiUsage({
        userUid: params.userUid,
        promptKey: 'chapter_cascade',
        inputChars: contPrompt.length,
        outputChars: contRes.text.length,
        exactTokens: contRes.tokensTotal,
        tokensIn: contRes.tokensIn,
        tokensOut: contRes.tokensOut,
        bookId: params.book.id,
        bookTitle: params.book.title,
        chapterNumber: params.chapter.chapter_number,
        description: `Дозаполнение после правки главы #${params.chapter.chapter_number}`,
        alertLink: 'chapters',
      });
      const contParsed = parseFullChapterJson(
        contRes.text.replace('"continuation_content"', '"content"'),
        parsed.title,
        parsed.synopsis,
        validEntityIds
      );
      if (contParsed.content && contParsed.content.length > 300) {
        parsed.content = `${parsed.content.trim()}\n\n* * *\n\n${contParsed.content.trim()}`;
        if (contParsed.continuity_summary) parsed.continuity_summary = contParsed.continuity_summary;
      }
    } catch {
      // keep initial rich revision if continuation times out
    }
  }

  return {
    ...parsed,
    tokensUsed: totalTokensUsed,
    estimatedPages: estimateA5Pages(parsed.content),
  };
}

export async function orchestrateCascadeChapter(params: {
  book: Book;
  chapter: Chapter;
  allChapters?: Chapter[];
  prevChapter?: Chapter;
  prevPrevChapter?: Chapter;
  activeCharacters?: Character[];
  worldEntities?: WorldEntity[];
  styleConfig?: BookStyleConfig;
  targetPages?: number;
  targetWords?: number;
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<string> {
  const rich = await orchestrateCascadeChapterRich(params);
  return rich.content;
}

export async function orchestrateFragmentAiAction(params: {
  book: Book;
  chapter: Chapter;
  selectedText: string;
  surroundingBefore?: string;
  surroundingAfter?: string;
  instruction: string;
  mode?: 'rewrite' | 'expand' | 'dialogue' | 'continue';
  userUid?: number;
  onProgress?: (msg: string) => void;
}): Promise<{ resultText: string; lettersCharged: number }> {
  const {
    book,
    chapter,
    selectedText,
    surroundingBefore = '',
    surroundingAfter = '',
    instruction,
    mode = 'rewrite',
    userUid,
    onProgress,
  } = params;

  const cfg = await getPromptConfig('fragment_ai_rewrite');
  const authorCtx = await loadBookAuthorAiContext({
    book,
    chapter,
    userUid,
    maxDraftChars: 2200,
  });

  const actionGuide: Record<string, string> = {
    rewrite: 'Литературно улучши и перепиши выделенный фрагмент по заданию автора, сохраняя смысл и связность.',
    expand: 'Глубоко раскрой и расширь сцену: добавь детали окружения, психологизм и напряжение в 2–3 раза.',
    dialogue: 'Оживи и перепиши сцену с выразительными, живыми диалогами и подтекстом характеров.',
    continue: 'Органично допиши продолжение сцены строго с места окончания приведённого контекста (600–1800 символов).',
  };

  const basePrompt = renderPrompt(
    cfg.template,
    {
      book_title: book.title,
      chapter_number: chapter.chapter_number,
      chapter_title: chapter.title,
      instruction: `${actionGuide[mode] || ''}\nПожелание автора: ${instruction.trim() || 'Усилить стиль нуар'}`,
      surrounding_context: `${surroundingBefore.slice(-700)}\n[ТОЧКА ВСТАВКИ]\n${surroundingAfter.slice(0, 400)}`,
      selected_text: selectedText || surroundingBefore.slice(-800),
      author_context: authorCtx.combinedPromptBlock || 'Стандартный канон книги',
    },
    cfg.system_instruction
  );

  const est = calculateAiUsageCost({
    inputChars: basePrompt.length,
    outputChars: Math.max(900, Math.round((selectedText.length || 800) * 1.6)),
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });
  await assertChapterCanAfford(userUid, est.totalLetters);

  onProgress?.('ИИ обрабатывает фрагмент главы...');
  const aiRes = await generateProTalkTextWithUsage(
    basePrompt,
    onProgress,
    90,
    userUid,
    `knigai_frag_${book.id}_${chapter.chapter_number}_${Date.now()}`
  );

  const cleanText = aiRes.text
    .replace(/^```[\w]*\n?|```$/g, '')
    .trim();

  const usage = await recordAiUsage({
    userUid,
    promptKey: cfg.key,
    inputChars: basePrompt.length,
    outputChars: cleanText.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    bookId: book.id,
    bookTitle: book.title,
    chapterNumber: chapter.chapter_number,
    description: `Точечная ИИ-правка фрагмента в гл.#${chapter.chapter_number} (${mode})`,
    alertLink: 'chapters',
  });

  return {
    resultText: cleanText,
    lettersCharged: usage.costLetters,
  };
}

