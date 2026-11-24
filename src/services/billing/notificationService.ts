import { executePgQuery } from '../db/pgProxy';
import {
  NotificationItem,
  AppRoute,
  NotificationCategoryKey,
  NotificationPreferences,
} from '../../types';
import { getCurrentUser, saveUserSession } from '../auth/authService';

export const NOTIFICATIONS_EVENT = 'knigai_notifications_changed';

export const NOTIFICATION_CATEGORIES: Array<{
  key: NotificationCategoryKey;
  label: string;
  description: string;
}> = [
  {
    key: 'billing',
    label: 'Биллинг и списания',
    description: 'Расходы букв за генерацию, пополнения и операции баланса',
  },
  {
    key: 'generation',
    label: 'Генерация книг и артов',
    description: 'Завершение глав, каскадов, персонажей и иллюстраций',
  },
  {
    key: 'import',
    label: 'Импорт и Флибуста',
    description: 'Распознавание загруженных книг и метаданных',
  },
  {
    key: 'remix',
    label: 'Редактура и ремейки',
    description: 'Улучшение, переделка и сиквелы/приквелы книг',
  },
  {
    key: 'bonus',
    label: 'Бонусы и рефералы',
    description: 'Стартовые бонусы и награды за приглашённых друзей',
  },
  {
    key: 'system',
    label: 'Системные события',
    description: 'Статус аккаунта, проверки доступа и сервисные оповещения',
  },
];

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  billing: { bell: true, telegram: true, push: true },
  generation: { bell: true, telegram: true, push: true },
  import: { bell: true, telegram: true, push: true },
  remix: { bell: true, telegram: true, push: true },
  bonus: { bell: true, telegram: true, push: true },
  system: { bell: true, telegram: true, push: true },
};

export function normalizeNotificationPrefs(raw: unknown): NotificationPreferences {
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

  const out: Partial<NotificationPreferences> = {};
  for (const cat of NOTIFICATION_CATEGORIES) {
    const item = obj[cat.key] as Record<string, unknown> | undefined;
    out[cat.key] = {
      bell: typeof item?.bell === 'boolean' ? item.bell : true,
      telegram: typeof item?.telegram === 'boolean' ? item.telegram : true,
      push: typeof item?.push === 'boolean' ? item.push : true,
    };
  }
  return out as NotificationPreferences;
}

export async function fetchNotificationPrefs(userUid: number): Promise<NotificationPreferences> {
  try {
    const res = await fetch(`/api/notifications/preferences/${userUid}`);
    const data = await res.json();
    if (res.ok && data?.preferences) {
      return normalizeNotificationPrefs(data.preferences);
    }
  } catch {
    // fallback below
  }
  const current = getCurrentUser();
  return normalizeNotificationPrefs(current?.notification_prefs);
}

