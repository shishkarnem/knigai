import { executePgQuery } from './pgProxy';
import { Book, Character, Chapter, GalleryItem, WorldEntity, WorldEntityType } from '../../types';
import { getOrCreateBookFolder } from './fileStorageRepository';
import { createNotification } from '../billing/notificationService';

const STORAGE_KEY_BOOKS = 'knigai_saved_books';

export function generateSlug(title: string): string {
  const ruMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  return title
    .toLowerCase()
    .split('')
    .map((char) => ruMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'kniga';
}

export async function fetchAllBooks(userUid?: number): Promise<Book[]> {
  try {
    let sql = 'SELECT id, user_uid, title, slug, subtitle, author, genres, target_chapters, status, is_published, cover_config, synopsis_overview, running_header, basic_plots, style_config, audio_tracks, has_voice_tracks, voice_tracks_count, original_file_url, file_storage_id, format, content_type, parent_book_id, relation_type, series_name, series_order, book_meta, author_instructions, is_parsed_source, created_at, updated_at FROM books';
    const params: (string | number)[] = [];

    if (userUid) {
      params.push(userUid);
      sql += ' WHERE user_uid = $1 OR is_published = TRUE OR user_uid IS NULL';
    }

    sql += ' ORDER BY id DESC;';

    const res = await executePgQuery<Book & { basic_plots?: string | string[]; style_config?: string | Record<string, unknown>; audio_tracks?: string | unknown[]; book_meta?: string | Record<string, unknown> }>(sql, params);
    if (res.rows && res.rows.length > 0) {
      const sanitized: Book[] = res.rows.map((r) => {
        let plots: string[] = [];
        const rawPlots = r.basic_plots as any;
        if (Array.isArray(rawPlots)) {
          plots = rawPlots;
        } else if (typeof rawPlots === 'string' && rawPlots.trim()) {
          try {
            plots = JSON.parse(rawPlots);
          } catch {
            plots = [rawPlots];
          }
        }

        let parsedStyle = undefined;
        if (r.style_config) {
          if (typeof r.style_config === 'string') {
            try {
              parsedStyle = JSON.parse(r.style_config);
            } catch {
              // ignore
            }
          } else {
            parsedStyle = r.style_config;
          }
        }

        let parsedAudio = undefined;
        if (r.audio_tracks) {
          if (typeof r.audio_tracks === 'string') {
            try {
              parsedAudio = JSON.parse(r.audio_tracks);
            } catch {
              // ignore
            }
          } else {
            parsedAudio = r.audio_tracks;
          }
        }

        let parsedGenres: string[] = [];
        const rawGenres = (r as any).genres;
        if (Array.isArray(rawGenres)) {
          parsedGenres = rawGenres;
        } else if (typeof rawGenres === 'string' && rawGenres.trim()) {
          try {
            const g = JSON.parse(rawGenres);
            parsedGenres = Array.isArray(g) ? g : [rawGenres];
          } catch {
            parsedGenres = rawGenres.split(',').map((s: string) => s.trim()).filter(Boolean);
          }
        }

        let parsedCover = (r as any).cover_config || {};
        if (typeof parsedCover === 'string' && parsedCover.trim()) {
          try {
            parsedCover = JSON.parse(parsedCover);
          } catch {
            parsedCover = {};
          }
        }

        let parsedMeta = r.book_meta || null;
        if (typeof parsedMeta === 'string' && parsedMeta.trim()) {
          try {
            parsedMeta = JSON.parse(parsedMeta);
          } catch {
            parsedMeta = null;
          }
        }

        return {
          ...r,
          id: Number(r.id),
          user_uid: r.user_uid != null ? Number(r.user_uid) : undefined,
          target_chapters: Number(r.target_chapters) || 100,
          file_storage_id: r.file_storage_id != null ? Number(r.file_storage_id) : undefined,
          parent_book_id: r.parent_book_id != null ? Number(r.parent_book_id) : null,
          series_order: r.series_order != null ? Number(r.series_order) : null,
          genres: parsedGenres,
          cover_config: parsedCover,
          basic_plots: plots,
          style_config: parsedStyle,
          audio_tracks: parsedAudio,
          has_voice_tracks: Boolean((r as any).has_voice_tracks),
          voice_tracks_count: Number((r as any).voice_tracks_count || 0),
          book_meta: parsedMeta as Book['book_meta'],
        };
      });
      localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(sanitized));
      return sanitized;
    }
  } catch (err) {
    console.warn('DB fetch books error, checking server local storage and cache:', err);
  }

  // 1. Fallback to server-persisted books
  try {
    const srvRes = await fetch('/api/parser/local-books');
    if (srvRes.ok) {
      const srvData = await srvRes.json();
      if (srvData.books && srvData.books.length > 0) {
        return srvData.books;
      }
    }
  } catch {
    // ignore
  }

  const cached = localStorage.getItem(STORAGE_KEY_BOOKS);
  if (cached) {
    try {
      const list = JSON.parse(cached) as Book[];
      if (userUid) {
        return list.filter((b) => !b.user_uid || b.user_uid === userUid);
      }
      return list;
    } catch {
      // ignore
    }
  }
  return [];
}

