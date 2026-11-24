import { useMemo } from 'react';
import { Book, Chapter } from '../../../types';
import { ReaderSettings } from '../ReaderThemeSelector';
import { PageData } from '../BookFlipPage';
import { detectStandaloneMarkdownImage } from './pageIllustrationParser';

interface UseBookPaginationParams {
  book: Book;
  chapters: Chapter[];
  activeFontSize: number;
  lineSpacingValue: number;
  settings?: ReaderSettings;
  isFullscreen: boolean;
  viewportWidth?: number;
  viewportHeight?: number;
}

export interface ReaderDimensions {
  baseWidth: number;
  baseHeight: number;
  isSinglePage: boolean;
}

export function calculateReaderDimensions(
  winW: number,
  winH: number,
  isFullscreen: boolean
): ReaderDimensions {
  const isPortrait = winH > winW;
  const isSinglePage = isPortrait && winW < 768;
  const isCompactLandscape = winH < 540;

  let baseWidth: number;
  let baseHeight: number;

  if (isFullscreen) {
    if (isSinglePage) {
      baseWidth = Math.min(460, winW - 16);
      baseHeight = Math.max(380, winH - 24);
    } else if (isCompactLandscape) {
      baseHeight = Math.max(260, winH - 20);
      baseWidth = Math.min(Math.floor((winW - 32) / 2), Math.round(baseHeight / 1.38));
    } else {
      baseWidth = Math.min(580, Math.max(380, Math.floor((winW - 60) / 2)));
      baseHeight = Math.min(860, Math.max(360, winH - 36));
    }
  } else {
    if (isSinglePage) {
      baseWidth = Math.min(400, Math.max(260, winW - 24));
      baseHeight = Math.min(Math.round(winH * 0.74), Math.round(baseWidth * 1.4));
    } else if (isCompactLandscape) {
      baseHeight = Math.max(250, winH - 120);
      baseWidth = Math.min(Math.floor((winW - 32) / 2), Math.round(baseHeight / 1.38));
    } else {
      const maxSpreadW = Math.min(1160, winW - 48);
      baseWidth = Math.min(560, Math.max(380, Math.floor((maxSpreadW - 24) / 2)));
      baseHeight = Math.min(
        820,
        Math.max(660, Math.min(Math.round(winH * 0.78), Math.round(baseWidth * 1.414)))
      );
    }
  }

  return { baseWidth, baseHeight, isSinglePage };
}

function splitParagraphByLines(
  text: string,
  maxLines: number,
  charsPerLine: number
): { fitText: string; restText: string } {
  if (maxLines <= 0) {
    return { fitText: '', restText: text };
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return { fitText: '', restText: '' };
  }

  let currentLineChars = 0;
  let currentLinesUsed = 1;
  const fitWords: string[] = [];
  let restStartIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const wordLen = word.length;

    if (currentLineChars > 0 && currentLineChars + 1 + wordLen > charsPerLine) {
      if (currentLinesUsed >= maxLines) {
        restStartIndex = i;
        break;
      }
      currentLinesUsed++;
      currentLineChars = wordLen;
      fitWords.push(word);
    } else {
      currentLineChars += (currentLineChars === 0 ? 0 : 1) + wordLen;
      fitWords.push(word);
    }
    restStartIndex = i + 1;
  }

  if (fitWords.length === 0 && words.length > 0 && maxLines >= 1) {
    const firstWord = words[0];
    const splitPoint = Math.min(firstWord.length - 1, Math.max(1, charsPerLine - 2));
    const part1 = firstWord.slice(0, splitPoint) + '-';
    const part2 = firstWord.slice(splitPoint);
    return {
      fitText: part1,
      restText: [part2, ...words.slice(1)].join(' '),
    };
  }

  return {
    fitText: fitWords.join(' '),
    restText: words.slice(restStartIndex).join(' '),
  };
}

function getChapterIllustrationHeightPenalty(mode: string): number {
  if (mode === 'page-bg') return 0;
  if (mode === 'wrap-left' || mode === 'wrap-right' || mode === 'split-vertical') return 85;
  if (mode === 'gradient-blend') return 125;
  return 190; // full-width, header-break, graphic-panel, photo-polaroid
}

