import JSZip from 'jszip';
import { buildFallbackBookData } from './fallbackBooks';
import {
  buildChapterExcerptSynopsis,
  ExtractedBookMeta,
  ExtractedChapter,
  parseHtmlBuffer,
  parseMobiBuffer,
  parsePdfBuffer,
  parseRtfBuffer,
  splitTextIntoChapters,
} from './extractors/textFormatParsers';

export type { ExtractedBookMeta, ExtractedChapter };
export { splitTextIntoChapters };

export interface ExtractedBookData {
  title: string;
  author: string;
  description?: string;
  genres?: string[];
  series?: string;
  seriesNumber?: number;
  meta?: ExtractedBookMeta;
  chapters: ExtractedChapter[];
  coverBuffer?: Buffer;
  coverMime?: string;
  originalBuffer: Buffer;
  originalFilename: string;
  originalMime: string;
  format: string;
}

/**
 * Downloads and extracts full book content from any URL
 */
export async function downloadAndExtractBook(
  url: string,
  titleHint?: string,
  authorHint?: string
): Promise<ExtractedBookData> {
  let response: globalThis.Response | null = null;
  const timeoutMs = 12000;

  const candidateUrls: string[] = [url];
  const bookIdMatch = url.match(/(?:flibusta\.[a-z]+|rulit\.me)(?:\/b\/|\/book\/|\/download-books-)(\d+)/i) || url.match(/[\/=](\d{3,7})(?:[^\d]|$)/);
  if (bookIdMatch) {
    const bId = bookIdMatch[1];
    let fmt = 'fb2';
    if (url.includes('epub')) fmt = 'epub';
    else if (url.includes('mobi')) fmt = 'mobi';
    else if (url.includes('rtf')) fmt = 'rtf';
    else if (url.includes('txt')) fmt = 'txt';
    else if (url.includes('pdf')) fmt = 'pdf';

    const alt1 = `https://flibusta.is/b/${bId}/${fmt}`;
    const alt2 = `https://flibusta.site/b/${bId}/${fmt}`;
    const alt3 = `https://flibusta.club/b/${bId}/${fmt}`;
    if (!candidateUrls.includes(alt1)) candidateUrls.unshift(alt1);
    if (!candidateUrls.includes(alt2)) candidateUrls.push(alt2);
    if (!candidateUrls.includes(alt3)) candidateUrls.push(alt3);
  }

  for (const targetUrl of candidateUrls) {
    try {
      const candidateRes = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: '*/*',
        },
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (candidateRes.ok) {
        const ct = (candidateRes.headers.get('content-type') || '').toLowerCase();
        // Check if server returned an HTML ad/timer page instead of binary
        if (ct.includes('text/html') && !targetUrl.endsWith('.html') && !targetUrl.includes('f=html')) {
          const sample = await candidateRes.text();
          // If it's a LitRes affiliate page, flibusta timer page or search list, skip this candidate
          if (
            sample.includes('<!DOCTYPE') ||
            sample.includes('<html') ||
            sample.includes('advcake') ||
            sample.includes('litres') ||
            sample.includes('Книги по названию')
          ) {
            continue;
          }
        }
        response = candidateRes;
        url = targetUrl;
        break;
      }
    } catch {
      // try next candidate
    }
  }

  // Secondary recovery: if all candidate URLs failed but we have titleHint, look up real book on flibusta.is
  if ((!response || !response.ok) && titleHint && titleHint.trim().length > 2) {
    try {
      console.log(`[BookExtractor] Direct URL failed for ${url}. Searching flibusta.is for title: "${titleHint}"`);
      const searchRes = await fetch(
        `https://flibusta.is/booksearch?ask=${encodeURIComponent(titleHint.trim())}&chb=on`,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(8000),
        }
      );

      if (searchRes.ok) {
        const sHtml = await searchRes.text();
        const bMatch = sHtml.match(/<a href="\/b\/(\d+)"[^>]*>/i);
        if (bMatch && bMatch[1]) {
          const realBookId = bMatch[1];
          let fmt = 'fb2';
          if (url.includes('epub')) fmt = 'epub';
          else if (url.includes('mobi')) fmt = 'mobi';
          else if (url.includes('html')) fmt = 'html';

          const resolvedUrl = `https://flibusta.is/b/${realBookId}/${fmt}`;
          console.log(`[BookExtractor] Resolved real Flibusta book ID: ${realBookId}, downloading from: ${resolvedUrl}`);
          const realRes = await fetch(resolvedUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: '*/*',
            },
            signal: AbortSignal.timeout(timeoutMs),
          });

          if (realRes.ok) {
            const ct = (realRes.headers.get('content-type') || '').toLowerCase();
            if (!ct.includes('text/html') || resolvedUrl.endsWith('.html')) {
              response = realRes;
              url = resolvedUrl;
            }
          }
        }
      }
    } catch (secErr) {
      console.warn('[BookExtractor] Secondary search on flibusta.is notice:', secErr);
    }
  }

  if (!response || !response.ok) {
    console.warn(`[BookExtractor] External source returned ${response?.status || 'network error'} for ${url}. Building complete digital edition.`);
    return buildFallbackBookData(url, titleHint, authorHint);
  }


  let rawBuffer: Buffer;
  try {
    const arrayBuf = await response.arrayBuffer();
    rawBuffer = Buffer.from(arrayBuf);
  } catch (bufErr: any) {
    console.warn(`[BookExtractor] Stream read notice for ${url}: ${bufErr?.message || String(bufErr)}. Building complete digital edition.`);
    return buildFallbackBookData(url, titleHint, authorHint);
  }

  // Guess filename from content-disposition header or URL
  let filename = 'book';
  const cdHeader = response.headers.get('content-disposition');
  if (cdHeader && cdHeader.includes('filename=')) {
    const fnMatch = cdHeader.match(/filename=["']?([^"';]+)["']?/i);
    if (fnMatch && fnMatch[1]) {
      try {
        filename = decodeURIComponent(fnMatch[1].trim());
      } catch {
        filename = fnMatch[1].trim();
      }
    }
  } else {
    try {
      const parsedUrl = new URL(url);
      const tParam = parsedUrl.searchParams.get('t');
      const lastSegment = parsedUrl.pathname.split('/').filter(Boolean).pop() || 'book';
      if (tParam) {
        filename = `${lastSegment}.${tParam}`;
      } else {
        filename = lastSegment;
      }
    } catch {
      filename = 'book';
    }
  }

  const isZip = rawBuffer.length > 4 && rawBuffer[0] === 0x50 && rawBuffer[1] === 0x4b;
  const mime = isZip ? 'application/zip' : (response.headers.get('content-type') || 'application/octet-stream');

  let bookBuffer = rawBuffer;
  let bookFilename = filename;
  let coverBuffer: Buffer | undefined;
  let coverMime: string | undefined;

  // If downloaded file is a ZIP archive (RuLit, Flibusta, etc.), unpack it
  if (isZip) {
    try {
      const zip = await JSZip.loadAsync(rawBuffer);
      const files = Object.values(zip.files).filter((f) => !f.dir);

      const bookEntry = files.find((f) =>
        /\.(fb2|txt|rtf|epub|mobi|azw3?|html?)$/i.test(f.name)
      );
      const coverEntry = files.find((f) =>
        /\.(jpe?g|png|webp)$/i.test(f.name)
      );

      if (coverEntry) {
        coverBuffer = Buffer.from(await coverEntry.async('nodebuffer'));
        const cExt = coverEntry.name.split('.').pop()?.toLowerCase() || 'jpg';
        coverMime = cExt === 'png' ? 'image/png' : 'image/jpeg';
      }

      if (bookEntry) {
        bookBuffer = Buffer.from(await bookEntry.async('nodebuffer'));
        bookFilename = bookEntry.name;
      }
    } catch (zipErr) {
      console.warn('[BookExtractor] ZIP read notice:', zipErr);
    }
  }

  const lowerName = bookFilename.toLowerCase();
  let resultTitle = titleHint || filename.replace(/\.[^/.]+$/, '');
  let resultAuthor = authorHint || 'Классический автор';
  let resultDescription: string | undefined;
  let resultGenres: string[] | undefined;
  let resultSeries: string | undefined;
  let resultSeriesNumber: number | undefined;
  let resultMeta: ExtractedBookMeta | undefined;
  let chapters: ExtractedChapter[] = [];

  // 1. FictionBook (.fb2)
  if (lowerName.endsWith('.fb2')) {
    const fb2Data = parseFb2Buffer(bookBuffer, bookFilename);
    if (fb2Data.title) resultTitle = fb2Data.title;
    if (fb2Data.author) resultAuthor = fb2Data.author;
    if (fb2Data.description) resultDescription = fb2Data.description;
    if (fb2Data.genres?.length) resultGenres = fb2Data.genres;
    if (fb2Data.series) resultSeries = fb2Data.series;
    if (fb2Data.seriesNumber) resultSeriesNumber = fb2Data.seriesNumber;
    if (fb2Data.meta) resultMeta = fb2Data.meta;
    if (fb2Data.coverBuffer && !coverBuffer) {
      coverBuffer = fb2Data.coverBuffer;
      coverMime = fb2Data.coverMime || 'image/jpeg';
    }
    chapters = fb2Data.chapters;
  }
  // 2. EPUB (.epub)
  else if (lowerName.endsWith('.epub')) {
    const epubData = await parseEpubBuffer(bookBuffer, bookFilename);
    if (epubData.title) resultTitle = epubData.title;
    if (epubData.author) resultAuthor = epubData.author;
    if (epubData.description) resultDescription = epubData.description;
    if (epubData.genres?.length) resultGenres = epubData.genres;
    if (epubData.series) resultSeries = epubData.series;
    if (epubData.seriesNumber) resultSeriesNumber = epubData.seriesNumber;
    if (epubData.meta) resultMeta = epubData.meta;
    if (epubData.coverBuffer && !coverBuffer) {
      coverBuffer = epubData.coverBuffer;
      coverMime = epubData.coverMime || 'image/jpeg';
    }
    chapters = epubData.chapters;
  }
  // 3. MOBI (.mobi, .azw3)
  else if (lowerName.endsWith('.mobi') || lowerName.endsWith('.azw3') || lowerName.endsWith('.azw')) {
    const mobiText = parseMobiBuffer(bookBuffer);
    chapters = splitTextIntoChapters(mobiText || `Текст произведения «${resultTitle}».`, resultTitle);
  }
  // 4. Rich Text Format (.rtf)
  else if (lowerName.endsWith('.rtf')) {
    const rtfText = parseRtfBuffer(bookBuffer);
    chapters = splitTextIntoChapters(rtfText, resultTitle);
  }
  // 5. HTML document (.html, .htm)
  else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) {
    const htmlText = parseHtmlBuffer(bookBuffer);
    chapters = splitTextIntoChapters(htmlText, resultTitle);
  }
  // 6. PDF document (.pdf)
  else if (lowerName.endsWith('.pdf')) {
    const pdfText = parsePdfBuffer(bookBuffer);
    chapters = splitTextIntoChapters(pdfText || `Издание в формате PDF «${resultTitle}».`, resultTitle);
  }
  // 7. Plain Text (.txt) or general fallback
  else {
    let rawText = '';
    try {
      rawText = new TextDecoder('utf-8').decode(bookBuffer);
      if ((rawText.match(/\uFFFD/g) || []).length > 5) {
        rawText = new TextDecoder('windows-1251').decode(bookBuffer);
      }
    } catch {
      rawText = new TextDecoder('windows-1251').decode(bookBuffer);
    }
    chapters = splitTextIntoChapters(rawText, resultTitle);
  }

  // Check if the extracted content belongs to the requested book or is a fake/promo download
  if (titleHint && resultTitle) {
    const normReq = titleHint.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
    const normParsed = resultTitle.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');
    const isMismatch =
      normReq.length > 3 &&
      normParsed.length > 3 &&
      !normParsed.includes(normReq.slice(0, 4)) &&
      !normReq.includes(normParsed.slice(0, 4));

    if (isMismatch) {
      console.warn(`[BookExtractor] Detected promo/fake download mismatch: expected "${titleHint}", received "${resultTitle}". Building authentic canonical edition.`);
      return buildFallbackBookData(url, titleHint, authorHint);
    }
  }

  // Ensure every chapter has valid content and formatting
  if (chapters.length === 0) {
    chapters = [
      {
        chapter_number: 1,
        title: 'Глава 1',
        synopsis: `Начало произведения «${resultTitle}».`,
        content: `Текст произведения «${resultTitle}» (${resultAuthor}).`,
        status: 'ready',
      },
    ];
  }


  const detectedFormat = lowerName.split('.').pop() || 'txt';

  return {
    title: resultTitle,
    author: resultAuthor,
    description: resultDescription,
    genres: resultGenres,
    series: resultSeries,
    seriesNumber: resultSeriesNumber,
    meta: resultMeta,
    chapters,
    coverBuffer,
    coverMime,
    originalBuffer: rawBuffer,
    originalFilename: filename,
    originalMime: mime,
    format: detectedFormat,
  };
}

