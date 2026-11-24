import { jsPDF } from 'jspdf';
import { ImageLayoutConfig } from '../../../types';
import { detectStandaloneMarkdownImage } from '../../../components/reader/hooks/pageIllustrationParser';
import { RegisteredPdfFonts } from './pdfAssetLoader';

export interface RichSpan {
  text: string;
  style: 'normal' | 'bold' | 'italic' | 'bolditalic';
  isCrimson?: boolean;
}

export interface RichWordToken {
  text: string;
  style: 'normal' | 'bold' | 'italic' | 'bolditalic';
  isCrimson?: boolean;
  width: number;
}

export interface ParsedBlock {
  type: 'heading' | 'paragraph' | 'quote' | 'divider' | 'image';
  level?: number;
  text?: string;
  imageUrl?: string;
  imageAlt?: string;
  imageLayout?: ImageLayoutConfig;
}

export function getSafeFontStyle(
  requested: 'normal' | 'bold' | 'italic' | 'bolditalic',
  fonts: RegisteredPdfFonts
): 'normal' | 'bold' | 'italic' | 'bolditalic' {
  if (requested === 'bolditalic') {
    if (fonts.hasBoldItalic) return 'bolditalic';
    if (fonts.hasBold) return 'bold';
    if (fonts.hasItalic) return 'italic';
    return 'normal';
  }
  if (requested === 'bold') return fonts.hasBold ? 'bold' : 'normal';
  if (requested === 'italic') return fonts.hasItalic ? 'italic' : 'normal';
  return 'normal';
}

export function parseInlineSpans(raw: string): RichSpan[] {
  const cleaned = raw
    .replace(/(?<!!)\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1');

  const spans: RichSpan[] = [];
  const regex = /(\*\*\*[^*]+\*\*\*|\*\*[^*]+\*\*|\*[^*\n]+\*|\[\^?\d+\])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > lastIndex) {
      spans.push({ text: cleaned.slice(lastIndex, match.index), style: 'normal' });
    }
    const token = match[0];
    if (token.startsWith('***') && token.endsWith('***')) {
      spans.push({ text: token.slice(3, -3), style: 'bolditalic' });
    } else if (token.startsWith('**') && token.endsWith('**')) {
      spans.push({ text: token.slice(2, -2), style: 'bold' });
    } else if (token.startsWith('*') && token.endsWith('*')) {
      spans.push({ text: token.slice(1, -1), style: 'italic' });
    } else if (token.startsWith('[')) {
      spans.push({ text: token, style: 'bold', isCrimson: true });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < cleaned.length) {
    spans.push({ text: cleaned.slice(lastIndex), style: 'normal' });
  }
  return spans.length > 0 ? spans : [{ text: cleaned, style: 'normal' }];
}

export function tokenizeSpansToWords(
  doc: jsPDF,
  spans: RichSpan[],
  fonts: RegisteredPdfFonts,
  fontSizePt: number
): RichWordToken[] {
  const words: RichWordToken[] = [];
  doc.setFontSize(fontSizePt);

  for (const span of spans) {
    const parts = span.text.split(/(\s+)/);
    const fontStyle = getSafeFontStyle(span.style, fonts);
    doc.setFont(fonts.bodyFamily, fontStyle);

    for (const part of parts) {
      if (!part || /^\s+$/.test(part)) continue;
      words.push({
        text: part,
        style: fontStyle,
        isCrimson: span.isCrimson,
        width: doc.getTextWidth(part),
      });
    }
  }
  return words;
}

