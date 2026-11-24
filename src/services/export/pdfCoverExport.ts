import { jsPDF } from 'jspdf';
import { BookCoverConfig, CoverImageLayer } from '../../types';
import { getUploadService } from '../upload/FileUploadService';
import { getOrCreateBookFolder } from '../db/fileStorageRepository';
import {
  DpiCheckWarning,
  PrintBindingType,
  PrintFormatId,
  computePrintCoverSpecs,
} from './print/printTypes';
import {
  RegisteredPdfFonts,
  collectDpiWarningIfNeeded,
  drawEan13BarcodeVector,
  registerCyrillicPdfFonts,
  renderImageAt300Dpi,
} from './print/pdfAssetLoader';

export function calculateSpineWidthMm(pageCount: number, paperType: 'cream' | 'white'): number {
  const specs = computePrintCoverSpecs(pageCount, paperType, 'a5', 'soft_kbs', true, false);
  return specs.spineWidthMm;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = (hex || '').replace('#', '').trim();
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16) || 24,
      parseInt(clean.slice(2, 4), 16) || 24,
      parseInt(clean.slice(4, 6), 16) || 27,
    ];
  }
  return [24, 24, 27];
}

function drawCoverCropAndFoldMarks(
  doc: jsPDF,
  trimLeft: number,
  trimTop: number,
  trimW: number,
  trimH: number,
  backW: number,
  hingeMm: number,
  spineW: number,
  bleedMm: number
): void {
  const gap = Math.max(1.5, bleedMm + 0.6);
  const len = 4.2;
  doc.setDrawColor(80, 80, 90);
  doc.setLineWidth(0.2);

  // Outer trim crop marks (drawn STRICTLY outside trim + bleed)
  doc.line(trimLeft - gap - len, trimTop, trimLeft - gap, trimTop);
  doc.line(trimLeft, trimTop - gap - len, trimLeft, trimTop - gap);

  doc.line(trimLeft + trimW + gap, trimTop, trimLeft + trimW + gap + len, trimTop);
  doc.line(trimLeft + trimW, trimTop - gap - len, trimLeft + trimW, trimTop - gap);

  doc.line(trimLeft - gap - len, trimTop + trimH, trimLeft - gap, trimTop + trimH);
  doc.line(trimLeft, trimTop + trimH + gap, trimLeft, trimTop + trimH + gap + len);

  doc.line(trimLeft + trimW + gap, trimTop + trimH, trimLeft + trimW + gap + len, trimTop + trimH);
  doc.line(trimLeft + trimW, trimTop + trimH + gap, trimLeft + trimW, trimTop + trimH + gap + len);

  // Spine crease/fold marks outside top & bottom trim edges
  const foldLinesX = [
    trimLeft + backW,
    trimLeft + backW + hingeMm,
    trimLeft + backW + hingeMm + spineW,
    trimLeft + backW + hingeMm * 2 + spineW,
  ];
  doc.setDrawColor(190, 18, 60);
  for (const fx of foldLinesX) {
    doc.line(fx, trimTop - gap - len, fx, trimTop - gap);
    doc.line(fx, trimTop + trimH + gap, fx, trimTop + trimH + gap + len);
  }
}

async function drawCoverLayerToPdf(
  doc: jsPDF,
  layer: CoverImageLayer,
  wrapCenterX: number,
  wrapCenterY: number,
  pxToMmX: number,
  pxToMmY: number,
  dpiWarnings: DpiCheckWarning[]
): Promise<void> {
  if (!layer.visible || !layer.url) return;
  const targetWidthMm = Math.max(8, layer.widthPx * (layer.scale / 100) * pxToMmX);
  const rendered = await renderImageAt300Dpi({
    url: layer.url,
    targetWidthMm,
    fitMode: 'contain',
    transparent: true,
    opacity: layer.opacity / 100,
    rotationDeg: layer.rotation,
    flipX: layer.flipX,
    filter: layer.filter,
  });
  if (!rendered) return;
  collectDpiWarningIfNeeded(dpiWarnings, `Слой обложки «${layer.name}»`, layer.url, rendered, 180);

  const aspect = rendered.naturalWidth / Math.max(1, rendered.naturalHeight);
  const finalW = targetWidthMm;
  const finalH = finalW / Math.max(0.1, aspect);
  const centerX = wrapCenterX + layer.x * pxToMmX;
  const centerY = wrapCenterY + layer.y * pxToMmY;

  doc.addImage(
    rendered.dataUrl,
    'PNG',
    centerX - finalW / 2,
    centerY - finalH / 2,
    finalW,
    finalH
  );
}

