import type { Express, Request, Response } from 'express';
import type { Multer } from 'multer';
import type { QueryPgFn } from '../backup/backupTypes';
import {
  ensureBookAudioSchema,
  ensureServerBookFolderId,
  ServerBookAudioTrackRow,
  syncBookAndChapterAudioFlags,
} from './bookAudioSchema';
import { getExtensionForAudioMime, uploadToPermanentStorage } from './voiceSttRoutes';

interface GetUniqueFileNameFn {
  (originalName: string): Promise<string>;
}

function makeFileKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let key = 'ba_';
  for (let i = 0; i < 8; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function buildChapterAudioFilename(
  bookId: number,
  chapterNumber: number | null,
  originalName: string | undefined,
  mimeType: string
): string {
  const extFromName = originalName?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ext =
    extFromName && ['mp3', 'm4a', 'wav', 'ogg', 'webm', 'aac', 'm4b'].includes(extFromName)
      ? extFromName
      : getExtensionForAudioMime(mimeType);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const chPart = chapterNumber ? `Ch${chapterNumber}` : 'Intro';
  return `Book${bookId}_${chPart}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}.${ext}`;
}

async function tryTranscribeTempBuffer(buffer: Buffer, ext: string, mime: string): Promise<string> {
  try {
    const formData = new FormData();
    const audioBlob = new Blob([new Uint8Array(buffer)], { type: mime });
    formData.append('file', audioBlob, `chapter_voice.${ext}`);

    const uploadRes = await fetch('https://file.pro-talk.ru/upload_tmp', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: formData,
      signal: AbortSignal.timeout(20000),
    });
    if (!uploadRes.ok) return '';

    const uploadData = (await uploadRes.json().catch(() => ({}))) as {
      data?: { url?: string };
      url?: string;
    };
    const tempUrl = uploadData?.data?.url || uploadData?.url || '';
    if (!tempUrl) return '';

    const sttRes = await fetch(
      `https://api.pro-talk.ru/api/v1.0/stt_from_widget?url=${encodeURIComponent(tempUrl)}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      }
    );
    if (!sttRes.ok) return '';
    const sttData = (await sttRes.json().catch(() => ({}))) as { text?: string };
    return typeof sttData?.text === 'string' ? sttData.text.trim() : '';
  } catch (err) {
    console.warn('[KnigAI BookAudio] Optional transcription notice:', err);
    return '';
  }
}

export function registerBookAudioRoutes(
  app: Express,
  upload: Multer,
  queryPg: QueryPgFn,
  getUniqueFileName: GetUniqueFileNameFn
): void {
  // 1. Get all audio tracks for a book (merged view from book_audio_tracks)
  app.get('/api/books/:bookId/audio', async (req: Request, res: Response) => {
    try {
      await ensureBookAudioSchema(queryPg);
      const bookId = parseInt(req.params.bookId, 10);
      if (!Number.isInteger(bookId) || bookId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID книги' });
      }

      const { rows } = await queryPg<ServerBookAudioTrackRow>(
        `SELECT * FROM book_audio_tracks
         WHERE book_id = $1
         ORDER BY chapter_number ASC NULLS LAST, is_primary DESC, sort_order ASC, id ASC;`,
        [bookId]
      );

      const tracks = (rows || []).map((r) => ({
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

      res.json({ success: true, tracks });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        tracks: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2. Upload recorded voice narration or audio file (.mp3/.m4a/.wav/.ogg/.webm) into book's cloud folder
  app.post(
    '/api/books/:bookId/audio/upload',
    upload.single('audio'),
    async (req: Request, res: Response) => {
      try {
        await ensureBookAudioSchema(queryPg);
        const bookId = parseInt(req.params.bookId, 10);
        if (!Number.isInteger(bookId) || bookId <= 0) {
          return res.status(400).json({ success: false, error: 'Некорректный ID книги' });
        }

        const file = req.file;
        if (!file || !file.buffer || file.buffer.length === 0) {
          return res.status(400).json({ success: false, error: 'Аудиофайл не передан или пуст.' });
        }

        const body = req.body || {};
        const chapterId = body.chapter_id ? parseInt(String(body.chapter_id), 10) : null;
        const chapterNumber = body.chapter_number ? parseInt(String(body.chapter_number), 10) : null;
        const userUid = body.user_uid ? parseInt(String(body.user_uid), 10) : null;
        const sourceType = String(body.source_type || 'voice_record').trim() || 'voice_record';
        const narratorName = String(body.narrator_name || 'Автор').trim().slice(0, 120) || 'Автор';
        const mimeType = String(body.mime_type || file.mimetype || 'audio/webm');
        const durationSecRaw = Number(body.duration_sec || 0);
        const durationSec = Number.isFinite(durationSecRaw) && durationSecRaw >= 0 ? Math.round(durationSecRaw) : 0;
        const isPrimary = String(body.is_primary ?? 'true') !== 'false';
        const shouldTranscribe = String(body.transcribe || 'false') === 'true';
        const bookTitleParam = typeof body.book_title === 'string' ? body.book_title.trim() : null;

        const { folderId, bookTitle } = await ensureServerBookFolderId(
          queryPg,
          bookId,
          userUid,
          bookTitleParam
        );

        const rawTitle = String(body.title || '').trim();
        const trackTitle =
          rawTitle || (chapterNumber ? `Глава ${chapterNumber} (озвучка)` : `Озвучка книги «${bookTitle}»`);

        const baseFilename = buildChapterAudioFilename(bookId, chapterNumber, file.originalname, mimeType);
        const uniqueFilename = await getUniqueFileName(baseFilename);
        const ext = uniqueFilename.split('.').pop() || 'webm';

        const caption = `🎧 Озвучка книги KnigAI\n📖 ${bookTitle}\n📑 ${trackTitle}\n🎙 Чтец: ${narratorName}`;
        const permanentUrl = await uploadToPermanentStorage(file.buffer, uniqueFilename, mimeType, caption);

        let recognizedText = '';
        if (shouldTranscribe) {
          recognizedText = await tryTranscribeTempBuffer(file.buffer, ext, mimeType);
        }

        // Insert into PostgreSQL file_storage inside the book's folder «Книга: «Название»»
        const fileKey = makeFileKey();
        const fileInsert = await queryPg<{ id: number }>(
          `INSERT INTO file_storage (
            user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id
          ) VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7)
          RETURNING id;`,
          [userUid, fileKey, uniqueFilename, permanentUrl, mimeType, file.buffer.length, folderId]
        );
        const fileId = fileInsert.rows[0]?.id ? Number(fileInsert.rows[0].id) : null;
        const playableAudioUrl = fileId
          ? `/file/${fileId}/${encodeURIComponent(uniqueFilename)}`
          : permanentUrl;

        if (isPrimary) {
          if (chapterId && chapterId > 0) {
            await queryPg(
              'UPDATE book_audio_tracks SET is_primary = false WHERE book_id = $1 AND chapter_id = $2;',
              [bookId, chapterId]
            );
          } else if (chapterNumber && chapterNumber > 0) {
            await queryPg(
              'UPDATE book_audio_tracks SET is_primary = false WHERE book_id = $1 AND chapter_number = $2;',
              [bookId, chapterNumber]
            );
          }
        }

        const insertedTrack = await queryPg<ServerBookAudioTrackRow>(
          `INSERT INTO book_audio_tracks (
            book_id, chapter_id, chapter_number, file_id, folder_id, user_uid,
            title, narrator_name, source_type, audio_url, mime_type, file_size,
            duration_sec, is_primary, sort_order
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
          RETURNING *;`,
          [
            bookId,
            chapterId && chapterId > 0 ? chapterId : null,
            chapterNumber && chapterNumber > 0 ? chapterNumber : null,
            fileId,
            folderId,
            userUid,
            trackTitle,
            narratorName,
            sourceType,
            playableAudioUrl,
            mimeType,
            file.buffer.length,
            durationSec,
            isPrimary,
            chapterNumber || 0,
          ]
        );

        if (recognizedText && userUid) {
          await queryPg(
            `INSERT INTO voice_transcriptions (
              user_uid, file_id, book_id, chapter_id, field_context, audio_url, short_audio_url,
              mime_type, file_size, duration_sec, recognized_text, tokens_used
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0);`,
            [
              userUid,
              fileId,
              bookId,
              chapterId && chapterId > 0 ? chapterId : null,
              `chapter_audio_${chapterNumber || 0}`,
              permanentUrl,
              playableAudioUrl,
              mimeType,
              file.buffer.length,
              durationSec,
              recognizedText,
            ]
          ).catch(() => {});
        }

        const allTracks = await syncBookAndChapterAudioFlags(queryPg, bookId);
        const created = insertedTrack.rows[0];

        res.json({
          success: true,
          track: {
            ...created,
            id: Number(created.id),
            book_id: Number(created.book_id),
            chapter_id: created.chapter_id != null ? Number(created.chapter_id) : null,
            chapter_number: created.chapter_number != null ? Number(created.chapter_number) : null,
            file_id: created.file_id != null ? Number(created.file_id) : null,
            folder_id: created.folder_id != null ? Number(created.folder_id) : null,
            user_uid: created.user_uid != null ? Number(created.user_uid) : null,
            file_size: Number(created.file_size || 0),
            duration_sec: Number(created.duration_sec || 0),
            is_primary: Boolean(created.is_primary),
          },
          tracks: allTracks,
          file_id: fileId,
          folder_id: folderId,
          recognized_text: recognizedText,
        });
      } catch (err: unknown) {
        console.error('[KnigAI BookAudio Upload] Error:', err);
        res.status(500).json({
          success: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  );

  // 3. Attach an existing file_storage audio item from the book folder / cloud to a chapter
  app.post('/api/books/:bookId/audio/attach-existing', async (req: Request, res: Response) => {
    try {
      await ensureBookAudioSchema(queryPg);
      const bookId = parseInt(req.params.bookId, 10);
      const fileId = parseInt(String(req.body?.file_id || ''), 10);
      const chapterId = req.body?.chapter_id ? parseInt(String(req.body.chapter_id), 10) : null;
      const chapterNumber = req.body?.chapter_number ? parseInt(String(req.body.chapter_number), 10) : null;
      const userUid = req.body?.user_uid ? parseInt(String(req.body.user_uid), 10) : null;
      const narratorName = String(req.body?.narrator_name || 'Автор').trim() || 'Автор';
      const sourceType = String(req.body?.source_type || 'uploaded_file');
      const isPrimary = req.body?.is_primary !== false;
      const durationSec = Number(req.body?.duration_sec || 0) || 0;

      if (!Number.isInteger(bookId) || bookId <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректные параметры книги или файла' });
      }

      const fileRes = await queryPg<{
        id: number;
        name: string;
        original_url: string;
        mime_type: string;
        file_size: number;
        folder_id: number | null;
      }>('SELECT id, name, original_url, mime_type, file_size, folder_id FROM file_storage WHERE id = $1 LIMIT 1;', [
        fileId,
      ]);
      const fileRow = fileRes.rows[0];
      if (!fileRow) {
        return res.status(404).json({ success: false, error: 'Файл не найден в облачном хранилище' });
      }

      const { folderId } = await ensureServerBookFolderId(queryPg, bookId, userUid);
      const playableUrl = `/file/${fileRow.id}/${encodeURIComponent(fileRow.name || `audio_${fileRow.id}`)}`;
      const title =
        String(req.body?.title || '').trim() ||
        (chapterNumber ? `Глава ${chapterNumber}: ${fileRow.name}` : fileRow.name);

      if (isPrimary) {
        if (chapterId && chapterId > 0) {
          await queryPg(
            'UPDATE book_audio_tracks SET is_primary = false WHERE book_id = $1 AND chapter_id = $2;',
            [bookId, chapterId]
          );
        } else if (chapterNumber && chapterNumber > 0) {
          await queryPg(
            'UPDATE book_audio_tracks SET is_primary = false WHERE book_id = $1 AND chapter_number = $2;',
            [bookId, chapterNumber]
          );
        }
      }

      const inserted = await queryPg<ServerBookAudioTrackRow>(
        `INSERT INTO book_audio_tracks (
          book_id, chapter_id, chapter_number, file_id, folder_id, user_uid,
          title, narrator_name, source_type, audio_url, mime_type, file_size,
          duration_sec, is_primary, sort_order
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        RETURNING *;`,
        [
          bookId,
          chapterId && chapterId > 0 ? chapterId : null,
          chapterNumber && chapterNumber > 0 ? chapterNumber : null,
          Number(fileRow.id),
          fileRow.folder_id ? Number(fileRow.folder_id) : folderId,
          userUid,
          title,
          narratorName,
          sourceType,
          playableUrl,
          fileRow.mime_type || 'audio/mpeg',
          Number(fileRow.file_size || 0),
          Math.round(durationSec),
          isPrimary,
          chapterNumber || 0,
        ]
      );

      const allTracks = await syncBookAndChapterAudioFlags(queryPg, bookId);
      res.json({ success: true, track: inserted.rows[0], tracks: allTracks });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4. Update track metadata or promote to primary track for its chapter
  app.patch('/api/books/:bookId/audio/:trackId', async (req: Request, res: Response) => {
    try {
      await ensureBookAudioSchema(queryPg);
      const bookId = parseInt(req.params.bookId, 10);
      const trackId = parseInt(req.params.trackId, 10);
      if (!Number.isInteger(bookId) || !Number.isInteger(trackId)) {
        return res.status(400).json({ success: false, error: 'Некорректные параметры' });
      }

      const existingRes = await queryPg<ServerBookAudioTrackRow>(
        'SELECT * FROM book_audio_tracks WHERE id = $1 AND book_id = $2 LIMIT 1;',
        [trackId, bookId]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Аудиодорожка не найдена' });
      }

      const nextTitle = typeof req.body?.title === 'string' && req.body.title.trim() ? req.body.title.trim() : existing.title;
      const nextNarrator =
        typeof req.body?.narrator_name === 'string' && req.body.narrator_name.trim()
          ? req.body.narrator_name.trim()
          : existing.narrator_name;
      const nextPrimary =
        typeof req.body?.is_primary === 'boolean' ? req.body.is_primary : Boolean(existing.is_primary);
      const nextChapterId =
        req.body?.chapter_id !== undefined ? (req.body.chapter_id ? Number(req.body.chapter_id) : null) : existing.chapter_id;
      const nextChapterNum =
        req.body?.chapter_number !== undefined
          ? req.body.chapter_number
            ? Number(req.body.chapter_number)
            : null
          : existing.chapter_number;

      if (nextPrimary) {
        if (nextChapterId) {
          await queryPg(
            'UPDATE book_audio_tracks SET is_primary = false WHERE book_id = $1 AND chapter_id = $2 AND id <> $3;',
            [bookId, nextChapterId, trackId]
          );
        } else if (nextChapterNum) {
          await queryPg(
            'UPDATE book_audio_tracks SET is_primary = false WHERE book_id = $1 AND chapter_number = $2 AND id <> $3;',
            [bookId, nextChapterNum, trackId]
          );
        }
      }

      await queryPg(
        `UPDATE book_audio_tracks
         SET title = $1, narrator_name = $2, is_primary = $3, chapter_id = $4, chapter_number = $5
         WHERE id = $6 AND book_id = $7;`,
        [nextTitle, nextNarrator, nextPrimary, nextChapterId, nextChapterNum, trackId, bookId]
      );

      const allTracks = await syncBookAndChapterAudioFlags(queryPg, bookId);
      const updated = allTracks.find((t) => t.id === trackId) || null;
      res.json({ success: true, track: updated, tracks: allTracks });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Delete audio track (and optionally delete underlying file_storage entry)
  app.delete('/api/books/:bookId/audio/:trackId', async (req: Request, res: Response) => {
    try {
      await ensureBookAudioSchema(queryPg);
      const bookId = parseInt(req.params.bookId, 10);
      const trackId = parseInt(req.params.trackId, 10);
      const deleteFile = String(req.query.delete_file || 'false') === 'true';

      if (!Number.isInteger(bookId) || !Number.isInteger(trackId)) {
        return res.status(400).json({ success: false, error: 'Некорректные параметры' });
      }

      const delRes = await queryPg<{ file_id: number | null }>(
        'DELETE FROM book_audio_tracks WHERE id = $1 AND book_id = $2 RETURNING file_id;',
        [trackId, bookId]
      );
      const fileId = delRes.rows[0]?.file_id ? Number(delRes.rows[0].file_id) : null;
      if (deleteFile && fileId) {
        await queryPg('DELETE FROM file_storage WHERE id = $1;', [fileId]).catch(() => {});
      }

      const allTracks = await syncBookAndChapterAudioFlags(queryPg, bookId);
      res.json({ success: true, tracks: allTracks });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
