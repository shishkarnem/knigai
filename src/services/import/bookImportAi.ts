import { BookStyleConfig, DraftFragment, GenreWeight, ParsedChapter } from '../../types';
import { getPromptConfig, renderPrompt } from '../db/promptRepository';
import { generateProTalkTextWithUsage } from '../ai/protalkText';
import { recordAiUsage, checkSufficientBalance } from '../billing/transactionService';
import { calculateAiUsageCost, formatLettersCount } from '../billing/costCalculator';
import { classifyBookOrDraftWith763 } from '../ai/decision/bookClassifier763';
import {
  isGenerationAbortedError,
  recordSessionAppliedItem,
} from '../ai/session/generationSession';

export interface BookAiAnalysisResult {
  title: string;
  synopsis_overview: string;
  genres: string[];
  genre_weights?: GenreWeight[];
  style_config?: BookStyleConfig;
  basic_plots: string[];
  characters: Array<{
    name: string;
    role: string;
    description: string;
  }>;
  world_entities: Array<{
    name: string;
    entity_type: 'location' | 'item' | 'faction' | 'law';
    description: string;
  }>;
  chaptersWithSynopses: ParsedChapter[];
  billedLetters?: number;
  author_instructions?: string;
  drafts?: DraftFragment[];
}

/**
 * Analyzes imported book or drafts with AI using prompt from PostgreSQL ai_prompts:
 * - extracts characters, world entities & chapter synopses
 * - runs ProTalk 763 classification to select up to 5 Genres + weights, Literary/Visual Style, and up to 3 Booker Plots
 */
