import {
  Book,
  BookReworkMode,
  BookReworkScope,
  Chapter,
  Character,
  WorldEntity,
} from '../../../types';
import { getPromptConfig, renderPrompt } from '../../db/promptRepository';
import { generateProTalkTextWithUsage } from '../protalkText';
import { isUsablePublicUrl, resolvePublicUrlMap } from '../protalkImage';
import { checkSufficientBalance, recordAiUsage } from '../../billing/transactionService';
import { calculateAiUsageCost, formatLettersCount } from '../../billing/costCalculator';
import { buildPlotPromptDirective } from '../../../constants/basicPlots';
import {
  buildRollingStoryContext,
  estimateA5Pages,
  MIN_ACCEPTABLE_CHAPTER_CHARS,
  parseFullChapterJson,
  parseJsonFlexible,
  parseSynopsisBatchJson,
  TARGET_CHAPTER_CHARS,
} from '../chapterBatchEngine';
import {
  cloneBookForRemix,
  saveChapter,
  updateBook,
} from '../../db/bookRepository';
import { saveChapterRevision } from '../../db/revisions/revisionRepository';
import {
  isGenerationAbortedError,
  isGenerationStopRequested,
  recordSessionAppliedItem,
  updateGenerationProgress,
} from '../session/generationSession';
import { callProTalkDecision } from '../decision/protalkDecision';
import { loadBookAuthorAiContext } from '../context/authorContextBuilder';