function drawAlignedCoverText(params: {
  doc: jsPDF;
  fonts: RegisteredPdfFonts;
  text: string;
  panelLeftMm: number;
  panelWidthMm: number;
  baseY: number;
  offsetXpx: number;
  offsetYpx: number;
  pxToMmX: number;
  pxToMmY: number;
  fontSizePx: number;
  widthPercent?: number;
  alignH?: 'left' | 'center' | 'right' | 'justify';
  bold?: boolean;
  color: [number, number, number];
}): void {
  const {
    doc,
    fonts,
    text,
    panelLeftMm,
    panelWidthMm,
    baseY,
    offsetXpx,
    offsetYpx,
    pxToMmX,
    pxToMmY,
    fontSizePx,
    widthPercent = 100,
    alignH = 'left',
    bold = false,
    color,
  } = params;

  if (!text.trim()) return;
  const padMm = 11;
  const availPanelW = Math.max(20, panelWidthMm - padMm * 2);
  const boxW = Math.max(20, (availPanelW * Math.min(100, Math.max(30, widthPercent))) / 100);
  const xStart = panelLeftMm + padMm + offsetXpx * pxToMmX;
  const yStart = baseY + offsetYpx * pxToMmY;

  const fontStyle = bold && fonts.hasBold ? 'bold' : 'normal';
  doc.setFont(fonts.bodyFamily, fontStyle);
  // Preview panel is 300px wide ~ 148mm -> fontScale ~ 0.85pt per CSS px feels faithful in print
  const fontPt = Math.max(7.5, Math.min(34, fontSizePx * 0.82));
  doc.setFontSize(fontPt);
  doc.setTextColor(color[0], color[1], color[2]);

  const lines = doc.splitTextToSize(text, boxW);
  const lineH = fontPt * 0.352778 * 1.25;
  const anchorX =
    alignH === 'center' ? xStart + boxW / 2 : alignH === 'right' ? xStart + boxW : xStart;
  const alignArg: 'left' | 'center' | 'right' =
    alignH === 'center' ? 'center' : alignH === 'right' ? 'right' : 'left';

  lines.forEach((ln: string, idx: number) => {
    doc.text(ln, anchorX, yStart + idx * lineH, { align: alignArg });
  });
}

export interface BuildPrintCoverOptions {
  format?: PrintFormatId;
  binding?: PrintBindingType;
  includeBleed?: boolean;
  includeCropMarks?: boolean;
}

