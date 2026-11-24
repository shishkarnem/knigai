/**
 * Robust EPUB and MOBI / AZW / AZW3 Parser
 * Parses complete e-books into structured chapters with full page preservation
 */
import JSZip from 'jszip';
import { ParsedChapter } from '../../types';
import { splitBookIntoChapters } from './bookParser';

export interface ParsedEpubResult {
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  chapters: ParsedChapter[];
}

/**
 * Extracts all chapters and metadata from an EPUB file using JSZip
 */
export async function parseEpubFile(file: File): Promise<ParsedEpubResult> {
  const zip = new JSZip();
  const arrayBuffer = await file.arrayBuffer();
  const loadedZip = await zip.loadAsync(arrayBuffer);

  // 1. Find OPF package file from container.xml
  let opfPath = 'content.opf';
  const containerXmlFile = loadedZip.file('META-INF/container.xml');
  if (containerXmlFile) {
    const containerXml = await containerXmlFile.async('text');
    const fullPathMatch = containerXml.match(/full-path\s*=\s*["']([^"']+)["']/i);
    if (fullPathMatch && fullPathMatch[1]) {
      opfPath = fullPathMatch[1];
    }
  }

  // 2. Read OPF file
  let opfContent = '';
  const opfFile = loadedZip.file(opfPath) || loadedZip.file(new RegExp('\\.opf$', 'i'))[0];
  if (opfFile) {
    opfContent = await opfFile.async('text');
    opfPath = opfFile.name;
  }

  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

  // Extract metadata
  const titleMatch = opfContent.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
  const title = (titleMatch ? titleMatch[1].trim() : file.name.replace(/\.epub$/i, '')) || 'Книга';

  const authorMatch = opfContent.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);
  const author = authorMatch ? authorMatch[1].trim() : 'Классический автор';

  const descMatch = opfContent.match(/<dc:description[^>]*>([\s\S]*?)<\/dc:description>/i);
  const description = descMatch ? descMatch[1].replace(/<[^>]+>/g, '').trim() : '';

  // 3. Extract manifest and spine order
  const manifestMap = new Map<string, string>();
  const manifestRegex = /<item\s+[^>]*id\s*=\s*["']([^"']+)["'][^>]*href\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  let mMatch: RegExpExecArray | null;

  while ((mMatch = manifestRegex.exec(opfContent)) !== null) {
    manifestMap.set(mMatch[1], mMatch[2]);
  }

  // Also check alternate attribute ordering
  const manifestRegexAlt = /<item\s+[^>]*href\s*=\s*["']([^"']+)["'][^>]*id\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  while ((mMatch = manifestRegexAlt.exec(opfContent)) !== null) {
    manifestMap.set(mMatch[2], mMatch[1]);
  }

  // Read spine itemrefs
  const spineIds: string[] = [];
  const spineRegex = /<itemref\s+[^>]*idref\s*=\s*["']([^"']+)["'][^>]*\/?>/gi;
  let sMatch: RegExpExecArray | null;

  while ((sMatch = spineRegex.exec(opfContent)) !== null) {
    spineIds.push(sMatch[1]);
  }

  // Resolve chapter files in spine order
  const chapterHrefs: string[] = [];
  for (const id of spineIds) {
    const href = manifestMap.get(id);
    if (href) {
      chapterHrefs.push(href);
    }
  }

  // If spine was empty, fallback to searching all html/xhtml files
  if (chapterHrefs.length === 0) {
    loadedZip.forEach((relPath) => {
      if (/\.(xhtml|html|htm)$/i.test(relPath) && !relPath.toLowerCase().includes('toc')) {
        chapterHrefs.push(relPath);
      }
    });
    chapterHrefs.sort();
  }

  // 4. Extract chapters content
  const chapters: ParsedChapter[] = [];
  let fullAccumulatedText = '';

  for (let i = 0; i < chapterHrefs.length; i++) {
    const rawHref = decodeURIComponent(chapterHrefs[i].split('#')[0]);
    const fullPath = opfDir ? resolvePath(opfDir, rawHref) : rawHref;

    const fileObj = loadedZip.file(fullPath) || loadedZip.file(new RegExp(escapeRegExp(rawHref) + '$', 'i'))[0];
    if (!fileObj) continue;

    const html = await fileObj.async('text');
    const cleanChapterText = extractReadableTextFromHtml(html);
    if (!cleanChapterText || cleanChapterText.length < 20) continue;

    // Detect chapter title from heading tags
    const headingMatch = html.match(/<(h[1-3]|title)[^>]*>([\s\S]*?)<\/\1>/i);
    let chapTitle = headingMatch ? headingMatch[2].replace(/<[^>]+>/g, '').trim() : '';
    if (!chapTitle || chapTitle.length > 50) {
      chapTitle = `Глава ${chapters.length + 1}`;
    }

    chapters.push({
      chapterNumber: chapters.length + 1,
      title: chapTitle,
      content: cleanChapterText,
      wordCount: cleanChapterText.split(/\s+/).filter(Boolean).length,
    });

    fullAccumulatedText += (fullAccumulatedText ? '\n\n' : '') + cleanChapterText;
  }

  // If chapters were too few (e.g. whole book in 1 big file), split properly
  if (chapters.length <= 1 && fullAccumulatedText.length > 1500) {
    const reSplit = splitBookIntoChapters(fullAccumulatedText, title);
    if (reSplit.length > 1) {
      return {
        title,
        author,
        description,
        chapters: reSplit,
      };
    }
  }

  if (chapters.length === 0) {
    chapters.push({
      chapterNumber: 1,
      title: title,
      content: fullAccumulatedText || 'Содержимое книги...',
      wordCount: fullAccumulatedText.split(/\s+/).filter(Boolean).length || 10,
    });
  }

  return {
    title,
    author,
    description,
    chapters,
  };
}

