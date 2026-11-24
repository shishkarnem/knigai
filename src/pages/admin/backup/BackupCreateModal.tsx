import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Archive, Send, Download, Check, Database } from 'lucide-react';
import { NoirButton } from '../../../components/common/NoirButton';
import { RubikMarkerHeading } from '../../../components/landing/RubikMarkerHeading';
import {
  BackupFormat,
  getBackupExtensionSuffix,
} from './backupClientTypes';
import { useAppVersion } from '../../../constants/appVersion';

interface BackupCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultFormat: BackupFormat;
  defaultIncludeZip: boolean;
  telegramChatId: string;
  onCreated: () => void;
}

const FORMAT_OPTIONS: Array<{
  id: BackupFormat;
  title: string;
  description: string;
}> = [
  {
    id: 'dump',
    title: 'PostgreSQL Custom Format (.dump)',
    description: 'Структурированный архив KnigAI со схемой, индексами и данными для быстрого восстановления',
  },
  {
    id: 'sql',
    title: 'Plain Text SQL (.sql)',
    description: 'Текстовый SQL-скрипт со структурой таблиц, последовательностями и командами INSERT',
  },
  {
    id: 'json',
    title: 'JSON Snapshot (.json)',
    description: 'Полный снимок всех таблиц, типов колонок и записей в структурированном формате JSON',
  },
  {
    id: 'all',
    title: 'Все форматы сразу (.dump + .sql + .json)',
    description: 'Единый комплект резервной копии, включающий все три формата базы данных',
  },
];

