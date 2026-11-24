import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, CheckCheck, ArrowRight, Sparkles, Coins, Upload, Copy, Gift } from 'lucide-react';
import { AppRoute, AppUser, NotificationItem } from '../../types';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { NoirButton } from '../../components/common/NoirButton';
import { TelegramConnectCard } from '../../components/cabinet/profile/TelegramConnectCard';
import { NotificationPrefsCard } from '../../components/cabinet/profile/NotificationPrefsCard';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  NOTIFICATIONS_EVENT,
} from '../../services/billing/notificationService';

interface NotificationsPageProps {
  currentUser: AppUser;
  onNavigate: (route: AppRoute) => void;
  onUserUpdated?: (user: AppUser) => void;
}

const TYPE_META: Record<NotificationItem['type'], { label: string; icon: React.ReactNode }> = {
  billing: { label: 'Биллинг', icon: <Coins className="w-4 h-4 text-rose-500" /> },
  generation: { label: 'Генерация', icon: <Sparkles className="w-4 h-4 text-rose-500" /> },
  import: { label: 'Импорт', icon: <Upload className="w-4 h-4 text-rose-500" /> },
  remix: { label: 'Ремикс', icon: <Copy className="w-4 h-4 text-rose-500" /> },
  bonus: { label: 'Бонус', icon: <Gift className="w-4 h-4 text-rose-500" /> },
  system: { label: 'Система', icon: <Bell className="w-4 h-4 text-rose-500" /> },
};

export const NotificationsPage: React.FC<NotificationsPageProps> = ({
  currentUser,
  onNavigate,
  onUserUpdated,
}) => {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchNotifications(currentUser.uid, unreadOnly);
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [currentUser.uid, unreadOnly]);

  useEffect(() => {
    loadList();
    const handleEvent = () => {
      loadList();
    };
    window.addEventListener(NOTIFICATIONS_EVENT, handleEvent);
    return () => window.removeEventListener(NOTIFICATIONS_EVENT, handleEvent);
  }, [loadList]);

  const unreadCount = items.filter((n) => !n.is_read).length;

  const handleMarkOne = async (id: number) => {
    await markNotificationRead(id, currentUser.uid);
    setItems((prev) =>
      unreadOnly
        ? prev.filter((item) => item.id !== id)
        : prev.map((item) => (item.id === id ? { ...item, is_read: true } : item))
    );
  };

  const handleMarkAll = async () => {
    await markAllNotificationsRead(currentUser.uid);
    setItems((prev) =>
      unreadOnly ? [] : prev.map((item) => ({ ...item, is_read: true }))
    );
  };

  return (
    <div className="w-full flex flex-col gap-6 font-['PT_Serif',serif] text-white">
      {/* Header */}
      <div className="noir-container p-4 sm:p-8 border-2 border-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-rose-500 font-mono text-[14px]">
            <Bell className="w-4 h-4" />
            <span>Центр оповещений автора</span>
          </div>
          <RubikMarkerHeading
            as="h1"
            text="Уведомления KnigAI"
            className="text-[22px] sm:text-[32px] leading-tight"
          />
          <p className="text-[14px] text-zinc-300 leading-relaxed">
            Оповещения о списаниях за нейросеть, начислениях бонусов, ремиксах и импорте книг.
          </p>
        </div>

        <NoirButton
          variant="outline"
          onClick={handleMarkAll}
          disabled={items.length === 0}
          icon={<CheckCheck className="w-4 h-4 text-rose-500" />}
        >
          Прочитать все
        </NoirButton>
      </div>

      {/* Telegram Notification Delivery Setup */}
      {onUserUpdated && (
        <>
          <TelegramConnectCard
            currentUser={currentUser}
            onUserUpdated={onUserUpdated}
          />
          <NotificationPrefsCard
            currentUser={currentUser}
            onUserUpdated={onUserUpdated}
          />
        </>
      )}

      {/* Bubble Filter Switcher */}
      <div className="noir-container p-3 sm:p-4 border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: false, label: 'Все уведомления' },
            { id: true, label: 'Только непрочитанные' },
          ].map((tab) => {
            const isActive = unreadOnly === tab.id;
            return (
              <button
                key={String(tab.id)}
                type="button"
                onClick={() => setUnreadOnly(tab.id)}
                className={`relative min-h-[42px] px-4 py-2 text-[14px] font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-white text-black border-2 border-white'
                    : 'bg-zinc-950 text-zinc-300 border border-zinc-700 hover:border-white hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1.5 left-4 w-2 h-2 rotate-45 bg-white"
                  />
                )}
              </button>
            );
          })}
        </div>

        <span className="text-[14px] font-mono text-zinc-400">
          Непрочитанных: <strong className="text-rose-400">{unreadCount}</strong>
        </span>
      </div>

      {/* Notification Cards */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="noir-container p-8 text-center text-[14px] text-zinc-400 border border-zinc-800">
            Загрузка уведомлений...
          </div>
        ) : items.length === 0 ? (
          <div className="noir-container p-10 text-center text-[14px] text-zinc-400 border border-zinc-800">
            Уведомлений пока нет.
          </div>
        ) : (
          items.map((item) => {
            const meta = TYPE_META[item.type] || TYPE_META.system;
            const dateStr = item.created_at
              ? new Date(item.created_at).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Только что';

            return (
              <div
                key={item.id}
                className={`noir-container p-4 border transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                  item.is_read
                    ? 'border-zinc-800 bg-zinc-950/60 opacity-85'
                    : 'border-white bg-zinc-950/95'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-10 h-10 bg-black border border-zinc-700 flex items-center justify-center shrink-0 relative">
                    {meta.icon}
                    {!item.is_read && (
                      <span
                        aria-label="Новое"
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1 flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-[14px] font-mono text-zinc-200">
                        {meta.label}
                      </span>
                      <span className="text-[14px] font-mono text-zinc-400">{dateStr}</span>
                    </div>

                    <h3 className="text-[16px] font-bold text-white break-words">
                      {item.title}
                    </h3>
                    <p className="text-[14px] text-zinc-300 leading-relaxed break-words">
                      {item.message}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
                  {!item.is_read && (
                    <button
                      type="button"
                      onClick={() => handleMarkOne(item.id)}
                      className="min-h-[40px] px-3 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 text-zinc-200 text-[14px] font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Check className="w-4 h-4 text-rose-500" />
                      <span>Прочитано</span>
                    </button>
                  )}

                  {item.link && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!item.is_read) await handleMarkOne(item.id);
                        onNavigate(item.link as AppRoute);
                      }}
                      className="min-h-[40px] px-3 bg-white text-black hover:bg-zinc-200 font-bold text-[14px] inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <span>Открыть раздел</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
