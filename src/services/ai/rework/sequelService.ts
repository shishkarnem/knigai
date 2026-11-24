import {
  Book,
  BookRelationType,
  Chapter,
  Character,
  WorldEntity,
} from '../../../types';
import { getPromptConfig, renderPrompt } from '../../db/promptRepository';
import { generateProTalkTextWithUsage } from '../protalkText';
import { isUsablePublicUrl, resolvePublicUrlMap } from '../protalkImage';
import { checkSufficientBalance, recordAiUsage } from '../../billing/transactionService';
import { calculateAiUsageCost, formatLettersCount } from '../../billing/costCalculator';
import { parseJsonFlexible } from '../chapterBatchEngine';
import {
  generateSlug,
  saveChapter,
  saveCharacter,
  saveNewBook,
  saveWorldEntity,
} from '../../db/bookRepository';
import { getOrCreateBookFolder } from '../../db/fileStorageRepository';
import { createNotification } from '../../billing/notificationService';
import { loadBookAuthorAiContext } from '../context/authorContextBuilder';

interface SequelPlanResponse {
  title?: string;
  subtitle?: string;
  synopsis_overview?: string;
  setting?: string;
  tone?: string;
  back_blurb?: string;
  chapters?: Array<{
    chapter_number?: number;
    title?: string;
    synopsis?: string;
  }>;
  new_characters?: Array<{
    name: string;
    role: string;
    description: string;
    visual_prompt?: string;
  }>;
}

