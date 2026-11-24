function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function getActivePushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

export async function subscribeToDevicePush(userUid: number): Promise<{
  ok: boolean;
  message: string;
}> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return {
      ok: false,
      message: 'Браузер не поддерживает системные уведомления. На iPhone сначала добавьте приложение на экран «Домой».',
    };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      message:
        permission === 'denied'
          ? 'Уведомления заблокированы в настройках браузера. Разрешите показ уведомлений для этого сайта.'
          : 'Запрос разрешения на Push-уведомления отклонён.',
    };
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return {
      ok: false,
      message: 'Service Worker Push API недоступен в текущем окне. На iOS откройте установленную иконку с рабочего стола.',
    };
  }

  try {
    const keyRes = await fetch('/api/push/vapid-public-key');
    const keyJson = await keyRes.json();
    if (!keyRes.ok || !keyJson?.publicKey) {
      throw new Error(keyJson?.error || 'Не удалось получить VAPID ключ сервера');
    }

    const reg = await navigator.serviceWorker.ready;
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(String(keyJson.publicKey)) as BufferSource,
      });
    }

    const ua = navigator.userAgent || '';
    const platform = /iphone|ipad|ipod/i.test(ua)
      ? 'iOS PWA'
      : /android/i.test(ua)
      ? 'Android PWA'
      : 'Desktop Browser';

    const saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userUid,
        subscription: subscription.toJSON(),
        platform,
        userAgent: ua,
      }),
    });
    const saveJson = await saveRes.json();
    if (!saveRes.ok || !saveJson?.success) {
      throw new Error(saveJson?.error || 'Ошибка регистрации подписки на сервере');
    }

    return {
      ok: true,
      message: 'Устройство успешно подписано на Push-уведомления!',
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Сбой подключения Push-подписки',
    };
  }
}

export async function unsubscribeFromDevicePush(userUid: number): Promise<void> {
  try {
    const sub = await getActivePushSubscription();
    const endpoint = sub?.endpoint;
    if (sub) {
      await sub.unsubscribe().catch(() => {});
    }
    await fetch('/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userUid, endpoint }),
    });
  } catch {
    // ignore
  }
}

export async function fetchPushDeviceStatus(userUid: number): Promise<number> {
  try {
    const res = await fetch(`/api/push/status/${userUid}`);
    const data = await res.json();
    return Number(data?.count || 0);
  } catch {
    return 0;
  }
}

export async function sendTestDevicePush(userUid: number): Promise<{ sent: number; failed: number }> {
  const res = await fetch('/api/push/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userUid }),
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || 'Ошибка отправки тестового пуша');
  }
  return { sent: Number(data.sent || 0), failed: Number(data.failed || 0) };
}
