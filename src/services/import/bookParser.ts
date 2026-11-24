import JSZip from 'jszip';
import { ParsedChapter, TokenCostEstimation, DraftFragment } from '../../types';

export const BASE_LETTERS_PRICE_RUB = 15; // 15 руб за 100 000 букв
export const BASE_LETTERS_QUANTITY = 100000;
export const LETTERS_PER_RUBLE = 100000 / 15; // ~6666.67 букв за 1 рубль
export const TOKENS_PER_CHAR = 1 / 2.8; // ~2.8 characters per token in Cyrillic

/**
 * Calculates token count, letters cost and ruble cost for a given text
 * 1 token = 1 letter. 100 000 letters = 15 rubles (0.00015 rubles per letter).
 */
export function estimateTextCost(text: string): TokenCostEstimation {
  const clean = text.trim();
  const charCount = clean.length;
  const wordCount = clean ? clean.split(/\s+/).filter(Boolean).length : 0;
  // 1 token = 1 internal letter currency
  const estimatedTokens = Math.max(1, Math.ceil(charCount * TOKENS_PER_CHAR));
  const lettersCost = estimatedTokens;
  // 100 000 letters = 15 rubles
  const rublesCost = Number(((lettersCost / BASE_LETTERS_QUANTITY) * BASE_LETTERS_PRICE_RUB).toFixed(2));

  return {
    charCount,
    wordCount,
    estimatedTokens,
    lettersCost,
    rublesCost,
  };
}

/**
 * Code-based chapter splitter: breaks full book text into structured chapters
 * without using LLM tokens.
 */