export const useBookPagination = ({
  book,
  chapters,
  activeFontSize,
  lineSpacingValue,
  settings,
  isFullscreen,
  viewportWidth,
  viewportHeight,
}: UseBookPaginationParams): PageData[] => {
  return useMemo<PageData[]>(() => {
    const list: PageData[] = [];

    // Front Cover (page 0)
    list.push({
      pageNumber: 0,
      chapterNumber: 0,
      chapterTitle: book.title,
      isCover: true,
      isFirstPageOfChapter: true,
      paragraphs: [
        book.synopsis_overview || 'Книга создана на ИИ-фабрике книг KnigAI.',
        `Автор: ${book.author || 'Неизвестный автор'}`,
      ],
      footnotes: [],
      illustration: book.cover_config?.frontImageUrl
        ? {
            url: book.cover_config.frontImageUrl,
            layout: { mode: 'full-width', scale: 95, filter: 'normal' },
            alt: `Обложка книги ${book.title}`,
          }
        : undefined,
    });

    if (!chapters || chapters.length === 0) {
      list.push({
        pageNumber: 1,
        chapterNumber: 1,
        chapterTitle: 'Титульный лист',
        isFirstPageOfChapter: true,
        paragraphs: ['Книга находится в разработке. Добавьте главы в конструкторе.'],
        footnotes: [],
      });
    } else {
      let globalPageNum = 1;

      const winW = viewportWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024);
      const winH = viewportHeight || (typeof window !== 'undefined' ? window.innerHeight : 768);
      const { baseWidth, baseHeight, isSinglePage } = calculateReaderDimensions(winW, winH, isFullscreen);

      const nonTextOverheadPx = isSinglePage ? 96 : 120;
      const maxAvailableHeightPx = Math.max(180, baseHeight - nonTextOverheadPx);
      const lineHeightPx = activeFontSize * lineSpacingValue;
      const availableWidthPx = isSinglePage ? Math.max(220, baseWidth - 28) : Math.max(340, baseWidth - 52);
      const charWidthPx = activeFontSize * 0.54;
      const charsPerLine = Math.max(20, Math.floor(availableWidthPx / charWidthPx));
      const effectiveCharsPerLine = Math.floor(charsPerLine * 0.94);

      chapters.forEach((chap) => {
        const hasIllustration = Boolean(chap.illustration_url);
        const rawText = chap.content
          ? chap.content.trim()
          : hasIllustration
          ? ''
          : chap.synopsis || 'Текст главы в процессе написания...';
        const rawBlocks = rawText ? rawText.split('\n\n').map((p) => p.trim()).filter(Boolean) : [];

        const proseParagraphs: string[] = [];
        const footnoteEntries: { key: string; text: string }[] = [];

        rawBlocks.forEach((block) => {
          const fnMatch =
            block.match(/^(\*{1,3}\d*|\[\^?\d+\]|\d+\)|\d+\.)\s+/i) ||
            block.match(/^(Сноска|Примечание|Прим\.|Ред\.):?\s*/i);
          if (fnMatch) {
            footnoteEntries.push({
              key: fnMatch[1] ? fnMatch[1].trim() : '*',
              text: block,
            });
          } else {
            proseParagraphs.push(block);
          }
        });

        // Strip duplicate chapter headings
        if (proseParagraphs.length > 0) {
          while (proseParagraphs.length > 0) {
            const firstP = proseParagraphs[0].trim();
            const standaloneHeadingRegex =
              /^(?:(?:Глава|ГЛАВА|глава|Часть|ЧАСТЬ|часть|Раздел|РАЗДЕЛ|раздел|Chapter|CHAPTER)\s*[0-9IVXLCDMivxlcdm.:\-–—\s]*)+$/i;
            if (standaloneHeadingRegex.test(firstP)) {
              proseParagraphs.shift();
              continue;
            }

            const inlineLeadRegex =
              /^(?:(?:Глава|ГЛАВА|глава|Часть|ЧАСТЬ|часть|Раздел|РАЗДЕЛ|раздел|Chapter|CHAPTER)\s*(?:[0-9IVXLCDMivxlcdm]+)?(?:[:.\-–—\s]*))+/i;
            const stripped = firstP.replace(inlineLeadRegex, '').trim();
            if (stripped && stripped !== firstP) {
              proseParagraphs[0] = stripped;
            } else if (!stripped) {
              proseParagraphs.shift();
              continue;
            }
            break;
          }
        }

        const defaultIllustration = chap.illustration_url
          ? {
              url: chap.illustration_url,
              layout: chap.image_layout || {
                mode: 'wrap-left' as const,
                scale: 50,
                filter: 'normal' as const,
              },
              alt: chap.image_layout?.caption || `Иллюстрация к главе ${chap.chapter_number}`,
            }
          : undefined;

        const isDedicatedFullPage =
          Boolean(defaultIllustration) && defaultIllustration!.layout.pageZone === 'full-page';
        const targetPageIdx = Math.max(0, (defaultIllustration?.layout.targetPageInChapter || 1) - 1);

        const chapPages: PageData[] = [];
        let currentPageParagraphs: string[] = [];
        let currentHeightOnPage = 0;
        let isChapterFirstPage = true;
        const usedFootnoteIndices = new Set<number>();

        const getMatchedFootnotesForPage = (paras: string[], isLastPage: boolean): string[] => {
          const matched: string[] = [];
          footnoteEntries.forEach((fn, idx) => {
            if (usedFootnoteIndices.has(idx)) return;
            const cleanKey = fn.key.replace(/[\[\]\^()]/g, '');
            const hasRef = paras.some(
              (p) =>
                p.includes(fn.key) ||
                (cleanKey && p.includes(`[${cleanKey}]`)) ||
                (cleanKey && p.includes(`*${cleanKey}`)) ||
                (cleanKey && p.includes(`(${cleanKey})`)) ||
                (fn.key.startsWith('*') && p.includes('*'))
            );
            if (hasRef || isLastPage) {
              matched.push(fn.text);
              usedFootnoteIndices.add(idx);
            }
          });
          return matched;
        };

        const getPageCapacityPx = () => {
          let capacity = maxAvailableHeightPx;
          if (settings?.margins === 'narrow') capacity = Math.round(capacity * 1.08);
          if (settings?.margins === 'wide') capacity = Math.round(capacity * 0.9);

          if (isChapterFirstPage) {
            capacity -= isSinglePage ? 80 : 90;
          }

          if (defaultIllustration && !isDedicatedFullPage && chapPages.length === targetPageIdx) {
            capacity -= getChapterIllustrationHeightPenalty(defaultIllustration.layout.mode);
          }

          const matchedFnCount = footnoteEntries.filter(
            (fn, idx) =>
              !usedFootnoteIndices.has(idx) &&
              currentPageParagraphs.some(
                (p) => p.includes(fn.key) || (fn.key.startsWith('*') && p.includes('*'))
              )
          ).length;
          if (matchedFnCount > 0) {
            capacity -= matchedFnCount * 20 + 22;
          }

          return Math.max(120, capacity);
        };

        const calculateParagraphHeightPx = (text: string): number => {
          const inlineImg = detectStandaloneMarkdownImage(text);
          if (inlineImg) {
            const m = inlineImg.layoutConfig.mode;
            if (m === 'page-bg') return 0;
            if (m === 'wrap-left' || m === 'wrap-right' || m === 'split-vertical') {
              return isSinglePage ? 115 : 135;
            }
            if (m === 'gradient-blend') return isSinglePage ? 150 : 175;
            return Math.round(
              (isSinglePage ? 175 : 215) * Math.max(0.55, (inlineImg.layoutConfig.scale || 85) / 100)
            );
          }
          const cleanLen = text.replace(/\[\^?\d+\]/g, '').length;
          const lines = Math.max(1, Math.ceil(cleanLen / effectiveCharsPerLine));
          return lines * lineHeightPx + 10;
        };

        const commitPage = (isLastPage: boolean = false) => {
          const pageFootnotes = getMatchedFootnotesForPage(currentPageParagraphs, isLastPage);
          const attachHere =
            Boolean(defaultIllustration) && !isDedicatedFullPage && chapPages.length === targetPageIdx;
          chapPages.push({
            pageNumber: 0,
            chapterNumber: chap.chapter_number,
            chapterTitle: chap.title,
            isFirstPageOfChapter: isChapterFirstPage,
            paragraphs: currentPageParagraphs,
            footnotes: pageFootnotes,
            illustration: attachHere ? defaultIllustration : undefined,
          });
          currentPageParagraphs = [];
          currentHeightOnPage = 0;
          isChapterFirstPage = false;
        };

        const safeBufferPx = isSinglePage ? 10 : 6;

        for (const para of proseParagraphs) {
          let remainingParaText = para.trim();
          if (!remainingParaText) continue;

          let loopSafeguard = 0;
          while (remainingParaText.length > 0 && loopSafeguard++ < 300) {
            const pageCapacity = getPageCapacityPx();
            const availableHeight = Math.max(0, pageCapacity - currentHeightOnPage - safeBufferPx);
            const paraHeight = calculateParagraphHeightPx(remainingParaText);

            if (paraHeight <= availableHeight) {
              currentPageParagraphs.push(remainingParaText);
              currentHeightOnPage += paraHeight;
              remainingParaText = '';

              if (pageCapacity - currentHeightOnPage < lineHeightPx + safeBufferPx) {
                commitPage(false);
              }
            } else if (detectStandaloneMarkdownImage(remainingParaText)) {
              // Avoid splitting a markdown image line like words!
              if (currentPageParagraphs.length > 0) {
                commitPage(false);
              } else {
                currentPageParagraphs.push(remainingParaText);
                remainingParaText = '';
                commitPage(false);
              }
            } else {
              const availableLines = Math.floor((availableHeight - 10) / lineHeightPx);

              if (availableLines >= 1) {
                const { fitText, restText } = splitParagraphByLines(
                  remainingParaText,
                  availableLines,
                  effectiveCharsPerLine
                );

                if (fitText && fitText.length < remainingParaText.length) {
                  currentPageParagraphs.push(fitText);
                  remainingParaText = restText;
                  commitPage(false);
                } else if (fitText && !restText) {
                  currentPageParagraphs.push(fitText);
                  currentHeightOnPage += calculateParagraphHeightPx(fitText);
                  remainingParaText = '';
                  if (pageCapacity - currentHeightOnPage < lineHeightPx + safeBufferPx) {
                    commitPage(false);
                  }
                } else {
                  commitPage(false);
                }
              } else {
                commitPage(false);
              }
            }
          }
        }

        if (
          currentPageParagraphs.length > 0 ||
          (proseParagraphs.length === 0 && defaultIllustration && !isDedicatedFullPage) ||
          usedFootnoteIndices.size < footnoteEntries.length
        ) {
          commitPage(true);
        }

        // Insert dedicated full-page illustration spread OR fallback attach if targetPageIdx exceeded chapter page count
        if (defaultIllustration) {
          if (isDedicatedFullPage) {
            const insertIdx = Math.min(targetPageIdx, chapPages.length);
            chapPages.splice(insertIdx, 0, {
              pageNumber: 0,
              chapterNumber: chap.chapter_number,
              chapterTitle: chap.title,
              isFirstPageOfChapter: chapPages.length === 0,
              paragraphs: [],
              footnotes: [],
              illustration: defaultIllustration,
            });
          } else if (chapPages.length > 0 && targetPageIdx >= chapPages.length) {
            chapPages[chapPages.length - 1].illustration = defaultIllustration;
          }
        }

        for (const cp of chapPages) {
          cp.pageNumber = globalPageNum++;
          list.push(cp);
        }
      });
    }

    // Back Cover
    list.push({
      pageNumber: list.length + 1,
      chapterNumber: 999,
      chapterTitle: 'Конец издания',
      isBackCover: true,
      isFirstPageOfChapter: false,
      paragraphs: [
        'Благодарим за чтение.',
        'Издано на платформе KnigAI.',
        'Все права защищены автором произведения.',
      ],
      footnotes: [],
    });

    return list;
  }, [
    chapters,
    book,
    activeFontSize,
    lineSpacingValue,
    settings?.margins,
    settings?.lineSpacing,
    isFullscreen,
    viewportWidth,
    viewportHeight,
  ]);
};
