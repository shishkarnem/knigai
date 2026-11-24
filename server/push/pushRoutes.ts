import type { Express, Request, Response } from 'express';
import { createRequire } from 'module';
import type * as WebPushLib from 'web-push';
import { QueryPgFn } from '../backup/backupTypes';
import { normalizeNotificationPrefsServer } from '../telegram/telegramWebAppAuth';

const require = createRequire(import.meta.url);
const webpush = require('web-push') as typeof WebPushLib;

interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

let cachedVapid: VapidKeys | null = null;

function xmlSafeMailto(): string {
  return process.env.VAPID_SUBJECT || 'mailto:info@arenda-ropa.com';
}

export async function ensurePushSchema(queryPg: QueryPgFn): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_uid BIGINT NOT NULL,
      endpoint TEXT UNIQUE NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      platform TEXT DEFAULT 'web',
      user_agent TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      last_used_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_uid ON push_subscriptions (user_uid);`,
  ];
  for (const sql of statements) {
    try {
      await queryPg(sql);
    } catch (err) {
      console.warn('[KnigAI Push] Schema notice:', err instanceof Error ? err.message : String(err));
    }
  }
}

export async function getOrInitVapidKeys(queryPg: QueryPgFn): Promise<VapidKeys> {
  if (cachedVapid) return cachedVapid;

  const envPub = process.env.VAPID_PUBLIC_KEY?.trim();
  const envPriv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (envPub && envPriv) {
    cachedVapid = { publicKey: envPub, privateKey: envPriv };
    webpush.setVapidDetails(xmlSafeMailto(), cachedVapid.publicKey, cachedVapid.privateKey);
    return cachedVapid;
  }

  try {
    const res = await queryPg<{ value: VapidKeys }>(
      `SELECT value FROM app_settings WHERE key = 'web_push_vapid' LIMIT 1;`
    );
    const existing = res.rows[0]?.value;
    if (existing?.publicKey && existing?.privateKey) {
      cachedVapid = existing;
      webpush.setVapidDetails(xmlSafeMailto(), cachedVapid.publicKey, cachedVapid.privateKey);
      return cachedVapid;
    }
  } catch (err) {
    console.warn('[KnigAI Push] Reading VAPID from DB failed:', err);
  }

  const generated = webpush.generateVAPIDKeys();
  cachedVapid = { publicKey: generated.publicKey, privateKey: generated.privateKey };

  try {
    await queryPg(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ('web_push_vapid', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();`,
      [JSON.stringify(cachedVapid)]
    );
  } catch (err) {
    console.warn('[KnigAI Push] Persisting VAPID in DB failed:', err);
  }

  webpush.setVapidDetails(xmlSafeMailto(), cachedVapid.publicKey, cachedVapid.privateKey);
  return cachedVapid;
}

