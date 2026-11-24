import { ImageLayoutConfig, ImagePlacementMode } from '../../types';
import { estimateA5Pages } from '../../services/ai/chapterBatchEngine';

export type InlineImageMode =
  | 'full'
  | 'wrap-left'
  | 'wrap-right'
  | 'header-break'
  | 'page-bg'
  | 'gradient-blend'
  | 'graphic-panel'
  | 'photo-polaroid'
  | 'split-vertical';

export interface ParsedMarkdownImageBlock {
  rawMatch: string;
  startIndex: number;
  endIndex: number;
  alt: string;
  url: string;
  layout: InlineImageMode;
  scale: number;
  bgOpacity: number;
  gradientDirection: 'bottom' | 'top' | 'left' | 'right';
  offsetX: number;
  offsetY: number;
}

const VALID_INLINE_MODES: InlineImageMode[] = [
  'full',
  'wrap-left',
  'wrap-right',
  'header-break',
  'page-bg',
  'gradient-blend',
  'graphic-panel',
  'photo-polaroid',
  'split-vertical',
];

const VALID_GRADIENT_DIRS = ['bottom', 'top', 'left', 'right'] as const;

export function normalizePlacementMode(mode?: string): ImagePlacementMode {
  if (!mode || mode === 'full' || mode === 'full-width') return 'full-width';
  if ((VALID_INLINE_MODES as string[]).includes(mode)) {
    return mode as ImagePlacementMode;
  }
  return 'full-width';
}

export function toInlineMode(mode?: string): InlineImageMode {
  if (!mode || mode === 'full-width' || mode === 'full') return 'full';
  if ((VALID_INLINE_MODES as string[]).includes(mode)) {
    return mode as InlineImageMode;
  }
  return 'full';
}

export function parseMarkdownImageTag(rawMeta: string, url: string): {
  alt: string;
  inlineLayout: InlineImageMode;
  layoutConfig: ImageLayoutConfig;
} {
  const alt = (rawMeta.split('|')[0] || '').trim() || 'Иллюстрация';

  const layoutMatch = rawMeta.match(/layout=([a-z-]+)/i);
  let inlineLayout: InlineImageMode = 'full';
  if (layoutMatch && (VALID_INLINE_MODES as string[]).includes(layoutMatch[1])) {
    inlineLayout = layoutMatch[1] as InlineImageMode;
  } else if (layoutMatch && layoutMatch[1] === 'full-width') {
    inlineLayout = 'full';
  } else if (rawMeta.includes('wrap-left')) {
    inlineLayout = 'wrap-left';
  } else if (rawMeta.includes('wrap-right')) {
    inlineLayout = 'wrap-right';
  }

  const scaleMatch = rawMeta.match(/scale=(\d+)/);
  const scale = scaleMatch ? Math.min(100, Math.max(30, parseInt(scaleMatch[1], 10))) : 85;

  const opacityMatch = rawMeta.match(/opacity=(\d+)/);
  const bgOpacity = opacityMatch ? Math.min(95, Math.max(15, parseInt(opacityMatch[1], 10))) : 38;

  const gradMatch = rawMeta.match(/grad=(bottom|top|left|right)/i);
  const gradientDirection = gradMatch && (VALID_GRADIENT_DIRS as readonly string[]).includes(gradMatch[1])
    ? (gradMatch[1] as 'bottom' | 'top' | 'left' | 'right')
    : 'bottom';

  const dxMatch = rawMeta.match(/dx=(-?\d+)/);
  const offsetX = dxMatch ? Math.max(-60, Math.min(60, parseInt(dxMatch[1], 10))) : 0;

  const dyMatch = rawMeta.match(/dy=(-?\d+)/);
  const offsetY = dyMatch ? Math.max(-60, Math.min(60, parseInt(dyMatch[1], 10))) : 0;

  return {
    alt: alt === 'Иллюстрация' && !rawMeta.split('|')[0]?.trim() ? '' : alt,
    inlineLayout,
    layoutConfig: {
      mode: normalizePlacementMode(inlineLayout),
      scale,
      filter: 'normal',
      bgOpacity,
      gradientDirection,
      offsetX,
      offsetY,
      caption: rawMeta.split('|')[0]?.trim() || undefined,
    },
  };
}

