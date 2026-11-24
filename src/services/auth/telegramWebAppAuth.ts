import { AppUser } from '../../types';
import { saveUserSession } from './authService';

const TWA_JWT_STORAGE_KEY = 'knigai_twa_jwt';

export interface TelegramWebAppGlobal {
  initData?: string;
  initDataUnsafe?: Record<string, unknown>;
  ready?: () => void;
  expand?: () => void;
  requestContact?: (cb: (sent: boolean, event?: { responseUnsafe?: { contact?: { phone_number?: string } } }) => void) => void;
  requestLocation?: (cb: (granted: boolean, event?: { latitude?: number; longitude?: number }) => void) => void;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebAppGlobal;
    };
  }
}

export function getTelegramWebApp(): TelegramWebAppGlobal | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp || null;
}

export function getTelegramInitData(): string {
  const twa = getTelegramWebApp();
  return String(twa?.initData || '').trim();
}

export function isRunningInsideTelegramWebApp(): boolean {
  return Boolean(getTelegramInitData());
}

export function getStoredTwaJwt(): string | null {
  try {
    return localStorage.getItem(TWA_JWT_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveTwaJwt(token: string): void {
  try {
    localStorage.setItem(TWA_JWT_STORAGE_KEY, token);
    document.cookie = `${TWA_JWT_STORAGE_KEY}=${encodeURIComponent(token)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  } catch {
    // ignore storage restriction
  }
}

export function clearTwaJwt(): void {
  try {
    localStorage.removeItem(TWA_JWT_STORAGE_KEY);
    document.cookie = `${TWA_JWT_STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // ignore
  }
}

/**
 * Инициализирует Telegram Mini App (ready + expand) и выполняет строгую серверную
 * HMAC-SHA256 авторизацию / авторегистрацию по initData с выдачей JWT.
 */
export async function authenticateWithTelegramWebApp(initDataOverride?: string): Promise<{
  user: AppUser;
  token: string;
  isNewUser: boolean;
}> {
  const twa = getTelegramWebApp();
  try {
    twa?.ready?.();
    twa?.expand?.();
  } catch {
    // ignore
  }

  const initData = (initDataOverride ?? getTelegramInitData()).trim();
  if (!initData) {
    throw new Error('Приложение не запущено внутри Telegram Mini App (initData пуст).');
  }

  const res = await fetch('/api/auth/telegram-webapp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData }),
  });

  const data = await res.json();
  if (!res.ok || !data.success || !data.user) {
    throw new Error(data.error || 'Не удалось пройти проверку Telegram Mini App');
  }

  if (data.token) {
    saveTwaJwt(data.token);
  }
  const appUser = data.user as AppUser;
  saveUserSession(appUser);

  return {
    user: appUser,
    token: data.token,
    isNewUser: Boolean(data.isNewUser),
  };
}

/**
 * Запрашивает контактный телефон пользователя через нативное окно Telegram WebApp
 * и сохраняет его на сервере в профиле.
 */
export function requestTelegramContactPermission(userUid: number): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const twa = getTelegramWebApp();
    if (!twa?.requestContact) {
      reject(new Error('Запрос контакта доступен только внутри Telegram Mini App.'));
      return;
    }

    twa.requestContact(async (sent, event) => {
      if (!sent) {
        resolve(null);
        return;
      }
      const phone = event?.responseUnsafe?.contact?.phone_number || '';
      if (!phone) {
        resolve(null);
        return;
      }
      try {
        const jwt = getStoredTwaJwt();
        await fetch('/api/auth/telegram-webapp/contact-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ userUid, phone }),
        });
        resolve(phone);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * Запрашивает геопозицию пользователя через Telegram WebApp
 * и сохраняет координаты на сервере.
 */
export function requestTelegramLocationPermission(
  userUid: number
): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve, reject) => {
    const twa = getTelegramWebApp();
    if (!twa?.requestLocation) {
      reject(new Error('Запрос геолокации доступен только внутри Telegram Mini App.'));
      return;
    }

    twa.requestLocation(async (granted, event) => {
      if (!granted || event?.latitude === undefined || event?.longitude === undefined) {
        resolve(null);
        return;
      }
      const latitude = Number(event.latitude);
      const longitude = Number(event.longitude);
      try {
        const jwt = getStoredTwaJwt();
        await fetch('/api/auth/telegram-webapp/contact-location', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
          },
          body: JSON.stringify({ userUid, latitude, longitude }),
        });
        resolve({ latitude, longitude });
      } catch (e) {
        reject(e);
      }
    });
  });
}

export interface ReferralUserSummary {
  uid: number;
  telegram_id?: string | null;
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  profile_link?: string | null;
  avatar_url?: string | null;
  utm_source?: string | null;
  created_at?: string;
}

export interface ReferralStatsDto {
  botUsername: string;
  telegramId: string | null;
  uid: number;
  tmaReferralLink: string;
  referralRewardBalance: number;
  invitedBy: ReferralUserSummary | null;
  invitedUsers: ReferralUserSummary[];
}

export async function fetchTelegramReferralStats(userUid: number): Promise<ReferralStatsDto | null> {
  try {
    const res = await fetch(`/api/telegram/referrals/${userUid}`);
    const data = await res.json();
    if (!res.ok || !data.success) return null;
    return data as ReferralStatsDto;
  } catch {
    return null;
  }
}
