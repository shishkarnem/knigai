export interface ExtractedChapter {
  chapter_number: number;
  title: string;
  synopsis: string;
  content: string;
  illustration_url?: string;
  illustration_prompt?: string;
  status: string;
}

export interface ExtractedBookMeta {
  year?: string;
  translator?: string;
  publisher?: string;
  isbn?: string;
  keywords?: string[];
  language?: string;
  originalLanguage?: string;
  pageCountEstimate?: number;
}

export function buildChapterExcerptSynopsis(content: string, title: string, chapterNum: number): string {
  const clean = (content || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 40) {
    return `Глава ${chapterNum}: ${title}.`;
  }
  const snippet = clean.slice(0, 230).trim();
  const lastDot = Math.max(snippet.lastIndexOf('.'), snippet.lastIndexOf('!'), snippet.lastIndexOf('?'));
  return lastDot > 80 ? snippet.slice(0, lastDot + 1) : `${snippet}...`;
}

export function parseRtfBuffer(buffer: Buffer): string {
  let raw = '';
  try {
    raw = new TextDecoder('latin1').decode(buffer);
  } catch {
    raw = new TextDecoder('utf-8').decode(buffer);
  }

  raw = raw.replace(/(?:\\'[0-9a-fA-F]{2})+/g, (match) => {
    try {
      const hexes = match.split('\\\'').filter(Boolean);
      const bytes = new Uint8Array(hexes.map((h) => parseInt(h, 16)));
      return new TextDecoder('windows-1251').decode(bytes);
    } catch {
      return match;
    }
  });

  raw = raw.replace(/\\u(-?\d+)\??/g, (_, code) => {
    const num = parseInt(code, 10);
    return String.fromCharCode(num < 0 ? num + 65536 : num);
  });

  raw = raw.replace(/\{\\(?:fonttbl|colortbl|stylesheet|info|\*)[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/gi, '');
  raw = raw.replace(/\\par(?:\r?\n|\s+)?/gi, '\n\n');
  raw = raw.replace(/\\line(?:\r?\n|\s+)?/gi, '\n');
  raw = raw.replace(/\\tab(?:\r?\n|\s+)?/gi, '\t');
  raw = raw.replace(/\\[a-zA-Z]+-?\d*(?:\s)?/g, '');
  raw = raw.replace(/[{}]/g, '');

  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseHtmlBuffer(buffer: Buffer): string {
  let html = '';
  try {
    html = new TextDecoder('utf-8').decode(buffer);
    if ((html.match(/\uFFFD/g) || []).length > 5) {
      html = new TextDecoder('windows-1251').decode(buffer);
    }
  } catch {
    html = new TextDecoder('windows-1251').decode(buffer);
  }

  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi, '\n\nГлава: $1\n\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function parseMobiBuffer(buffer: Buffer): string {
  try {
    if (buffer.length < 78) return '';
    const numRecords = buffer.readUInt16BE(76);
    if (numRecords === 0 || numRecords > 20000) return '';

    const recordOffsets: number[] = [];
    for (let i = 0; i < Math.min(numRecords, 500); i++) {
      recordOffsets.push(buffer.readUInt32BE(78 + i * 8));
    }

    const r0 = recordOffsets[0];
    if (r0 >= buffer.length) return '';
    const compression = buffer.readUInt16BE(r0);
    const textRecordsCount = buffer.readUInt16BE(r0 + 8);

    const textChunks: string[] = [];
    const limit = Math.min(textRecordsCount, recordOffsets.length - 1, 300);

    for (let r = 1; r <= limit; r++) {
      const start = recordOffsets[r];
      const end = r + 1 < recordOffsets.length ? recordOffsets[r + 1] : buffer.length;
      if (start >= end || start >= buffer.length) continue;
      const recBuf = buffer.subarray(start, Math.min(end, buffer.length));

      if (compression === 2) {
        const out: number[] = [];
        let p = 0;
        while (p < recBuf.length) {
          const b = recBuf[p++];
          if (b >= 1 && b <= 8) {
            for (let k = 0; k < b && p < recBuf.length; k++) out.push(recBuf[p++]);
          } else if (b <= 0x7f) {
            out.push(b);
          } else if (b >= 0xc0) {
            out.push(32);
            out.push(b ^ 0x80);
          } else {
            if (p >= recBuf.length) break;
            const b2 = recBuf[p++];
            const distance = ((b & 0x3f) << 3) | (b2 >> 5);
            const length = (b2 & 0x1f) + 3;
            const offset = out.length - distance;
            for (let k = 0; k < length; k++) {
              if (offset + k >= 0 && offset + k < out.length) out.push(out[offset + k]);
            }
          }
        }
        const decompressed = Buffer.from(out);
        let chunk = '';
        try {
          chunk = new TextDecoder('utf-8').decode(decompressed);
          if ((chunk.match(/\uFFFD/g) || []).length > 5) {
            chunk = new TextDecoder('windows-1251').decode(decompressed);
          }
        } catch {
          chunk = new TextDecoder('windows-1251').decode(decompressed);
        }
        textChunks.push(chunk);
      } else {
        try {
          textChunks.push(new TextDecoder('utf-8').decode(recBuf));
        } catch {
          textChunks.push(new TextDecoder('windows-1251').decode(recBuf));
        }
      }
    }

    const fullText = textChunks.join('');
    if (fullText.includes('<p') || fullText.includes('<html') || fullText.includes('<div')) {
      return parseHtmlBuffer(Buffer.from(fullText, 'utf-8'));
    }
    return fullText;
  } catch (err) {
    console.warn('[parseMobiBuffer] MOBI notice:', err);
    return '';
  }
}

export function parsePdfBuffer(buffer: Buffer): string {
  try {
    const raw = buffer.toString('latin1');
    const textPieces: string[] = [];
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    while ((match = streamRegex.exec(raw)) !== null) {
      const streamData = match[1];
      const tjRegex = /\(([^)]+)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(streamData)) !== null) {
        textPieces.push(tjMatch[1]);
      }
    }
    if (textPieces.length > 20) {
      return textPieces.join(' ');
    }
  } catch (err) {
    console.warn('[parsePdfBuffer] PDF notice:', err);
  }
  return '';
}

export function splitTextIntoChapters(cleanText: string, bookTitle: string): ExtractedChapter[] {
  const text = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const chapters: ExtractedChapter[] = [];

  const chapterRegex = /(?:^|\n)\s*(?:#{1,3}\s*)?(?:(?:Глава|ГЛАВА|глава|Часть|ЧАСТЬ|Раздел|РАЗДЕЛ|Эпизод|ЭПИЗОД|Chapter|CHAPTER)\s+([0-9IVXLCDMivxlcdm]+|[а-яА-ЯёЁ\w]+)?(?:[:.\-–—\s]*)([^\n]*)|(?:[0-9]+|[IVXLCDM]{1,8})\.\s+([^\n]+))/gi;

  const matches: { index: number; fullMatch: string; title: string }[] = [];
  let m: RegExpExecArray | null;

  while ((m = chapterRegex.exec(text)) !== null) {
    const heading = m[0].trim();
    const title = (m[2] || m[3] || '').trim();
    if (heading.length < 90) {
      matches.push({ index: m.index, fullMatch: heading, title });
    }
  }

  if (matches.length >= 2) {
    if (matches[0].index > 120) {
      const prologueBody = text.slice(0, matches[0].index).trim();
      if (prologueBody.length > 80) {
        chapters.push({
          chapter_number: 1,
          title: 'Пролог: Начало',
          synopsis: buildChapterExcerptSynopsis(prologueBody, 'Пролог: Начало', 1),
          content: prologueBody,
          status: 'ready',
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const curr = matches[i];
      const nextIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
      let body = text.slice(curr.index, nextIndex).trim();

      if (body.startsWith(curr.fullMatch)) {
        body = body.slice(curr.fullMatch.length).trim();
      }

      const chapNum = chapters.length + 1;
      let chapterTitle = curr.title || `Глава ${chapNum}`;
      if (/^(глава|часть|chapter)/i.test(chapterTitle)) {
        chapterTitle =
          chapterTitle.replace(/^(глава|часть|chapter)\s*[0-9IVXLCDMivxlcdm.:\-–—\s]*/i, '').trim() ||
          `Глава ${chapNum}`;
      }

      const chapBody = body || `Текст главы ${chapNum} произведения «${bookTitle}».`;
      chapters.push({
        chapter_number: chapNum,
        title: chapterTitle,
        synopsis: buildChapterExcerptSynopsis(chapBody, chapterTitle, chapNum),
        content: chapBody,
        status: 'ready',
      });
    }

    if (chapters.length >= 2) {
      return chapters;
    }
  }

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  let currentGroup: string[] = [];
  let currentWordCount = 0;
  const WORDS_PER_CHAP = 1500;

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean).length;
    currentGroup.push(para);
    currentWordCount += words;

    if (currentWordCount >= WORDS_PER_CHAP) {
      const num = chapters.length + 1;
      const bodyStr = currentGroup.join('\n\n');
      const chTitle = num === 1 ? 'Пролог: Начало событий' : `Глава ${num}: Развитие сюжета`;
      chapters.push({
        chapter_number: num,
        title: chTitle,
        synopsis: buildChapterExcerptSynopsis(bodyStr, chTitle, num),
        content: bodyStr,
        status: 'ready',
      });
      currentGroup = [];
      currentWordCount = 0;
    }
  }

  if (currentGroup.length > 0) {
    const num = chapters.length + 1;
    const bodyStr = currentGroup.join('\n\n');
    const chTitle = num === 1 ? 'Полный текст' : `Глава ${num}: Кульминация и финал`;
    chapters.push({
      chapter_number: num,
      title: chTitle,
      synopsis: buildChapterExcerptSynopsis(bodyStr, chTitle, num),
      content: bodyStr,
      status: 'ready',
    });
  }

  return chapters;
}