export async function saveNewBook(book: Omit<Book, 'id'>, userUid?: number): Promise<Book> {
  const genresStr = JSON.stringify(book.genres || []);
  const coverStr = JSON.stringify(book.cover_config || {});
  const plotsStr = JSON.stringify(book.basic_plots || []);
  const styleStr = JSON.stringify(book.style_config || null);
  const audioStr = JSON.stringify(book.audio_tracks || null);
  const metaStr = JSON.stringify(book.book_meta || {});
  const assignedUid = userUid || book.user_uid || null;
  const bookSlug = book.slug || generateSlug(book.title);

  try {
    const res = await executePgQuery<{ id: number }>(
      `INSERT INTO books (user_uid, title, slug, subtitle, author, genres, target_chapters, status, is_published, cover_config, synopsis_overview, running_header, basic_plots, style_config, audio_tracks, original_file_url, file_storage_id, format, content_type, parent_book_id, relation_type, series_name, series_order, book_meta, author_instructions, is_parsed_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26) RETURNING id;`,
      [
        assignedUid,
        book.title,
        bookSlug,
        book.subtitle || '',
        book.author || 'Автор KnigAI',
        genresStr,
        book.target_chapters || 100,
        book.status || 'draft',
        book.is_published ?? false,
        coverStr,
        book.synopsis_overview || '',
        book.running_header || '',
        plotsStr,
        styleStr,
        audioStr,
        book.original_file_url || null,
        book.file_storage_id || null,
        book.format || null,
        book.content_type || null,
        book.parent_book_id || null,
        book.relation_type || null,
        book.series_name || null,
        book.series_order || null,
        metaStr,
        book.author_instructions || null,
        Boolean(book.is_parsed_source),
      ]
    );

    const newId = Number(res.rows[0]?.id) || Date.now();
    const createdBook: Book = {
      ...book,
      id: newId,
      slug: bookSlug,
      user_uid: assignedUid != null ? Number(assignedUid) : undefined,
    };
    saveBookToLocal(createdBook);
    return createdBook;
  } catch (err) {
    console.warn('Failed to insert book to DB, saving locally:', err);
    const localId = Date.now();
    const createdBook: Book = {
      ...book,
      id: localId,
      slug: bookSlug,
      user_uid: assignedUid || undefined,
    };
    saveBookToLocal(createdBook);
    return createdBook;
  }
}

export async function updateBook(book: Book): Promise<void> {
  saveBookToLocal(book);
  try {
    const genresStr = JSON.stringify(book.genres || []);
    const coverStr = JSON.stringify(book.cover_config || {});
    const plotsStr = JSON.stringify(book.basic_plots || []);
    const styleStr = JSON.stringify(book.style_config || null);
    const audioStr = JSON.stringify(book.audio_tracks || null);
    const metaStr = JSON.stringify(book.book_meta || {});
    const bookSlug = book.slug || generateSlug(book.title);
    await executePgQuery(
      `UPDATE books SET title = $1, subtitle = $2, author = $3, genres = $4, target_chapters = $5,
       status = $6, is_published = $7, slug = $8, cover_config = $9, synopsis_overview = $10, running_header = $11, basic_plots = $12, style_config = $13, audio_tracks = $14, original_file_url = $15, file_storage_id = $16, parent_book_id = $17, relation_type = $18, series_name = $19, series_order = $20, book_meta = $21, author_instructions = $22, is_parsed_source = $23, updated_at = CURRENT_TIMESTAMP WHERE id = $24;`,
      [
        book.title,
        book.subtitle || '',
        book.author || '',
        genresStr,
        book.target_chapters,
        book.status,
        book.is_published ?? false,
        bookSlug,
        coverStr,
        book.synopsis_overview || '',
        book.running_header || '',
        plotsStr,
        styleStr,
        audioStr,
        book.original_file_url || null,
        book.file_storage_id || null,
        book.parent_book_id || null,
        book.relation_type || null,
        book.series_name || null,
        book.series_order || null,
        metaStr,
        book.author_instructions || null,
        Boolean(book.is_parsed_source),
        book.id,
      ]
    );
  } catch (err) {
    console.warn(`Failed to update book ${book.id} in DB:`, err);
  }
}

