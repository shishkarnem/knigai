import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Upload,
  RotateCcw,
  Check,
  AlertTriangle,
  Database,
  Send,
  FileArchive,
} from 'lucide-react';
import { NoirButton } from '../../../components/common/NoirButton';
import { RubikMarkerHeading } from '../../../components/landing/RubikMarkerHeading';
import {
  BackupHistoryDto,
  InspectedBackupDto,
  RestoreMode,
  RestoreResultDto,
} from './backupClientTypes';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: BackupHistoryDto[];
  initialBackupId?: number | null;
  onRestored: () => void;
}

export const BackupRestoreModal: React.FC<BackupRestoreModalProps> = ({
  isOpen,
  onClose,
  history,
  initialBackupId = null,
  onRestored,
}) => {
  const [sourceType, setSourceType] = useState<'file' | 'history' | 'telegram_id'>(
    initialBackupId ? 'history' : 'file'
  );
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<string>(
    initialBackupId ? String(initialBackupId) : history[0] ? String(history[0].id) : ''
  );
  const [telegramFileId, setTelegramFileId] = useState<string>('');

  const [inspecting, setInspecting] = useState(false);
  const [inspected, setInspected] = useState<InspectedBackupDto | null>(null);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);

  const [restoreMode, setRestoreMode] = useState<RestoreMode>('merge');
  const [includeSystemTables, setIncludeSystemTables] = useState<boolean>(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<RestoreResultDto | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const handleInspect = async () => {
    setInspecting(true);
    setErrorMsg(null);
    setInspected(null);
    setRestoreResult(null);

    try {
      let res: Response;
      if (sourceType === 'file') {
        if (!selectedFile) {
          throw new Error('Выберите файл резервной копии (.dump, .sql, .json, .zip)');
        }
        const form = new FormData();
        form.append('file', selectedFile);
        res = await fetch('/api/admin/backups/inspect', { method: 'POST', body: form });
      } else if (sourceType === 'history') {
        if (!selectedBackupId) throw new Error('Выберите бэкап из списка');
        res = await fetch('/api/admin/backups/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ backupId: Number(selectedBackupId) }),
        });
      } else {
        if (!telegramFileId.trim()) throw new Error('Укажите Telegram file_id документа');
        res = await fetch('/api/admin/backups/inspect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramFileId: telegramFileId.trim() }),
        });
      }

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось прочитать структуру бэкапа');
      }

      const info = data.info as InspectedBackupDto;
      setInspected(info);
      setSelectedTables(info.tables.map((t) => t.name));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setInspecting(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setErrorMsg(null);
    setRestoreResult(null);

    try {
      let res: Response;
      if (sourceType === 'file') {
        if (!selectedFile) throw new Error('Файл не выбран');
        const form = new FormData();
        form.append('file', selectedFile);
        form.append('mode', restoreMode);
        form.append('includeSystemTables', String(includeSystemTables));
        if (selectedTables.length > 0) {
          form.append('tablesFilter', JSON.stringify(selectedTables));
        }
        res = await fetch('/api/admin/backups/restore', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/admin/backups/restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            backupId: sourceType === 'history' ? Number(selectedBackupId) : undefined,
            telegramFileId: sourceType === 'telegram_id' ? telegramFileId.trim() : undefined,
            mode: restoreMode,
            includeSystemTables,
            tablesFilter: selectedTables.length > 0 ? selectedTables : undefined,
          }),
        });
      }

      const data = (await res.json()) as RestoreResultDto;
      setRestoreResult(data);
      if (data.success) {
        onRestored();
      } else if (data.errors && data.errors.length > 0) {
        setErrorMsg(data.errors.join('\n'));
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoring(false);
    }
  };

  const toggleTable = (tableName: string) => {
    setSelectedTables((prev) =>
      prev.includes(tableName) ? prev.filter((t) => t !== tableName) : [...prev, tableName]
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[510] flex justify-center items-center p-2 sm:p-4 bg-black/55 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-2xl my-auto max-h-[90dvh] flex flex-col noir-modal p-4 sm:p-6 text-white rounded-none border-2 border-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 mb-4 border-b border-white/20 shrink-0">
          <div className="min-w-0">
            <RubikMarkerHeading
              text="Восстановление базы данных"
              as="h3"
              className="text-[20px] sm:text-[22px] leading-snug break-words"
            />
            <p className="text-[14px] text-zinc-400 mt-1">
              Загрузите файл (.dump, .sql, .json, .zip) или восстановите копию из Telegram
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-white/40 bg-black/60 hover:bg-white hover:text-black text-white transition-colors rounded-none shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1 text-[14px]">
          {/* Source Selector Tabs (Wrapping, zero horizontal overflow) */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setSourceType('file');
                setInspected(null);
              }}
              className={`min-h-[44px] px-3.5 py-2 border font-bold flex items-center gap-2 cursor-pointer rounded-none ${
                sourceType === 'file'
                  ? 'bg-white text-black border-white'
                  : 'bg-black/60 text-zinc-300 border-zinc-700 hover:border-white/50'
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Файл с устройства</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceType('history');
                setInspected(null);
              }}
              className={`min-h-[44px] px-3.5 py-2 border font-bold flex items-center gap-2 cursor-pointer rounded-none ${
                sourceType === 'history'
                  ? 'bg-white text-black border-white'
                  : 'bg-black/60 text-zinc-300 border-zinc-700 hover:border-white/50'
              }`}
            >
              <FileArchive className="w-4 h-4" />
              <span>Из журнала / Telegram</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSourceType('telegram_id');
                setInspected(null);
              }}
              className={`min-h-[44px] px-3.5 py-2 border font-bold flex items-center gap-2 cursor-pointer rounded-none ${
                sourceType === 'telegram_id'
                  ? 'bg-white text-black border-white'
                  : 'bg-black/60 text-zinc-300 border-zinc-700 hover:border-white/50'
              }`}
            >
              <Send className="w-4 h-4 text-rose-500" />
              <span>По Telegram file_id</span>
            </button>
          </div>

          {/* Source Input */}
          {sourceType === 'file' && (
            <label className="border border-dashed border-white/40 bg-black/50 p-4 flex flex-col gap-2 cursor-pointer hover:border-rose-500 transition-colors rounded-none">
              <div className="font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-rose-500" />
                <span>
                  {selectedFile ? `Выбран файл: ${selectedFile.name}` : 'Нажмите чтобы выбрать файл бэкапа'}
                </span>
              </div>
              <span className="text-[14px] text-zinc-400">
                Поддерживаются форматы .dump, .sql, .json и .zip-архивы
              </span>
              <input
                type="file"
                accept=".dump,.sql,.json,.zip"
                className="hidden"
                onChange={(e) => {
                  setSelectedFile(e.target.files?.[0] || null);
                  setInspected(null);
                  setRestoreResult(null);
                }}
              />
            </label>
          )}

          {sourceType === 'history' && (
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-zinc-200">
                Выберите сохранённую копию (подтягивается из кэша или напрямую из Telegram)
              </label>
              <select
                value={selectedBackupId}
                onChange={(e) => {
                  setSelectedBackupId(e.target.value);
                  setInspected(null);
                }}
                className="noir-input px-3 py-2.5 text-[14px] w-full rounded-none"
              >
                {history.length === 0 && <option value="">История бэкапов пуста</option>}
                {history.map((item) => (
                  <option key={item.id} value={String(item.id)}>
                    #{item.id} · {item.created_at_msk} · {item.filename} ({item.total_rows} зап.)
                    {item.telegram_file_id ? ' [TG]' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {sourceType === 'telegram_id' && (
            <div className="flex flex-col gap-2">
              <label className="text-[14px] font-bold text-zinc-200">
                Вставьте Telegram file_id резервной копии
              </label>
              <input
                type="text"
                value={telegramFileId}
                onChange={(e) => {
                  setTelegramFileId(e.target.value);
                  setInspected(null);
                }}
                placeholder="BQACAgIAAxkBAA..."
                className="noir-input px-3 py-2.5 text-[14px] w-full rounded-none"
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <NoirButton
              variant="outline"
              onClick={handleInspect}
              loading={inspecting}
              icon={<Database className="w-4 h-4 text-rose-400" />}
              showTail={false}
            >
              Проверить состав копии
            </NoirButton>
          </div>

          {/* Inspection Preview */}
          {inspected && (
            <div className="border border-white/30 bg-black/60 p-3.5 flex flex-col gap-3 rounded-none">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-2">
                <span className="font-bold text-white break-all">{inspected.filename}</span>
                <span className="px-2 py-0.5 border border-rose-500 text-rose-300 text-[14px]">
                  {inspected.detectedFormat}
                  {inspected.isZip ? ' + zip' : ''}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[14px]">
                <div className="p-2 border border-zinc-800 bg-zinc-950/70">
                  <div className="text-zinc-400">Версия</div>
                  <div className="font-bold text-white">{inspected.platformVersion || '—'}</div>
                </div>
                <div className="p-2 border border-zinc-800 bg-zinc-950/70">
                  <div className="text-zinc-400">Таблиц / Записей</div>
                  <div className="font-bold text-white">
                    {inspected.totalTables} / {inspected.totalRows}
                  </div>
                </div>
                <div className="p-2 border border-zinc-800 bg-zinc-950/70">
                  <div className="text-zinc-400">Время (МСК)</div>
                  <div className="font-bold text-white break-words">{inspected.createdAtMsk || '—'}</div>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-zinc-200">
                  Таблицы для восстановления ({selectedTables.length} из {inspected.tables.length})
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedTables(
                      selectedTables.length === inspected.tables.length
                        ? []
                        : inspected.tables.map((t) => t.name)
                    )
                  }
                  className="text-[14px] text-rose-400 hover:text-rose-300 underline cursor-pointer"
                >
                  {selectedTables.length === inspected.tables.length ? 'Снять все' : 'Выбрать все'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-1">
                {inspected.tables.map((t) => {
                  const checked = selectedTables.includes(t.name);
                  return (
                    <button
                      key={t.name}
                      type="button"
                      onClick={() => toggleTable(t.name)}
                      className={`p-2 border text-left flex items-center justify-between gap-2 text-[14px] cursor-pointer rounded-none ${
                        checked
                          ? 'border-white/50 bg-white/10 text-white'
                          : 'border-zinc-800 bg-black/40 text-zinc-400'
                      }`}
                    >
                      <span className="truncate font-mono">{t.name}</span>
                      <span className="text-zinc-300 shrink-0">{t.rowCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Restore Mode Strategy */}
          <div className="flex flex-col gap-2">
            <div className="font-bold text-white">Режим восстановления</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRestoreMode('merge')}
                className={`p-3 border text-left rounded-none cursor-pointer ${
                  restoreMode === 'merge'
                    ? 'border-rose-500 bg-rose-950/25 text-white'
                    : 'border-zinc-700 bg-black/50 text-zinc-300'
                }`}
              >
                <div className="font-bold">Безопасное слияние (Upsert)</div>
                <div className="text-[14px] text-zinc-400 mt-0.5">
                  Обновляет совпадающие записи и добавляет недостающие без удаления текущих строк
                </div>
              </button>

              <button
                type="button"
                onClick={() => setRestoreMode('replace')}
                className={`p-3 border text-left rounded-none cursor-pointer ${
                  restoreMode === 'replace'
                    ? 'border-rose-500 bg-rose-950/25 text-white'
                    : 'border-zinc-700 bg-black/50 text-zinc-300'
                }`}
              >
                <div className="font-bold flex items-center gap-1.5 text-rose-300">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Полная перезапись таблиц</span>
                </div>
                <div className="text-[14px] text-zinc-400 mt-0.5">
                  Очищает выбранные таблицы и полностью откатывает их на момент создания бэкапа
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIncludeSystemTables(!includeSystemTables)}
              className="p-2.5 border border-zinc-800 bg-black/50 text-left flex items-center gap-2.5 cursor-pointer rounded-none"
            >
              <span
                className={`w-5 h-5 border flex items-center justify-center shrink-0 rounded-none ${
                  includeSystemTables ? 'border-rose-500 bg-rose-600 text-white' : 'border-zinc-600 bg-black'
                }`}
              >
                {includeSystemTables && <Check className="w-3.5 h-3.5" />}
              </span>
              <span className="text-[14px] text-zinc-300">
                Перезаписать также настройки и журнал бэкапов (backup_settings, backup_history)
              </span>
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 border border-rose-500 bg-rose-950/40 text-rose-200 text-[14px] whitespace-pre-wrap break-words">
              {errorMsg}
            </div>
          )}

          {restoreResult && (
            <div className="p-3 border border-white/40 bg-black/75 flex flex-col gap-2 rounded-none">
              <div className="font-bold text-white flex items-center justify-between gap-2">
                <span>
                  {restoreResult.success
                    ? 'Восстановление базы завершено успешно'
                    : 'Восстановление завершено с предупреждениями'}
                </span>
                <span className="text-zinc-400">{restoreResult.durationMs} мс</span>
              </div>
              <div className="text-[14px] text-zinc-300">
                Обработано записей: <strong className="text-white">{restoreResult.totalRowsRestored}</strong>
              </div>
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1">
                {restoreResult.restoredTables.map((t) => (
                  <div
                    key={t.name}
                    className="flex items-center justify-between gap-2 border-b border-zinc-800 py-1 text-[14px]"
                  >
                    <span className="font-mono text-white truncate">{t.name}</span>
                    <span
                      className={
                        t.status === 'error'
                          ? 'text-rose-400 font-bold'
                          : t.status === 'skipped'
                          ? 'text-zinc-500'
                          : 'text-zinc-200'
                      }
                    >
                      {t.status === 'skipped'
                        ? 'пропущена'
                        : t.status === 'error'
                        ? `ошибка`
                        : `${t.rowsAttempted} → ${t.rowsAfter} в БД`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-4 border-t border-white/20 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
          <NoirButton variant="outline" onClick={onClose} showTail={false}>
            Закрыть
          </NoirButton>
          <NoirButton
            variant="danger"
            onClick={handleRestore}
            loading={restoring}
            icon={<RotateCcw className="w-4 h-4" />}
            showTail={false}
          >
            Запустить восстановление
          </NoirButton>
        </div>
      </div>
    </div>,
    document.body
  );
};
