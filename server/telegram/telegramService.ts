import {
  DEFAULT_TELEGRAM_BOT_TOKEN,
  DEFAULT_TELEGRAM_CHAT_ID,
  QueryPgFn,
} from '../backup/backupTypes';

export type TelegramProxyType = 'dialog_ai' | 'custom_cloudflare' | 'direct';

export interface TelegramBotConfig {
  botToken: string;
  botUsername: string;
  proxyType: TelegramProxyType;
  apiBaseUrl: string;
  adminTelegramId: string;
}

export const PROXY_PRESETS: Record<'dialog_ai' | 'direct', string> = {
  dialog_ai: 'https://eu1.account.dialog.ai.atiks.org',
  direct: 'https://api.telegram.org',
};

let telegramSchemaReady = false;

export function cleanTelegramBaseUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return PROXY_PRESETS.dialog_ai;
  let u = rawUrl.trim().replace(/\/+$/, '');
  u = u.replace(/\/bot[^/]+.*$/i, '');
  if (!u) return PROXY_PRESETS.dialog_ai;
  if (!/^https?:\/\//i.test(u)) {
    u = `https://${u}`;
  }
  return u;
}

export function maskBotToken(rawToken: string | null | undefined): string {
  const token = String(rawToken || '').trim();
  if (!token) return '';
  if (token.length <= 12) return '••••••••••••';
  return `${token.slice(0, 6)}••••••••${token.slice(-4)}`;
}

export function isMaskedToken(value: string | null | undefined): boolean {
  const v = String(value || '').trim();
  return !v || v.includes('•••') || v.includes('***');
}

export function resolveBaseUrlByPreset(
  proxyType: TelegramProxyType,
  customUrl?: string
): string {
  if (proxyType === 'direct') return PROXY_PRESETS.direct;
  if (proxyType === 'custom_cloudflare') {
    const cleaned = cleanTelegramBaseUrl(customUrl || '');
    return cleaned;
  }
  return PROXY_PRESETS.dialog_ai;
}

