import { useEffect, useState } from 'react';

export const DEFAULT_APP_VERSION = 'v.1.07';
export const APP_VERSION_STORAGE_KEY = 'knigai_platform_version';
export const APP_VERSION_UPDATED_EVENT = 'knigai_app_version_updated';

function getCachedVersion(): string {
  if (typeof window === 'undefined') return DEFAULT_APP_VERSION;
  try {
    const saved = window.localStorage.getItem(APP_VERSION_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // ignore storage access errors
  }
  return DEFAULT_APP_VERSION;
}

function persistCachedVersion(version: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(APP_VERSION_STORAGE_KEY, version);
  } catch {
    // ignore storage access errors
  }
  window.dispatchEvent(new CustomEvent(APP_VERSION_UPDATED_EVENT, { detail: { version } }));
}

export async function fetchAppVersion(): Promise<string> {
  const res = await fetch('/api/app-version', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const data = await res.json();
  if (res.ok && data?.success && typeof data.version === 'string' && data.version.trim()) {
    const clean = data.version.trim();
    if (clean !== getCachedVersion()) {
      persistCachedVersion(clean);
    }
    return clean;
  }
  return getCachedVersion();
}

export async function updateAdminAppVersion(version: string): Promise<string> {
  const res = await fetch('/api/admin/app-version', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ version }),
  });
  const data = await res.json();
  if (!res.ok || !data?.success || !data?.version) {
    throw new Error(data?.error || 'Не удалось сохранить версию платформы');
  }
  const clean = String(data.version).trim();
  persistCachedVersion(clean);
  return clean;
}

export function useAppVersion(): string {
  const [version, setVersion] = useState<string>(() => getCachedVersion());

  useEffect(() => {
    let mounted = true;
    fetchAppVersion()
      .then((v) => {
        if (mounted && v) setVersion(v);
      })
      .catch(() => {});

    const onUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ version?: string }>).detail;
      if (detail?.version && mounted) {
        setVersion(detail.version);
      }
    };

    window.addEventListener(APP_VERSION_UPDATED_EVENT, onUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(APP_VERSION_UPDATED_EVENT, onUpdated);
    };
  }, []);

  return version;
}