export async function saveNotificationPrefs(
  userUid: number,
  preferences: NotificationPreferences
): Promise<NotificationPreferences> {
  const normalized = normalizeNotificationPrefs(preferences);
  try {
    const res = await fetch(`/api/notifications/preferences/${userUid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferences: normalized }),
    });
    const data = await res.json();
    const finalPrefs = data?.preferences
      ? normalizeNotificationPrefs(data.preferences)
      : normalized;
    const current = getCurrentUser();
    if (current && Number(current.uid) === Number(userUid)) {
      saveUserSession({ ...current, notification_prefs: finalPrefs });
    }
    return finalPrefs;
  } catch {
    await executePgQuery(
      `UPDATE users SET notification_prefs = $1::jsonb WHERE uid = $2;`,
      [JSON.stringify(normalized), userUid]
    ).catch(() => {});
    const current = getCurrentUser();
    if (current && Number(current.uid) === Number(userUid)) {
      saveUserSession({ ...current, notification_prefs: normalized });
    }
    return normalized;
  }
}

function dispatchNotificationsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_EVENT));
  }
}

async function resolveUserPrefsForNotify(userUid: number): Promise<NotificationPreferences> {
  const current = getCurrentUser();
  if (current && Number(current.uid) === Number(userUid) && current.notification_prefs) {
    return normalizeNotificationPrefs(current.notification_prefs);
  }
  try {
    const res = await executePgQuery<{ notification_prefs?: unknown }>(
      `SELECT notification_prefs FROM users WHERE uid = $1 LIMIT 1;`,
      [userUid]
    );
    return normalizeNotificationPrefs(res.rows[0]?.notification_prefs);
  } catch {
    return DEFAULT_NOTIFICATION_PREFS;
  }
}

export async function createNotification(params: {
  userUid: number;
  type: NotificationItem['type'];
  title: string;
  message: string;
  link?: AppRoute | string | null;
}): Promise<NotificationItem | null> {
  try {
    const prefs = await resolveUserPrefsForNotify(params.userUid);
    const channelCfg = prefs[params.type] || { bell: true, telegram: true, push: true };

    let createdItem: NotificationItem | null = null;
    if (channelCfg.bell !== false) {
      const res = await executePgQuery<NotificationItem>(
        `INSERT INTO notifications (user_uid, type, title, message, is_read, link)
         VALUES ($1, $2, $3, $4, false, $5)
         RETURNING id, user_uid, type, title, message, is_read, link, created_at;`,
        [params.userUid, params.type, params.title, params.message, params.link || null]
      );
      createdItem = res.rows[0] || null;
      dispatchNotificationsChanged();
    }

    // Forward notification asynchronously to user's Telegram ID via active server proxy (if Telegram channel enabled)
    if (channelCfg.telegram !== false && typeof fetch !== 'undefined') {
      fetch('/api/telegram/notify-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUid: params.userUid,
          type: params.type,
          title: params.title,
          message: params.message,
          link: params.link || null,
        }),
      }).catch(() => {});
    }

    // Forward notification asynchronously to user's subscribed PWA devices via Web Push
    if (channelCfg.push !== false && typeof fetch !== 'undefined') {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUid: params.userUid,
          type: params.type,
          title: params.title,
          message: params.message,
          link: params.link || null,
        }),
      }).catch(() => {});
    }

    return createdItem;
  } catch (err) {
    console.warn('Failed to create notification:', err);
    return null;
  }
}

export async function fetchNotifications(userUid: number, unreadOnly = false): Promise<NotificationItem[]> {
  try {
    const sql = unreadOnly
      ? `SELECT id, user_uid, type, title, message, is_read, link, created_at
         FROM notifications WHERE user_uid = $1 AND is_read = false
         ORDER BY id DESC LIMIT 100;`
      : `SELECT id, user_uid, type, title, message, is_read, link, created_at
         FROM notifications WHERE user_uid = $1
         ORDER BY id DESC LIMIT 100;`;
    const res = await executePgQuery<NotificationItem>(sql, [userUid]);
    return res.rows || [];
  } catch (err) {
    console.warn('Failed to fetch notifications:', err);
    return [];
  }
}

export async function getUnreadNotificationsCount(userUid: number): Promise<number> {
  try {
    const res = await executePgQuery<{ count: string }>(
      'SELECT COUNT(*) as count FROM notifications WHERE user_uid = $1 AND is_read = false;',
      [userUid]
    );
    return parseInt(res.rows[0]?.count || '0', 10) || 0;
  } catch {
    return 0;
  }
}

export async function markNotificationRead(notificationId: number, userUid: number): Promise<void> {
  try {
    await executePgQuery(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_uid = $2;',
      [notificationId, userUid]
    );
    dispatchNotificationsChanged();
  } catch (err) {
    console.warn('Failed to mark notification read:', err);
  }
}

export async function markAllNotificationsRead(userUid: number): Promise<void> {
  try {
    await executePgQuery(
      'UPDATE notifications SET is_read = true WHERE user_uid = $1 AND is_read = false;',
      [userUid]
    );
    dispatchNotificationsChanged();
  } catch (err) {
    console.warn('Failed to mark all notifications read:', err);
  }
}
