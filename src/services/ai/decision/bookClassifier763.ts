/**
 * High-precision Book / Drafts / Visual QA Classifier powered by ProTalk Function 763
 * - Picks up to 5 Genres (from 100+ catalog + custom user genres)
 * - Picks Literary & Visual Style (BookStyleConfig)
 * - Picks up to 3 Fundamental Booker Plots (from 7 Basic Plots)
 * - Evaluates Chapter quality (score) & Art QA (images_urls up to 4)
 */
import { BookStyleConfig, GenreWeight } from '../../../types';
import { AVAILABLE_GENRES, GENRE_CATEGORIES, GenreItem } from '../../genres/GenrePresets';
import { getAllCombinedGenres } from '../../genres/genresService';
import { getAllStyles } from '../../genres/styleService';
import { getDefaultStyle, StylePresetItem } from '../../genres/StylePresets';
import { BASIC_PLOTS } from '../../../constants/basicPlots';
import { callProTalkDecision } from './protalkDecision';

export interface BookClassification763Result {
  genres: string[];
  genreWeights: GenreWeight[];
  styleConfig: BookStyleConfig;
  basicPlots: string[];
  totalLettersSpent: number;
}

const DEFAULT_FIVE_WEIGHTS = [40, 25, 15, 10, 10];
function buildNormalizedWeights(names: string[]): GenreWeight[] {
  if (names.length === 0) return [{ genre: 'Темное фэнтези', weight: 100 }];
  if (names.length === 1) return [{ genre: names[0], weight: 100 }];
  const rawSlice = DEFAULT_FIVE_WEIGHTS.slice(0, names.length);
  const sum = rawSlice.reduce((a, b) => a + b, 0);
  return names.map((genre, i) => ({
    genre,
    weight: Math.max(5, Math.round((rawSlice[i] / sum) * 100)),
  }));
}

/**
 * Classifies a book/drafts excerpt into:
 * - up to 5 Genres
 * - 1 Literary & Visual Style
 * - up to 3 Booker Fundamental Plots
 */