export function normalizeBotUsername(raw: string | null | undefined): string {
  const cleaned = String(raw || '').trim().replace(/^https?:\/\/t\.me\//i, '').replace(/^@+/, '');
  return cleaned ? `@${cleaned}` : '';
}

export function buildDefaultConfig(): TelegramBotConfig {
  return {
    botToken: (process.env.TELEGRAM_BOT_TOKEN || DEFAULT_TELEGRAM_BOT_TOKEN).trim(),
    botUsername: process.env.TELEGRAM_BOT_USERNAME
      ? normalizeBotUsername(process.env.TELEGRAM_BOT_USERNAME)
      : '@KnigAiNotifyBot',
    proxyType: 'dialog_ai',
    apiBaseUrl: process.env.TELEGRAM_API_BASE
      ? cleanTelegramBaseUrl(process.env.TELEGRAM_API_BASE)
      : PROXY_PRESETS.dialog_ai,
    adminTelegramId: (process.env.ADMIN_TELEGRAM_ID || DEFAULT_TELEGRAM_CHAT_ID).trim(),
  };
}

export async function ensureTelegramSchema(queryPg: QueryPgFn): Promise<void> {
  if (telegramSchemaReady) return;
  await queryPg(`
    CREATE TABLE IF NOT EXISTS telegram_bot_config (
      id TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  const defaults = buildDefaultConfig();

  // Pull existing token/chat_id from backup_settings if already configured
  try {
    const backupRes = await queryPg<{
      telegram_bot_token?: string;
      telegram_chat_id?: string;
    }>('SELECT telegram_bot_token, telegram_chat_id FROM backup_settings WHERE id = 1 LIMIT 1;');
    const bRow = backupRes.rows[0];
    if (bRow?.telegram_bot_token && !isMaskedToken(bRow.telegram_bot_token)) {
      defaults.botToken = bRow.telegram_bot_token.trim();
    }
    if (bRow?.telegram_chat_id) {
      defaults.adminTelegramId = bRow.telegram_chat_id.trim();
    }
  } catch {
    // backup_settings might not exist yet on very first boot
  }

  await queryPg(
    `INSERT INTO telegram_bot_config (id, config_json, updated_at)
     VALUES ('default', $1, now())
     ON CONFLICT (id) DO NOTHING;`,
    [JSON.stringify(defaults)]
  );

  telegramSchemaReady = true;
}

export async function getTelegramBotConfig(queryPg: QueryPgFn): Promise<TelegramBotConfig> {
  await ensureTelegramSchema(queryPg);
  const defaults = buildDefaultConfig();

  try {
    const res = await queryPg<{ config_json: unknown }>(
      `SELECT config_json FROM telegram_bot_config WHERE id = 'default' LIMIT 1;`
    );
    const raw = res.rows[0]?.config_json;
    if (!raw) return defaults;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const proxyType: TelegramProxyType =
      parsed?.proxyType === 'custom_cloudflare' || parsed?.proxyType === 'direct'
        ? parsed.proxyType
        : 'dialog_ai';
    const merged: TelegramBotConfig = {
      botToken:
        parsed?.botToken && !isMaskedToken(parsed.botToken)
          ? String(parsed.botToken).trim()
          : defaults.botToken,
      botUsername: normalizeBotUsername(parsed?.botUsername) || defaults.botUsername,
      proxyType,
      apiBaseUrl: resolveBaseUrlByPreset(proxyType, parsed?.apiBaseUrl),
      adminTelegramId: String(parsed?.adminTelegramId || defaults.adminTelegramId).trim(),
    };
    return merged;
  } catch {
    return defaults;
  }
}

export async function saveTelegramBotConfig(
  queryPg: QueryPgFn,
  partial: Partial<TelegramBotConfig>
): Promise<TelegramBotConfig> {
  const current = await getTelegramBotConfig(queryPg);
  const nextProxyType: TelegramProxyType =
    partial.proxyType === 'custom_cloudflare' || partial.proxyType === 'direct' || partial.proxyType === 'dialog_ai'
      ? partial.proxyType
      : current.proxyType;

  const finalToken =
    partial.botToken && !isMaskedToken(partial.botToken)
      ? partial.botToken.trim()
      : current.botToken;

  const nextConfig: TelegramBotConfig = {
    botToken: finalToken,
    botUsername:
      partial.botUsername !== undefined && partial.botUsername.trim()
        ? normalizeBotUsername(partial.botUsername)
        : current.botUsername,
    proxyType: nextProxyType,
    apiBaseUrl: resolveBaseUrlByPreset(
      nextProxyType,
      partial.apiBaseUrl !== undefined ? partial.apiBaseUrl : current.apiBaseUrl
    ),
    adminTelegramId:
      partial.adminTelegramId !== undefined && partial.adminTelegramId.trim()
        ? partial.adminTelegramId.trim()
        : current.adminTelegramId,
  };

  await queryPg(
    `INSERT INTO telegram_bot_config (id, config_json, updated_at)
     VALUES ('default', $1, now())
     ON CONFLICT (id) DO UPDATE SET config_json = EXCLUDED.config_json, updated_at = now();`,
    [JSON.stringify(nextConfig)]
  );

  // Keep backup_settings synchronized so 06:00 MSK backups always use the latest bot & admin ID
  try {
    await queryPg(
      `UPDATE backup_settings
       SET telegram_bot_token = $1,
           telegram_chat_id = $2,
           updated_at = now()
       WHERE id = 1;`,
      [nextConfig.botToken, nextConfig.adminTelegramId]
    );
  } catch {
    // ignore if backup_settings hasn't been initialized yet
  }

  return nextConfig;
}

export function formatTelegramErrorForUser(rawError: string, botUsername?: string): string {
  const errLower = (rawError || '').toLowerCase();
  const botRef = botUsername ? `${normalizeBotUsername(botUsername)}` : 'бота KnigAI';

  if (errLower.includes('chat not found') || errLower.includes('user not found')) {
    return `Telegram не нашёл диалог с этим ID. Сначала откройте ${botRef} в Telegram, нажмите «Запустить» (/start) и повторите проверку.`;
  }
  if (errLower.includes('bot was blocked') || errLower.includes('forbidden')) {
    return `Пользователь заблокировал ${botRef}. Разблокируйте бота в Telegram, отправьте /start и повторите проверку.`;
  }
  if (errLower.includes('chat_id is empty') || errLower.includes('bad request: chat_id')) {
    return 'Укажите корректный числовой Telegram ID (например, 169262990).';
  }
  return rawError || 'Не удалось связаться с Telegram API.';
}

export async function verifyTelegramBotViaProxy(params: {
  queryPg?: QueryPgFn;
  botToken?: string;
  apiBaseUrl?: string;
}): Promise<{
  ok: boolean;
  username?: string;
  firstName?: string;
  usedFallback?: boolean;
  error?: string;
}> {
  const stored = params.queryPg ? await getTelegramBotConfig(params.queryPg) : buildDefaultConfig();
  const token =
    params.botToken && !isMaskedToken(params.botToken)
      ? params.botToken.trim()
      : stored.botToken;
  const primaryBase = cleanTelegramBaseUrl(params.apiBaseUrl || stored.apiBaseUrl);

  if (!token) {
    return { ok: false, error: 'Не указан Telegram Bot Token' };
  }

  const callGetMe = async (base: string) => {
    const res = await fetch(`${base}/bot${token}/getMe`, {
      signal: AbortSignal.timeout(12000),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      description?: string;
      result?: { username?: string; first_name?: string };
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.description || `HTTP ${res.status}`);
    }
    return {
      ok: true as const,
      username: data.result?.username,
      firstName: data.result?.first_name,
    };
  };

  try {
    return await callGetMe(primaryBase);
  } catch (primaryErr) {
    if (!primaryBase.includes('api.telegram.org')) {
      try {
        const fb = await callGetMe(PROXY_PRESETS.direct);
        return { ...fb, usedFallback: true };
      } catch (fbErr) {
        return {
          ok: false,
          error: fbErr instanceof Error ? fbErr.message : String(fbErr),
        };
      }
    }
    return {
      ok: false,
      error: primaryErr instanceof Error ? primaryErr.message : String(primaryErr),
    };
  }
}

export async function sendTelegramMessage(options: {
  queryPg?: QueryPgFn;
  chatId: string | number;
  text: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{ ok: boolean; result?: unknown; error?: string; usedFallback?: boolean }> {
  const config = options.queryPg ? await getTelegramBotConfig(options.queryPg) : buildDefaultConfig();
  const token =
    options.botToken && !isMaskedToken(options.botToken)
      ? options.botToken.trim()
      : config.botToken;
  const primaryBase = cleanTelegramBaseUrl(options.apiBaseUrl || config.apiBaseUrl);
  const timeoutMs = options.timeoutMs || 12000;

  if (!token) {
    return { ok: false, error: 'Токен Telegram-бота не настроен' };
  }

  const payload = {
    chat_id: String(options.chatId).trim(),
    text: options.text,
    parse_mode: options.parseMode || 'HTML',
  };

  const postMessage = async (base: string) => {
    const res = await fetch(`${base}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      result?: unknown;
      description?: string;
    };
    if (!res.ok || !data.ok) {
      throw new Error(data.description || `HTTP ${res.status}`);
    }
    return data.result;
  };

  try {
    const result = await postMessage(primaryBase);
    return { ok: true, result };
  } catch (primaryErr) {
    const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
    // Do NOT fallback on explicit Telegram Bad Request / Forbidden (those came through from TG!)
    const isTelegramRejection =
      /chat not found|blocked|forbidden|chat_id|bad request|deactivated/i.test(msg);

    if (!isTelegramRejection && !primaryBase.includes('api.telegram.org')) {
      console.warn(`[Telegram Proxy] Primary failed (${primaryBase}): ${msg}. Retrying direct...`);
      try {
        const resultFb = await postMessage(PROXY_PRESETS.direct);
        return { ok: true, result: resultFb, usedFallback: true };
      } catch (fbErr) {
        return {
          ok: false,
          error: fbErr instanceof Error ? fbErr.message : String(fbErr),
        };
      }
    }
    return { ok: false, error: msg };
  }
}