export function splitChapterContentToBlocks(rawContent: string): {
  blocks: ParsedBlock[];
  footnotes: string[];
} {
  const chunks = (rawContent || '')
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);

  const blocks: ParsedBlock[] = [];
  const footnotes: string[] = [];

  for (const chunk of chunks) {
    const fnMatch =
      chunk.match(/^(\[\^?\d+\]|\*{1,3}\d*|\d+\.)\s+(.+)/s) ||
      chunk.match(/^(Сноска|Примечание|Прим\.|Ред\.):\s*(.+)/is);
    if (fnMatch && chunk.length < 420 && !/^#{1,3}\s/.test(chunk)) {
      footnotes.push(chunk);
      continue;
    }

    const standaloneImg = detectStandaloneMarkdownImage(chunk);
    if (standaloneImg) {
      blocks.push({
        type: 'image',
        imageUrl: standaloneImg.url,
        imageAlt: standaloneImg.alt,
        imageLayout: standaloneImg.layoutConfig,
      });
      continue;
    }

    if (/^(\*{3,}|-{3,}|_{3,}|===+)$/.test(chunk)) {
      blocks.push({ type: 'divider' });
      continue;
    }

    const headingMatch = chunk.match(/^(#{1,3})\s+(.+)$/s);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].replace(/\n+/g, ' ').trim(),
      });
      continue;
    }

    if (chunk.startsWith('>')) {
      blocks.push({
        type: 'quote',
        text: chunk.replace(/^>\s?/gm, '').trim(),
      });
      continue;
    }

    const lines = chunk.split('\n');
    let textBuffer: string[] = [];
    for (const ln of lines) {
      const lineImg = detectStandaloneMarkdownImage(ln.trim());
      if (lineImg) {
        if (textBuffer.length > 0) {
          blocks.push({ type: 'paragraph', text: textBuffer.join(' ').trim() });
          textBuffer = [];
        }
        blocks.push({
          type: 'image',
          imageUrl: lineImg.url,
          imageAlt: lineImg.alt,
          imageLayout: lineImg.layoutConfig,
        });
      } else {
        textBuffer.push(ln.trim());
      }
    }
    if (textBuffer.length > 0) {
      blocks.push({ type: 'paragraph', text: textBuffer.join(' ').trim() });
    }
  }

  while (blocks.length > 0 && blocks[0].type === 'paragraph' && blocks[0].text) {
    const first = blocks[0].text;
    if (/^(?:Глава|Часть|Раздел|Chapter)\s*[0-9IVXLCDMivxlcdm.:–—\-\s]*$/i.test(first)) {
      blocks.shift();
      continue;
    }
    break;
  }

  return { blocks, footnotes };
}

export function drawTrimCropMarks(
  doc: jsPDF,
  trimX: number,
  trimY: number,
  trimW: number,
  trimH: number,
  bleedMm: number
): void {
  const gap = Math.max(1.5, bleedMm + 0.5);
  const len = 4.0;
  doc.setDrawColor(120, 120, 125);
  doc.setLineWidth(0.18);

  doc.line(trimX - gap - len, trimY, trimX - gap, trimY);
  doc.line(trimX, trimY - gap - len, trimX, trimY - gap);
  doc.line(trimX + trimW + gap, trimY, trimX + trimW + gap + len, trimY);
  doc.line(trimX + trimW, trimY - gap - len, trimX + trimW, trimY - gap);
  doc.line(trimX - gap - len, trimY + trimH, trimX - gap, trimY + trimH);
  doc.line(trimX, trimY + trimH + gap, trimX, trimY + trimH + gap + len);
  doc.line(trimX + trimW + gap, trimY + trimH, trimX + trimW + gap + len, trimY + trimH);
  doc.line(trimX + trimW, trimY + trimH + gap, trimX + trimW, trimY + trimH + gap + len);
}

export function drawNoirAccentTitle(
  doc: jsPDF,
  text: string,
  centerX: number,
  y: number,
  fontSizePt: number,
  fonts: RegisteredPdfFonts,
  baseRgb: [number, number, number],
  crimsonRgb: [number, number, number],
  enableRedAccents: boolean
): void {
  doc.setFont(fonts.headingFamily, 'normal');
  doc.setFontSize(fontSizePt);

  if (!enableRedAccents) {
    doc.setTextColor(baseRgb[0], baseRgb[1], baseRgb[2]);
    doc.text(text, centerX, y, { align: 'center' });
    return;
  }

  const chars = Array.from(text);
  const widths = chars.map((ch) => doc.getTextWidth(ch));
  const totalW = widths.reduce((a, b) => a + b, 0);
  let curX = centerX - totalW / 2;

  chars.forEach((ch, idx) => {
    const isRed = ch !== ' ' && (ch.charCodeAt(0) * 7 + idx * 13) % 10 < 3;
    if (isRed) doc.setTextColor(crimsonRgb[0], crimsonRgb[1], crimsonRgb[2]);
    else doc.setTextColor(baseRgb[0], baseRgb[1], baseRgb[2]);
    doc.text(ch, curX, y);
    curX += widths[idx];
  });
}
