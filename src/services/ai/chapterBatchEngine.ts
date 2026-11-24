import { Book, Chapter, Character, FootnoteItem, WorldEntity } from '../../types';

export const A5_CHARS_PER_PAGE = 1320;
export const A5_WORDS_PER_PAGE = 200;
export const AVG_WORD_CHARS_RU = 6.6;
export const TARGET_CHAPTER_PAGES = 10;
export const TARGET_CHAPTER_CHARS = 13200;
export const MIN_ACCEPTABLE_CHAPTER_CHARS = 9500;

export interface ChapterVolumeTargets {
  targetPages: number;
  targetWords: number;
  targetChars: number;
  targetCharsMax: number;
  minAcceptableChars: number;
  recommendedScenes: number;
}

export function resolveChapterVolumeTargets(opts?: {
  targetPages?: number;
  targetWords?: number;
}): ChapterVolumeTargets {
  let targetWords = 2000;
  let targetPages = TARGET_CHAPTER_PAGES;

  if (typeof opts?.targetWords === 'number' && opts.targetWords > 0) {
    targetWords = Math.max(200, Math.min(8000, Math.round(opts.targetWords)));
    targetPages =
      typeof opts?.targetPages === 'number' && opts.targetPages > 0
        ? Math.max(1, Math.min(40, Math.round(opts.targetPages)))
        : Math.max(1, Math.round(targetWords / A5_WORDS_PER_PAGE));
  } else if (typeof opts?.targetPages === 'number' && opts.targetPages > 0) {
    targetPages = Math.max(1, Math.min(40, Math.round(opts.targetPages)));
    targetWords = Math.round(targetPages * A5_WORDS_PER_PAGE);
  }

  const targetChars = Math.max(1200, Math.round(targetWords * AVG_WORD_CHARS_RU));
  const targetCharsMax = Math.round(targetChars * 1.18);
  const minAcceptableChars = Math.round(targetChars * 0.72);
  const recommendedScenes = Math.max(2, Math.min(8, Math.round(targetPages / 2)));

  return {
    targetPages,
    targetWords,
    targetChars,
    targetCharsMax,
    minAcceptableChars,
    recommendedScenes,
  };
}

export const GPT6_LUNA_SPECS = {
  modelId: 'gpt-5.6-luna',
  maxOutputTokens: 128000,
  contextWindow: 1050000,
  charsPerTokenRu: 3.0,
  synopsisBatchOptions: [5, 10, 20, 30] as const,
  fullChapterBatchOptions: [1, 2, 3, 5, 10] as const,
  chapterPagePresets: [3, 5, 8, 10, 15, 20] as const,
  chapterWordPresets: [600, 1000, 1600, 2000, 3000, 4000] as const,
};

export interface ParsedSynopsisItem {
  chapter_number: number;
  title: string;
  synopsis: string;
  entity_ids?: number[];
}

export interface ParsedFullChapterResult {
  title: string;
  synopsis: string;
  content: string;
  footnotes: FootnoteItem[];
  rawFootnoteLines: string[];
  entity_ids: number[];
  continuity_summary: string;
}

export function estimateA5Pages(text?: string | null): number {
  const len = (text || '').trim().length;
  if (!len) return 0;
  return Math.max(1, Math.round(len / A5_CHARS_PER_PAGE));
}

export function stripMarkdownCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch && fencedMatch[1]) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function repairUnescapedJsonNewlines(input: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      out += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    if (inString && ch === '\n') {
      out += '\\n';
      continue;
    }
    if (inString && ch === '\r') {
      continue;
    }
    if (inString && ch === '\t') {
      out += ' ';
      continue;
    }
    out += ch;
  }
  return out;
}

export function parseJsonFlexible<T = unknown>(raw: string): T | null {
  const cleaned = stripMarkdownCodeFences(raw);
  const candidates: string[] = [cleaned];

  const objStart = cleaned.indexOf('{');
  const objEnd = cleaned.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) {
    candidates.push(cleaned.slice(objStart, objEnd + 1));
  }

  const arrStart = cleaned.indexOf('[');
  const arrEnd = cleaned.lastIndexOf(']');
  if (arrStart >= 0 && arrEnd > arrStart) {
    candidates.push(cleaned.slice(arrStart, arrEnd + 1));
  }

  for (const cand of candidates) {
    try {
      return JSON.parse(cand) as T;
    } catch {
      try {
        const repaired = repairUnescapedJsonNewlines(cand).replace(/,\s*([}\]])/g, '$1');
        return JSON.parse(repaired) as T;
      } catch {
        // try next candidate
      }
    }
  }
  return null;
}

