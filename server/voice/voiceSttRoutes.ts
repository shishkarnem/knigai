import { Express, Request, Response } from 'express';
import type { Multer } from 'multer';
import { ensureServerBookFolderId } from './bookAudioSchema';

interface QueryPgFn {
  <T = Record<string, unknown>>(
    sql: string,
    params?: (string | number | boolean | null)[]
  ): Promise<{ rows: T[]; rowCount: number }>;
}

interface GetUniqueFileNameFn {
  (originalName: string): Promise<string>;
}

const PROTALK_UPLOAD_TOKEN =
  'YGpaUXFjXl5tZ1h3GH0AG0cLDBsyTwwZBFYNIjU6LjwQeAlFIAYFNWYBNDVrNRQYaGtdWGtjUgVvAH9YAmk';
const PROTALK_BOT_ID = '74803';

export function getExtensionForAudioMime(mime: string): string {
  const lower = (mime || '').toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  return 'webm';
}

function buildVoiceFilename(ext: string): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Voice_${now.getFullYear()}_${pad(now.getMonth() + 1)}_${pad(now.getDate())}_${pad(
    now.getHours()
  )}_${pad(now.getMinutes())}_${pad(now.getSeconds())}.${ext}`;
}

export async function uploadToPermanentStorage(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  caption: string
): Promise<string> {
  const boundary =
    '----VoiceFormBoundary' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  const encodedFilename = encodeURIComponent(filename);

  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption.trim()}\r\n`
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"; filename*=UTF-8''${encodedFilename}\r\nContent-Type: ${
        mimeType || 'audio/webm'
      }\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];

  const body = Buffer.concat(parts);
  const res = await fetch('https://file.pro-talk.ru/tgf', {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
      'X-Upload-Token': PROTALK_UPLOAD_TOKEN,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Permanent storage upload failed (${res.status}): ${errText}`);
  }

  const rawText = (await res.text()).trim();
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed.url === 'string') return parsed.url;
  } catch {
    // raw URL string
  }
  return rawText;
}

async function ensureVoiceFolder(queryPg: QueryPgFn): Promise<number | null> {
  try {
    const existing = await queryPg<{ id: number }>(
      "SELECT id FROM file_folders WHERE LOWER(name) = 'голосовые' ORDER BY id ASC LIMIT 1;"
    );
    if (existing.rows && existing.rows[0]?.id) {
      return Number(existing.rows[0].id);
    }

    const inserted = await queryPg<{ id: number }>(
      "INSERT INTO file_folders (user_uid, name, color) VALUES (NULL, 'Голосовые', '#ef4444') RETURNING id;"
    );
    return inserted.rows[0]?.id ? Number(inserted.rows[0].id) : null;
  } catch (err) {
    console.warn('[KnigAI Voice] ensureVoiceFolder warning:', err);
    return null;
  }
}

async function logVoiceSttAttempt(
  queryPg: QueryPgFn,
  params: {
    userUid: number;
    fieldContext: string;
    mimeType: string;
    fileSize: number;
    durationSec: number;
    tempUrl?: string | null;
    permanentUrl?: string | null;
    replyText?: string | null;
    errorMsg?: string | null;
  }
): Promise<void> {
  try {
    await queryPg(
      `INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply, channel_name,
        bot_id, llm, api_key, tokens_total, tokens_in_source, tokens_out_source,
        function_error, function_call_params, server_name, tokens_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15);`,
      [
        `voice_${params.userUid}`,
        String(params.userUid),
        `[VOICE STT] ${params.fieldContext || 'text_field'} (${params.durationSec}s, ${params.fileSize} bytes)`,
        params.replyText || null,
        'protalk_voice_stt',
        PROTALK_BOT_ID,
        'protalk-stt-widget',
        'public-widget',
        0,
        0,
        0,
        params.errorMsg || null,
        JSON.stringify({
          field_context: params.fieldContext,
          mime_type: params.mimeType,
          duration_sec: params.durationSec,
          file_size: params.fileSize,
          temp_url: params.tempUrl || null,
          permanent_url: params.permanentUrl || null,
        }),
        'api.pro-talk.ru',
        0,
      ]
    );
  } catch (err) {
    console.warn('[KnigAI Voice] Failed to log STT attempt:', err);
  }
}

export function registerVoiceRoutes(
  app: Express,
  upload: Multer,
  queryPg: QueryPgFn,
  getUniqueFileName: GetUniqueFileNameFn
): void {
  // Primary STT endpoint accepting multipart/form-data ("audio") OR JSON ("audio_base64")
  app.post(
    ['/api/voice/stt', '/voice/stt'],
    upload.any(),
    async (req: Request, res: Response) => {
      let buffer: Buffer | null = null;
      let mime = 'audio/webm';
      let userUid = 10000000001;
      let fieldContext = 'text_field';
      let durationSec = 0;
      let tempUrl: string | null = null;
      let permanentUrl: string | null = null;

      try {
        const files = (req.files as Express.Multer.File[]) || [];
        const uploadedAudio = files[0];
        const body = req.body || {};

        const bookId = body.book_id ? parseInt(String(body.book_id), 10) : null;
        const chapterId = body.chapter_id ? parseInt(String(body.chapter_id), 10) : null;
        const bookTitleParam = typeof body.book_title === 'string' ? body.book_title.trim() : null;

        if (body.user_uid) {
          const parsedUid = parseInt(String(body.user_uid), 10);
          if (!isNaN(parsedUid) && parsedUid > 0) userUid = parsedUid;
        }
        if (body.field_context) {
          fieldContext = String(body.field_context).slice(0, 160);
        }
        if (body.duration_sec) {
          const d = Number(body.duration_sec);
          if (Number.isFinite(d) && d >= 0) durationSec = Number(d.toFixed(1));
        }

        if (uploadedAudio && uploadedAudio.buffer && uploadedAudio.buffer.length > 0) {
          buffer = uploadedAudio.buffer;
          mime = String(body.mime_type || uploadedAudio.mimetype || 'audio/webm');
        } else if (body.audio_base64) {
          const rawB64 = String(body.audio_base64);
          const cleanB64 = rawB64.includes(',')
            ? rawB64.split(',')[1]
            : rawB64.replace(/^data:[^;]+;base64,/, '');
          buffer = Buffer.from(cleanB64, 'base64');
          mime = String(body.mime_type || 'audio/webm');
        }

        if (!buffer || buffer.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'Аудиозапись пуста или не передана.',
          });
        }

        const ext = getExtensionForAudioMime(mime);
        const filename = await getUniqueFileName(buildVoiceFilename(ext));

        // Step 1: Upload to ProTalk temp endpoint (public widget API, no token)
        const formData = new FormData();
        const uint8 = new Uint8Array(buffer);
        const audioBlob = new Blob([uint8], { type: mime });
        formData.append('file', audioBlob, `voice_message.${ext}`);

        const uploadRes = await fetch('https://file.pro-talk.ru/upload_tmp', {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: formData,
          signal: AbortSignal.timeout(20000),
        });

        if (!uploadRes.ok) {
          const errTxt = await uploadRes.text().catch(() => '');
          const msg = `Ошибка временной загрузки аудио (${uploadRes.status}): ${errTxt}`;
          await logVoiceSttAttempt(queryPg, {
            userUid,
            fieldContext,
            mimeType: mime,
            fileSize: buffer.length,
            durationSec,
            errorMsg: msg,
          });
          return res.status(502).json({ success: false, error: msg });
        }

        const uploadData = (await uploadRes.json().catch(() => ({}))) as {
          data?: { url?: string };
          url?: string;
        };
        tempUrl = uploadData?.data?.url || uploadData?.url || null;

        if (!tempUrl) {
          const msg = 'Сервис upload_tmp не вернул ссылку на аудиофайл.';
          await logVoiceSttAttempt(queryPg, {
            userUid,
            fieldContext,
            mimeType: mime,
            fileSize: buffer.length,
            durationSec,
            errorMsg: msg,
          });
          return res.status(502).json({ success: false, error: msg });
        }

        // Step 2: Transcribe speech via ProTalk STT widget (public API, free)
        const sttUrl = `https://api.pro-talk.ru/api/v1.0/stt_from_widget?url=${encodeURIComponent(
          tempUrl
        )}`;
        const sttRes = await fetch(sttUrl, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(25000),
        });

        if (!sttRes.ok) {
          const sttErr = await sttRes.text().catch(() => '');
          const msg = `Ошибка распознавания речи ProTalk STT (${sttRes.status}): ${sttErr}`;
          await logVoiceSttAttempt(queryPg, {
            userUid,
            fieldContext,
            mimeType: mime,
            fileSize: buffer.length,
            durationSec,
            tempUrl,
            errorMsg: msg,
          });
          return res.status(502).json({ success: false, error: msg, file_url: tempUrl });
        }

        const sttData = (await sttRes.json().catch(() => ({}))) as { text?: string; error?: string };
        const transcribedText = typeof sttData?.text === 'string' ? sttData.text.trim() : '';

        // Step 3: Store recording permanently in ProTalk filestore + PostgreSQL folder 'Голосовые'
        try {
          const caption = `🎙 Голосовая заметка KnigAI\n👤 UID: ${userUid}\n📍 Поле: ${fieldContext}\n📝 Текст: ${
            transcribedText ? transcribedText.slice(0, 180) : '(без текста)'
          }`;
          permanentUrl = await uploadToPermanentStorage(buffer, filename, mime, caption);
        } catch (permErr) {
          console.warn('[KnigAI Voice] Permanent upload fallback to tempUrl:', permErr);
          permanentUrl = tempUrl;
        }

        const finalAudioUrl = permanentUrl || tempUrl;
        let savedFileId: number | null = null;
        let folderId: number | null = null;
        let transcriptionId: number | null = null;

        try {
          if (bookId && bookId > 0) {
            const folderInfo = await ensureServerBookFolderId(queryPg, bookId, userUid, bookTitleParam);
            folderId = folderInfo.folderId;
          } else {
            folderId = await ensureVoiceFolder(queryPg);
          }
          const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
          let fileKey = 'v_';
          for (let i = 0; i < 8; i++) {
            fileKey += chars.charAt(Math.floor(Math.random() * chars.length));
          }

          const fileInsert = await queryPg<{ id: number }>(
            `INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
             VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7)
             RETURNING id;`,
            [userUid, fileKey, filename, finalAudioUrl, mime, buffer.length, folderId]
          );
          savedFileId = fileInsert.rows[0]?.id ? Number(fileInsert.rows[0].id) : null;

          const trInsert = await queryPg<{ id: number }>(
            `INSERT INTO voice_transcriptions (
              user_uid, file_id, book_id, chapter_id, field_context, audio_url, short_audio_url,
              mime_type, file_size, duration_sec, recognized_text, tokens_used
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0)
            RETURNING id;`,
            [
              userUid,
              savedFileId,
              bookId && bookId > 0 ? bookId : null,
              chapterId && chapterId > 0 ? chapterId : null,
              fieldContext,
              finalAudioUrl,
              savedFileId ? `/file/${savedFileId}/${encodeURIComponent(filename)}` : finalAudioUrl,
              mime,
              buffer.length,
              durationSec,
              transcribedText,
            ]
          );
          transcriptionId = trInsert.rows[0]?.id ? Number(trInsert.rows[0].id) : null;
        } catch (dbErr) {
          console.warn('[KnigAI Voice] PostgreSQL save warning:', dbErr);
        }

        await logVoiceSttAttempt(queryPg, {
          userUid,
          fieldContext,
          mimeType: mime,
          fileSize: buffer.length,
          durationSec,
          tempUrl,
          permanentUrl: finalAudioUrl,
          replyText: transcribedText,
        });

        const shortUrl = savedFileId
          ? `/file/${savedFileId}/${encodeURIComponent(filename)}`
          : finalAudioUrl;

        return res.json({
          success: true,
          text: transcribedText,
          file_url: finalAudioUrl,
          short_url: shortUrl,
          file_id: savedFileId,
          folder_id: folderId,
          transcription_id: transcriptionId,
          duration_sec: durationSec,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[KnigAI Voice STT] Error:', msg);
        await logVoiceSttAttempt(queryPg, {
          userUid,
          fieldContext,
          mimeType: mime,
          fileSize: buffer?.length || 0,
          durationSec,
          tempUrl,
          permanentUrl,
          errorMsg: msg,
        });
        return res.status(500).json({
          success: false,
          error: `Внутренняя ошибка распознавания голоса: ${msg}`,
        });
      }
    }
  );

  // Recent voice transcriptions history endpoint
  app.get('/api/voice/history', async (req: Request, res: Response) => {
    try {
      const userUid = req.query.user_uid ? parseInt(String(req.query.user_uid), 10) : null;
      const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || 25), 10) || 25));

      const sql = userUid
        ? `SELECT * FROM voice_transcriptions WHERE user_uid = $1 ORDER BY id DESC LIMIT ${limit};`
        : `SELECT * FROM voice_transcriptions ORDER BY id DESC LIMIT ${limit};`;
      const params = userUid ? [userUid] : [];
      const result = await queryPg(sql, params);
      res.json({ success: true, rows: result.rows || [] });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