export async function checkBookTitleUnique(
  title: string,
  excludeBookId?: number,
  userUid?: number
): Promise<{ isUnique: boolean; existingTitle?: string }> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return { isUnique: true };

  try {
    let sql = 'SELECT id, title FROM books WHERE LOWER(TRIM(title)) = LOWER(TRIM($1))';
    const params: (string | number)[] = [cleanTitle];

    if (excludeBookId) {
      params.push(excludeBookId);
      sql += ` AND id != $${params.length}`;
    }

    if (userUid) {
      params.push(userUid);
      sql += ` AND (user_uid = $${params.length} OR user_uid IS NULL)`;
    }

    sql += ' LIMIT 1;';
    const res = await executePgQuery<{ id: number; title: string }>(sql, params);
    if (res.rows && res.rows.length > 0) {
      return { isUnique: false, existingTitle: res.rows[0].title };
    }
  } catch (err) {
    console.warn('Check book title uniqueness error:', err);
  }
  return { isUnique: true };
}

export interface ReadingProgressRecord {
  current_chapter: number;
  current_page: number;
  page_index: number | null;
  manga_page_index: number | null;
  audio_track_index: number | null;
  audio_time_sec?: number | null;
}

export async function fetchReadingProgress(
  bookId: number,
  userUid?: number
): Promise<ReadingProgressRecord | null> {
  if (!userUid || !bookId) return null;
  try {
    const res = await executePgQuery<{
      current_chapter: number | string | null;
      current_page: number | string | null;
      page_index: number | string | null;
      manga_page_index: number | string | null;
      audio_track_index: number | string | null;
      audio_time_sec?: number | string | null;
    }>(
      `SELECT current_chapter, current_page, page_index, manga_page_index, audio_track_index, audio_time_sec
       FROM reading_progress WHERE user_uid = $1 AND book_id = $2 LIMIT 1;`,
      [userUid, bookId]
    );
    const row = res.rows?.[0];
    if (!row) return null;
    return {
      current_chapter: Number(row.current_chapter) || 1,
      current_page: Number(row.current_page) || 1,
      page_index: row.page_index !== null && row.page_index !== undefined ? Number(row.page_index) : null,
      manga_page_index:
        row.manga_page_index !== null && row.manga_page_index !== undefined ? Number(row.manga_page_index) : null,
      audio_track_index:
        row.audio_track_index !== null && row.audio_track_index !== undefined ? Number(row.audio_track_index) : null,
      audio_time_sec:
        row.audio_time_sec !== null && row.audio_time_sec !== undefined ? Number(row.audio_time_sec) : 0,
    };
  } catch (e) {
    console.warn('Failed to load reading progress from DB:', e);
    return null;
  }
}

