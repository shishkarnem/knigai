import type { Express, Request, Response } from 'express';
import { QueryPgFn } from '../backup/backupTypes';
import { runAndRecordBackup } from '../backup/backupRoutes';
import {
  cleanTelegramBaseUrl,
  formatTelegramErrorForUser,
  getTelegramBotConfig,
  isMaskedToken,
  maskBotToken,
  normalizeBotUsername,
  PROXY_PRESETS,
  saveTelegramBotConfig,
  sendTelegramMessage,
  TelegramProxyType,
  verifyTelegramBotViaProxy,
} from './telegramService';
import { normalizeNotificationPrefsServer } from './telegramWebAppAuth';

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TYPE_META_TG: Record<string, { icon: string; label: string }> = {
  billing: { icon: '🪙', label: 'Биллинг' },
  generation: { icon: '✨', label: 'Генерация' },
  import: { icon: '📥', label: 'Импорт' },
  remix: { icon: '🔄', label: 'Ремикс' },
  bonus: { icon: '🎁', label: 'Бонус' },
  system: { icon: '🔔', label: 'Система' },
};

export function registerTelegramRoutes(app: Express, queryPg: QueryPgFn): void {
  // 1. Admin GET bot & proxy settings (NEVER sends raw botToken to browser)
  app.get('/api/admin/bot-settings', async (_req: Request, res: Response) => {
    try {
      const config = await getTelegramBotConfig(queryPg);
      const rawToken = config.botToken || '';
      res.json({
        success: true,
        botUsername: config.botUsername,
        proxyType: config.proxyType || 'dialog_ai',
        apiBaseUrl: config.apiBaseUrl,
        adminTelegramId: config.adminTelegramId,
        isTokenConfigured: Boolean(rawToken),
        maskedToken: maskBotToken(rawToken),
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 2. Admin POST save proxy & bot settings (preserves raw token if mask or empty passed)
  app.post('/api/admin/bot-settings', async (req: Request, res: Response) => {
    try {
      const { botToken, botUsername, proxyType, apiBaseUrl, adminTelegramId } = req.body || {};
      const current = await getTelegramBotConfig(queryPg);

      const resolvedProxyType: TelegramProxyType =
        proxyType === 'custom_cloudflare' || proxyType === 'direct' || proxyType === 'dialog_ai'
          ? proxyType
          : current.proxyType;

      let resolvedBaseUrl = PROXY_PRESETS.dialog_ai;
      if (resolvedProxyType === 'direct') {
        resolvedBaseUrl = PROXY_PRESETS.direct;
      } else if (resolvedProxyType === 'custom_cloudflare') {
        resolvedBaseUrl = cleanTelegramBaseUrl(String(apiBaseUrl || current.apiBaseUrl || ''));
      }

      const finalToken =
        !botToken || isMaskedToken(String(botToken))
          ? current.botToken
          : String(botToken).trim();

      let detectedUsername = botUsername ? normalizeBotUsername(String(botUsername)) : current.botUsername;

      // Auto-resolve real @botUsername via active proxy when token changes or username wasn't customized
      if (finalToken) {
        const probe = await verifyTelegramBotViaProxy({
          botToken: finalToken,
          apiBaseUrl: resolvedBaseUrl,
        });
        if (probe.ok && probe.username) {
          detectedUsername = normalizeBotUsername(probe.username);
        }
      }

      const saved = await saveTelegramBotConfig(queryPg, {
        botToken: finalToken,
        botUsername: detectedUsername,
        proxyType: resolvedProxyType,
        apiBaseUrl: resolvedBaseUrl,
        adminTelegramId:
          adminTelegramId !== undefined && String(adminTelegramId).trim()
            ? String(adminTelegramId).trim()
            : current.adminTelegramId,
      });

      res.json({
        success: true,
        message: 'Настройки прокси и Telegram-бота успешно сохранены',
        config: {
          botUsername: saved.botUsername,
          proxyType: saved.proxyType,
          apiBaseUrl: saved.apiBaseUrl,
          adminTelegramId: saved.adminTelegramId,
          isTokenConfigured: Boolean(saved.botToken),
          maskedToken: maskBotToken(saved.botToken),
        },
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 3. Admin test proxy + bot + admin message delivery
  app.post('/api/admin/bot-settings/test', async (req: Request, res: Response) => {
    try {
      const config = await getTelegramBotConfig(queryPg);
      const overrideProxyType = req.body?.proxyType as TelegramProxyType | undefined;
      const overrideCustomUrl = req.body?.apiBaseUrl as string | undefined;
      const overrideToken = req.body?.botToken as string | undefined;
      const targetChatId = String(req.body?.adminTelegramId || config.adminTelegramId || '').trim();

      const resolvedToken =
        overrideToken && !isMaskedToken(overrideToken) ? overrideToken.trim() : config.botToken;

      let resolvedBase = config.apiBaseUrl;
      if (overrideProxyType === 'dialog_ai') resolvedBase = PROXY_PRESETS.dialog_ai;
      else if (overrideProxyType === 'direct') resolvedBase = PROXY_PRESETS.direct;
      else if (overrideProxyType === 'custom_cloudflare') {
        resolvedBase = cleanTelegramBaseUrl(overrideCustomUrl || '');
      }

      const me = await verifyTelegramBotViaProxy({
        botToken: resolvedToken,
        apiBaseUrl: resolvedBase,
      });
      if (!me.ok) {
        return res.status(400).json({
          success: false,
          error: `Проверка бота через шлюз не удалась: ${me.error}`,
        });
      }

      if (me.username) {
        await saveTelegramBotConfig(queryPg, {
          botUsername: normalizeBotUsername(me.username),
        });
      }

      if (!targetChatId) {
        return res.json({
          success: true,
          botUsername: normalizeBotUsername(me.username),
          usedFallback: Boolean(me.usedFallback),
          message: `Бот @${me.username} отвечает через шлюз.`,
        });
      }

      const testText = [
        `🛡️ <b>KnigAI Proxy Gateway — Тест связи</b>`,
        `🤖 Бот: @${escapeHtml(me.username || 'bot')}`,
        `🌐 Шлюз: <code>${escapeHtml(resolvedBase)}</code>`,
        `✅ Доставка уведомлений и бэкапов работает стабильно.`,
      ].join('\n');

      const sendRes = await sendTelegramMessage({
        chatId: targetChatId,
        text: testText,
        botToken: resolvedToken,
        apiBaseUrl: resolvedBase,
      });

      if (!sendRes.ok) {
        return res.status(400).json({
          success: false,
          botUsername: normalizeBotUsername(me.username),
          error: formatTelegramErrorForUser(sendRes.error || '', me.username),
        });
      }

      res.json({
        success: true,
        botUsername: normalizeBotUsername(me.username),
        usedFallback: Boolean(sendRes.usedFallback),
        message: `Тестовое сообщение доставлено админу (${targetChatId}) от @${me.username || 'bot'}${
          sendRes.usedFallback ? ' (через прямой fallback)' : ' (через прокси)'
        }.`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4. Quick manual backup trigger compatible with skill endpoint
  app.post('/api/admin/backup/trigger', async (_req: Request, res: Response) => {
    try {
      const result = await runAndRecordBackup({
        queryPg,
        format: 'all',
        includeZip: true,
        reason: 'Ручной запуск через прокси-шлюз из Панели Администратора',
        sendToTelegram: true,
      });
      res.json({
        success: result.record.status === 'completed' && result.record.telegram_sent,
        totalRows: result.record.total_rows,
        tablesCount: result.record.total_tables,
        filename: result.filename,
        telegramSent: result.record.telegram_sent,
        error: result.record.error_message || undefined,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Public safe bot info for user Profile / Notifications (NEVER exposes token!)
  app.get('/api/telegram/bot-info', async (_req: Request, res: Response) => {
    try {
      const config = await getTelegramBotConfig(queryPg);
      let botUsername = config.botUsername;

      // Lazy-resolve real username from Telegram via proxy if still placeholder
      if (config.botToken && (!botUsername || botUsername === '@KnigAiNotifyBot')) {
        const me = await verifyTelegramBotViaProxy({
          botToken: config.botToken,
          apiBaseUrl: config.apiBaseUrl,
        });
        if (me.ok && me.username) {
          botUsername = normalizeBotUsername(me.username);
          await saveTelegramBotConfig(queryPg, { botUsername });
        }
      }

      const cleanHandle = botUsername.replace(/^@+/, '');
      res.json({
        success: true,
        isConfigured: Boolean(config.botToken),
        botUsername,
        botUrl: cleanHandle ? `https://t.me/${cleanHandle}` : '',
        proxyType: config.proxyType,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 6. User Profile: Test bot access for a given Telegram ID and bind it to user profile if reachable
  app.post('/api/telegram/test-user', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid);
      const rawTelegramId = String(req.body?.telegramId || '').trim();

      if (!rawTelegramId || !/^-?\d{5,20}$/.test(rawTelegramId)) {
        return res.status(400).json({
          success: false,
          error: 'Telegram ID должен состоять из цифр (например, 169262990). Его можно узнать у @userinfobot.',
        });
      }

      const config = await getTelegramBotConfig(queryPg);
      if (!config.botToken) {
        return res.status(503).json({
          success: false,
          error: 'Telegram-бот ещё не настроен администратором.',
        });
      }

      let botUsername = config.botUsername;
      const me = await verifyTelegramBotViaProxy({ queryPg });
      if (me.ok && me.username) {
        botUsername = normalizeBotUsername(me.username);
        if (botUsername !== config.botUsername) {
          await saveTelegramBotConfig(queryPg, { botUsername });
        }
      }

      const testText = [
        `🔔 <b>KnigAI — Проверка доступа подтверждена!</b>`,
        ``,
        `Ваш Telegram ID <code>${escapeHtml(rawTelegramId)}</code> успешно подключён к личному кабинету.`,
        `Теперь уведомления о генерации глав, импорте, бонусах и балансе букв будут приходить сюда автоматически.`,
      ].join('\n');

      const sent = await sendTelegramMessage({
        queryPg,
        chatId: rawTelegramId,
        text: testText,
      });

      if (!sent.ok) {
        if (userUid > 0) {
          await queryPg(
            `UPDATE users SET telegram_id = $1, telegram_verified = false WHERE uid = $2;`,
            [rawTelegramId, userUid]
          ).catch(() => {});
        }
        return res.status(400).json({
          success: false,
          botUsername,
          botUrl: botUsername ? `https://t.me/${botUsername.replace(/^@+/, '')}` : '',
          error: formatTelegramErrorForUser(sent.error || '', botUsername),
        });
      }

      if (userUid > 0) {
        await queryPg(
          `UPDATE users SET telegram_id = $1, telegram_verified = true WHERE uid = $2;`,
          [rawTelegramId, userUid]
        );
      }

      res.json({
        success: true,
        telegramId: rawTelegramId,
        telegramVerified: true,
        botUsername,
        usedFallback: Boolean(sent.usedFallback),
        message: `Тестовое сообщение успешно отправлено в Telegram (${rawTelegramId}) через ${
          sent.usedFallback ? 'резервный канал' : 'прокси-шлюз'
        }. Доступ подтверждён!`,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 7. User Profile: Unlink Telegram ID cleanly
  app.post('/api/telegram/unlink-user', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid);
      if (userUid > 0) {
        await queryPg(
          `UPDATE users SET telegram_id = NULL, telegram_verified = false WHERE uid = $1;`,
          [userUid]
        );
      }
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 8. Forward personal user notification to their linked Telegram ID via active proxy
  app.post('/api/telegram/notify-user', async (req: Request, res: Response) => {
    try {
      const userUid = Number(req.body?.userUid);
      const title = String(req.body?.title || '').trim();
      const message = String(req.body?.message || '').trim();
      const type = String(req.body?.type || 'system').trim();

      if (!userUid || !title) {
        return res.json({ success: false, skipped: true, reason: 'missing_params' });
      }

      const userRes = await queryPg<{
        telegram_id?: string | null;
        telegram_verified?: boolean;
        notification_prefs?: unknown;
      }>(
        `SELECT telegram_id, telegram_verified, notification_prefs FROM users WHERE uid = $1 LIMIT 1;`,
        [userUid]
      );
      const row = userRes.rows[0];
      const telegramId = row?.telegram_id ? String(row.telegram_id).trim() : '';

      if (!telegramId) {
        return res.json({ success: true, skipped: true, reason: 'no_telegram_id' });
      }

      const prefs = normalizeNotificationPrefsServer(row?.notification_prefs);
      const catKey = (type in prefs ? type : 'system') as keyof typeof prefs;
      if (prefs[catKey]?.telegram === false) {
        return res.json({ success: true, skipped: true, reason: 'disabled_by_user' });
      }

      const meta = TYPE_META_TG[type] || TYPE_META_TG.system;
      const formattedText = [
        `${meta.icon} <b>${escapeHtml(title)}</b>`,
        `<i>Раздел: ${escapeHtml(meta.label)}</i>`,
        '',
        escapeHtml(message),
      ].join('\n');

      const sent = await sendTelegramMessage({
        queryPg,
        chatId: telegramId,
        text: formattedText,
      });

      res.json({
        success: sent.ok,
        delivered: sent.ok,
        usedFallback: Boolean(sent.usedFallback),
        error: sent.error,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