export async function analyzeAndEnrichBookWithAi(
  initialTitle: string,
  chapters: ParsedChapter[],
  options?: {
    userUid?: number;
    bookId?: number;
    authorInstructions?: string;
    onProgress?: (msg: string) => void;
  }
): Promise<BookAiAnalysisResult> {
  const cfg = await getPromptConfig('book_entity_extraction');

  const chapterBriefs = chapters.slice(0, 40).map((c) => {
    const cleanContent = c.content.trim();
    const excerptStart = cleanContent.slice(0, 900);
    const excerptEnd = cleanContent.length > 1400 ? cleanContent.slice(-350) : '';
    return {
      chapterNumber: c.chapterNumber,
      title: c.title,
      sample: excerptEnd ? `${excerptStart} ... ${excerptEnd}` : excerptStart,
    };
  });

  const basePrompt = renderPrompt(
    cfg.template,
    {
      title: initialTitle || 'Новая книга',
      chapters_count: chapters.length,
      chapter_briefs: JSON.stringify(chapterBriefs, null, 2),
    },
    cfg.system_instruction
  );
  const instructionsNote = options?.authorInstructions?.trim()
    ? `\n\n[ПОЖЕЛАНИЯ И УКАЗАНИЯ АВТОРА К КНИГЕ / СТИЛЮ / ФАНФИКУ]:\n${options.authorInstructions.trim().slice(0, 1500)}`
    : '';
  const prompt = `${basePrompt}${instructionsNote}`;

  const est = calculateAiUsageCost({
    inputChars: prompt.length,
    outputChars: Math.max(1000, chapters.length * 280),
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });

  if (options?.userUid) {
    const check = await checkSufficientBalance(options.userUid, est.totalLetters);
    if (!check.ok) {
      throw new Error(
        `Недостаточно букв на балансе для ИИ-анализа книги. Требуется ≈ ${formatLettersCount(est.totalLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
      );
    }
  }

  let rawJson = '';
  try {
    options?.onProgress?.('Нейросеть анализирует сюжет, персонажей, локации и артефакты книги...');

    const aiRes = await generateProTalkTextWithUsage(prompt, options?.onProgress, 65, options?.userUid);
    rawJson = aiRes.text;

    const jsonBlock = rawJson.match(/\{[\s\S]*\}/)?.[0] || rawJson;
    const parsed = JSON.parse(jsonBlock);

    let billedLetters = 0;
    if (options?.userUid) {
      const billingRes = await recordAiUsage({
        userUid: options.userUid,
        promptKey: cfg.key,
        inputChars: prompt.length,
        outputChars: rawJson.length,
        inputMultiplier: cfg.input_cost_multiplier,
        outputMultiplier: cfg.output_cost_multiplier,
        exactTokens: aiRes.tokensTotal,
        tokensIn: aiRes.tokensIn,
        tokensOut: aiRes.tokensOut,
        operationType: 'book_import',
        bookId: options.bookId,
        bookTitle: parsed.title || initialTitle,
        description: `ИИ-разбор и извлечение лора книги «${parsed.title || initialTitle}»`,
        alertLink: 'library',
      });
      billedLetters = billingRes.costLetters;
    }

    const synopsesMap = new Map<number, string>();
    if (Array.isArray(parsed.chapter_synopses)) {
      parsed.chapter_synopses.forEach((item: { chapter_number?: number; synopsis?: string }) => {
        if (item.chapter_number && item.synopsis) {
          synopsesMap.set(Number(item.chapter_number), String(item.synopsis));
        }
      });
    }

    const chaptersWithSynopses: ParsedChapter[] = chapters.map((c) => ({
      ...c,
      synopsis: synopsesMap.get(c.chapterNumber) || generateLocalChapterSynopsis(c.content),
    }));

    const validEntities: BookAiAnalysisResult['world_entities'] = Array.isArray(parsed.world_entities)
      ? parsed.world_entities
          .filter((e: { name?: string }) => e && e.name)
          .map((e: { name: string; entity_type?: string; description?: string }) => {
            const rawType = String(e.entity_type || 'location').toLowerCase();
            const entity_type: 'location' | 'item' | 'faction' | 'law' =
              rawType.includes('item') || rawType.includes('артефакт')
                ? 'item'
                : rawType.includes('fact') || rawType.includes('фракц')
                ? 'faction'
                : rawType.includes('law') || rawType.includes('закон')
                ? 'law'
                : 'location';
            return {
              name: String(e.name).trim(),
              entity_type,
              description: String(e.description || '').trim(),
            };
          })
      : [];

    // Function 763 Classification: up to 5 Genres + Weights, Style, up to 3 Booker Plots
    let classifiedGenres: string[] = Array.isArray(parsed.genres) && parsed.genres.length > 0 ? parsed.genres : ['Темное фэнтези'];
    let classifiedWeights: GenreWeight[] | undefined;
    let classifiedStyle: BookStyleConfig | undefined;
    let classifiedPlots: string[] = Array.isArray(parsed.basic_plots) && parsed.basic_plots.length > 0 ? parsed.basic_plots : ['overcoming-the-monster'];

    const combinedFor763 = [
      `Название: ${parsed.title || initialTitle}`,
      parsed.synopsis_overview ? `Синопсис: ${parsed.synopsis_overview}` : '',
      ...chapters.slice(0, 5).map((c) => `Глава ${c.chapterNumber} (${c.title}): ${c.content.slice(0, 1800)}`),
    ]
      .filter(Boolean)
      .join('\n\n');

    if (combinedFor763.trim().length > 40) {
      try {
        const cls = await classifyBookOrDraftWith763({
          text: combinedFor763,
          title: parsed.title || initialTitle,
          userUid: options?.userUid,
          bookId: options?.bookId,
          onProgress: options?.onProgress,
        });
        classifiedGenres = cls.genres;
        classifiedWeights = cls.genreWeights;
        classifiedStyle = cls.styleConfig;
        classifiedPlots = cls.basicPlots;
        billedLetters += cls.totalLettersSpent;
      } catch (clsErr) {
        if (isGenerationAbortedError(clsErr)) throw clsErr;
        console.warn('763 classification fallback notice:', clsErr);
      }
    }

    recordSessionAppliedItem(
      `ИИ-анализ и классификация 763 «${parsed.title || initialTitle}»: ${classifiedGenres.length} жанр., ${classifiedPlots.length} сюжет., ${validEntities.length} сущн.`
    );

    return {
      title: parsed.title || initialTitle || 'Новая книга',
      synopsis_overview: parsed.synopsis_overview || `Книга из ${chapters.length} глав.`,
      genres: classifiedGenres,
      genre_weights: classifiedWeights,
      style_config: classifiedStyle,
      basic_plots: classifiedPlots,
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      world_entities: validEntities,
      chaptersWithSynopses,
      billedLetters,
      author_instructions: options?.authorInstructions?.trim() || undefined,
    };
  } catch (error) {
    if (isGenerationAbortedError(error)) {
      throw error;
    }
    console.warn('AI book analysis error, using local heuristic fallback:', error);
    const localRes = generateLocalRuleBasedAnalysis(initialTitle, chapters);
    return {
      ...localRes,
      author_instructions: options?.authorInstructions?.trim() || undefined,
    };
  }
}

function generateLocalRuleBasedAnalysis(
  initialTitle: string,
  chapters: ParsedChapter[]
): BookAiAnalysisResult {
  const chaptersWithSynopses: ParsedChapter[] = chapters.map((c) => ({
    ...c,
    synopsis: generateLocalChapterSynopsis(c.content),
  }));

  const detectedNames = new Set<string>();
  chapters.slice(0, 3).forEach((c) => {
    const words = c.content.split(/\s+/);
    for (const w of words) {
      if (/^[А-ЯЁ][а-яё]{2,15}$/.test(w) && !/^(Глава|После|Тогда|Когда|Они|Она|Оно|Этот|Тот|Если|Хотя)$/.test(w)) {
        detectedNames.add(w);
      }
    }
  });

  const characters = Array.from(detectedNames).slice(0, 4).map((name, i) => ({
    name,
    role: i === 0 ? 'Главный герой' : i === 1 ? 'Спутник' : 'Персонаж',
    description: `Действующее лицо книги «${initialTitle}».`,
  }));

  return {
    title: initialTitle || 'Новая книга',
    synopsis_overview: `Произведение из ${chapters.length} глав, объединяющее сюжетные линии и черновики автора.`,
    genres: ['Темное фэнтези'],
    basic_plots: ['overcoming-the-monster'],
    characters:
      characters.length > 0
        ? characters
        : [{ name: 'Герой', role: 'Главный герой', description: 'Центральный персонаж истории.' }],
    world_entities: [
      { name: 'Столица', entity_type: 'location', description: 'Основная локация событий книги.' },
    ],
    chaptersWithSynopses,
    billedLetters: 0,
  };
}

function generateLocalChapterSynopsis(content: string): string {
  const firstLines = content.slice(0, 600).trim();
  const sentences = firstLines.match(/[^.?!…]+[.?!…]+(?:\s+|$)/g);
  if (sentences && sentences.length > 0) {
    return sentences.slice(0, 2).join(' ').trim();
  }
  return firstLines.slice(0, 160) + '...';
}
