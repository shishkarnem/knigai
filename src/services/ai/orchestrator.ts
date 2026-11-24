import { getPromptConfig, renderPrompt } from '../db/promptRepository';
import { generateProTalkTextWithUsage } from './protalkText';
import {
  generateProTalkImage,
  ImageGenerationResult,
  isUsablePublicUrl,
  resolvePublicReferenceUrl,
  resolvePublicUrlMap,
} from './protalkImage';
import { registerFileInDb, getOrCreateBookFolder } from '../db/fileStorageRepository';
import { saveGalleryItem } from '../db/bookRepository';
import { Book, Character, Chapter, WorldEntity, BookStyleConfig } from '../../types';
import { buildPlotPromptDirective } from '../../constants/basicPlots';
import { checkSufficientBalance, recordAiUsage } from '../billing/transactionService';
import {
  calculateAiUsageCost,
  estimateImageGenerationLetters,
  formatLettersCount,
} from '../billing/costCalculator';
import {
  buildRollingStoryContext,
  ParsedSynopsisItem,
  parseSynopsisBatchJson,
} from './chapterBatchEngine';
import {
  isGenerationAbortedError,
  isGenerationStopRequested,
} from './session/generationSession';
import { callProTalkDecision } from './decision/protalkDecision';
import { loadBookAuthorAiContext } from './context/authorContextBuilder';
export {
  orchestrateCascadeChapterRich,
  orchestrateEditChapterWithAi,
  orchestrateCascadeChapter,
  orchestrateFragmentAiAction,
} from './chapters/chapterAiService';

export interface ConceptResult {
  title: string;
  subtitle: string;
  worldDescription: string;
  conflict: string;
  synopsisArc: string;
}