export async function updateReadingChapter(
  bookId: number,
  chapterNumber: number,
  userUid?: number,
  pageIndex?: number,
  mode: 'text' | 'manga' | 'audio' = 'text',
  audioTimeSec?: number
): Promise<void> {
  try {
    if (!userUid || !bookId) return;
    const safeChap = Math.max(1, Number(chapterNumber) || 1);
    const hasPage = typeof pageIndex === 'number' && !Number.isNaN(pageIndex) && pageIndex >= 0;
    const safeIdx = hasPage ? Math.floor(pageIndex) : 0;
    const safeAudioSec =
      typeof audioTimeSec === 'number' && Number.isFinite(audioTimeSec) && audioTimeSec >= 0
        ? Math.floor(audioTimeSec)
        : null;

    if (mode === 'manga') {
      await executePgQuery(
        `INSERT INTO reading_progress (user_uid, book_id, current_chapter, current_page, manga_page_index, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (user_uid, book_id) DO UPDATE SET
           current_chapter = $3,
           manga_page_index = $5,
           updated_at = CURRENT_TIMESTAMP;`,
        [userUid, bookId, safeChap, safeIdx + 1, safeIdx]
      );
    } else if (mode === 'audio') {
      await executePgQuery(
        `INSERT INTO reading_progress (user_uid, book_id, current_chapter, current_page, audio_track_index, audio_time_sec, updated_at)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, 0), CURRENT_TIMESTAMP)
         ON CONFLICT (user_uid, book_id) DO UPDATE SET
           current_chapter = $3,
           audio_track_index = $5,
           audio_time_sec = COALESCE($6, reading_progress.audio_time_sec, 0),
           updated_at = CURRENT_TIMESTAMP;`,
        [userUid, bookId, safeChap, safeIdx + 1, safeIdx, safeAudioSec]
      );
    } else {
      await executePgQuery(
        `INSERT INTO reading_progress (user_uid, book_id, current_chapter, current_page, page_index, updated_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
         ON CONFLICT (user_uid, book_id) DO UPDATE SET
           current_chapter = $3,
           current_page = $4,
           page_index = $5,
           updated_at = CURRENT_TIMESTAMP;`,
        [userUid, bookId, safeChap, safeIdx + 1, hasPage ? safeIdx : null]
      );
    }
  } catch (e) {
    console.warn('Failed to save reading progress to DB:', e);
  }
}

export async function deleteBook(bookId: number): Promise<void> {
  // Remove from local storage
  const all = getLocalBooks().filter((b) => b.id !== bookId);
  localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(all));

  // Delete from DB
  try {
    await executePgQuery('DELETE FROM chapters WHERE book_id = $1;', [bookId]);
    await executePgQuery('DELETE FROM characters WHERE book_id = $1;', [bookId]);
    await executePgQuery('DELETE FROM books WHERE id = $1;', [bookId]);
  } catch (err) {
    console.warn(`Failed to delete book ${bookId} from DB:`, err);
  }
}

function saveBookToLocal(book: Book) {
  const all = getLocalBooks();
  const index = all.findIndex((b) => b.id === book.id);
  if (index >= 0) {
    all[index] = book;
  } else {
    all.unshift(book);
  }
  localStorage.setItem(STORAGE_KEY_BOOKS, JSON.stringify(all));
}

