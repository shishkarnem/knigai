import { executePgQuery } from '../db/pgProxy';
import { AppUser } from '../../types';

const STORAGE_USER_KEY = 'knigai_noir_user';

export const ADMIN_EMAIL = 'shishkarnem@gmail.com';
export const ADMIN_PASSWORD = 'wkL35eTm';
export const ADMIN_NAME = 'Тимошенко Денис';

export function isUserAdmin(user: AppUser | null | undefined): boolean {
  if (!user) return false;
  return user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase() || !!user.is_admin;
}

export function generate11DigitUid(): number {
  return Math.floor(10000000000 + Math.random() * 90000000000);
}

export const INITIAL_LETTERS_BALANCE = 1000000;
export const BASE_LETTERS_PACK = 100000; // 100 000 букв
export const BASE_LETTERS_PRICE_RUB = 15; // 15 руб за 100 000 букв
export const MIN_PURCHASE_RUBLES = 15; // минимальный платеж 15 руб
export const SUBSCRIPTION_MONTHLY_RUB = 0; // подписки и ежемесячные тарифы = 0 руб

export interface LettersPriceQuote {
  letters: number;
  baseRubles: number;
  discountPercent: number;
  discountRubles: number;
  finalRubles: number;
  effectiveRatePer100k: number;
}

/**
 * Calculates purchase price with volume discounts:
 * - 100 000 letters = 15 rubles.
 * - Min payment = 15 rubles.
 * - Subscriptions = 0 rubles.
 * - 10 000 000 letters: 10% discount = 1 350 rubles (saves 150 rubles).
 * - 100 000 000 letters: 20% discount = 12 000 rubles (saves 3 000 rubles).
 * - 1 000 000 000 letters: 33% discount = 100 000 rubles (saves 50 000 rubles).
 */
export function calculateLettersPrice(lettersCount: number): LettersPriceQuote {
  const letters = Math.max(BASE_LETTERS_PACK, lettersCount);
  const baseRubles = (letters / BASE_LETTERS_PACK) * BASE_LETTERS_PRICE_RUB;
  let discountPercent = 0;
  let finalRubles = baseRubles;

  if (letters >= 1000000000) {
    discountPercent = 33;
    // 1 млрд букв = 100 000 руб (скидка 33.33%, экономия 50 000 руб)
    finalRubles = (letters / 1000000000) * 100000;
  } else if (letters >= 100000000) {
    discountPercent = 20;
    // 100 млн букв = 12 000 руб (скидка 20%, экономия 3 000 руб)
    finalRubles = baseRubles * 0.8;
  } else if (letters >= 10000000) {
    discountPercent = 10;
    // 10 млн букв = 1 350 руб (скидка 10%, экономия 150 руб)
    finalRubles = baseRubles * 0.9;
  }

  const discountRubles = Math.round(baseRubles - finalRubles);
  finalRubles = Math.max(MIN_PURCHASE_RUBLES, Math.round(finalRubles));
  const effectiveRatePer100k = Number(((finalRubles / letters) * BASE_LETTERS_PACK).toFixed(2));

  return {
    letters,
    baseRubles: Math.round(baseRubles),
    discountPercent,
    discountRubles,
    finalRubles,
    effectiveRatePer100k,
  };
}

export function convertLettersToRubles(lettersCount: number): number {
  return Number(((lettersCount / BASE_LETTERS_PACK) * BASE_LETTERS_PRICE_RUB).toFixed(2));
}

export function getCurrentUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppUser;
    if (parsed && parsed.uid && parsed.email) {
      if (parsed.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
        parsed.name = ADMIN_NAME;
        parsed.is_admin = true;
      }
      if (typeof parsed.letters_balance !== 'number' || isNaN(parsed.letters_balance)) {
        parsed.letters_balance = INITIAL_LETTERS_BALANCE;
      }
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

export function saveUserSession(user: AppUser): void {
  if (user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
    user.name = ADMIN_NAME;
    user.is_admin = true;
  }
  localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(user));
}

export function clearUserSession(): void {
  localStorage.removeItem(STORAGE_USER_KEY);
  try {
    localStorage.removeItem('knigai_twa_jwt');
  } catch {
    // ignore
  }
}