export function sanitizeEntityIds(rawIds: unknown, validSet?: Set<number>): number[] {
  if (!Array.isArray(rawIds)) return [];
  const list = rawIds
    .map((item) => {
      if (typeof item === 'number') return item;
      const m = String(item).match(/\d+/);
      return m ? Number(m[0]) : NaN;
    })
    .filter((n) => !Number.isNaN(n) && n > 0 && (!validSet || validSet.size === 0 || validSet.has(n)));
  return Array.from(new Set(list));
}

export function parseSynopsisBatchJson(
  rawText: string,
  startChapter: number,
  validEntityIds?: Set<number>
): ParsedSynopsisItem[] {
  const parsed = parseJsonFlexible<{ chapters?: unknown[] } | unknown[]>(rawText);
  let arr: unknown[] | null = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as { chapters?: unknown[] }).chapters)
    ? (parsed as { chapters: unknown[] }).chapters
    : null;

  // Recover complete objects if a long JSON response was truncated before closing "]"
  if (!arr || arr.length === 0) {
    const cleaned = stripMarkdownCodeFences(rawText);
    const recovered: Record<string, unknown>[] = [];
    const objRegex = /\{\s*"chapter_number"\s*:\s*\d+[\s\S]*?\}/g;
    let m: RegExpExecArray | null;
    while ((m = objRegex.exec(cleaned)) !== null) {
      try {
        const obj = JSON.parse(repairUnescapedJsonNewlines(m[0]).replace(/,\s*([}\]])/g, '$1'));
        if (obj && typeof obj === 'object' && ('title' in obj || 'synopsis' in obj)) {
          recovered.push(obj as Record<string, unknown>);
        }
      } catch {
        // skip incomplete trailing object
      }
    }
    if (recovered.length > 0) {
      arr = recovered;
    }
  }

  if (arr && arr.length > 0) {
    const byNum = new Map<number, ParsedSynopsisItem>();
    arr.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object') return;
      const rec = entry as Record<string, unknown>;
      const num = Number(rec.chapter_number) || startChapter + idx;
      const rawTitle = String(rec.title || `Глава ${num}`)
        .replace(/^(?:глава|chapter)\s*\d*[:.\-—\s]*/i, '')
        .trim();
      const synopsis = String(rec.synopsis || '').trim();
      const entity_ids = sanitizeEntityIds(rec.entity_ids, validEntityIds);
      byNum.set(num, {
        chapter_number: num,
        title: rawTitle || `Глава ${num}`,
        synopsis: synopsis || `События главы ${num}`,
        entity_ids,
      });
    });
    if (byNum.size > 0) {
      return Array.from(byNum.values()).sort((a, b) => a.chapter_number - b.chapter_number);
    }
  }

  // Fallback legacy plain-text parser
  const results: ParsedSynopsisItem[] = [];
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  let currentNum = startChapter;
  let currentTitle = '';
  let currentSynopsis = '';

  for (const line of lines) {
    const chapMatch = line.match(/^глава\s*(\d+)[:.\-—]?\s*(.*)/i);
    if (chapMatch) {
      if (currentTitle) {
        results.push({
          chapter_number: currentNum,
          title: currentTitle,
          synopsis: currentSynopsis.trim() || `События главы ${currentNum}`,
        });
        currentSynopsis = '';
      }
      currentNum = parseInt(chapMatch[1], 10);
      currentTitle = chapMatch[2]?.trim() || `Глава ${currentNum}`;
    } else if (line.toLowerCase().startsWith('синопсис:')) {
      currentSynopsis += ' ' + line.replace(/^синопсис:\s*/i, '');
    } else if (currentTitle) {
      currentSynopsis += ' ' + line;
    }
  }

  if (currentTitle) {
    results.push({
      chapter_number: currentNum,
      title: currentTitle,
      synopsis: currentSynopsis.trim() || `События главы ${currentNum}`,
    });
  }

  return results;
}

