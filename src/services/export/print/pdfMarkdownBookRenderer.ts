import { jsPDF } from 'jspdf';
import { Book, Chapter, Character, ImageLayoutConfig } from '../../../types';
import {
  DpiCheckWarning,
  PRINT_FORMAT_PRESETS,
  PrintExportOptions,
  PrintExportProgress,
} from './printTypes';
import {
  collectDpiWarningIfNeeded,
  registerCyrillicPdfFonts,
  renderImageAt300Dpi,
} from './pdfAssetLoader';
import {
  RichWordToken,
  drawNoirAccentTitle,
  drawTrimCropMarks,
  getSafeFontStyle,
  parseInlineSpans,
  splitChapterContentToBlocks,
  tokenizeSpansToWords,
} from './pdfRichTextParser';

export interface BuiltBookInteriorResult {
  doc: jsPDF;
  totalPages: number;
  dpiWarnings: DpiCheckWarning[];
  tocEntries: Array<{ chapterNumber: number; title: string; pageNumber: number }>;
  options: PrintExportOptions;
}

export async function buildBookInteriorPdfDoc(
  book: Book,
  chapters: Chapter[],
  characters: Character[],
  options: PrintExportOptions,
  onProgress?: (p: PrintExportProgress) => void
): Promise<BuiltBookInteriorResult> {
  const preset = PRINT_FORMAT_PRESETS[options.format] || PRINT_FORMAT_PRESETS.a5;
  const trimW = preset.widthMm;
  const trimH = preset.heightMm;
  const bleedMm = options.includeBleed ? 3.0 : 0;
  const slugMm = options.includeCropMarks ? 6.0 : 0;
  const trimX = bleedMm + slugMm;
  const trimY = bleedMm + slugMm;
  const docW = trimW + (bleedMm + slugMm) * 2;
  const docH = trimH + (bleedMm + slugMm) * 2;

  const isNoirPaper = options.paperStyle === 'noir';
  const paperRgb: [number, number, number] =
    options.paperStyle === 'noir'
      ? [11, 11, 14]
      : options.paperStyle === 'cream'
      ? [250, 246, 236]
      : [255, 255, 255];
  const inkRgb: [number, number, number] = isNoirPaper ? [240, 240, 244] : [20, 20, 22];
  const mutedRgb: [number, number, number] = isNoirPaper ? [161, 161, 170] : [100, 100, 108];
  const crimsonRgb: [number, number, number] = isNoirPaper ? [244, 63, 94] : [190, 18, 60];

  const doc = new jsPDF({
    orientation: trimW > trimH ? 'landscape' : 'portrait',
    unit: 'mm',
    format: [docW, docH],
    compress: true,
  });

  onProgress?.({ stage: 'Загрузка кириллических шрифтов для печати...', percent: 8 });
  const fonts = await registerCyrillicPdfFonts(doc, options.fontId);
  const dpiWarnings: DpiCheckWarning[] = [];

  const lineMult = options.lineSpacing === 'compact' ? 1.32 : options.lineSpacing === 'relaxed' ? 1.65 : 1.46;
  const bodySizePt = Math.max(9.0, Math.min(13.5, options.fontSizePt || 10.5));
  const lineH = (bodySizePt * 0.352778) * lineMult;

  let currentPageIdx = 0;

  const paintPageShell = (opts?: { skipRunning?: boolean; printedNum?: number; chapterHeader?: string }) => {
    currentPageIdx++;
    if (currentPageIdx > 1) {
      doc.addPage([docW, docH], trimW > trimH ? 'landscape' : 'portrait');
    }

    // Fill bleed/trim background when cream or noir
    if (options.paperStyle !== 'white') {
      doc.setFillColor(paperRgb[0], paperRgb[1], paperRgb[2]);
      doc.rect(slugMm, slugMm, trimW + bleedMm * 2, trimH + bleedMm * 2, 'F');
    }

    if (options.includeCropMarks) {
      drawTrimCropMarks(doc, trimX, trimY, trimW, trimH, bleedMm);
    }

    const isOddPage = currentPageIdx % 2 === 1;
    const leftM = isOddPage ? preset.innerMarginMm : preset.outerMarginMm;
    const rightM = isOddPage ? preset.outerMarginMm : preset.innerMarginMm;
    const contentX = trimX + leftM;
    const contentW = trimW - leftM - rightM;
    const topY = trimY + preset.topMarginMm;
    const bottomY = trimY + trimH - preset.bottomMarginMm;

    if (!opts?.skipRunning) {
      doc.setFont(fonts.bodyFamily, getSafeFontStyle('italic', fonts));
      doc.setFontSize(8);
      doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);

      const headerTitle = (opts?.chapterHeader || book.running_header || book.title).slice(0, 56);
      const headerY = trimY + 10;
      if (isOddPage) {
        doc.text(headerTitle, contentX, headerY);
      } else {
        doc.text(book.author || 'KnigAI', contentX + contentW, headerY, { align: 'right' });
      }
      doc.setDrawColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
      doc.setLineWidth(0.15);
      doc.line(contentX, headerY + 2, contentX + contentW, headerY + 2);

      // Outer-aligned printed page folio
      if (opts?.printedNum != null) {
        doc.setFont(fonts.bodyFamily, getSafeFontStyle('bold', fonts));
        doc.setFontSize(8.5);
        doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);
        const footerY = trimY + trimH - 8.5;
        if (isOddPage) {
          doc.text(String(opts.printedNum), contentX + contentW, footerY, { align: 'right' });
        } else {
          doc.text(String(opts.printedNum), contentX, footerY);
        }
      }
    }

    return { contentX, contentW, topY, bottomY, isOddPage };
  };

  // 1. Title / Avant-title Page (Page 1)
  onProgress?.({ stage: 'Вёрстка титульного листа и выходных данных...', percent: 15 });
  {
    const { contentX, contentW } = paintPageShell({ skipRunning: true });
    const centerX = trimX + trimW / 2;

    doc.setFont(fonts.bodyFamily, 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
    doc.text(book.author || 'Автор KnigAI', centerX, trimY + 26, { align: 'center' });

    const titleLines = doc.splitTextToSize(book.title, contentW - 8);
    let titleY = trimY + 42;
    for (const line of titleLines.slice(0, 3)) {
      drawNoirAccentTitle(doc, line, centerX, titleY, 21, fonts, inkRgb, crimsonRgb, options.noirTitleAccents);
      titleY += 10;
    }

    if (book.subtitle) {
      doc.setFont(fonts.bodyFamily, getSafeFontStyle('italic', fonts));
      doc.setFontSize(11);
      doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
      const subLines = doc.splitTextToSize(book.subtitle, contentW - 10);
      doc.text(subLines.slice(0, 2), centerX, titleY + 2, { align: 'center' });
      titleY += subLines.length * 5.5 + 4;
    }

    if (options.includeFrontCoverPage && book.cover_config?.frontImageUrl) {
      const boxW = Math.min(contentW - 12, 82);
      const boxH = Math.min(95, trimH - (titleY - trimY) - 42);
      if (boxH >= 38) {
        const renderedCover = await renderImageAt300Dpi({
          url: book.cover_config.frontImageUrl,
          targetWidthMm: boxW,
          targetHeightMm: boxH,
          fitMode: 'cover',
          posX: book.cover_config.frontImagePos?.posX,
          posY: book.cover_config.frontImagePos?.posY,
          zoom: book.cover_config.frontImagePos?.zoom,
          filter: book.cover_config.imageFilter,
          colorTint: book.cover_config.colorTint,
        });
        if (renderedCover) {
          collectDpiWarningIfNeeded(
            dpiWarnings,
            'Титульная иллюстрация обложки',
            book.cover_config.frontImageUrl,
            renderedCover
          );
          const imgX = centerX - boxW / 2;
          const imgY = titleY + 6;
          doc.addImage(renderedCover.dataUrl, renderedCover.format, imgX, imgY, boxW, boxH);
          doc.setDrawColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
          doc.setLineWidth(0.35);
          doc.rect(imgX, imgY, boxW, boxH, 'S');
        }
      }
    }

    doc.setFont(fonts.bodyFamily, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
    const imprint = `${(book.genres || []).slice(0, 3).join(' · ')} · Печатное издание ${preset.widthMm}×${preset.heightMm} мм`;
    doc.text(imprint, centerX, trimY + trimH - 22, { align: 'center' });
    doc.text(`${new Date().getFullYear()}`, centerX, trimY + trimH - 16, { align: 'center' });
    void contentX;
  }

  // 2. Copyright & Imprint Page (Page 2)
  {
    const { contentX, contentW, topY, bottomY } = paintPageShell({ skipRunning: true });
    let y = topY + 6;

    doc.setFont(fonts.bodyFamily, getSafeFontStyle('bold', fonts));
    doc.setFontSize(10);
    doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);
    doc.text(book.author || 'Автор KnigAI', contentX, y);
    y += 6;

    doc.setFontSize(12);
    const tLines = doc.splitTextToSize(book.title, contentW);
    doc.text(tLines, contentX, y);
    y += tLines.length * 5.5 + 4;

    if (book.synopsis_overview) {
      doc.setFont(fonts.bodyFamily, 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);
      const synLines = doc.splitTextToSize(book.synopsis_overview, contentW);
      doc.text(synLines.slice(0, 18), contentX, y);
      y += Math.min(18, synLines.length) * 4.5 + 6;
    }

    doc.setFont(fonts.bodyFamily, 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
    const metaLines = [
      book.cover_config?.isbn ? `ISBN: ${book.cover_config.isbn}` : null,
      book.series_name ? `Серия: ${book.series_name}${book.series_order ? ` №${book.series_order}` : ''}` : null,
      `Жанры: ${(book.genres || []).join(', ') || 'Художественная литература'}`,
      `Формат блока: ${preset.label}`,
      `© ${book.author || 'Автор'}, ${new Date().getFullYear()}. Все права защищены.`,
    ].filter(Boolean) as string[];

    let footY = Math.max(y + 4, bottomY - metaLines.length * 4.5 - 4);
    for (const ml of metaLines) {
      doc.text(ml, contentX, footY);
      footY += 4.5;
    }
  }

  // 3. Reserve TOC Pages (exact count based on chapters.length) so page numbers never shift
  const tocPagesReserved = options.includeToc ? Math.max(1, Math.ceil(chapters.length / 26)) : 0;
  const tocPageIndices: number[] = [];
  for (let i = 0; i < tocPagesReserved; i++) {
    paintPageShell({ skipRunning: true });
    tocPageIndices.push(currentPageIdx);
  }

  // 4. Optional Characters Page(s) with visual cards
  if (options.includeCharactersPage && characters.length > 0) {
    let ctx = paintPageShell({ printedNum: currentPageIdx + 1, chapterHeader: 'Действующие лица' });
    let y = ctx.topY + 4;
    drawNoirAccentTitle(
      doc,
      'Персонажи книги',
      trimX + trimW / 2,
      y,
      15,
      fonts,
      inkRgb,
      crimsonRgb,
      options.noirTitleAccents
    );
    y += 10;

    for (const char of characters.slice(0, 14)) {
      if (y + 28 > ctx.bottomY) {
        ctx = paintPageShell({ printedNum: currentPageIdx + 1, chapterHeader: 'Действующие лица' });
        y = ctx.topY + 4;
      }

      let textX = ctx.contentX;
      let textW = ctx.contentW;
      let cardBottomY = y;

      if (char.visual_card_url) {
        const cardW = 20;
        const cardH = 25;
        const renderedCard = await renderImageAt300Dpi({
          url: char.visual_card_url,
          targetWidthMm: cardW,
          targetHeightMm: cardH,
          fitMode: 'cover',
        });
        if (renderedCard) {
          collectDpiWarningIfNeeded(dpiWarnings, `Персонаж: ${char.name}`, char.visual_card_url, renderedCard, 180);
          doc.addImage(renderedCard.dataUrl, renderedCard.format, ctx.contentX, y, cardW, cardH);
          doc.setDrawColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
          doc.setLineWidth(0.2);
          doc.rect(ctx.contentX, y, cardW, cardH, 'S');
          textX += cardW + 4;
          textW -= cardW + 4;
          cardBottomY = y + cardH;
        }
      }

      doc.setFont(fonts.bodyFamily, getSafeFontStyle('bold', fonts));
      doc.setFontSize(10.5);
      doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);
      doc.text(`${char.name}${char.role ? ` — ${char.role}` : ''}`, textX, y + 4);

      doc.setFont(fonts.bodyFamily, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
      const desc = doc.splitTextToSize((char.description || '').slice(0, 260), textW);
      doc.text(desc.slice(0, 4), textX, y + 9);

      y = Math.max(cardBottomY, y + 9 + Math.min(4, desc.length) * 4) + 5;
    }
  }

  // 5. Render Chapters with Illustrations, Markdown & Footnotes
  const tocEntries: Array<{ chapterNumber: number; title: string; pageNumber: number }> = [];

  for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
    const chap = chapters[cIdx];
    const progressPct = 20 + Math.round(((cIdx + 1) / Math.max(1, chapters.length)) * 68);
    onProgress?.({ stage: `Вёрстка главы ${chap.chapter_number}: ${chap.title.slice(0, 28)}...`, percent: progressPct });

    // Start each chapter on odd (recto) page if enabled
    if (options.startChaptersOnOddPage && (currentPageIdx + 1) % 2 === 0) {
      paintPageShell({ skipRunning: true });
    }

    let pageCtx = paintPageShell({
      printedNum: currentPageIdx + 1,
      chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
    });
    const chapterStartPage = currentPageIdx;
    tocEntries.push({ chapterNumber: chap.chapter_number, title: chap.title, pageNumber: chapterStartPage });

    // Check if chapter has a page-bg or full-page illustration
    const heroUrl = chap.illustration_url || '';
    const heroLayout: ImageLayoutConfig = chap.image_layout || { mode: 'full-width', scale: 85, filter: 'normal' };

    const applyPageBgIfConfigured = async () => {
      if (!heroUrl || heroLayout.mode !== 'page-bg') return;
      const bgImg = await renderImageAt300Dpi({
        url: heroUrl,
        targetWidthMm: trimW + bleedMm * 2,
        targetHeightMm: trimH + bleedMm * 2,
        fitMode: 'cover',
        filter: heroLayout.filter,
        colorTint: heroLayout.colorTint,
        opacity: Math.max(0.15, Math.min(0.45, (heroLayout.bgOpacity ?? 28) / 100)),
      });
      if (bgImg) {
        collectDpiWarningIfNeeded(dpiWarnings, `Фон главы ${chap.chapter_number}`, heroUrl, bgImg);
        doc.addImage(bgImg.dataUrl, bgImg.format, trimX - bleedMm, trimY - bleedMm, trimW + bleedMm * 2, trimH + bleedMm * 2);
      }
    };

    await applyPageBgIfConfigured();

    let cursorY = pageCtx.topY + 4;
    const centerX = trimX + trimW / 2;

    // Chapter Header
    drawNoirAccentTitle(
      doc,
      `Глава ${chap.chapter_number}`,
      centerX,
      cursorY,
      11,
      fonts,
      mutedRgb,
      crimsonRgb,
      options.noirTitleAccents
    );
    cursorY += 6;

    doc.setFont(fonts.headingFamily, 'normal');
    doc.setFontSize(16);
    const titleWrapped = doc.splitTextToSize(chap.title || `Глава ${chap.chapter_number}`, pageCtx.contentW - 4);
    for (const tl of titleWrapped.slice(0, 3)) {
      drawNoirAccentTitle(doc, tl, centerX, cursorY, 15.5, fonts, inkRgb, crimsonRgb, options.noirTitleAccents);
      cursorY += 7.5;
    }
    doc.setDrawColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
    doc.setLineWidth(0.45);
    doc.line(centerX - 12, cursorY - 2, centerX + 12, cursorY - 2);
    cursorY += 6;

    const rawText = chap.content || chap.synopsis || 'Текст главы в процессе подготовки...';
    const { blocks, footnotes } = splitChapterContentToBlocks(rawText);

    let activeWrapBox: { side: 'left' | 'right'; widthMm: number; bottomY: number } | null = null;
    let firstProseDone = false;

    const drawPictureBlock = async (
      imgUrl: string,
      layout: ImageLayoutConfig,
      altText: string
    ) => {
      const rendered = await renderImageAt300Dpi({
        url: imgUrl,
        targetWidthMm: pageCtx.contentW,
        fitMode: 'contain',
        filter: layout.filter,
        colorTint: layout.colorTint,
      });
      if (!rendered) return;
      collectDpiWarningIfNeeded(dpiWarnings, `Иллюстрация (гл. ${chap.chapter_number})`, imgUrl, rendered);

      const natAspect = rendered.naturalWidth / Math.max(1, rendered.naturalHeight);
      if (layout.pageZone === 'full-page') {
        const fullW = pageCtx.contentW;
        const fullH = Math.min(pageCtx.bottomY - pageCtx.topY - 12, fullW / natAspect);
        const drawW = fullH * natAspect;
        pageCtx = paintPageShell({
          printedNum: currentPageIdx + 1,
          chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
        });
        doc.addImage(
          rendered.dataUrl,
          rendered.format,
          pageCtx.contentX + (pageCtx.contentW - drawW) / 2,
          pageCtx.topY + 4,
          drawW,
          fullH
        );
        if (layout.caption) {
          doc.setFont(fonts.bodyFamily, getSafeFontStyle('italic', fonts));
          doc.setFontSize(8.5);
          doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
          doc.text(layout.caption, trimX + trimW / 2, pageCtx.topY + fullH + 9, { align: 'center' });
        }
        pageCtx = paintPageShell({
          printedNum: currentPageIdx + 1,
          chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
        });
        cursorY = pageCtx.topY + 2;
        return;
      }

      if (layout.mode === 'wrap-left' || layout.mode === 'wrap-right' || layout.mode === 'split-vertical') {
        const pct = Math.min(55, Math.max(32, layout.scale || 44)) / 100;
        const boxW = pageCtx.contentW * pct;
        const boxH = Math.min(82, boxW / natAspect);
        if (cursorY + boxH > pageCtx.bottomY - 12) {
          pageCtx = paintPageShell({
            printedNum: currentPageIdx + 1,
            chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
          });
          cursorY = pageCtx.topY + 2;
        }
        const side: 'left' | 'right' = layout.mode === 'wrap-right' ? 'right' : 'left';
        const imgX = side === 'left' ? pageCtx.contentX : pageCtx.contentX + pageCtx.contentW - boxW;
        doc.addImage(rendered.dataUrl, rendered.format, imgX, cursorY, boxW, boxH);
        doc.setDrawColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
        doc.setLineWidth(0.2);
        doc.rect(imgX, cursorY, boxW, boxH, 'S');
        activeWrapBox = { side, widthMm: boxW + 4, bottomY: cursorY + boxH + 2 };
        return;
      }

      // Full-width / header-break / photo-polaroid centered block
      const scaleFactor = Math.min(1, Math.max(0.45, (layout.scale || 85) / 100));
      let imgW = pageCtx.contentW * scaleFactor;
      let imgH = imgW / natAspect;
      const maxH = 85;
      if (imgH > maxH) {
        imgH = maxH;
        imgW = imgH * natAspect;
      }
      if (cursorY + imgH + 10 > pageCtx.bottomY) {
        pageCtx = paintPageShell({
          printedNum: currentPageIdx + 1,
          chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
        });
        cursorY = pageCtx.topY + 2;
      }
      const imgX = pageCtx.contentX + (pageCtx.contentW - imgW) / 2;
      doc.addImage(rendered.dataUrl, rendered.format, imgX, cursorY, imgW, imgH);
      doc.setDrawColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
      doc.setLineWidth(layout.mode === 'photo-polaroid' ? 0.5 : 0.2);
      doc.rect(imgX, cursorY, imgW, imgH, 'S');
      cursorY += imgH + 3;

      const cap = layout.caption || (altText && !altText.startsWith('Иллюстрация к главе') ? altText : '');
      if (cap) {
        doc.setFont(fonts.bodyFamily, getSafeFontStyle('italic', fonts));
        doc.setFontSize(8.5);
        doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
        doc.text(cap.slice(0, 90), trimX + trimW / 2, cursorY + 2, { align: 'center' });
        cursorY += 6;
      } else {
        cursorY += 3;
      }
    };

    // Draw chapter hero illustration (unless page-bg already drawn)
    if (heroUrl && heroLayout.mode !== 'page-bg' && heroLayout.pageZone !== 'full-page') {
      await drawPictureBlock(heroUrl, heroLayout, heroLayout.caption || `Иллюстрация к главе ${chap.chapter_number}`);
    }

    const footnoteReservedMm = footnotes.length > 0 ? Math.min(26, 6 + footnotes.length * 4) : 0;

    for (const block of blocks) {
      if (block.type === 'divider') {
        if (cursorY + 10 > pageCtx.bottomY - footnoteReservedMm) {
          pageCtx = paintPageShell({
            printedNum: currentPageIdx + 1,
            chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
          });
          cursorY = pageCtx.topY + 2;
          activeWrapBox = null;
        }
        doc.setFont(fonts.bodyFamily, 'normal');
        doc.setFontSize(11);
        doc.setTextColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
        doc.text('*   *   *', trimX + trimW / 2, cursorY + 3, { align: 'center' });
        cursorY += 8;
        continue;
      }

      if (block.type === 'image' && block.imageUrl) {
        activeWrapBox = null;
        await drawPictureBlock(block.imageUrl, block.imageLayout || { mode: 'full-width', scale: 85, filter: 'normal' }, block.imageAlt || '');
        continue;
      }

      if (block.type === 'heading' && block.text) {
        activeWrapBox = null;
        const hSize = block.level === 1 ? 13 : block.level === 2 ? 12 : 11;
        doc.setFont(fonts.bodyFamily, getSafeFontStyle('bold', fonts));
        doc.setFontSize(hSize);
        const hLines = doc.splitTextToSize(block.text, pageCtx.contentW);
        if (cursorY + hLines.length * 5.5 + 8 > pageCtx.bottomY - footnoteReservedMm) {
          pageCtx = paintPageShell({
            printedNum: currentPageIdx + 1,
            chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
          });
          cursorY = pageCtx.topY + 2;
        }
        cursorY += 3;
        doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);
        doc.text(hLines, pageCtx.contentX, cursorY);
        cursorY += hLines.length * 5.2 + 2.5;
        continue;
      }

      // Paragraph or quote
      const rawPara = (block.text || '').trim();
      if (!rawPara) continue;
      const isQuote = block.type === 'quote';
      const paraFontPt = isQuote ? Math.max(9, bodySizePt - 0.5) : bodySizePt;
      const spans = parseInlineSpans(rawPara);
      const words = tokenizeSpansToWords(doc, spans, fonts, paraFontPt);
      if (words.length === 0) continue;

      const indentMm = isQuote ? 6 : 5;
      const availWidthForLine = (yVal: number): { x: number; w: number } => {
        if (activeWrapBox && yVal <= activeWrapBox.bottomY) {
          if (activeWrapBox.side === 'left') {
            return {
              x: pageCtx.contentX + activeWrapBox.widthMm,
              w: Math.max(35, pageCtx.contentW - activeWrapBox.widthMm),
            };
          }
          return {
            x: pageCtx.contentX,
            w: Math.max(35, pageCtx.contentW - activeWrapBox.widthMm),
          };
        }
        activeWrapBox = null;
        return {
          x: pageCtx.contentX + (isQuote ? indentMm : 0),
          w: pageCtx.contentW - (isQuote ? indentMm : 0),
        };
      };

      // Render word by word across lines so wrapBox and page breaks stay 100% accurate
      doc.setFontSize(paraFontPt);
      doc.setFont(fonts.bodyFamily, 'normal');
      const spaceW = doc.getTextWidth(' ');

      let wordIdx = 0;
      let isFirstLineOfPara = true;

      // Optional drop-cap on very first prose paragraph without active wrap box
      if (!firstProseDone && !isQuote && !activeWrapBox && /^[А-Яа-яA-Za-zЁё]/.test(words[0].text)) {
        firstProseDone = true;
        const firstWord = words[0].text;
        const firstChar = Array.from(firstWord)[0];
        const restOfFirstWord = Array.from(firstWord).slice(1).join('');
        words[0] = {
          ...words[0],
          text: restOfFirstWord || ' ',
          width: restOfFirstWord ? doc.getTextWidth(restOfFirstWord) : 0,
        };
        if (!restOfFirstWord) wordIdx = 1;

        if (cursorY + lineH * 2.5 > pageCtx.bottomY - footnoteReservedMm) {
          pageCtx = paintPageShell({
            printedNum: currentPageIdx + 1,
            chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
          });
          cursorY = pageCtx.topY + 2;
        }
        doc.setFont(fonts.headingFamily, 'normal');
        doc.setFontSize(bodySizePt * 2.35);
        doc.setTextColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
        doc.text(firstChar.toUpperCase(), pageCtx.contentX, cursorY + lineH * 1.15);
        const dropW = Math.max(6.5, doc.getTextWidth(firstChar.toUpperCase()) + 1.8);
        activeWrapBox = { side: 'left', widthMm: dropW, bottomY: cursorY + lineH * 1.9 };
        isFirstLineOfPara = false;
      } else {
        firstProseDone = true;
      }

      while (wordIdx < words.length) {
        if (cursorY + lineH > pageCtx.bottomY - footnoteReservedMm) {
          pageCtx = paintPageShell({
            printedNum: currentPageIdx + 1,
            chapterHeader: `Глава ${chap.chapter_number}. ${chap.title}`,
          });
          cursorY = pageCtx.topY + 2;
          activeWrapBox = null;
        }

        const lineBox = availWidthForLine(cursorY);
        const firstIndent = isFirstLineOfPara && !isQuote && !activeWrapBox ? indentMm : 0;
        const lineStartX = lineBox.x + firstIndent;
        const maxLineW = Math.max(25, lineBox.w - firstIndent);

        const lineWords: RichWordToken[] = [];
        let accW = 0;
        while (wordIdx < words.length) {
          const wt = words[wordIdx];
          const needed = lineWords.length === 0 ? wt.width : spaceW + wt.width;
          if (lineWords.length > 0 && accW + needed > maxLineW) break;
          lineWords.push(wt);
          accW += needed;
          wordIdx++;
        }

        const isLastLine = wordIdx >= words.length;
        const gapCount = lineWords.length - 1;
        const extraSpace = !isLastLine && !isQuote && gapCount > 0 ? Math.min(2.2, (maxLineW - accW) / gapCount) : 0;

        if (isQuote) {
          doc.setDrawColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
          doc.setLineWidth(0.5);
          doc.line(pageCtx.contentX + 2, cursorY - 3, pageCtx.contentX + 2, cursorY + 1.2);
        }

        let drawX = lineStartX;
        for (let wi = 0; wi < lineWords.length; wi++) {
          const w = lineWords[wi];
          const styleToDraw: 'normal' | 'bold' | 'italic' | 'bolditalic' = isQuote
            ? getSafeFontStyle('italic', fonts)
            : w.style;
          doc.setFont(fonts.bodyFamily, styleToDraw);
          doc.setFontSize(paraFontPt);
          if (w.isCrimson) doc.setTextColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
          else doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);

          doc.text(w.text, drawX, cursorY);
          drawX += w.width + spaceW + extraSpace;
        }

        cursorY += lineH;
        isFirstLineOfPara = false;
      }

      cursorY += isQuote ? 2.8 : 1.6;
    }

    // Draw chapter footnotes cleanly at bottom of chapter's last page
    if (footnotes.length > 0) {
      let fnY = Math.max(cursorY + 3, pageCtx.bottomY - footnotes.length * 4 - 4);
      if (fnY + footnotes.length * 4 > trimY + trimH - 12) {
        pageCtx = paintPageShell({
          printedNum: currentPageIdx + 1,
          chapterHeader: `Примечания · Глава ${chap.chapter_number}`,
        });
        fnY = pageCtx.topY + 4;
      }
      doc.setDrawColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
      doc.setLineWidth(0.2);
      doc.line(pageCtx.contentX, fnY - 2, pageCtx.contentX + 32, fnY - 2);
      doc.setFont(fonts.bodyFamily, 'normal');
      doc.setFontSize(8.2);
      doc.setTextColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
      for (const fn of footnotes.slice(0, 6)) {
        const fnLines = doc.splitTextToSize(fn, pageCtx.contentW);
        doc.text(fnLines.slice(0, 2), pageCtx.contentX, fnY + 1);
        fnY += Math.min(2, fnLines.length) * 3.6 + 1;
      }
    }

    // Full-page chapter illustration at end if pageZone === 'full-page'
    if (heroUrl && heroLayout.pageZone === 'full-page') {
      await drawPictureBlock(heroUrl, heroLayout, heroLayout.caption || `Иллюстрация к главе ${chap.chapter_number}`);
    }
  }

  // 6. Populate Reserved Table of Contents Pages with exact printed page numbers
  if (tocPageIndices.length > 0) {
    const perPage = 26;
    tocPageIndices.forEach((docPageNum, tIdx) => {
      doc.setPage(docPageNum);
      const isOdd = docPageNum % 2 === 1;
      const leftM = isOdd ? preset.innerMarginMm : preset.outerMarginMm;
      const rightM = isOdd ? preset.outerMarginMm : preset.innerMarginMm;
      const cX = trimX + leftM;
      const cW = trimW - leftM - rightM;
      let y = trimY + preset.topMarginMm + 4;

      if (tIdx === 0) {
        drawNoirAccentTitle(
          doc,
          'Содержание',
          trimX + trimW / 2,
          y,
          15,
          fonts,
          inkRgb,
          crimsonRgb,
          options.noirTitleAccents
        );
        y += 10;
      }

      const slice = tocEntries.slice(tIdx * perPage, (tIdx + 1) * perPage);
      doc.setFontSize(9.5);
      for (const item of slice) {
        const label = `Глава ${item.chapterNumber}. ${item.title}`.slice(0, 52);
        const pageStr = String(item.pageNumber);
        doc.setFont(fonts.bodyFamily, 'normal');
        doc.setTextColor(inkRgb[0], inkRgb[1], inkRgb[2]);
        doc.text(label, cX, y);
        doc.setFont(fonts.bodyFamily, getSafeFontStyle('bold', fonts));
        doc.text(pageStr, cX + cW, y, { align: 'right' });

        doc.setDrawColor(mutedRgb[0], mutedRgb[1], mutedRgb[2]);
        doc.setLineWidth(0.1);
        const labelW = doc.getTextWidth(label) + 2;
        const numW = doc.getTextWidth(pageStr) + 2;
        if (cX + labelW < cX + cW - numW) {
          doc.line(cX + labelW, y, cX + cW - numW, y);
        }
        y += 6.2;
      }
    });
  }

  // Return to last page & enforce even page count for printing signatures
  doc.setPage(currentPageIdx);
  if (currentPageIdx % 2 !== 0) {
    paintPageShell({ skipRunning: true });
  }

  onProgress?.({ stage: 'Вёрстка книжного блока завершена', percent: 92 });
  return {
    doc,
    totalPages: currentPageIdx,
    dpiWarnings,
    tocEntries,
    options,
  };
}
