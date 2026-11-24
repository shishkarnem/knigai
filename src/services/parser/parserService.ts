/**
 * Unified Parser Service Orchestrator (Librarr-style architecture)
 * Aggregates OPDS, Anna's Archive, LibriVox audiobooks and Open Archives
 */
import { Book, Chapter, ParsedBookSearchResult } from '../../types';
import { OpdsDriver } from './opdsDriver';
import { LibrivoxDriver } from './librivoxDriver';
import { AnnasDriver } from './annasDriver';
import { ParserSearchOptions, ImportParsedBookPayload } from './types';
import { saveNewBook, saveChapter } from '../db/bookRepository';
import { saveBookToDeviceCache } from '../storage/offlineCache';

export const normalizeString = (val: any, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'string' ? item : item?.name || String(item || '')))
      .filter(Boolean)
      .join(', ')
      .trim() || fallback;
  }
  if (typeof val === 'object') {
    if (val.name) return String(val.name).trim();
    if (val.title) return String(val.title).trim();
    return fallback;
  }
  return String(val).trim();
};

class BookParserService {
  private opds = new OpdsDriver();
  private librivox = new LibrivoxDriver();
  private annas = new AnnasDriver();

  /**
   * Search Flibusta OPDS and mirrors via backend proxy
   */
  async searchFlibusta(options: ParserSearchOptions): Promise<ParsedBookSearchResult[]> {
    try {
      const q = encodeURIComponent(options.query || '');
      const type = encodeURIComponent(options.searchType || 'title');
      const format = options.preferredFormat ? `&format=${encodeURIComponent(options.preferredFormat)}` : '';
      const res = await fetch(`/api/parser/flibusta/search?q=${q}&type=${type}${format}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        return (data.items || []).map((it: any) => ({
          ...it,
          source: 'flibusta',
          sourceName: 'Флибуста (Flibusta)',
          contentType: 'book',
          format: it.format || 'fb2',
          downloadUrl: it.availableFormats?.[0]?.downloadUrl || it.downloadUrl,
        }));
      }
    } catch (err) {
      console.warn('[parserService] Flibusta search notice:', err);
    }
    return [];
  }

  /**
   * Fetch rich Flibusta book details (full annotation, genres, series, translator, pages) on demand
   */
  async fetchFlibustaDetails(bookId: string): Promise<Partial<ParsedBookSearchResult>> {
    const cleanId = String(bookId || '').replace(/\D/g, '');
    if (!cleanId) return {};
    try {
      const res = await fetch(`/api/parser/flibusta/details/${encodeURIComponent(cleanId)}`, {
        signal: AbortSignal.timeout(7000),
      });
      if (res.ok) {
        const data = await res.json();
        return data.details || {};
      }
    } catch (err) {
      console.warn('[parserService] Flibusta details notice:', err);
    }
    return {};
  }

  /**
   * Search across selected catalog or all enabled drivers in parallel
   */
  async search(options: ParserSearchOptions): Promise<ParsedBookSearchResult[]> {
    const { category = 'all', catalog = 'all' } = options;

    const promises: Promise<ParsedBookSearchResult[]>[] = [];

    // 1. If catalog is 'flibusta', prioritize or isolate Flibusta
    if (catalog === 'flibusta' || catalog === 'all') {
      promises.push(this.searchFlibusta(options).catch(() => []));
    }

    // 2. If catalog is 'all' or 'samlib' or 'librusec'
    if (catalog !== 'flibusta' && catalog !== 'audio') {
      promises.push(this.opds.search(options).catch(() => []));
    }

    // 3. Audiobooks catalog
    if ((category === 'all' || category === 'audio' || catalog === 'audio') && catalog !== 'flibusta') {
      promises.push(this.librivox.search(options).catch(() => []));
    }

    // 4. Open archives
    if ((category === 'all' || category === 'books') && catalog === 'all') {
      promises.push(this.annas.search(options).catch(() => []));
    }

    const settled = await Promise.all(promises);
    const combined = settled.flat();

    // Deduplicate by clean title and author
    const seen = new Set<string>();
    const deduplicated: ParsedBookSearchResult[] = [];

    for (const rawItem of combined) {
      if (!rawItem) continue;
      const cleanTitle = normalizeString(rawItem.title, 'Без названия');
      const cleanAuthor = normalizeString(rawItem.author, 'Классический автор');
      const item: ParsedBookSearchResult = {
        ...rawItem,
        title: cleanTitle,
        author: cleanAuthor,
      };

      const key = `${cleanTitle.toLowerCase()}_${cleanAuthor.toLowerCase()}_${item.contentType}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    return deduplicated;
  }

  /**
   * Import parsed book or audiobook into KnigAI:
   * 1. Resolves direct download URL if format was chosen
   * 2. Calls server to download asset and upload to cloud storage
   * 3. Registers asset in Gallery (file_storage)
   * 4. Creates Book entity in DB & offline cache
   * 5. Converts chapters or attaches audio tracks for 3D reader
   */
  async importBook(payload: ImportParsedBookPayload): Promise<{ book: Book; chapters: Chapter[] }> {
    const { item, user_uid, chosenFormat } = payload;
    let targetItem = { ...item };

    // If specific format was selected (e.g. epub, mobi, txt.zip, pdf)
    if (chosenFormat) {
      targetItem.format = chosenFormat.replace('.zip', '') as any;
      if (item.availableFormats) {
        const matched = item.availableFormats.find((f) => f.format === chosenFormat);
        if (matched?.downloadUrl) {
          targetItem.downloadUrl = matched.downloadUrl;
        }
      }
    }

    // If item is from Flibusta with a numeric bookId, resolve direct download URL
    if (targetItem.source === 'flibusta' && (targetItem.bookId || targetItem.downloadUrl.includes('flibusta.su'))) {
      const bId = targetItem.bookId || targetItem.downloadUrl.match(/\/book\/(\d+)/)?.[1];
      if (bId) {
        try {
          const res = await fetch('/api/parser/flibusta/resolve-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookId: bId, format: chosenFormat || targetItem.format || 'fb2.zip' }),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.downloadUrl) {
              targetItem.downloadUrl = data.downloadUrl;
            }
          }
        } catch (resolveErr) {
          console.warn('[parserService] Download resolve notice:', resolveErr);
        }
      }
    }

    // Call server to fetch, transfer to storage and register in file_storage
    const response = await fetch('/api/parser/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        item: targetItem,
        user_uid: user_uid || null,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ошибка импорта через сервер: ${errText}`);
    }

    const data = await response.json();
    const importedBook: Book = {
      ...data.book,
      is_parsed_source: true,
      original_file_url: data.original_file_url || data.book.original_file_url,
      file_storage_id: data.file_storage_id || data.book.file_storage_id,
    };
    const importedChapters: Chapter[] = data.chapters || [];

    // Save in client repository & offline cache
    const savedBook = await saveNewBook(importedBook, user_uid);
    const savedChapters: Chapter[] = [];

    for (const ch of importedChapters) {
      const savedChap = await saveChapter(
        { ...ch, book_id: savedBook.id },
        undefined,
        user_uid
      );
      savedChapters.push(savedChap);
    }

    // Cache locally for offline reading
    await saveBookToDeviceCache(savedBook, savedChapters);

    return {
      book: savedBook,
      chapters: savedChapters,
    };
  }
}

export const parserService = new BookParserService();