export async function buildPrintCoverPdfDoc(
  cover: BookCoverConfig,
  bookTitle: string,
  author: string,
  pageCount: number,
  options?: BuildPrintCoverOptions
): Promise<{
  doc: jsPDF;
  specs: ReturnType<typeof computePrintCoverSpecs>;
  dpiWarnings: DpiCheckWarning[];
}> {
  const format = options?.format || 'a5';
  const binding = options?.binding || 'soft_kbs';
  const includeBleed = options?.includeBleed !== false;
  const includeCropMarks = options?.includeCropMarks !== false;

  const specs = computePrintCoverSpecs(
    pageCount,
    cover.paperType || 'cream',
    format,
    binding,
    includeBleed,
    includeCropMarks
  );
  const layout = cover.textLayout || {};
  const dpiWarnings: DpiCheckWarning[] = [];

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [specs.totalDocWidthMm, specs.totalDocHeightMm],
    compress: true,
  });

  const fonts = await registerCyrillicPdfFonts(doc, 'pt-serif');

  const trimLeft = specs.slugMm + specs.bleedMm;
  const trimTop = specs.slugMm + specs.bleedMm;
  const bleedLeft = specs.slugMm;
  const bleedTop = specs.slugMm;
  const bleedW = specs.totalTrimWidthMm + specs.bleedMm * 2;
  const bleedH = specs.totalTrimHeightMm + specs.bleedMm * 2;

  const backLeft = trimLeft;
  const spineLeft = backLeft + specs.trimWidthMm + specs.hingeMm;
  const frontLeft = spineLeft + specs.spineWidthMm + specs.hingeMm;

  // Map CoverWrapPreview pixel space (back 300px, spine max(44, spine*3.5)px, front 300px) -> mm
  const previewSpinePx = Math.max(44, specs.spineWidthMm * 3.5);
  const previewWrapW = 300 + previewSpinePx + 300;
  const previewWrapH = Math.round(300 * (specs.trimHeightMm / specs.trimWidthMm));
  const pxToMmX = specs.totalTrimWidthMm / previewWrapW;
  const pxToMmY = specs.totalTrimHeightMm / previewWrapH;
  const panelPxToMmX = specs.trimWidthMm / 300;

  const spineRgb = hexToRgb(cover.spineColor || '#18181b');
  const backRgb = hexToRgb(cover.backColor || cover.spineColor || '#18181b');

  // Base background across full bleed area (so no white edge on cut)
  doc.setFillColor(12, 12, 15);
  doc.rect(bleedLeft, bleedTop, bleedW, bleedH, 'F');

  doc.setFillColor(backRgb[0], backRgb[1], backRgb[2]);
  doc.rect(bleedLeft, bleedTop, specs.trimWidthMm + specs.hingeMm + specs.bleedMm, bleedH, 'F');

  doc.setFillColor(spineRgb[0], spineRgb[1], spineRgb[2]);
  doc.rect(spineLeft - specs.hingeMm, bleedTop, specs.spineWidthMm + specs.hingeMm * 2, bleedH, 'F');

  // 1. Optional Full Horizontal Wrap Image (stretched across bleed area at 300 DPI)
  if (cover.fullWrapImageUrl) {
    const wrapImg = await renderImageAt300Dpi({
      url: cover.fullWrapImageUrl,
      targetWidthMm: bleedW,
      targetHeightMm: bleedH,
      fitMode: 'cover',
      posX: cover.fullWrapImagePos?.posX,
      posY: cover.fullWrapImagePos?.posY,
      zoom: cover.fullWrapImagePos?.zoom,
      filter: cover.imageFilter,
      colorTint: cover.colorTint,
      darkOverlayAlpha: 0.32,
    });
    if (wrapImg) {
      collectDpiWarningIfNeeded(dpiWarnings, 'Панорамный разворот обложки', cover.fullWrapImageUrl, wrapImg);
      doc.addImage(wrapImg.dataUrl, wrapImg.format, bleedLeft, bleedTop, bleedW, bleedH);
    }
  }

  // 2. Separate Back Image (extending into left/top/bottom bleed)
  if (cover.backImageUrl) {
    const backImgW = specs.trimWidthMm + specs.bleedMm;
    const backImg = await renderImageAt300Dpi({
      url: cover.backImageUrl,
      targetWidthMm: backImgW,
      targetHeightMm: bleedH,
      fitMode: 'cover',
      posX: cover.backImagePos?.posX,
      posY: cover.backImagePos?.posY,
      zoom: cover.backImagePos?.zoom,
      filter: cover.imageFilter,
      colorTint: cover.colorTint,
      darkOverlayAlpha: 0.38,
    });
    if (backImg) {
      collectDpiWarningIfNeeded(dpiWarnings, 'Задняя сторона обложки', cover.backImageUrl, backImg);
      doc.addImage(backImg.dataUrl, backImg.format, bleedLeft, bleedTop, backImgW, bleedH);
    }
  }

  // 3. Separate Front Image (extending into right/top/bottom bleed)
  if (cover.frontImageUrl) {
    const frontImgW = specs.trimWidthMm + specs.bleedMm;
    const frontImg = await renderImageAt300Dpi({
      url: cover.frontImageUrl,
      targetWidthMm: frontImgW,
      targetHeightMm: bleedH,
      fitMode: 'cover',
      posX: cover.frontImagePos?.posX,
      posY: cover.frontImagePos?.posY,
      zoom: cover.frontImagePos?.zoom,
      filter: cover.imageFilter,
      colorTint: cover.colorTint,
      darkOverlayAlpha: 0.34,
    });
    if (frontImg) {
      collectDpiWarningIfNeeded(dpiWarnings, 'Лицевая обложка', cover.frontImageUrl, frontImg);
      doc.addImage(frontImg.dataUrl, frontImg.format, frontLeft, bleedTop, frontImgW, bleedH);
    }
  }

  const wrapCenterX = trimLeft + specs.totalTrimWidthMm / 2;
  const wrapCenterY = trimTop + specs.totalTrimHeightMm / 2;
  const layers = (cover.layers || []).filter((l) => l.visible);
  const bgLayers = layers.filter((l) => l.zIndex < 20).sort((a, b) => a.zIndex - b.zIndex);
  const fgLayers = layers.filter((l) => l.zIndex >= 20).sort((a, b) => a.zIndex - b.zIndex);

  for (const layer of bgLayers) {
    await drawCoverLayerToPdf(doc, layer, wrapCenterX, wrapCenterY, pxToMmX, pxToMmY, dpiWarnings);
  }

  // Subtle decorative spine hairlines only when fullWrapImageUrl is NOT continuous (kept inset from bleed)
  if (!cover.fullWrapImageUrl) {
    doc.setDrawColor(63, 63, 70);
    doc.setLineWidth(0.2);
    doc.line(spineLeft, trimTop, spineLeft, trimTop + specs.trimHeightMm);
    doc.line(spineLeft + specs.spineWidthMm, trimTop, spineLeft + specs.spineWidthMm, trimTop + specs.trimHeightMm);
  }

  // Branding on spine unless hidden
  if (!cover.hideBranding) {
    doc.setFont(fonts.bodyFamily, fonts.hasBold ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(220, 220, 230);
    doc.text('KnigAI', spineLeft + specs.spineWidthMm / 2, trimTop + 14, { angle: 90 });
    doc.text(format.toUpperCase(), spineLeft + specs.spineWidthMm / 2, trimTop + specs.trimHeightMm - 10, { angle: 90 });
  }

  // Spine Title & Author (vertical)
  const spineCenterX = spineLeft + specs.spineWidthMm / 2 + ((layout.spineTitleOffsetX ?? 0) * pxToMmX);
  const spineBaseY = trimTop + specs.trimHeightMm * 0.25 + ((layout.spineTitleOffsetY ?? layout.spineOffsetY ?? 0) * pxToMmY);
  if (!layout.spineTitleHidden) {
    doc.setFont(fonts.bodyFamily, fonts.hasBold ? 'bold' : 'normal');
    const sFontPt = Math.min(specs.spineWidthMm * 1.9, (layout.spineTitleFontSize ?? layout.spineFontSize ?? 13) * 0.78);
    doc.setFontSize(Math.max(6.5, sFontPt));
    doc.setTextColor(255, 255, 255);
    doc.text((cover.frontTitle || bookTitle).slice(0, 60), spineCenterX + 1.5, spineBaseY, { angle: -90 });
  }
  if (!layout.spineAuthorHidden) {
    doc.setFont(fonts.bodyFamily, 'normal');
    const aFontPt = Math.min(specs.spineWidthMm * 1.7, (layout.spineAuthorFontSize ?? 12) * 0.75);
    doc.setFontSize(Math.max(6, aFontPt));
    doc.setTextColor(212, 212, 216);
    doc.text(
      (cover.authorName || author).slice(0, 40),
      spineLeft + specs.spineWidthMm / 2 + ((layout.spineAuthorOffsetX ?? 0) * pxToMmX) + 1.5,
      trimTop + specs.trimHeightMm * 0.62 + ((layout.spineAuthorOffsetY ?? 0) * pxToMmY),
      { angle: -90 }
    );
  }

  // FRONT COVER BLOCKS (using exact offsets & alignments from CoverWrapPreview)
  if (!layout.genreHidden && cover.genreLabel) {
    drawAlignedCoverText({
      doc,
      fonts,
      text: cover.genreLabel,
      panelLeftMm: frontLeft,
      panelWidthMm: specs.trimWidthMm,
      baseY: trimTop + 16,
      offsetXpx: layout.genreOffsetX ?? 0,
      offsetYpx: layout.genreOffsetY ?? 0,
      pxToMmX: panelPxToMmX,
      pxToMmY,
      fontSizePx: layout.genreFontSize ?? 14,
      widthPercent: layout.genreContainerWidth ?? 100,
      alignH: layout.genreAlignH || 'left',
      color: [220, 220, 228],
    });
  }

  if (!layout.authorHidden) {
    drawAlignedCoverText({
      doc,
      fonts,
      text: cover.authorName || author,
      panelLeftMm: frontLeft,
      panelWidthMm: specs.trimWidthMm,
      baseY: trimTop + 26,
      offsetXpx: layout.authorOffsetX ?? 0,
      offsetYpx: layout.authorOffsetY ?? 0,
      pxToMmX: panelPxToMmX,
      pxToMmY,
      fontSizePx: layout.authorFontSize ?? 15,
      widthPercent: layout.authorContainerWidth ?? 100,
      alignH: layout.authorAlignH || 'left',
      bold: true,
      color: [255, 255, 255],
    });
  }

  if (!layout.titleHidden) {
    drawAlignedCoverText({
      doc,
      fonts,
      text: cover.frontTitle || bookTitle,
      panelLeftMm: frontLeft,
      panelWidthMm: specs.trimWidthMm,
      baseY: trimTop + specs.trimHeightMm - 58,
      offsetXpx: layout.titleOffsetX ?? 0,
      offsetYpx: layout.titleOffsetY ?? 0,
      pxToMmX: panelPxToMmX,
      pxToMmY,
      fontSizePx: layout.titleFontSize ?? 22,
      widthPercent: layout.titleContainerWidth ?? 100,
      alignH: layout.titleAlignH || 'left',
      bold: true,
      color: [255, 255, 255],
    });
  }

  if (!layout.subtitleHidden && cover.frontSubtitle) {
    drawAlignedCoverText({
      doc,
      fonts,
      text: cover.frontSubtitle,
      panelLeftMm: frontLeft,
      panelWidthMm: specs.trimWidthMm,
      baseY: trimTop + specs.trimHeightMm - 32,
      offsetXpx: layout.subtitleOffsetX ?? 0,
      offsetYpx: layout.subtitleOffsetY ?? 0,
      pxToMmX: panelPxToMmX,
      pxToMmY,
      fontSizePx: layout.subtitleFontSize ?? 14,
      widthPercent: layout.subtitleContainerWidth ?? 100,
      alignH: layout.subtitleAlignH || 'left',
      color: [212, 212, 216],
    });
  }

  // BACK COVER BLOCKS
  if (!layout.backGenreHidden && cover.genreLabel) {
    drawAlignedCoverText({
      doc,
      fonts,
      text: cover.genreLabel,
      panelLeftMm: backLeft,
      panelWidthMm: specs.trimWidthMm,
      baseY: trimTop + 16,
      offsetXpx: layout.backGenreOffsetX ?? 0,
      offsetYpx: layout.backGenreOffsetY ?? 0,
      pxToMmX: panelPxToMmX,
      pxToMmY,
      fontSizePx: layout.backGenreFontSize ?? 14,
      widthPercent: layout.backGenreContainerWidth ?? 100,
      alignH: layout.backGenreAlignH || 'left',
      color: [212, 212, 216],
    });
  }

  doc.setFont(fonts.bodyFamily, fonts.hasBold ? 'bold' : 'normal');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  const backTitleLines = doc.splitTextToSize(cover.frontTitle || bookTitle, specs.trimWidthMm - 22);
  doc.text(backTitleLines.slice(0, 2), backLeft + 11, trimTop + 28);

  if (!layout.blurbHidden) {
    drawAlignedCoverText({
      doc,
      fonts,
      text: cover.backBlurb || 'Издание KnigAI. Полный текст и иллюстрации.',
      panelLeftMm: backLeft,
      panelWidthMm: specs.trimWidthMm,
      baseY: trimTop + 42,
      offsetXpx: layout.blurbOffsetX ?? 0,
      offsetYpx: layout.blurbOffsetY ?? 0,
      pxToMmX: panelPxToMmX,
      pxToMmY,
      fontSizePx: layout.blurbFontSize ?? 14,
      widthPercent: layout.blurbContainerWidth ?? 100,
      alignH: layout.blurbAlignH || 'left',
      color: [228, 228, 231],
    });
  }

  // Back Barcode + Vector EAN-13 Box
  const boxW = 54;
  const boxH = 24;
  const boxX = backLeft + 11;
  const boxY = trimTop + specs.trimHeightMm - 34;
  doc.setFillColor(255, 255, 255);
  doc.rect(boxX, boxY, boxW, boxH, 'F');
  doc.setFont(fonts.bodyFamily, fonts.hasBold ? 'bold' : 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`ISBN ${cover.isbn || '978-5-00-184920-4'}`, boxX + 3, boxY + 5);
  drawEan13BarcodeVector(doc, cover.isbn || '9785001849204', boxX + 5, boxY + 7.5, boxW - 10, 14);

  // Foreground PNG layers on top
  for (const layer of fgLayers) {
    await drawCoverLayerToPdf(doc, layer, wrapCenterX, wrapCenterY, pxToMmX, pxToMmY, dpiWarnings);
  }

  // External crop & fold marks in slug zone (strictly outside print trim)
  if (includeCropMarks) {
    drawCoverCropAndFoldMarks(
      doc,
      trimLeft,
      trimTop,
      specs.totalTrimWidthMm,
      specs.totalTrimHeightMm,
      specs.trimWidthMm,
      specs.hingeMm,
      specs.spineWidthMm,
      specs.bleedMm
    );
  }

  return { doc, specs, dpiWarnings };
}