async function assertCanAfford(userUid: number | undefined, estimatedLetters: number) {
  if (!userUid) return;
  const check = await checkSufficientBalance(userUid, estimatedLetters);
  if (!check.ok) {
    throw new Error(
      `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(estimatedLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
    );
  }
}

async function buildEntitiesSummaryAsync(params: {
  worldEntities?: WorldEntity[];
  chapterEntityIds?: number[];
  characters?: Character[];
  extraUrls?: Array<string | undefined>;
}): Promise<{
  charactersInvolved: string;
  entitiesSummary: string;
  firstVisualRefUrl: string;
  visualRefsPromptBlock: string;
}> {
  const pool = params.worldEntities || [];
  const chars = params.characters || [];
  const rawUrls = [
    ...pool.map((e) => e.image_url),
    ...chars.map((c) => c.visual_card_url),
    ...(params.extraUrls || []),
  ];
  const urlMap = await resolvePublicUrlMap(rawUrls);
  const toPublic = (raw?: string) => {
    const trimmed = (raw || '').trim();
    if (!trimmed) return '';
    return urlMap.get(trimmed) || (isUsablePublicUrl(trimmed) ? trimmed : '');
  };

  let selected: WorldEntity[] = [];
  if (params.chapterEntityIds && params.chapterEntityIds.length > 0 && pool.length > 0) {
    const idSet = new Set(params.chapterEntityIds.map(Number));
    selected = pool.filter((e) => idSet.has(e.id));
  }
  if (selected.length === 0) {
    selected = pool.slice(0, 14);
  } else if (selected.length < pool.length) {
    // Also keep remaining world entities represented so no lore (locations, items, factions, laws) is lost
    const selSet = new Set(selected.map((e) => e.id));
    selected = [...selected, ...pool.filter((e) => !selSet.has(e.id)).slice(0, Math.max(0, 14 - selected.length))];
  }

  const typeLabel: Record<WorldEntity['entity_type'], string> = {
    character: 'Character',
    location: 'Location',
    item: 'Artifact/Item',
    faction: 'Faction',
    law: 'World law',
  };

  const charEntities = selected.filter((e) => e.entity_type === 'character');
  const charactersInvolved =
    charEntities.length > 0
      ? charEntities
          .map((c) => {
            const img = toPublic(c.image_url);
            return `${c.name}${c.subtitle_or_role ? ` (${c.subtitle_or_role})` : ''}${img ? ` [ref: ${img}]` : ''}`;
          })
          .join(', ')
      : chars.length > 0
      ? chars
          .map((c) => {
            const img = toPublic(c.visual_card_url);
            return `${c.name} (${c.role})${img ? ` [ref: ${img}]` : ''}`;
          })
          .join(', ')
      : 'protagonists';

  const visualLinks: string[] = [];
  const summaryParts = selected.map((e) => {
    const img = toPublic(e.image_url);
    if (img) {
      visualLinks.push(`- ${typeLabel[e.entity_type]} "${e.name}": ${img}`);
    }
    return `${typeLabel[e.entity_type]} "${e.name}"${e.subtitle_or_role ? ` (${e.subtitle_or_role})` : ''}: ${(e.description || '').slice(0, 140)}${img ? ` [Image URL: ${img}]` : ''}`;
  });

  const existingNames = new Set(selected.map((e) => e.name.trim().toLowerCase()));
  for (const ch of chars) {
    if (ch.name && !existingNames.has(ch.name.trim().toLowerCase())) {
      const img = toPublic(ch.visual_card_url);
      if (img) visualLinks.push(`- Character "${ch.name}": ${img}`);
      summaryParts.push(`Character "${ch.name}" (${ch.role}): ${(ch.description || '').slice(0, 120)}${img ? ` [Image URL: ${img}]` : ''}`);
    }
  }

  const entitiesSummary =
    summaryParts.length > 0
      ? summaryParts.join('; ')
      : 'dark noir atmosphere and consistent characters';

  const firstVisualRefUrl =
    selected.map((e) => toPublic(e.image_url)).find(Boolean) ||
    pool.map((e) => toPublic(e.image_url)).find(Boolean) ||
    chars.map((c) => toPublic(c.visual_card_url)).find(Boolean) ||
    '';

  const visualRefsPromptBlock =
    visualLinks.length > 0
      ? `World Lore & Character Direct Reference Images (read direct URLs):\n${visualLinks.join('\n')}`
      : '';

  return {
    charactersInvolved,
    entitiesSummary,
    firstVisualRefUrl,
    visualRefsPromptBlock,
  };
}

export async function orchestrateWorldConcept(params: {
  genres: string[];
  basicPlots?: string[];
  tone: string;
  audience: string;
  setting: string;
  conflict: string;
  targetChapters: number;
  authorInstructions?: string;
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ConceptResult> {
  const cfg = await getPromptConfig('genre_mixer');
  const plotDirective = buildPlotPromptDirective(params.basicPlots);
  const basePrompt = renderPrompt(
    cfg.template,
    {
      genres: params.genres.join(', '),
      tone: params.tone,
      audience: params.audience,
      setting: params.setting,
      conflict: params.conflict,
      target_chapters: params.targetChapters,
      plot_directive: plotDirective,
    },
    cfg.system_instruction
  );
  const prompt = params.authorInstructions?.trim()
    ? `${basePrompt}\n\n[ПОЖЕЛАНИЯ И УКАЗАНИЯ АВТОРА К КНИГЕ / СТИЛЮ / ФАНФИКУ]:\n${params.authorInstructions.trim().slice(0, 1500)}`
    : basePrompt;

  const est = calculateAiUsageCost({
    inputChars: prompt.length,
    outputChars: 2200,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });
  await assertCanAfford(params.userUid, est.totalLetters);

  const aiRes = await generateProTalkTextWithUsage(prompt, params.onProgress, 55, params.userUid);
  const text = aiRes.text;

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: text.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    description: 'Генерация концепта книги и смешения жанров',
    alertLink: 'constructor',
  });

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  let title = 'Хроники переплетенных миров';
  let subtitle = 'Тайна забытого равновесия';

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('1.') || lower.includes('заглавие') || lower.includes('название:')) {
      const candidate = line
        .replace(/^[0-9.\-*\s]+/, '')
        .replace(/^(название|заглавие):?\s*/i, '')
        .replace(/["«»]/g, '')
        .trim();
      if (candidate.length > 2 && candidate.length < 100) title = candidate;
    } else if (lower.startsWith('2.') || lower.includes('подзаголовок:')) {
      const candidate = line
        .replace(/^[0-9.\-*\s]+/, '')
        .replace(/^подзаголовок:?\s*/i, '')
        .replace(/["«»]/g, '')
        .trim();
      if (candidate.length > 2 && candidate.length < 160) subtitle = candidate;
    }
  }

  return {
    title,
    subtitle,
    worldDescription: text,
    conflict: params.conflict,
    synopsisArc: '',
  };
}

export async function orchestrateSynopsisBatch(params: {
  book: Book;
  startChapter: number;
  endChapter: number;
  characters?: Character[];
  worldEntities?: WorldEntity[];
  existingChapters?: Chapter[];
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ParsedSynopsisItem[]> {
  const cfg = await getPromptConfig('synopsis_generator');
  const plotDirective = buildPlotPromptDirective(params.book.basic_plots);
  const authorCtx = await loadBookAuthorAiContext({
    book: params.book,
    userUid: params.userUid,
    maxDraftChars: 2400,
  });
  const synUrlMap = await resolvePublicUrlMap([
    ...(params.worldEntities || []).map((e) => e.image_url),
    ...(params.characters || []).map((c) => c.visual_card_url),
  ]);
  const synImg = (raw?: string) => {
    const t = (raw || '').trim();
    return synUrlMap.get(t) || (isUsablePublicUrl(t) ? t : '');
  };
  const charsList =
    params.characters
      ?.map((c) => {
        const img = synImg(c.visual_card_url);
        return `${c.name} (${c.role})${img ? ` [ref: ${img}]` : ''}`;
      })
      .join(', ') || 'Основные персонажи книги';

  const entitiesCatalog =
    params.worldEntities && params.worldEntities.length > 0
      ? params.worldEntities
          .slice(0, 20)
          .map((e) => {
            const img = synImg(e.image_url);
            return `[ID:${e.id}:${e.entity_type}] ${e.name}${e.subtitle_or_role ? ` (${e.subtitle_or_role})` : ''}: ${(e.description || '').slice(0, 120)}${img ? ` [ref: ${img}]` : ''}`;
          })
          .join('; ')
      : charsList;

  const requestedCount = Math.max(1, params.endChapter - params.startChapter + 1);
  const validEntityIds = new Set((params.worldEntities || []).map((e) => e.id));
  const collected = new Map<number, ParsedSynopsisItem>();

  let tokensInSum = 0;
  let tokensOutSum = 0;
  let tokensTotalSum = 0;
  let inputCharsSum = 0;
  let outputCharsSum = 0;

  let cursorStart = params.startChapter;
  let attempt = 0;
  const maxPasses = 3;

  let abortedError: unknown = null;

  while (cursorStart <= params.endChapter && attempt < maxPasses) {
    if (isGenerationStopRequested()) break;
    attempt += 1;
    const passCount = params.endChapter - cursorStart + 1;
    const prevKnown = [
      ...(params.existingChapters || []).filter((c) => c.chapter_number < cursorStart),
      ...Array.from(collected.values()).map((s) => ({
        chapter_number: s.chapter_number,
        title: s.title,
        synopsis: s.synopsis,
        continuity_summary: s.synopsis,
      })),
    ]
      .sort((a, b) => a.chapter_number - b.chapter_number)
      .slice(-5);

    const passPrevArc =
      prevKnown.length > 0
        ? prevKnown
            .map((c) => `Гл.${c.chapter_number} «${c.title}»: ${(c.continuity_summary || c.synopsis || '').slice(0, 110)}`)
            .join(' | ')
        : 'Начало произведения';

    const basePrompt = renderPrompt(
      cfg.template,
      {
        title: params.book.title,
        genres: (params.book.genres || []).join(', '),
        setting: params.book.setting || 'Нуарный сеттинг книги',
        conflict: params.book.synopsis_overview || '',
        tone: params.book.tone || 'приключенческий',
        target_chapters: params.book.target_chapters,
        start_chapter: cursorStart,
        end_chapter: params.endChapter,
        characters: charsList,
        entities_catalog: entitiesCatalog,
        prev_arc: passPrevArc,
        plot_directive: plotDirective,
      },
      cfg.system_instruction
    );

    const authorBlock = authorCtx.combinedPromptBlock ? `\n\n${authorCtx.combinedPromptBlock}` : '';
    const prompt = `${basePrompt}${authorBlock}\n\nВажное требование: массив "chapters" должен содержать ровно ${passCount} объектов — строго для каждой главы с #${cursorStart} по #${params.endChapter} включительно (chapter_number от ${cursorStart} до ${params.endChapter} подряд без пропусков).`;

    if (attempt === 1) {
      const est = calculateAiUsageCost({
        inputChars: prompt.length,
        outputChars: Math.max(1200, requestedCount * 360),
        inputMultiplier: cfg.input_cost_multiplier,
        outputMultiplier: cfg.output_cost_multiplier,
      });
      await assertCanAfford(params.userUid, est.totalLetters);
    }

    if (params.onProgress && attempt > 1) {
      params.onProgress(`Дозаполнение синопсисов: осталось с гл. #${cursorStart} по #${params.endChapter}...`);
    }

    const isolatedChatId = `knigai_syn_${params.book.id}_${cursorStart}_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`;
    let aiRes;
    try {
      aiRes = await generateProTalkTextWithUsage(prompt, params.onProgress, 180, params.userUid, isolatedChatId);
    } catch (err) {
      if (isGenerationAbortedError(err)) {
        abortedError = err;
        break;
      }
      throw err;
    }
    const text = aiRes.text;

    tokensInSum += aiRes.tokensIn;
    tokensOutSum += aiRes.tokensOut;
    tokensTotalSum += aiRes.tokensTotal;
    inputCharsSum += prompt.length;
    outputCharsSum += text.length;

    const batchItems = parseSynopsisBatchJson(text, cursorStart, validEntityIds);
    for (const item of batchItems) {
      if (item.chapter_number >= params.startChapter && item.chapter_number <= params.endChapter) {
        collected.set(item.chapter_number, item);
      }
    }

    if (isGenerationStopRequested()) break;

    // Advance cursor past the highest contiguous generated chapter
    let nextMissing = params.startChapter;
    while (nextMissing <= params.endChapter && collected.has(nextMissing)) {
      nextMissing += 1;
    }
    if (nextMissing === cursorStart) {
      break; // avoid infinite loop if model returned nothing usable
    }
    cursorStart = nextMissing;
  }

  const finalItems = Array.from(collected.values()).sort((a, b) => a.chapter_number - b.chapter_number);
  const actualMin = finalItems.length > 0 ? finalItems[0].chapter_number : params.startChapter;
  const actualMax = finalItems.length > 0 ? finalItems[finalItems.length - 1].chapter_number : params.startChapter - 1;
  const planDesc =
    finalItems.length > 0
      ? `Генерация JSON-плана глав #${actualMin}–${actualMax} (${finalItems.length} из ${requestedCount} шт.) книги «${params.book.title}»`
      : `Попытка генерации JSON-плана глав #${params.startChapter}–${params.endChapter} книги «${params.book.title}» (ответ не распознан)`;

  if (tokensTotalSum > 0) {
    await recordAiUsage({
      userUid: params.userUid,
      promptKey: cfg.key,
      inputChars: inputCharsSum,
      outputChars: outputCharsSum,
      inputMultiplier: cfg.input_cost_multiplier,
      outputMultiplier: cfg.output_cost_multiplier,
      exactTokens: tokensTotalSum,
      tokensIn: tokensInSum,
      tokensOut: tokensOutSum,
      bookId: params.book.id,
      bookTitle: params.book.title,
      description: planDesc,
      alertLink: 'chapters',
    });
  }

  if (finalItems.length === 0 && abortedError) {
    throw abortedError;
  }

  return finalItems;
}

export async function orchestrateCharacterProfile(params: {
  book: Book;
  name: string;
  role: string;
  traits: string[];
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<{ description: string; visualPrompt: string }> {
  const cfg = await getPromptConfig('character_bible');
  const prompt = renderPrompt(
    cfg.template,
    {
      name: params.name,
      role: params.role,
      traits: params.traits.join(', '),
      book_title: params.book.title,
      setting: params.book.setting || 'книжный нуар',
      genres: (params.book.genres || []).join(', '),
    },
    cfg.system_instruction
  );

  const est = calculateAiUsageCost({
    inputChars: prompt.length,
    outputChars: 1400,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });
  await assertCanAfford(params.userUid, est.totalLetters);

  const aiRes = await generateProTalkTextWithUsage(prompt, params.onProgress, 45, params.userUid);
  const text = aiRes.text;

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: text.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    bookId: params.book.id,
    bookTitle: params.book.title,
    description: `Создание анкеты персонажа «${params.name}»`,
    alertLink: 'characters',
  });

  const visualCfg = await getPromptConfig('character_visual_card');
  const visualPrompt = renderPrompt(visualCfg.template, {
    name: params.name,
    role: params.role,
    traits: params.traits.join(', '),
    description: text.slice(0, 260),
  });

  return {
    description: text,
    visualPrompt,
  };
}

export async function orchestrateVisualCardImage(params: {
  characterName: string;
  visualPrompt: string;
  referenceUrl?: string;
  bookId?: number;
  bookTitle?: string;
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ImageGenerationResult> {
  const cfg = await getPromptConfig('character_visual_card');
  const est = calculateAiUsageCost({
    inputChars: params.visualPrompt.length,
    outputChars: 0,
    inputMultiplier: cfg.input_cost_multiplier,
    isImage: true,
  });
  await assertCanAfford(params.userUid, est.totalLetters);

  if (params.onProgress) params.onProgress('Генерация визуальной карты (коллаж 4 ракурса)...');
  const resolvedCardRef = await resolvePublicReferenceUrl(params.referenceUrl);
  const res = await generateProTalkImage({
    prompt: params.visualPrompt,
    aspectRatio: '3:4',
    referenceImageUrl: resolvedCardRef || undefined,
    userUid: params.userUid,
  });

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: cfg.key,
    inputChars: params.visualPrompt.length,
    outputChars: 0,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    isImage: true,
    exactTokens: res.tokensTotal,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    operationType: 'image_generation',
    bookId: params.bookId,
    bookTitle: params.bookTitle,
    description: `Визуальная карта персонажа «${params.characterName}»`,
    alertLink: 'characters',
  });

  try {
    let folderId: number | null = null;
    if (params.bookId && params.bookTitle) {
      const folder = await getOrCreateBookFolder(params.bookId, params.bookTitle, params.userUid);
      folderId = folder.id;
    }
    const record = await registerFileInDb({
      name: `Визуальная карта: ${params.characterName}`,
      original_url: res.url,
      mime_type: 'image/jpeg',
      folder_id: folderId,
      user_uid: params.userUid,
    });
    if (record?.original_url && isUsablePublicUrl(record.original_url)) {
      res.url = record.original_url;
    }
  } catch (e) {
    console.warn('Auto register in file_storage error:', e);
  }

  return res;
}

/**
 * Selects which characters, locations, items, factions & world laws from DB apply to a specific chapter
 */
export async function pickChapterEntities(params: {
  book: Book;
  chapter: Chapter;
  prevChapter?: Chapter;
  worldEntities: WorldEntity[];
  characters?: Character[];
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<number[]> {
  const pool = params.worldEntities || [];
  if (pool.length === 0) return [];

  const targetText = `${params.chapter.title} ${params.chapter.synopsis || ''}`.toLowerCase();
  const heuristicIds = pool
    .filter((e) => e.name && targetText.includes(e.name.toLowerCase()))
    .map((e) => e.id);

  // Use ultra-economical ProTalk 763 Decisions (~typesafe/jev-latest) instead of full chat LLM
  const selectedIds = new Set<number>(heuristicIds);
  const typeRu: Record<string, string> = {
    character: 'Персонаж',
    location: 'Локация',
    item: 'Предмет',
    faction: 'Фракция',
    law: 'Закон мира',
  };

  try {
    const contextText = [
      `Книга: «${params.book.title}»`,
      `Глава #${params.chapter.chapter_number} «${params.chapter.title}»`,
      `Синопсис главы: ${params.chapter.synopsis || 'Развитие сюжета'}`,
      `Предыдущая глава: ${params.prevChapter?.synopsis || 'Начало произведения'}`,
      heuristicIds.length > 0
        ? `Уже найдены по упоминанию: ${pool
            .filter((e) => heuristicIds.includes(e.id))
            .map((e) => e.name)
            .join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    params.onProgress?.('Подбор активных сущностей лора (Decisions 763)...');
    for (let slot = 0; slot < 3 && selectedIds.size < 8; slot++) {
      const remaining = pool.filter((e) => !selectedIds.has(e.id));
      if (remaining.length === 0) break;

      const optList = remaining
        .slice(0, 15)
        .map(
          (e) =>
            `${e.id}::(${typeRu[e.entity_type] || e.entity_type}) ${e.name}: ${(e.description || '').slice(0, 75)}`
        );
      optList.push('none::Дополнительные сущности для этой главы не нужны');

      const dRes = await callProTalkDecision({
        text: contextText,
        instruction:
          slot === 0
            ? 'Выбери ID самой важной сущности мира (персонаж/локация/артефакт/закон) из списка, необходимой в этой главе.'
            : 'Выбери ID ещё одной важной сущности для сцены этой главы, или выбери none.',
        options: optList.join(';;'),
        decisionType: 'choice',
        aiModel: '~typesafe/jev-latest',
        userUid: params.userUid,
        bookId: params.book.id,
        bookTitle: params.book.title,
        chapterNumber: params.chapter.chapter_number,
        promptKey: 'chapter_entity_picker',
        operationDescription: `Подбор 763 сущностей для гл.#${params.chapter.chapter_number}`,
        alertLink: 'chapters',
      });

      if (!dRes.decision || dRes.decision === 'none') break;
      const numId = Number(dRes.decision.match(/\d+/)?.[0]);
      if (Number.isFinite(numId) && pool.some((e) => e.id === numId)) {
        selectedIds.add(numId);
      } else {
        break;
      }
    }
  } catch (err) {
    console.warn('AI entity picker 763 notice, falling back cleanly:', err);
  }

  return selectedIds.size > 0 ? Array.from(selectedIds) : pool.slice(0, 5).map((e) => e.id);
}



export async function orchestrateChapterIllustration(params: {
  book: Book;
  chapter: Chapter;
  sceneDescription: string;
  aspectRatio?: '3:4' | '9:16' | '1:1' | '16:9';
  referenceCardUrl?: string;
  worldEntities?: WorldEntity[];
  characters?: Character[];
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ImageGenerationResult> {
  const cfg = await getPromptConfig('chapter_illustration');
  const { charactersInvolved, entitiesSummary, firstVisualRefUrl, visualRefsPromptBlock } =
    await buildEntitiesSummaryAsync({
      worldEntities: params.worldEntities,
      chapterEntityIds: params.chapter.entity_ids,
      characters: params.characters,
      extraUrls: [params.referenceCardUrl],
    });

  const explicitRef = params.referenceCardUrl ? await resolvePublicReferenceUrl(params.referenceCardUrl) : '';
  const effectiveRefUrl =
    params.referenceCardUrl !== undefined ? explicitRef : firstVisualRefUrl;

  const basePrompt = renderPrompt(cfg.template, {
    title: params.book.title,
    chapter_number: params.chapter.chapter_number,
    chapter_title: params.chapter.title,
    scene_description: params.sceneDescription,
    characters_involved: effectiveRefUrl
      ? `${charactersInvolved} (match visual reference card ${effectiveRefUrl})`
      : charactersInvolved,
    entities_summary: entitiesSummary,
    aspect_ratio: params.aspectRatio || '3:4',
  });
  const authorHints = [
    params.book.author_instructions?.trim() ? `Визуальные/сюжетные акценты книги: ${params.book.author_instructions.trim().slice(0, 200)}` : '',
    params.chapter.author_comment?.trim() ? `Пожелание к сцене главы #${params.chapter.chapter_number}: ${params.chapter.author_comment.trim().slice(0, 200)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = [basePrompt, visualRefsPromptBlock, authorHints].filter(Boolean).join('\n\n');

  await assertCanAfford(params.userUid, estimateImageGenerationLetters(prompt.length));

  if (params.onProgress) params.onProgress('Создание иллюстрации главы в типографском стиле...');
  const res = await generateProTalkImage({
    prompt,
    aspectRatio: params.aspectRatio || '3:4',
    referenceImageUrl: effectiveRefUrl || undefined,
    userUid: params.userUid,
  });

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: 0,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    isImage: true,
    exactTokens: res.tokensTotal,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    operationType: 'image_generation',
    bookId: params.book.id,
    bookTitle: params.book.title,
    chapterNumber: params.chapter.chapter_number,
    description: `Иллюстрация к главе #${params.chapter.chapter_number} книги «${params.book.title}»`,
    alertLink: 'chapters',
  });

  try {
    const folder = await getOrCreateBookFolder(params.book.id, params.book.title, params.userUid);
    const record = await registerFileInDb({
      name: `Иллюстрация к главе #${params.chapter.chapter_number} — «${params.chapter.title || params.book.title}»`,
      original_url: res.url,
      mime_type: 'image/jpeg',
      folder_id: folder.id,
      user_uid: params.userUid,
    });
    if (record?.original_url && isUsablePublicUrl(record.original_url)) {
      res.url = record.original_url;
    }
    await saveGalleryItem(
      {
        book_id: params.book.id,
        image_url: res.url,
        prompt: params.sceneDescription,
        aspect_ratio: params.aspectRatio || '3:4',
      },
      params.userUid
    );
  } catch (e) {
    console.warn('Auto register illustration error:', e);
  }

  return res;
}

export async function orchestrateCoverImage(params: {
  book: Book;
  scenePrompt?: string;
  referenceUrl?: string;
  isBackCover?: boolean;
  isFullWrap?: boolean;
  aspectRatio?: '3:4' | '16:9';
  worldEntities?: WorldEntity[];
  characters?: Character[];
  onProgress?: (msg: string) => void;
  userUid?: number;
}): Promise<ImageGenerationResult> {
  const promptKey = params.isBackCover ? 'back_cover_art' : 'cover_art';
  const cfg = await getPromptConfig(promptKey);
  const chosenAspect: '3:4' | '16:9' =
    params.aspectRatio || (params.isFullWrap ? '16:9' : '3:4');

  const frontCoverRaw = params.book.cover_config?.frontImageUrl;
  const { entitiesSummary, firstVisualRefUrl, visualRefsPromptBlock } =
    await buildEntitiesSummaryAsync({
      worldEntities: params.worldEntities,
      characters: params.characters,
      extraUrls: [params.referenceUrl, frontCoverRaw],
    });

  const explicitRef = params.referenceUrl ? await resolvePublicReferenceUrl(params.referenceUrl) : '';
  const frontCoverPublic = frontCoverRaw ? await resolvePublicReferenceUrl(frontCoverRaw) : '';
  const effectiveRefUrl =
    params.referenceUrl !== undefined ? explicitRef : firstVisualRefUrl || frontCoverPublic;

  const baseScene =
    params.scenePrompt && params.scenePrompt.trim()
      ? params.scenePrompt.trim()
      : renderPrompt(cfg.template, {
          title: params.book.title,
          genres: (params.book.genres || []).join(', '),
          scene: params.book.synopsis_overview?.slice(0, 260) || 'atmospheric noir centerpiece',
          synopsis_overview: params.book.synopsis_overview?.slice(0, 260) || 'dramatic noir atmosphere',
          entities_summary: entitiesSummary,
        });

  const wrapAddition = params.isFullWrap
    ? '\nWide continuous horizontal panoramic book jacket wrap illustration (back cover on left, narrow spine center strip, dramatic main hero composition on right front cover), seamless background without text.'
    : '';
  const loreAddition = !baseScene.includes('Image URL:') && visualRefsPromptBlock
    ? `\n\nBook Setting & Lore: ${entitiesSummary}\n${visualRefsPromptBlock}`
    : '';
  const frontLinkAddition =
    params.isBackCover && frontCoverPublic && !baseScene.includes(frontCoverPublic)
      ? `\nFront Cover Reference URL (match style and tone): ${frontCoverPublic}`
      : '';
  const scene = `${baseScene}${wrapAddition}${loreAddition}${frontLinkAddition}`;

  await assertCanAfford(params.userUid, estimateImageGenerationLetters(scene.length));

  if (params.onProgress) {
    params.onProgress(
      params.isFullWrap
        ? 'Генерация горизонтального разворота переплета (16:9)...'
        : params.isBackCover
        ? 'Генерация задней стороны переплета (А5)...'
        : 'Генерация художественной вертикальной обложки (А5)...'
    );
  }

  const res = await generateProTalkImage({
    prompt: scene,
    aspectRatio: chosenAspect,
    referenceImageUrl: effectiveRefUrl || undefined,
    userUid: params.userUid,
  });

  await recordAiUsage({
    userUid: params.userUid,
    promptKey: cfg.key,
    inputChars: scene.length,
    outputChars: 0,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    isImage: true,
    exactTokens: res.tokensTotal,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    operationType: 'image_generation',
    bookId: params.book.id,
    bookTitle: params.book.title,
    description: params.isFullWrap
      ? `Горизонтальный разворот переплета «${params.book.title}»`
      : params.isBackCover
      ? `Задняя обложка книги «${params.book.title}»`
      : `Лицевая обложка книги «${params.book.title}»`,
    alertLink: 'cover',
  });

  try {
    const folder = await getOrCreateBookFolder(params.book.id, params.book.title, params.userUid);
    const record = await registerFileInDb({
      name: `${
        params.isFullWrap ? 'Разворот переплета' : params.isBackCover ? 'Задняя обложка' : 'Обложка книги'
      }: «${params.book.title}»`,
      original_url: res.url,
      mime_type: 'image/jpeg',
      folder_id: folder.id,
      user_uid: params.userUid,
    });
    if (record?.original_url && isUsablePublicUrl(record.original_url)) {
      res.url = record.original_url;
    }
    await saveGalleryItem(
      {
        book_id: params.book.id,
        image_url: res.url,
        prompt: scene,
        aspect_ratio: '3:4',
      },
      params.userUid
    );
  } catch (e) {
    console.warn('Auto register cover art error:', e);
  }

  return res;
}