function normalizeProseContent(text: string): string {
  let cleaned = text.replace(/\r\n/g, '\n').trim();
  // Normalize literal escaped \n if double-escaped
  if (!cleaned.includes('\n') && cleaned.includes('\\n')) {
    cleaned = cleaned.replace(/\\n/g, '\n');
  }
  return cleaned.trim();
}

export function buildFootnotesWithText(
  content: string,
  rawFootnotes: unknown
): { content: string; footnotes: FootnoteItem[]; rawLines: string[] } {
  const lines: string[] = Array.isArray(rawFootnotes)
    ? rawFootnotes.map((x) => String(x || '').trim()).filter(Boolean)
    : typeof rawFootnotes === 'string' && rawFootnotes.trim()
    ? rawFootnotes.split('\n').map((l) => l.trim()).filter(Boolean)
    : [];

  let mergedContent = normalizeProseContent(content);
  const items: FootnoteItem[] = [];

  lines.forEach((line, idx) => {
    const normalizedLine = /^\*\d+/.test(line) ? line : `*${idx + 1}: ${line.replace(/^[\d.*:\-\s]+/, '')}`;
    const numMatch = normalizedLine.match(/^\*(\d+)[:.\s]+(.+)$/);
    const num = numMatch ? Number(numMatch[1]) : idx + 1;
    const textBody = numMatch ? numMatch[2].trim() : normalizedLine;

    items.push({
      id: `fn_${num}_${idx}`,
      number: num,
      term: `*${num}`,
      text: textBody,
    });

    if (!mergedContent.includes(normalizedLine) && !mergedContent.includes(`*${num}:`)) {
      mergedContent += `\n\n${normalizedLine}`;
    }
  });

  return { content: mergedContent, footnotes: items, rawLines: lines };
}

export function parseFullChapterJson(
  rawText: string,
  fallbackTitle: string,
  fallbackSynopsis: string,
  validEntityIds?: Set<number>
): ParsedFullChapterResult {
  const parsed = parseJsonFlexible<Record<string, unknown> | { chapters?: unknown[] }>(rawText);
  let target: Record<string, unknown> | null = null;

  if (parsed && typeof parsed === 'object') {
    if ('chapters' in parsed && Array.isArray((parsed as { chapters?: unknown[] }).chapters)) {
      const first = (parsed as { chapters: unknown[] }).chapters[0];
      if (first && typeof first === 'object') target = first as Record<string, unknown>;
    } else if ('content' in parsed || 'title' in parsed) {
      target = parsed as Record<string, unknown>;
    }
  }

  if (target && typeof target.content === 'string' && target.content.trim().length > 40) {
    const title = String(target.title || fallbackTitle).trim() || fallbackTitle;
    const synopsis = String(target.synopsis || fallbackSynopsis || '').trim();
    const continuity_summary = String(target.continuity_summary || synopsis || '').slice(0, 450).trim();
    const entity_ids = sanitizeEntityIds(target.entity_ids, validEntityIds);
    const { content, footnotes, rawLines } = buildFootnotesWithText(target.content, target.footnotes);

    return {
      title,
      synopsis,
      content,
      footnotes,
      rawFootnoteLines: rawLines,
      entity_ids,
      continuity_summary,
    };
  }

  // Fallback: model returned raw prose text directly
  const plain = normalizeProseContent(stripMarkdownCodeFences(rawText));
  return {
    title: fallbackTitle,
    synopsis: fallbackSynopsis,
    content: plain,
    footnotes: [],
    rawFootnoteLines: [],
    entity_ids: [],
    continuity_summary: fallbackSynopsis.slice(0, 350),
  };
}

/**
 * Token-optimized Rolling Story Bible context builder:
 * Avoids sending 30 full messages or multi-thousand-token dumps on every chapter.
 */
