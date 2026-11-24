import React, { useEffect, useState } from 'react';
import { BellRing, Check, Info, Send, Smartphone, Trash2 } from 'lucide-react';
import { NoirButton } from '../common/NoirButton';
import {
  fetchPushDeviceStatus,
  getActivePushSubscription,
  getNotificationPermission,
  isPushSupported,
  sendTestDevicePush,
  subscribeToDevicePush,
  unsubscribeFromDevicePush,
} from './pushClient';

interface DevicePushPanelProps {
  userUid: number;
}

export const DevicePushPanel: React.FC<DevicePushPanelProps> = ({ userUid }) => {
  const [supported] = useState(() => isPushSupported());
  const [permission, setPermission] = useState(() => getNotificationPermission());
  const [isSubscribedLocal, setIsSubscribedLocal] = useState(false);
  const [devicesCount, setDevicesCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const refreshState = async () => {
    setPermission(getNotificationPermission());
    const [localSub, serverCount] = await Promise.all([
      getActivePushSubscription(),
      fetchPushDeviceStatus(userUid),
    ]);
    setIsSubscribedLocal(Boolean(localSub));
    setDevicesCount(serverCount);
  };

  useEffect(() => {
    refreshState();
  }, [userUid]);

  const handleEnablePush = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await subscribeToDevicePush(userUid);
      await refreshState();
      setStatusMsg({
        type: res.ok ? 'success' : 'error',
        text: res.message,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      await unsubscribeFromDevicePush(userUid);
      await refreshState();
      setStatusMsg({
        type: 'info',
        text: 'Push-подписка для этого устройства отключена.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTestPush = async () => {
    setBusy(true);
    setStatusMsg(null);
    try {
      const res = await sendTestDevicePush(userUid);
      if (res.sent > 0) {
        setStatusMsg({
          type: 'success',
          text: `Тестовое Push-уведомление отправлено (доставлено устройств: ${res.sent}). Проверьте шторку уведомлений!`,
        });
      } else {
        setStatusMsg({
          type: 'error',
          text: 'Подключенных устройств не найдено. Нажмите «Включить Push на этом устройстве».',
        });
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка тестовой отправки Push',
      });
    } finally {
      setBusy(false);
    }
  };

  const permissionLabel =
    permission === 'granted'
      ? 'Разрешены в системе'
      : permission === 'denied'
      ? 'Запрещены в настройках браузера'
      : permission === 'default'
      ? 'Ожидают вашего разрешения'
      : 'Требуется PWA-браузер';

  return (
    <div className="noir-container p-4 sm:p-5 border border-white/40 flex flex-col gap-4 text-white text-[14px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-start gap-2.5 min-w-0">
          <BellRing className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="text-[16px] sm:text-[18px] font-bold text-white break-words">
              Push-уведомления на мобильное устройство и компьютер
            </h3>
            <p className="text-[14px] text-zinc-300 mt-0.5 break-words">
              Мгновенные системные оповещения на экран блокировки телефона и рабочий стол без открытой вкладки.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 font-mono text-[14px]">
          <span className="px-2.5 py-1 bg-zinc-950 border border-zinc-700 text-zinc-200">
            Статус: <strong className={permission === 'granted' ? 'text-rose-400' : 'text-white'}>{permissionLabel}</strong>
          </span>
          <span className="px-2.5 py-1 bg-zinc-950 border border-zinc-700 text-zinc-200">
            Устройств: <strong className="text-rose-400">{devicesCount}</strong>
          </span>
        </div>
      </div>

      {/* Clear Explanation Card: WHY enable push & install PWA */}
      <div className="p-3.5 bg-zinc-950 border border-zinc-800 flex items-start gap-3">
        <Info className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1 text-[14px] text-zinc-300 leading-relaxed">
          <div className="font-bold text-white">
            Зачем включать Push-уведомления и устанавливать приложение (PWA) на рабочий стол:
          </div>
          <p>
            • Уведомления о завершении генерации глав и иллюстраций, списании/пополнении букв, импорте книг и бонусах приходят прямо в шторку телефона или на экран ПК.
          </p>
          <p>
            • <strong>Для iPhone / iPad (iOS 16.4+) и Android:</strong> обязательно установите иконку KnigAI на рабочий стол кнопкой выше и разрешите уведомления — тогда пуши приходят стабильно как в нативном приложении.
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex flex-wrap items-center gap-2.5">
        {!isSubscribedLocal ? (
          <NoirButton
            variant="primary"
            onClick={handleEnablePush}
            loading={busy}
            disabled={!supported && permission === 'unsupported'}
            icon={<Smartphone className="w-4 h-4 text-black" />}
          >
            Включить Push на этом устройстве
          </NoirButton>
        ) : (
          <>
            <div className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-950/40 border border-rose-500 text-white font-bold">
              <Check className="w-4 h-4 text-rose-400" />
              <span>Это устройство подписано на Push</span>
            </div>

            <NoirButton
              variant="outline"
              onClick={handleTestPush}
              loading={busy}
              icon={<Send className="w-4 h-4 text-rose-500" />}
            >
              Отправить тест-пуш
            </NoirButton>

            <button
              type="button"
              onClick={handleDisablePush}
              disabled={busy}
              className="min-h-[40px] px-3 bg-zinc-950 border border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-rose-400 font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Trash2 className="w-4 h-4" />
              <span>Отключить устройство</span>
            </button>
          </>
        )}
      </div>

      {statusMsg && (
        <div
          className={`p-3 border text-[14px] ${
            statusMsg.type === 'success'
              ? 'bg-zinc-950 border-white text-white'
              : statusMsg.type === 'error'
              ? 'bg-rose-950/50 border-rose-500 text-rose-200'
              : 'bg-zinc-950 border-zinc-700 text-zinc-300'
          }`}
        >
          {statusMsg.text}
        </div>
      )}
    </div>
  );
};
