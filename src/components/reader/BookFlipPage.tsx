import React from 'react';
import { BookOpen, List } from 'lucide-react';
import { Book, ImageLayoutConfig } from '../../types';
import { ReaderSettings } from './ReaderThemeSelector';
import { getImageFilterStyle } from '../editor/ImageFilterControl';
import { detectStandaloneMarkdownImage } from './hooks/pageIllustrationParser';
import { InlineIllustrationBlock } from './modals/InlineIllustrationBlock';

export interface PageData {
  pageNumber: number;
  chapterNumber: number;
  chapterTitle: string;
  isCover?: boolean;
  isBackCover?: boolean;
  isFirstPageOfChapter: boolean;
  paragraphs: string[];
  footnotes: string[];
  illustration?: {
    url: string;
    layout: ImageLayoutConfig;
    alt: string;
  };
}

interface BookFlipPageProps {
  page: PageData;
  index: number;
  paddingClass: string;
  currentSheetBg: string;
  currentSheetText: string;
  currentSheetBorder: string;
  currentHeaderBorder: string;
  currentAccentColor: string;
  fontCssFamily: string;
  activeFontSize: number;
  lineSpacingValue: number;
  customHeader: string;
  book: Book;
  settings: ReaderSettings;
  pageStyleConfig: any;
  hideFooters: boolean;
  leftFooter: string;
  rightFooter: string;
  totalPages?: number;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSettings?: () => void;
}

/**
 * Cleans markdown formatting, links, and code fences so raw syntax doesn't clutter book prose
 */
