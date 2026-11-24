import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  ExternalLink,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { AppUser } from '../../../types';
import { saveUserSession } from '../../../services/auth/authService';
import { NoirButton } from '../../common/NoirButton';

interface TelegramConnectCardProps {
  currentUser: AppUser;
  onUserUpdated: (user: AppUser) => void;
  compact?: boolean;
}

export const TelegramConnectCard: React.FC<TelegramConnectCardProps> = ({
  currentUser,
  onUserUpdated,
  compact = false,
}) => {
  const [telegramIdInput, setTelegramIdInput] = useState(currentUser.telegram_id || '');
  const [botUsername, setBotUsername] = useState('@KnigAiNotifyBot');
  const [botUrl, setBotUrl] = useState('');
  const [testing, setTesting] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setTelegramIdInput(currentUser.telegram_id || '');
  }, [currentUser.telegram_id]);

  useEffect(() => {
    let active = true;
    fetch('/api/telegram/bot-info')
      .then((res) => res.json())
      .then((data) => {
        if (!active || !data) return;
        if (data.botUsername) setBotUsername(data.botUsername);
        if (data.botUrl) setBotUrl(data.botUrl);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleVerifyAndBind = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = telegramIdInput.trim();
    if (!cleaned) {
      setFeedback({ type: 'error', text: 'Введите ваш числовой Telegram ID (например, 169262990).' });
      return;
    }

    setTesting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/telegram/test-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUid: currentUser.uid,
          telegramId: cleaned,
        }),
      });
      const data = await res.json();
      if (data.botUsername) setBotUsername(data.botUsername);
      if (data.botUrl) setBotUrl(data.botUrl);

      if (!res.ok || !data.success) {
        const updatedUnverified: AppUser = {
          ...currentUser,
          telegram_id: cleaned,
          telegram_verified: false,
        };
        saveUserSession(updatedUnverified);
        onUserUpdated(updatedUnverified);
        throw new Error(data.error || 'Бот не смог отправить сообщение по этому ID');
      }

      const updatedUser: AppUser = {
        ...currentUser,
        telegram_id: data.telegramId || cleaned,
        telegram_verified: true,
      };
      saveUserSession(updatedUser);
      onUserUpdated(updatedUser);

      setFeedback({
        type: 'ok',
        text: data.message || 'Тестовое сообщение отправлено в Telegram. Доступ подтверждён!',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка проверки Telegram ID',
      });
    } finally {
      setTesting(false);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    setFeedback(null);
    try {
      await fetch('/api/telegram/unlink-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userUid: currentUser.uid }),
      });
      setTelegramIdInput('');
      const updatedUser: AppUser = {
        ...currentUser,
        telegram_id: null,
        telegram_verified: false,
      };
      saveUserSession(updatedUser);
      onUserUpdated(updatedUser);
      setFeedback({
        type: 'ok',
        text: 'Telegram ID отвязан от вашего профиля.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось отвязать Telegram ID',
      });
    } finally {
      setUnlinking(false);
    }
  };

  const isVerified = Boolean(currentUser.telegram_verified && currentUser.telegram_id);

  return (
    <div className="noir-container p-4 sm:p-5 border border-white/40 flex flex-col gap-3.5 text-white text-[14px]">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <Send className="w-5 h-5 text-rose-500 shrink-0" />
          <h3 className="text-[16px] sm:text-[18px] font-bold text-white break-words">
            Уведомления в Telegram
          </h3>
        </div>

        <span
          className={`px-2.5 py-1 border text-[14px] font-mono inline-flex items-center gap-1.5 ${
            isVerified
              ? 'border-rose-500 bg-rose-950/30 text-rose-300'
              : 'border-zinc-700 bg-zinc-950 text-zinc-300'
          }`}
        >
          {isVerified ? (
            <>
              <ShieldCheck className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Подключён и проверен</span>
            </>
          ) : (
            <span>Не подключён</span>
          )}
        </span>
      </div>

      {!compact && (
        <div className="p-3 bg-black/60 border border-zinc-800 text-[14px] text-zinc-300 leading-relaxed flex flex-col gap-2">
          <p className="break-words">
            1. Откройте бота{' '}
            {botUrl ? (
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-rose-400 underline font-mono inline-flex items-center gap-1"
              >
                <span>{botUsername}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <strong className="text-rose-400 font-mono">{botUsername}</strong>
            )}{' '}
            в Telegram и нажмите <strong className="text-white">/start</strong>, чтобы разрешить отправку сообщений.
          </p>
          <p className="break-words">
            2. Узнайте свой числовой ID (например, через <span className="font-mono text-white">@userinfobot</span>), вставьте его ниже и нажмите проверку.
          </p>
        </div>
      )}

      <form onSubmit={handleVerifyAndBind} className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
          <div className="flex-1 flex flex-col gap-1.5 min-w-0">
            <label className="text-[14px] font-bold text-zinc-200">
              Ваш Telegram ID:
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={telegramIdInput}
              onChange={(e) => setTelegramIdInput(e.target.value)}
              placeholder="Например: 169262990"
              className="noir-input w-full min-h-[44px] px-3.5 py-2 text-[14px] font-mono"
            />
          </div>

          <NoirButton
            type="submit"
            variant="primary"
            loading={testing}
            icon={<Check className="w-4 h-4 text-black" />}
            showTail={true}
            className="shrink-0"
          >
            Проверить доступ и отправить тест
          </NoirButton>

          {currentUser.telegram_id && (
            <NoirButton
              type="button"
              variant="subtle"
              onClick={handleUnlink}
              loading={unlinking}
              icon={<Trash2 className="w-4 h-4 text-rose-500" />}
              showTail={true}
              className="shrink-0"
            >
              Отвязать
            </NoirButton>
          )}
        </div>
      </form>

      {feedback && (
        <div
          className={`p-3 border text-[14px] flex items-start gap-2 break-words ${
            feedback.type === 'error'
              ? 'border-rose-500 bg-rose-950/40 text-rose-200'
              : 'border-white/60 bg-white/10 text-white'
          }`}
        >
          {feedback.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          ) : (
            <Check className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          )}
          <span className="min-w-0 flex-1">{feedback.text}</span>
        </div>
      )}
    </div>
  );
};
