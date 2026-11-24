import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { NoirModal } from '../../../components/common/NoirModal';
import { NoirButton } from '../../../components/common/NoirButton';

interface TableRowModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableName: string;
  row: Record<string, unknown> | null;
}

export const TableRowModal: React.FC<TableRowModalProps> = ({
  isOpen,
  onClose,
  tableName,
  row,
}) => {
  const [copied, setCopied] = useState(false);

  if (!row) return null;

  const jsonPretty = JSON.stringify(row, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonPretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Запись таблицы «${tableName}»`}
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4 text-white max-h-[80vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
          <span className="text-[14px] text-zinc-400">
            Полей в записи: <strong className="text-white">{Object.keys(row).length}</strong>
          </span>
          <NoirButton
            variant="outline"
            onClick={handleCopy}
            icon={copied ? <Check className="w-4 h-4 text-rose-400" /> : <Copy className="w-4 h-4" />}
          >
            {copied ? 'JSON скопирован' : 'Копировать JSON'}
          </NoirButton>
        </div>

        <div className="flex flex-col gap-2">
          {Object.entries(row).map(([key, value]) => {
            const displayVal =
              value === null
                ? 'NULL'
                : typeof value === 'object'
                ? JSON.stringify(value, null, 2)
                : String(value);

            return (
              <div key={key} className="p-2.5 bg-zinc-950/90 border border-zinc-800 flex flex-col gap-1">
                <span className="text-[14px] font-mono font-bold text-rose-400 break-all">
                  {key}
                </span>
                <pre className="text-[14px] text-zinc-200 font-mono whitespace-pre-wrap break-words max-h-60 overflow-y-auto">
                  {displayVal}
                </pre>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <NoirButton variant="subtle" onClick={onClose}>
            Закрыть
          </NoirButton>
        </div>
      </div>
    </NoirModal>
  );
};