export const BackupCreateModal: React.FC<BackupCreateModalProps> = ({
  isOpen,
  onClose,
  defaultFormat,
  defaultIncludeZip,
  telegramChatId,
  onCreated,
}) => {
  const appVersion = useAppVersion();
  const [selectedFormat, setSelectedFormat] = useState<BackupFormat>(defaultFormat || 'dump');
  const [includeZip, setIncludeZip] = useState<boolean>(defaultIncludeZip);
  const [sendToTelegram, setSendToTelegram] = useState<boolean>(true);
  const [downloadLocally, setDownloadLocally] = useState<boolean>(false);
  const [reason, setReason] = useState<string>('Ручной бэкап базы данных из админки');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resultCaption, setResultCaption] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  const effectiveZip = selectedFormat === 'all' ? true : includeZip;

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrorMsg(null);
    setResultCaption(null);
    try {
      const res = await fetch('/api/admin/backups/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: selectedFormat,
          includeZip: effectiveZip,
          sendToTelegram,
          downloadDirectly: false,
          asyncJob: true,
          reason: reason.trim() || 'Ручной бэкап базы данных из админки',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Не удалось запустить создание резервной копии');
      }

      let finalRecord = data.record;
      let downloadUrl = data.downloadUrl || (finalRecord?.id ? `/api/admin/backups/${finalRecord.id}/download` : '');

      if (data.pending && finalRecord?.id) {
        for (let attempt = 0; attempt < 90; attempt++) {
          await new Promise((r) => setTimeout(r, 2000));
          const pollRes = await fetch(`/api/admin/backups/record/${finalRecord.id}`);
          if (!pollRes.ok) continue;
          const pollData = await pollRes.json();
          if (pollData.record && pollData.record.status !== 'running') {
            finalRecord = pollData.record;
            downloadUrl = pollData.downloadUrl || downloadUrl;
            break;
          }
        }
      }

      if (finalRecord?.status === 'running') {
        throw new Error('Резервная копия ещё формируется в фоне. Обновите журнал через пару секунд.');
      }
      if (finalRecord?.status === 'failed') {
        throw new Error(finalRecord.error_message || 'Ошибка при формировании или отправке копии');
      }

      if (downloadLocally && downloadUrl) {
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = finalRecord?.filename || 'kniga_backup';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setResultCaption(
        finalRecord?.telegram_caption || data.caption || 'Резервная копия успешно создана.'
      );
      onCreated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
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
        className="relative w-full max-w-xl my-auto max-h-[90dvh] flex flex-col noir-modal p-4 sm:p-6 text-white rounded-none border-2 border-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 mb-4 border-b border-white/20 shrink-0">
          <div className="min-w-0">
            <RubikMarkerHeading
              text='Создать резервную копию базы «KnigAI»'
              as="h3"
              className="text-[20px] sm:text-[22px] leading-snug break-words"
            />
            <p className="text-[14px] text-zinc-400 mt-1">
              База PostgreSQL: <span className="text-white font-bold">kniga</span> · Версия <span className="text-rose-400 font-bold">{appVersion}</span>
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

        {/* Scrollable Content */}
        <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1 text-[14px]">
          <div className="text-[14px] font-bold text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Формат резервной копии</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {FORMAT_OPTIONS.map((opt) => {
              const isSelected = selectedFormat === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSelectedFormat(opt.id)}
                  className={`w-full text-left p-3.5 border transition-colors rounded-none flex items-start gap-3 cursor-pointer ${
                    isSelected
                      ? 'border-rose-500 bg-rose-950/25 text-white'
                      : 'border-zinc-700 bg-black/50 hover:border-white/60 text-zinc-200'
                  }`}
                >
                  <span
                    className={`mt-0.5 w-5 h-5 border flex items-center justify-center shrink-0 rounded-none ${
                      isSelected ? 'border-rose-500 bg-rose-600' : 'border-zinc-500 bg-black'
                    }`}
                  >
                    {isSelected && <span className="w-2 h-2 bg-white block rounded-none" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] text-white break-words">{opt.title}</div>
                    <div className="text-[14px] text-zinc-400 mt-0.5 break-words">{opt.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Archive Checkbox */}
          <button
            type="button"
            onClick={() => selectedFormat !== 'all' && setIncludeZip(!includeZip)}
            className={`w-full text-left p-3.5 border transition-colors rounded-none flex items-start gap-3 cursor-pointer ${
              effectiveZip
                ? 'border-white bg-white/10 text-white'
                : 'border-zinc-700 bg-black/50 text-zinc-300'
            }`}
          >
            <span
              className={`mt-0.5 w-5 h-5 border flex items-center justify-center shrink-0 rounded-none ${
                effectiveZip ? 'border-rose-500 bg-rose-600 text-white' : 'border-zinc-500 bg-black'
              }`}
            >
              {effectiveZip && <Check className="w-3.5 h-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-[14px] text-white flex items-center gap-2 flex-wrap">
                <Archive className="w-4 h-4 text-rose-400" />
                <span>Выгрузить в виде архива (.zip)</span>
              </div>
              <div className="text-[14px] text-zinc-400 mt-0.5">
                {selectedFormat === 'all'
                  ? 'Для комплекта всех форматов автоматически формируется единый ZIP-архив'
                  : `Файл .${selectedFormat} будет упакован в стандартный ZIP-архив`}
              </div>
            </div>
          </button>

          {/* Delivery targets */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => setSendToTelegram(!sendToTelegram)}
              className={`p-3 border text-left rounded-none flex items-center gap-2.5 cursor-pointer ${
                sendToTelegram
                  ? 'border-rose-500 bg-rose-950/25 text-white'
                  : 'border-zinc-700 bg-black/50 text-zinc-300'
              }`}
            >
              <span
                className={`w-5 h-5 border flex items-center justify-center shrink-0 rounded-none ${
                  sendToTelegram ? 'border-rose-500 bg-rose-600 text-white' : 'border-zinc-500 bg-black'
                }`}
              >
                {sendToTelegram && <Check className="w-3.5 h-3.5" />}
              </span>
              <Send className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="text-[14px] font-bold break-words">
                В Telegram ({telegramChatId || '—'})
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDownloadLocally(!downloadLocally)}
              className={`p-3 border text-left rounded-none flex items-center gap-2.5 cursor-pointer ${
                downloadLocally
                  ? 'border-white bg-white/10 text-white'
                  : 'border-zinc-700 bg-black/50 text-zinc-300'
              }`}
            >
              <span
                className={`w-5 h-5 border flex items-center justify-center shrink-0 rounded-none ${
                  downloadLocally ? 'border-white bg-white text-black' : 'border-zinc-500 bg-black'
                }`}
              >
                {downloadLocally && <Check className="w-3.5 h-3.5" />}
              </span>
              <Download className="w-4 h-4 text-white shrink-0" />
              <span className="text-[14px] font-bold">Скачать на устройство</span>
            </button>
          </div>

          {/* Reason input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] text-zinc-300 font-bold">Причина бэкапа (для отчёта)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="noir-input px-3 py-2.5 text-[14px] w-full rounded-none"
              placeholder="Ручной бэкап базы данных из админки"
            />
          </div>

          {errorMsg && (
            <div className="p-3 border border-rose-500 bg-rose-950/40 text-rose-200 text-[14px] break-words">
              {errorMsg}
            </div>
          )}

          {resultCaption && (
            <div className="p-3 border border-white/40 bg-black/70 text-zinc-100 text-[14px] whitespace-pre-wrap break-words font-mono">
              {resultCaption}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-4 border-t border-white/20 flex flex-col-reverse sm:flex-row justify-end gap-3 shrink-0">
          <NoirButton variant="outline" onClick={onClose} showTail={false}>
            Закрыть
          </NoirButton>
          <NoirButton
            variant="primary"
            onClick={handleSubmit}
            loading={submitting}
            showTail={false}
          >
            {`Создать копию ${getBackupExtensionSuffix(selectedFormat, effectiveZip)}`}
          </NoirButton>
        </div>
      </div>
    </div>,
    document.body
  );
};