export async function exportCoverToPdf(
  cover: BookCoverConfig,
  bookTitle: string,
  author: string,
  pageCount: number,
  bookId?: number,
  userUid?: number,
  options?: BuildPrintCoverOptions
): Promise<{ downloadUrl?: string; filename: string; dpiWarnings?: DpiCheckWarning[] }> {
  const { doc, specs, dpiWarnings } = await buildPrintCoverPdfDoc(cover, bookTitle, author, pageCount, options);
  const tag = specs.binding === 'hard_7bc' ? '7BC' : 'KBS';
  const filename = `${bookTitle.replace(/[^\w\u0400-\u04FF]/gi, '_')}_Cover_${specs.format.toUpperCase()}_${tag}.pdf`;
  doc.save(filename);

  let downloadUrl: string | undefined;
  try {
    const pdfBlob = doc.output('blob');
    const uploader = getUploadService();
    let folderId: number | null = null;
    if (bookId) {
      const folder = await getOrCreateBookFolder(bookId, bookTitle, userUid);
      folderId = folder.id;
    }
    const fileRecord = await uploader.uploadFromBlob(pdfBlob, filename, folderId);
    downloadUrl = fileRecord.original_url || fileRecord.short_url;
  } catch (err) {
    console.warn('Auto upload cover PDF to gallery error:', err);
  }

  return { downloadUrl, filename, dpiWarnings };
}
