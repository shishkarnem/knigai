import crypto from 'crypto';
import { QueryPgFn } from '../backup/backupTypes';
import {
  cleanTelegramBaseUrl,
  getTelegramBotConfig,
  PROXY_PRESETS,
  sendTelegramMessage,
} from './telegramService';
import { mirrorUrlToTelegramStorage } from '../files/telegramStorage';

export const DEFAULT_NOTIFICATION_PREFS = {
  billing: { bell: true, telegram: true, push: true },
  generation: { bell: true, telegram: true, push: true },
  import: { bell: true, telegram: true, push: true },
  remix: { bell: true, telegram: true, push: true },
  bonus: { bell: true, telegram: true, push: true },
  system: { bell: true, telegram: true, push: true },
};

export type NotificationPrefsMap = typeof DEFAULT_NOTIFICATION_PREFS;

export function normalizeNotificationPrefsServer(raw: unknown): NotificationPrefsMap {
  let obj: Record<string, unknown> = {};
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) || {};
    } catch {
      obj = {};
    }
  } else if (raw && typeof raw === 'object') {
    obj = raw as Record<string, unknown>;
  }

  const out: Record<string, { bell: boolean; telegram: boolean; push: boolean }> = {};
  for (const key of Object.keys(DEFAULT_NOTIFICATION_PREFS)) {
    const val = obj[key] as Record<string, unknown> | undefined;
    out[key] = {
      bell: typeof val?.bell === 'boolean' ? val.bell : true,
      telegram: typeof val?.telegram === 'boolean' ? val.telegram : true,
      push: typeof val?.push === 'boolean' ? val.push : true,
    };
  }
  return out as NotificationPrefsMap;
}

/**
 * Расширяет таблицу users в PostgreSQL под поля Telegram Mini App,
 * реферальной системы, настроек уведомлений и привязывает админа (UID 10000000001 <-> 169262990).
 */
export async function ensureTelegramWebAppSchema(queryPg: QueryPgFn): Promise<void> {
  const ddlStatements = [
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_link TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS language_code TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS allows_write_to_pm BOOLEAN DEFAULT false;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign TEXT;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_reward_balance NUMERIC DEFAULT 0;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"billing":{"bell":true,"telegram":true,"push":true},"generation":{"bell":true,"telegram":true,"push":true},"import":{"bell":true,"telegram":true,"push":true},"remix":{"bell":true,"telegram":true,"push":true},"bonus":{"bell":true,"telegram":true,"push":true},"system":{"bell":true,"telegram":true,"push":true}}'::jsonb;`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMPTZ;`,
    `CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);`,
    // Гарантированная привязка администратора (UID 10000000001 <-> Telegram ID 169262990)
    `UPDATE users
     SET telegram_id = COALESCE(NULLIF(telegram_id, ''), '169262990'),
         telegram_verified = true
     WHERE uid = 10000000001 OR LOWER(email) = 'shishkarnem@gmail.com';`,
  ];

  for (const sql of ddlStatements) {
    try {
      await queryPg(sql);
    } catch (err) {
      console.warn('[TWA Schema Notice]:', err instanceof Error ? err.message : String(err));
    }
  }
}

export interface ValidatedTelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
  language_code?: string;
  allows_write_to_pm?: boolean;
}

export interface ValidatedInitDataResult {
  user: ValidatedTelegramUser;
  startParam: string;
  authDate: number;
}

/**
 * Строгая криптографическая HMAC-SHA256 проверка строки Telegram WebApp initData.
 * Категорически отвергает подделанные или поврежденные данные.
 */
