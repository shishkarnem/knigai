import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'server', 'data');

if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.warn('[LocalDb] Failed to create data dir:', err);
  }
}

function getFilePath(collection: string): string {
  return path.join(DATA_DIR, `${collection}.json`);
}

function readCollection<T>(collection: string): T[] {
  try {
    const file = getFilePath(collection);
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw || '[]');
  } catch (err) {
    console.warn(`[LocalDb] Read error for ${collection}:`, err);
    return [];
  }
}

function writeCollection<T>(collection: string, items: T[]): void {
  try {
    const file = getFilePath(collection);
    fs.writeFileSync(file, JSON.stringify(items, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[LocalDb] Write error for ${collection}:`, err);
  }
}

export const localDb = {
  getBooks(): any[] {
    return readCollection('books');
  },

  saveBook(book: any): any {
    const list = readCollection<any>('books');
    const existingIdx = list.findIndex((b) => b.id === book.id || (b.slug && b.slug === book.slug));
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...book, updated_at: new Date().toISOString() };
    } else {
      const id = book.id || Date.now();
      list.unshift({ ...book, id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    }
    writeCollection('books', list);
    return book;
  },

  deleteBook(id: number): boolean {
    const list = readCollection<any>('books');
    const filtered = list.filter((b) => b.id !== id);
    writeCollection('books', filtered);

    // Also remove its chapters
    const chapters = readCollection<any>('chapters');
    const filteredChapters = chapters.filter((c) => c.book_id !== id);
    writeCollection('chapters', filteredChapters);
    return true;
  },

  getChapters(bookId: number): any[] {
    const all = readCollection<any>('chapters');
    return all.filter((c) => c.book_id === bookId).sort((a, b) => a.chapter_number - b.chapter_number);
  },

  saveChapters(bookId: number, chapters: any[]): any[] {
    const all = readCollection<any>('chapters');
    const other = all.filter((c) => c.book_id !== bookId);
    const withIds = chapters.map((ch, idx) => ({
      ...ch,
      id: ch.id || Date.now() + idx,
      book_id: bookId,
      created_at: ch.created_at || new Date().toISOString(),
    }));
    writeCollection('chapters', [...other, ...withIds]);
    return withIds;
  },

  getFiles(): any[] {
    return readCollection('file_storage');
  },

  saveFile(fileRecord: any): any {
    const list = readCollection<any>('file_storage');
    const existingIdx = list.findIndex((f) => f.id === fileRecord.id || f.file_key === fileRecord.file_key);
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...fileRecord };
    } else {
      list.unshift(fileRecord);
    }
    writeCollection('file_storage', list);
    return fileRecord;
  },
};