export function buildRollingStoryContext(params: {
  book: Book;
  chapter: Chapter;
  allChapters?: Chapter[];
  prevChapter?: Chapter;
  prevPrevChapter?: Chapter;
  worldEntities?: WorldEntity[];
  activeCharacters?: Character[];
}): {
  rollingContext: string;
  entitiesCompact: string;
  styleBlock: string;
} {
  const { book, chapter, allChapters = [], prevChapter, prevPrevChapter, worldEntities = [], activeCharacters = [] } = params;
  const currentNum = chapter.chapter_number;

  // 1. Rolling history window
  const lines: string[] = [];
  if (book.synopsis_overview?.trim()) {
    lines.push(`Общая арка книги: ${book.synopsis_overview.trim().slice(0, 320)}`);
  }

  const sortedPrev = allChapters
    .filter((c) => c.chapter_number < currentNum)
    .sort((a, b) => a.chapter_number - b.chapter_number);

  const older = sortedPrev.filter((c) => c.chapter_number <= currentNum - 3);
  if (older.length > 0) {
    const recentOlder = older.slice(-5);
    const arcDigest = recentOlder
      .map((c) => `Гл.${c.chapter_number}: ${(c.continuity_summary || c.synopsis || c.title).slice(0, 110)}`)
      .join(' | ');
    lines.push(`Летопись прошлых глав: ${arcDigest}`);
  }

  const p2 = prevPrevChapter || sortedPrev.find((c) => c.chapter_number === currentNum - 2);
  if (p2) {
    lines.push(`Глава #${p2.chapter_number} («${p2.title}»): ${(p2.continuity_summary || p2.synopsis || '').slice(0, 200)}`);
  }

  const p1 = prevChapter || sortedPrev.find((c) => c.chapter_number === currentNum - 1);
  if (p1) {
    const p1Summary = (p1.continuity_summary || p1.synopsis || '').slice(0, 280);
    lines.push(`Предыдущая глава #${p1.chapter_number} («${p1.title}»): ${p1Summary}`);
    if (p1.content && p1.content.trim().length > 100) {
      const tail = p1.content.trim().slice(-950);
      lines.push(`Финал предыдущей главы (для плавного стыка сцены):\n«...${tail}»`);
    }
  } else if (lines.length <= 1) {
    lines.push('Это стартовая часть произведения — раскрой мир, атмосферу и конфликт.');
  }

  // 2. Compact Entities Index + Detailed Active Selection (no redundant LLM call)
  const typeShort: Record<WorldEntity['entity_type'], string> = {
    character: 'Персонаж',
    location: 'Локация',
    item: 'Артефакт',
    faction: 'Фракция',
    law: 'Закон',
  };

  const selectedIdSet = new Set((chapter.entity_ids || []).map(Number));
  const chapterNeedle = `${chapter.title} ${chapter.synopsis || ''}`.toLowerCase();

  const publicImg = (raw?: string): string => {
    const s = (raw || '').trim();
    if (!s.startsWith('http://') && !s.startsWith('https://')) return '';
    if (s.includes('localhost') || s.includes('127.0.0.1') || s.includes('/file/')) return '';
    return s;
  };

  let priorityEntities = worldEntities.filter((e) => selectedIdSet.has(e.id));
  if (priorityEntities.length === 0 && worldEntities.length > 0) {
    const matched = worldEntities.filter(
      (e) => chapterNeedle.includes(e.name.toLowerCase()) || (e.subtitle_or_role && chapterNeedle.includes(e.subtitle_or_role.toLowerCase()))
    );
    priorityEntities = matched.length > 0 ? matched.slice(0, 12) : worldEntities.slice(0, 12);
  }

  const priorityIds = new Set(priorityEntities.map((e) => e.id));
  const compactLines = priorityEntities.map((e) => {
    const attrs = Object.entries(e.attributes || {})
      .slice(0, 3)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : String(v).slice(0, 60)}`)
      .join('; ');
    const imgUrl = publicImg(e.image_url);
    return `[ID:${e.id} | ${typeShort[e.entity_type]}] ${e.name}${e.subtitle_or_role ? ` (${e.subtitle_or_role})` : ''}: ${(e.description || '').slice(0, 190)}${attrs ? ` [${attrs}]` : ''}${imgUrl ? ` | ref_img: ${imgUrl}` : ''}`;
  });

  const remainingEntities = worldEntities.filter((e) => !priorityIds.has(e.id));
  if (remainingEntities.length > 0) {
    const refIndex = remainingEntities
      .slice(0, 18)
      .map((e) => {
        const imgUrl = publicImg(e.image_url);
        return `[ID:${e.id}:${typeShort[e.entity_type]}] ${e.name}${imgUrl ? ` (${imgUrl})` : ''}`;
      })
      .join(', ');
    compactLines.push(`Прочие сущности мира (укажи их ID в entity_ids, если задействуешь): ${refIndex}`);
  }

  // Include activeCharacters if any are missing from worldEntities
  const existingNames = new Set(worldEntities.map((e) => e.name.trim().toLowerCase()));
  for (const ch of activeCharacters) {
    if (ch.name && !existingNames.has(ch.name.trim().toLowerCase())) {
      const cardUrl = publicImg(ch.visual_card_url);
      compactLines.push(
        `[Персонаж] ${ch.name} (${ch.role}): ${(ch.description || '').slice(0, 150)}${cardUrl ? ` | ref_img: ${cardUrl}` : ''}`
      );
    }
  }

  const entitiesCompact =
    compactLines.length > 0 ? compactLines.join('\n') : 'Используй ключевых героев и законы мира книги.';

  // 3. Compact Style Directive
  const style = book.style_config;
  const styleBlock = style
    ? `Стиль «${style.styleName}»: голос — ${style.proseVoice.slice(0, 150)}; темп — ${style.pacing.slice(0, 100)}; лексика — ${style.vocabulary.slice(0, 120)}${style.customGuidelines ? `; правила: ${style.customGuidelines.slice(0, 120)}` : ''}`
    : '';

  return {
    rollingContext: lines.join('\n'),
    entitiesCompact,
    styleBlock,
  };
}

export function buildChapterRevisionPrompt(params: {
  book: Book;
  chapterNumber: number;
  currentTitle: string;
  synopsis: string;
  currentContent: string;
  editInstruction?: string;
  rollingContext: string;
  entitiesCompact: string;
  styleBlock: string;
  plotDirective: string;
  targetPages?: number;
  targetWords?: number;
}): string {
  const vol = resolveChapterVolumeTargets({
    targetPages: params.targetPages,
    targetWords: params.targetWords,
  });
  const existingSnippet = params.currentContent.trim();
  const cappedExisting =
    existingSnippet.length > 6500
      ? `${existingSnippet.slice(0, 4200)}\n...\n${existingSnippet.slice(-2000)}`
      : existingSnippet;

  const userTask =
    params.editInstruction && params.editInstruction.trim()
      ? params.editInstruction.trim()
      : `Сохрани все ключевые события и факты исходной главы, но глубоко переработай и разверни её до объёма ~${vol.targetPages} страниц А5 (~${vol.targetWords} слов): добавь живые сцены в реальном времени, психологизм, развёрнутые диалоги, детали канона и атмосферу нуара.`;

  return `Ты — мастер большой художественной прозы и редактор-соавтор.
Переработай, улучши и полноценно разверни главу #${params.chapterNumber} («${params.currentTitle}») книги «${params.book.title}» (жанры: ${(params.book.genres || []).join(', ')}, тон: ${params.book.tone || 'нуар'}).

ЗАДАЧА НА ИЗМЕНЕНИЕ ГЛАВЫ:
${userTask}

Синопсис главы: ${params.synopsis || 'Ключевые события этой части истории'}

${params.rollingContext}

Сущности и законы мира:
${params.entitiesCompact}

${params.styleBlock}
${params.plotDirective}

${cappedExisting ? `ТЕКУЩИЙ ТЕКСТ ГЛАВЫ (опирайся на него и развивай/переписывай по задаче):\n«${cappedExisting}»` : `Исходный текст отсутствует — раскрой синопсис в ${vol.recommendedScenes} развёрнутых сценах.`}

ТРЕБОВАНИЯ К ОБЪЁМУ И ФОРМАТУ:
1. Целевой объём результата: СТРОГО ${vol.targetChars}–${vol.targetCharsMax} символов с пробелами (~${vol.targetPages} книжных страниц А5, ~${vol.targetWords} слов, ${vol.recommendedScenes} полных сцен, переходы через «* * *» на отдельной строке).
2. Не пиши «Глава X» в начале текста, не используй капслок, добавь сноски вида *1, *2 в массив footnotes.
3. Верни СТРОГО валидный JSON-объект без пояснений:
{
  "chapter_number": ${params.chapterNumber},
  "title": "${params.currentTitle.replace(/"/g, '\\"')}",
  "synopsis": "Актуальный синопсис 2-3 предложения",
  "content": "Полный обновлённый текст главы (${vol.targetChars}-${vol.targetCharsMax} символов, ~${vol.targetWords} слов) с абзацами через \\n\\n",
  "footnotes": ["*1: Пояснение термина или детали лора"],
  "entity_ids": [1, 2],
  "continuity_summary": "Краткий итог главы для следующей части (до 350 знаков)"
}`;
}