export function validateTelegramInitData(
  rawInitData: string,
  botToken: string
): ValidatedInitDataResult {
  if (!rawInitData || typeof rawInitData !== 'string') {
    throw new Error('Invalid initData: строка авторизации отсутствует');
  }
  if (!botToken) {
    throw new Error('Токен Telegram-бота не настроен на сервере');
  }

  const params = new URLSearchParams(rawInitData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) {
    throw new Error('Invalid initData: подпись hash отсутствует или имеет неверный формат');
  }

  // Формируем data_check_string без hash, отсортированную по ключу
  const pairs: Array<[string, string]> = [];
  params.forEach((value, key) => {
    if (key !== 'hash') {
      pairs.push([key, value]);
    }
  });
  pairs.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = pairs.map(([k, v]) => `${k}=${v}`).join('\n');

  // Ключ подписи = HMAC_SHA256("WebAppData", bot_token)
  const secretKey = crypto
    .createHmac('sha256', 'WebAppData')
    .update(botToken)
    .digest();

  const expectedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedHash, 'hex');
  const receivedBuf = Buffer.from(receivedHash.toLowerCase(), 'hex');

  if (expectedBuf.length !== receivedBuf.length || !crypto.timingSafeEqual(expectedBuf, receivedBuf)) {
    throw new Error('Invalid initData');
  }

  const userJson = params.get('user');
  if (!userJson) {
    throw new Error('Invalid initData: объект user отсутствует');
  }

  let parsedUser: ValidatedTelegramUser;
  try {
    parsedUser = JSON.parse(userJson) as ValidatedTelegramUser;
  } catch {
    throw new Error('Invalid initData: некорректный JSON пользователя');
  }

  if (!parsedUser?.id) {
    throw new Error('Invalid initData: отсутствует Telegram ID');
  }

  const authDate = Number(params.get('auth_date') || 0);
  const startParam = String(params.get('start_param') || '').trim();

  return {
    user: parsedUser,
    startParam,
    authDate,
  };
}

/**
 * Генерация и проверка компактного JWT-токена (HS256 на базе Node crypto).
 */
export function getJwtSecret(botToken: string): string {
  return process.env.JWT_SECRET || crypto.createHash('sha256').update(`knigai_jwt_${botToken}`).digest('hex');
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function signJwtToken(payload: Record<string, unknown>, secret: string, ttlSeconds = 60 * 60 * 24 * 30): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(
    JSON.stringify({
      ...payload,
      iat: nowSec,
      exp: nowSec + ttlSeconds,
    })
  );
  const sig = base64UrlEncode(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );
  return `${header}.${body}.${sig}`;
}