export function splitBookIntoChapters(fullText: string, defaultTitle = 'Книга'): ParsedChapter[] {
  const text = fullText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!text) {
    return [
      {
        chapterNumber: 1,
        title: 'Глава 1',
        content: 'Текст произведения...',
        wordCount: 2,
      },
    ];
  }

  // Regex to detect chapter titles:
  // "   Глава 1: Название", "   Глава 2.В памятной записке", "Глава I", "Chapter 3", "Часть 2", "1. Название"
  const chapterPattern = /(?:^|\n)\s*(?:#{1,3}\s*)?(?:(?:Глава|ГЛАВА|глава|Chapter|CHAPTER|Часть|ЧАСТЬ|Эпизод|ЭПИЗОД|Раздел|РАЗДЕЛ)\s+([0-9IVXLCDMivxlcdm]+|[А-Яа-яёЁA-Za-z]+)?(?:[:.\-–—\s]*)([^\n]*)|(?:[0-9]+|[IVXLCDM]{1,8})\.\s+([^\n]+))/gi;

  const matches: { index: number; fullMatch: string; numStr?: string; titleStr?: string }[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterPattern.exec(text)) !== null) {
    const rawHeading = match[0].trim();
    const numStr = match[1] || '';
    const titleStr = (match[2] || match[3] || '').trim();
    if (rawHeading.length < 80) {
      matches.push({
        index: match.index,
        fullMatch: rawHeading,
        numStr,
        titleStr,
      });
    }
  }

  // If at least 2 distinct chapter headings were found, slice text by match indices
  if (matches.length >= 2) {
    const chapters: ParsedChapter[] = [];

    // Check if there is a prologue before first chapter
    if (matches[0].index > 100) {
      const prologueContent = text.slice(0, matches[0].index).trim();
      if (prologueContent.length > 80) {
        chapters.push({
          chapterNumber: 1,
          title: 'Пролог',
          content: prologueContent,
          wordCount: prologueContent.split(/\s+/).filter(Boolean).length,
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const nextIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
      let chapterBody = text.slice(current.index, nextIndex).trim();

      // Remove the chapter heading from the start of body
      if (chapterBody.startsWith(current.fullMatch)) {
        chapterBody = chapterBody.slice(current.fullMatch.length).trim();
      }

      const chapNum = chapters.length + 1;
      let cleanTitle = current.titleStr || `Глава ${chapNum}`;
      if (/^(глава|chapter|часть)/i.test(cleanTitle)) {
        cleanTitle = cleanTitle.replace(/^(глава|chapter|часть)\s*[0-9IVXLCDMivxlcdm.:\-–—\s]*/i, '').trim() || `Глава ${chapNum}`;
      }

      chapters.push({
        chapterNumber: chapNum,
        title: cleanTitle,
        content: chapterBody || 'Текст главы...',
        wordCount: chapterBody.split(/\s+/).filter(Boolean).length,
      });
    }

    if (chapters.length > 0) return chapters;
  }

  // Fallback: If no explicit chapter headings found, split by double line breaks
  // into logical chunks of ~1,500 - 2,500 words
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chapters: ParsedChapter[] = [];
  let currentParagraphs: string[] = [];
  let currentWords = 0;
  const TARGET_WORDS_PER_CHAPTER = 2000;

  for (const para of paragraphs) {
    const pWords = para.split(/\s+/).filter(Boolean).length;
    currentParagraphs.push(para);
    currentWords += pWords;

    if (currentWords >= TARGET_WORDS_PER_CHAPTER) {
      const chapNum = chapters.length + 1;
      const content = currentParagraphs.join('\n\n');
      chapters.push({
        chapterNumber: chapNum,
        title: `Часть ${chapNum}`,
        content,
        wordCount: currentWords,
      });
      currentParagraphs = [];
      currentWords = 0;
    }
  }

  if (currentParagraphs.length > 0) {
    const chapNum = chapters.length + 1;
    const content = currentParagraphs.join('\n\n');
    chapters.push({
      chapterNumber: chapNum,
      title: chapNum === 1 ? 'Начало' : `Часть ${chapNum}`,
      content,
      wordCount: currentWords,
    });
  }

  return chapters;
}

/**
 * Merge multiple draft fragments into a unified text or chapter list
 */
export function mergeDraftFragments(drafts: DraftFragment[]): { fullText: string; chapters: ParsedChapter[] } {
  const sorted = [...drafts].sort((a, b) => a.order - b.order);
  const chapters: ParsedChapter[] = sorted.map((d, idx) => ({
    chapterNumber: idx + 1,
    title: d.title || `Черновик ${idx + 1}`,
    content: d.content.trim(),
    wordCount: d.content.trim().split(/\s+/).filter(Boolean).length,
  }));

  const fullText = sorted
    .map((d, idx) => `=== Глава ${idx + 1}: ${d.title || 'Черновик ' + (idx + 1)} ===\n\n${d.content.trim()}`)
    .join('\n\n\n');

  return { fullText, chapters };
}

/**
 * Parses uploaded files (txt, fb2, epub, docx, doc, pdf, rtf, html, htm) into clean text
 */
export async function parseUploadedFileToText(file: File): Promise<{
  text: string;
  detectedTitle?: string;
  detectedAuthor?: string;
  detectedDescription?: string;
  detectedGenre?: string;
  coverBase64?: string;
  chapters?: ParsedChapter[];
}> {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  // 0. ZIP Archive (.zip, .fb2.zip, etc.)
  if (extension === 'zip') {
    try {
      const buffer = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(buffer);
      const files = Object.values(zip.files).filter((f) => !f.dir);

      // Find FB2 inside zip
      const fb2File = files.find((f) => f.name.toLowerCase().endsWith('.fb2'));
      if (fb2File) {
        const fb2Buf = await fb2File.async('arraybuffer');
        const headerSnippet = new TextDecoder('latin1').decode(fb2Buf.slice(0, 400));
        const isWin1251 = /encoding=["'](windows-1251|cp1251)["']/i.test(headerSnippet);
        let rawXml = '';
        try {
          rawXml = new TextDecoder(isWin1251 ? 'windows-1251' : 'utf-8').decode(fb2Buf);
        } catch {
          rawXml = new TextDecoder('utf-8').decode(fb2Buf);
        }
        return parseFb2Xml(rawXml, fb2File.name);
      }

      // Find EPUB inside zip
      const epubFile = files.find((f) => f.name.toLowerCase().endsWith('.epub'));
      if (epubFile) {
        const epubBuf = await epubFile.async('arraybuffer');
        return parseEpubArrayBuffer(epubBuf, epubFile.name);
      }

      // Find text file inside zip
      const txtFile = files.find((f) => /\.(txt|html?|rtf)$/i.test(f.name));
      if (txtFile) {
        const txtBuf = await txtFile.async('arraybuffer');
        let text = new TextDecoder('utf-8').decode(txtBuf);
        if ((text.match(/\uFFFD/g) || []).length > 5) {
          try {
            text = new TextDecoder('windows-1251').decode(txtBuf);
          } catch {
            // keep utf-8
          }
        }
        return { text, detectedTitle: txtFile.name.replace(/\.[^/.]+$/, '') };
      }
    } catch (zipErr) {
      console.warn('ZIP extraction notice:', zipErr);
    }
  }

  // 1. Plain Text (.txt)
  if (extension === 'txt') {
    const buffer = await file.arrayBuffer();
    // Try UTF-8 first, fallback to windows-1251 if replacement characters are high
    let text = new TextDecoder('utf-8').decode(buffer);
    if ((text.match(/\uFFFD/g) || []).length > 5) {
      try {
        text = new TextDecoder('windows-1251').decode(buffer);
      } catch {
        // keep utf-8
      }
    }
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let detectedTitle = file.name.replace(/\.txt$/i, '');
    let detectedAuthor: string | undefined;
    if (lines.length > 0 && lines[0].length < 80) {
      detectedTitle = lines[0];
    }
    if (lines.length > 1 && lines[1].length < 60 && !lines[1].includes('.')) {
      detectedAuthor = lines[1];
    }
    return { text, detectedTitle, detectedAuthor };
  }

  // 2. FictionBook2 (.fb2) with encoding autodetection (windows-1251 vs utf-8)
  if (extension === 'fb2') {
    const buffer = await file.arrayBuffer();
    const headerSnippet = new TextDecoder('latin1').decode(buffer.slice(0, 400));
    const isWin1251 = /encoding=["'](windows-1251|cp1251)["']/i.test(headerSnippet);

    let rawXml = '';
    if (isWin1251) {
      try {
        rawXml = new TextDecoder('windows-1251').decode(buffer);
      } catch {
        rawXml = new TextDecoder('utf-8').decode(buffer);
      }
    } else {
      rawXml = new TextDecoder('utf-8').decode(buffer);
      if ((rawXml.match(/\uFFFD/g) || []).length > 5) {
        try {
          rawXml = new TextDecoder('windows-1251').decode(buffer);
        } catch {
          // ignore
        }
      }
    }
    return parseFb2Xml(rawXml, file.name);
  }

  // 3. Electronic Publication (.epub)
  if (extension === 'epub') {
    try {
      const buffer = await file.arrayBuffer();
      return await parseEpubArrayBuffer(buffer, file.name);
    } catch (epubErr) {
      console.warn('EPUB parsing notice:', epubErr);
    }
  }

  // 4. Rich Text Format (.rtf)
  if (extension === 'rtf') {
    const buffer = await file.arrayBuffer();
    const cleanText = parseRtfToText(buffer);
    return {
      text: cleanText,
      detectedTitle: file.name.replace(/\.rtf$/i, ''),
    };
  }

  // 5. HTML document (.html, .htm)
  if (extension === 'html' || extension === 'htm') {
    const buffer = await file.arrayBuffer();
    let rawHtml = new TextDecoder('utf-8').decode(buffer);
    if ((rawHtml.match(/\uFFFD/g) || []).length > 5) {
      try {
        rawHtml = new TextDecoder('windows-1251').decode(buffer);
      } catch {
        // keep utf-8
      }
    }
    const cleanText = parseHtmlToText(rawHtml);
    const titleMatch = rawHtml.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const detectedTitle = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : file.name.replace(/\.html?$/i, '');
    const metaDesc = rawHtml.match(/<meta\b[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)?.[1];
    return {
      text: cleanText,
      detectedTitle,
      detectedDescription: metaDesc?.trim(),
    };
  }

  // 6. Word Document (.docx) via JSZip
  if (extension === 'docx') {
    try {
      const zip = new JSZip();
      const arrayBuffer = await file.arrayBuffer();
      const loaded = await zip.loadAsync(arrayBuffer);
      const docXmlFile = loaded.file('word/document.xml');

      if (docXmlFile) {
        const docXml = await docXmlFile.async('text');
        const paragraphs: string[] = [];
        const pRegex = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/gi;
        let pMatch: RegExpExecArray | null;

        while ((pMatch = pRegex.exec(docXml)) !== null) {
          const pContent = pMatch[1];
          const tRegex = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi;
          let tMatch: RegExpExecArray | null;
          let pText = '';
          while ((tMatch = tRegex.exec(pContent)) !== null) {
            pText += tMatch[1];
          }
          if (pText.trim()) {
            paragraphs.push(pText.trim());
          }
        }

        if (paragraphs.length > 0) {
          return {
            text: paragraphs.join('\n\n'),
            detectedTitle: file.name.replace(/\.docx$/i, ''),
          };
        }
      }
    } catch (docxErr) {
      console.warn('DOCX zip parsing notice:', docxErr);
    }
  }

  // 7. PDF text extraction
  if (extension === 'pdf') {
    try {
      const buffer = await file.arrayBuffer();
      const raw = new TextDecoder('latin1').decode(buffer);
      const textChunks: string[] = [];

      const tjRegex = /\(([^)]+)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjRegex.exec(raw)) !== null) {
        const decoded = tjMatch[1].replace(/\\([0-9]{3})/g, (_, oct) =>
          String.fromCharCode(parseInt(oct, 8))
        );
        if (decoded.trim().length > 1) {
          textChunks.push(decoded.trim());
        }
      }

      if (textChunks.length > 10) {
        return {
          text: textChunks.join('\n\n'),
          detectedTitle: file.name.replace(/\.pdf$/i, ''),
        };
      }
    } catch {
      // fallback
    }
  }

  // 8. General fallback
  const rawText = await file.text();
  const clean = extractReadableTextFromXmlHtml(rawText);
  return {
    text: clean.trim() || `[Импортирован файл ${file.name}]`,
    detectedTitle: file.name.replace(/\.[^/.]+$/, ''),
  };
}

/**
 * Fast parser for EPUB array buffer
 */
async function parseEpubArrayBuffer(
  buffer: ArrayBuffer,
  filename: string
): Promise<{
  text: string;
  detectedTitle?: string;
  detectedAuthor?: string;
  detectedDescription?: string;
  coverBase64?: string;
  chapters?: ParsedChapter[];
}> {
  const zip = await JSZip.loadAsync(buffer);
  const files = Object.values(zip.files).filter((f) => !f.dir);

  let opfPath = '';
  const container = zip.file('META-INF/container.xml');
  if (container) {
    const cXml = await container.async('text');
    const rootMatch = cXml.match(/full-path=["']([^"']+)["']/i);
    if (rootMatch) opfPath = rootMatch[1];
  }

  let title = filename.replace(/\.epub$/i, '');
  let author = '';
  let description = '';
  let coverBase64 = '';

  if (opfPath && zip.file(opfPath)) {
    const opfXml = await zip.file(opfPath)!.async('text');
    const tMatch = opfXml.match(/<dc:title[^>]*>([\s\S]*?)<\/dc:title>/i);
    if (tMatch) title = tMatch[1].replace(/<[^>]+>/g, '').trim();

    const aMatch = opfXml.match(/<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i);
    if (aMatch) author = aMatch[1].replace(/<[^>]+>/g, '').trim();

    const dMatch = opfXml.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
    if (dMatch) description = dMatch[1].replace(/<[^>]+>/g, '').trim();

    const coverItem = opfXml.match(/<item\b[^>]*id=["'][^"']*cover[^"']*["'][^>]*href=["']([^"']+)["']/i);
    if (coverItem) {
      const coverRel = coverItem[1];
      const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
      const fullCoverPath = opfDir + coverRel;
      const cFile = zip.file(fullCoverPath) || zip.file(coverRel);
      if (cFile) {
        const b64 = await cFile.async('base64');
        const ext = cFile.name.split('.').pop()?.toLowerCase();
        coverBase64 = `data:image/${ext === 'png' ? 'png' : 'jpeg'};base64,${b64}`;
      }
    }
  }

  // Find XHTML / HTML files in EPUB
  const htmlFiles = files
    .filter((f) => /\.(xhtml|html|htm)$/i.test(f.name) && !f.name.toLowerCase().includes('cover') && !f.name.toLowerCase().includes('toc'))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const chapters: ParsedChapter[] = [];
  const textChunks: string[] = [];

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

    if (clean.length > 40) {
      const headingMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
      const chapterHeading = headingMatch
        ? headingMatch[1].replace(/<[^>]+>/g, '').trim()
        : `Глава ${chapters.length + 1}`;

      chapters.push({
        chapterNumber: chapters.length + 1,
        title: chapterHeading,
        content: clean,
        wordCount: clean.split(/\s+/).filter(Boolean).length,
      });
      textChunks.push(`=== ${chapterHeading} ===\n\n${clean}`);
    }
  }

  return {
    text: textChunks.join('\n\n\n'),
    detectedTitle: title,
    detectedAuthor: author,
    detectedDescription: description,
    coverBase64,
    chapters: chapters.length > 0 ? chapters : undefined,
  };
}

/**
 * Fast parser for FictionBook2 (.fb2) with section chapters and embedded cover
 */
export function parseFb2Xml(
  xml: string,
  filename: string
): {
  text: string;
  detectedTitle?: string;
  detectedAuthor?: string;
  detectedDescription?: string;
  detectedGenre?: string;
  coverBase64?: string;
  chapters?: ParsedChapter[];
} {
  let title = filename.replace(/\.fb2$/i, '');
  const titleMatch = xml.match(/<book-title>([\s\S]*?)<\/book-title>/i);
  if (titleMatch && titleMatch[1]) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Extract author
  let author = '';
  const firstName = xml.match(/<first-name>([\s\S]*?)<\/first-name>/i)?.[1]?.replace(/<[^>]+>/g, '')?.trim();
  const lastName = xml.match(/<last-name>([\s\S]*?)<\/last-name>/i)?.[1]?.replace(/<[^>]+>/g, '')?.trim();
  if (firstName || lastName) {
    author = [firstName, lastName].filter(Boolean).join(' ');
  }

  // Extract annotation / description
  let description = '';
  const annotMatch = xml.match(/<annotation\b[^>]*>([\s\S]*?)<\/annotation>/i);
  if (annotMatch && annotMatch[1]) {
    description = annotMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Extract genre
  let genre = '';
  const genreMatch = xml.match(/<genre\b[^>]*>([\s\S]*?)<\/genre>/i);
  if (genreMatch && genreMatch[1]) {
    genre = genreMatch[1].replace(/<[^>]+>/g, '').trim();
  }

  // Extract all embedded binary images into a map (for covers & chapter illustrations)
  const binaryMap = new Map<string, string>();
  const binRegex = /<binary\b[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/binary>/gi;
  let bMatch: RegExpExecArray | null;

  while ((bMatch = binRegex.exec(xml)) !== null) {
    const rawId = bMatch[1].trim();
    const cleanId = rawId.replace(/^#/, '');
    const cleanData = bMatch[2].replace(/[\r\n\s]+/g, '');
    if (cleanData.length > 50) {
      const isPng = cleanId.toLowerCase().endsWith('.png') || cleanData.startsWith('iVBORw0KGgo');
      const mime = isPng ? 'image/png' : 'image/jpeg';
      const dataUrl = `data:${mime};base64,${cleanData}`;
      binaryMap.set(cleanId, dataUrl);
      binaryMap.set(cleanId.toLowerCase(), dataUrl);
    }
  }

  // Identify cover
  let coverBase64 = '';
  const coverHref = xml.match(/<coverpage\b[^>]*>[\s\S]*?<image\b[^>]*(?:l:href|xlink:href|href)=["']#?([^"']+)["']/i)?.[1];
  if (coverHref) {
    const cleanCoverId = coverHref.replace(/^#/, '');
    coverBase64 = binaryMap.get(cleanCoverId) || binaryMap.get(cleanCoverId.toLowerCase()) || '';
  }
  if (!coverBase64) {
    coverBase64 = binaryMap.get('cover.jpg') || binaryMap.get('cover.png') || '';
  }
  if (!coverBase64 && binaryMap.size > 0) {
    coverBase64 = binaryMap.values().next().value || '';
  }

  const resolveImageTags = (rawContent: string): { text: string; firstImageUrl?: string } => {
    let firstImageUrl: string | undefined;
    const withImages = rawContent.replace(/<image\b[^>]*(?:l:href|xlink:href|href)=["']#?([^"']+)["'][^>]*\/?>/gi, (_match, imgId) => {
      const cleanId = String(imgId || '').replace(/^#/, '').trim();
      const found = binaryMap.get(cleanId) || binaryMap.get(cleanId.toLowerCase());
      if (found) {
        if (!firstImageUrl) firstImageUrl = found;
        return `\n\n![иллюстрация](${found})\n\n`;
      }
      return '';
    });
    return { text: withImages, firstImageUrl };
  };

  // Check if FB2 has explicit <section> blocks (standard for chapters in Russian FB2)
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

    // Pick up standalone markdown images that were outside <p>
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
    const chapters: ParsedChapter[] = sections.map((s, idx) => ({
      chapterNumber: idx + 1,
      title: s.title || `Глава ${idx + 1}`,
      content: s.content,
      illustration_url: s.illustration_url,
      wordCount: s.content.split(/\s+/).filter(Boolean).length,
    }));
    const fullText = sections.map((s) => `=== ${s.title} ===\n\n${s.content}`).join('\n\n\n');
    return {
      text: fullText,
      detectedTitle: title,
      detectedAuthor: author,
      detectedDescription: description,
      detectedGenre: genre,
      coverBase64,
      chapters,
    };
  }

  // Fallback: Extract paragraphs <p>...</p> inside <body>
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

  const text = paragraphs.length > 0 ? paragraphs.join('\n\n') : extractReadableTextFromXmlHtml(targetXml);
  return {
    text,
    detectedTitle: title,
    detectedAuthor: author,
    detectedDescription: description,
    detectedGenre: genre,
    coverBase64: coverBase64 || bodyCover,
  };
}

/**
 * Parses RTF (Rich Text Format) buffer or string to clean text
 */
export function parseRtfToText(bufferOrStr: ArrayBuffer | string): string {
  let raw = '';
  if (typeof bufferOrStr === 'string') {
    raw = bufferOrStr;
  } else {
    try {
      raw = new TextDecoder('latin1').decode(bufferOrStr);
    } catch {
      raw = new TextDecoder('utf-8').decode(bufferOrStr);
    }
  }

  // Convert \'xx hex codes (Russian Windows-1251 encoded bytes)
  raw = raw.replace(/(?:\\'[0-9a-fA-F]{2})+/g, (match) => {
    try {
      const hexes = match.split('\\\'').filter(Boolean);
      const bytes = new Uint8Array(hexes.map((h) => parseInt(h, 16)));
      return new TextDecoder('windows-1251').decode(bytes);
    } catch {
      return match;
    }
  });

  // Handle unicode escapes \u1234?
  raw = raw.replace(/\\u(-?\d+)\??/g, (_, code) => {
    const num = parseInt(code, 10);
    return String.fromCharCode(num < 0 ? num + 65536 : num);
  });

  // Strip RTF control groups: {\fonttbl...}, {\colortbl...}, {\stylesheet...}, {\info...}, {\*\...}
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

/**
 * Strips HTML tags and preserves headings as chapter boundaries
 */
export function parseHtmlToText(html: string): string {
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

/**
 * Strips HTML and XML tags preserving line-breaks
 */
function extractReadableTextFromXmlHtml(raw: string): string {
  return raw
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
