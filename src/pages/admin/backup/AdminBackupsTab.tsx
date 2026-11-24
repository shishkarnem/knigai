import React, { useEffect, useState } from 'react';
import {
  Archive,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { NoirButton } from '../../../components/common/NoirButton';
import { RubikMarkerHeading } from '../../../components/landing/RubikMarkerHeading';
import {
  BackupFormat,
  BackupHistoryDto,
  BackupSettingsDto,
  BackupStatusResponse,
  formatBytesRu,
  getBackupFormatTitle,
} from './backupClientTypes';
import { BackupCreateModal } from './BackupCreateModal';
import { BackupRestoreModal } from './BackupRestoreModal';
import { useAppVersion } from '../../../constants/appVersion';

export const AdminBackupsTab: React.FC = () => {
  const appVersion = useAppVersion();
  const [statusData, setStatusData] = useState<BackupStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [sendingAll, setSendingAll] = useState(false);
  const [resendingId, setResendingId] = useState<number | null>(null);
  const [testingBot, setTestingBot] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [notice, setNotice] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  // Editable config fields
  const [enabled, setEnabled] = useState(true);
  const [chatId, setChatId] = useState('169262990');
  const [botToken, setBotToken] = useState('');
  const [hourMsk, setHourMsk] = useState(6);
  const [minuteMsk, setMinuteMsk] = useState(0);
  const [defaultFormat, setDefaultFormat] = useState<BackupFormat>('all');
  const [includeZip, setIncludeZip] = useState(true);

  // Modals
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRestoreOpen, setIsRestoreOpen] = useState(false);
  const [restoreBackupId, setRestoreBackupId] = useState<number | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/backups/status');
      const data = (await res.json()) as BackupStatusResponse;
      if (data.success) {
        setStatusData(data);
        applySettingsToForm(data.settings);
      }
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка загрузки статуса бэкапов',
      });
    } finally {
      setLoading(false);
    }
  };

  const applySettingsToForm = (s: BackupSettingsDto) => {
    setEnabled(Boolean(s.enabled));
    setChatId(s.telegram_chat_id || '169262990');
    setBotToken(s.telegram_bot_token || '');
    setHourMsk(Number(s.schedule_hour_msk ?? 6));
    setMinuteMsk(Number(s.schedule_minute_msk ?? 0));
    setDefaultFormat((s.default_format as BackupFormat) || 'all');
    setIncludeZip(Boolean(s.include_zip));
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/backups/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          telegram_chat_id: chatId.trim(),
          telegram_bot_token: botToken.trim(),
          schedule_hour_msk: hourMsk,
          schedule_minute_msk: minuteMsk,
          default_format: defaultFormat,
          include_zip: includeZip,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось сохранить настройки');
      }
      setNotice({
        type: 'ok',
        text: `Настройки сохранены. Следующий автобэкап: ${data.nextRunMsk}`,
      });
      await loadStatus();
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleTestBot = async () => {
    setTestingBot(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/backups/test-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ botToken: botToken.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Бот недоступен');
      }
      setNotice({
        type: 'ok',
        text: `Telegram-бот подключён: @${data.username || 'bot'} (${data.firstName || 'KnigAI'})`,
      });
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setTestingBot(false);
    }
  };

  const handleSendAllFormatsNow = async () => {
    setSendingAll(true);
    setNotice(null);
    try {
      const res = await fetch('/api/admin/backups/send-all-formats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          includeZip,
          asyncJob: true,
          reason: 'Ручная отправка всех форматов (.dump, .sql, .json) в Telegram',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Ошибка отправки в Telegram');
      }
      setNotice({
        type: 'ok',
        text: `Запущена генерация и отправка всех 3 форматов (.dump, .sql, .json) в Telegram (${chatId}). Записи появятся в журнале в течение 20–35 секунд.`,
      });
      setTimeout(() => {
        loadStatus();
      }, 6000);
      setTimeout(() => {
        loadStatus();
      }, 28000);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setSendingAll(false);
    }
  };

  const handleResendRow = async (rec: BackupHistoryDto) => {
    setResendingId(rec.id);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/backups/${rec.id}/send-telegram`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось переслать файл в Telegram');
      }
      setNotice({
        type: 'ok',
        text: `Бэкап #${rec.id} (${rec.filename}) отправлен в Telegram`,
      });
      await loadStatus();
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : String(err) });
    } finally {
      setResendingId(null);
    }
  };

  const liveStats = statusData?.liveStats;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const scheduleDisplay = `${pad2(hourMsk)}:${pad2(minuteMsk)} МСК`;

  const activeVersion = statusData?.platformVersion || appVersion;
  const captionPreview = [
    `📦 Резервная копия базы данных "KnigAI"`,
    `🏷 Версия платформы: ${activeVersion}`,
    ``,
    `🎯 Причина: Ежедневный автобэкап в ${scheduleDisplay}`,
    `⏰ Время (МСК): ${statusData?.currentMsk || '—'}`,
    `📊 Таблиц: ${liveStats?.totalTables ?? '—'} (с данными: ${liveStats?.nonEmptyTables ?? '—'})`,
    `📈 Всего записей: ${liveStats?.totalRows ?? '—'}`,
    `📄 Формат: ${getBackupFormatTitle(defaultFormat)}`,
    `💾 Исходный размер: рассчитывается при выгрузке`,
    `📦 Размер ZIP-архива: ${includeZip || defaultFormat === 'all' ? 'рассчитывается при упаковке' : '—'}`,
  ].join('\n');

  return (
    <div className="flex flex-col gap-5 text-white text-[14px]">
      {/* Top Overview & Actions Card */}
      <div className="noir-container p-4 sm:p-5 border border-white/30 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="min-w-0">
            <RubikMarkerHeading
              text="Резервное копирование и восстановление"
              as="h3"
              className="text-[22px] sm:text-[26px] leading-tight break-words"
            />
            <p className="text-[14px] text-zinc-300 mt-1 break-words">
              Автоматический ежедневный экспорт базы PostgreSQL (<span className="text-white font-bold">kniga</span>) в Telegram и мгновенный откат
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <NoirButton
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
              icon={<Archive className="w-4 h-4 text-black" />}
              showTail={false}
            >
              Создать бэкап
            </NoirButton>

            <NoirButton
              variant="outline"
              onClick={handleSendAllFormatsNow}
              loading={sendingAll}
              icon={<Send className="w-4 h-4 text-rose-400" />}
              showTail={false}
            >
              Отправить все форматы в Telegram
            </NoirButton>

            <NoirButton
              variant="danger"
              onClick={() => {
                setRestoreBackupId(null);
                setIsRestoreOpen(true);
              }}
              icon={<RotateCcw className="w-4 h-4" />}
              showTail={false}
            >
              Восстановить БД
            </NoirButton>

            <NoirButton
              variant="subtle"
              onClick={loadStatus}
              loading={loading}
              icon={<RefreshCw className="w-4 h-4" />}
              showTail={false}
            >
              Обновить
            </NoirButton>
          </div>
        </div>

        {/* Live Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-white/15">
          <div className="p-3 border border-zinc-800 bg-black/50">
            <div className="text-zinc-400 text-[14px]">Таблиц в PostgreSQL</div>
            <div className="text-[18px] font-bold text-white mt-0.5">
              {liveStats ? `${liveStats.totalTables} (с данными: ${liveStats.nonEmptyTables})` : '—'}
            </div>
          </div>
          <div className="p-3 border border-zinc-800 bg-black/50">
            <div className="text-zinc-400 text-[14px]">Всего записей в базе</div>
            <div className="text-[18px] font-bold text-white mt-0.5">
              {liveStats ? liveStats.totalRows.toLocaleString('ru-RU') : '—'}
            </div>
          </div>
          <div className="p-3 border border-zinc-800 bg-black/50">
            <div className="text-zinc-400 text-[14px]">Текущее время (МСК)</div>
            <div className="text-[16px] font-bold text-white mt-0.5 break-words">
              {statusData?.currentMsk || '—'}
            </div>
          </div>
          <div className="p-3 border border-rose-500/50 bg-rose-950/20">
            <div className="text-rose-300 text-[14px]">Следующий автобэкап</div>
            <div className="text-[16px] font-bold text-white mt-0.5 break-words">
              {enabled ? statusData?.nextRunMsk || scheduleDisplay : 'Приостановлен'}
            </div>
          </div>
        </div>

        {notice && (
          <div
            className={`p-3 border text-[14px] break-words ${
              notice.type === 'error'
                ? 'border-rose-500 bg-rose-950/40 text-rose-200'
                : 'border-white/50 bg-white/10 text-white'
            }`}
          >
            {notice.text}
          </div>
        )}
      </div>

      {/* Settings & Message Template Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Scheduler & Telegram Settings */}
        <form
          onSubmit={handleSaveConfig}
          className="lg:col-span-7 noir-container p-4 sm:p-5 border border-zinc-700 flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/15">
            <div className="font-bold text-[16px] text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-rose-500" />
              <span>Расписание автобэкапа и Telegram</span>
            </div>

            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="w-5 h-5 accent-rose-600 cursor-pointer"
              />
              <span className="font-bold text-white">Автобэкап включён</span>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-300 font-bold">Telegram Chat ID получателя</label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                className="noir-input px-3 py-2.5 w-full text-[14px]"
                placeholder="169262990"
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-300 font-bold">Время автозапуска (МСК)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={23}
                  value={hourMsk}
                  onChange={(e) => setHourMsk(Number(e.target.value))}
                  className="noir-input px-3 py-2.5 w-24 text-[14px] text-center"
                />
                <span className="font-bold text-zinc-400">:</span>
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={minuteMsk}
                  onChange={(e) => setMinuteMsk(Number(e.target.value))}
                  className="noir-input px-3 py-2.5 w-24 text-[14px] text-center"
                />
                <span className="text-zinc-400">MSK</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-zinc-300 font-bold">Telegram Bot Token</label>
            <div className="flex items-stretch gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder="Оставьте маску или пусто, чтобы сохранить текущий"
                className="noir-input px-3 py-2.5 flex-1 min-w-0 text-[14px] font-mono"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="min-h-[44px] px-3 border border-zinc-700 bg-black/60 hover:border-white text-zinc-200 cursor-pointer"
                aria-label="Показать или скрыть токен"
              >
                {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-zinc-300 font-bold">Формат ежедневного бэкапа</label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value as BackupFormat)}
                className="noir-input px-3 py-2.5 w-full text-[14px]"
              >
                <option value="all">Все форматы (.dump + .sql + .json)</option>
                <option value="dump">PostgreSQL Dump (.dump)</option>
                <option value="sql">Plain Text SQL (.sql)</option>
                <option value="json">JSON Snapshot (.json)</option>
              </select>
            </div>

            <div className="flex flex-col justify-end">
              <label className="p-2.5 border border-zinc-700 bg-black/50 flex items-center gap-2.5 cursor-pointer min-h-[44px]">
                <input
                  type="checkbox"
                  checked={includeZip || defaultFormat === 'all'}
                  disabled={defaultFormat === 'all'}
                  onChange={(e) => setIncludeZip(e.target.checked)}
                  className="w-5 h-5 accent-rose-600 cursor-pointer"
                />
                <span className="text-zinc-200 font-bold">Упаковывать в ZIP-архив</span>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5 pt-2">
            <NoirButton
              type="submit"
              variant="primary"
              loading={savingConfig}
              icon={<Save className="w-4 h-4 text-black" />}
              showTail={false}
            >
              Сохранить настройки
            </NoirButton>

            <NoirButton
              type="button"
              variant="outline"
              onClick={handleTestBot}
              loading={testingBot}
              icon={<ShieldCheck className="w-4 h-4 text-rose-400" />}
              showTail={false}
            >
              Проверить подключение бота
            </NoirButton>
          </div>
        </form>

        {/* Telegram Caption Preview */}
        <div className="lg:col-span-5 noir-container p-4 sm:p-5 border border-zinc-700 flex flex-col gap-3">
          <div className="font-bold text-[16px] text-white flex items-center gap-2 pb-2 border-b border-white/15">
            <Database className="w-5 h-5 text-rose-500" />
            <span>Шаблон отчёта в Telegram</span>
          </div>
          <pre className="p-3.5 border border-zinc-800 bg-black/70 text-[14px] text-zinc-200 whitespace-pre-wrap break-words font-mono leading-relaxed flex-1">
            {captionPreview}
          </pre>
        </div>
      </div>

      {/* Backup History List */}
      <div className="noir-container p-4 sm:p-5 border border-zinc-700 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/15">
          <div className="font-bold text-[16px] text-white">
            Журнал резервных копий ({statusData?.history?.length || 0})
          </div>
          <span className="text-zinc-400 text-[14px]">
            Копии с Telegram file_id можно восстановить напрямую после перезапуска сервера
          </span>
        </div>

        {!statusData || statusData.history.length === 0 ? (
          <div className="p-6 border border-dashed border-zinc-700 text-center text-zinc-400">
            Резервные копии ещё не создавались. Нажмите «Создать бэкап» или «Отправить все форматы в Telegram».
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {statusData.history.map((rec) => (
              <div
                key={rec.id}
                className="p-3.5 border border-zinc-800 bg-black/55 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">#{rec.id}</span>
                    <span className="px-2 py-0.5 border border-rose-500/70 bg-rose-950/30 text-rose-200 font-bold">
                      {rec.format}
                      {rec.is_zip ? ' + zip' : ''}
                    </span>
                    <span
                      className={`px-2 py-0.5 border ${
                        rec.status === 'running'
                          ? 'border-rose-400 bg-rose-950/30 text-rose-200'
                          : rec.telegram_sent
                          ? 'border-white/60 bg-white/10 text-white'
                          : rec.status === 'failed'
                          ? 'border-rose-500 bg-rose-950/50 text-rose-300'
                          : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      {rec.status === 'running'
                        ? 'Формируется...'
                        : rec.telegram_sent
                        ? `В Telegram (msg #${rec.telegram_message_id ?? 'ok'})`
                        : rec.status === 'failed'
                        ? 'Ошибка отправки'
                        : 'Локально'}
                    </span>
                    <span className="text-zinc-400">{rec.created_at_msk}</span>
                  </div>

                  <div className="text-white font-bold break-all">{rec.filename}</div>
                  <div className="text-zinc-400 break-words">
                    {rec.reason} · Таблиц: {rec.total_tables} (с данными: {rec.non_empty_tables}) · Записей: {rec.total_rows} · Размер: {formatBytesRu(rec.raw_size_bytes)}
                    {rec.zip_size_bytes ? ` · ZIP: ${formatBytesRu(rec.zip_size_bytes)}` : ''}
                  </div>
                  {rec.error_message && (
                    <div className="text-rose-400 break-words">Ошибка: {rec.error_message}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <a
                    href={`/api/admin/backups/${rec.id}/download`}
                    className="min-h-[44px] px-3.5 py-2 border border-white/40 bg-black/70 hover:bg-white hover:text-black text-white font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    <span>Скачать</span>
                  </a>

                  <NoirButton
                    variant="outline"
                    onClick={() => handleResendRow(rec)}
                    loading={resendingId === rec.id}
                    icon={<Send className="w-4 h-4 text-rose-400" />}
                    showTail={false}
                  >
                    В Telegram
                  </NoirButton>

                  <NoirButton
                    variant="danger"
                    onClick={() => {
                      setRestoreBackupId(rec.id);
                      setIsRestoreOpen(true);
                    }}
                    icon={<RotateCcw className="w-4 h-4" />}
                    showTail={false}
                  >
                    Восстановить
                  </NoirButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <BackupCreateModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        defaultFormat={defaultFormat}
        defaultIncludeZip={includeZip}
        telegramChatId={chatId}
        onCreated={loadStatus}
      />

      <BackupRestoreModal
        isOpen={isRestoreOpen}
        onClose={() => setIsRestoreOpen(false)}
        history={statusData?.history || []}
        initialBackupId={restoreBackupId}
        onRestored={loadStatus}
      />
    </div>
  );
};