export function computeWriterStats(text: string): {
  chars: number;
  words: number;
  a5Pages: number;
  readingMinutes: number;
} {
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  const a5Pages = estimateA5Pages(text);
  const readingMinutes = Math.max(1, Math.round(words / 180));
  return { chars, words, a5Pages, readingMinutes };
}

export function extractMarkdownImages(markdown: string): ParsedMarkdownImageBlock[] {
  const results: ParsedMarkdownImageBlock[] = [];
  const regex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markdown)) !== null) {
    const rawMeta = m[1] || '';
    const url = m[2] || '';
    const parsed = parseMarkdownImageTag(rawMeta, url);

    results.push({
      rawMatch: m[0],
      startIndex: m.index,
      endIndex: m.index + m[0].length,
      alt: parsed.alt || 'Иллюстрация',
      url,
      layout: parsed.inlineLayout,
      scale: parsed.layoutConfig.scale,
      bgOpacity: parsed.layoutConfig.bgOpacity ?? 38,
      gradientDirection: parsed.layoutConfig.gradientDirection ?? 'bottom',
      offsetX: parsed.layoutConfig.offsetX ?? 0,
      offsetY: parsed.layoutConfig.offsetY ?? 0,
    });
  }
  return results;
}

export function serializeMarkdownImage(params: {
  alt: string;
  url: string;
  layout: InlineImageMode | ImagePlacementMode;
  scale: number;
  bgOpacity?: number;
  gradientDirection?: 'bottom' | 'top' | 'left' | 'right';
  offsetX?: number;
  offsetY?: number;
}): string {
  const safeAlt = (params.alt || 'Иллюстрация').replace(/[\[\]|]/g, '').trim() || 'Иллюстрация';
  const safeScale = Math.min(100, Math.max(30, Math.round(params.scale)));
  const inlineMode = toInlineMode(params.layout);
  const parts: string[] = [];

  if (inlineMode !== 'full') {
    parts.push(`layout=${inlineMode}`);
  }
  parts.push(`scale=${safeScale}`);

  if (
    (inlineMode === 'page-bg' || inlineMode === 'gradient-blend') &&
    typeof params.bgOpacity === 'number'
  ) {
    parts.push(`opacity=${Math.min(95, Math.max(15, Math.round(params.bgOpacity)))}`);
  }
  if (inlineMode === 'gradient-blend' && params.gradientDirection) {
    parts.push(`grad=${params.gradientDirection}`);
  }
  if (params.offsetX && params.offsetX !== 0) {
    parts.push(`dx=${Math.round(params.offsetX)}`);
  }
  if (params.offsetY && params.offsetY !== 0) {
    parts.push(`dy=${Math.round(params.offsetY)}`);
  }

  return `![${safeAlt}|${parts.join('|')}](${params.url.trim()})`;
}

/**
 * Inserts markdown snippet into chapter text either at cursor or after paragraph N (-1 = before 1st, 99999 = end)
 */
export function insertSnippetAtParagraphIndex(
  content: string,
  snippet: string,
  paragraphIndex: number
): string {
  const cleanSnippet = snippet.trim();
  if (!cleanSnippet) return content;

  if (paragraphIndex < 0) {
    return `${cleanSnippet}\n\n${content.trimStart()}`;
  }

  const blocks = content.split('\n\n');
  if (paragraphIndex >= blocks.length) {
    return content.trim() ? `${content.trimEnd()}\n\n${cleanSnippet}` : cleanSnippet;
  }

  const nextBlocks = [...blocks];
  nextBlocks.splice(paragraphIndex + 1, 0, cleanSnippet);
  return nextBlocks.join('\n\n');
}

export function replaceSelectionRange(
  source: string,
  start: number,
  end: number,
  insertion: string
): { nextText: string; nextCursorStart: number; nextCursorEnd: number } {
  const nextText = source.slice(0, start) + insertion + source.slice(end);
  const pos = start + insertion.length;
  return { nextText, nextCursorStart: pos, nextCursorEnd: pos };
}