export function verifyJwtToken(token: string, secret: string): Record<string, unknown> | null {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expectedSig = base64UrlEncode(
      crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
    );
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const normalized = body.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(normalized, 'base64').toString('utf-8');
    const payload = JSON.parse(json) as { exp?: number };
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Разбор start_param из Telegram Mini App: реферальный ID + UTM-метки.
 * Поддерживает форматы: "169262990", "ref_169262990", "ref_169262990__utm_source-tg__utm_medium-ads".
 */
export function parseStartParam(raw: string): {
  referredBy: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
} {
  const s = String(raw || '').trim();
  if (!s) {
    return { referredBy: null, utmSource: null, utmMedium: null, utmCampaign: null };
  }

  let referredBy: string | null = null;
  let utmSource: string | null = null;
  let utmMedium: string | null = null;
  let utmCampaign: string | null = null;

  if (/^\d{5,20}$/.test(s)) {
    return { referredBy: s, utmSource: null, utmMedium: null, utmCampaign: null };
  }

  // Поддержка URLSearchParams внутри start_param
  if (s.includes('=')) {
    const qs = new URLSearchParams(s.replace(/__/g, '&'));
    const refVal = qs.get('ref') || qs.get('r') || qs.get('referrer');
    if (refVal && /^\d{5,20}$/.test(refVal)) referredBy = refVal;
    utmSource = qs.get('utm_source') || null;
    utmMedium = qs.get('utm_medium') || null;
    utmCampaign = qs.get('utm_campaign') || null;
  } else {
    const parts = s.split('__');
    for (const part of parts) {
      if (/^ref[_-](\d{5,20})$/i.test(part)) {
        referredBy = part.replace(/^ref[_-]/i, '');
      } else if (/^\d{5,20}$/.test(part) && !referredBy) {
        referredBy = part;
      } else if (part.startsWith('utm_source-')) {
        utmSource = part.slice('utm_source-'.length) || null;
      } else if (part.startsWith('utm_medium-')) {
        utmMedium = part.slice('utm_medium-'.length) || null;
      } else if (part.startsWith('utm_campaign-')) {
        utmCampaign = part.slice('utm_campaign-'.length) || null;
      }
    }
  }

  return { referredBy, utmSource, utmMedium, utmCampaign };
}

/**
 * Получает прямую ссылку на фото профиля Telegram через Bot API (если не передано в initData)
 * и переносит картинку в файловое хранилище file.pro-talk.ru + галерею + file_storage.
 */
export async function mirrorTelegramAvatarToGalleryAndStorage(params: {
  queryPg: QueryPgFn;
  userUid: number;
  telegramId: string;
  sourcePhotoUrl?: string;
  displayName?: string;
}): Promise<string | null> {
  const config = await getTelegramBotConfig(params.queryPg);
  const proxyBase = cleanTelegramBaseUrl(config.apiBaseUrl);
  let candidateUrl = String(params.sourcePhotoUrl || '').trim();

  // Если фото уже в нашем file.pro-talk.ru — повторно не качаем
  if (candidateUrl.includes('file.pro-talk.ru')) {
    return candidateUrl;
  }

  // Фолбэк: получаем аватар профиля напрямую через Telegram Bot API (getUserProfilePhotos + getFile)
  if (!candidateUrl && config.botToken) {
    const resolveViaBotApi = async (base: string): Promise<string> => {
      const photosRes = await fetch(
        `${base}/bot${config.botToken}/getUserProfilePhotos?user_id=${encodeURIComponent(params.telegramId)}&limit=1`,
        { signal: AbortSignal.timeout(8000) }
      );
      const photosJson = (await photosRes.json()) as {
        ok?: boolean;
        result?: { photos?: Array<Array<{ file_id?: string }>> };
      };
      const sizes = photosJson?.result?.photos?.[0];
      const bestFileId = sizes && sizes.length > 0 ? sizes[sizes.length - 1]?.file_id : undefined;
      if (!bestFileId) return '';

      const fileRes = await fetch(
        `${base}/bot${config.botToken}/getFile?file_id=${encodeURIComponent(bestFileId)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      const fileJson = (await fileRes.json()) as {
        ok?: boolean;
        result?: { file_path?: string };
      };
      const filePath = fileJson?.result?.file_path;
      return filePath ? `${base}/file/bot${config.botToken}/${filePath}` : '';
    };

    try {
      candidateUrl = await resolveViaBotApi(proxyBase);
    } catch {
      if (!proxyBase.includes('api.telegram.org')) {
        candidateUrl = await resolveViaBotApi(PROXY_PRESETS.direct).catch(() => '');
      }
    }
  }

  if (!candidateUrl) return null;

  try {
    const safeFilename = `tg_avatar_${params.telegramId}_${Date.now()}.jpg`;
    const mirrored = await mirrorUrlToTelegramStorage({
      sourceUrl: candidateUrl,
      filename: safeFilename,
      caption: `👤 Аватар профиля Telegram: ${params.displayName || params.telegramId}`,
    });

    const proTalkUrl = mirrored.url;
    if (!proTalkUrl) return null;

    // 1. Папка «Аватары Telegram» в файловом хранилище
    let folderId: number | null = null;
    try {
      const fRes = await params.queryPg<{ id: number }>(
        `SELECT id FROM file_folders WHERE LOWER(name) = 'аватары telegram' AND (user_uid = $1 OR user_uid IS NULL) LIMIT 1;`,
        [params.userUid]
      );
      if (fRes.rows[0]?.id) {
        folderId = Number(fRes.rows[0].id);
      } else {
        const insFolder = await params.queryPg<{ id: number }>(
          `INSERT INTO file_folders (user_uid, name, color) VALUES ($1, 'Аватары Telegram', '#f43f5e') RETURNING id;`,
          [params.userUid]
        );
        folderId = Number(insFolder.rows[0]?.id || 0) || null;
      }
    } catch {
      folderId = null;
    }

    // 2. Регистрация в file_storage (для прямой ссылки file.pro-talk и прокси)
    const fileKey = `tgava_${params.telegramId}_${Date.now().toString(36)}`;
    try {
      await params.queryPg(
        `INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
         VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7);`,
        [
          params.userUid,
          fileKey,
          safeFilename,
          proTalkUrl,
          mirrored.mimeType || 'image/jpeg',
          mirrored.size || 0,
          folderId,
        ]
      );
    } catch (e) {
      console.warn('[TWA Avatar file_storage notice]:', e);
    }

    // 3. Регистрация в галерее пользователя (gallery)
    try {
      await params.queryPg(
        `INSERT INTO gallery (book_id, user_uid, image_url, prompt, aspect_ratio)
         VALUES (NULL, $1, $2, $3, '1:1');`,
        [params.userUid, proTalkUrl, `Аватар профиля Telegram (@${params.displayName || params.telegramId})`]
      );
    } catch (e) {
      console.warn('[TWA Avatar gallery notice]:', e);
    }

    return proTalkUrl;
  } catch (err) {
    console.warn('[TWA Avatar mirror notice]:', err instanceof Error ? err.message : String(err));
    return candidateUrl;
  }
}

async function generateUnique11DigitUid(queryPg: QueryPgFn): Promise<number> {
  for (let i = 0; i < 6; i++) {
    const candidate = Math.floor(10000000000 + Math.random() * 89999999999);
    const check = await queryPg<{ uid: number }>('SELECT uid FROM users WHERE uid = $1 LIMIT 1;', [candidate]);
    if (!check.rows?.length) return candidate;
  }
  return Number(`1${Date.now().toString().slice(-10)}`);
}

const REFERRAL_BONUS_LETTERS = 100000;
const WELCOME_BONUS_LETTERS = 1000000;

export async function authenticateOrRegisterTelegramUser(params: {
  queryPg: QueryPgFn;
  initData: string;
}): Promise<{
  user: Record<string, unknown>;
  token: string;
  isNewUser: boolean;
}> {
  const config = await getTelegramBotConfig(params.queryPg);
  const validated = validateTelegramInitData(params.initData, config.botToken);
  const tgUser = validated.user;
  const telegramIdStr = String(tgUser.id);
  const fullName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || tgUser.username || `Автор #${telegramIdStr}`;
  const cleanUsername = tgUser.username ? tgUser.username.replace(/^@+/, '').trim() : null;
  const profileLink = cleanUsername ? `https://t.me/${cleanUsername}` : null;

  // Ищем существующий аккаунт по telegram_id
  const existingRes = await params.queryPg<Record<string, unknown>>(
    `SELECT * FROM users WHERE telegram_id = $1 LIMIT 1;`,
    [telegramIdStr]
  );

  let userRow = existingRes.rows[0];
  let isNewUser = false;

  if (userRow) {
    const existingUid = Number(userRow.uid);
    const currentAvatar = String(userRow.avatar_url || '').trim();
    let finalAvatar = currentAvatar;

    // Если аватар ещё не переведён в file.pro-talk.ru (или пуст) — зеркалируем в галерею и хранилище
    if (!currentAvatar || !currentAvatar.includes('file.pro-talk.ru')) {
      const mirrored = await mirrorTelegramAvatarToGalleryAndStorage({
        queryPg: params.queryPg,
        userUid: existingUid,
        telegramId: telegramIdStr,
        sourcePhotoUrl: tgUser.photo_url,
        displayName: cleanUsername || fullName,
      });
      if (mirrored) finalAvatar = mirrored;
    }

    const updatedRes = await params.queryPg<Record<string, unknown>>(
      `UPDATE users
       SET first_name = $1,
           last_name = $2,
           username = $3,
           profile_link = COALESCE($4, profile_link),
           is_premium = $5,
           language_code = COALESCE($6, language_code),
           allows_write_to_pm = $7,
           telegram_verified = true,
           avatar_url = CASE WHEN COALESCE(avatar_url, '') = '' OR avatar_url NOT LIKE '%file.pro-talk.ru%' THEN COALESCE($8, avatar_url) ELSE avatar_url END,
           photo_url = COALESCE($8, photo_url),
           name = COALESCE(NULLIF(name, ''), $9),
           last_login = now()
       WHERE uid = $10
       RETURNING *;`,
      [
        tgUser.first_name || null,
        tgUser.last_name || null,
        cleanUsername,
        profileLink,
        Boolean(tgUser.is_premium),
        tgUser.language_code || null,
        Boolean(tgUser.allows_write_to_pm),
        finalAvatar || null,
        fullName,
        existingUid,
      ]
    );
    userRow = updatedRes.rows[0] || userRow;
  } else {
    isNewUser = true;
    const newUid = await generateUnique11DigitUid(params.queryPg);
    const parsedStart = parseStartParam(validated.startParam);

    // Ищем пригласившего по telegram_id ИЛИ uid (защита от самореферала)
    let referrerRow: { uid: number; telegram_id?: string | null; notification_prefs?: unknown } | null = null;
    if (parsedStart.referredBy && parsedStart.referredBy !== telegramIdStr && parsedStart.referredBy !== String(newUid)) {
      const refLookup = await params.queryPg<{
        uid: number;
        telegram_id?: string | null;
        notification_prefs?: unknown;
      }>(
        `SELECT uid, telegram_id, notification_prefs FROM users WHERE telegram_id = $1 OR uid::text = $1 LIMIT 1;`,
        [parsedStart.referredBy]
      );
      if (refLookup.rows[0]) {
        referrerRow = refLookup.rows[0];
      }
    }

    // Зеркалируем фото Telegram в нашу галерею + file.pro-talk.ru
    const mirroredAvatar = await mirrorTelegramAvatarToGalleryAndStorage({
      queryPg: params.queryPg,
      userUid: newUid,
      telegramId: telegramIdStr,
      sourcePhotoUrl: tgUser.photo_url,
      displayName: cleanUsername || fullName,
    });

    const deterministicEmail = `tg_${telegramIdStr}@telegram.knigai.local`;

    const insRes = await params.queryPg<Record<string, unknown>>(
      `INSERT INTO users (
        uid, email, name, avatar_url, photo_url, telegram_id, telegram_verified,
        first_name, last_name, username, profile_link, is_premium,
        language_code, allows_write_to_pm, referred_by, referred_by_uid,
        utm_source, utm_medium, utm_campaign, letters_balance,
        referral_reward_balance, notification_prefs, last_login
      ) VALUES (
        $1, $2, $3, $4, $4, $5, true,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16, $17, $18,
        0, $19::jsonb, now()
      ) RETURNING *;`,
      [
        newUid,
        deterministicEmail,
        fullName,
        mirroredAvatar || null,
        telegramIdStr,
        tgUser.first_name || null,
        tgUser.last_name || null,
        cleanUsername,
        profileLink,
        Boolean(tgUser.is_premium),
        tgUser.language_code || null,
        Boolean(tgUser.allows_write_to_pm),
        referrerRow?.telegram_id || parsedStart.referredBy || null,
        referrerRow ? Number(referrerRow.uid) : null,
        parsedStart.utmSource,
        parsedStart.utmMedium,
        parsedStart.utmCampaign,
        WELCOME_BONUS_LETTERS,
        JSON.stringify(DEFAULT_NOTIFICATION_PREFS),
      ]
    );
    userRow = insRes.rows[0];

    // Приветственная транзакция и уведомление
    try {
      await params.queryPg(
        `INSERT INTO transactions (user_uid, amount, balance_after, operation_type, description, details)
         VALUES ($1, $2, $2, 'welcome_bonus', 'Стартовый бонус при регистрации через Telegram Mini App', '{"rubles": 150}'::jsonb);`,
        [newUid, WELCOME_BONUS_LETTERS]
      );
      await params.queryPg(
        `INSERT INTO notifications (user_uid, type, title, message, is_read, link)
         VALUES ($1, 'bonus', 'Добро пожаловать в KnigAI!', 'Вы вошли через Telegram Mini App. Начислено 1 000 000 стартовых букв (≈ 150 ₽).', false, 'profile');`,
        [newUid]
      );
    } catch {
      // non-fatal
    }

    // Реферальное вознаграждение пригласившему
    if (referrerRow) {
      const refUid = Number(referrerRow.uid);
      try {
        const refUpd = await params.queryPg<{ letters_balance: number }>(
          `UPDATE users
           SET letters_balance = COALESCE(letters_balance, 0) + $1,
               referral_reward_balance = COALESCE(referral_reward_balance, 0) + $1
           WHERE uid = $2
           RETURNING letters_balance;`,
          [REFERRAL_BONUS_LETTERS, refUid]
        );
        const refNewBal = Number(refUpd.rows[0]?.letters_balance || REFERRAL_BONUS_LETTERS);

        await params.queryPg(
          `INSERT INTO transactions (user_uid, amount, balance_after, operation_type, description, details)
           VALUES ($1, $2, $3, 'referral_bonus', $4, $5::jsonb);`,
          [
            refUid,
            REFERRAL_BONUS_LETTERS,
            refNewBal,
            `Реферальный бонус за регистрацию через Telegram (${cleanUsername ? `@${cleanUsername}` : fullName})`,
            JSON.stringify({ invited_telegram_id: telegramIdStr, rubles: 15 }),
          ]
        );

        const refPrefs = normalizeNotificationPrefsServer(referrerRow.notification_prefs);
        const bonusTitle = `Реферальный бонус +100 000 букв`;
        const bonusMsg = `По вашей ссылке в Telegram Mini App зарегистрировался ${cleanUsername ? `@${cleanUsername}` : fullName}. Начислено +100 000 букв!`;

        if (refPrefs.bonus.bell) {
          await params.queryPg(
            `INSERT INTO notifications (user_uid, type, title, message, is_read, link)
             VALUES ($1, 'bonus', $2, $3, false, 'profile');`,
            [refUid, bonusTitle, bonusMsg]
          );
        }
        if (refPrefs.bonus.telegram && referrerRow.telegram_id) {
          await sendTelegramMessage({
            queryPg: params.queryPg,
            chatId: referrerRow.telegram_id,
            text: `🎁 <b>${bonusTitle}</b>\n\n${bonusMsg}`,
          }).catch(() => {});
        }
      } catch (refErr) {
        console.warn('[TWA Referral reward notice]:', refErr);
      }
    }
  }

  // Формируем безопасный ответ без пароля + подписываем JWT
  const safeUser = { ...userRow };
  delete safeUser.password;
  safeUser.uid = Number(safeUser.uid);
  safeUser.letters_balance = Number(safeUser.letters_balance ?? WELCOME_BONUS_LETTERS);
  safeUser.referral_reward_balance = Number(safeUser.referral_reward_balance ?? 0);
  safeUser.notification_prefs = normalizeNotificationPrefsServer(safeUser.notification_prefs);

  const jwtSecret = getJwtSecret(config.botToken);
  const token = signJwtToken(
    {
      uid: safeUser.uid,
      telegram_id: telegramIdStr,
      is_admin: Boolean(safeUser.is_admin),
    },
    jwtSecret
  );

  return { user: safeUser, token, isNewUser };
}