async function assertReworkCanAfford(userUid: number | undefined, estimatedLetters: number) {
  if (!userUid) return;
  const check = await checkSufficientBalance(userUid, estimatedLetters);
  if (!check.ok) {
    throw new Error(
      `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(estimatedLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
    );
  }
}

async function resolveMedia(worldEntities: WorldEntity[], characters: Character[]) {
  const urlMap = await resolvePublicUrlMap([
    ...worldEntities.map((e) => e.image_url),
    ...characters.map((c) => c.visual_card_url),
  ]);
  const resolveUrl = (raw?: string) => {
    const s = (raw || '').trim();
    return urlMap.get(s) || (isUsablePublicUrl(s) ? s : '');
  };
  return {
    worldEntities: worldEntities.map((e) => ({ ...e, image_url: resolveUrl(e.image_url) || e.image_url })),
    characters: characters.map((c) => ({ ...c, visual_card_url: resolveUrl(c.visual_card_url) || c.visual_card_url })),
  };
}

export async function orchestratePlanReworkSynopsis(params: {
  book: Book;
  chapters: Chapter[];
  startChapter: number;
  endChapter: number;
  mode: BookReworkMode;
  thoughts: string;
  worldEntities?: WorldEntity[];
  characters?: Character[];
  userUid?: number;
  onProgress?: (msg: string) => void;
}): Promise<{ updatedOverview?: string; updatedChapters: Chapter[] }> {
  const {
    book,
    chapters,
    startChapter,
    endChapter,
    mode,
    thoughts,
    worldEntities = [],
    characters = [],
    userUid,
    onProgress,
  } = params;

  const cfg = await getPromptConfig('synopsis_remake_cascade');
  const resolved = await resolveMedia(worldEntities, characters);
  const validEntityIds = new Set(resolved.worldEntities.map((e) => e.id));

  const sorted = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const previousChapters = sorted
    .filter((c) => c.chapter_number < startChapter)
    .slice(-5)
    .map((c) => `Гл.${c.chapter_number} «${c.title}»: ${(c.continuity_summary || c.synopsis || '').slice(0, 140)}`)
    .join('\n');

  const entitiesLine = resolved.worldEntities
    .slice(0, 18)
    .map((e) => `[ID:${e.id}] ${e.name}${e.subtitle_or_role ? ` (${e.subtitle_or_role})` : ''}`)
    .join('; ');

  const targetSlice = sorted.filter(
    (c) => c.chapter_number >= startChapter && c.chapter_number <= endChapter
  );

  let updatedOverview: string | undefined;
  const updatedMap = new Map<number, { title: string; synopsis: string; entity_ids?: number[] }>();

  const CHUNK = 10;
  for (let i = 0; i < targetSlice.length; i += CHUNK) {
    if (isGenerationStopRequested()) break;
    const chunk = targetSlice.slice(i, i + CHUNK);
    const chunkStart = chunk[0].chapter_number;
    const chunkEnd = chunk[chunk.length - 1].chapter_number;

    onProgress?.(
      mode === 'remake'
        ? `Перестраиваем сюжетный план глав #${chunkStart}–#${chunkEnd} по новым мыслям...`
        : `Уточняем и связываем синопсис глав #${chunkStart}–#${chunkEnd}...`
    );

    const existingOutline = chunk
      .map((c) => `Гл.${c.chapter_number} «${c.title}»: ${(c.synopsis || '').slice(0, 180)}`)
      .join('\n');

    const authorCtx = await loadBookAuthorAiContext({
      book,
      userUid,
      maxDraftChars: 2000,
    });

    const prompt = `${renderPrompt(
      cfg.template,
      {
        book_title: book.title,
        start_chapter: chunkStart,
        end_chapter: chunkEnd,
        mode: mode === 'remake' ? 'Полный ремейк по новым мыслям' : 'Редактура и усиление',
        author_thoughts: thoughts.trim() || 'Усилить драматургию, конфликты и логические связки',
      },
      cfg.system_instruction
    )}

Исходное описание книги: ${(book.synopsis_overview || '').slice(0, 600)}
Жанры: ${(book.genres || []).join(', ')} | Тон: ${book.tone || 'нуар'}
${authorCtx.combinedPromptBlock ? `\n${authorCtx.combinedPromptBlock}\n` : ''}${previousChapters ? `Контекст предыдущих глав (остаются в каноне):\n${previousChapters}` : ''}
${entitiesLine ? `Персонажи и сущности мира: ${entitiesLine}` : ''}
Текущий план глав для переработки:
${existingOutline}

Верни СТРОГО валидный JSON-объект без лишних комментариев:
{
  ${i === 0 && mode === 'remake' ? '"book_overview": "Обновленное развернутое описание всей книги (2-3 абзаца), отражающее новый замысел",' : ''}
  "chapters": [
    {
      "chapter_number": ${chunkStart},
      "title": "Яркое название главы без слова Глава",
      "synopsis": "Детальный синопсис 3-4 предложения (цель сцены, конфликт, поворот)",
      "entity_ids": [1, 2]
    }
  ]
}`;

    const est = calculateAiUsageCost({
      inputChars: prompt.length,
      outputChars: chunk.length * 420,
      inputMultiplier: cfg.input_cost_multiplier,
      outputMultiplier: cfg.output_cost_multiplier,
    });
    await assertReworkCanAfford(userUid, est.totalLetters);

    const chatId = `knigai_synremake_${book.id}_${chunkStart}_${Date.now()}`;
    let aiRes;
    try {
      aiRes = await generateProTalkTextWithUsage(prompt, onProgress, 180, userUid, chatId);
    } catch (err) {
      if (isGenerationAbortedError(err)) {
        break;
      }
      throw err;
    }

    await recordAiUsage({
      userUid,
      promptKey: cfg.key,
      inputChars: prompt.length,
      outputChars: aiRes.text.length,
      inputMultiplier: cfg.input_cost_multiplier,
      outputMultiplier: cfg.output_cost_multiplier,
      exactTokens: aiRes.tokensTotal,
      tokensIn: aiRes.tokensIn,
      tokensOut: aiRes.tokensOut,
      bookId: book.id,
      bookTitle: book.title,
      description: `Перестройка синопсиса глав #${chunkStart}–#${chunkEnd} (${mode === 'remake' ? 'ремейк' : 'редактура'})`,
      alertLink: 'chapters',
    });

    if (i === 0 && mode === 'remake') {
      const obj = parseJsonFlexible<{ book_overview?: string }>(aiRes.text);
      if (obj?.book_overview && obj.book_overview.trim().length > 40) {
        updatedOverview = obj.book_overview.trim();
      }
    }

    const parsedItems = parseSynopsisBatchJson(aiRes.text, chunkStart, validEntityIds);
    parsedItems.forEach((item) => {
      updatedMap.set(item.chapter_number, item);
    });
    if (parsedItems.length > 0) {
      recordSessionAppliedItem(`Обновлён синопсис глав #${chunkStart}–#${chunkEnd}`);
    }
  }

  const nextChapters = sorted.map((c) => {
    const upd = updatedMap.get(c.chapter_number);
    if (!upd) return c;
    return {
      ...c,
      title: upd.title || c.title,
      synopsis: upd.synopsis || c.synopsis,
      entity_ids: upd.entity_ids && upd.entity_ids.length > 0 ? upd.entity_ids : c.entity_ids,
    };
  });

  return { updatedOverview, updatedChapters: nextChapters };
}