export async function sendWebPushToUser(
  queryPg: QueryPgFn,
  params: {
    userUid: number;
    title: string;
    body: string;
    url?: string | null;
    tag?: string;
  }
): Promise<{ sent: number; failed: number }> {
  const keys = await getOrInitVapidKeys(queryPg);
  webpush.setVapidDetails(xmlSafeMailto(), keys.publicKey, keys.privateKey);

  const subRes = await queryPg<{
    id: number;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_uid = $1 ORDER BY id DESC LIMIT 12;`,
    [params.userUid]
  );

  const subs = subRes.rows || [];
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const payload = JSON.stringify({
    title: params.title || 'KnigAI',
    body: params.body || 'Новое событие в вашем кабинете автора',
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: params.url || '/',
    tag: params.tag || 'knigai-notification',
  });

  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      );
      sent++;
      await queryPg(`UPDATE push_subscriptions SET last_used_at = now() WHERE id = $1;`, [sub.id]).catch(
        () => {}
      );
    } catch (err: any) {
      failed++;
      const statusCode = Number(err?.statusCode || 0);
      if (statusCode === 404 || statusCode === 410) {
        await queryPg(`DELETE FROM push_subscriptions WHERE id = $1;`, [sub.id]).catch(() => {});
      }
    }
  }

  return { sent, failed };
}

export function registerPushRoutes(app: Express, queryPg: QueryPgFn): void {
  // 1. Public VAPID Key
  app.get('/api/push/vapid-public-key', async (_req: Request, res: Response) => {
    try {
      const keys = await getOrInitVapidKeys(queryPg);
      res.json({ success: true, publicKey: keys.publicKey });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2. Registered Devices Status for User
  app.get('/api/push/status/:uid', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.params.uid);
      if (!userUid) {
        return res.json({ success: true, count: 0, devices: [] });
      }
      const rowsRes = await queryPg<{
        id: number;
        platform: string;
        user_agent: string;
        created_at: string;
        last_used_at: string;
      }>(
        `SELECT id, platform, user_agent, created_at, last_used_at
         FROM push_subscriptions
         WHERE user_uid = $1
         ORDER BY id DESC LIMIT 20;`,
        [userUid]
      );
      res.json({
        success: true,
        count: rowsRes.rows?.length || 0,
        devices: rowsRes.rows || [],
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 3. Subscribe Device
  app.post('/api/push/subscribe', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid);
      const sub = req.body?.subscription;
      const endpoint = String(sub?.endpoint || '').trim();
      const p256dh = String(sub?.keys?.p256dh || '').trim();
      const auth = String(sub?.keys?.auth || '').trim();
      const platform = String(req.body?.platform || 'web').slice(0, 64);
      const userAgent = String(req.body?.userAgent || req.headers['user-agent'] || '').slice(0, 250);

      if (!userUid || !endpoint || !p256dh || !auth) {
        return res.status(400).json({
          success: false,
          error: 'Некорректные данные Web Push подписки',
        });
      }

      await queryPg(
        `INSERT INTO push_subscriptions (user_uid, endpoint, p256dh, auth, platform, user_agent, last_used_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         ON CONFLICT (endpoint) DO UPDATE SET
           user_uid = EXCLUDED.user_uid,
           p256dh = EXCLUDED.p256dh,
           auth = EXCLUDED.auth,
           platform = EXCLUDED.platform,
           user_agent = EXCLUDED.user_agent,
           last_used_at = now();`,
        [userUid, endpoint, p256dh, auth, platform, userAgent]
      );

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4. Unsubscribe Device
  app.post('/api/push/unsubscribe', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid || 0);
      const endpoint = String(req.body?.endpoint || '').trim();
      if (endpoint) {
        await queryPg(`DELETE FROM push_subscriptions WHERE endpoint = $1;`, [endpoint]);
      } else if (userUid) {
        await queryPg(`DELETE FROM push_subscriptions WHERE user_uid = $1;`, [userUid]);
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Send Category Notification Push (honors notification_prefs[type].push)
  app.post('/api/push/send', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid);
      const type = String(req.body?.type || 'system');
      const title = String(req.body?.title || 'KnigAI');
      const message = String(req.body?.message || '');
      const link = req.body?.link ? String(req.body.link) : '/';

      if (!userUid) {
        return res.status(400).json({ success: false, error: 'Missing userUid' });
      }

      const uRes = await queryPg<{ notification_prefs?: unknown }>(
        `SELECT notification_prefs FROM users WHERE uid = $1 LIMIT 1;`,
        [userUid]
      );
      const prefs = normalizeNotificationPrefsServer(uRes.rows[0]?.notification_prefs);
      const catPref = (prefs as Record<string, { bell: boolean; telegram: boolean; push: boolean }>)[type];
      if (catPref && catPref.push === false) {
        return res.json({ success: true, skipped: true, reason: 'push_disabled_by_user' });
      }

      const result = await sendWebPushToUser(queryPg, {
        userUid,
        title,
        body: message,
        url: link.startsWith('/') ? link : `/?route=${encodeURIComponent(link)}`,
        tag: `knigai-${type}`,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 6. Test Push Button Endpoint
  app.post('/api/push/test', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid);
      if (!userUid) {
        return res.status(400).json({ success: false, error: 'Missing userUid' });
      }
      const result = await sendWebPushToUser(queryPg, {
        userUid,
        title: 'KnigAI — Проверка Push-уведомлений',
        body: 'Устройство подключено! Уведомления о главах, балансе и событиях будут приходить мгновенно.',
        url: '/?route=notifications',
        tag: 'knigai-test-push',
      });
      res.json({ success: true, ...result });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
