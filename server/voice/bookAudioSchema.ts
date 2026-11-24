import type { QueryPgFn } from '../backup/backupTypes';

export interface ServerBookAudioTrackRow {
  id: number;
  book_id: number;
  chapter_id: number | null;
  chapter_number: number | null;
  file_id: number | null;
  folder_id: number | null;
  user_uid: number | null;
  title: string;
  narrator_name: string;
  source_type: string;
  audio_url: string;
  mime_type: string;
  file_size: number;
  duration_sec: number;
  is_primary: boolean;
  sort_order: number;
  created_at: string;
}

let bookAudioSchemaPromise: Promise<void> | null = null;

export async function ensureBookAudioSchema(queryPg: QueryPgFn): Promise<void> {
  if (!bookAudioSchemaPromise) {
    bookAudioSchemaPromise = (async () => {
      await queryPg(`
        CREATE TABLE IF NOT EXISTS book_audio_tracks (
          id BIGSERIAL PRIMARY KEY,
          book_id BIGINT NOT NULL,
          chapter_id BIGINT,
          chapter_number INT,
          file_id BIGINT,
          folder_id BIGINT,
          user_uid BIGINT,
          title TEXT NOT NULL,
          narrator_name TEXT DEFAULT 'Автор',
          source_type TEXT DEFAULT 'voice_record',
          audio_url TEXT NOT NULL,
          mime_type TEXT DEFAULT 'audio/webm',
          file_size BIGINT DEFAULT 0,
          duration_sec NUMERIC DEFAULT 0,
          is_primary BOOLEAN DEFAULT true,
          sort_order INT DEFAULT 0,
          created_at TIMESTAMPTZ DEFAULT now()
        );
      `);

      await queryPg(
        'CREATE INDEX IF NOT EXISTS idx_book_audio_tracks_book ON book_audio_tracks (book_id, chapter_number, sort_order, id);'
      );

      await queryPg('ALTER TABLE chapters ADD COLUMN IF NOT EXISTS audio_file_id BIGINT;');
      await queryPg('ALTER TABLE chapters ADD COLUMN IF NOT EXISTS audio_duration_sec INT;');

      await queryPg('ALTER TABLE books ADD COLUMN IF NOT EXISTS has_voice_tracks BOOLEAN DEFAULT false;');
      await queryPg('ALTER TABLE books ADD COLUMN IF NOT EXISTS voice_tracks_count INT DEFAULT 0;');

      await queryPg('ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS book_id BIGINT;');
      await queryPg('ALTER TABLE voice_transcriptions ADD COLUMN IF NOT EXISTS chapter_id BIGINT;');

      await queryPg('ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS audio_time_sec NUMERIC DEFAULT 0;');
    })().catch((err) => {
      bookAudioSchemaPromise = null;
      throw err;
    });
  }
  return bookAudioSchemaPromise;
}

/**
 * Finds or creates the dedicated book cloud folder «Книга: «Название»» in PostgreSQL file_folders.
 */
export async function ensureServerBookFolderId(
  queryPg: QueryPgFn,
  bookId: number,
  userUid?: number | null,
  fallbackTitle?: string | null
): Promise<{ folderId: number | null; folderName: string; bookTitle: string }> {
  let bookTitle = String(fallbackTitle || '').trim();
  let ownerUid = userUid || null;

  if (!bookTitle && bookId > 0) {
    const bookRes = await queryPg<{ title: string; user_uid: number | null }>(
      'SELECT title, user_uid FROM books WHERE id = $1 LIMIT 1;',
      [bookId]
    );
    if (bookRes.rows[0]) {
      bookTitle = String(bookRes.rows[0].title || '').trim();
      if (!ownerUid && bookRes.rows[0].user_uid) {
        ownerUid = Number(bookRes.rows[0].user_uid);
      }
    }
  }

  const cleanTitle = bookTitle || `Книга #${bookId}`;
  const folderName = `Книга: «${cleanTitle}»`;

  try {
    const existing = await queryPg<{ id: number }>(
      'SELECT id FROM file_folders WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) ORDER BY id ASC LIMIT 1;',
      [folderName]
    );
    if (existing.rows[0]?.id) {
      return {
        folderId: Number(existing.rows[0].id),
        folderName,
        bookTitle: cleanTitle,
      };
    }

    const inserted = await queryPg<{ id: number }>(
      'INSERT INTO file_folders (user_uid, name, color) VALUES ($1, $2, $3) RETURNING id;',
      [ownerUid, folderName, '#ffffff']
    );
    return {
      folderId: inserted.rows[0]?.id ? Number(inserted.rows[0].id) : null,
      folderName,
      bookTitle: cleanTitle,
    };
  } catch (err) {
    console.warn('[KnigAI BookAudio] ensureServerBookFolderId notice:', err);
    return { folderId: null, folderName, bookTitle: cleanTitle };
  }
}