function getLocalBooks(): Book[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_BOOKS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function fetchCharacters(bookId: number, userUid?: number): Promise<Character[]> {
  try {
    const res = await executePgQuery<Character>(
      'SELECT id, book_id, user_uid, name, role, description, visual_card_url, visual_prompt, traits, created_at FROM characters WHERE book_id = $1 ORDER BY id ASC;',
      [bookId]
    );
    if (res.rows) {
      const normalized: Character[] = res.rows.map((c) => {
        let parsedTraits: string[] = [];
        const rawTraits = (c as any).traits;
        if (Array.isArray(rawTraits)) {
          parsedTraits = rawTraits;
        } else if (typeof rawTraits === 'string' && rawTraits.trim()) {
          try {
            const parsed = JSON.parse(rawTraits);
            parsedTraits = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedTraits = [];
          }
        }
        return {
          ...c,
          id: Number(c.id),
          book_id: Number(c.book_id),
          user_uid: c.user_uid != null ? Number(c.user_uid) : undefined,
          traits: parsedTraits,
        };
      });
      localStorage.setItem(`knigai_chars_${bookId}`, JSON.stringify(normalized));
      return normalized;
    }
  } catch (err) {
    console.warn('Failed to load characters from DB:', err);
  }
  const cached = localStorage.getItem(`knigai_chars_${bookId}`);
  return cached ? JSON.parse(cached) : [];
}

export async function saveCharacter(char: Omit<Character, 'id'>, existingId?: number, userUid?: number): Promise<Character> {
  const traitsStr = JSON.stringify(char.traits || []);
  const assignedUid = userUid || char.user_uid || null;

  if (existingId) {
    try {
      await executePgQuery(
        `UPDATE characters SET name = $1, role = $2, description = $3, visual_card_url = $4, visual_prompt = $5, traits = $6 WHERE id = $7;`,
        [char.name, char.role, char.description, char.visual_card_url, char.visual_prompt, traitsStr, existingId]
      );
    } catch (e) {
      console.warn('DB update char error:', e);
    }
    return { ...char, id: existingId, user_uid: assignedUid || undefined };
  } else {
    try {
      const res = await executePgQuery<{ id: number }>(
        `INSERT INTO characters (book_id, user_uid, name, role, description, visual_card_url, visual_prompt, traits)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;`,
        [char.book_id, assignedUid, char.name, char.role, char.description, char.visual_card_url, char.visual_prompt, traitsStr]
      );
      const newId = Number(res.rows[0]?.id) || Date.now();
      return { ...char, id: newId, book_id: Number(char.book_id), user_uid: assignedUid != null ? Number(assignedUid) : undefined };
    } catch (e) {
      console.warn('DB insert char error, using local id:', e);
      return { ...char, id: Date.now(), user_uid: assignedUid || undefined };
    }
  }
}

export async function fetchChapters(bookId: number, userUid?: number): Promise<Chapter[]> {
  try {
    const res = await executePgQuery<
      Omit<Chapter, 'entity_ids' | 'image_layout' | 'footnotes'> & {
        entity_ids?: number[] | string;
        image_layout?: unknown;
        footnotes?: unknown;
      }
    >(
      'SELECT id, book_id, user_uid, chapter_number, title, synopsis, content, illustration_url, illustration_prompt, status, footnotes, image_layout, entity_ids, continuity_summary, author_comment, audio_url, audio_file_id, audio_duration_sec, created_at FROM chapters WHERE book_id = $1 ORDER BY chapter_number ASC;',
      [bookId]
    );
    if (res.rows && res.rows.length > 0) {
      const sanitized: Chapter[] = res.rows.map((row) => {
        let parsedEntityIds: number[] = [];
        if (Array.isArray(row.entity_ids)) {
          parsedEntityIds = row.entity_ids.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
        } else if (typeof row.entity_ids === 'string' && row.entity_ids.trim()) {
          try {
            const arr = JSON.parse(row.entity_ids);
            if (Array.isArray(arr)) {
              parsedEntityIds = arr.map((n) => Number(n)).filter((n) => !Number.isNaN(n));
            }
          } catch {
            // ignore
          }
        }

        let parsedLayout = row.image_layout;
        if (typeof row.image_layout === 'string' && row.image_layout.trim()) {
          try {
            parsedLayout = JSON.parse(row.image_layout);
          } catch {
            parsedLayout = undefined;
          }
        }

        let parsedFootnotes = row.footnotes;
        if (typeof row.footnotes === 'string' && row.footnotes.trim()) {
          try {
            parsedFootnotes = JSON.parse(row.footnotes);
          } catch {
            parsedFootnotes = undefined;
          }
        }

        return {
          ...row,
          id: Number(row.id),
          book_id: Number(row.book_id),
          user_uid: row.user_uid != null ? Number(row.user_uid) : undefined,
          chapter_number: Number(row.chapter_number) || 1,
          audio_file_id: (row as any).audio_file_id != null ? Number((row as any).audio_file_id) : null,
          audio_duration_sec: (row as any).audio_duration_sec != null ? Number((row as any).audio_duration_sec) : null,
          entity_ids: parsedEntityIds,
          image_layout: parsedLayout as Chapter['image_layout'],
          footnotes: Array.isArray(parsedFootnotes) ? (parsedFootnotes as Chapter['footnotes']) : undefined,
        };
      });
      localStorage.setItem(`knigai_chapters_${bookId}`, JSON.stringify(sanitized));
      return sanitized;
    }
  } catch (err) {
    console.warn('Failed to load chapters from DB:', err);
  }
  const cached = localStorage.getItem(`knigai_chapters_${bookId}`);
  return cached ? JSON.parse(cached) : [];
}

export async function saveChapter(chap: Omit<Chapter, 'id'>, existingId?: number, userUid?: number): Promise<Chapter> {
  const layoutStr = JSON.stringify(chap.image_layout || null);
  const entityIdsStr = JSON.stringify(Array.isArray(chap.entity_ids) ? chap.entity_ids : []);
  const footnotesStr = JSON.stringify(Array.isArray(chap.footnotes) ? chap.footnotes : null);
  const continuitySummary = chap.continuity_summary || '';
  const authorComment = chap.author_comment || '';
  const assignedUid = userUid || chap.user_uid || null;

  if (existingId) {
    try {
      await executePgQuery(
        `UPDATE chapters SET chapter_number = $1, title = $2, synopsis = $3, content = $4, illustration_url = $5, illustration_prompt = $6, status = $7, footnotes = $8, image_layout = $9, entity_ids = $10::jsonb, continuity_summary = $11, author_comment = $12 WHERE id = $13;`,
        [
          chap.chapter_number,
          chap.title,
          chap.synopsis,
          chap.content,
          chap.illustration_url,
          chap.illustration_prompt,
          chap.status,
          footnotesStr,
          layoutStr,
          entityIdsStr,
          continuitySummary,
          authorComment,
          existingId,
        ]
      );
    } catch (e) {
      console.warn('DB update chap error:', e);
    }
    return {
      ...chap,
      id: existingId,
      user_uid: assignedUid || undefined,
      entity_ids: chap.entity_ids || [],
      continuity_summary: continuitySummary,
      author_comment: authorComment,
    };
  } else {
    try {
      const res = await executePgQuery<{ id: number }>(
        `INSERT INTO chapters (book_id, user_uid, chapter_number, title, synopsis, content, illustration_url, illustration_prompt, status, footnotes, image_layout, entity_ids, continuity_summary, author_comment)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14) RETURNING id;`,
        [
          chap.book_id,
          assignedUid,
          chap.chapter_number,
          chap.title,
          chap.synopsis,
          chap.content,
          chap.illustration_url,
          chap.illustration_prompt,
          chap.status,
          footnotesStr,
          layoutStr,
          entityIdsStr,
          continuitySummary,
          authorComment,
        ]
      );
      const newId = Number(res.rows[0]?.id) || Date.now();
      return {
        ...chap,
        id: newId,
        book_id: Number(chap.book_id),
        user_uid: assignedUid != null ? Number(assignedUid) : undefined,
        entity_ids: chap.entity_ids || [],
        continuity_summary: continuitySummary,
        author_comment: authorComment,
      };
    } catch (e) {
      console.warn('DB insert chap error:', e);
      return {
        ...chap,
        id: Date.now(),
        user_uid: assignedUid || undefined,
        entity_ids: chap.entity_ids || [],
        continuity_summary: continuitySummary,
        author_comment: authorComment,
      };
    }
  }
}

export async function saveGalleryItem(item: Omit<GalleryItem, 'id'>, userUid?: number): Promise<GalleryItem> {
  const assignedUid = userUid || item.user_uid || null;
  try {
    const res = await executePgQuery<{ id: number }>(
      'INSERT INTO gallery (book_id, user_uid, image_url, prompt, aspect_ratio) VALUES ($1, $2, $3, $4, $5) RETURNING id;',
      [item.book_id || null, assignedUid, item.image_url, item.prompt, item.aspect_ratio]
    );
    return { ...item, id: res.rows[0]?.id || Date.now(), user_uid: assignedUid || undefined };
  } catch (e) {
    console.warn('Gallery save error:', e);
    return { ...item, id: Date.now(), user_uid: assignedUid || undefined };
  }
}

export async function fetchGallery(bookId?: number, userUid?: number): Promise<GalleryItem[]> {
  try {
    let sql = 'SELECT id, book_id, user_uid, image_url, prompt, aspect_ratio, created_at FROM gallery';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (bookId) {
      params.push(bookId);
      conditions.push(`(book_id = $${params.length} OR book_id IS NULL)`);
    }

    if (userUid) {
      params.push(userUid);
      conditions.push(`(user_uid = $${params.length} OR user_uid IS NULL)`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    sql += ' ORDER BY id DESC LIMIT 50;';
    const res = await executePgQuery<GalleryItem>(sql, params);
    return (res.rows || []).map((g) => ({
      ...g,
      id: Number(g.id),
      book_id: g.book_id != null ? Number(g.book_id) : undefined,
      user_uid: g.user_uid != null ? Number(g.user_uid) : undefined,
    }));
  } catch (e) {
    console.warn('Fetch gallery error:', e);
    return [];
  }
}

export async function fetchWorldEntities(
  bookId: number,
  entityType?: WorldEntityType,
  userUid?: number
): Promise<WorldEntity[]> {
  try {
    let sql =
      'SELECT id, book_id, user_uid, entity_type, name, subtitle_or_role, description, attributes, visual_prompt, image_url, created_at FROM world_entities WHERE book_id = $1';
    const params: (string | number)[] = [bookId];

    if (entityType) {
      params.push(entityType);
      sql += ` AND entity_type = $${params.length}`;
    }

    sql += ' ORDER BY id ASC;';
    const res = await executePgQuery<WorldEntity & { attributes?: string | Record<string, unknown> }>(sql, params);
    if (res.rows) {
      const sanitized: WorldEntity[] = res.rows.map((row) => {
        let attrs: Record<string, string | string[]> = {};
        if (typeof row.attributes === 'string') {
          try {
            attrs = JSON.parse(row.attributes);
          } catch {
            attrs = {};
          }
        } else if (typeof row.attributes === 'object' && row.attributes) {
          attrs = row.attributes as Record<string, string | string[]>;
        }
        return {
          ...row,
          id: Number(row.id),
          book_id: Number(row.book_id),
          user_uid: row.user_uid != null ? Number(row.user_uid) : undefined,
          attributes: attrs,
        };
      });
      localStorage.setItem(`knigai_entities_${bookId}_${entityType || 'all'}`, JSON.stringify(sanitized));
      return sanitized;
    }
  } catch (err) {
    console.warn('Failed to load world entities from DB:', err);
  }
  const cached = localStorage.getItem(`knigai_entities_${bookId}_${entityType || 'all'}`);
  return cached ? JSON.parse(cached) : [];
}

export async function saveWorldEntity(
  entity: Omit<WorldEntity, 'id'>,
  existingId?: number,
  userUid?: number
): Promise<WorldEntity> {
  const attrsStr = JSON.stringify(entity.attributes || {});
  const assignedUid = userUid || entity.user_uid || null;

  if (existingId) {
    try {
      await executePgQuery(
        `UPDATE world_entities SET name = $1, subtitle_or_role = $2, description = $3, attributes = $4, visual_prompt = $5, image_url = $6 WHERE id = $7;`,
        [
          entity.name,
          entity.subtitle_or_role || '',
          entity.description || '',
          attrsStr,
          entity.visual_prompt || '',
          entity.image_url || '',
          existingId,
        ]
      );
    } catch (e) {
      console.warn('DB update world entity error:', e);
    }
    return { ...entity, id: existingId, user_uid: assignedUid || undefined };
  } else {
    try {
      const res = await executePgQuery<{ id: number }>(
        `INSERT INTO world_entities (book_id, user_uid, entity_type, name, subtitle_or_role, description, attributes, visual_prompt, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id;`,
        [
          entity.book_id,
          assignedUid,
          entity.entity_type,
          entity.name,
          entity.subtitle_or_role || '',
          entity.description || '',
          attrsStr,
          entity.visual_prompt || '',
          entity.image_url || '',
        ]
      );
      const newId = Number(res.rows[0]?.id) || Date.now();
      return { ...entity, id: newId, book_id: Number(entity.book_id), user_uid: assignedUid != null ? Number(assignedUid) : undefined };
    } catch (e) {
      console.warn('DB insert world entity error:', e);
      return { ...entity, id: Date.now(), user_uid: assignedUid || undefined };
    }
  }
}

export async function deleteWorldEntity(entityId: number): Promise<void> {
  try {
    await executePgQuery('DELETE FROM world_entities WHERE id = $1;', [entityId]);
  } catch (e) {
    console.warn('DB delete world entity error:', e);
  }
}

export async function cloneBookForRemix(
  sourceBook: Book,
  newTitle: string,
  newAuthor: string,
  userUid?: number,
  options?: { authorInstructions?: string }
): Promise<{ book: Book; chapters: Chapter[]; characters: Character[] }> {
  const cleanTitle = newTitle.trim() || `[Фанфик] ${sourceBook.title}`;
  const cleanAuthor = newAuthor.trim() || sourceBook.author || 'Автор KnigAI';
  const remixSlug = `${generateSlug(cleanTitle)}-${Date.now().toString(36)}`;

  const clonedCover = {
    ...(sourceBook.cover_config || {}),
    frontTitle: cleanTitle,
    frontSubtitle: sourceBook.cover_config?.frontSubtitle || sourceBook.subtitle || '',
    authorName: cleanAuthor,
    spineText: `${cleanTitle} — ${cleanAuthor}`,
    backBlurb: sourceBook.cover_config?.backBlurb || sourceBook.synopsis_overview || '',
    genreLabel: sourceBook.cover_config?.genreLabel || (sourceBook.genres || []).join(' / '),
    frontImageUrl: sourceBook.cover_config?.frontImageUrl || '',
    spineColor: sourceBook.cover_config?.spineColor || '#18181b',
    paperType: sourceBook.cover_config?.paperType || 'cream',
    pageCountEstimate: sourceBook.cover_config?.pageCountEstimate || 250,
    isbn: sourceBook.cover_config?.isbn || '978-5-00-184920-4',
    barcodeText: sourceBook.cover_config?.barcodeText || 'Издание формата А5',
  };

  const createdBook = await saveNewBook(
    {
      user_uid: userUid,
      title: cleanTitle,
      slug: remixSlug,
      subtitle: sourceBook.subtitle || `Ремикс по мотивам «${sourceBook.title}»`,
      author: cleanAuthor,
      genres: sourceBook.genres || ['Фанфик'],
      genre_weights: sourceBook.genre_weights,
      basic_plots: sourceBook.basic_plots || ['overcoming-the-monster'],
      style_config: sourceBook.style_config,
      target_chapters: sourceBook.target_chapters || 100,
      status: 'draft',
      is_published: false,
      is_parsed_source: false,
      parent_book_id: sourceBook.id,
      relation_type: 'reboot',
      series_name: sourceBook.series_name || sourceBook.title,
      author_instructions: options?.authorInstructions?.trim() || '',
      cover_config: clonedCover,
      synopsis_overview: sourceBook.synopsis_overview || '',
      setting: sourceBook.setting,
      tone: sourceBook.tone,
      audience: sourceBook.audience,
      running_header: cleanTitle,
    },
    userUid
  );

  // Clone world entities first and keep ID map so chapters preserve references cleanly
  const sourceEntities = await fetchWorldEntities(sourceBook.id, undefined, sourceBook.user_uid);
  const entityIdMap = new Map<number, number>();
  for (const ent of sourceEntities) {
    const clonedEnt = await saveWorldEntity(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        entity_type: ent.entity_type,
        name: ent.name,
        subtitle_or_role: ent.subtitle_or_role,
        description: ent.description,
        attributes: ent.attributes,
        visual_prompt: ent.visual_prompt,
        image_url: ent.image_url,
      },
      undefined,
      userUid
    );
    entityIdMap.set(ent.id, clonedEnt.id);
  }

  // Clone characters
  const sourceCharacters = await fetchCharacters(sourceBook.id, sourceBook.user_uid);
  const clonedCharacters: Character[] = [];
  for (const char of sourceCharacters) {
    const clonedChar = await saveCharacter(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        name: char.name,
        role: char.role,
        description: char.description,
        visual_card_url: char.visual_card_url,
        visual_prompt: char.visual_prompt,
        traits: char.traits,
      },
      undefined,
      userUid
    );
    clonedCharacters.push(clonedChar);
  }

  // Clone chapters
  const sourceChapters = await fetchChapters(sourceBook.id, sourceBook.user_uid);
  const clonedChapters: Chapter[] = [];
  for (const ch of sourceChapters) {
    const remappedEntityIds = (ch.entity_ids || []).map((oldId) => entityIdMap.get(oldId) || oldId);
    const clonedChap = await saveChapter(
      {
        book_id: createdBook.id,
        user_uid: userUid,
        chapter_number: ch.chapter_number,
        title: ch.title,
        synopsis: ch.synopsis,
        content: ch.content,
        illustration_url: ch.illustration_url,
        illustration_prompt: ch.illustration_prompt,
        status: ch.status,
        footnotes: ch.footnotes,
        image_layout: ch.image_layout,
        entity_ids: remappedEntityIds,
        audio_url: ch.audio_url,
      },
      undefined,
      userUid
    );
    clonedChapters.push(clonedChap);
  }

  // Create dedicated folder in gallery for the remixed book
  try {
    await getOrCreateBookFolder(createdBook.id, createdBook.title, userUid);
    if (userUid) {
      await createNotification({
        userUid,
        type: 'remix',
        title: `Создан ремикс «${createdBook.title}»`,
        message: `Книга клонирована из «${sourceBook.title}» (глав: ${clonedChapters.length}, сущностей: ${sourceEntities.length}). Вы можете редактировать её в конструкторе.`,
        link: 'constructor',
      });
    }
  } catch (e) {
    console.warn('Remix post-setup notice:', e);
  }

  return {
    book: createdBook,
    chapters: clonedChapters,
    characters: clonedCharacters,
  };
}

