import type { Express, Request } from 'express';
import crypto from 'crypto';
import {
  ensureMailAndAuthSchema,
  getActiveMailConfig,
  maskMailSecret,
  QueryPgFn,
} from './mailConfigSchema';
import {
  buildPasswordResetHtmlEmail,
  buildPasswordResetTextFallback,
} from './passwordResetEmailTemplate';
import { sendMailViaDbConfig, verifySmtpConnection } from './smtpMailer';

const ADMIN_EMAIL = 'shishkarnem@gmail.com';
const FALLBACK_ADMIN_PASS = 'wkL35eTm';
const ADMIN_NAME = 'Тимошенко Денис';
const INITIAL_LETTERS_BALANCE = 1000000;
const CODE_TTL_MINUTES = 15;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function timingSafeCompareStrings(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function verifyPasswordCompatible(
  plainPassword: string,
  storedPassword: string
): { valid: boolean; needsRehash: boolean } {
  if (!storedPassword) {
    return { valid: false, needsRehash: false };
  }
  if (storedPassword.startsWith('scrypt$')) {
    const parts = storedPassword.split('$');
    if (parts.length !== 3) return { valid: false, needsRehash: false };
    const [, salt, expectedHex] = parts;
    try {
      const derived = crypto.scryptSync(plainPassword, salt, 64);
      const expected = Buffer.from(expectedHex, 'hex');
      if (derived.length !== expected.length) return { valid: false, needsRehash: false };
      return { valid: crypto.timingSafeEqual(derived, expected), needsRehash: false };
    } catch {
      return { valid: false, needsRehash: false };
    }
  }
  return {
    valid: timingSafeCompareStrings(plainPassword, storedPassword),
    needsRehash: true,
  };
}

function hashSecretToken(value: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.createHash('sha256').update(`${salt}:${value}`).digest('hex');
  return `sha256$${salt}$${digest}`;
}

function verifySecretHash(value: string, storedHash: string): boolean {
  const parts = String(storedHash || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'sha256') return false;
  const [, salt, expectedHex] = parts;
  try {
    const actual = crypto.createHash('sha256').update(`${salt}:${value}`).digest();
    const expected = Buffer.from(expectedHex, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function resolveSiteOrigin(req: Request): string {
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const rawHost = forwardedHost || String(req.headers.host || 'knigai.ru').trim();
  const hostLower = rawHost.toLowerCase();
  if (hostLower.includes('knigai.online')) return 'https://knigai.online';
  if (hostLower.includes('knigai.ru')) return 'https://knigai.ru';
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (hostLower.startsWith('localhost') || hostLower.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${rawHost}`;
}

function sanitizeUserRow(row: Record<string, any>) {
  const isAdmin = String(row.email || '').toLowerCase() === ADMIN_EMAIL.toLowerCase() || Boolean(row.is_admin);
  return {
    uid: Number(row.uid),
    email: String(row.email),
    name: isAdmin ? ADMIN_NAME : row.name || '',
    phone: row.phone || '',
    bio: row.bio || '',
    avatar_url: row.avatar_url || '',
    is_admin: isAdmin,
    letters_balance:
      row.letters_balance !== undefined && row.letters_balance !== null
        ? Number(row.letters_balance)
        : INITIAL_LETTERS_BALANCE,
    telegram_id: row.telegram_id || null,
    telegram_verified: Boolean(row.telegram_verified),
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    username: row.username || null,
    photo_url: row.photo_url || null,
    profile_link: row.profile_link || null,
    is_premium: Boolean(row.is_premium),
    language_code: row.language_code || null,
    allows_write_to_pm: Boolean(row.allows_write_to_pm),
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    referred_by: row.referred_by || null,
    referred_by_uid: row.referred_by_uid ? Number(row.referred_by_uid) : null,
    referral_reward_balance: Number(row.referral_reward_balance || 0),
    notification_prefs: row.notification_prefs,
    created_at: row.created_at || new Date().toISOString(),
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export function registerPasswordResetAndAuthRoutes(app: Express, queryPg: QueryPgFn): void {
  // 1. Server-side Login with Scrypt + Legacy Auto-Upgrade
  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Укажите корректный email адрес' });
      }
      if (!password) {
        return res.status(400).json({ error: 'Введите пароль' });
      }

      const { rows } = await queryPg<Record<string, any>>(
        `SELECT uid, email, name, phone, bio, avatar_url, password, is_admin, letters_balance,
                telegram_id, telegram_verified, first_name, last_name, username, photo_url,
                profile_link, is_premium, language_code, allows_write_to_pm, latitude, longitude,
                referred_by, referred_by_uid, utm_source, utm_medium, utm_campaign,
                referral_reward_balance, notification_prefs, last_login, created_at
         FROM users WHERE LOWER(email) = $1 LIMIT 1;`,
        [email]
      );

      const foundUser = rows[0];
      const isAdminEmail = email === ADMIN_EMAIL.toLowerCase();

      if (isAdminEmail) {
        const storedAdminPass = foundUser?.password ? String(foundUser.password) : FALLBACK_ADMIN_PASS;
        const verified = verifyPasswordCompatible(password, storedAdminPass);
        const matchesFallback = !foundUser?.password && timingSafeCompareStrings(password, FALLBACK_ADMIN_PASS);
        if (!verified.valid && !matchesFallback) {
          return res.status(401).json({ error: 'Неверный пароль доступа администратора' });
        }
        if (foundUser && verified.valid && verified.needsRehash) {
          const hashed = hashPasswordScrypt(password);
          await queryPg('UPDATE users SET password = $1, last_login = now() WHERE uid = $2;', [
            hashed,
            Number(foundUser.uid),
          ]).catch(() => {});
        }
        if (!foundUser) {
          return res.json({
            user: {
              uid: 10000000001,
              email: ADMIN_EMAIL,
              name: ADMIN_NAME,
              phone: '+7 999 000-00-00',
              bio: 'Главный редактор и администратор KnigAI',
              avatar_url: '',
              is_admin: true,
              letters_balance: INITIAL_LETTERS_BALANCE,
              telegram_id: '169262990',
              telegram_verified: true,
              created_at: new Date().toISOString(),
            },
          });
        }
        return res.json({ user: sanitizeUserRow(foundUser) });
      }

      if (!foundUser) {
        return res.status(404).json({
          error: 'Пользователь с таким email не найден. Пожалуйста, перейдите на вкладку «Регистрация».',
        });
      }

      if (foundUser.password) {
        const check = verifyPasswordCompatible(password, String(foundUser.password));
        if (!check.valid) {
          return res.status(401).json({ error: 'Неверный пароль' });
        }
        if (check.needsRehash) {
          const hashed = hashPasswordScrypt(password);
          await queryPg('UPDATE users SET password = $1, last_login = now() WHERE uid = $2;', [
            hashed,
            Number(foundUser.uid),
          ]).catch(() => {});
        } else {
          await queryPg('UPDATE users SET last_login = now() WHERE uid = $1;', [
            Number(foundUser.uid),
          ]).catch(() => {});
        }
      }

      return res.json({ user: sanitizeUserRow(foundUser) });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка входа на сервере',
      });
    }
  });

  // 2. Server-side Registration with Scrypt Hashing
  app.post('/api/auth/register', async (req, res) => {
    try {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const name = String(req.body?.name || '').trim();
      const phone = String(req.body?.phone || '').trim();
      const password = String(req.body?.password || '').trim();
      const confirmPassword = String(req.body?.confirmPassword || '').trim();
      const referredByUidRaw = req.body?.referredByUid;
      const referredByUid =
        referredByUidRaw && /^\d+$/.test(String(referredByUidRaw)) ? Number(referredByUidRaw) : null;

      if (!name) return res.status(400).json({ error: 'Пожалуйста, укажите ваше ФИО' });
      if (!phone) return res.status(400).json({ error: 'Пожалуйста, укажите ваш контактный телефон' });
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Пожалуйста, укажите корректный email адрес' });
      }
      if (!password || password.length < 4) {
        return res.status(400).json({ error: 'Пароль должен содержать не менее 4 символов' });
      }
      if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Пароли не совпадают. Проверьте правильность повторного ввода.' });
      }

      const existing = await queryPg<{ uid: number }>(
        'SELECT uid FROM users WHERE LOWER(email) = $1 LIMIT 1;',
        [email]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'Пользователь с таким email уже зарегистрирован. Перейдите во вкладку «Вход» или воспользуйтесь восстановлением пароля.',
        });
      }

      const isAdmin = email === ADMIN_EMAIL.toLowerCase();
      const uid = isAdmin ? 10000000001 : Math.floor(10000000000 + Math.random() * 90000000000);
      const hashedPassword = hashPasswordScrypt(password);

      const { rows } = await queryPg<Record<string, any>>(
        `INSERT INTO users (uid, email, name, phone, password, is_admin, letters_balance, referred_by_uid)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING uid, email, name, phone, is_admin, letters_balance, referred_by_uid, created_at;`,
        [uid, email, name, phone, hashedPassword, isAdmin, INITIAL_LETTERS_BALANCE, referredByUid]
      );

      const created = rows[0] || {
        uid,
        email,
        name,
        phone,
        is_admin: isAdmin,
        letters_balance: INITIAL_LETTERS_BALANCE,
        referred_by_uid: referredByUid,
        created_at: new Date().toISOString(),
      };

      return res.status(201).json({ user: sanitizeUserRow(created) });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка регистрации пользователя',
      });
    }
  });

  // 3. Server-side Profile Password Update (Scrypt Hash)
  app.post('/api/auth/update-password', async (req, res) => {
    try {
      const uid = Number(req.body?.uid);
      const newPassword = String(req.body?.newPassword || '').trim();
      if (!uid || !Number.isFinite(uid)) {
        return res.status(400).json({ error: 'Некорректный UID пользователя' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
      }
      const hashed = hashPasswordScrypt(newPassword);
      await queryPg('UPDATE users SET password = $1 WHERE uid = $2;', [hashed, uid]);
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Не удалось обновить пароль',
      });
    }
  });

  // 4. Request Password Reset Email (Code + Magic Link)
  app.post('/api/auth/password-reset/request', async (req, res) => {
    try {
      await ensureMailAndAuthSchema(queryPg);
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!email || !isValidEmail(email)) {
        return res.status(400).json({ error: 'Введите корректный адрес электронной почты' });
      }

      // Rate limit check (60s cooldown per email)
      const recentCheck = await queryPg<{ sec_ago: number }>(
        `SELECT EXTRACT(EPOCH FROM (now() - created_at)) AS sec_ago
         FROM password_reset_tokens
         WHERE LOWER(email) = $1
         ORDER BY created_at DESC LIMIT 1;`,
        [email]
      );
      if (recentCheck.rows.length > 0) {
        const secAgo = Number(recentCheck.rows[0].sec_ago || 0);
        if (secAgo >= 0 && secAgo < RESEND_COOLDOWN_SECONDS) {
          const waitSec = Math.ceil(RESEND_COOLDOWN_SECONDS - secAgo);
          return res.status(429).json({
            error: `Письмо уже отправлено. Повторная отправка возможна через ${waitSec} сек.`,
            retryAfterSec: waitSec,
          });
        }
      }

      // Find user in DB
      const { rows: userRows } = await queryPg<{ uid: number; email: string; name: string }>(
        'SELECT uid, email, name FROM users WHERE LOWER(email) = $1 LIMIT 1;',
        [email]
      );
      const user = userRows[0];

      // Prevent user enumeration: return uniform positive guidance if user isn't registered
      if (!user) {
        return res.json({
          success: true,
          cooldownSec: RESEND_COOLDOWN_SECONDS,
          message:
            'Если аккаунт с таким email зарегистрирован в KnigAI, мы отправили письмо с 6-значным кодом и ссылкой восстановления. Проверьте входящие и папку «Спам».',
        });
      }

      const rawCode = String(crypto.randomInt(100000, 1000000));
      const rawToken = crypto.randomBytes(24).toString('hex');
      const codeHash = hashSecretToken(rawCode);
      const tokenHash = hashSecretToken(rawToken);
      const requestIp = String(req.headers['x-forwarded-for'] || req.ip || '').slice(0, 64);

      // Invalidate any previous active reset tokens for this user
      await queryPg(
        'UPDATE password_reset_tokens SET used_at = now() WHERE user_uid = $1 AND used_at IS NULL;',
        [Number(user.uid)]
      );

      const inserted = await queryPg<{ id: number }>(
        `INSERT INTO password_reset_tokens (
           user_uid, email, code_hash, token_hash, attempts, max_attempts, request_ip, expires_at
         ) VALUES ($1, $2, $3, $4, 0, $5, $6, now() + interval '15 minutes')
         RETURNING id;`,
        [Number(user.uid), email, codeHash, tokenHash, MAX_VERIFY_ATTEMPTS, requestIp]
      );
      const tokenRowId = inserted.rows[0]?.id;

      const siteOrigin = resolveSiteOrigin(req);
      const resetUrl = `${siteOrigin}/?reset_token=${encodeURIComponent(rawToken)}&reset_email=${encodeURIComponent(email)}`;
      const emailParams = {
        recipientName: user.name || email.split('@')[0],
        recipientEmail: email,
        code: rawCode,
        resetUrl,
        siteOrigin,
        expiresMinutes: CODE_TTL_MINUTES,
      };

      try {
        await sendMailViaDbConfig(queryPg, {
          to: email,
          subject: 'Восстановление пароля KnigAI — код и ссылка доступа',
          html: buildPasswordResetHtmlEmail(emailParams),
          text: buildPasswordResetTextFallback(emailParams),
        });
      } catch (smtpErr) {
        // Delete unsendable token row so cooldown doesn't block user after SMTP config fix
        if (tokenRowId) {
          await queryPg('DELETE FROM password_reset_tokens WHERE id = $1;', [tokenRowId]).catch(() => {});
        }
        return res.status(502).json({
          error: `Не удалось отправить письмо через почтовый сервер: ${
            smtpErr instanceof Error ? smtpErr.message : String(smtpErr)
          }`,
        });
      }

      return res.json({
        success: true,
        cooldownSec: RESEND_COOLDOWN_SECONDS,
        message:
          'Письмо с 6-значным кодом и ссылкой восстановления отправлено на указанный email. Проверьте папку «Входящие» и «Спам».',
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка запроса восстановления пароля',
      });
    }
  });

  // 5. Verify Reset Token or Code before Confirming New Password
  app.post('/api/auth/password-reset/verify', async (req, res) => {
    try {
      await ensureMailAndAuthSchema(queryPg);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const token = String(req.body?.token || '').trim();
      const code = String(req.body?.code || '').replace(/\s+/g, '').trim();

      if (!token && (!email || !code)) {
        return res.status(400).json({ error: 'Укажите код или ссылку восстановления' });
      }

      const { rows } = await queryPg<{
        id: number;
        email: string;
        code_hash: string;
        token_hash: string;
        attempts: number;
        max_attempts: number;
      }>(
        email
          ? `SELECT id, email, code_hash, token_hash, attempts, max_attempts
             FROM password_reset_tokens
             WHERE LOWER(email) = $1 AND used_at IS NULL AND expires_at > now()
             ORDER BY created_at DESC LIMIT 3;`
          : `SELECT id, email, code_hash, token_hash, attempts, max_attempts
             FROM password_reset_tokens
             WHERE used_at IS NULL AND expires_at > now()
             ORDER BY created_at DESC LIMIT 25;`,
        email ? [email] : []
      );

      const matched = rows.find((r) => {
        if (Number(r.attempts) >= Number(r.max_attempts || MAX_VERIFY_ATTEMPTS)) return false;
        if (token && verifySecretHash(token, r.token_hash)) return true;
        if (code && verifySecretHash(code, r.code_hash)) return true;
        return false;
      });

      if (!matched) {
        return res.status(400).json({
          valid: false,
          error: 'Ссылка или код недействительны либо срок их действия (15 минут) истёк. Запросите новое письмо.',
        });
      }

      return res.json({
        valid: true,
        email: matched.email,
      });
    } catch (err) {
      return res.status(500).json({
        valid: false,
        error: err instanceof Error ? err.message : 'Ошибка проверки кода восстановления',
      });
    }
  });

  // 6. Confirm Password Reset (Verify Code or URL Token + Save Scrypt Password + Auto Login)
  app.post('/api/auth/password-reset/confirm', async (req, res) => {
    try {
      await ensureMailAndAuthSchema(queryPg);
      const email = String(req.body?.email || '').trim().toLowerCase();
      const token = String(req.body?.token || '').trim();
      const code = String(req.body?.code || '').replace(/\s+/g, '').trim();
      const newPassword = String(req.body?.newPassword || '').trim();
      const confirmPassword = String(req.body?.confirmPassword || '').trim();

      if (!token && !code) {
        return res.status(400).json({ error: 'Введите 6-значный код из письма' });
      }
      if (!token && (!email || !isValidEmail(email))) {
        return res.status(400).json({ error: 'Укажите email, на который приходил код' });
      }
      if (newPassword.length < 6) {
        return res.status(400).json({ error: 'Новый пароль должен содержать минимум 6 символов' });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Пароли не совпадают' });
      }

      const { rows } = await queryPg<{
        id: number;
        user_uid: number;
        email: string;
        code_hash: string;
        token_hash: string;
        attempts: number;
        max_attempts: number;
      }>(
        email
          ? `SELECT id, user_uid, email, code_hash, token_hash, attempts, max_attempts
             FROM password_reset_tokens
             WHERE LOWER(email) = $1 AND used_at IS NULL AND expires_at > now()
             ORDER BY created_at DESC LIMIT 3;`
          : `SELECT id, user_uid, email, code_hash, token_hash, attempts, max_attempts
             FROM password_reset_tokens
             WHERE used_at IS NULL AND expires_at > now()
             ORDER BY created_at DESC LIMIT 25;`,
        email ? [email] : []
      );

      if (rows.length === 0) {
        return res.status(400).json({
          error: 'Активный код восстановления не найден или истёк (15 минут). Запросите письмо повторно.',
        });
      }

      const matched = rows.find((r) => {
        if (Number(r.attempts) >= Number(r.max_attempts || MAX_VERIFY_ATTEMPTS)) return false;
        if (token && verifySecretHash(token, r.token_hash)) return true;
        if (code && verifySecretHash(code, r.code_hash)) return true;
        return false;
      });

      if (!matched) {
        // Increment attempts on the latest row for that email
        if (email && rows[0]) {
          const nextAttempts = Number(rows[0].attempts || 0) + 1;
          const maxAttempts = Number(rows[0].max_attempts || MAX_VERIFY_ATTEMPTS);
          await queryPg('UPDATE password_reset_tokens SET attempts = $1 WHERE id = $2;', [
            nextAttempts,
            rows[0].id,
          ]).catch(() => {});
          if (nextAttempts >= maxAttempts) {
            return res.status(429).json({
              error: 'Превышено число попыток ввода кода. Пожалуйста, запросите новое письмо восстановления.',
            });
          }
          return res.status(400).json({
            error: `Неверный код восстановления. Осталось попыток: ${maxAttempts - nextAttempts}.`,
          });
        }
        return res.status(400).json({
          error: 'Неверная или устаревшая ссылка восстановления. Запросите новое письмо.',
        });
      }

      // Atomically mark token as used (prevents replay race)
      const markRes = await queryPg<{ id: number }>(
        'UPDATE password_reset_tokens SET used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id;',
        [matched.id]
      );
      if (markRes.rows.length === 0) {
        return res.status(400).json({ error: 'Этот код восстановления уже был использован.' });
      }

      const hashedPassword = hashPasswordScrypt(newPassword);
      const updatedUserRes = await queryPg<Record<string, any>>(
        `UPDATE users SET password = $1, last_login = now()
         WHERE uid = $2
         RETURNING uid, email, name, phone, bio, avatar_url, is_admin, letters_balance,
                   telegram_id, telegram_verified, first_name, last_name, username, photo_url,
                   profile_link, is_premium, language_code, allows_write_to_pm, latitude, longitude,
                   referred_by, referred_by_uid, referral_reward_balance, notification_prefs, created_at;`,
        [hashedPassword, Number(matched.user_uid)]
      );

      await queryPg(
        `INSERT INTO notifications (user_uid, type, title, message, is_read, link)
         VALUES ($1, 'system', 'Пароль успешно обновлён', 'Пароль вашего аккаунта KnigAI был изменён через процедуру восстановления доступа по email.', false, 'profile');`,
        [Number(matched.user_uid)]
      ).catch(() => {});

      const userRow = updatedUserRes.rows[0];
      return res.json({
        success: true,
        message: 'Новый пароль сохранён! Выполнен вход в ваш аккаунт KnigAI.',
        user: userRow ? sanitizeUserRow(userRow) : null,
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Не удалось сохранить новый пароль',
      });
    }
  });

  // 7. Admin Mail Server Config Inspection & Update (Never exposes unmasked password)
  app.get('/api/admin/mail-config', async (_req, res) => {
    try {
      const cfg = await getActiveMailConfig(queryPg);
      return res.json({
        config: {
          config_key: cfg.config_key,
          provider: cfg.provider,
          username: cfg.username,
          sender_name: cfg.sender_name,
          sender_email: cfg.sender_email,
          password_masked: maskMailSecret(cfg.password),
          incoming_host: cfg.incoming_host,
          pop3_port: Number(cfg.pop3_port),
          pop3_ssl_port: Number(cfg.pop3_ssl_port),
          imap_port: Number(cfg.imap_port),
          imap_ssl_port: Number(cfg.imap_ssl_port),
          smtp_host: cfg.smtp_host,
          smtp_ports: cfg.smtp_ports,
          smtp_ssl_port: Number(cfg.smtp_ssl_port),
          smtp_use_tls: Boolean(cfg.smtp_use_tls),
          is_active: Boolean(cfg.is_active),
          updated_at: cfg.updated_at || null,
        },
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка чтения mail_configs',
      });
    }
  });

  app.put('/api/admin/mail-config', async (req, res) => {
    try {
      const current = await getActiveMailConfig(queryPg);
      const username = String(req.body?.username ?? current.username).trim();
      const senderName = String(req.body?.sender_name ?? current.sender_name).trim() || 'KnigAI';
      const senderEmail = String(req.body?.sender_email ?? current.sender_email).trim() || username;
      const incomingHost = String(req.body?.incoming_host ?? current.incoming_host).trim();
      const smtpHost = String(req.body?.smtp_host ?? current.smtp_host).trim();
      const smtpPorts = String(req.body?.smtp_ports ?? current.smtp_ports).trim() || '25:465:587';
      const smtpSslPort = Number(req.body?.smtp_ssl_port ?? current.smtp_ssl_port) || 465;
      const pop3Port = Number(req.body?.pop3_port ?? current.pop3_port) || 110;
      const pop3SslPort = Number(req.body?.pop3_ssl_port ?? current.pop3_ssl_port) || 995;
      const imapPort = Number(req.body?.imap_port ?? current.imap_port) || 143;
      const imapSslPort = Number(req.body?.imap_ssl_port ?? current.imap_ssl_port) || 993;
      const newPass = typeof req.body?.password === 'string' && req.body.password.trim()
        ? req.body.password.trim()
        : current.password;

      await queryPg(
        `UPDATE mail_configs
         SET username = $1,
             sender_name = $2,
             sender_email = $3,
             password = $4,
             incoming_host = $5,
             pop3_port = $6,
             pop3_ssl_port = $7,
             imap_port = $8,
             imap_ssl_port = $9,
             smtp_host = $10,
             smtp_ports = $11,
             smtp_ssl_port = $12,
             updated_at = now()
         WHERE config_key = 'regru_primary';`,
        [
          username,
          senderName,
          senderEmail,
          newPass,
          incomingHost,
          pop3Port,
          pop3SslPort,
          imapPort,
          imapSslPort,
          smtpHost,
          smtpPorts,
          smtpSslPort,
        ]
      );

      const updated = await getActiveMailConfig(queryPg);
      return res.json({
        success: true,
        config: {
          config_key: updated.config_key,
          provider: updated.provider,
          username: updated.username,
          sender_name: updated.sender_name,
          sender_email: updated.sender_email,
          password_masked: maskMailSecret(updated.password),
          incoming_host: updated.incoming_host,
          pop3_port: Number(updated.pop3_port),
          pop3_ssl_port: Number(updated.pop3_ssl_port),
          imap_port: Number(updated.imap_port),
          imap_ssl_port: Number(updated.imap_ssl_port),
          smtp_host: updated.smtp_host,
          smtp_ports: updated.smtp_ports,
          smtp_ssl_port: Number(updated.smtp_ssl_port),
          smtp_use_tls: Boolean(updated.smtp_use_tls),
          is_active: Boolean(updated.is_active),
        },
      });
    } catch (err) {
      return res.status(500).json({
        error: err instanceof Error ? err.message : 'Ошибка обновления mail_configs',
      });
    }
  });

  app.post('/api/admin/mail-config/test', async (req, res) => {
    try {
      const testEmail = String(req.body?.to || '').trim().toLowerCase();
      if (testEmail && isValidEmail(testEmail)) {
        const siteOrigin = resolveSiteOrigin(req);
        const sent = await sendMailViaDbConfig(queryPg, {
          to: testEmail,
          subject: 'Тестовое письмо KnigAI — проверка почтового сервера',
          html: buildPasswordResetHtmlEmail({
            recipientName: 'Администратор KnigAI',
            recipientEmail: testEmail,
            code: '000000',
            resetUrl: siteOrigin,
            siteOrigin,
            expiresMinutes: CODE_TTL_MINUTES,
          }),
          text: `Тестовая проверка доставки писем KnigAI через SMTP (${siteOrigin}).`,
        });
        return res.json({ ok: true, mode: 'send', ...sent });
      }

      const verifyRes = await verifySmtpConnection(queryPg);
      return res.json(verifyRes);
    } catch (err) {
      return res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : 'Ошибка проверки SMTP',
      });
    }
  });
}
