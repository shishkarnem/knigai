import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import multer from 'multer';
import { registerParserEndpoints } from './server/parserEndpoints';
import { registerVoiceRoutes } from './server/voice/voiceSttRoutes';
import { ensureBookAudioSchema } from './server/voice/bookAudioSchema';
import { registerBookAudioRoutes } from './server/voice/bookAudioRoutes';
import { seedPromptsAndGenres } from './server/db/seedDatabase';
import {
  mirrorUrlToTelegramStorage,
  uploadBufferToTelegramStorage,
} from './server/files/telegramStorage';
import {
  ensureBackupSchema,
  registerBackupRoutes,
  startDailyBackupScheduler,
} from './server/backup/backupRoutes';
import { ensureTelegramSchema } from './server/telegram/telegramService';
import { registerTelegramRoutes } from './server/telegram/telegramRoutes';
import { ensureTelegramWebAppSchema } from './server/telegram/telegramWebAppAuth';
import { registerTelegramWebAppRoutes } from './server/telegram/telegramWebAppRoutes';
import { ensureBookEnhancementSchema } from './server/db/bookEnhancementSchema';
import { registerDraftsAndUploadRoutes } from './server/files/draftsAndUploadRoutes';
import { ensurePushSchema, registerPushRoutes } from './server/push/pushRoutes';
import { registerSeoFeedRoutes } from './server/seo/seoRoutes';
import { registerStaticAssetsFallback } from './server/seo/staticAssetsFallback';
import { ensureFooterLinksSchema, registerFooterLinksRoutes } from './server/seo/footerLinksRoutes';
import { ensurePaymentsSchema } from './server/payments/robokassaSchema';
import { registerRobokassaRoutes } from './server/payments/robokassaRoutes';
import { ensureAppVersionSchema, registerAppVersionRoutes } from './server/db/appVersionService';
import { ensureBlogSchema } from './server/blog/blogSchema';
import { registerBlogRoutes } from './server/blog/blogRoutes';
import { ensureBlogSeedPosts } from './server/blog/blogSeedPosts';
import { injectBlogSeoIntoHtml } from './server/blog/blogSeoHtml';
import { startSavRssScheduler } from './server/blog/savRssSync';
import { registerExportRoutes } from './server/export/exportRoutes';
import { ensureMailAndAuthSchema } from './server/auth/mailConfigSchema';
import { registerPasswordResetAndAuthRoutes } from './server/auth/passwordResetRoutes';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
  },
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'microphone=*');
  next();
});

const DB_URL = 'https://db.pro-talk.ru/api/proxy/query';
const USER_ID = 'recTWyxN1GrSPlSxc';

async function queryPg<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | boolean | null)[] = [],
  safeMode = false
) {
  const doFetch = async (timeoutMs = 20000) => {
    return fetch(DB_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': USER_ID,
      },
      body: JSON.stringify({
        database: 'kniga',
        query: sql,
        params,
        safeMode,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  };

  let response: globalThis.Response;
  try {
    response = await doFetch(20000);
  } catch (firstErr: any) {
    console.warn(`[queryPg] DB request notice (${firstErr?.message || firstErr}). Retrying...`);
    await new Promise((r) => setTimeout(r, 400));
    try {
      response = await doFetch(40000);
    } catch (secondErr: any) {
      console.warn(`[queryPg] Second DB attempt notice (${secondErr?.message || secondErr}). Final retry...`);
      await new Promise((r) => setTimeout(r, 700));
      response = await doFetch(40000);
    }
  }

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`DB Error [${response.status}]: ${txt}`);
  }
  const data = await response.json();
  return { rows: (data.rows || []) as T[], rowCount: data.rowCount || 0 };
}