export interface RegisterUserData {
  email: string;
  name: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

/**
 * Log in an existing user with email and password via server-side scrypt check
 */
export async function loginUser(emailRaw: string, passwordRaw?: string): Promise<AppUser> {
  const email = emailRaw.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Укажите корректный email адрес');
  }
  if (!passwordRaw) {
    throw new Error('Введите пароль');
  }

  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordRaw }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.user) {
    throw new Error(data?.error || 'Ошибка входа в аккаунт');
  }

  const appUser = data.user as AppUser;
  saveUserSession(appUser);
  return appUser;
}

/**
 * Register a new user with full name, phone, email and password confirmation
 */
export async function registerUser(data: RegisterUserData): Promise<AppUser> {
  const email = data.email.trim().toLowerCase();
  const name = data.name.trim();
  const phone = data.phone.trim();
  const password = data.password.trim();
  const confirmPassword = data.confirmPassword.trim();

  if (!name) {
    throw new Error('Пожалуйста, укажите ваше ФИО');
  }
  if (!phone) {
    throw new Error('Пожалуйста, укажите ваш контактный телефон');
  }
  if (!email || !email.includes('@')) {
    throw new Error('Пожалуйста, укажите корректный email адрес');
  }
  if (!password) {
    throw new Error('Пожалуйста, задайте пароль');
  }
  if (password.length < 4) {
    throw new Error('Пароль должен содержать не менее 4 символов');
  }
  if (password !== confirmPassword) {
    throw new Error('Пароли не совпадают. Проверьте правильность повторного ввода.');
  }

  let referredByUid: number | null = null;
  try {
    const rawRef = localStorage.getItem('knigai_ref_uid');
    if (rawRef && /^\d+$/.test(rawRef)) {
      const parsedRef = Number(rawRef);
      if (parsedRef > 0) {
        referredByUid = parsedRef;
      }
    }
  } catch {
    // ignore
  }

  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      phone,
      email,
      password,
      confirmPassword,
      referredByUid,
    }),
  });

  const payload = await res.json().catch(() => ({}));
  if (!res.ok || !payload?.user) {
    throw new Error(payload?.error || 'Ошибка регистрации пользователя');
  }

  const user = payload.user as AppUser;
  saveUserSession(user);

  // Log starter bonus transaction, notification, and award referrer if applicable
  try {
    await executePgQuery(
      `INSERT INTO transactions (user_uid, amount, balance_after, operation_type, description, details)
       VALUES ($1, $2, $2, 'welcome_bonus', 'Стартовый бонус автора KnigAI при регистрации', '{"rubles": 150}'::jsonb);`,
      [user.uid, INITIAL_LETTERS_BALANCE]
    );
    await executePgQuery(
      `INSERT INTO notifications (user_uid, type, title, message, is_read, link)
       VALUES ($1, 'bonus', 'Начислено 1 000 000 стартовых букв', 'Добро пожаловать в KnigAI! На ваш баланс начислен стартовый бонус 1 000 000 букв (≈ 150 ₽).', false, 'balance');`,
      [user.uid]
    );
    if (referredByUid) {
      const { grantReferralBonus } = await import('../billing/transactionService');
      await grantReferralBonus({
        referrerUid: referredByUid,
        invitedEmail: email,
        bonusLetters: 100000,
      });
      localStorage.removeItem('knigai_ref_uid');
    }
  } catch {
    // non-fatal
  }

  return user;
}

/**
 * Deduct letters from user balance
 */
export async function deductUserLetters(uid: number, amount: number): Promise<number> {
  const current = getCurrentUser();
  const currentBalance = current?.letters_balance ?? INITIAL_LETTERS_BALANCE;
  const newBalance = Math.max(0, currentBalance - amount);
  if (current) {
    current.letters_balance = newBalance;
    saveUserSession(current);
  }
  try {
    await executePgQuery('UPDATE users SET letters_balance = $1 WHERE uid = $2;', [newBalance, uid]);
  } catch (e) {
    console.warn('DB update letters balance error:', e);
  }
  return newBalance;
}

/**
 * Top up user letters balance
 */
export async function addLettersToUser(uid: number, amount: number): Promise<number> {
  const current = getCurrentUser();
  const currentBalance = current?.letters_balance ?? INITIAL_LETTERS_BALANCE;
  const newBalance = currentBalance + amount;
  if (current) {
    current.letters_balance = newBalance;
    saveUserSession(current);
  }
  try {
    await executePgQuery('UPDATE users SET letters_balance = $1 WHERE uid = $2;', [newBalance, uid]);
  } catch (e) {
    console.warn('DB add letters balance error:', e);
  }
  return newBalance;
}

