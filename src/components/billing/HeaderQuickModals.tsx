import React, { useEffect, useState } from 'react';
import { Bell, CheckCheck, Coins, ArrowRight, Sparkles, Clock } from 'lucide-react';
import { AppRoute, NotificationItem } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import {
  BASE_LETTERS_PACK,
  BASE_LETTERS_PRICE_RUB,
  formatLettersCount,
} from '../../services/billing/costCalculator';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../../services/billing/notificationService';

interface HeaderBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance: number;
  onGoToBalance: () => void;
}

export const HeaderBalanceModal: React.FC<HeaderBalanceModalProps> = ({
  isOpen,
  onClose,
  balance,
  onGoToBalance,
}) => {
  const approxRub = ((balance / BASE_LETTERS_PACK) * BASE_LETTERS_PRICE_RUB).toFixed(2);

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Баланс Букв автора"
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        <div className="p-4 bg-zinc-950/80 border border-rose-500/70 flex flex-col gap-2 rounded-none">
          <div className="flex items-center gap-2 text-[14px] text-zinc-300">
            <Coins className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Доступный остаток на счёте:</span>
          </div>
          <div className="text-[26px] sm:text-[30px] font-mono font-black text-white leading-tight break-words">
            {balance.toLocaleString('ru-RU')} <span className="text-rose-400">букв</span>
          </div>
          <div className="text-[14px] font-mono text-zinc-400">
            Эквивалент по базовому тарифу: ≈ {approxRub} ₽ ({formatLettersCount(BASE_LETTERS_PACK)} букв = {BASE_LETTERS_PRICE_RUB} ₽)
          </div>
        </div>

        <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 flex flex-col gap-1.5 text-[14px] text-zinc-300 rounded-none">
          <div className="flex items-center gap-2 font-bold text-white">
            <Sparkles className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Прозрачный расход: 1 токен ИИ = 1 Буква</span>
          </div>
          <p className="leading-relaxed">
            Буквы списываются только за генерацию текста и иллюстраций. Ручное редактирование, голосовая диктовка, редактор обложки А5, 3D-читалка и экспорт PDF всегда бесплатны.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
          <NoirButton type="button" variant="subtle" onClick={onClose}>
            Закрыть
          </NoirButton>
          <NoirButton
            type="button"
            variant="primary"
            onClick={() => {
              onClose();
              onGoToBalance();
            }}
            icon={<ArrowRight className="w-4 h-4 text-black" />}
          >
            Пополнить и история
          </NoirButton>
        </div>
      </div>
    </NoirModal>
  );
};

interface HeaderNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userUid?: number;
  onNavigate: (route: AppRoute) => void;
}

export const HeaderNotificationsModal: React.FC<HeaderNotificationsModalProps> = ({
  isOpen,
  onClose,
  userUid,
  onNavigate,
}) => {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !userUid) return;
    let active = true;
    setLoading(true);
    fetchNotifications(userUid, false)
      .then((list) => {
        if (active) setItems(list.slice(0, 12));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isOpen, userUid]);

  const unreadTotal = items.filter((n) => !n.is_read).length;

  const handleMarkAll = async () => {
    if (!userUid) return;
    await markAllNotificationsRead(userUid);
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const handleItemClick = async (item: NotificationItem) => {
    if (!item.is_read && userUid) {
      await markNotificationRead(item.id, userUid);
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
    }
    if (item.link) {
      onClose();
      onNavigate(item.link as AppRoute);
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Уведомления${unreadTotal > 0 ? ` (${unreadTotal} новых)` : ''}`}
      maxWidth="max-w-lg"
    >
      <div className="flex flex-col gap-3 text-white font-['PT_Serif',serif]">
        {unreadTotal > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleMarkAll}
              className="min-h-[38px] px-3 py-1.5 bg-zinc-950 border border-zinc-700 hover:border-white text-[14px] font-bold text-zinc-200 hover:text-white inline-flex items-center gap-1.5 cursor-pointer rounded-none"
            >
              <CheckCheck className="w-4 h-4 text-rose-500" />
              <span>Отметить все прочитанными</span>
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-6 text-center text-[14px] text-zinc-400">
            Загрузка уведомлений...
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 bg-zinc-950/70 border border-zinc-800 text-center flex flex-col items-center gap-2 rounded-none">
            <Bell className="w-7 h-7 text-rose-500/80" />
            <p className="text-[14px] text-zinc-300">
              Новых уведомлений пока нет.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-h-[55dvh] overflow-y-auto pr-1">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleItemClick(item)}
                className={`w-full text-left p-3 border transition-colors cursor-pointer rounded-none ${
                  item.is_read
                    ? 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-600 text-zinc-300'
                    : 'bg-zinc-950/90 border-rose-500/80 hover:border-white text-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[14px] font-bold break-words">{item.title}</span>
                  {!item.is_read && (
                    <span className="w-2 h-2 bg-rose-500 shrink-0 mt-1.5" />
                  )}
                </div>
                <p className="text-[14px] text-zinc-400 mt-1 break-words leading-snug">
                  {item.message}
                </p>
                {item.created_at && (
                  <div className="mt-1.5 flex items-center gap-1 text-[14px] font-mono text-zinc-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(item.created_at)}</span>
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-zinc-800">
          <NoirButton type="button" variant="subtle" onClick={onClose}>
            Закрыть
          </NoirButton>
          <NoirButton
            type="button"
            variant="primary"
            onClick={() => {
              onClose();
              onNavigate('notifications');
            }}
            icon={<ArrowRight className="w-4 h-4 text-black" />}
          >
            Все уведомления
          </NoirButton>
        </div>
      </div>
    </NoirModal>
  );
};