/**
 * Parses MOBI / AZW / AZW3 files into clean readable chapters
 */
export async function parseMobiFile(file: File): Promise<{ title: string; chapters: ParsedChapter[] }> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  // Read Palm Database Title (first 32 bytes)
  let title = '';
  for (let i = 0; i < 32 && bytes[i] !== 0; i++) {
    title += String.fromCharCode(bytes[i]);
  }
  title = title.trim() || file.name.replace(/\.(mobi|azw3?)$/i, '');

  // PalmDOC record parsing: header starts after 78 bytes
  // Number of records at offset 76 (2 bytes big endian)
  const numRecords = (bytes[76] << 8) | bytes[77];
  let extractedText = '';

  if (numRecords > 1) {
    // Read record 0 header at record offset table
    // Record offset table starts at byte 78, each entry is 8 bytes (4 byte offset, 4 byte attr)
    const recordOffsets: number[] = [];
    for (let i = 0; i < Math.min(numRecords, 200); i++) {
      const idx = 78 + i * 8;
      const offset = (bytes[idx] << 24) | (bytes[idx + 1] << 16) | (bytes[idx + 2] << 8) | bytes[idx + 3];
      recordOffsets.push(offset);
    }

    // Record 0 has PalmDOC header (compression type at offset + 0)
    // 1 = uncompressed, 2 = PalmDOC LZ77 compression
    const rec0Offset = recordOffsets[0];
    const compression = (bytes[rec0Offset] << 8) | bytes[rec0Offset + 1];
    const textRecordCount = (bytes[rec0Offset + 8] << 8) | bytes[rec0Offset + 9];

    const recordsToRead = Math.min(textRecordCount || numRecords - 1, recordOffsets.length - 1);

    for (let r = 1; r <= recordsToRead; r++) {
      const start = recordOffsets[r];
      const end = r < recordOffsets.length - 1 ? recordOffsets[r + 1] : bytes.length;
      if (start >= bytes.length || end > bytes.length || end <= start) continue;

      const recordBytes = bytes.slice(start, end);

      if (compression === 2) {
        // Decompress PalmDOC LZ77
        extractedText += decompressPalmDoc(recordBytes);
      } else {
        // Plain text / HTML
        extractedText += new TextDecoder('utf-8', { fatal: false }).decode(recordBytes);
      }
    }
  }

  // If extraction succeeded and has HTML, strip tags
  let cleanText = extractReadableTextFromHtml(extractedText);
  if (!cleanText || cleanText.length < 50) {
    // Fallback: extract ASCII/Cyrillic strings from binary buffer
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(bytes);
    cleanText = raw.replace(/[^\x20-\x7E\u0400-\u04FF\n\r\t]/g, ' ').replace(/\s{2,}/g, ' ');
  }

  const chapters = splitBookIntoChapters(cleanText, title);
  return { title, chapters };
}

/**
 * PalmDOC LZ77 decompression algorithm
 */
function decompressPalmDoc(data: Uint8Array): string {
  const result: number[] = [];
  let i = 0;
  const len = data.length;

  while (i < len) {
    const c = data[i++];
    if (c >= 1 && c <= 8) {
      // Copy next c bytes literally
      for (let j = 0; j < c && i < len; j++) {
        result.push(data[i++]);
      }
    } else if (c <= 0x7f) {
      // Single literal byte
      result.push(c);
    } else if (c >= 0xc0) {
      // Space + char
      result.push(0x20);
      result.push(c ^ 0x80);
    } else if (i < len) {
      // c >= 0x80 && c <= 0xbf: Distance / Length pair
      const next = data[i++];
      const distance = ((c & 0x3f) << 3) | (next >> 5);
      const length = (next & 0x1f) + 3;

      let src = result.length - distance;
      for (let j = 0; j < length; j++) {
        if (src >= 0 && src < result.length) {
          result.push(result[src]);
        }
        src++;
      }
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(result));
}

function resolvePath(dir: string, href: string): string {
  const parts = dir.split('/').concat(href.split('/'));
  const resolved: string[] = [];
  for (const p of parts) {
    if (!p || p === '.') continue;
    if (p === '..') {
      resolved.pop();
    } else {
      resolved.push(p);
    }
  }
  return resolved.join('/');
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractReadableTextFromHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
