import type { Express, Request, Response } from 'express';
import type multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  BackupFormat,
  BackupHistoryRecord,
  BackupSettings,
  DEFAULT_SCHEDULE_HOUR_MSK,
  DEFAULT_SCHEDULE_MINUTE_MSK,
  DEFAULT_TELEGRAM_BOT_TOKEN,
  DEFAULT_TELEGRAM_CHAT_ID,
  QueryPgFn,
  RestoreMode,
  formatMskDateTime,
} from './backupTypes';
import {
  generateAllFormatsArtifacts,
  generateDatabaseBackup,
  introspectDatabaseSchema,
} from './backupGenerator';
import { inspectBackupBuffer, restoreFromBackupBuffer } from './backupRestore';
import {
  buildTelegramBackupCaption,
  downloadTelegramFileById,
  sendBackupDocumentToTelegram,
  verifyTelegramBot,
} from './telegramBackupSender';
import {
  isMaskedToken,
  maskBotToken,
  saveTelegramBotConfig,
} from '../telegram/telegramService';
import { getAppVersion } from '../db/appVersionService';

const CACHE_DIR = '/tmp/knigai-backups';
let schedulerStarted = false;
let schedulerRunningNow = false;

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCacheFilePath(id: number, filename: string): string {
  const safeName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
  return path.join(CACHE_DIR, `${id}_${safeName}`);
}

export async function ensureBackupSchema(queryPg: QueryPgFn): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS backup_settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      enabled BOOLEAN DEFAULT true,
      telegram_chat_id TEXT NOT NULL,
      telegram_bot_token TEXT NOT NULL,
      schedule_hour_msk INTEGER DEFAULT 6,
      schedule_minute_msk INTEGER DEFAULT 0,
      default_format TEXT DEFAULT 'all',
      include_zip BOOLEAN DEFAULT true,
      last_auto_run_msk_date TEXT,
      updated_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS backup_history (
      id BIGSERIAL PRIMARY KEY,
      reason TEXT NOT NULL,
      format TEXT NOT NULL,
      is_zip BOOLEAN DEFAULT false,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      total_tables INTEGER DEFAULT 0,
      non_empty_tables INTEGER DEFAULT 0,
      total_rows INTEGER DEFAULT 0,
      raw_size_bytes BIGINT DEFAULT 0,
      zip_size_bytes BIGINT,
      created_at_msk TEXT NOT NULL,
      telegram_sent BOOLEAN DEFAULT false,
      telegram_chat_id TEXT,
      telegram_message_id BIGINT,
      telegram_file_id TEXT,
      telegram_caption TEXT,
      status TEXT DEFAULT 'completed',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
  ];

  for (const sql of statements) {
    await queryPg(sql);
  }

  await queryPg(
    `INSERT INTO backup_settings (
      id, enabled, telegram_chat_id, telegram_bot_token,
      schedule_hour_msk, schedule_minute_msk, default_format, include_zip
    )
    SELECT 1, true, $1, $2, $3, $4, 'all', true
    WHERE NOT EXISTS (SELECT 1 FROM backup_settings WHERE id = 1);`,
    [
      DEFAULT_TELEGRAM_CHAT_ID,
      DEFAULT_TELEGRAM_BOT_TOKEN,
      DEFAULT_SCHEDULE_HOUR_MSK,
      DEFAULT_SCHEDULE_MINUTE_MSK,
    ]
  );
}

async function getBackupSettings(queryPg: QueryPgFn): Promise<BackupSettings> {
  await ensureBackupSchema(queryPg);
  const res = await queryPg<BackupSettings>('SELECT * FROM backup_settings WHERE id = 1 LIMIT 1;');
  return res.rows[0];
}

function computeNextRunMsk(settings: BackupSettings): string {
  const now = new Date();
  const mskNow = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');

  const todayTargetUtcMs = Date.UTC(
    mskNow.getUTCFullYear(),
    mskNow.getUTCMonth(),
    mskNow.getUTCDate(),
    settings.schedule_hour_msk,
    settings.schedule_minute_msk,
    0
  );

  let target = new Date(todayTargetUtcMs);
  if (mskNow.getTime() >= todayTargetUtcMs) {
    target = new Date(todayTargetUtcMs + 24 * 60 * 60 * 1000);
  }

  const y = target.getUTCFullYear();
  const m = pad(target.getUTCMonth() + 1);
  const d = pad(target.getUTCDate());
  const hh = pad(target.getUTCHours());
  const mm = pad(target.getUTCMinutes());
  return `${y}-${m}-${d} ${hh}:${mm}:00 MSK`;
}

