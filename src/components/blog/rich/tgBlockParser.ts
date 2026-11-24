export interface TgMediaItem {
  type: 'photo' | 'video';
  url?: string;
  posterUrl?: string;
  postUrl?: string;
  tooLarge?: boolean;
  sizeMb?: number;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;
}

export interface TgButtonItem {
  text: string;
  url: string;
  isTelegramFallback?: boolean;
}

export interface TgCollapseData {
  summary?: string;
  credit?: string;
  isOpen?: boolean;
  markdown: string;
}

export type TgRichBlock =
  | { kind: 'video'; data: TgMediaItem }
  | { kind: 'gallery'; data: TgMediaItem[] }
  | { kind: 'buttons'; data: TgButtonItem[][] }
  | { kind: 'collapse'; data: TgCollapseData };

export function sanitizeBlogUrl(raw: unknown, allowRelative = true): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(javascript|data|vbscript):/i.test(value)) return '';
  if (allowRelative && value.startsWith('/')) return value;
  if (/^(https?:|mailto:|tel:|tg:)/i.test(value)) return value;
  return '';
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(String(url || '').trim());
}

function scanBalancedJson(source: string, startIdx: number): { jsonText: string; endIdx: number } | null {
  const openChar = source[startIdx];
  const closeChar = openChar === '{' ? '}' : openChar === '[' ? ']' : '';
  if (!closeChar) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIdx; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === openChar) {
      depth++;
    } else if (ch === closeChar) {
      depth--;
      if (depth === 0) {
        return {
          jsonText: source.slice(startIdx, i + 1),
          endIdx: i + 1,
        };
      }
    }
  }
  return null;
}

function normalizeMediaItem(entry: unknown): TgMediaItem | null {
  if (!entry || typeof entry !== 'object') return null;
  const obj = entry as Record<string, unknown>;
  const tooLarge = Boolean(obj.tooLarge);
  const type = obj.type === 'video' ? 'video' : 'photo';
  const safeUrl = tooLarge ? '' : sanitizeBlogUrl(obj.url, true);
  const safePoster = tooLarge ? sanitizeBlogUrl(obj.posterUrl, true) : '';
  const safePostUrl = sanitizeBlogUrl(obj.postUrl, false);

  return {
    type,
    url: safeUrl || undefined,
    posterUrl: safePoster || undefined,
    postUrl: safePostUrl || undefined,
    tooLarge,
    sizeMb: typeof obj.sizeMb === 'number' ? obj.sizeMb : undefined,
    width: typeof obj.width === 'number' ? obj.width : undefined,
    height: typeof obj.height === 'number' ? obj.height : undefined,
    duration: typeof obj.duration === 'number' ? obj.duration : undefined,
    caption: typeof obj.caption === 'string' ? obj.caption : undefined,
  };
}

export function normalizeButtonsRows(parsed: unknown): TgButtonItem[][] {
  if (!Array.isArray(parsed)) return [];
  const rows: TgButtonItem[][] = [];
  for (const row of parsed) {
    if (!Array.isArray(row)) continue;
    const cleanRow: TgButtonItem[] = [];
    for (const btn of row) {
      if (!btn || typeof btn !== 'object') continue;
      const b = btn as Record<string, unknown>;
      const text = String(b.text || '').trim();
      const url = sanitizeBlogUrl(b.url, true);
      if (text && url) {
        cleanRow.push({
          text,
          url,
          isTelegramFallback: Boolean(b.isTelegramFallback),
        });
      }
    }
    if (cleanRow.length > 0) rows.push(cleanRow);
  }
  return rows;
}

export function hasTgButtonsInMarkdown(markdown: string): boolean {
  return /```tg-buttons/i.test(String(markdown || ''));
}

export function extractTgBlocks(markdown: string): {
  processedMarkdown: string;
  blocks: TgRichBlock[];
} {
  const source = String(markdown || '').replace(/\r\n/g, '\n');
  const blocks: TgRichBlock[] = [];
  const openRegex = /```tg-(video|gallery|buttons|collapse)\b/gi;

  let cursor = 0;
  let out = '';

  while (cursor < source.length) {
    openRegex.lastIndex = cursor;
    const match = openRegex.exec(source);
    if (!match) {
      out += source.slice(cursor);
      break;
    }

    const blockStart = match.index;
    const kind = match[1].toLowerCase() as TgRichBlock['kind'];
    out += source.slice(cursor, blockStart);

    let jsonStart = openRegex.lastIndex;
    while (jsonStart < source.length && /\s/.test(source[jsonStart])) {
      jsonStart++;
    }

    const scanned = scanBalancedJson(source, jsonStart);
    if (!scanned) {
      // Malformed block without balanced JSON — emit literally and advance past fence
      out += match[0];
      cursor = openRegex.lastIndex;
      continue;
    }

    let fenceEnd = scanned.endIdx;
    while (fenceEnd < source.length && /\s/.test(source[fenceEnd])) {
      fenceEnd++;
    }

    if (source.startsWith('```', fenceEnd)) {
      fenceEnd += 3;
    }

    try {
      const parsed = JSON.parse(scanned.jsonText);
      let block: TgRichBlock | null = null;

      if (kind === 'video') {
        const item = normalizeMediaItem(parsed);
        if (item) block = { kind: 'video', data: item };
      } else if (kind === 'gallery' && Array.isArray(parsed)) {
        const items = parsed.map(normalizeMediaItem).filter((x): x is TgMediaItem => x !== null);
        if (items.length > 0) block = { kind: 'gallery', data: items };
      } else if (kind === 'buttons') {
        const rows = normalizeButtonsRows(parsed);
        if (rows.length > 0) block = { kind: 'buttons', data: rows };
      } else if (kind === 'collapse' && parsed && typeof parsed === 'object') {
        const obj = parsed as Record<string, unknown>;
        const mdText = typeof obj.markdown === 'string' ? obj.markdown : '';
        if (mdText.trim()) {
          block = {
            kind: 'collapse',
            data: {
              summary: typeof obj.summary === 'string' ? obj.summary.trim() : undefined,
              credit: typeof obj.credit === 'string' ? obj.credit.trim() : undefined,
              isOpen: Boolean(obj.isOpen),
              markdown: mdText,
            },
          };
        }
      }

      if (block) {
        const idx = blocks.length;
        blocks.push(block);
        out += `\n\n\`\`\`knigai-tg-block\n${idx}\n\`\`\`\n\n`;
      }
    } catch {
      // Ignore broken JSON payload without crashing article render
    }

    cursor = fenceEnd;
  }

  return { processedMarkdown: out, blocks };
}
