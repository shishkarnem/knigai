import type { Express, Request, Response } from 'express';
import { QueryPgFn } from '../backup/backupTypes';
import { getTelegramBotConfig } from './telegramService';
import {
  authenticateOrRegisterTelegramUser,
  DEFAULT_NOTIFICATION_PREFS,
  getJwtSecret,
  normalizeNotificationPrefsServer,
  verifyJwtToken,
} from './telegramWebAppAuth';

export function registerTelegramWebAppRoutes(app: Express, queryPg: QueryPgFn): void {
  // 1. Автоматическая регистрация / вход через Telegram Mini App (строгий HMAC-SHA256 + JWT)
  app.post('/api/auth/telegram-webapp', async (req: Request, res: Response) => {
    try {
      const initData = String(req.body?.initData || '').trim();
      if (!initData) {
        return res.status(400).json({
          success: false,
          error: 'initData отсутствует. Откройте приложение внутри Telegram.',
        });
      }

      const result = await authenticateOrRegisterTelegramUser({
        queryPg,
        initData,
      });

      // Устанавливаем безопасную cookie-сессию с JWT (дополнительно к localStorage)
      res.cookie('knigai_twa_jwt', result.token, {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        sameSite: 'lax',
        path: '/',
      });

      res.json({
        success: true,
        token: result.token,
        user: result.user,
        isNewUser: result.isNewUser,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isAuthErr = msg.toLowerCase().includes('invalid initdata');
      res.status(isAuthErr ? 401 : 500).json({
        success: false,
        error: msg,
      });
    }
  });

  // 2. Сохранение телефона (requestContact) или геопозиции (requestLocation) из TWA
  app.post('/api/auth/telegram-webapp/contact-location', async (req: Request, res: Response) => {
    try {
      const authHeader = String(req.headers.authorization || '');
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      let targetUid = Number(req.body?.userUid || 0);

      if (bearerToken) {
        const config = await getTelegramBotConfig(queryPg);
        const jwtPayload = verifyJwtToken(bearerToken, getJwtSecret(config.botToken));
        if (jwtPayload?.uid) {
          targetUid = Number(jwtPayload.uid);
        }
      }

      if (!targetUid) {
        return res.status(401).json({ success: false, error: 'Пользователь не авторизован' });
      }

      const phone = req.body?.phone !== undefined ? String(req.body.phone).trim() : undefined;
      const lat =
        req.body?.latitude !== undefined && req.body?.latitude !== null
          ? Number(req.body.latitude)
          : undefined;
      const lon =
        req.body?.longitude !== undefined && req.body?.longitude !== null
          ? Number(req.body.longitude)
          : undefined;

      const updated = await queryPg<Record<string, unknown>>(
        `UPDATE users
         SET phone = COALESCE($1, phone),
             latitude = COALESCE($2, latitude),
             longitude = COALESCE($3, longitude)
         WHERE uid = $4
         RETURNING uid, phone, latitude, longitude;`,
        [
          phone || null,
          lat !== undefined && Number.isFinite(lat) ? lat : null,
          lon !== undefined && Number.isFinite(lon) ? lon : null,
          targetUid,
        ]
      );

      res.json({
        success: true,
        user: updated.rows[0] || null,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 3. Реферальная система: ссылка Mini App, пригласивший и список приглашенных
  app.get('/api/telegram/referrals/:uid', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.params.uid);
      if (!userUid) {
        return res.status(400).json({ success: false, error: 'Некорректный UID' });
      }

      const config = await getTelegramBotConfig(queryPg);
      const botHandle = (config.botUsername || '@Knig_AI').replace(/^@+/, '');

      const userRes = await queryPg<{
        uid: number;
        telegram_id?: string | null;
        referred_by?: string | null;
        referred_by_uid?: number | null;
        referral_reward_balance?: number | string | null;
      }>(
        `SELECT uid, telegram_id, referred_by, referred_by_uid, referral_reward_balance
         FROM users WHERE uid = $1 LIMIT 1;`,
        [userUid]
      );
      const me = userRes.rows[0];
      if (!me) {
        return res.status(404).json({ success: false, error: 'Пользователь не найден' });
      }

      const refCode = me.telegram_id ? String(me.telegram_id).trim() : String(me.uid);
      const tmaReferralLink = `https://t.me/${botHandle}/app?startapp=${encodeURIComponent(refCode)}`;

      // Информация о пригласившем
      let invitedBy: Record<string, unknown> | null = null;
      if (me.referred_by_uid || me.referred_by) {
        const invRes = await queryPg<{
          uid: number;
          telegram_id?: string | null;
          name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          username?: string | null;
          profile_link?: string | null;
          avatar_url?: string | null;
        }>(
          `SELECT uid, telegram_id, name, first_name, last_name, username, profile_link, avatar_url
           FROM users
           WHERE ($1::bigint IS NOT NULL AND uid = $1)
              OR ($2::text IS NOT NULL AND telegram_id = $2)
           LIMIT 1;`,
          [me.referred_by_uid || null, me.referred_by || null]
        );
        if (invRes.rows[0]) {
          invitedBy = {
            ...invRes.rows[0],
            uid: Number(invRes.rows[0].uid),
          };
        }
      }

      // Список приглашенных пользователей (по telegram_id ИЛИ uid)
      const invitedRes = await queryPg<{
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
      }>(
        `SELECT uid, telegram_id, name, first_name, last_name, username, profile_link, avatar_url, utm_source, created_at
         FROM users
         WHERE referred_by_uid = $1
            OR ($2::text IS NOT NULL AND referred_by = $2)
            OR referred_by = $3
         ORDER BY created_at DESC
         LIMIT 100;`,
        [userUid, me.telegram_id || null, String(userUid)]
      );

      res.json({
        success: true,
        botUsername: `@${botHandle}`,
        telegramId: me.telegram_id || null,
        uid: Number(me.uid),
        tmaReferralLink,
        referralRewardBalance: Number(me.referral_reward_balance || 0),
        invitedBy,
        invitedUsers: (invitedRes.rows || []).map((r) => ({
          ...r,
          uid: Number(r.uid),
        })),
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4. Получение и обновление настроек каналов уведомлений (Колокольчик / Telegram)
  app.get('/api/notifications/preferences/:uid', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.params.uid);
      if (!userUid) {
        return res.json({ success: true, preferences: DEFAULT_NOTIFICATION_PREFS });
      }
      const uRes = await queryPg<{ notification_prefs?: unknown }>(
        `SELECT notification_prefs FROM users WHERE uid = $1 LIMIT 1;`,
        [userUid]
      );
      const prefs = normalizeNotificationPrefsServer(uRes.rows[0]?.notification_prefs);
      res.json({ success: true, preferences: prefs });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.put('/api/notifications/preferences/:uid', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.params.uid);
      if (!userUid) {
        return res.status(400).json({ success: false, error: 'Некорректный UID' });
      }
      const normalized = normalizeNotificationPrefsServer(req.body?.preferences);
      await queryPg(
        `UPDATE users SET notification_prefs = $1::jsonb WHERE uid = $2;`,
        [JSON.stringify(normalized), userUid]
      );
      res.json({ success: true, preferences: normalized });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