export async function runAndRecordBackup(params: {
  queryPg: QueryPgFn;
  format: BackupFormat;
  includeZip: boolean;
  reason: string;
  sendToTelegram: boolean;
}): Promise<{
  record: BackupHistoryRecord;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  caption: string;
}> {
  const settings = await getBackupSettings(params.queryPg);
  const artifact = await generateDatabaseBackup({
    queryPg: params.queryPg,
    format: params.format,
    includeZip: params.includeZip,
    reason: params.reason,
  });

  const caption = buildTelegramBackupCaption(artifact.stats);
  let telegramSent = false;
  let telegramMessageId: number | null = null;
  let telegramFileId: string | null = null;
  let status: 'completed' | 'failed' = 'completed';
  let errorMessage: string | null = null;

  if (params.sendToTelegram) {
    try {
      const tgRes = await sendBackupDocumentToTelegram({
        botToken: settings.telegram_bot_token,
        chatId: settings.telegram_chat_id,
        buffer: artifact.buffer,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        caption,
        queryPg: params.queryPg,
      });
      telegramSent = tgRes.ok;
      telegramMessageId = tgRes.messageId;
      telegramFileId = tgRes.fileId;
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }
  }

  const inserted = await params.queryPg<BackupHistoryRecord>(
    `INSERT INTO backup_history (
      reason, format, is_zip, filename, mime_type,
      total_tables, non_empty_tables, total_rows,
      raw_size_bytes, zip_size_bytes, created_at_msk,
      telegram_sent, telegram_chat_id, telegram_message_id,
      telegram_file_id, telegram_caption, status, error_message
    ) VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8,
      $9, $10, $11,
      $12, $13, $14,
      $15, $16, $17, $18
    ) RETURNING *;`,
    [
      params.reason,
      artifact.format,
      artifact.isZip,
      artifact.filename,
      artifact.mimeType,
      artifact.stats.totalTables,
      artifact.stats.nonEmptyTables,
      artifact.stats.totalRows,
      artifact.stats.rawSizeBytes,
      artifact.stats.zipSizeBytes,
      artifact.stats.createdAtMsk,
      telegramSent,
      settings.telegram_chat_id,
      telegramMessageId,
      telegramFileId,
      caption,
      status,
      errorMessage,
    ]
  );

  const record = inserted.rows[0];
  try {
    ensureCacheDir();
    fs.writeFileSync(getCacheFilePath(record.id, record.filename), artifact.buffer);
  } catch (e) {
    console.warn('[KnigAI Backup] Cache write notice:', e);
  }

  return {
    record,
    buffer: artifact.buffer,
    filename: artifact.filename,
    mimeType: artifact.mimeType,
    caption,
  };
}