export const cleanMarkdownArtifacts = (text: string): string => {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^#{1,6}\s*/gm, '');
  cleaned = cleaned.replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, '$1');
  cleaned = cleaned.replace(/```[a-zA-Z0-9_-]*\n?/g, '').replace(/```/g, '');
  cleaned = cleaned.replace(
    /`([^`]+)`/g,
    '<code class="bg-zinc-800/80 px-1 py-0.5 text-[14px] font-mono border border-zinc-700/50">$1</code>'
  );
  return cleaned;
};

export const canHaveDropCap = (text: string): boolean => {
  const cleaned = cleanMarkdownArtifacts(text).trim();
  return /^[A-Za-zА-Яа-яЁё]/.test(cleaned);
};

export const formatParagraphText = (rawText: string): string => {
  const imgMatch = rawText.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (imgMatch) {
    return `<div class="my-3 text-center clear-both"><img src="${imgMatch[2]}" alt="${imgMatch[1] || 'Иллюстрация'}" class="max-h-56 max-w-full mx-auto object-contain border border-zinc-700 shadow-md" loading="lazy" /></div>`;
  }

  let text = cleanMarkdownArtifacts(rawText);
  text = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<span class="block my-2.5 text-center clear-both"><img src="$2" alt="$1" class="max-h-52 max-w-full mx-auto object-contain border border-zinc-700 shadow-md" loading="lazy" /></span>'
  );

  return text
    .replace(
      /([А-Яа-яA-Za-z0-9»"”’'])\s*(\*{1,3})(?=\s|[.,!?:;)]|$)/g,
      '$1<sup class="text-rose-500 font-bold ml-0.5 select-none text-[14px]">$2</sup>'
    )
    .replace(
      /\[\^?(\d+|\*+)\]/g,
      '<sup class="text-rose-500 font-bold ml-0.5 text-[14px] px-0.5 select-none cursor-pointer" title="Сноска $1">[$1]</sup>'
    )
    .replace(
      /(?:\b|\s)\*([0-9]+)\b/g,
      ' <sup class="text-rose-500 font-bold text-[14px] px-0.5 select-none cursor-pointer" title="Сноска $1">*[$1]</sup>'
    )
    .replace(
      /([А-Яа-яA-Za-z0-9»"”’'])\((\d+|\*+)\)/g,
      '$1<sup class="text-rose-500 font-bold ml-0.5 text-[14px] select-none">($2)</sup>'
    )
    .replace(
      /([¹²³⁴⁵⁶⁷⁸⁹]+)/g,
      '<sup class="text-rose-500 font-bold ml-0.5 text-[14px] select-none">$1</sup>'
    )
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>');
};

export const BookFlipPage: React.FC<BookFlipPageProps> = ({
  page: p,
  index,
  paddingClass,
  currentSheetBg,
  currentSheetText,
  currentSheetBorder,
  currentHeaderBorder,
  fontCssFamily,
  activeFontSize,
  lineSpacingValue,
  customHeader,
  book,
  settings,
  pageStyleConfig,
  hideFooters,
  rightFooter,
  totalPages,
}) => {
  const isHard = p.isCover || p.isBackCover;
  const isLightTheme =
    currentSheetBg.includes('bg-white') ||
    currentSheetBg.includes('bg-[#f') ||
    currentSheetBg.includes('bg-stone') ||
    currentSheetBg.includes('bg-zinc-100');

  // Detect page-level background art (either from chapter hero or standalone inline ![...|layout=page-bg](url))
  let pageBgArt: { url: string; layout: ImageLayoutConfig } | null = null;
  if (!isHard && p.illustration?.layout.mode === 'page-bg' && p.paragraphs.length > 0) {
    pageBgArt = { url: p.illustration.url, layout: p.illustration.layout };
  }

  const visibleParagraphs: Array<{ raw: string; inlineImg: ReturnType<typeof detectStandaloneMarkdownImage> }> = [];
  for (const para of p.paragraphs) {
    const inlineImg = detectStandaloneMarkdownImage(para);
    if (inlineImg && inlineImg.layoutConfig.mode === 'page-bg') {
      if (!pageBgArt) {
        pageBgArt = { url: inlineImg.url, layout: inlineImg.layoutConfig };
      }
      continue;
    }
    visibleParagraphs.push({ raw: para, inlineImg });
  }

  const hasFlowIllustration =
    !isHard &&
    Boolean(p.illustration) &&
    p.illustration!.layout.mode !== 'page-bg' &&
    visibleParagraphs.length > 0;

  const illusZone = p.illustration?.layout.pageZone || 'auto';
  const illusMode = p.illustration?.layout.mode || 'full-width';
  const splitPoint = Math.max(1, Math.ceil(visibleParagraphs.length / 2));

  const renderSingleParagraph = (
    item: { raw: string; inlineImg: ReturnType<typeof detectStandaloneMarkdownImage> },
    idx: number
  ) => {
    if (item.inlineImg) {
      if (item.inlineImg.layoutConfig.mode === 'split-vertical') {
        return (
          <div key={idx} className="my-2.5 clear-both">
            <InlineIllustrationBlock
              url={item.inlineImg.url}
              alt={item.inlineImg.alt}
              layout={item.inlineImg.layoutConfig}
              isLightTheme={isLightTheme}
            />
          </div>
        );
      }
      return (
        <InlineIllustrationBlock
          key={idx}
          url={item.inlineImg.url}
          alt={item.inlineImg.alt}
          layout={item.inlineImg.layoutConfig}
          isLightTheme={isLightTheme}
        />
      );
    }

    let cleanPara = item.raw;
    if (idx === 0 && p.isFirstPageOfChapter) {
      cleanPara = cleanPara
        .replace(
          /^(?:(?:Глава|глава|Часть|часть|Раздел|раздел|Chapter|chapter)\s*(?:[0-9IVXLCDMivxlcdm]+)?(?:[:.\-–—\s]*))+/i,
          ''
        )
        .trim();
    }
    if (!cleanPara) return null;

    return (
      <p
        key={idx}
        className={`mb-2.5 leading-relaxed ${
          idx === 0 && p.isFirstPageOfChapter && !hasFlowIllustration && canHaveDropCap(cleanPara)
            ? 'book-drop-cap'
            : ''
        }`}
        dangerouslySetInnerHTML={{
          __html: formatParagraphText(cleanPara),
        }}
      />
    );
  };

  return (
    <div
      key={`page-${index}`}
      className={`st-page ${paddingClass} ${currentSheetBg} ${currentSheetText} ${currentSheetBorder} shadow-2xl relative overflow-hidden`}
      data-density={isHard ? 'hard' : 'soft'}
      style={{
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Full-bleed Page Background Illustration (mode === 'page-bg') */}
      {pageBgArt && (
        <>
          <img
            src={pageBgArt.url}
            alt="Фоновая иллюстрация"
            className="absolute inset-0 w-full h-full object-cover z-0 pointer-events-none"
            referrerPolicy="no-referrer"
            style={{
              ...getImageFilterStyle(pageBgArt.layout.filter, pageBgArt.layout.colorTint),
              opacity: Math.min(0.9, Math.max(0.15, (pageBgArt.layout.bgOpacity ?? 38) / 100)),
              transform:
                pageBgArt.layout.offsetX || pageBgArt.layout.offsetY
                  ? `translate(${pageBgArt.layout.offsetX || 0}px, ${pageBgArt.layout.offsetY || 0}px)`
                  : undefined,
            }}
          />
          <div
            aria-hidden="true"
            className={`absolute inset-0 z-0 pointer-events-none ${
              isLightTheme ? 'bg-white/60' : 'bg-black/55'
            }`}
          />
        </>
      )}

      {/* Antique / Paper Grain Texture */}
      {(settings?.texture === 'antique-fibers' || pageStyleConfig?.textureOverlay) && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-45 mix-blend-multiply z-[1]"
          style={{
            backgroundImage:
              pageStyleConfig?.textureOverlay ||
              'radial-gradient(circle at 10% 20%, rgba(139,90,43,0.12) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(100,50,15,0.14) 0%, transparent 45%)',
          }}
        />
      )}
      {settings?.texture === 'book-grain' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-20 z-[1]"
          style={{
            backgroundImage: 'radial-gradient(circle at 50% 50%, rgba(0,0,0,0.06) 1px, transparent 1px)',
            backgroundSize: '4px 4px',
          }}
        />
      )}

      {/* Decorative classic borders */}
      {settings?.borderStyle === 'ornate' && (
        <div
          aria-hidden="true"
          className="absolute inset-2 sm:inset-3 pointer-events-none border border-current opacity-30 z-[2]"
        >
          <span className="absolute top-1 left-1 w-3.5 h-3.5 border-t-2 border-l-2 border-current" />
          <span className="absolute top-1 right-1 w-3.5 h-3.5 border-t-2 border-r-2 border-current" />
          <span className="absolute bottom-1 left-1 w-3.5 h-3.5 border-b-2 border-l-2 border-current" />
          <span className="absolute bottom-1 right-1 w-3.5 h-3.5 border-b-2 border-r-2 border-current" />
        </div>
      )}

      {/* INNER FLEX CONTAINER */}
      <div className="w-full h-full flex flex-col justify-between relative z-10 overflow-hidden">
        {!isHard && (
          <div
            className={`shrink-0 h-8 flex items-center justify-between pb-1 mb-2 border-b text-[14px] font-semibold opacity-90 ${currentHeaderBorder}`}
          >
            <span className="truncate max-w-[150px] sm:max-w-xs">{customHeader || book.title}</span>

            <button
              type="button"
              data-action="toggle-quick-panel"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 -my-0.5 hover:bg-zinc-800/80 border border-transparent hover:border-zinc-700/60 transition cursor-pointer text-[14px] font-semibold text-zinc-200 hover:text-white"
              style={{ fontFamily: fontCssFamily }}
              title="Панель настроек и навигации"
            >
              <List className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Глава {p.chapterNumber}</span>
            </button>

            <span className="tabular-nums font-mono text-[14px] shrink-0">
              Стр. {p.pageNumber}
            </span>
          </div>
        )}

        {/* Page Content Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col justify-start">
          {/* Front Cover Special View */}
          {p.isCover && (
            <div className="h-full flex flex-col justify-between text-center p-3 sm:p-6">
              <div className="shrink-0 pt-0.5 sm:pt-1">
                <span className="inline-block px-2.5 py-0.5 bg-black/60 text-zinc-300 font-mono text-[14px] border border-zinc-700 mb-1.5">
                  Книжная серия KnigAI
                </span>
                <h1 className="text-[18px] sm:text-[24px] font-bold text-rose-500 mb-0.5 line-clamp-2 leading-tight">
                  {book.title}
                </h1>
                <p className="text-[14px] font-serif italic text-zinc-300 line-clamp-1">
                  {book.author || 'Автор не указан'}
                </p>
              </div>

              {p.illustration?.url ? (
                <div className="flex-1 min-h-0 my-1.5 sm:my-2.5 w-full flex items-center justify-center overflow-hidden">
                  <img
                    src={p.illustration.url}
                    alt={book.title}
                    className="h-full max-h-[480px] sm:max-h-[560px] w-auto max-w-full object-contain border-2 border-zinc-600 shadow-2xl"
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <div className="flex-1 min-h-0 my-2 p-6 border-2 border-dashed border-zinc-700/60 text-zinc-400 flex flex-col items-center justify-center">
                  <BookOpen className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-[14px]">Переплет и обложка книги</p>
                </div>
              )}

              <div className="shrink-0 text-[14px] text-zinc-400 font-mono border-t border-zinc-800/80 pt-1.5 pb-0.5">
                {book.cover_config?.genreLabel ||
                  (book.genres && book.genres.length > 0 ? book.genres.join(', ') : 'Художественная литература')}{' '}
                · {book.status || 'Черновик'}
              </div>
            </div>
          )}

          {/* Back Cover Special View */}
          {p.isBackCover && (
            <div className="h-full flex flex-col justify-between text-center p-4 sm:p-10">
              <div className="shrink-0 flex items-center justify-end pb-1 mb-2 border-b border-current/20 text-[14px]">
                <span className="font-mono text-[14px] opacity-70">Окончание</span>
              </div>

              <div className="pt-4">
                <div className="w-14 h-1 bg-rose-600 mx-auto mb-4" />
                <h2 className="text-[20px] font-bold mb-3">{book.title}</h2>
                <p className="text-[14px] opacity-80 max-w-md mx-auto leading-relaxed">
                  {p.paragraphs[0]}
                </p>
              </div>

              <div className="my-auto py-2">
                <p className="text-[14px] opacity-75">{p.paragraphs[1]}</p>
                <p className="text-[14px] font-mono opacity-60 mt-1">{p.paragraphs[2]}</p>
              </div>

              <div className="text-[14px] font-mono opacity-50 border-t border-current/20 pt-3">
                ИИ-фабрика книг · KnigAI
              </div>
            </div>
          )}

          {/* Regular Reading Page or Dedicated Full-Page Illustration Spread */}
          {!isHard &&
            (p.illustration && visibleParagraphs.length === 0 ? (
              <div className="w-full h-full flex flex-col items-center justify-center p-1 overflow-hidden">
                <img
                  src={p.illustration.url}
                  alt={p.illustration.alt || `Страница ${p.pageNumber}`}
                  className="max-w-full max-h-[92%] object-contain shadow-md"
                  referrerPolicy="no-referrer"
                  style={getImageFilterStyle(
                    p.illustration.layout.filter,
                    p.illustration.layout.colorTint
                  )}
                />
                {p.illustration.layout.caption && (
                  <p className="text-[14px] italic opacity-85 text-center mt-2 px-3">
                    {p.illustration.layout.caption}
                  </p>
                )}
              </div>
            ) : (
              <div
                className="text-justify leading-relaxed clearfix"
                style={{
                  fontSize: `${activeFontSize}px`,
                  fontFamily: fontCssFamily,
                  lineHeight: lineSpacingValue,
                }}
              >
                {/* Chapter Title if first page */}
                {p.isFirstPageOfChapter &&
                  (() => {
                    const rawTitle = (p.chapterTitle || '').trim();
                    const isGeneric =
                      !rawTitle ||
                      new RegExp(`^(?:глава|часть|раздел|chapter)\\s*${p.chapterNumber}$`, 'i').test(
                        rawTitle
                      ) ||
                      /^(?:глава|часть|раздел|chapter)\s*(?:[0-9IVXLCDMivxlcdm]+)?$/i.test(
                        rawTitle
                      );

                    const cleanSubTitle = rawTitle
                      .replace(
                        new RegExp(
                          `^(?:глава|часть|раздел|chapter)\\s*${p.chapterNumber}[:.\\-–—\\s]*`,
                          'i'
                        ),
                        ''
                      )
                      .trim();

                    const renderAccent = (txt: string) =>
                      Array.from(txt).map((char, i) => {
                        if (char === ' ') return ' ';
                        const isRed = (char.charCodeAt(0) * 7 + i * 13) % 10 < 3;
                        return (
                          <span key={i} className={isRed ? 'text-rose-500 font-bold' : ''}>
                            {char}
                          </span>
                        );
                      });

                    return (
                      <div className="mb-2.5 text-center">
                        {!isGeneric && cleanSubTitle ? (
                          <>
                            <div className="text-[14px] font-bold tracking-wide opacity-80 mb-0.5 font-['Rubik_Marker_Hatch',sans-serif]">
                              {renderAccent(`Глава ${p.chapterNumber}`)}
                            </div>
                            <h2 className="text-[18px] sm:text-[22px] font-bold mt-0.5 tracking-tight font-['Rubik_Marker_Hatch',sans-serif]">
                              {renderAccent(cleanSubTitle)}
                            </h2>
                          </>
                        ) : (
                          <h2 className="text-[18px] sm:text-[22px] font-bold mt-0.5 tracking-tight font-['Rubik_Marker_Hatch',sans-serif]">
                            {renderAccent(`Глава ${p.chapterNumber}`)}
                          </h2>
                        )}
                        <div className="w-10 h-0.5 mx-auto mt-1 opacity-40 bg-rose-500" />
                      </div>
                    );
                  })()}

                {/* Split-Vertical Layout Mode */}
                {hasFlowIllustration && illusMode === 'split-vertical' ? (
                  <div className="grid grid-cols-12 gap-3 items-start">
                    <div className="col-span-5">
                      <InlineIllustrationBlock
                        url={p.illustration!.url}
                        alt={p.illustration!.alt}
                        layout={p.illustration!.layout}
                        isLightTheme={isLightTheme}
                      />
                    </div>
                    <div className="col-span-7">
                      {visibleParagraphs.map((item, idx) => renderSingleParagraph(item, idx))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Illustration at Top ('auto' or 'page-start') */}
                    {hasFlowIllustration && illusZone !== 'page-middle' && illusZone !== 'page-end' && (
                      <InlineIllustrationBlock
                        url={p.illustration!.url}
                        alt={p.illustration!.alt}
                        layout={p.illustration!.layout}
                        isLightTheme={isLightTheme}
                      />
                    )}

                    {/* First half of paragraphs */}
                    {visibleParagraphs
                      .slice(0, hasFlowIllustration && illusZone === 'page-middle' ? splitPoint : visibleParagraphs.length)
                      .map((item, idx) => renderSingleParagraph(item, idx))}

                    {/* Illustration in Middle ('page-middle') */}
                    {hasFlowIllustration && illusZone === 'page-middle' && (
                      <>
                        <InlineIllustrationBlock
                          url={p.illustration!.url}
                          alt={p.illustration!.alt}
                          layout={p.illustration!.layout}
                          isLightTheme={isLightTheme}
                        />
                        {visibleParagraphs
                          .slice(splitPoint)
                          .map((item, idx) => renderSingleParagraph(item, splitPoint + idx))}
                      </>
                    )}

                    {/* Illustration at End ('page-end') */}
                    {hasFlowIllustration && illusZone === 'page-end' && (
                      <InlineIllustrationBlock
                        url={p.illustration!.url}
                        alt={p.illustration!.alt}
                        layout={p.illustration!.layout}
                        isLightTheme={isLightTheme}
                      />
                    )}
                  </>
                )}

                {/* Footnotes Block */}
                {p.footnotes.length > 0 && (
                  <div className="mt-2.5 pt-2 pb-1.5 mb-1 border-t border-zinc-500/40 text-[14px] text-zinc-300 font-['PT_Serif',serif] clear-both shrink-0">
                    {p.footnotes.map((fn, fIdx) => (
                      <div key={fIdx} className="mb-0.5 leading-snug flex items-start gap-1.5">
                        <span className="text-rose-500 font-bold text-[14px] select-none shrink-0">•</span>
                        <span
                          className="text-[14px] leading-tight"
                          dangerouslySetInnerHTML={{ __html: formatParagraphText(fn) }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </div>

        {/* Bottom Footer Page Number & Signatures */}
        {!isHard && !hideFooters && (
          <div className="shrink-0 h-8 mt-1 pt-1.5 border-t border-zinc-500/40 flex items-center justify-between text-[14px] opacity-90 clear-both">
            <span className="font-mono font-bold text-[14px] text-zinc-300 tracking-wider shrink-0">
              {p.pageNumber}/{totalPages || p.pageNumber}
            </span>
            <span className="font-mono text-[14px] text-right whitespace-nowrap text-zinc-300 pl-2">
              {rightFooter || book.author || ''}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