export async function sendTelegramDocument(options: {
  queryPg?: QueryPgFn;
  chatId: string | number;
  fileBuffer: Buffer | Uint8Array;
  filename: string;
  mimeType?: string;
  caption?: string;
  botToken?: string;
  apiBaseUrl?: string;
  timeoutMs?: number;
}): Promise<{
  ok: boolean;
  messageId: number | null;
  fileId: string | null;
  fileUniqueId: string | null;
  fileSize: number | null;
  usedFallback?: boolean;
  error?: string;
}> {
  const config = options.queryPg ? await getTelegramBotConfig(options.queryPg) : buildDefaultConfig();
  const token =
    options.botToken && !isMaskedToken(options.botToken)
      ? options.botToken.trim()
      : config.botToken;
  const primaryBase = cleanTelegramBaseUrl(options.apiBaseUrl || config.apiBaseUrl);
  const timeoutMs = options.timeoutMs || 60000;

  if (!token) {
    return {
      ok: false,
      messageId: null,
      fileId: null,
      fileUniqueId: null,
      fileSize: null,
      error: 'Токен Telegram-бота не настроен',
    };
  }

  const buildForm = () => {
    const form = new FormData();
    form.append('chat_id', String(options.chatId).trim());
    if (options.caption) {
      form.append('caption', options.caption);
    }
    const bytes =
      options.fileBuffer instanceof Uint8Array
        ? new Uint8Array(options.fileBuffer)
        : new Uint8Array(options.fileBuffer);
    const blob = new Blob([bytes], {
      type: options.mimeType || 'application/octet-stream',
    });
    form.append('document', blob, options.filename);
    return form;
  };

  const postDocument = async (base: string) => {
    const response = await fetch(`${base}/bot${token}/sendDocument`, {
      method: 'POST',
      body: buildForm(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = (await response.json()) as {
      ok?: boolean;
      description?: string;
      result?: {
        message_id?: number;
        document?: {
          file_id?: string;
          file_unique_id?: string;
          file_size?: number;
        };
      };
    };
    if (!response.ok || !data.ok) {
      throw new Error(data.description || `HTTP ${response.status}`);
    }
    return data.result;
  };

  try {
    const result = await postDocument(primaryBase);
    return {
      ok: true,
      messageId: result?.message_id ?? null,
      fileId: result?.document?.file_id ?? null,
      fileUniqueId: result?.document?.file_unique_id ?? null,
      fileSize: result?.document?.file_size ?? null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!primaryBase.includes('api.telegram.org')) {
      console.warn(`[Telegram Proxy] Document upload failed (${primaryBase}): ${msg}. Retrying direct...`);
      try {
        const resultFb = await postDocument(PROXY_PRESETS.direct);
        return {
          ok: true,
          messageId: resultFb?.message_id ?? null,
          fileId: resultFb?.document?.file_id ?? null,
          fileUniqueId: resultFb?.document?.file_unique_id ?? null,
          fileSize: resultFb?.document?.file_size ?? null,
          usedFallback: true,
        };
      } catch (fbErr) {
        return {
          ok: false,
          messageId: null,
          fileId: null,
          fileUniqueId: null,
          fileSize: null,
          error: fbErr instanceof Error ? fbErr.message : String(fbErr),
        };
      }
    }
    return {
      ok: false,
      messageId: null,
      fileId: null,
      fileUniqueId: null,
      fileSize: null,
      error: msg,
    };
  }
}

export async function downloadTelegramFileViaProxy(params: {
  queryPg?: QueryPgFn;
  botToken?: string;
  fileId: string;
  apiBaseUrl?: string;
}): Promise<{ buffer: Buffer; filePath: string }> {
  const config = params.queryPg ? await getTelegramBotConfig(params.queryPg) : buildDefaultConfig();
  const token =
    params.botToken && !isMaskedToken(params.botToken)
      ? params.botToken.trim()
      : config.botToken;
  const primaryBase = cleanTelegramBaseUrl(params.apiBaseUrl || config.apiBaseUrl);
  const fileId = String(params.fileId || '').trim();

  if (!token || !fileId) {
    throw new Error('Требуется Bot Token и Telegram file_id для скачивания файла');
  }

  const doDownload = async (base: string) => {
    const getFileRes = await fetch(
      `${base}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(15000) }
    );
    const getFileData = (await getFileRes.json()) as {
      ok?: boolean;
      description?: string;
      result?: { file_path?: string };
    };
    if (!getFileRes.ok || !getFileData.ok || !getFileData.result?.file_path) {
      throw new Error(getFileData.description || 'Файл недоступен в Telegram');
    }

    const filePath = getFileData.result.file_path;
    const downloadRes = await fetch(`${base}/file/bot${token}/${filePath}`, {
      signal: AbortSignal.timeout(60000),
    });
    if (!downloadRes.ok) {
      throw new Error(`Не удалось скачать файл из Telegram [${downloadRes.status}]`);
    }
    const arrayBuf = await downloadRes.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuf),
      filePath,
    };
  };

  try {
    return await doDownload(primaryBase);
  } catch (err) {
    if (!primaryBase.includes('api.telegram.org')) {
      return await doDownload(PROXY_PRESETS.direct);
    }
    throw err;
  }
}