export async function startAsyncBackupJob(params: {
  queryPg: QueryPgFn;
  format: BackupFormat;
  includeZip: boolean;
  reason: string;
  sendToTelegram: boolean;
}): Promise<BackupHistoryRecord> {
  const settings = await getBackupSettings(params.queryPg);
  const { fullMsk, compactStamp } = formatMskDateTime(new Date());
  const placeholderExt = params.format === 'all' ? 'zip' : `${params.format}${params.includeZip ? '.zip' : ''}`;
  const placeholderName = `kniga_${compactStamp}.${placeholderExt}`;

  const ins = await params.queryPg<BackupHistoryRecord>(
    `INSERT INTO backup_history (
      reason, format, is_zip, filename, mime_type,
      created_at_msk, telegram_chat_id, status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'running') RETURNING *;`,
    [
      params.reason,
      params.format,
      params.format === 'all' ? true : params.includeZip,
      placeholderName,
      'application/octet-stream',
      fullMsk,
      settings.telegram_chat_id,
    ]
  );

  const jobRow = ins.rows[0];

  (async () => {
    try {
      const artifact = await generateDatabaseBackup({
        queryPg: params.queryPg,
        format: params.format,
        includeZip: params.includeZip,
        reason: params.reason,
      });

      const caption = buildTelegramBackupCaption(artifact.stats);
      let telegramSent = false;
      let telegramMessageId: number | null = null;
      let telegramFileId: string | null = null;
      let status: 'completed' | 'failed' = 'completed';
      let errorMessage: string | null = null;

      if (params.sendToTelegram) {
        try {
          const tgRes = await sendBackupDocumentToTelegram({
            botToken: settings.telegram_bot_token,
            chatId: settings.telegram_chat_id,
            buffer: artifact.buffer,
            filename: artifact.filename,
            mimeType: artifact.mimeType,
            caption,
            queryPg: params.queryPg,
          });
          telegramSent = tgRes.ok;
          telegramMessageId = tgRes.messageId;
          telegramFileId = tgRes.fileId;
        } catch (err) {
          status = 'failed';
          errorMessage = err instanceof Error ? err.message : String(err);
        }
      }

      await params.queryPg(
        `UPDATE backup_history
         SET filename = $1,
             mime_type = $2,
             total_tables = $3,
             non_empty_tables = $4,
             total_rows = $5,
             raw_size_bytes = $6,
             zip_size_bytes = $7,
             created_at_msk = $8,
             telegram_sent = $9,
             telegram_message_id = $10,
             telegram_file_id = $11,
             telegram_caption = $12,
             status = $13,
             error_message = $14
         WHERE id = $15;`,
        [
          artifact.filename,
          artifact.mimeType,
          artifact.stats.totalTables,
          artifact.stats.nonEmptyTables,
          artifact.stats.totalRows,
          artifact.stats.rawSizeBytes,
          artifact.stats.zipSizeBytes,
          artifact.stats.createdAtMsk,
          telegramSent,
          telegramMessageId,
          telegramFileId,
          caption,
          status,
          errorMessage,
          jobRow.id,
        ]
      );

      ensureCacheDir();
      fs.writeFileSync(getCacheFilePath(jobRow.id, artifact.filename), artifact.buffer);
    } catch (err) {
      await params.queryPg(
        `UPDATE backup_history SET status = 'failed', error_message = $1 WHERE id = $2;`,
        [err instanceof Error ? err.message : String(err), jobRow.id]
      ).catch(() => undefined);
    }
  })();

  return jobRow;
}

export async function runAllFormatsOnceAndRecord(params: {
  queryPg: QueryPgFn;
  includeZip: boolean;
  reason: string;
}): Promise<BackupHistoryRecord[]> {
  const settings = await getBackupSettings(params.queryPg);
  const artifacts = await generateAllFormatsArtifacts({
    queryPg: params.queryPg,
    includeZip: params.includeZip,
    reason: params.reason,
  });

  const records: BackupHistoryRecord[] = [];
  for (const artifact of artifacts) {
    const caption = buildTelegramBackupCaption(artifact.stats);
    let telegramSent = false;
    let telegramMessageId: number | null = null;
    let telegramFileId: string | null = null;
    let status: 'completed' | 'failed' = 'completed';
    let errorMessage: string | null = null;

    try {
      const tgRes = await sendBackupDocumentToTelegram({
        botToken: settings.telegram_bot_token,
        chatId: settings.telegram_chat_id,
        buffer: artifact.buffer,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        caption,
        queryPg: params.queryPg,
      });
      telegramSent = tgRes.ok;
      telegramMessageId = tgRes.messageId;
      telegramFileId = tgRes.fileId;
    } catch (err) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
    }

    const ins = await params.queryPg<BackupHistoryRecord>(
      `INSERT INTO backup_history (
        reason, format, is_zip, filename, mime_type,
        total_tables, non_empty_tables, total_rows,
        raw_size_bytes, zip_size_bytes, created_at_msk,
        telegram_sent, telegram_chat_id, telegram_message_id,
        telegram_file_id, telegram_caption, status, error_message
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18
      ) RETURNING *;`,
      [
        params.reason,
        artifact.format,
        artifact.isZip,
        artifact.filename,
        artifact.mimeType,
        artifact.stats.totalTables,
        artifact.stats.nonEmptyTables,
        artifact.stats.totalRows,
        artifact.stats.rawSizeBytes,
        artifact.stats.zipSizeBytes,
        artifact.stats.createdAtMsk,
        telegramSent,
        settings.telegram_chat_id,
        telegramMessageId,
        telegramFileId,
        caption,
        status,
        errorMessage,
      ]
    );
    const rec = ins.rows[0];
    try {
      ensureCacheDir();
      fs.writeFileSync(getCacheFilePath(rec.id, rec.filename), artifact.buffer);
    } catch {
      // ignore disk cache notice
    }
    records.push(rec);
  }
  return records;
}