export async function orchestrateReworkSingleChapter(params: {
  book: Book;
  chapter: Chapter;
  allChapters: Chapter[];
  mode: BookReworkMode;
  thoughts: string;
  worldEntities?: WorldEntity[];
  characters?: Character[];
  userUid?: number;
  saveRevisionSnapshot?: boolean;
  onProgress?: (msg: string) => void;
}): Promise<Chapter & { tokensUsed: number; estimatedPages: number }> {
  const {
    book,
    chapter,
    allChapters,
    mode,
    thoughts,
    worldEntities = [],
    characters = [],
    userUid,
    saveRevisionSnapshot = true,
    onProgress,
  } = params;

  const promptKey = mode === 'remake' ? 'chapter_full_remake' : 'chapter_polish_edit';
  const cfg = await getPromptConfig(promptKey);
  const resolved = await resolveMedia(worldEntities, characters);
  const validEntityIds = new Set(resolved.worldEntities.map((e) => e.id));

  // Snapshot old chapter state before replacing
  if (saveRevisionSnapshot && (chapter.content?.trim() || chapter.synopsis?.trim())) {
    await saveChapterRevision({
      bookId: book.id,
      chapterId: chapter.id,
      chapterNumber: chapter.chapter_number,
      title: chapter.title,
      synopsis: chapter.synopsis,
      content: chapter.content || '',
      revisionNote:
        mode === 'remake'
          ? `Перед ремейком: ${(thoughts || '').slice(0, 90)}`
          : `Перед редактурой: ${(thoughts || '').slice(0, 90)}`,
      mode,
    });
  }

  const { rollingContext, entitiesCompact, styleBlock } = buildRollingStoryContext({
    book,
    chapter,
    allChapters,
    worldEntities: resolved.worldEntities,
    activeCharacters: resolved.characters,
  });

  const plotDirective = buildPlotPromptDirective(book.basic_plots);
  const rawExisting = (chapter.content || '').trim();
  const cappedExisting =
    rawExisting.length > 6800
      ? `${rawExisting.slice(0, 4400)}\n...\n${rawExisting.slice(-2200)}`
      : rawExisting;

  const modeDirective =
    mode === 'remake'
      ? `РЕЖИМ: ПОЛНЫЙ РЕМЕЙК ГЛАВЫ ПО НОВЫМ МЫСЛЯМ АВТОРА.
Напиши главу ЗАНОВО, реализуя новые мысли, повороты и тон. Используй старый черновик лишь как опциональную базу фактов, которые не противоречат новому замыслу.`
      : `РЕЖИМ: ЛИТЕРАТУРНАЯ РЕДАКТУРА И УСИЛЕНИЕ.
Сохрани события, сюжетную линию и хронологию исходной главы, но радикально улучши слог, ритм, психологизм, живые диалоги и атмосферные детали.`;

  const authorCtx = await loadBookAuthorAiContext({
    book,
    chapter,
    userUid,
    maxDraftChars: 2400,
  });

  const prompt = `${renderPrompt(
    cfg.template,
    {
      book_title: book.title,
      chapter_number: chapter.chapter_number,
      chapter_title: chapter.title,
      edit_instruction: thoughts.trim() || 'Повысить литературное качество и глубину сцен.',
    },
    cfg.system_instruction
  )}

${modeDirective}
Жанры: ${(book.genres || []).join(', ')} | Тон: ${book.tone || 'нуар'}
Актуальный синопсис главы: ${chapter.synopsis || 'Развёрнутая глава книги'}

${authorCtx.combinedPromptBlock ? `${authorCtx.combinedPromptBlock}\n\n` : ''}${rollingContext}

Персонажи, локации и артефакты (используй прямые ссылки ref_img и описания):
${entitiesCompact}

${styleBlock}
${plotDirective}

${cappedExisting ? `ИСХОДНЫЙ ТЕКСТ ГЛАВЫ:\n«${cappedExisting}»` : 'Исходный текст отсутствует — создай сцены с нуля по синопсису.'}

ТРЕБОВАНИЯ:
1. Объём: ${TARGET_CHAPTER_CHARS}–15500 символов с пробелами (~10–12 стр. А5, 4–5 полных сцен с разделителем «* * *»).
2. Никакого капслока и без заголовка «Глава X» внутри content.
3. Верни СТРОГО JSON-объект:
{
  "chapter_number": ${chapter.chapter_number},
  "title": "${chapter.title.replace(/"/g, '\\"')}",
  "synopsis": "Актуальный синопсис главы (2-3 предложения)",
  "content": "Полный литературный текст главы через \\n\\n",
  "footnotes": ["*1: Пояснение или отсылка к лору"],
  "entity_ids": [1, 2],
  "continuity_summary": "Краткий итог для следующих глав (до 350 знаков)"
}`;

  const est = calculateAiUsageCost({
    inputChars: prompt.length,
    outputChars: TARGET_CHAPTER_CHARS,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });
  await assertReworkCanAfford(userUid, est.totalLetters);

  onProgress?.(
    mode === 'remake'
      ? `Переписываем (ремейк) главу #${chapter.chapter_number} «${chapter.title}»...`
      : `Редактируем и усиливаем главу #${chapter.chapter_number} «${chapter.title}»...`
  );

  const chatId = `knigai_rework_${mode}_${book.id}_${chapter.chapter_number}_${Date.now()}`;
  const aiRes = await generateProTalkTextWithUsage(prompt, onProgress, 260, userUid, chatId);
  let totalTokens = aiRes.tokensTotal;

  await recordAiUsage({
    userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: aiRes.text.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    bookId: book.id,
    bookTitle: book.title,
    chapterNumber: chapter.chapter_number,
    description: `${mode === 'remake' ? 'Ремейк' : 'Редактура'} главы #${chapter.chapter_number} «${chapter.title}»`,
    alertLink: 'chapters',
  });

  const parsed = parseFullChapterJson(aiRes.text, chapter.title, chapter.synopsis || '', validEntityIds);

  // Length & completeness safeguard with 763 check
  let needsContinuation =
    !isGenerationStopRequested() &&
    parsed.content.length < MIN_ACCEPTABLE_CHAPTER_CHARS &&
    parsed.content.length > 250;

  if (needsContinuation && parsed.content.length >= 6000) {
    try {
      const qaCheck = await callProTalkDecision({
        text: `Синопсис: ${parsed.synopsis || chapter.synopsis || ''}\n\nФинал главы:\n${parsed.content.slice(-2600)}`,
        instruction:
          'Оцени: является ли этот финал главы драматически и сюжетно завершённым без обрыва на полуслове?',
        options: 'true::Глава логически завершена;;false::Текст оборван, требуется дозапись концовки',
        decisionType: 'noul',
        aiModel: '~typesafe/jev-latest',
        userUid,
        bookId: book.id,
        bookTitle: book.title,
        chapterNumber: chapter.chapter_number,
        promptKey: 'decision_chapter_qa',
        operationDescription: `Проверка завершённости гл.#${chapter.chapter_number} (763)`,
        alertLink: 'chapters',
      });
      if (qaCheck.boolResult && qaCheck.probability >= 0.72) {
        needsContinuation = false;
      }
    } catch {
      // proceed normally if check fails
    }
  }

  if (needsContinuation) {
    const missing = Math.max(3500, TARGET_CHAPTER_CHARS - parsed.content.length);
    onProgress?.(`Дозаписываем финальные сцены главы #${chapter.chapter_number} (+${missing} симв.)...`);
    const contPrompt = `Органично допиши концовку главы #${chapter.chapter_number} («${parsed.title}») книги «${book.title}» объёмом +${missing} символов, сохраняя стиль и задачу: ${thoughts || 'литературное завершение'}.
Хвост: «...${parsed.content.slice(-1100)}»
Верни СТРОГО JSON: {"continuation_content":"Текст через \\n\\n","continuity_summary":"Итог главы до 350 знаков"}`;
    try {
      const contRes = await generateProTalkTextWithUsage(
        contPrompt,
        onProgress,
        220,
        userUid,
        `knigai_rwcont_${book.id}_${chapter.chapter_number}_${Date.now()}`
      );
      totalTokens += contRes.tokensTotal;
      await recordAiUsage({
        userUid,
        promptKey: cfg.key,
        inputChars: contPrompt.length,
        outputChars: contRes.text.length,
        exactTokens: contRes.tokensTotal,
        tokensIn: contRes.tokensIn,
        tokensOut: contRes.tokensOut,
        bookId: book.id,
        bookTitle: book.title,
        chapterNumber: chapter.chapter_number,
        description: `Дозаполнение при переработке гл.#${chapter.chapter_number}`,
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
      // keep base reworked chapter
    }
  }

  const nextChapter: Chapter = {
    ...chapter,
    title: parsed.title || chapter.title,
    synopsis: parsed.synopsis || chapter.synopsis,
    content: parsed.content,
    footnotes: parsed.footnotes.length > 0 ? parsed.footnotes : chapter.footnotes,
    entity_ids:
      parsed.entity_ids.length > 0
        ? parsed.entity_ids
        : chapter.entity_ids,
    continuity_summary: parsed.continuity_summary,
    status: parsed.content.length > 100 ? 'ready' : chapter.status,
  };

  return {
    ...nextChapter,
    tokensUsed: totalTokens,
    estimatedPages: estimateA5Pages(nextChapter.content),
  };
}

export async function orchestrateReworkChapterRange(params: {
  book: Book;
  chapters: Chapter[];
  mode: BookReworkMode;
  scope: BookReworkScope;
  startChapterNumber: number;
  thoughts: string;
  createBranch?: boolean;
  branchTitle?: string;
  updateSynopsesFirst?: boolean;
  worldEntities?: WorldEntity[];
  characters?: Character[];
  userUid?: number;
  abortRef?: { cancelled: boolean };
  onProgress?: (msg: string) => void;
  onChapterSaved?: (updatedChapter: Chapter, workingChapters: Chapter[]) => void;
  onBookUpdated?: (updatedBook: Book) => void;
}): Promise<{ book: Book; chapters: Chapter[]; processedCount: number }> {
  const {
    book,
    chapters,
    mode,
    scope,
    startChapterNumber,
    thoughts,
    createBranch = false,
    branchTitle,
    updateSynopsesFirst = mode === 'remake',
    worldEntities = [],
    characters = [],
    userUid,
    abortRef,
    onProgress,
    onChapterSaved,
    onBookUpdated,
  } = params;

  let workingBook = book;
  let workingChapters = [...chapters].sort((a, b) => a.chapter_number - b.chapter_number);
  let workingCharacters = characters;

  // Step 0: Optional Branch Clone so original book stays intact
  if (createBranch) {
    onProgress?.('Создаём отдельную ветку-копию книги перед переделкой...');
    const branchedTitle = branchTitle?.trim() || `[Переделка] ${book.title}`;
    const cloned = await cloneBookForRemix(book, branchedTitle, book.author, userUid);
    workingBook = {
      ...cloned.book,
      parent_book_id: book.id,
      relation_type: 'reboot',
      series_name: book.series_name || book.title,
    };
    await updateBook(workingBook);
    workingChapters = [...cloned.chapters].sort((a, b) => a.chapter_number - b.chapter_number);
    workingCharacters = cloned.characters;
    onBookUpdated?.(workingBook);
  }

  const rangeStart = scope === 'all' ? (workingChapters[0]?.chapter_number || 1) : startChapterNumber;
  const rangeEnd =
    scope === 'current'
      ? startChapterNumber
      : workingChapters[workingChapters.length - 1]?.chapter_number || startChapterNumber;

  // Step 1: Rebuild synopses if requested or full remake
  if (updateSynopsesFirst || mode === 'remake') {
    const planRes = await orchestratePlanReworkSynopsis({
      book: workingBook,
      chapters: workingChapters,
      startChapter: rangeStart,
      endChapter: rangeEnd,
      mode,
      thoughts,
      worldEntities,
      characters: workingCharacters,
      userUid,
      onProgress,
    });

    workingChapters = planRes.updatedChapters;
    if (planRes.updatedOverview) {
      workingBook = {
        ...workingBook,
        synopsis_overview: planRes.updatedOverview,
        cover_config: {
          ...workingBook.cover_config,
          backBlurb: planRes.updatedOverview,
        },
      };
      await updateBook(workingBook);
      onBookUpdated?.(workingBook);
      recordSessionAppliedItem('Обновлено описание книги');
    }

    // Persist updated synopses for range
    for (const ch of workingChapters) {
      if (ch.chapter_number >= rangeStart && ch.chapter_number <= rangeEnd) {
        const saved = await saveChapter(ch, ch.id, userUid);
        workingChapters = workingChapters.map((x) => (x.chapter_number === saved.chapter_number ? saved : x));
      }
    }
  }

  // Step 2: Sequentially rewrite target chapters with rolling continuity
  const targetList = workingChapters.filter(
    (c) => c.chapter_number >= rangeStart && c.chapter_number <= rangeEnd
  );
  updateGenerationProgress(0, targetList.length);

  let processedCount = 0;
  for (let i = 0; i < targetList.length; i++) {
    if (abortRef?.cancelled || isGenerationStopRequested()) {
      onProgress?.(`Остановлено пользователем. Сохранено глав: ${processedCount}.`);
      break;
    }

    const ch = targetList[i];
    if (targetList.length > 1 && thoughts.trim().length > 8 && ch.content && ch.content.trim().length > 400) {
      try {
        onProgress?.(`Фильтр 763: проверяем, затрагивает ли замысел главу #${ch.chapter_number}...`);
        const filterRes = await callProTalkDecision({
          text: `Режим: ${mode === 'remake' ? 'ремейк' : 'редактура'}\nМысли автора: ${thoughts}\n\nГлава #${ch.chapter_number} «${ch.title}»:\nСинопсис: ${ch.synopsis || ''}\nОтрывок: ${ch.content.slice(0, 2200)}`,
          instruction:
            'Определи: нужно ли перерабатывать или редактировать эту конкретную главу с учётом указаний автора (если изменения общие для всей книги или сюжетно связаны — true; если указания касаются только другой конкретной сцены/главы — false)?',
          options: 'true::Нужно переработать эту главу;;false::Глава не затронута указанием, пропустить для экономии букв',
          decisionType: 'noul',
          aiModel: '~typesafe/jev-latest',
          userUid,
          bookId: workingBook.id,
          bookTitle: workingBook.title,
          chapterNumber: ch.chapter_number,
          promptKey: 'decision_rework_filter',
          operationDescription: `Фильтр 763 при переработке гл.#${ch.chapter_number}`,
          alertLink: 'chapters',
        });
        if (!filterRes.boolResult && filterRes.probability <= 0.35) {
          onProgress?.(`Глава #${ch.chapter_number} пропущена фильтром 763 (не затронута — экономия букв).`);
          processedCount++;
          updateGenerationProgress(processedCount, targetList.length);
          recordSessionAppliedItem(`Гл. #${ch.chapter_number}: пропущена фильтром 763`);
          continue;
        }
      } catch {
        // Proceed with standard chapter rework if filter errors
      }
    }

    onProgress?.(
      `Глава ${i + 1} из ${targetList.length} (#${ch.chapter_number} «${ch.title}»)...`
    );

    try {
      const reworked = await orchestrateReworkSingleChapter({
        book: workingBook,
        chapter: ch,
        allChapters: workingChapters,
        mode,
        thoughts,
        worldEntities,
        characters: workingCharacters,
        userUid,
        saveRevisionSnapshot: !createBranch,
        onProgress,
      });

      const saved = await saveChapter(reworked, ch.id, userUid);
      workingChapters = workingChapters
        .map((item) => (item.chapter_number === saved.chapter_number ? saved : item))
        .sort((a, b) => a.chapter_number - b.chapter_number);
      processedCount++;
      updateGenerationProgress(processedCount, targetList.length);
      recordSessionAppliedItem(`Глава #${saved.chapter_number} «${saved.title}»`);
      onChapterSaved?.(saved, workingChapters);
    } catch (err) {
      if (isGenerationAbortedError(err)) {
        onProgress?.(`Остановлено пользователем. Сохранено глав: ${processedCount}.`);
        break;
      }
      throw err;
    }
  }

  return {
    book: workingBook,
    chapters: workingChapters,
    processedCount,
  };
}
