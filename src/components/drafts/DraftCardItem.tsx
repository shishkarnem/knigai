import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  CheckSquare,
  FileInput,
  FileText,
  Mic,
  ScanText,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { BookDraft, Chapter } from '../../types';

interface DraftCardItemProps {
  draft: BookDraft;
  index: number;
  total: number;
  selected: boolean;
  chapters?: Chapter[];
  readOnly?: boolean;
  onToggleSelect: (id: number) => void;
  onOpenDetail: (draft: BookDraft) => void;
  onToggleIncludeAi: (draft: BookDraft) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onDelete: (id: number) => void;
  onAssignChapter?: (draft: BookDraft, chapterNumber: number | null) => void;
  onInsertText?: (draft: BookDraft) => void;
  onAttachToBook?: (draft: BookDraft) => void;
}

const SOURCE_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  manual: { label: 'ручной', icon: <FileText className="w-3.5 h-3.5 text-zinc-400" /> },
  voice: { label: 'голос', icon: <Mic className="w-3.5 h-3.5 text-rose-400" /> },
  file: { label: 'файл', icon: <FileText className="w-3.5 h-3.5 text-zinc-300" /> },
  ocr_photo: { label: 'скан OCR', icon: <ScanText className="w-3.5 h-3.5 text-rose-400" /> },
};

const STATUS_LABELS: Record<string, string> = {
  idea: 'Идея',
  in_work: 'В работе',
  ready: 'Готово',
  archive: 'Архив',
};

export const DraftCardItem: React.FC<DraftCardItemProps> = ({
  draft,
  index,
  total,
  selected,
  chapters = [],
  readOnly = false,
  onToggleSelect,
  onOpenDetail,
  onToggleIncludeAi,
  onMove,
  onDelete,
  onAssignChapter,
  onInsertText,
  onAttachToBook,
}) => {
  const srcMeta = SOURCE_LABELS[draft.source_type || 'manual'] || SOURCE_LABELS.manual;

  return (
    <div
      className={`p-3.5 bg-black/80 border transition flex flex-col gap-2.5 min-w-0 ${
        selected ? 'border-rose-500' : 'border-zinc-800 hover:border-zinc-600'
      }`}
    >
      {/* Top Row: Selection + Badges + Source Thumbnail */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onToggleSelect(draft.id)}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white shrink-0 cursor-pointer"
            title={selected ? 'Снять выбор' : 'Выбрать для склейки или сборки главы'}
          >
            {selected ? (
              <CheckSquare className="w-4 h-4 text-rose-500" />
            ) : (
              <Square className="w-4 h-4 text-zinc-400" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenDetail(draft)}
            className="min-w-0 flex-1 text-left cursor-pointer group"
            title="Нажмите, чтобы открыть и отредактировать полный текст заметки"
          >
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-[14px] text-zinc-300">
                {srcMeta.icon}
                <span>{srcMeta.label}</span>
              </span>

              {draft.book_id == null ? (
                <span className="px-2 py-0.5 bg-zinc-900 border border-rose-500/70 text-rose-300 text-[14px] font-bold">
                  корзина идей
                </span>
              ) : draft.chapter_number ? (
                <span className="px-2 py-0.5 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] font-bold">
                  глава #{draft.chapter_number}
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-200 text-[14px]">
                  заметка книги
                </span>
              )}

              <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-400 text-[14px]">
                {STATUS_LABELS[draft.status] || 'Идея'}
              </span>
            </div>

            <h4 className="text-[15px] font-bold text-white group-hover:text-rose-400 transition-colors break-words leading-snug">
              {draft.title}
            </h4>
            <p className="text-[14px] text-zinc-300 line-clamp-2 mt-1 leading-relaxed break-words">
              {draft.content || 'Пустой черновик...'}
            </p>
            <span className="text-[14px] font-mono text-zinc-500 mt-1 inline-block">
              {draft.content.length.toLocaleString()} симв. · Нажмите, чтобы раскрыть
            </span>
          </button>
        </div>

        {draft.source_image_url && (
          <button
            type="button"
            onClick={() => onOpenDetail(draft)}
            className="w-14 h-16 border border-zinc-700 overflow-hidden shrink-0 cursor-pointer"
            title="Открыть черновик и фото-скан"
          >
            <img
              src={draft.source_image_url}
              alt={draft.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </button>
        )}
      </div>

      {/* Bottom Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-900">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={readOnly}
            onClick={() => onToggleIncludeAi(draft)}
            className={`min-h-[36px] px-2.5 border text-[14px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 ${
              draft.include_in_ai
                ? 'bg-rose-950/70 text-white border-rose-500'
                : 'bg-zinc-900 text-zinc-400 border-zinc-700'
            }`}
            title="Отправлять ли эту заметку в контекст нейросети при генерации"
          >
            <Sparkles className={`w-3.5 h-3.5 ${draft.include_in_ai ? 'text-rose-400' : 'text-zinc-500'}`} />
            <span>{draft.include_in_ai ? 'В ИИ' : 'Игнор ИИ'}</span>
          </button>

          {draft.book_id == null && onAttachToBook && !readOnly && (
            <button
              type="button"
              onClick={() => onAttachToBook(draft)}
              className="min-h-[36px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-white text-[14px] font-bold cursor-pointer"
            >
              Прикрепить к книге
            </button>
          )}

          {draft.book_id != null && onAssignChapter && chapters.length > 0 && !readOnly && (
            <select
              value={draft.chapter_number ?? ''}
              onChange={(e) => onAssignChapter(draft, e.target.value ? Number(e.target.value) : null)}
              className="min-h-[36px] px-2 noir-input text-[14px] rounded-none max-w-[165px]"
              aria-label="Привязать к главе"
            >
              <option value="" className="bg-zinc-950 text-white">Вся книга</option>
              {chapters.map((c) => (
                <option key={c.id || c.chapter_number} value={c.chapter_number} className="bg-zinc-950 text-white">
                  Гл. #{c.chapter_number}
                </option>
              ))}
            </select>
          )}

          {onInsertText && (
            <button
              type="button"
              onClick={() => onInsertText(draft)}
              className="min-h-[36px] px-2.5 bg-white text-black border border-white hover:bg-zinc-200 text-[14px] font-bold flex items-center gap-1 cursor-pointer"
              title="Вставить текст заметки на место курсора"
            >
              <FileInput className="w-3.5 h-3.5" />
              <span>В текст</span>
            </button>
          )}
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1 shrink-0 ml-auto">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => onMove(index, 'up')}
              className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 disabled:opacity-30 cursor-pointer"
              title="Переместить выше"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={index >= total - 1}
              onClick={() => onMove(index, 'down')}
              className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 disabled:opacity-30 cursor-pointer"
              title="Переместить ниже"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(draft.id)}
              className="w-9 h-9 flex items-center justify-center bg-rose-950/70 border border-rose-700 hover:bg-rose-700 text-rose-200 hover:text-white cursor-pointer ml-1"
              title="Удалить черновик"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