export async function classifyBookOrDraftWith763(params: {
  text: string;
  title?: string;
  userUid?: number;
  bookId?: number;
  onProgress?: (msg: string) => void;
}): Promise<BookClassification763Result> {
  const cleanText = (params.text || '').trim();
  const sampleText =
    cleanText.length > 28000
      ? cleanText.slice(0, 18000) + '\n...\n' + cleanText.slice(-9500)
      : cleanText || `Название книги: ${params.title || 'Новая книга'}`;

  let totalLettersSpent = 0;

  const [allGenres, allStyles] = await Promise.all([
    getAllCombinedGenres(params.userUid).catch(() => AVAILABLE_GENRES),
    getAllStyles(params.userUid).catch(() => []),
  ]);

  // 1. Literary & Visual Style classification
  params.onProgress?.('Классификация 763: подбор литературного и визуального стиля...');
  let chosenStyle: BookStyleConfig = getDefaultStyle();
  if (allStyles.length > 0) {
    const styleOptions = allStyles
      .slice(0, 12)
      .map((s) => `${s.id}::${s.styleName} — ${s.tagline || s.proseVoice.slice(0, 90)}`)
      .join(';;');

    try {
      const styleRes = await callProTalkDecision({
        text: sampleText,
        instruction:
          'Определи наиболее подходящий литературный и визуальный стиль для этого произведения/черновика.',
        options: styleOptions,
        decisionType: 'choice',
        userUid: params.userUid,
        bookId: params.bookId,
        bookTitle: params.title,
        promptKey: 'decision_book_classifier',
        operationDescription: `Классификация 763: выбор стиля книги «${params.title || 'Черновик'}»`,
        alertLink: 'constructor',
      });
      totalLettersSpent += styleRes.costLetters;
      const found: StylePresetItem | undefined =
        allStyles.find((s) => s.id === styleRes.decision) ||
        allStyles.find((s) => s.styleName.toLowerCase() === styleRes.decision.toLowerCase());
      if (found) {
        chosenStyle = {
          styleName: found.styleName,
          proseVoice: found.proseVoice,
          pacing: found.pacing,
          vocabulary: found.vocabulary,
          visualAesthetic: found.visualAesthetic,
          customGuidelines: found.customGuidelines,
        };
      }
    } catch {
      // Fallback safely to default style
    }
  }

  // 2. KnigAI 7 Fundamental Plots (up to 3 matching archetypes)
  params.onProgress?.('Классификация 763: подбор до 3 фундаментальных сюжетов KnigAI...');
  const chosenPlots: string[] = [];
  for (let slot = 0; slot < 3; slot++) {
    const remainingPlots = BASIC_PLOTS.filter((p) => !chosenPlots.includes(p.id));
    if (remainingPlots.length === 0) break;

    const plotOptsList = remainingPlots.map(
      (p) => `${p.id}::${p.title} (${p.tagline})`
    );
    if (slot > 0) {
      plotOptsList.push('none::Дополнительный фундаментальный сюжет не требуется');
    }

    try {
      const plotRes = await callProTalkDecision({
        text: sampleText,
        instruction:
          slot === 0
            ? 'Выбери главный фундаментальный сюжет KnigAI из 7 архетипов, лежащий в основе текста.'
            : `Уже выбраны сюжеты: ${chosenPlots.join(', ')}. Выбери дополнительный сюжет KnigAI (до 3), если он явно присутствует, либо выбери none.`,
        options: plotOptsList.join(';;'),
        decisionType: 'choice',
        userUid: params.userUid,
        bookId: params.bookId,
        bookTitle: params.title,
        promptKey: 'decision_book_classifier',
        operationDescription: `Классификация 763: сюжет KnigAI #${slot + 1}`,
        alertLink: 'constructor',
      });
      totalLettersSpent += plotRes.costLetters;
      if (plotRes.decision === 'none' || !plotRes.decision) break;
      if (BASIC_PLOTS.some((p) => p.id === plotRes.decision) && !chosenPlots.includes(plotRes.decision)) {
        chosenPlots.push(plotRes.decision);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  if (chosenPlots.length === 0) {
    chosenPlots.push('overcoming-the-monster');
  }

  // 3. Genres classification (up to 5 genres via category -> genre picks)
  params.onProgress?.('Классификация 763: подбор до 5 литературных жанров...');
  const categories = GENRE_CATEGORIES.filter((c) => c !== 'Все категории');
  const pickedGenreNames: string[] = [];
  const usedCategories = new Set<string>();

  for (let gStep = 0; gStep < 5; gStep++) {
    try {
      // Pick best remaining category first
      const availCats = categories.filter((c) => !usedCategories.has(c));
      if (availCats.length === 0) break;

      const catOpts = availCats.map((c) => `${c}::Категория «${c}»`);
      if (gStep > 0) {
        catOpts.push('none::Жанров уже достаточно для точного описания книги');
      }

      const catRes = await callProTalkDecision({
        text: sampleText,
        instruction:
          gStep === 0
            ? 'Определи главную жанровую категорию этого произведения.'
            : `Уже выбраны жанры: ${pickedGenreNames.join(', ')}. Есть ли ещё яркая смежная категория жанров для смешения (до 5 жанров)? Если нет — выбери none.`,
        options: catOpts.join(';;'),
        decisionType: 'choice',
        userUid: params.userUid,
        bookId: params.bookId,
        bookTitle: params.title,
        promptKey: 'decision_book_classifier',
        operationDescription: `Классификация 763: жанр #${gStep + 1}`,
        alertLink: 'constructor',
      });
      totalLettersSpent += catRes.costLetters;

      if (catRes.decision === 'none' || !catRes.decision) break;
      const matchedCat = availCats.find((c) => c.toLowerCase() === catRes.decision.toLowerCase()) || availCats[0];
      usedCategories.add(matchedCat);

      const genresInCat: GenreItem[] = allGenres.filter(
        (g) => g.category === matchedCat && !pickedGenreNames.includes(g.name)
      );
      if (genresInCat.length === 0) continue;

      const genreOpts = genresInCat
        .slice(0, 15)
        .map((g) => `${g.name}::${g.name} — ${g.description.slice(0, 80)}`)
        .join(';;');

      const gRes = await callProTalkDecision({
        text: sampleText,
        instruction: `Выбери самый точный жанр из категории «${matchedCat}» для этого произведения.`,
        options: genreOpts,
        decisionType: 'choice',
        userUid: params.userUid,
        bookId: params.bookId,
        bookTitle: params.title,
        promptKey: 'decision_book_classifier',
        operationDescription: `Классификация 763: подбор жанра в «${matchedCat}»`,
        alertLink: 'constructor',
      });
      totalLettersSpent += gRes.costLetters;

      const matchedGenre =
        genresInCat.find((g) => g.name.toLowerCase() === gRes.decision.toLowerCase()) || genresInCat[0];
      if (matchedGenre && !pickedGenreNames.includes(matchedGenre.name)) {
        pickedGenreNames.push(matchedGenre.name);
      }
    } catch {
      break;
    }
  }

  const finalGenres =
    pickedGenreNames.length > 0 ? pickedGenreNames.slice(0, 5) : ['Темное фэнтези'];

  return {
    genres: finalGenres,
    genreWeights: buildNormalizedWeights(finalGenres),
    styleConfig: chosenStyle,
    basicPlots: chosenPlots.slice(0, 3),
    totalLettersSpent,
  };
}

/**
 * Evaluates a generated illustration or cover using multimodal Decisions API 763 (images_urls up to 4).
 */
export async function evaluateArtWith763(params: {
  imageUrls: string[];
  subjectDescription: string;
  styleName?: string;
  userUid?: number;
  bookId?: number;
  bookTitle?: string;
}): Promise<{
  score: number;
  passedQa: boolean;
  verdictLabel: string;
  costLetters: number;
}> {
  const validUrls = params.imageUrls.filter(Boolean).slice(0, 4);
  if (validUrls.length === 0) {
    return { score: 0, passedQa: false, verdictLabel: 'Нет изображения', costLetters: 0 };
  }

  const res = await callProTalkDecision({
    text: `Описание объекта/обложки: ${params.subjectDescription}. Целевой стиль: ${params.styleName || 'книжный нуар, монохром и багровые акценты, без текста и артефактов'}.`,
    instruction:
      'Оцени по шкале от 1 до 5 качество композиции, соответствие описанию, нуарную атмосферу и отсутствие искажений/мусорного текста на изображении.',
    options: '1::Брак или сильные искажения;;2::Слабое совпадение;;3::Приемлемо;;4::Хороший нуар-арт;;5::Идеальное соответствие и стиль',
    decisionType: 'score',
    imagesUrls: validUrls,
    userUid: params.userUid,
    bookId: params.bookId,
    bookTitle: params.bookTitle,
    promptKey: 'decision_image_qa',
    operationDescription: 'Визуальная ИИ-проверка арта (763 · PPLX)',
    alertLink: 'gallery',
  });

  const score = Math.max(1, Math.min(5, res.scoreNumber || 3));
  const labels: Record<number, string> = {
    1: 'Требует перегенерации (1/5)',
    2: 'Ниже стандарта (2/5)',
    3: 'Удовлетворительно (3/5)',
    4: 'Отличное качество (4/5)',
    5: 'Эталонный арт (5/5)',
  };

  return {
    score,
    passedQa: score >= 3,
    verdictLabel: labels[score] || `${score}/5`,
    costLetters: res.costLetters,
  };
}

/**
 * Chooses the strongest image out of up to 4 candidates using 763 multimodal choice.
 */
export async function pickBestImageAmong4With763(params: {
  candidates: Array<{ id: string | number; label: string; url: string }>;
  contextDescription: string;
  userUid?: number;
  bookId?: number;
  bookTitle?: string;
}): Promise<{ bestId: string; costLetters: number }> {
  const top4 = params.candidates.filter((c) => Boolean(c.url)).slice(0, 4);
  if (top4.length === 0) throw new Error('Выберите от 1 до 4 изображений.');
  if (top4.length === 1) return { bestId: String(top4[0].id), costLetters: 0 };

  const options = top4
    .map((c, idx) => `img_${idx + 1}::Изображение #${idx + 1} (${c.label})`)
    .join(';;');

  const res = await callProTalkDecision({
    text: `Контекст книги/сцены: ${params.contextDescription}\nПорядок переданных изображений:\n${top4
      .map((c, i) => `img_${i + 1}: ${c.label}`)
      .join('\n')}`,
    instruction: 'Сравни прикрепленные изображения (по порядку 1..4) и выбери одно лучшее для указанного контекста книги.',
    options,
    decisionType: 'choice',
    imagesUrls: top4.map((c) => c.url),
    userUid: params.userUid,
    bookId: params.bookId,
    bookTitle: params.bookTitle,
    promptKey: 'decision_image_qa',
    operationDescription: `Выбор лучшего из ${top4.length} артов (763 · PPLX)`,
    alertLink: 'gallery',
  });

  const idxMatch = res.decision.match(/img_(\d+)/i);
  const chosenIdx = idxMatch ? Math.max(0, Math.min(top4.length - 1, Number(idxMatch[1]) - 1)) : 0;
  return {
    bestId: String(top4[chosenIdx].id),
    costLetters: res.costLetters,
  };
}