export async function orchestrateCreateSequel(params: {
  sourceBook: Book;
  sourceChapters: Chapter[];
  sourceCharacters: Character[];
  sourceEntities: WorldEntity[];
  relationType: Exclude<BookRelationType, 'standalone'>;
  customTitle?: string;
  authorName?: string;
  targetChapters?: number;
  initialPlannedChapters?: number;
  timeJump?: string;
  sequelWishes: string;
  selectedCharacterIds?: number[];
  selectedEntityIds?: number[];
  userUid?: number;
  onProgress?: (msg: string) => void;
}): Promise<{ book: Book; chapters: Chapter[]; characters: Character[] }> {
  const {
    sourceBook,
    sourceChapters,
    sourceCharacters,
    sourceEntities,
    relationType,
    customTitle,
    authorName,
    targetChapters = Math.max(10, Math.min(sourceBook.target_chapters || 30, 60)),
    initialPlannedChapters = 10,
    timeJump,
    sequelWishes,
    selectedCharacterIds,
    selectedEntityIds,
    userUid,
    onProgress,
  } = params;

  const cfg = await getPromptConfig('sequel_canon_planner');

  onProgress?.('Собираем канон первоисточника, финал глав и медиа-ссылки героев...');

  // Resolve public image URLs for characters and world entities
  const urlMap = await resolvePublicUrlMap([
    ...sourceCharacters.map((c) => c.visual_card_url),
    ...sourceEntities.map((e) => e.image_url),
  ]);
  const toPublic = (raw?: string) => {
    const s = (raw || '').trim();
    return urlMap.get(s) || (isUsablePublicUrl(s) ? s : '');
  };

  const keptChars = selectedCharacterIds
    ? sourceCharacters.filter((c) => selectedCharacterIds.includes(c.id))
    : sourceCharacters;
  const keptEntities = selectedEntityIds
    ? sourceEntities.filter((e) => selectedEntityIds.includes(e.id))
    : sourceEntities;

  const sortedChaps = [...sourceChapters].sort((a, b) => a.chapter_number - b.chapter_number);
  const tailChaps = sortedChaps.slice(-4);
  const firstChaps = sortedChaps.slice(0, 2);
  const canonDigestChaps = Array.from(new Map([...firstChaps, ...tailChaps].map((c) => [c.chapter_number, c])).values());

  const canonSummaryText = canonDigestChaps
    .map((c) => {
      const sum = c.continuity_summary || c.synopsis || c.content?.slice(0, 220) || '';
      return `Глава #${c.chapter_number} «${c.title}»: ${sum.slice(0, 240)}`;
    })
    .join('\n');

  const charsDigest = keptChars
    .slice(0, 12)
    .map((c) => {
      const url = toPublic(c.visual_card_url);
      return `- ${c.name} (${c.role}): ${c.description.slice(0, 140)}${url ? ` [ref: ${url}]` : ''}`;
    })
    .join('\n');

  const entitiesDigest = keptEntities
    .slice(0, 12)
    .map((e) => {
      const url = toPublic(e.image_url);
      return `- [${e.entity_type}] ${e.name}: ${e.description.slice(0, 120)}${url ? ` [ref: ${url}]` : ''}`;
    })
    .join('\n');

  const relationRu: Record<Exclude<BookRelationType, 'standalone'>, string> = {
    sequel: 'Прямой сиквел (продолжение событий после финала)',
    prequel: 'Приквел (предыстория за годы до событий первоисточника)',
    spinoff: 'Спин-офф (ответвление о побочном герое или другом регионе мира)',
    reboot: 'Альтернативная ветка / Переосмысление канона',
  };

  const sourceCtx = await loadBookAuthorAiContext({
    book: sourceBook,
    userUid,
    maxDraftChars: 1800,
  });

  const planCount = Math.min(Math.max(initialPlannedChapters, 3), targetChapters, 15);
  const prompt = `${renderPrompt(
    cfg.template,
    {
      source_title: sourceBook.title,
      relation_type: relationRu[relationType],
      sequel_wishes: sequelWishes.trim() || 'Развить ключевые тайны мира и судьбы выживших героев.',
    },
    cfg.system_instruction
  )}

ПЕРВОИСТОЧНИК:
Название: «${sourceBook.title}» | Автор: ${sourceBook.author}
Серия: ${sourceBook.series_name || sourceBook.title}
Жанры: ${(sourceBook.genres || []).join(', ')} | Тон: ${sourceBook.tone || 'нуар'}
Сеттинг мира: ${(sourceBook.setting || '').slice(0, 400)}
Описание первоисточника: ${(sourceBook.synopsis_overview || '').slice(0, 750)}
${sourceCtx.combinedPromptBlock ? `\n${sourceCtx.combinedPromptBlock}\n` : ''}
КАНОН КЛЮЧЕВЫХ И ФИНАЛЬНЫХ ГЛАВ:
${canonSummaryText || 'Используй общее описание первоисточника.'}

ПЕРЕНОСИМЫЕ ПЕРСОНАЖИ:
${charsDigest || 'Ключевые герои вселенной'}

ПЕРЕНОСИМЫЕ ЛОКАЦИИ / АРТЕФАКТЫ / ЗАКОНЫ:
${entitiesDigest || 'Базовый мир первоисточника'}

ПАРАМЕТРЫ НОВОЙ КНИГИ:
- Тип связи: ${relationRu[relationType]}
${customTitle ? `- Желаемое название: «${customTitle}»` : '- Придумай сильное название без штампов'}
${timeJump ? `- Временной сдвиг: ${timeJump}` : ''}
- Пожелания автора: ${sequelWishes}
- Запланируй первые ${planCount} стартовых глав из целевых ${targetChapters}.

Верни СТРОГО валидный JSON без пояснений:
{
  "title": "Название новой книги",
  "subtitle": "Ёмкий подзаголовок",
  "synopsis_overview": "Развёрнутая аннотация новой книги (2-3 абзаца), опирающаяся на канон первоисточника",
  "setting": "Обновлённый сеттинг новой части",
  "tone": "Тон повествования",
  "back_blurb": "Продающая аннотация для обложки А5 (3-4 предложения)",
  "new_characters": [
    {
      "name": "Имя нового героя/антагониста",
      "role": "антагонист",
      "description": "Краткое описание и мотивация",
      "visual_prompt": "Портретный визуальный промпт в стиле чёрно-белого нуара с красным акцентом"
    }
  ],
  "chapters": [
    {
      "chapter_number": 1,
      "title": "Название главы без слова Глава",
      "synopsis": "Детальный синопсис 3-4 предложения"
    }
  ]
}`;

  const est = calculateAiUsageCost({
    inputChars: prompt.length,
    outputChars: 3500,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });

  if (userUid) {
    const check = await checkSufficientBalance(userUid, est.totalLetters);
    if (!check.ok) {
      throw new Error(
        `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(est.totalLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
      );
    }
  }

  onProgress?.(`Нейросеть проектирует ${relationRu[relationType]} и связывает сюжетный канон...`);
  const chatId = `knigai_sequel_${sourceBook.id}_${Date.now()}`;
  const aiRes = await generateProTalkTextWithUsage(prompt, onProgress, 200, userUid, chatId);

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
    bookId: sourceBook.id,
    bookTitle: sourceBook.title,
    description: `Создание ${relationType} на основе «${sourceBook.title}»`,
    alertLink: 'constructor',
  });

  const parsed = parseJsonFlexible<SequelPlanResponse>(aiRes.text) || {};
  const finalTitle = customTitle?.trim() || parsed.title?.trim() || `${sourceBook.title}: Часть II`;
  const finalAuthor = authorName?.trim() || sourceBook.author || 'Автор KnigAI';
  const seriesName = sourceBook.series_name || sourceBook.title;
  const seriesOrder =
    relationType === 'prequel'
      ? 0
      : (sourceBook.series_order || 1) + 1;

  onProgress?.('Сохраняем новую книгу серии и переносим персонажей/лор в базу...');

  const createdBook = await saveNewBook(
    {
      user_uid: userUid,
      title: finalTitle,
      slug: `${generateSlug(finalTitle)}-${Date.now().toString(36)}`,
      subtitle: parsed.subtitle?.trim() || `${seriesName} · Том ${seriesOrder}`,
      author: finalAuthor,
      genres: sourceBook.genres?.length ? sourceBook.genres : ['Художественная литература'],
      genre_weights: sourceBook.genre_weights,
      basic_plots: sourceBook.basic_plots || ['overcoming-the-monster'],
      style_config: sourceBook.style_config,
      target_chapters: targetChapters,
      status: 'draft',
      is_published: false,
      synopsis_overview:
        parsed.synopsis_overview?.trim() ||
        `Продолжение книги «${sourceBook.title}». ${sequelWishes}`,
      setting: parsed.setting?.trim() || sourceBook.setting,
      tone: parsed.tone?.trim() || sourceBook.tone,
      audience: sourceBook.audience,
      running_header: finalTitle,
      parent_book_id: sourceBook.id,
      relation_type: relationType,
      series_name: seriesName,
      series_order: seriesOrder,
      author_instructions: sequelWishes.trim() || sourceBook.author_instructions || '',
      book_meta: {
        year: String(new Date().getFullYear()),
        language: sourceBook.book_meta?.language || 'русский',
        pageCountEstimate: targetChapters * 10,
      },
      cover_config: {
        ...(sourceBook.cover_config || {}),
        frontTitle: finalTitle,
        frontSubtitle: `${seriesName} · ${seriesOrder === 0 ? 'Предыстория' : `Книга ${seriesOrder}`}`,
        authorName: finalAuthor,
        spineText: `${finalTitle} — ${finalAuthor}`,
        backBlurb:
          parsed.back_blurb?.trim() ||
          parsed.synopsis_overview?.slice(0, 360) ||
          sourceBook.cover_config?.backBlurb ||
          '',
        genreLabel: sourceBook.cover_config?.genreLabel || (sourceBook.genres || []).join(' / '),
        frontImageUrl: sourceBook.cover_config?.frontImageUrl || '',
        spineColor: sourceBook.cover_config?.spineColor || '#18181b',
        paperType: sourceBook.cover_config?.paperType || 'cream',
        pageCountEstimate: targetChapters * 10,
        isbn: '978-5-00-198274-1',
        barcodeText: 'Издание формата А5',
      },
    },
    userUid
  );

  // Clone carried world entities & characters
  for (const ent of keptEntities) {
    await saveWorldEntity(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        entity_type: ent.entity_type,
        name: ent.name,
        subtitle_or_role: ent.subtitle_or_role,
        description: ent.description,
        attributes: ent.attributes,
        visual_prompt: ent.visual_prompt,
        image_url: ent.image_url,
      },
      undefined,
      userUid
    );
  }

  const createdCharacters: Character[] = [];
  for (const ch of keptChars) {
    const saved = await saveCharacter(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        name: ch.name,
        role: ch.role,
        description: ch.description,
        visual_card_url: ch.visual_card_url,
        visual_prompt: ch.visual_prompt,
        traits: ch.traits,
      },
      undefined,
      userUid
    );
    createdCharacters.push(saved);
  }

  // Save newly proposed characters from sequel outline
  const allowedRoles: Character['role'][] = [
    'главный герой',
    'антагонист',
    'наставник',
    'спутник',
    'второстепенный',
    'таинственный союзник',
  ];
  for (const nc of parsed.new_characters || []) {
    if (!nc.name?.trim()) continue;
    const matchedRole = allowedRoles.find((r) => nc.role?.toLowerCase().includes(r)) || 'второстепенный';
    const savedChar = await saveCharacter(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        name: nc.name.trim(),
        role: matchedRole,
        description: nc.description || 'Новый участник истории.',
        visual_card_url: '',
        visual_prompt: nc.visual_prompt || `${nc.name}, чёрно-белый нуар портрет`,
        traits: [],
      },
      undefined,
      userUid
    );
    createdCharacters.push(savedChar);
  }

  // Save planned chapters
  const createdChapters: Chapter[] = [];
  const rawChapters = Array.isArray(parsed.chapters) && parsed.chapters.length > 0
    ? parsed.chapters
    : Array.from({ length: Math.min(planCount, 5) }, (_, idx) => ({
        chapter_number: idx + 1,
        title: `Новое начало ${idx + 1}`,
        synopsis: `Стартовые события продолжения «${finalTitle}».`,
      }));

  for (let i = 0; i < rawChapters.length; i++) {
    const ch = rawChapters[i];
    const chapNum = Number(ch.chapter_number) || i + 1;
    const savedCh = await saveChapter(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        chapter_number: chapNum,
        title: (ch.title || `Глава ${chapNum}`).trim(),
        synopsis: (ch.synopsis || '').trim(),
        content: '',
        illustration_url: '',
        illustration_prompt: '',
        status: 'planned',
      },
      undefined,
      userUid
    );
    createdChapters.push(savedCh);
  }

  try {
    await getOrCreateBookFolder(createdBook.id, createdBook.title, userUid);
    if (userUid) {
      await createNotification({
        userUid,
        type: 'generation',
        title: `Создано продолжение «${createdBook.title}»`,
        message: `Связано с книгой «${sourceBook.title}». Перенесено персонажей: ${createdCharacters.length}, запланировано глав: ${createdChapters.length}.`,
        link: 'chapters',
      });
    }
  } catch {
    // non-fatal post setup
  }

  return {
    book: createdBook,
    chapters: createdChapters,
    characters: createdCharacters,
  };
}