/**
 * Synchronizes chapters.audio_url / audio_file_id / audio_duration_sec
 * and books.has_voice_tracks / voice_tracks_count / audio_tracks from PostgreSQL book_audio_tracks.
 */
export async function syncBookAndChapterAudioFlags(
  queryPg: QueryPgFn,
  bookId: number
): Promise<ServerBookAudioTrackRow[]> {
  await ensureBookAudioSchema(queryPg);

  const tracksRes = await queryPg<ServerBookAudioTrackRow>(
    `SELECT * FROM book_audio_tracks
     WHERE book_id = $1
     ORDER BY chapter_number ASC NULLS LAST, is_primary DESC, sort_order ASC, id ASC;`,
    [bookId]
  );

  const tracks = (tracksRes.rows || []).map((r) => ({
    ...r,
    id: Number(r.id),
    book_id: Number(r.book_id),
    chapter_id: r.chapter_id != null ? Number(r.chapter_id) : null,
    chapter_number: r.chapter_number != null ? Number(r.chapter_number) : null,
    file_id: r.file_id != null ? Number(r.file_id) : null,
    folder_id: r.folder_id != null ? Number(r.folder_id) : null,
    user_uid: r.user_uid != null ? Number(r.user_uid) : null,
    file_size: Number(r.file_size || 0),
    duration_sec: Number(r.duration_sec || 0),
    sort_order: Number(r.sort_order || 0),
    is_primary: Boolean(r.is_primary),
  }));

  // Map primary track per chapter
  const primaryByChapterId = new Map<number, ServerBookAudioTrackRow>();
  const primaryByChapterNum = new Map<number, ServerBookAudioTrackRow>();

  for (const t of tracks) {
    if (t.chapter_id && !primaryByChapterId.has(t.chapter_id)) {
      primaryByChapterId.set(t.chapter_id, t);
    }
    if (t.chapter_number && !primaryByChapterNum.has(t.chapter_number)) {
      primaryByChapterNum.set(t.chapter_number, t);
    }
  }

  // Load book chapters and sync their primary audio metadata
  const chapRes = await queryPg<{ id: number; chapter_number: number; audio_url: string | null; audio_file_id: number | null }>(
    'SELECT id, chapter_number, audio_url, audio_file_id FROM chapters WHERE book_id = $1 ORDER BY chapter_number ASC;',
    [bookId]
  );

  for (const ch of chapRes.rows || []) {
    const chId = Number(ch.id);
    const chNum = Number(ch.chapter_number);
    const matched = primaryByChapterId.get(chId) || primaryByChapterNum.get(chNum);
    if (matched) {
      await queryPg(
        'UPDATE chapters SET audio_url = $1, audio_file_id = $2, audio_duration_sec = $3 WHERE id = $4;',
        [
          matched.audio_url,
          matched.file_id,
          Math.max(0, Math.round(Number(matched.duration_sec || 0))),
          chId,
        ]
      );
    } else if (ch.audio_file_id != null) {
      // Track was removed cleanly from book_audio_tracks
      await queryPg(
        'UPDATE chapters SET audio_url = NULL, audio_file_id = NULL, audio_duration_sec = NULL WHERE id = $1;',
        [chId]
      );
    }
  }

  // Build ordered summary playlist for books.audio_tracks (one primary per chapter + general tracks)
  const playlistTracks: Array<{
    id: string;
    title: string;
    url: string;
    duration?: number;
    chapter_number?: number;
    chapter_id?: number | null;
    narrator_name?: string;
    source_type?: string;
    file_id?: number | null;
    is_primary?: boolean;
  }> = [];

  for (const t of tracks) {
    if (t.is_primary || !tracks.some((other) => other.chapter_number === t.chapter_number && other.is_primary)) {
      playlistTracks.push({
        id: `bat_${t.id}`,
        title: t.title,
        url: t.audio_url,
        duration: t.duration_sec > 0 ? Math.round(t.duration_sec) : undefined,
        chapter_number: t.chapter_number ?? undefined,
        chapter_id: t.chapter_id,
        narrator_name: t.narrator_name,
        source_type: t.source_type,
        file_id: t.file_id,
        is_primary: t.is_primary,
      });
    }
  }

  await queryPg(
    `UPDATE books
     SET has_voice_tracks = $1,
         voice_tracks_count = $2,
         audio_tracks = $3,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4;`,
    [tracks.length > 0, tracks.length, playlistTracks.length > 0 ? JSON.stringify(playlistTracks) : null, bookId]
  );

  return tracks;
}