// 1. Short file proxy route: /file/:id and /file/:id/:filename
app.get(['/file/:id', '/file/:id/:filename'], async (req, res) => {
  try {
    const param = req.params.id;
    let sql = 'SELECT * FROM file_storage WHERE file_key = $1 LIMIT 1;';
    let params: (string | number)[] = [param];

    if (/^\d+$/.test(param)) {
      sql = 'SELECT * FROM file_storage WHERE id = $1 LIMIT 1;';
      params = [parseInt(param, 10)];
    }

    const { rows } = await queryPg<{ original_url: string; mime_type: string; name: string }>(sql, params);
    const file = rows[0];

    if (!file || !file.original_url) {
      return res.status(404).send('File not found in gallery');
    }

    if (file.original_url.startsWith('data:')) {
      const commaIdx = file.original_url.indexOf(',');
      const meta = commaIdx !== -1 ? file.original_url.slice(0, commaIdx) : '';
      const base64Data = commaIdx !== -1 ? file.original_url.slice(commaIdx + 1) : file.original_url;
      const mimeMatch = meta.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : (file.mime_type || 'image/png');
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      return res.send(Buffer.from(base64Data, 'base64'));
    }

    const rangeHeader = req.headers.range;
    const upstreamHeaders: Record<string, string> = {};
    if (rangeHeader) {
      upstreamHeaders.Range = String(rangeHeader);
    }

    const fileRes = await fetch(file.original_url, {
      headers: upstreamHeaders,
    });
    if (!fileRes.ok && fileRes.status !== 206) {
      return res.redirect(file.original_url);
    }

    const lowerName = (file.name || '').toLowerCase();
    let contentType = fileRes.headers.get('content-type') || file.mime_type;
    if (lowerName.endsWith('.png')) {
      contentType = 'image/png';
    } else if (lowerName.endsWith('.webm')) {
      contentType = 'audio/webm';
    } else if (lowerName.endsWith('.m4a') || lowerName.endsWith('.mp4')) {
      contentType = 'audio/mp4';
    } else if (lowerName.endsWith('.ogg')) {
      contentType = 'audio/ogg';
    } else if (lowerName.endsWith('.mp3')) {
      contentType = 'audio/mpeg';
    } else if (lowerName.endsWith('.wav')) {
      contentType = 'audio/wav';
    } else if (!contentType || contentType === 'application/octet-stream') {
      contentType = file.mime_type || 'image/png';
    }

    res.status(fileRes.status === 206 ? 206 : 200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');
    const contentRange = fileRes.headers.get('content-range');
    if (contentRange) {
      res.setHeader('Content-Range', contentRange);
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    const arrayBuffer = await fileRes.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (err) {
    console.error('File proxy error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// 1.0 Resolve internal /file/:id or /file/:key short URL to its public external URL
app.get('/api/files/resolve-url', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl) {
      return res.json({ resolvedUrl: '' });
    }
    const match = rawUrl.match(/\/file\/([^/?#]+)/);
    if (!match) {
      const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(rawUrl);
      return res.json({ resolvedUrl: isLocal ? '' : rawUrl });
    }
    const param = match[1];
    const isNumeric = /^\d+$/.test(param);
    const sql = isNumeric
      ? 'SELECT original_url, url FROM file_storage WHERE id = $1 LIMIT 1;'
      : 'SELECT original_url, url FROM file_storage WHERE file_key = $1 LIMIT 1;';
    const { rows } = await queryPg<{ original_url?: string; url?: string }>(sql, [
      isNumeric ? parseInt(param, 10) : param,
    ]);
    const orig = rows[0]?.original_url || rows[0]?.url || '';
    const isPublicHttp = /^https?:\/\//i.test(orig) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(orig);
    return res.json({ resolvedUrl: isPublicHttp ? orig : '' });
  } catch (err) {
    res.status(500).json({ resolvedUrl: '', error: err instanceof Error ? err.message : String(err) });
  }
});

async function getUniqueFileName(originalName: string): Promise<string> {
  const cleanName = (originalName || 'file').trim();
  const check = await queryPg('SELECT id FROM file_storage WHERE name = $1 LIMIT 1;', [cleanName]);
  if (!check.rows || check.rows.length === 0) {
    return cleanName;
  }

  const baseName = cleanName.replace(/^\d+_/, '');
  const prefix = Date.now().toString().slice(-5);
  return `${prefix}_${baseName}`;
}

async function inspectRemoteFileSize(rawUrl: string): Promise<number> {
  const url = String(rawUrl || '').trim();
  if (!url) return 0;

  if (url.startsWith('data:')) {
    const commaIdx = url.indexOf(',');
    const base64Part = commaIdx !== -1 ? url.slice(commaIdx + 1) : url;
    return Math.max(0, Math.round(base64Part.length * 0.75));
  }

  if (!/^https?:\/\//i.test(url)) return 0;

  try {
    const headRes = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(6000),
    });
    const contentLen = headRes.headers.get('content-length');
    if (contentLen && Number(contentLen) > 0) {
      return Number(contentLen);
    }
  } catch {
    // Fallback to GET below
  }

  try {
    const getRes = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    });
    if (!getRes.ok) return 0;
    const lenHeader = getRes.headers.get('content-length');
    if (lenHeader && Number(lenHeader) > 0) {
      return Number(lenHeader);
    }
    const buf = await getRes.arrayBuffer();
    return buf.byteLength || 0;
  } catch {
    return 0;
  }
}

// 1.1 Register file in local gallery database (mirroring generated/remote files to Telegram Storage by X-Upload-Token)
app.post('/api/admin/files/register', async (req, res) => {
  try {
    const {
      name,
      original_url,
      mime_type,
      file_size,
      folder_id,
      user_uid,
      upload_to_telegram,
      upload_token,
      caption,
    } = req.body;
    if (!original_url) {
      return res.status(400).json({ success: false, error: 'original_url обязателен' });
    }

    const effectiveUid = user_uid ? parseInt(user_uid, 10) : 10000000001;
    const effectiveFolderId = folder_id && folder_id !== 'null' ? parseInt(folder_id, 10) : null;
    const rawName = (name || 'file.jpg').trim();
    const uniqueName = await getUniqueFileName(rawName);
    const tokenOverride =
      typeof upload_token === 'string' && upload_token.trim()
        ? upload_token.trim()
        : typeof req.headers['x-upload-token'] === 'string'
        ? req.headers['x-upload-token'].trim()
        : undefined;

    let finalUrl = String(original_url).trim();
    let finalMime = mime_type || (uniqueName.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
    let resolvedSize = Number(file_size) || 0;

    // Upload generated / remote / data: assets directly into Telegram Storage using X-Upload-Token
    if (upload_to_telegram !== false) {
      try {
        const ext = finalMime.includes('png') ? '.png' : finalMime.includes('pdf') ? '.pdf' : '.jpg';
        const uploadFilename = /\.(png|jpe?g|webp|pdf|mp3|ogg|webm)$/i.test(uniqueName)
          ? uniqueName
          : `${uniqueName}${ext}`;
        const mirrored = await mirrorUrlToTelegramStorage({
          sourceUrl: finalUrl,
          filename: uploadFilename,
          mimeType: finalMime,
          caption: caption || `📚 Файл KnigAI: ${uniqueName}`,
          uploadToken: tokenOverride,
        });
        finalUrl = mirrored.url;
        resolvedSize = mirrored.size;
        finalMime = mirrored.mimeType || finalMime;
      } catch (mirrorErr) {
        console.warn('[KnigAI Register File] Telegram upload notice, using source URL:', mirrorErr);
      }
    }

    if (resolvedSize <= 0) {
      resolvedSize = await inspectRemoteFileSize(finalUrl);
    }

    // 8-character unique file_key
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let fileKey = '';
    for (let i = 0; i < 8; i++) {
      fileKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const insertSql = `
      INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
      VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7)
      RETURNING *;
    `;
    const insertRes = await queryPg<{
      id: number;
      user_uid: number;
      file_key: string;
      name: string;
      original_url: string;
      mime_type: string;
      file_size: number;
      folder_id: number | null;
      created_at: string;
    }>(insertSql, [
      effectiveUid,
      fileKey,
      uniqueName,
      finalUrl,
      finalMime,
      resolvedSize,
      effectiveFolderId,
    ]);

    const row = insertRes.rows[0];
    const host = req.get('host') || 'localhost:3000';
    const proto = req.protocol || 'http';

    res.json({
      ...row,
      original_url: finalUrl,
      file_size: resolvedSize,
      short_url: `${proto}://${host}/file/${row.id}`,
    });
  } catch (err: unknown) {
    console.error('[KnigAI Register File] Error:', err);
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// 1.1b Recalculate real file sizes for zero-byte entries in file_storage
app.post('/api/admin/files/recalculate-sizes', async (req, res) => {
  try {
    const { rows } = await queryPg<{ id: number; original_url: string; url: string | null }>(
      'SELECT id, original_url, url FROM file_storage WHERE COALESCE(file_size, 0) <= 0 OR COALESCE(size_bytes, 0) <= 0 ORDER BY id DESC LIMIT 100;'
    );
    const updated: Array<{ id: number; size: number }> = [];
    for (const row of rows || []) {
      const targetUrl = (row.original_url || row.url || '').trim();
      if (!targetUrl) continue;
      const bytes = await inspectRemoteFileSize(targetUrl);
      if (bytes > 0) {
        await queryPg('UPDATE file_storage SET file_size = $1, size_bytes = $1 WHERE id = $2;', [bytes, row.id]);
        updated.push({ id: row.id, size: bytes });
      }
    }
    res.json({ success: true, checked: rows.length, updatedCount: updated.length, updated });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// 1.2 Upload route with PNG alpha preservation (X-Preserve-Alpha: true)
app.post('/api/upload', upload.any(), async (req, res) => {
  try {
    const rawFiles = (req.files as Express.Multer.File[]) || [];
    if (!rawFiles.length) {
      return res.status(400).json({ success: false, error: 'Файлы для загрузки не найдены' });
    }

    const userUid = req.body.user_uid ? parseInt(req.body.user_uid, 10) : 10000000001;
    const folderId = req.body.folder_id && req.body.folder_id !== 'null' ? parseInt(req.body.folder_id, 10) : null;

    const savedRecords = [];

    for (const f of rawFiles) {
      const isPng =
        (f.mimetype && f.mimetype.includes('png')) ||
        f.originalname.toLowerCase().endsWith('.png') ||
        (f.buffer.length >= 8 && f.buffer[0] === 0x89 && f.buffer[1] === 0x50 && f.buffer[2] === 0x4E && f.buffer[3] === 0x47);
      const mime = isPng ? 'image/png' : (f.mimetype || 'image/jpeg');
      const filename = f.originalname || (isPng ? 'image.png' : 'image.jpg');

      const safeFilename = f.originalname || (isPng ? 'image.png' : 'book_file.fb2');
      const bookTitle = req.body.title || req.body.book_title || '';
      const bookAuthor = req.body.author || req.body.book_author || '';
      const bookDesc = req.body.description || req.body.synopsis || '';
      let caption = req.body.caption || '';
      if (!caption && (bookTitle || bookAuthor)) {
        caption = `📖 Книга: ${bookTitle || 'Без названия'}\n✍️ Автор: ${bookAuthor || 'Не указан'}${bookDesc ? `\n📝 Описание: ${bookDesc.slice(0, 200)}...` : ''}\n📁 Файл: ${safeFilename}`;
      } else if (!caption) {
        caption = `📁 Файл: ${safeFilename}`;
      }

      const tokenOverride =
        typeof req.body.upload_token === 'string' && req.body.upload_token.trim()
          ? req.body.upload_token.trim()
          : typeof req.headers['x-upload-token'] === 'string'
          ? req.headers['x-upload-token'].trim()
          : undefined;

      const uploaded = await uploadBufferToTelegramStorage({
        buffer: f.buffer,
        filename: safeFilename,
        mimeType: mime,
        caption,
        preserveAlpha: true,
        uploadToken: tokenOverride,
      });
      const originalUrl = uploaded.url;
      const fileKey = `file_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

      // Calculate sequential unique name if name already exists
      const uniqueName = await getUniqueFileName(safeFilename);

      // Check if file already exists in file_storage by url
      let savedRow: any = null;
      try {
        const checkExisting = await queryPg<any>(
          'SELECT * FROM file_storage WHERE url = $1 OR original_url = $1 LIMIT 1;',
          [originalUrl]
        );
        if (checkExisting.rows && checkExisting.rows.length > 0) {
          savedRow = checkExisting.rows[0];
        }
      } catch {
        // proceed
      }

      if (!savedRow) {
        // Record file in database
        const insertSql = `
          INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
          VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7)
          RETURNING *;
        `;
        const insertRes = await queryPg<any>(insertSql, [
          userUid,
          fileKey,
          uniqueName,
          originalUrl,
          mime,
          f.size,
          folderId,
        ]);
        savedRow = insertRes.rows[0];
      }
      savedRecords.push({
        ...savedRow,
        short_url: `${req.protocol}://${req.get('host')}/file/${savedRow.id}`,
      });
    }

    res.json({
      success: true,
      files: savedRecords,
      file: savedRecords[0],
      url: savedRecords[0]?.original_url,
    });
  } catch (err: unknown) {
    console.error('[KnigAI Upload] Error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 1.2 Delete file from PostgreSQL database
app.delete('/api/files/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Некорректный ID файла' });
    }

    const result = await queryPg('DELETE FROM file_storage WHERE id = $1 RETURNING id;', [id]);
    res.json({
      success: true,
      deletedId: id,
      deletedCount: result.rowCount,
    });
  } catch (err: unknown) {
    console.error('[KnigAI Noir Delete] Error:', err);
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 2. Admin Auth check
app.post('/api/admin/auth/verify', (req, res) => {
  const { password } = req.body;
  if (password === 'wkL35eTm') {
    return res.json({ success: true, token: 'knigai_admin_session_auth' });
  }
  return res.status(401).json({ success: false, error: 'Неверный пароль доступа' });
});

// 3. Admin DB schema and tables inspection
app.get('/api/admin/db/tables', async (req, res) => {
  try {
    const tablesRes = await queryPg<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const tablesWithCounts = [];

    for (const t of tablesRes.rows) {
      try {
        const countRes = await queryPg<{ count: string }>(`SELECT count(*) as count FROM "${t.table_name}";`);
        tablesWithCounts.push({
          name: t.table_name,
          count: parseInt(countRes.rows[0]?.count || '0', 10),
        });
      } catch {
        tablesWithCounts.push({ name: t.table_name, count: 0 });
      }
    }

    res.json({ tables: tablesWithCounts });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// 4. Admin DB table rows with search, offset pagination and totalCount
app.get('/api/admin/db/table-data', async (req, res) => {
  try {
    const tableName = String(req.query.table || 'books').replace(/[^a-zA-Z0-9_]/g, '');
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 50), 10) || 50));
    const offset = Math.max(0, parseInt(String(req.query.offset || 0), 10) || 0);
    const search = String(req.query.search || '').trim();

    const params: (string | number | boolean | null)[] = [];
    let whereSql = '';
    if (search) {
      params.push(`%${search}%`);
      whereSql = `WHERE row_to_json(t)::text ILIKE $1`;
    }

    const sql =
      tableName === 'logs'
        ? `SELECT id, channel_id, user_social_id, user_message, bot_reply, channel_name, bot_id, llm, api_key, tokens_total, ROUND((COALESCE(tokens_total, 0)::numeric / 10000000.0) * 300.0, 6) AS rub, tokens_in_source, tokens_out_source, function_error, function_call_params, server_name, tokens_user, created_at FROM "logs" t ${whereSql} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset};`
        : `SELECT * FROM "${tableName}" t ${whereSql} ORDER BY 1 DESC LIMIT ${limit} OFFSET ${offset};`;

    const countSql = `SELECT count(*) AS total FROM "${tableName}" t ${whereSql};`;
    const [dataRes, countRes] = await Promise.all([
      queryPg(sql, params),
      queryPg<{ total: string }>(countSql, params),
    ]);

    res.json({
      rows: dataRes.rows,
      rowCount: dataRes.rowCount,
      totalCount: parseInt(countRes.rows[0]?.total || '0', 10),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// 4.1 Record AI Log entry into PostgreSQL logs table
app.post('/api/logs', async (req, res) => {
  try {
    const {
      channel_id = null,
      user_social_id = null,
      user_message = null,
      bot_reply = null,
      channel_name = null,
      bot_id = null,
      llm = null,
      api_key = null,
      tokens_total = null,
      tokens_in_source = null,
      tokens_out_source = null,
      function_error = null,
      function_call_params = null,
      server_name = null,
      tokens_user = null,
    } = req.body || {};

    const insertSql = `
      INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply, channel_name,
        bot_id, llm, api_key, tokens_total, tokens_in_source, tokens_out_source,
        function_error, function_call_params, server_name, tokens_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *, ROUND((COALESCE(tokens_total, 0)::numeric / 10000000.0) * 300.0, 6) AS rub;
    `;
    const result = await queryPg(insertSql, [
      channel_id,
      user_social_id,
      user_message,
      bot_reply,
      channel_name,
      bot_id,
      llm,
      api_key,
      tokens_total,
      tokens_in_source,
      tokens_out_source,
      function_error,
      function_call_params,
      server_name,
      tokens_user,
    ]);
    res.json({ success: true, row: result.rows[0] || null });
  } catch (err: unknown) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// 4.2 Synchronous Admin AI Logs Mirror with computed rub column (10 000 000 tokens = 300 RUB)
app.get('/api/admin/logs', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit || 100), 10) || 100));
    const search = String(req.query.search || '').trim();
    const onlyErrors = String(req.query.only_errors || '') === 'true';

    const whereParts: string[] = [];
    const params: (string | number | boolean | null)[] = [];

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      whereParts.push(
        `(COALESCE(channel_id,'') ILIKE $${idx} OR COALESCE(user_social_id,'') ILIKE $${idx} OR COALESCE(user_message,'') ILIKE $${idx} OR COALESCE(bot_reply,'') ILIKE $${idx} OR COALESCE(llm,'') ILIKE $${idx} OR COALESCE(function_error,'') ILIKE $${idx})`
      );
    }
    if (onlyErrors) {
      whereParts.push(`(function_error IS NOT NULL AND function_error <> '')`);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const rowsSql = `
      SELECT
        id, channel_id, user_social_id, user_message, bot_reply, channel_name,
        bot_id, llm, api_key, tokens_total,
        ROUND((COALESCE(tokens_total, 0)::numeric / 10000000.0) * 300.0, 6) AS rub,
        tokens_in_source, tokens_out_source, function_error, function_call_params,
        server_name, tokens_user, created_at
      FROM logs
      ${whereSql}
      ORDER BY id DESC
      LIMIT ${limit};
    `;
    const summarySql = `
      SELECT
        COUNT(*) AS total_count,
        COALESCE(SUM(tokens_total), 0) AS total_tokens,
        ROUND((COALESCE(SUM(tokens_total), 0)::numeric / 10000000.0) * 300.0, 6) AS total_rub,
        COUNT(*) FILTER (WHERE function_error IS NOT NULL AND function_error <> '') AS error_count
      FROM logs;
    `;

    const [rowsRes, summaryRes] = await Promise.all([
      queryPg(rowsSql, params),
      queryPg<{ total_count: string; total_tokens: string; total_rub: string; error_count: string }>(summarySql),
    ]);

    const s = summaryRes.rows[0] || { total_count: '0', total_tokens: '0', total_rub: '0', error_count: '0' };
    res.json({
      rows: rowsRes.rows || [],
      summary: {
        totalCount: Number(s.total_count || 0),
        totalTokens: Number(s.total_tokens || 0),
        totalRub: Number(s.total_rub || 0),
        errorCount: Number(s.error_count || 0),
      },
      syncedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// 5. Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'KnigAI Noir',
    database: 'kniga',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

let schemaBootstrapPromise: Promise<void> | null = null;

// 5.1 Same-origin PostgreSQL proxy endpoint (avoids browser CORS / Failed to fetch against db.pro-talk.ru)
app.post('/api/db/query', async (req, res) => {
  try {
    const query = typeof req.body?.query === 'string' ? req.body.query : '';
    const params = Array.isArray(req.body?.params) ? req.body.params : [];
    const safeMode = Boolean(req.body?.safeMode);
    if (!query.trim()) {
      return res.status(400).json({ error: 'SQL query is required' });
    }
    const result = await queryPg(query, params, safeMode);
    res.json({
      rows: result.rows,
      rowCount: result.rowCount,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[KnigAI DB Proxy] Query error:', msg);
    res.status(502).json({ error: msg });
  }
});

// 5.2 Fast schema bootstrap check (replaces 62 sequential browser DDL fetches)
app.post('/api/db/bootstrap', async (_req, res) => {
  try {
    if (schemaBootstrapPromise) {
      await Promise.race([
        schemaBootstrapPromise,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
    }
    res.json({ success: true });
  } catch (err: unknown) {
    res.json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// 6. Register Librarr-compatible Book & Audiobook Parser Endpoints
registerParserEndpoints(app, queryPg, getUniqueFileName);

// 7. Register ProTalk Voice STT & Permanent Voice Storage Endpoints
registerVoiceRoutes(app, upload, queryPg, getUniqueFileName);
registerBookAudioRoutes(app, upload, queryPg, getUniqueFileName);

// 8. Register Daily DB Backup & Telegram Restore Endpoints
registerBackupRoutes(app, upload, queryPg);

// 9. Register Telegram RF Proxy Gateway, Admin Bot Config & User Notification Routes
registerTelegramRoutes(app, queryPg);

// 10. Register Telegram Mini App HMAC Auth, Referral Stats & Notification Preferences Routes
registerTelegramWebAppRoutes(app, queryPg);

// 11. Register Clipboard & Draft Image Cloud Upload Routes
registerDraftsAndUploadRoutes(app, upload, queryPg, getUniqueFileName);

// 12. Register Web Push Notification Routes
registerPushRoutes(app, queryPg);

// 13. Register Dynamic SEO Feeds (sitemap.xml, rss.xml, yandex-tableau.json, browserconfig.xml, robots.txt)
registerSeoFeedRoutes(app, queryPg);

// 14. Register DB-backed Footer Ecosystem Links API
registerFooterLinksRoutes(app, queryPg);

// 15. Register Robokassa Payments, System Configs & Legal Consent History API
registerRobokassaRoutes(app, queryPg);

// 16. Register Platform Version Settings API (app_settings)
registerAppVersionRoutes(app, queryPg);

// 17. Register KnigAI Blog, Comments, Likes, Reposts & 16:9 Image Studio API
registerBlogRoutes(app, queryPg);

// 18. Register Prepress PDF Export Proxies (300 DPI Image & Cyrillic TTF Fonts)
registerExportRoutes(app);

// 19. Register Server Auth & Reg.ru SMTP Password Reset Routes
registerPasswordResetAndAuthRoutes(app, queryPg);

async function initDatabaseSchema() {
  console.log('[KnigAI Noir] Initializing and pinning database schema in PostgreSQL...');

  try {
    const fastCheck = await queryPg<{ ready: boolean }>(`
      SELECT (
        to_regclass('public.users') IS NOT NULL AND
        to_regclass('public.books') IS NOT NULL AND
        to_regclass('public.chapters') IS NOT NULL AND
        to_regclass('public.footer_links') IS NOT NULL AND
        to_regclass('public.system_configs') IS NOT NULL AND
        to_regclass('public.payment_orders') IS NOT NULL AND
        to_regclass('public.user_consents') IS NOT NULL AND
        to_regclass('public.push_subscriptions') IS NOT NULL AND
        to_regclass('public.book_drafts') IS NOT NULL AND
        to_regclass('public.chapter_revisions') IS NOT NULL AND
        to_regclass('public.blog_posts') IS NOT NULL AND
        to_regclass('public.book_audio_tracks') IS NOT NULL AND
        to_regclass('public.mail_configs') IS NOT NULL AND
        to_regclass('public.password_reset_tokens') IS NOT NULL AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reading_progress' AND column_name='audio_track_index') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='reading_progress' AND column_name='audio_time_sec') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='chapters' AND column_name='author_comment') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='books' AND column_name='has_voice_tracks') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='books' AND column_name='is_parsed_source') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='external_id') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='cover_video_url') AND
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='blog_posts' AND column_name='is_pinned')
      ) AS ready;
    `);
    if (fastCheck.rows[0]?.ready) {
      await ensureMailAndAuthSchema(queryPg).catch((e) =>
        console.warn('[KnigAI Noir] Mail schema init notice:', e)
      );
      await ensureFooterLinksSchema(queryPg).catch((e) =>
        console.warn('[KnigAI Noir] Footer links init notice:', e)
      );
      await ensurePaymentsSchema(queryPg).catch((e) =>
        console.warn('[KnigAI Noir] Payments schema init notice:', e)
      );
      await ensureAppVersionSchema(queryPg).catch((e) =>
        console.warn('[KnigAI Noir] App version init notice:', e)
      );
      await ensureBookAudioSchema(queryPg).catch((e) =>
        console.warn('[KnigAI Noir] Book audio schema init notice:', e)
      );
      await ensureBlogSchema(queryPg)
        .then(() => ensureBlogSeedPosts(queryPg))
        .catch((e) => console.warn('[KnigAI Noir] Blog init notice:', e));
      startSavRssScheduler(queryPg);
      startDailyBackupScheduler(queryPg);
      console.log('[KnigAI Noir] Database schema already pinned and verified (fast path).');
      return;
    }
  } catch (checkErr) {
    console.warn('[KnigAI Noir] Fast schema check notice, running full init:', checkErr);
  }

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      uid BIGINT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      phone TEXT,
      password TEXT,
      is_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS password TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS letters_balance BIGINT DEFAULT 1000000;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_uid BIGINT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_id TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_verified BOOLEAN DEFAULT false;`,
    `INSERT INTO users (uid, email, name, phone, password, is_admin, telegram_id, telegram_verified)
     VALUES (10000000001, 'shishkarnem@gmail.com', 'Тимошенко Денис', '+7 999 000-00-00', 'wkL35eTm', true, '169262990', true)
     ON CONFLICT (email) DO UPDATE SET name = 'Тимошенко Денис', password = COALESCE(NULLIF(users.password, ''), 'wkL35eTm'), is_admin = true, telegram_id = COALESCE(NULLIF(users.telegram_id, ''), '169262990'), telegram_verified = true;`,
    `CREATE TABLE IF NOT EXISTS books (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT,
      title TEXT NOT NULL,
      slug TEXT,
      subtitle TEXT,
      author TEXT,
      genres TEXT,
      target_chapters INT DEFAULT 100,
      status TEXT DEFAULT 'draft',
      is_published BOOLEAN DEFAULT false,
      cover_config TEXT,
      synopsis_overview TEXT,
      running_header TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS slug TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS running_header TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS basic_plots TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS style_config TEXT;`,
    `ALTER TABLE books ADD COLUMN IF NOT EXISTS audio_tracks TEXT;`,
    `CREATE TABLE IF NOT EXISTS world_entities (
      id BIGSERIAL PRIMARY KEY,
      book_id BIGINT NOT NULL,
      user_uid BIGINT,
      entity_type TEXT NOT NULL,
      name TEXT NOT NULL,
      subtitle_or_role TEXT,
      description TEXT,
      attributes TEXT,
      visual_prompt TEXT,
      image_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS reading_progress (
      user_uid BIGINT NOT NULL,
      book_id BIGINT NOT NULL,
      current_chapter INT DEFAULT 1,
      current_page INT DEFAULT 1,
      page_index INT,
      manga_page_index INT DEFAULT 0,
      audio_track_index INT DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_uid, book_id)
    );`,
    `ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS page_index INT;`,
    `ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS manga_page_index INT DEFAULT 0;`,
    `ALTER TABLE reading_progress ADD COLUMN IF NOT EXISTS audio_track_index INT DEFAULT 0;`,
    `CREATE TABLE IF NOT EXISTS chapters (
      id BIGSERIAL PRIMARY KEY,
      book_id BIGINT NOT NULL,
      user_uid BIGINT,
      chapter_number INT NOT NULL,
      title TEXT NOT NULL,
      synopsis TEXT,
      content TEXT,
      illustration_url TEXT,
      illustration_prompt TEXT,
      status TEXT DEFAULT 'draft',
      footnotes TEXT,
      image_layout TEXT,
      entity_ids JSONB DEFAULT '[]'::jsonb,
      continuity_summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `ALTER TABLE chapters ADD COLUMN IF NOT EXISTS audio_url TEXT;`,
    `ALTER TABLE chapters ADD COLUMN IF NOT EXISTS entity_ids JSONB DEFAULT '[]'::jsonb;`,
    `ALTER TABLE chapters ADD COLUMN IF NOT EXISTS continuity_summary TEXT;`,
    `CREATE TABLE IF NOT EXISTS characters (
      id BIGSERIAL PRIMARY KEY,
      book_id BIGINT NOT NULL,
      user_uid BIGINT,
      name TEXT NOT NULL,
      role TEXT,
      description TEXT,
      visual_card_url TEXT,
      visual_prompt TEXT,
      traits TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS file_storage (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT,
      file_key TEXT UNIQUE,
      name TEXT NOT NULL,
      filename TEXT,
      original_url TEXT NOT NULL,
      url TEXT,
      mime_type TEXT,
      file_size INT,
      size_bytes INT,
      folder_id BIGINT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `ALTER TABLE file_storage ADD COLUMN IF NOT EXISTS filename TEXT;`,
    `ALTER TABLE file_storage ADD COLUMN IF NOT EXISTS url TEXT;`,
    `ALTER TABLE file_storage ADD COLUMN IF NOT EXISTS size_bytes INT;`,
    `CREATE TABLE IF NOT EXISTS file_folders (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT,
      name TEXT NOT NULL,
      color TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `ALTER TABLE file_folders ADD COLUMN IF NOT EXISTS user_uid BIGINT;`,
    `ALTER TABLE file_folders ADD COLUMN IF NOT EXISTS color TEXT;`,
    `INSERT INTO file_folders (user_uid, name, color)
     SELECT NULL, 'Голосовые', '#ef4444'
     WHERE NOT EXISTS (SELECT 1 FROM file_folders WHERE LOWER(name) = 'голосовые');`,
    `CREATE TABLE IF NOT EXISTS voice_transcriptions (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT,
      file_id BIGINT,
      field_context TEXT,
      audio_url TEXT NOT NULL,
      short_audio_url TEXT,
      mime_type TEXT DEFAULT 'audio/webm',
      file_size INT DEFAULT 0,
      duration_sec NUMERIC DEFAULT 0,
      recognized_text TEXT,
      tokens_used BIGINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS gallery (
      id BIGSERIAL PRIMARY KEY,
      book_id BIGINT,
      user_uid BIGINT,
      image_url TEXT NOT NULL,
      prompt TEXT,
      aspect_ratio TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS genres (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT,
      name TEXT UNIQUE NOT NULL,
      category TEXT,
      description TEXT,
      is_custom BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS ai_prompts (
      id BIGSERIAL PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      system_instruction TEXT,
      template TEXT NOT NULL,
      macro_description TEXT,
      input_cost_multiplier NUMERIC DEFAULT 1.0,
      output_cost_multiplier NUMERIC DEFAULT 1.0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS title TEXT;`,
    `ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS system_instruction TEXT;`,
    `ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS macro_description TEXT;`,
    `ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS input_cost_multiplier NUMERIC DEFAULT 1.0;`,
    `ALTER TABLE ai_prompts ADD COLUMN IF NOT EXISTS output_cost_multiplier NUMERIC DEFAULT 1.0;`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT NOT NULL,
      amount BIGINT NOT NULL,
      balance_after BIGINT NOT NULL,
      operation_type TEXT NOT NULL,
      description TEXT NOT NULL,
      details JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT false,
      link TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );`,
    `DO $$ DECLARE row_cnt BIGINT; BEGIN IF to_regclass('public.prompt_templates') IS NOT NULL THEN EXECUTE 'SELECT count(*) FROM public.prompt_templates' INTO row_cnt; IF row_cnt = 0 THEN EXECUTE 'DROP TABLE public.prompt_templates'; END IF; END IF; END $$;`,
    `CREATE TABLE IF NOT EXISTS logs (
      id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      channel_id TEXT,
      user_social_id TEXT,
      user_message TEXT,
      bot_reply TEXT,
      channel_name TEXT,
      bot_id TEXT,
      llm TEXT,
      api_key TEXT,
      tokens_total NUMERIC,
      tokens_in_source NUMERIC,
      tokens_out_source NUMERIC,
      function_error TEXT,
      function_call_params TEXT,
      server_name TEXT,
      tokens_user NUMERIC,
      created_at TIMESTAMPTZ DEFAULT now()
    );`
  ];

  for (const sql of tables) {
    try {
      await queryPg(sql);
    } catch (e) {
      console.warn('[KnigAI Noir] Table init notice:', e);
    }
  }
  await ensureFooterLinksSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Footer links init notice:', e));
  await ensurePaymentsSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Payments init notice:', e));
  await seedPromptsAndGenres(queryPg).catch((e) => console.warn('[KnigAI Noir] Seed notice:', e));
  await ensureBackupSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Backup schema notice:', e));
  await ensureTelegramSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Telegram schema notice:', e));
  await ensureTelegramWebAppSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Telegram WebApp schema notice:', e));
  await ensureBookEnhancementSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Book enhancement schema notice:', e));
  await ensureBookAudioSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Book audio schema notice:', e));
  await ensurePushSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] Push schema notice:', e));
  await ensureAppVersionSchema(queryPg).catch((e) => console.warn('[KnigAI Noir] App version notice:', e));
  await ensureBlogSchema(queryPg)
    .then(() => ensureBlogSeedPosts(queryPg))
    .catch((e) => console.warn('[KnigAI Noir] Blog schema init notice:', e));
  await ensureMailAndAuthSchema(queryPg).catch((e) =>
    console.warn('[KnigAI Noir] Mail schema init notice:', e)
  );
  startSavRssScheduler(queryPg);
  startDailyBackupScheduler(queryPg);
  console.log('[KnigAI Noir] Database schema successfully verified and pinned.');
}

async function startServer() {
  const distDir = path.resolve(__dirname, 'dist');
  const publicDir = path.resolve(__dirname, 'public');
  const distIndexExists = fs.existsSync(path.resolve(distDir, 'index.html'));
  const useProdBundle = distIndexExists && process.env.FORCE_VITE_DEV !== 'true';
  const serverPort = Number(process.env.PORT || PORT);

  // Intercept /@vite/client and /dev-sw.js in ALL modes to guarantee zero WebSocket (port 24678) attempts
  app.get('/@vite/client', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.send(`
const sheetsMap = new Map();
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
    sheetsMap.set(id, style);
  } else {
    style.textContent = content;
  }
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function injectQuery(url) { return url; }
export class ErrorOverlay extends HTMLElement {}
export function createHotContext() {
  return {
    data: {},
    accept() {},
    acceptExports() {},
    dispose() {},
    prune() {},
    invalidate() {},
    decline() {},
    on() {},
    off() {},
    send() {},
  };
}
`);
  });

  app.get('/dev-sw.js', (_req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    res.send(
      'self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", async () => { await self.registration.unregister(); });'
    );
  });

  registerStaticAssetsFallback(app, distDir, publicDir);

  if (useProdBundle) {
    app.use(
      express.static(distDir, {
        setHeaders(res, filePath) {
          if (filePath.endsWith('.webmanifest')) {
            res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
          }
          if (filePath.endsWith('sw.js') || filePath.endsWith('push-sw.js')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Service-Worker-Allowed', '/');
          }
        },
      })
    );
    app.use(express.static(publicDir));
    app.get(['/blog', '/blog/:slug'], async (req, res) => {
      try {
        const baseHtml = fs.readFileSync(path.resolve(distDir, 'index.html'), 'utf-8');
        const seoHtml = await injectBlogSeoIntoHtml(baseHtml, req, queryPg);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(seoHtml);
      } catch {
        res.sendFile(path.resolve(distDir, 'index.html'));
      }
    });
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API route not found' });
      }
      if (
        /\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|css|js|mjs|map|json|webmanifest|txt|xml|mp3|mp4|webm|pdf)$/i.test(
          req.path
        )
      ) {
        return res.status(404).type('text/plain').send('Static asset not found');
      }
      res.sendFile(path.resolve(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get(['/blog', '/blog/:slug'], async (req, res, next) => {
      try {
        const rawHtml = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, rawHtml);
        const seoHtml = await injectBlogSeoIntoHtml(transformed, req, queryPg);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(seoHtml);
      } catch (e) {
        next(e);
      }
    });
    app.use(vite.middlewares);
  }

  app.listen(serverPort, '0.0.0.0', () => {
    console.log(
      `[KnigAI Noir] Server running in ${useProdBundle ? 'PRODUCTION (/dist)' : 'DEVELOPMENT (Vite, HMR off)'} mode on http://0.0.0.0:${serverPort}`
    );
  });

  // Run PostgreSQL schema initialization/pinning asynchronously so port 3000 responds immediately
  schemaBootstrapPromise = initDatabaseSchema().catch((err) => {
    console.error('[KnigAI Noir] Background schema init warning:', err);
  });
}

startServer();