async function resolveBackupBufferByIdOrTelegram(params: {
  queryPg: QueryPgFn;
  backupId?: number;
  telegramFileId?: string;
}): Promise<{ buffer: Buffer; filename: string }> {
  const settings = await getBackupSettings(params.queryPg);

  if (params.backupId) {
    const res = await params.queryPg<BackupHistoryRecord>(
      'SELECT * FROM backup_history WHERE id = $1 LIMIT 1;',
      [params.backupId]
    );
    const rec = res.rows[0];
    if (!rec) {
      throw new Error(`Запись бэкапа #${params.backupId} не найдена`);
    }

    const cachePath = getCacheFilePath(rec.id, rec.filename);
    if (fs.existsSync(cachePath)) {
      return { buffer: fs.readFileSync(cachePath), filename: rec.filename };
    }

    if (rec.telegram_file_id) {
      const downloaded = await downloadTelegramFileById({
        botToken: settings.telegram_bot_token,
        fileId: rec.telegram_file_id,
        queryPg: params.queryPg,
      });
      ensureCacheDir();
      fs.writeFileSync(cachePath, downloaded.buffer);
      return { buffer: downloaded.buffer, filename: rec.filename };
    }

    throw new Error('Локальный кэш файла отсутствует и у этой записи нет Telegram file_id');
  }

  if (params.telegramFileId) {
    const downloaded = await downloadTelegramFileById({
      botToken: settings.telegram_bot_token,
      fileId: params.telegramFileId,
      queryPg: params.queryPg,
    });
    const fallbackName = path.basename(downloaded.filePath || 'telegram_backup.zip');
    return { buffer: downloaded.buffer, filename: fallbackName };
  }

  throw new Error('Не передан файл, ID бэкапа или Telegram file_id');
}

export function startDailyBackupScheduler(queryPg: QueryPgFn): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  const tick = async () => {
    if (schedulerRunningNow) return;
    schedulerRunningNow = true;
    try {
      const settings = await getBackupSettings(queryPg);
      if (!settings.enabled) return;

      const now = new Date();
      const msk = new Date(now.getTime() + 3 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const todayMsk = `${msk.getUTCFullYear()}-${pad(msk.getUTCMonth() + 1)}-${pad(msk.getUTCDate())}`;
      const mskHour = msk.getUTCHours();
      const mskMinute = msk.getUTCMinutes();

      if (settings.last_auto_run_msk_date === todayMsk) {
        return;
      }

      const targetTotalMin = settings.schedule_hour_msk * 60 + settings.schedule_minute_msk;
      const currentTotalMin = mskHour * 60 + mskMinute;

      // Trigger within a 10-minute window starting at configured MSK time (e.g. 06:00-06:09 MSK)
      if (currentTotalMin >= targetTotalMin && currentTotalMin < targetTotalMin + 10) {
        await queryPg(
          'UPDATE backup_settings SET last_auto_run_msk_date = $1, updated_at = now() WHERE id = 1;',
          [todayMsk]
        );

        const padTime = `${pad(settings.schedule_hour_msk)}:${pad(settings.schedule_minute_msk)}`;
        console.log(`[KnigAI Backup Scheduler] Starting daily auto-backup at ${padTime} MSK (${todayMsk})`);

        await runAndRecordBackup({
          queryPg,
          format: settings.default_format || 'all',
          includeZip: Boolean(settings.include_zip),
          reason: `Ежедневный автобэкап в ${padTime} МСК`,
          sendToTelegram: true,
        });
      }
    } catch (err) {
      console.error('[KnigAI Backup Scheduler] Tick error:', err);
    } finally {
      schedulerRunningNow = false;
    }
  };

  // Run check every 30 seconds
  setInterval(tick, 30 * 1000);
  setTimeout(tick, 5000);
}

