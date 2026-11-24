import { Book, Chapter, Character } from '../../types';
import { fetchChapters, fetchCharacters } from '../db/bookRepository';

const OFFLINE_MANIFEST_KEY = 'knigai_offline_manifest_v1';
const OFFLINE_BOOK_PREFIX = 'knigai_offline_book_';

export interface CachedBookBundle {
  book: Book;
  chapters: Chapter[];
  characters: Character[];
  cachedAt: string;
  sizeBytes: number;
}

/**
 * Returns list of book IDs that are cached locally on this device
 */
export function getCachedBookIds(): number[] {
  try {
    const raw = localStorage.getItem(OFFLINE_MANIFEST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Checks if a specific book is cached on this device
 */
export function isBookCachedLocally(bookId: number): boolean {
  const ids = getCachedBookIds();
  return ids.includes(bookId);
}

/**
 * Retrieves full cached bundle for a book (book metadata + all chapters + characters)
 */
export function getCachedBookBundle(bookId: number): CachedBookBundle | null {
  try {
    const raw = localStorage.getItem(`${OFFLINE_BOOK_PREFIX}${bookId}`);
    if (!raw) return null;
    return JSON.parse(raw) as CachedBookBundle;
  } catch (e) {
    console.warn(`Failed to read cached book ${bookId}:`, e);
    return null;
  }
}

/**
 * Returns all books currently cached on this device for offline reading
 */
export function getAllCachedBooks(): Book[] {
  const ids = getCachedBookIds();
  const books: Book[] = [];
  const validIds: number[] = [];

  for (const id of ids) {
    const bundle = getCachedBookBundle(id);
    if (bundle && bundle.book) {
      books.push(bundle.book);
      validIds.push(id);
    }
  }

  // Self-heal manifest: prune stale/orphan IDs from localStorage
  if (validIds.length !== ids.length) {
    try {
      localStorage.setItem(OFFLINE_MANIFEST_KEY, JSON.stringify(validIds));
    } catch {
      // ignore
    }
  }

  return books;
}

/**
 * Downloads and caches a book, all its chapters, and characters onto this device
 */
export async function saveBookToDeviceCache(
  book: Book,
  existingChapters?: Chapter[],
  existingCharacters?: Character[]
): Promise<CachedBookBundle> {
  let chapters = existingChapters;
  if (!chapters || chapters.length === 0) {
    chapters = await fetchChapters(book.id, book.user_uid);
  }

  let characters = existingCharacters;
  if (!characters) {
    characters = await fetchCharacters(book.id, book.user_uid);
  }

  const bundle: CachedBookBundle = {
    book,
    chapters: chapters || [],
    characters: characters || [],
    cachedAt: new Date().toISOString(),
    sizeBytes: 0,
  };

  const serialized = JSON.stringify(bundle);
  bundle.sizeBytes = new Blob([serialized]).size;

  // Save book bundle
  localStorage.setItem(`${OFFLINE_BOOK_PREFIX}${book.id}`, serialized);

  // Update manifest
  const ids = getCachedBookIds();
  if (!ids.includes(book.id)) {
    ids.unshift(book.id);
    localStorage.setItem(OFFLINE_MANIFEST_KEY, JSON.stringify(ids));
  }

  return bundle;
}

/**
 * Removes a book from device cache
 */
export function removeBookFromDeviceCache(bookId: number): void {
  try {
    localStorage.removeItem(`${OFFLINE_BOOK_PREFIX}${bookId}`);
    const ids = getCachedBookIds().filter((id) => id !== bookId);
    localStorage.setItem(OFFLINE_MANIFEST_KEY, JSON.stringify(ids));
  } catch (e) {
    console.warn(`Failed to remove book ${bookId} from cache:`, e);
  }
}

/**
 * Calculates offline storage summary
 */
export function getOfflineStorageStats(): { count: number; approxMb: string } {
  const books = getAllCachedBooks();
  let totalBytes = 0;

  for (const b of books) {
    try {
      const raw = localStorage.getItem(`${OFFLINE_BOOK_PREFIX}${b.id}`);
      if (raw) {
        totalBytes += raw.length * 2; // rough UTF-16 byte estimation
      }
    } catch {
      // ignore
    }
  }

  const mb = (totalBytes / (1024 * 1024)).toFixed(2);
  return {
    count: books.length,
    approxMb: mb,
  };
}
