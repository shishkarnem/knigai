import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Globe,
  HelpCircle,
  Save,
  Send,
  Shield,
} from 'lucide-react';
import { NoirButton } from '../../../components/common/NoirButton';
import { RubikMarkerHeading } from '../../../components/landing/RubikMarkerHeading';

type ProxyType = 'dialog_ai' | 'custom_cloudflare' | 'direct';

const CLOUDFLARE_WORKER_SNIPPET = `export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = 'api.telegram.org';
    const newReq = new Request(url, request);
    return fetch(newReq);
  }
};`;

export const AdminTelegramProxyCard: React.FC = () => {
  const [proxyType, setProxyType] = useState<ProxyType>('dialog_ai');
  const [customProxyUrl, setCustomProxyUrl] = useState('');
  const [botToken, setBotToken] = useState('');
  const [botUsername, setBotUsername] = useState('');
  const [maskedToken, setMaskedToken] = useState('');
  const [isTokenConfigured, setIsTokenConfigured] = useState(false);
  const [adminId, setAdminId] = useState('169262990');
  const [showCfHelp, setShowCfHelp] = useState(false);
  const [copiedWorkerCode, setCopiedWorkerCode] = useState(false);

  const [statusMsg, setStatusMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTriggeringBackup, setIsTriggeringBackup] = useState(false);

  const loadSettings = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/bot-settings');
      const data = await res.json();
      if (res.ok && data) {
        const nextProxy: ProxyType =
          data.proxyType === 'custom_cloudflare' || data.proxyType === 'direct'
            ? data.proxyType
            : 'dialog_ai';
        setProxyType(nextProxy);
        if (nextProxy === 'custom_cloudflare') {
          setCustomProxyUrl(data.apiBaseUrl || '');
        }
        setMaskedToken(data.maskedToken || '');
        setIsTokenConfigured(Boolean(data.isTokenConfigured));
        setBotUsername(data.botUsername || '');
        if (data.adminTelegramId) {
          setAdminId(data.adminTelegramId);
        }
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Не удалось загрузить настройки Telegram прокси',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/bot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxyType,
          apiBaseUrl: customProxyUrl,
          botToken: botToken || undefined,
          botUsername: botUsername || undefined,
          adminTelegramId: adminId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось сохранить конфигурацию');
      }
      setBotToken('');
      setMaskedToken(data.config?.maskedToken || maskedToken);
      setIsTokenConfigured(Boolean(data.config?.isTokenConfigured));
      if (data.config?.botUsername) {
        setBotUsername(data.config.botUsername);
      }
      setStatusMsg({
        type: 'ok',
        text: 'Настройки прокси-шлюза и Telegram-бота успешно сохранены в PostgreSQL.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка сохранения',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestProxyConnection = async () => {
    setIsTesting(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/bot-settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proxyType,
          apiBaseUrl: customProxyUrl,
          botToken: botToken || undefined,
          adminTelegramId: adminId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось проверить связь с Telegram');
      }
      if (data.botUsername) setBotUsername(data.botUsername);
      setStatusMsg({
        type: 'ok',
        text: data.message || 'Тестовое сообщение отправлено админу.',
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка проверки прокси',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTriggerBackup = async () => {
    setIsTriggeringBackup(true);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/admin/backup/trigger', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ошибка отправки бэкапа в Telegram');
      }
      setStatusMsg({
        type: 'ok',
        text: `Бэкап (${data.filename || 'архив'}) успешно отправлен в Telegram через шлюз! Записей: ${
          data.totalRows ?? 0
        }.`,
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка запуска бэкапа',
      });
    } finally {
      setIsTriggeringBackup(false);
    }
  };

  const handleCopyWorkerCode = () => {
    navigator.clipboard.writeText(CLOUDFLARE_WORKER_SNIPPET);
    setCopiedWorkerCode(true);
    setTimeout(() => setCopiedWorkerCode(false), 2200);
  };

  const getFullExampleUrl = () => {
    const tokenDisplay = isTokenConfigured ? '<ТОКЕН_БОТА>' : 'YOUR_BOT_TOKEN';
    if (proxyType === 'dialog_ai') {
      return `https://eu1.account.dialog.ai.atiks.org/bot${tokenDisplay}/sendMessage`;
    }
    if (proxyType === 'custom_cloudflare') {
      const base = customProxyUrl.replace(/\/+$/, '') || 'https://your-worker.workers.dev';
      return `${base}/bot${tokenDisplay}/sendMessage`;
    }
    return `https://api.telegram.org/bot${tokenDisplay}/sendMessage`;
  };

  return (
    <div className="noir-container p-4 sm:p-6 border border-white/30 text-white flex flex-col gap-5 text-[14px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 bg-black border border-rose-500 flex items-center justify-center shrink-0">
            <Globe className="w-5 h-5 text-rose-500" />
          </div>
          <div className="min-w-0">
            <RubikMarkerHeading
              text="Шлюз и проксирование Telegram Bot API (РФ)"
              as="h3"
              className="text-[20px] sm:text-[24px] leading-tight break-words"
            />
            <p className="text-[14px] text-zinc-300 mt-1 break-words">
              Обход блокировок для ежедневных бэкапов и уведомлений авторов в личном кабинете с автоматическим резервным каналом.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowCfHelp(!showCfHelp)}
          className="relative min-h-[44px] px-4 py-2 bg-zinc-950 hover:bg-zinc-900 border border-rose-500/70 hover:border-rose-500 text-rose-300 hover:text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
        >
          <HelpCircle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Инструкция по своему Cloudflare Worker</span>
        </button>
      </div>

      {/* Collapsible Cloudflare Worker Setup Guide */}
      {showCfHelp && (
        <div className="p-4 bg-black/75 border border-rose-500/60 flex flex-col gap-3 text-[14px] text-zinc-200">
          <div className="font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Пошаговая инструкция: собственный прокси на Cloudflare Worker</span>
          </div>
          <ol className="list-decimal list-inside space-y-1.5 text-zinc-300 leading-relaxed">
            <li>
              Войдите или зарегистрируйтесь на{' '}
              <a
                href="https://dash.cloudflare.com/"
                target="_blank"
                rel="noreferrer"
                className="text-rose-400 underline break-all"
              >
                dash.cloudflare.com
              </a>
            </li>
            <li>
              Откройте <strong className="text-white">Build → Compute → Workers &amp; Pages → Create Application</strong>, выберите шаблон «Hello, World», задайте поддомен и нажмите <strong className="text-white">Deploy</strong>.
            </li>
            <li>
              Нажмите <strong className="text-white">Edit Code</strong> и вставьте следующий код воркера:
            </li>
          </ol>

          <div className="relative bg-zinc-950 border border-zinc-700 p-3">
            <button
              type="button"
              onClick={handleCopyWorkerCode}
              className="mb-2 sm:mb-0 sm:absolute sm:top-2 sm:right-2 min-h-[36px] px-3 py-1 bg-zinc-900 hover:bg-white hover:text-black border border-zinc-700 text-zinc-200 text-[14px] font-mono inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedWorkerCode ? (
                <>
                  <Check className="w-4 h-4 text-rose-500" />
                  <span>Скопировано</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-rose-500" />
                  <span>Копировать код</span>
                </>
              )}
            </button>
            <pre className="font-mono text-[14px] text-zinc-200 overflow-x-auto whitespace-pre-wrap break-all">
              {CLOUDFLARE_WORKER_SNIPPET}
            </pre>
          </div>

          <p className="text-[14px] text-zinc-300 leading-relaxed">
            После сохранения нажмите <strong className="text-white">Deploy</strong> и скопируйте выданный URL (например, <code className="text-rose-300 font-mono">https://my-proxy.subdomain.workers.dev</code>) в пресет «Свой Cloudflare Worker».
          </p>
        </div>
      )}

      {/* Proxy Presets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => setProxyType('dialog_ai')}
          className={`text-left p-4 border transition cursor-pointer flex flex-col justify-between gap-2 ${
            proxyType === 'dialog_ai'
              ? 'bg-rose-950/30 border-rose-500'
              : 'bg-black/50 border-zinc-800 hover:border-zinc-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="font-bold text-[15px] text-white">Готовый прокси-шлюз</span>
            {proxyType === 'dialog_ai' && <Check className="w-4 h-4 text-rose-500 shrink-0" />}
          </div>
          <p className="text-[14px] text-zinc-300 leading-snug">
            Выделенный зарубежный шлюз без блокировок в РФ
          </p>
          <code className="text-[14px] text-rose-300 font-mono break-all">
            https://eu1.account.dialog.ai.atiks.org
          </code>
        </button>

        <button
          type="button"
          onClick={() => setProxyType('custom_cloudflare')}
          className={`text-left p-4 border transition cursor-pointer flex flex-col justify-between gap-2 ${
            proxyType === 'custom_cloudflare'
              ? 'bg-rose-950/30 border-rose-500'
              : 'bg-black/50 border-zinc-800 hover:border-zinc-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="font-bold text-[15px] text-white">Свой Cloudflare Worker</span>
            {proxyType === 'custom_cloudflare' && <Check className="w-4 h-4 text-rose-500 shrink-0" />}
          </div>
          <p className="text-[14px] text-zinc-300 leading-snug">
            Персональный прокси на бесплатном тарифе Cloudflare
          </p>
          <span className="text-[14px] text-rose-300 font-mono">
            Пользовательский URL
          </span>
        </button>

        <button
          type="button"
          onClick={() => setProxyType('direct')}
          className={`text-left p-4 border transition cursor-pointer flex flex-col justify-between gap-2 ${
            proxyType === 'direct'
              ? 'bg-rose-950/30 border-rose-500'
              : 'bg-black/50 border-zinc-800 hover:border-zinc-500'
          }`}
        >
          <div className="flex items-center justify-between gap-2 w-full">
            <span className="font-bold text-[15px] text-white">Прямое подключение</span>
            {proxyType === 'direct' && <Check className="w-4 h-4 text-rose-500 shrink-0" />}
          </div>
          <p className="text-[14px] text-zinc-300 leading-snug">
            Прямой вызов официального API без проксирования
          </p>
          <code className="text-[14px] text-zinc-400 font-mono break-all">
            https://api.telegram.org
          </code>
        </button>
      </div>

      {/* Custom Cloudflare Worker URL input */}
      {proxyType === 'custom_cloudflare' && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-zinc-200">
            Адрес вашего Cloudflare Worker:
          </label>
          <input
            type="url"
            value={customProxyUrl}
            onChange={(e) => setCustomProxyUrl(e.target.value)}
            placeholder="https://my-proxy.subdomain.workers.dev"
            className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-mono"
          />
        </div>
      )}

      {/* Full Endpoint Preview */}
      <div className="p-3.5 bg-black/70 border border-zinc-800 flex flex-col gap-1">
        <span className="text-[14px] font-bold text-zinc-400">
          Итоговый маршрут выполнения запросов Telegram API:
        </span>
        <div className="font-mono text-[14px] text-rose-300 break-all select-all">
          {getFullExampleUrl()}
        </div>
      </div>

      {/* Token, Bot Handle, Admin ID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-zinc-200 flex flex-wrap items-center justify-between gap-1">
            <span>Токен бота (хранится на сервере):</span>
            {isTokenConfigured && maskedToken && (
              <span className="text-[14px] font-mono text-rose-400">{maskedToken}</span>
            )}
          </label>
          <input
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={isTokenConfigured ? 'Оставьте пустым, чтобы не менять' : 'Вставьте токен бота...'}
            className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-zinc-200">
            Имя бота в Telegram (@username):
          </label>
          <input
            type="text"
            value={botUsername}
            onChange={(e) => setBotUsername(e.target.value)}
            placeholder="@KnigAiNotifyBot"
            className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-mono"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-zinc-200">
            Telegram ID администратора:
          </label>
          <input
            type="text"
            value={adminId}
            onChange={(e) => setAdminId(e.target.value)}
            placeholder="169262990"
            className="noir-input w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-mono"
          />
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 border text-[14px] break-words ${
            statusMsg.type === 'error'
              ? 'border-rose-500 bg-rose-950/40 text-rose-200'
              : 'border-white/60 bg-white/10 text-white'
          }`}
        >
          {statusMsg.text}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-zinc-800">
        <NoirButton
          variant="primary"
          onClick={handleSave}
          loading={isSaving || isLoading}
          icon={<Save className="w-4 h-4 text-black" />}
          showTail={true}
        >
          Сохранить конфигурацию
        </NoirButton>

        <NoirButton
          variant="outline"
          onClick={handleTestProxyConnection}
          loading={isTesting}
          icon={<Send className="w-4 h-4 text-rose-500" />}
          showTail={true}
        >
          Проверить прокси и отправить тест
        </NoirButton>

        <NoirButton
          variant="subtle"
          onClick={handleTriggerBackup}
          loading={isTriggeringBackup}
          icon={<Database className="w-4 h-4 text-rose-500" />}
          showTail={true}
        >
          Тестовый запуск бэкапа в Telegram
        </NoirButton>
      </div>
    </div>
  );
};