export function registerBackupRoutes(
  app: Express,
  upload: multer.Multer,
  queryPg: QueryPgFn
): void {
  // 1. Status, settings, DB stats & history
  app.get('/api/admin/backups/status', async (_req: Request, res: Response) => {
    try {
      const settings = await getBackupSettings(queryPg);
      const schemas = await introspectDatabaseSchema(queryPg);
      const historyRes = await queryPg<BackupHistoryRecord>(
        'SELECT * FROM backup_history ORDER BY id DESC LIMIT 40;'
      );

      const nonEmptyTables = schemas.filter((s) => s.rowCount > 0).length;
      const totalRows = schemas.reduce((sum, s) => sum + s.rowCount, 0);

      res.json({
        success: true,
        platformVersion: await getAppVersion(queryPg),
        settings: {
          ...settings,
          telegram_bot_token: maskBotToken(settings.telegram_bot_token),
        },
        currentMsk: formatMskDateTime(new Date()).fullMsk,
        nextRunMsk: computeNextRunMsk(settings),
        liveStats: {
          totalTables: schemas.length,
          nonEmptyTables,
          totalRows,
          tables: schemas.map((s) => ({ name: s.name, rowCount: s.rowCount })),
        },
        history: historyRes.rows,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2. Update backup & Telegram settings
  app.put('/api/admin/backups/config', async (req: Request, res: Response) => {
    try {
      const current = await getBackupSettings(queryPg);
      const enabled =
        typeof req.body.enabled === 'boolean' ? req.body.enabled : current.enabled;
      const telegram_chat_id = String(
        req.body.telegram_chat_id ?? current.telegram_chat_id
      ).trim();
      const rawSubmittedToken = String(req.body.telegram_bot_token ?? '').trim();
      const telegram_bot_token = isMaskedToken(rawSubmittedToken)
        ? current.telegram_bot_token
        : rawSubmittedToken;
      const schedule_hour_msk = Math.min(
        23,
        Math.max(0, Number(req.body.schedule_hour_msk ?? current.schedule_hour_msk))
      );
      const schedule_minute_msk = Math.min(
        59,
        Math.max(0, Number(req.body.schedule_minute_msk ?? current.schedule_minute_msk))
      );
      const rawFmt = String(req.body.default_format ?? current.default_format);
      const default_format: BackupFormat = ['dump', 'sql', 'json', 'all'].includes(rawFmt)
        ? (rawFmt as BackupFormat)
        : 'all';
      const include_zip =
        typeof req.body.include_zip === 'boolean'
          ? req.body.include_zip
          : current.include_zip;

      const updated = await queryPg<BackupSettings>(
        `UPDATE backup_settings
         SET enabled = $1,
             telegram_chat_id = $2,
             telegram_bot_token = $3,
             schedule_hour_msk = $4,
             schedule_minute_msk = $5,
             default_format = $6,
             include_zip = $7,
             updated_at = now()
         WHERE id = 1
         RETURNING *;`,
        [
          enabled,
          telegram_chat_id,
          telegram_bot_token,
          schedule_hour_msk,
          schedule_minute_msk,
          default_format,
          include_zip,
        ]
      );

      await saveTelegramBotConfig(queryPg, {
        botToken: telegram_bot_token,
        adminTelegramId: telegram_chat_id,
      }).catch(() => {});

      res.json({
        success: true,
        settings: {
          ...updated.rows[0],
          telegram_bot_token: maskBotToken(updated.rows[0].telegram_bot_token),
        },
        nextRunMsk: computeNextRunMsk(updated.rows[0]),
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 3. Test Telegram bot connectivity
  app.post('/api/admin/backups/test-bot', async (req: Request, res: Response) => {
    try {
      const settings = await getBackupSettings(queryPg);
      const rawReqToken = String(req.body?.botToken || '').trim();
      const token = isMaskedToken(rawReqToken)
        ? settings.telegram_bot_token
        : rawReqToken;
      const info = await verifyTelegramBot(token, queryPg);
      res.json({ success: info.ok, ...info });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4. Create backup manually (supports fast asyncJob mode for UI & sync mode for direct download)
  app.post('/api/admin/backups/create', async (req: Request, res: Response) => {
    try {
      const rawFmt = String(req.body?.format || 'dump');
      const format: BackupFormat = ['dump', 'sql', 'json', 'all'].includes(rawFmt)
        ? (rawFmt as BackupFormat)
        : 'dump';
      const includeZip = req.body?.includeZip !== false && req.body?.includeZip !== 'false';
      const sendToTelegram = Boolean(req.body?.sendToTelegram);
      const downloadDirectly = Boolean(req.body?.downloadDirectly);
      const asyncJob = Boolean(req.body?.asyncJob) && !downloadDirectly;
      const reason = String(
        req.body?.reason ||
          (sendToTelegram
            ? 'Ручной бэкап и отправка в Telegram из админки'
            : 'Ручной бэкап базы данных из админки')
      ).trim();

      if (asyncJob) {
        const jobRecord = await startAsyncBackupJob({
          queryPg,
          format,
          includeZip,
          reason,
          sendToTelegram,
        });
        return res.json({
          success: true,
          pending: true,
          record: jobRecord,
        });
      }

      const result = await runAndRecordBackup({
        queryPg,
        format,
        includeZip,
        reason,
        sendToTelegram,
      });

      if (downloadDirectly) {
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${encodeURIComponent(result.filename)}"`
        );
        res.setHeader('X-Backup-Id', String(result.record.id));
        return res.send(result.buffer);
      }

      res.json({
        success: result.record.status === 'completed',
        record: result.record,
        caption: result.caption,
        downloadUrl: `/api/admin/backups/${result.record.id}/download`,
        error: result.record.error_message || undefined,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4.1 Lightweight single record poll endpoint
  app.get('/api/admin/backups/record/:id', async (req: Request, res: Response) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const recRes = await queryPg<BackupHistoryRecord>(
        'SELECT * FROM backup_history WHERE id = $1 LIMIT 1;',
        [id]
      );
      if (!recRes.rows[0]) {
        return res.status(404).json({ success: false, error: 'Запись не найдена' });
      }
      res.json({
        success: true,
        record: recRes.rows[0],
        downloadUrl: `/api/admin/backups/${recRes.rows[0].id}/download`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Re-send existing backup or send all individual formats cleanly
  app.post('/api/admin/backups/:id/send-telegram', async (req: Request, res: Response) => {
    try {
      const backupId = parseInt(String(req.params.id), 10);
      const settings = await getBackupSettings(queryPg);
      const recRes = await queryPg<BackupHistoryRecord>(
        'SELECT * FROM backup_history WHERE id = $1 LIMIT 1;',
        [backupId]
      );
      const rec = recRes.rows[0];
      if (!rec) {
        return res.status(404).json({ success: false, error: 'Бэкап не найден' });
      }

      const resolved = await resolveBackupBufferByIdOrTelegram({ queryPg, backupId });
      const currentVersion = await getAppVersion(queryPg);
      const caption = rec.telegram_caption
        ? rec.telegram_caption.replace(/🏷 Версия платформы:\s*[^\n]+/, `🏷 Версия платформы: ${currentVersion}`)
        : buildTelegramBackupCaption({
            totalTables: rec.total_tables,
            nonEmptyTables: rec.non_empty_tables,
            totalRows: rec.total_rows,
            rawSizeBytes: Number(rec.raw_size_bytes),
            zipSizeBytes: rec.zip_size_bytes ? Number(rec.zip_size_bytes) : null,
            formatLabel: rec.format,
            createdAtMsk: rec.created_at_msk,
            reason: rec.reason,
            platformVersion: currentVersion,
          });

      const tgRes = await sendBackupDocumentToTelegram({
        botToken: settings.telegram_bot_token,
        chatId: settings.telegram_chat_id,
        buffer: resolved.buffer,
        filename: rec.filename,
        mimeType: rec.mime_type,
        caption,
        queryPg,
      });

      const updated = await queryPg<BackupHistoryRecord>(
        `UPDATE backup_history
         SET telegram_sent = true,
             telegram_chat_id = $1,
             telegram_message_id = $2,
             telegram_file_id = $3,
             status = 'completed',
             error_message = NULL
         WHERE id = $4
         RETURNING *;`,
        [settings.telegram_chat_id, tgRes.messageId, tgRes.fileId, backupId]
      );

      res.json({ success: true, record: updated.rows[0] });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 6. Download backup file
  app.get('/api/admin/backups/:id/download', async (req: Request, res: Response) => {
    try {
      const backupId = parseInt(String(req.params.id), 10);
      const recRes = await queryPg<BackupHistoryRecord>(
        'SELECT * FROM backup_history WHERE id = $1 LIMIT 1;',
        [backupId]
      );
      const rec = recRes.rows[0];
      if (!rec) {
        return res.status(404).send('Backup not found');
      }

      const resolved = await resolveBackupBufferByIdOrTelegram({ queryPg, backupId });
      res.setHeader('Content-Type', rec.mime_type || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(rec.filename)}"`
      );
      res.send(resolved.buffer);
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 7. Inspect backup file (upload OR stored ID OR Telegram file_id) before restore
  app.post('/api/admin/backups/inspect', upload.single('file'), async (req: Request, res: Response) => {
    try {
      let buffer: Buffer;
      let filename: string;

      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname || 'uploaded_backup';
      } else {
        const backupId = req.body?.backupId ? parseInt(String(req.body.backupId), 10) : undefined;
        const telegramFileId = req.body?.telegramFileId
          ? String(req.body.telegramFileId).trim()
          : undefined;
        const resolved = await resolveBackupBufferByIdOrTelegram({
          queryPg,
          backupId,
          telegramFileId,
        });
        buffer = resolved.buffer;
        filename = resolved.filename;
      }

      const info = await inspectBackupBuffer(buffer, filename);
      res.json({ success: true, info });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 8. Execute full or selective database restore
  app.post('/api/admin/backups/restore', upload.single('file'), async (req: Request, res: Response) => {
    try {
      let buffer: Buffer;
      let filename: string;

      if (req.file) {
        buffer = req.file.buffer;
        filename = req.file.originalname || 'uploaded_backup';
      } else {
        const backupId = req.body?.backupId ? parseInt(String(req.body.backupId), 10) : undefined;
        const telegramFileId = req.body?.telegramFileId
          ? String(req.body.telegramFileId).trim()
          : undefined;
        const resolved = await resolveBackupBufferByIdOrTelegram({
          queryPg,
          backupId,
          telegramFileId,
        });
        buffer = resolved.buffer;
        filename = resolved.filename;
      }

      const rawMode = String(req.body?.mode || 'merge');
      const mode: RestoreMode = rawMode === 'replace' ? 'replace' : 'merge';
      const includeSystemTables =
        req.body?.includeSystemTables === true || req.body?.includeSystemTables === 'true';

      let tablesFilter: string[] | undefined;
      if (Array.isArray(req.body?.tablesFilter)) {
        tablesFilter = req.body.tablesFilter.map(String);
      } else if (typeof req.body?.tablesFilter === 'string' && req.body.tablesFilter.trim()) {
        try {
          const parsedArr = JSON.parse(req.body.tablesFilter);
          if (Array.isArray(parsedArr)) tablesFilter = parsedArr.map(String);
        } catch {
          tablesFilter = req.body.tablesFilter.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      const result = await restoreFromBackupBuffer({
        queryPg,
        buffer,
        filename,
        mode,
        includeSystemTables,
        tablesFilter,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({
        success: false,
        errors: [err instanceof Error ? err.message : String(err)],
      });
    }
  });

  // 9. Create & send all individual formats (.dump, .sql, .json) in a single DB pass
  app.post('/api/admin/backups/send-all-formats', async (req: Request, res: Response) => {
    try {
      const includeZip = Boolean(req.body?.includeZip);
      const asyncJob = Boolean(req.body?.asyncJob);
      const reason = String(
        req.body?.reason || 'Ручной мульти-форматный бэкап (.dump + .sql + .json)'
      ).trim();

      if (asyncJob) {
        runAllFormatsOnceAndRecord({ queryPg, includeZip, reason }).catch((err) =>
          console.error('[KnigAI Backup] Async send-all-formats error:', err)
        );
        return res.json({
          success: true,
          pending: true,
          message: 'Запущена генерация и отправка всех форматов (.dump, .sql, .json) в Telegram',
        });
      }

      const records = await runAllFormatsOnceAndRecord({ queryPg, includeZip, reason });
      const allOk = records.every((r) => r.status === 'completed');
      res.json({
        success: allOk,
        records,
        error: allOk
          ? undefined
          : records.find((r) => r.error_message)?.error_message || 'Не все форматы отправлены',
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