/**
 * Update user profile (name, phone) in DB and local session
 */
export async function updateUserProfile(
  uid: number,
  data: {
    name?: string;
    phone?: string;
    email?: string;
    bio?: string;
    avatar_url?: string;
    password?: string;
    telegram_id?: string | null;
    telegram_verified?: boolean;
  }
): Promise<AppUser> {
  const current = getCurrentUser();
  if (!current || Number(current.uid) !== Number(uid)) {
    throw new Error('Пользователь не авторизован');
  }

  const updated: AppUser = {
    ...current,
    name: data.name !== undefined ? data.name.trim() : current.name,
    phone: data.phone !== undefined ? data.phone.trim() : current.phone,
    email: data.email !== undefined ? data.email.trim() : current.email,
    bio: data.bio !== undefined ? data.bio.trim() : current.bio,
    avatar_url: data.avatar_url !== undefined ? data.avatar_url : current.avatar_url,
    telegram_id:
      data.telegram_id !== undefined
        ? data.telegram_id
          ? data.telegram_id.trim()
          : null
        : current.telegram_id,
    telegram_verified:
      data.telegram_verified !== undefined ? data.telegram_verified : current.telegram_verified,
  };

  try {
    if (data.password) {
      const passRes = await fetch('/api/auth/update-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, newPassword: data.password }),
      });
      const passJson = await passRes.json().catch(() => ({}));
      if (!passRes.ok) {
        throw new Error(passJson?.error || 'Не удалось обновить пароль');
      }
    }

    await executePgQuery(
      'UPDATE users SET name = $1, phone = $2, email = $3, bio = $4, avatar_url = $5, telegram_id = $6, telegram_verified = $7 WHERE uid = $8;',
      [
        updated.name || '',
        updated.phone || '',
        updated.email,
        updated.bio || '',
        updated.avatar_url || '',
        updated.telegram_id || null,
        Boolean(updated.telegram_verified),
        uid,
      ]
    );
  } catch (err) {
    if (data.password && err instanceof Error) {
      throw err;
    }
    console.warn('DB update user warning:', err);
  }

  saveUserSession(updated);
  return updated;
}

/**
 * Request password reset code + magic link email via Reg.ru SMTP
 */
export async function requestPasswordReset(emailRaw: string): Promise<{
  success: boolean;
  message: string;
  cooldownSec?: number;
}> {
  const email = emailRaw.trim().toLowerCase();
  const res = await fetch('/api/auth/password-reset/request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось отправить письмо восстановления');
  }
  return {
    success: true,
    message: data?.message || 'Письмо с кодом и ссылкой отправлено на указанный email.',
    cooldownSec: Number(data?.cooldownSec || 60),
  };
}

/**
 * Verify password reset token or 6-digit code
 */
export async function verifyPasswordReset(params: {
  email?: string;
  code?: string;
  token?: string;
}): Promise<{ valid: boolean; email?: string; error?: string }> {
  const res = await fetch('/api/auth/password-reset/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.valid) {
    return {
      valid: false,
      error: data?.error || 'Код или ссылка восстановления недействительны.',
    };
  }
  return { valid: true, email: data.email };
}

/**
 * Confirm password reset with 6-digit code or URL token and log user in
 */
export async function confirmPasswordReset(params: {
  email?: string;
  code?: string;
  token?: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ user: AppUser | null; message: string }> {
  const res = await fetch('/api/auth/password-reset/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || 'Не удалось обновить пароль');
  }
  const user = (data?.user as AppUser | null) || null;
  if (user) {
    saveUserSession(user);
  }
  return {
    user,
    message: data?.message || 'Пароль успешно обновлён!',
  };
}

/**
 * Backward compatibility wrapper
 */
export async function loginOrRegisterWithEmail(emailRaw: string, passwordRaw?: string): Promise<AppUser> {
  try {
    return await loginUser(emailRaw, passwordRaw);
  } catch {
    return await registerUser({
      email: emailRaw,
      name: emailRaw.split('@')[0],
      phone: '',
      password: passwordRaw || '123456',
      confirmPassword: passwordRaw || '123456',
    });
  }
}