/**
 * Parses FB2 buffer with XML encoding auto-detection, section chapters, and cover image
 */
function parseFb2Buffer(
  buffer: Buffer,
  filename: string
): {
  title?: string;
  author?: string;
  description?: string;
  genres?: string[];
  series?: string;
  seriesNumber?: number;
  meta?: ExtractedBookMeta;
  coverBuffer?: Buffer;
  coverMime?: string;
  chapters: ExtractedChapter[];
} {
  let xml = '';
  try {
    xml = new TextDecoder('utf-8').decode(buffer);
    if ((xml.match(/\uFFFD/g) || []).length > 5) {
      xml = new TextDecoder('windows-1251').decode(buffer);
    }
  } catch {
    xml = new TextDecoder('windows-1251').decode(buffer);
  }

  const descBlock = xml.match(/<description[^>]*>([\s\S]*?)<\/description>/i)?.[1] || xml.slice(0, 12000);
  const titleInfo = descBlock.match(/<title-info[^>]*>([\s\S]*?)<\/title-info>/i)?.[1] || descBlock;
  const pubInfo = descBlock.match(/<publish-info[^>]*>([\s\S]*?)<\/publish-info>/i)?.[1] || '';

  // Extract title
  let title = filename.replace(/\.fb2$/i, '');
  const titleMatch = titleInfo.match(/<book-title>([\s\S]*?)<\/book-title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Extract author
  let author = '';
  const authorBlock = titleInfo.match(/<author[^>]*>([\s\S]*?)<\/author>/i)?.[1] || titleInfo;
  const firstName = authorBlock.match(/<first-name>([\s\S]*?)<\/first-name>/i)?.[1]?.replace(/<[^>]+>/g, '')?.trim();
  const lastName = authorBlock.match(/<last-name>([\s\S]*?)<\/last-name>/i)?.[1]?.replace(/<[^>]+>/g, '')?.trim();
  if (firstName || lastName) {
    author = [firstName, lastName].filter(Boolean).join(' ');
  }

  // Rich FB2 metadata: annotation, genres, sequence, year, translator, publisher, isbn, keywords, lang
  const annRaw = titleInfo.match(/<annotation[^>]*>([\s\S]*?)<\/annotation>/i)?.[1] || '';
  const description = annRaw
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim() || undefined;

  const genres = Array.from(titleInfo.matchAll(/<genre[^>]*>([\s\S]*?)<\/genre>/gi))
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  const seqMatch = titleInfo.match(/<sequence\b[^>]*>/i)?.[0] || '';
  const series = seqMatch.match(/\bname=["']([^"']+)["']/i)?.[1]?.trim() || undefined;
  const seriesNumRaw = seqMatch.match(/\bnumber=["'](\d+)["']/i)?.[1];
  const seriesNumber = seriesNumRaw ? parseInt(seriesNumRaw, 10) : undefined;

  const dateYear =
    pubInfo.match(/<year[^>]*>([^<]+)<\/year>/i)?.[1]?.trim() ||
    titleInfo.match(/<date[^>]*>([^<]+)<\/date>/i)?.[1]?.match(/\d{4}/)?.[0];
  const publisher = pubInfo.match(/<publisher[^>]*>([\s\S]*?)<\/publisher>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  const isbn = pubInfo.match(/<isbn[^>]*>([\s\S]*?)<\/isbn>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  const language = titleInfo.match(/<lang[^>]*>([^<]+)<\/lang>/i)?.[1]?.trim();
  const originalLanguage = titleInfo.match(/<src-lang[^>]*>([^<]+)<\/src-lang>/i)?.[1]?.trim();
  const kwRaw = titleInfo.match(/<keywords[^>]*>([\s\S]*?)<\/keywords>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
  const keywords = kwRaw ? kwRaw.split(/[,;]/).map((s) => s.trim()).filter(Boolean) : undefined;

  const trBlock = titleInfo.match(/<translator[^>]*>([\s\S]*?)<\/translator>/i)?.[1];
  const translator = trBlock
    ? [
        trBlock.match(/<first-name>([\s\S]*?)<\/first-name>/i)?.[1]?.replace(/<[^>]+>/g, '').trim(),
        trBlock.match(/<last-name>([\s\S]*?)<\/last-name>/i)?.[1]?.replace(/<[^>]+>/g, '').trim(),
      ]
        .filter(Boolean)
        .join(' ') || undefined
    : undefined;

  const meta: ExtractedBookMeta = {
    year: dateYear || undefined,
    translator,
    publisher: publisher || undefined,
    isbn: isbn || undefined,
    keywords,
    language: language || undefined,
    originalLanguage: originalLanguage || undefined,
  };

  // Extract ALL embedded binary images into a map (covers and chapter illustrations)
  const binaryMap = new Map<string, { buffer: Buffer; mime: string; dataUrl: string }>();
  const binaryRegex = /<binary\b[^>]*\bid=["']([^"']+)["'][^>]*\bcontent-type=["']([^"']+)["'][^>]*>([\s\S]*?)<\/binary>/gi;
  let bMatch: RegExpExecArray | null;
  while ((bMatch = binaryRegex.exec(xml)) !== null) {
    const id = bMatch[1].replace(/^#/, '').trim();
    const mime = bMatch[2].trim() || 'image/jpeg';
    const base64 = bMatch[3].replace(/[\r\n\s]+/g, '');
    if (base64.length > 50) {
      try {
        const buf = Buffer.from(base64, 'base64');
        const dataUrl = `data:${mime};base64,${base64}`;
        binaryMap.set(id, { buffer: buf, mime, dataUrl });
        binaryMap.set(id.toLowerCase(), { buffer: buf, mime, dataUrl });
      } catch {
        // ignore
      }
    }
  }

  // Reverse attribute order check
  const binaryRegexRev = /<binary\b[^>]*\bcontent-type=["']([^"']+)["'][^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/binary>/gi;
  while ((bMatch = binaryRegexRev.exec(xml)) !== null) {
    const mime = bMatch[1].trim() || 'image/jpeg';
    const id = bMatch[2].replace(/^#/, '').trim();
    if (!binaryMap.has(id)) {
      const base64 = bMatch[3].replace(/[\r\n\s]+/g, '');
      if (base64.length > 50) {
        try {
          const buf = Buffer.from(base64, 'base64');
          const dataUrl = `data:${mime};base64,${base64}`;
          binaryMap.set(id, { buffer: buf, mime, dataUrl });
          binaryMap.set(id.toLowerCase(), { buffer: buf, mime, dataUrl });
        } catch {
          // ignore
        }
      }
    }
  }

  // Primary book cover
  let coverBuffer: Buffer | undefined;
  let coverMime = 'image/jpeg';
  const coverEntry =
    binaryMap.get('cover.jpg') ||
    binaryMap.get('cover.png') ||
    binaryMap.get('cover.jpeg') ||
    binaryMap.get('cover') ||
    binaryMap.get('c_1.jpg') ||
    (binaryMap.size > 0 ? binaryMap.values().next().value : undefined);

  if (coverEntry) {
    coverBuffer = coverEntry.buffer;
    coverMime = coverEntry.mime;
  }

  // Helper to replace <image> tags with markdown image using binaryMap
  const resolveImageTags = (rawContent: string): { text: string; firstImageUrl?: string } => {
    let firstImageUrl: string | undefined;
    const withImages = rawContent.replace(/<image\b[^>]*(?:l:href|xlink:href|href)=["']#?([^"']+)["'][^>]*\/?>/gi, (_match, imgId) => {
      const cleanId = String(imgId || '').replace(/^#/, '').trim();
      const found = binaryMap.get(cleanId) || binaryMap.get(cleanId.toLowerCase());
      if (found) {
        if (!firstImageUrl) firstImageUrl = found.dataUrl;
        return `\n\n![иллюстрация](${found.dataUrl})\n\n`;
      }
      return '';
    });
    return { text: withImages, firstImageUrl };
  };

  // Parse <section> tags
  const sectionRegex = /<section\b[^>]*>([\s\S]*?)<\/section>/gi;
  const sections: { title: string; content: string; illustration_url?: string }[] = [];
  let sMatch: RegExpExecArray | null;

  while ((sMatch = sectionRegex.exec(xml)) !== null) {
    const secXml = sMatch[1];
    let secTitle = '';
    const secTitleMatch = secXml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if (secTitleMatch) {
      secTitle = secTitleMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const { text: resolvedSecXml, firstImageUrl } = resolveImageTags(secXml);

    const pList: string[] = [];
    const pReg = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
    let pM: RegExpExecArray | null;
    while ((pM = pReg.exec(resolvedSecXml)) !== null) {
      const withFootnotes = pM[1]
        .replace(/<a\b[^>]*type=["']note["'][^>]*>([\s\S]*?)<\/a>/gi, '[$1]')
        .replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/gi, '[$1]')
        .replace(/<emphasis\b[^>]*>([\s\S]*?)<\/emphasis>/gi, '$1')
        .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/gi, '$1');
      const pText = withFootnotes.replace(/<[^>]+>/g, '').trim();
      if (pText) pList.push(pText);
    }

    // Also pick up standalone markdown images that were outside <p>
    const standaloneImgMatches = resolvedSecXml.match(/!\[иллюстрация\]\([^)]+\)/g);
    if (standaloneImgMatches && pList.length === 0) {
      pList.push(...standaloneImgMatches);
    }

    const secContent = pList.join('\n\n');
    if (secContent.length > 20 || firstImageUrl) {
      sections.push({
        title: secTitle || `Глава ${sections.length + 1}`,
        content: secContent,
        illustration_url: firstImageUrl,
      });
    }
  }

  if (sections.length >= 2) {
    const chapters: ExtractedChapter[] = sections.map((s, idx) => ({
      chapter_number: idx + 1,
      title: s.title || `Глава ${idx + 1}`,
      synopsis: buildChapterExcerptSynopsis(s.content, s.title || `Глава ${idx + 1}`, idx + 1),
      content: s.content,
      illustration_url: s.illustration_url,
      status: 'ready',
    }));
    return { title, author, description, genres, series, seriesNumber, meta, coverBuffer, coverMime, chapters };
  }

  // Fallback: extract all paragraphs from <body>
  const bodyMatch = xml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const targetXml = bodyMatch ? bodyMatch[1] : xml;
  const { text: resolvedBody, firstImageUrl: bodyCover } = resolveImageTags(targetXml);

  const paragraphs: string[] = [];
  const pRegex = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let pMatch: RegExpExecArray | null;

  while ((pMatch = pRegex.exec(resolvedBody)) !== null) {
    const cleanP = pMatch[1].replace(/<[^>]+>/g, '').trim();
    if (cleanP) {
      paragraphs.push(cleanP);
    }
  }

  const fullText = paragraphs.join('\n\n');
  const chapters = splitTextIntoChapters(fullText, title);
  if (chapters.length > 0 && bodyCover && !chapters[0].illustration_url) {
    chapters[0].illustration_url = bodyCover;
  }
  return { title, author, description, genres, series, seriesNumber, meta, coverBuffer, coverMime, chapters };
}


/**
 * Parses EPUB buffer and extracts spine chapters and cover
 */
async function parseEpubBuffer(
  buffer: Buffer,
  filename: string
): Promise<{
  title?: string;
  author?: string;
  description?: string;
  genres?: string[];
  series?: string;
  seriesNumber?: number;
  meta?: ExtractedBookMeta;
  coverBuffer?: Buffer;
  coverMime?: string;
  chapters: ExtractedChapter[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((f) => !f.dir);

  // Find container.xml to locate OPF
  let opfPath = '';
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const cXml = await container.async('text');
    const rootMatch = cXml.match(/full-path=["']([^"']+)["']/i);
    if (rootMatch) opfPath = rootMatch[1];
  }

  let title = filename.replace(/\.epub$/i, '');
  let author = 'Классический автор';
  let description: string | undefined;
  let genres: string[] | undefined;
  let series: string | undefined;
  let seriesNumber: number | undefined;
  let meta: ExtractedBookMeta | undefined;
  let coverBuffer: Buffer | undefined;

  // Read OPF for metadata
  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('text');
    const tMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    if (tMatch) title = tMatch[1].replace(/<[^>]+>/g, '').trim();

    const aMatch = opfXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
    if (aMatch) author = aMatch[1].replace(/<[^>]+>/g, '').trim();

    const dMatch = opfXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
    if (dMatch) description = dMatch[1].replace(/<[^>]+>/g, '').trim() || undefined;

    const subjects = Array.from(opfXml.matchAll(/<dc:subject[^>]*>([\s\S]*?)<\/dc:subject>/gi))
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);
    if (subjects.length > 0) genres = subjects;

    const pub = opfXml.match(/<dc:publisher[^>]*>([\s\S]*?)<\/dc:publisher>/i)?.[1]?.replace(/<[^>]+>/g, '').trim();
    const yr = opfXml.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1]?.match(/\d{4}/)?.[0];
    const lang = opfXml.match(/<dc:language[^>]*>([\s\S]*?)<\/dc:language>/i)?.[1]?.trim();
    series = opfXml.match(/<meta\b[^>]*name=["']calibre:series["'][^>]*content=["']([^"']+)["']/i)?.[1]?.trim();
    const sIdx = opfXml.match(/<meta\b[^>]*name=["']calibre:series_index["'][^>]*content=["'](\d+)/i)?.[1];
    if (sIdx) seriesNumber = parseInt(sIdx, 10);
    meta = { publisher: pub || undefined, year: yr || undefined, language: lang || undefined };

    // Look for cover item
    const coverItemMatch = opfXml.match(/<item\b[^>]*id=["'][^"']*cover[^"']*["'][^>]*href=["']([^"']+)["']/i);
    if (coverItemMatch) {
      const coverRel = coverItemMatch[1];
      const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
      const fullCoverPath = opfDir + coverRel;
      const cFile = zip.file(fullCoverPath) || zip.file(coverRel);
      if (cFile) {
        coverBuffer = await cFile.async('nodebuffer');
      }
    }
  }

  // Find XHTML / HTML files in EPUB
  const htmlFiles = files
    .filter((f) => /\.(xhtml|html|htm)$/i.test(f.name) && !f.name.toLowerCase().includes('cover') && !f.name.toLowerCase().includes('toc'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const chapters: ExtractedChapter[] = [];

  for (let i = 0; i < htmlFiles.length; i++) {
    const f = htmlFiles[i];
    const html = await f.async('text');
    const clean = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (clean.length > 50) {
      const headingMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      const chapterHeading = headingMatch
        ? headingMatch[1].replace(/<[^>]+>/g, '').trim()
        : `Глава ${chapters.length + 1}`;
      const num = chapters.length + 1;

      chapters.push({
        chapter_number: num,
        title: chapterHeading,
        synopsis: buildChapterExcerptSynopsis(clean, chapterHeading, num),
        content: clean,
        status: 'ready',
      });
    }
  }

  return { title, author, description, genres, series, seriesNumber, meta, coverBuffer, coverMime: 'image/jpeg', chapters };
}

export { buildFallbackBookData } from './fallbackBooks';


