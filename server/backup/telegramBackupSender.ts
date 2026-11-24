import {
  BackupStats,
  PLATFORM_DB_LABEL,
  PLATFORM_VERSION,
  QueryPgFn,
  formatBytesHuman,
} from './backupTypes';
import {
  downloadTelegramFileViaProxy,
  sendTelegramDocument,
  verifyTelegramBotViaProxy,
} from '../telegram/telegramService';

export function buildTelegramBackupCaption(stats: BackupStats): string {
  const zipLine =
    stats.zipSizeBytes && stats.zipSizeBytes > 0
      ? formatBytesHuman(stats.zipSizeBytes)
      : '—';

  const versionLabel = stats.platformVersion || PLATFORM_VERSION;
  return [
    `📦 Резервная копия базы данных "${PLATFORM_DB_LABEL}"`,
    `🏷 Версия платформы: ${versionLabel}`,
    '',
    `🎯 Причина: ${stats.reason}`,
    `⏰ Время (МСК): ${stats.createdAtMsk}`,
    `📊 Таблиц: ${stats.totalTables} (с данными: ${stats.nonEmptyTables})`,
    `📈 Всего записей: ${stats.totalRows}`,
    `📄 Формат: ${stats.formatLabel}`,
    `💾 Исходный размер: ${formatBytesHuman(stats.rawSizeBytes)}`,
    `📦 Размер ZIP-архива: ${zipLine}`,
  ].join('\n');
}

export interface TelegramSendDocumentResponse {
  ok: boolean;
  messageId: number | null;
  fileId: string | null;
  fileUniqueId: string | null;
  fileSize: number | null;
  caption: string;
}

export async function verifyTelegramBot(
  botToken: string,
  queryPg?: QueryPgFn
): Promise<{
  ok: boolean;
  username?: string;
  firstName?: string;
  usedFallback?: boolean;
  error?: string;
}> {
  return verifyTelegramBotViaProxy({ queryPg, botToken });
}

export async function sendBackupDocumentToTelegram(params: {
  botToken: string;
  chatId: string;
  buffer: Buffer;
  filename: string;
  mimeType: string;
  caption: string;
  queryPg?: QueryPgFn;
}): Promise<TelegramSendDocumentResponse> {
  const chatId = String(params.chatId || '').trim();
  if (!chatId) throw new Error('Telegram Chat ID обязателен');

  const res = await sendTelegramDocument({
    queryPg: params.queryPg,
    botToken: params.botToken,
    chatId,
    fileBuffer: params.buffer,
    filename: params.filename,
    mimeType: params.mimeType,
    caption: params.caption,
  });

  if (!res.ok) {
    throw new Error(`Telegram API ошибка: ${res.error || 'Не удалось отправить файл'}`);
  }

  return {
    ok: true,
    messageId: res.messageId,
    fileId: res.fileId,
    fileUniqueId: res.fileUniqueId,
    fileSize: res.fileSize,
    caption: params.caption,
  };
}

export async function downloadTelegramFileById(params: {
  botToken: string;
  fileId: string;
  queryPg?: QueryPgFn;
}): Promise<{ buffer: Buffer; filePath: string }> {
  return downloadTelegramFileViaProxy({
    queryPg: params.queryPg,
    botToken: params.botToken,
    fileId: params.fileId,
  });
}
