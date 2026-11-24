import { Express, Request, Response } from 'express';
import type multer from 'multer';
import { uploadBufferToTelegramStorage } from './telegramStorage';

interface QueryPgFn {
  <T = Record<string, unknown>>(
    sql: string,
    params?: (string | number | boolean | null)[]
  ): Promise<{ rows: T[]; rowCount: number }>;
}

interface GetUniqueFileNameFn {
  (originalName: string): Promise<string>;
}

async function getOrCreateFolderId(
  queryPg: QueryPgFn,
  folderName: string,
  userUid: number | null
): Promise<number | null> {
  try {
    const existing = await queryPg<{ id: number }>(
      `SELECT id FROM file_folders WHERE LOWER(name) = LOWER($1) AND (user_uid = $2 OR user_uid IS NULL) ORDER BY user_uid DESC NULLS LAST LIMIT 1;`,
      [folderName, userUid]
    );
    if (existing.rows?.[0]?.id) {
      return Number(existing.rows[0].id);
    }
    const created = await queryPg<{ id: number }>(
      `INSERT INTO file_folders (user_uid, name, color) VALUES ($1, $2, $3) RETURNING id;`,
      [userUid, folderName, '#e11d48']
    );
    return created.rows?.[0]?.id ? Number(created.rows[0].id) : null;
  } catch {
    return null;
  }
}

export function registerDraftsAndUploadRoutes(
  app: Express,
  upload: multer.Multer,
  queryPg: QueryPgFn,
  getUniqueFileName: GetUniqueFileNameFn
) {
  /**
   * Direct upload of clipboard / pasted / writer images or draft scans to Telegram cloud (file.pro-talk.ru)
   * and PostgreSQL file_storage registration with permanent URL.
   */
  app.post('/api/files/upload-clipboard', upload.single('file'), async (req: Request, res: Response) => {
    try {
      let buffer: Buffer | null = null;
      let mimeType = 'image/png';
      let filename = `clipboard_${Date.now()}.png`;
      const rawUid = req.body?.user_uid;
      const userUid = rawUid ? parseInt(String(rawUid), 10) : 10000000001;
      const folderLabel =
        typeof req.body?.folder_name === 'string' && req.body.folder_name.trim()
          ? req.body.folder_name.trim()
          : 'Буфер обмена';
      const customCaption =
        typeof req.body?.caption === 'string' && req.body.caption.trim()
          ? req.body.caption.trim()
          : undefined;
      const tokenOverride =
        typeof req.body?.upload_token === 'string' && req.body.upload_token.trim()
          ? req.body.upload_token.trim()
          : typeof req.headers['x-upload-token'] === 'string'
          ? req.headers['x-upload-token'].trim()
          : undefined;

      const uploadedFile = (req as Request & { file?: Express.Multer.File }).file;
      if (uploadedFile && uploadedFile.buffer?.length) {
        buffer = uploadedFile.buffer;
        mimeType = uploadedFile.mimetype || mimeType;
        filename = uploadedFile.originalname || filename;
      } else if (typeof req.body?.dataUrl === 'string' && req.body.dataUrl.startsWith('data:')) {
        const raw = req.body.dataUrl;
        const commaIdx = raw.indexOf(',');
        const meta = commaIdx !== -1 ? raw.slice(0, commaIdx) : '';
        const b64 = commaIdx !== -1 ? raw.slice(commaIdx + 1) : raw;
        const m = meta.match(/data:([^;]+)/);
        if (m?.[1]) mimeType = m[1];
        if (typeof req.body?.filename === 'string' && req.body.filename.trim()) {
          filename = req.body.filename.trim();
        } else {
          const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
          filename = `clipboard_${Date.now()}.${ext}`;
        }
        buffer = Buffer.from(b64, 'base64');
      }

      if (!buffer || buffer.length === 0) {
        return res.status(400).json({ success: false, error: 'Не передано изображение для загрузки' });
      }

      const uploaded = await uploadBufferToTelegramStorage({
        buffer,
        filename,
        mimeType,
        caption: customCaption || `🖼️ Изображение из буфера KnigAI: ${filename}`,
        preserveAlpha: true,
        uploadToken: tokenOverride,
      });

      const folderId = await getOrCreateFolderId(queryPg, folderLabel, Number.isFinite(userUid) ? userUid : null);
      const uniqueName = await getUniqueFileName(filename);
      const fileKey = `clip_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      let savedRow: Record<string, unknown> | null = null;
      const existing = await queryPg<Record<string, unknown>>(
        `SELECT * FROM file_storage WHERE url = $1 OR original_url = $1 LIMIT 1;`,
        [uploaded.url]
      );
      if (existing.rows && existing.rows.length > 0) {
        savedRow = existing.rows[0];
      } else {
        const insertRes = await queryPg<Record<string, unknown>>(
          `INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
           VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7)
           RETURNING *;`,
          [
            Number.isFinite(userUid) ? userUid : 10000000001,
            fileKey,
            uniqueName,
            uploaded.url,
            uploaded.mimeType || mimeType,
            uploaded.size || buffer.byteLength,
            folderId,
          ]
        );
        savedRow = insertRes.rows?.[0] || null;
      }

      const shortUrl = savedRow?.id
        ? `${req.protocol}://${req.get('host')}/file/${savedRow.id}`
        : uploaded.url;

      return res.json({
        success: true,
        url: uploaded.url,
        shortUrl,
        mimeType: uploaded.mimeType || mimeType,
        size: uploaded.size || buffer.byteLength,
        file: savedRow ? { ...savedRow, short_url: shortUrl } : null,
      });
    } catch (err: unknown) {
      console.error('[KnigAI Clipboard Upload] Error:', err);
      return res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : 'Ошибка загрузки изображения в облако',
      });
    }
  });
}
