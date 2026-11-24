import React, { useEffect, useState } from 'react';
import { Bell, Check, Send, SlidersHorizontal, Smartphone } from 'lucide-react';
import { AppUser, NotificationCategoryKey, NotificationPreferences } from '../../../types';
import {
  DEFAULT_NOTIFICATION_PREFS,
  fetchNotificationPrefs,
  NOTIFICATION_CATEGORIES,
  normalizeNotificationPrefs,
  saveNotificationPrefs,
} from '../../../services/billing/notificationService';
import { NoirButton } from '../../common/NoirButton';

interface NotificationPrefsCardProps {
  currentUser: AppUser;
  onUserUpdated: (user: AppUser) => void;
}

export const NotificationPrefsCard: React.FC<NotificationPrefsCardProps> = ({
  currentUser,
  onUserUpdated,
}) => {
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    normalizeNotificationPrefs(currentUser.notification_prefs || DEFAULT_NOTIFICATION_PREFS)
  );
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchNotificationPrefs(currentUser.uid).then((loaded) => {
      if (active) setPrefs(loaded);
    });
    return () => {
      active = false;
    };
  }, [currentUser.uid]);

  const applyAndPersist = async (next: NotificationPreferences) => {
    setPrefs(next);
    setSaving(true);
    setSavedNotice(null);
    try {
      const saved = await saveNotificationPrefs(currentUser.uid, next);
      setPrefs(saved);
      onUserUpdated({ ...currentUser, notification_prefs: saved });
      setSavedNotice('Настройки каналов уведомлений сохранены');
      window.setTimeout(() => setSavedNotice(null), 2400);
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (key: NotificationCategoryKey, channel: 'bell' | 'telegram' | 'push') => {
    const next: NotificationPreferences = {
      ...prefs,
      [key]: {
        ...prefs[key],
        [channel]: !prefs[key][channel],
      },
    };
    applyAndPersist(next);
  };

  const handleToggleAllChannel = (channel: 'bell' | 'telegram' | 'push', value: boolean) => {
    const next = { ...prefs } as NotificationPreferences;
    for (const cat of NOTIFICATION_CATEGORIES) {
      next[cat.key] = {
        ...next[cat.key],
        [channel]: value,
      };
    }
    applyAndPersist(next);
  };

  const allBellOn = NOTIFICATION_CATEGORIES.every((c) => prefs[c.key].bell);
  const allTgOn = NOTIFICATION_CATEGORIES.every((c) => prefs[c.key].telegram);
  const allPushOn = NOTIFICATION_CATEGORIES.every((c) => prefs[c.key].push);

  return (
    <div className="noir-container p-4 sm:p-5 border border-white/40 flex flex-col gap-4 text-white text-[14px]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-2 border-b border-zinc-800">
        <div className="flex items-start gap-2.5 min-w-0">
          <SlidersHorizontal className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-[16px] sm:text-[18px] font-bold text-white break-words">
              Регулировка каналов уведомлений (Колокольчик, Telegram и Push)
            </h3>
            <p className="text-[14px] text-zinc-300 mt-0.5 break-words">
              Отмечайте галочками, какие события отображать в колокольчике, дублировать в Telegram и присылать как Push на телефон/ПК.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <NoirButton
            variant="outline"
            onClick={() => handleToggleAllChannel('bell', !allBellOn)}
            disabled={saving}
            icon={<Bell className="w-4 h-4 text-rose-500" />}
            showTail={false}
          >
            {allBellOn ? 'Выкл. все (колокол)' : 'Вкл. все (колокол)'}
          </NoirButton>
          <NoirButton
            variant="outline"
            onClick={() => handleToggleAllChannel('telegram', !allTgOn)}
            disabled={saving}
            icon={<Send className="w-4 h-4 text-rose-500" />}
            showTail={false}
          >
            {allTgOn ? 'Выкл. все (Telegram)' : 'Вкл. все (Telegram)'}
          </NoirButton>
          <NoirButton
            variant="outline"
            onClick={() => handleToggleAllChannel('push', !allPushOn)}
            disabled={saving}
            icon={<Smartphone className="w-4 h-4 text-rose-500" />}
            showTail={false}
          >
            {allPushOn ? 'Выкл. все (Push)' : 'Вкл. все (Push)'}
          </NoirButton>
        </div>
      </div>

      {/* Responsive categories matrix */}
      <div className="flex flex-col gap-2.5">
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const item = prefs[cat.key];
          return (
            <div
              key={cat.key}
              className="p-3 bg-black/55 border border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="font-bold text-white text-[15px] break-words">{cat.label}</div>
                <div className="text-[14px] text-zinc-400 break-words">{cat.description}</div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none min-h-[40px] px-3 bg-zinc-950 border border-zinc-700 hover:border-white transition">
                  <input
                    type="checkbox"
                    checked={item.bell}
                    onChange={() => handleToggle(cat.key, 'bell')}
                    className="w-4 h-4 accent-rose-600 cursor-pointer"
                  />
                  <Bell className="w-4 h-4 text-rose-500" />
                  <span className="font-bold text-white">Колокольчик</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer select-none min-h-[40px] px-3 bg-zinc-950 border border-zinc-700 hover:border-white transition">
                  <input
                    type="checkbox"
                    checked={item.telegram}
                    onChange={() => handleToggle(cat.key, 'telegram')}
                    className="w-4 h-4 accent-rose-600 cursor-pointer"
                  />
                  <Send className="w-4 h-4 text-rose-500" />
                  <span className="font-bold text-white">Telegram</span>
                </label>

                <label className="inline-flex items-center gap-2 cursor-pointer select-none min-h-[40px] px-3 bg-zinc-950 border border-zinc-700 hover:border-white transition">
                  <input
                    type="checkbox"
                    checked={item.push}
                    onChange={() => handleToggle(cat.key, 'push')}
                    className="w-4 h-4 accent-rose-600 cursor-pointer"
                  />
                  <Smartphone className="w-4 h-4 text-rose-500" />
                  <span className="font-bold text-white">Push (мобильный)</span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-[14px] text-zinc-400 leading-relaxed">
        Примечание: чтобы Push-уведомления по отмеченным категориям доставлялись на телефон и экран блокировки, установите приложение на рабочий стол кнопкой PWA в профиле и разрешите пуши для этого устройства.
      </p>

      {savedNotice && (
        <div className="p-3 border border-white/60 bg-white/10 text-white text-[14px] flex items-center gap-2">
          <Check className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}
    </div>
  );
};
