import React, { useState, useRef, useEffect } from 'react';
import {
  Save,
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  Undo2,
  ImagePlus,
  Sparkles,
  FileInput,
} from 'lucide-react';
import { BookDraft, BookDraftStatus, BookDraftType, Chapter } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { runFieldActionFromButton } from '../../hooks/useGlobalFieldClipboard';

interface DraftFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  draft: BookDraft;
  chapters?: Chapter[];
  userUid?: number;
  readOnly?: boolean;
  onSave: (updated: Omit<BookDraft, 'id'>, existingId?: number) => Promise<void>;
  onDelete?: (draftId: number) => Promise<void>;
  onInsertIntoChapter?: (content: string, title: string) => void;
}

export const DraftFullscreenModal: React.FC<DraftFullscreenModalProps> = ({
  isOpen,
  onClose,
  draft,
  chapters = [],
  userUid,
  readOnly = false,
  onSave,
  onDelete,
  onInsertIntoChapter,
}) => {
  const [title, setTitle] = useState(draft.title);
  const [content, setContent] = useState(draft.content);
  const [draftType, setDraftType] = useState<BookDraftType>(draft.draft_type || 'book_note');
  const [chapterNumber, setChapterNumber] = useState<number | null>(draft.chapter_number ?? null);
  const [status, setStatus] = useState<BookDraftStatus>(draft.status || 'idea');
  const [includeInAi, setIncludeInAi] = useState<boolean>(draft.include_in_ai !== false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setTitle(draft.title);
    setContent(draft.content);
    setDraftType(draft.draft_type || 'book_note');
    setChapterNumber(draft.chapter_number ?? null);
    setStatus(draft.status || 'idea');
    setIncludeInAi(draft.include_in_ai !== false);
    setNotice('');
  }, [draft]);

  const handleSaveClick = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await onSave(
        {
          ...draft,
          title: title.trim() || 'Заметка без названия',
          content,
          draft_type: chapterNumber ? 'chapter_draft' : draftType,
          chapter_number: chapterNumber,
          status,
          include_in_ai: includeInAi,
        },
        draft.id > 0 ? draft.id : undefined
      );
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const runAction = (action: 'copy' | 'cut' | 'paste' | 'undo' | 'paste-image') => {
    void runFieldActionFromButton(action, textareaRef.current, {
      userUid,
      value: content,
      onValueChange: setContent,
      onNotice: (msg) => {
        setNotice(msg);
        setTimeout(() => setNotice(''), 2400);
      },
    });
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title={draft.id > 0 ? `Редактор черновика: ${title || 'Заметка'}` : 'Новая заметка / черновик'}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col gap-3.5 text-white font-['PT_Serif',serif]">
        {/* Header Metadata */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          <div className="md:col-span-2">
            <label className="block text-[14px] font-bold text-white mb-1">
              Заголовок заметки или черновика:
            </label>
            <NoirVoiceInput
              value={title}
              onValueChange={setTitle}
              voiceContext="draft_modal_title"
              disabled={readOnly}
              placeholder="Название сцены, идеи или черновика..."
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Статус работы:
            </label>
            <select
              value={status}
              disabled={readOnly}
              onChange={(e) => setStatus(e.target.value as BookDraftStatus)}
              className="w-full min-h-[44px] px-3 noir-input text-[14px] rounded-none"
            >
              <option value="idea" className="bg-zinc-950 text-white">Идея / набросок</option>
              <option value="in_work" className="bg-zinc-950 text-white">В работе</option>
              <option value="ready" className="bg-zinc-950 text-white">Готово для сборки</option>
              <option value="archive" className="bg-zinc-950 text-white">Архив</option>
            </select>
          </div>
        </div>

        {/* Target Assignment & AI Inclusion */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 p-3 bg-zinc-950/80 border border-zinc-800">
          <div>
            <label className="block text-[14px] font-bold text-zinc-300 mb-1">
              Тип материала:
            </label>
            <select
              value={draftType}
              disabled={readOnly}
              onChange={(e) => {
                const nextType = e.target.value as BookDraftType;
                setDraftType(nextType);
                if (nextType !== 'chapter_draft') setChapterNumber(null);
              }}
              className="w-full min-h-[44px] px-3 noir-input text-[14px] rounded-none"
            >
              <option value="book_note" className="bg-zinc-950 text-white">Заметка к книге</option>
              <option value="chapter_draft" className="bg-zinc-950 text-white">Черновик конкретной главы</option>
              <option value="note" className="bg-zinc-950 text-white">Свободная идея</option>
            </select>
          </div>

          <div>
            <label className="block text-[14px] font-bold text-zinc-300 mb-1">
              Привязка к главе:
            </label>
            {chapters.length > 0 ? (
              <select
                value={chapterNumber ?? ''}
                disabled={readOnly}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : null;
                  setChapterNumber(val);
                  if (val) setDraftType('chapter_draft');
                }}
                className="w-full min-h-[44px] px-3 noir-input text-[14px] rounded-none"
              >
                <option value="" className="bg-zinc-950 text-white">Для всей книги (без главы)</option>
                {chapters.map((c) => (
                  <option key={c.id || c.chapter_number} value={c.chapter_number} className="bg-zinc-950 text-white">
                    Глава #{c.chapter_number}: {c.title.slice(0, 38)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={1}
                disabled={readOnly}
                value={chapterNumber ?? ''}
                onChange={(e) => setChapterNumber(e.target.value ? Number(e.target.value) : null)}
                placeholder="Номер главы (опц.)"
                className="w-full min-h-[44px] px-3 noir-input text-[14px] rounded-none"
              />
            )}
          </div>

          <div className="flex items-end">
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setIncludeInAi(!includeInAi)}
              className={`w-full min-h-[44px] px-3 border text-[14px] font-bold flex items-center justify-center gap-2 transition cursor-pointer rounded-none ${
                includeInAi
                  ? 'bg-rose-950/70 text-white border-rose-500'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-700'
              }`}
            >
              <Sparkles className={`w-4 h-4 ${includeInAi ? 'text-rose-400' : 'text-zinc-500'}`} />
              <span>{includeInAi ? 'Учитывать в нейросети' : 'Скрыто от ИИ'}</span>
            </button>
          </div>
        </div>

        {/* Optional OCR Source Image Preview */}
        {draft.source_image_url && (
          <div className="p-2.5 bg-zinc-950/70 border border-zinc-800 flex flex-wrap items-center gap-3">
            <img
              src={draft.source_image_url}
              alt="Исходный скан черновика"
              className="w-16 h-16 object-cover border border-zinc-700 shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0 flex-1 text-[14px]">
              <strong className="text-white block">Исходный фото-скан (OCR)</strong>
              <span className="text-zinc-400 break-all line-clamp-1">{draft.source_image_url}</span>
            </div>
          </div>
        )}

        {/* Explicit Keyboard & Cloud Image Clipboard Toolbar */}
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-1.5 p-2 bg-zinc-950/90 border border-zinc-800">
            <button
              type="button"
              onClick={() => runAction('undo')}
              className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
              title="Отменить (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
              <span className="hidden sm:inline">Отменить</span>
            </button>
            <button
              type="button"
              onClick={() => runAction('copy')}
              className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
              title="Копировать (Ctrl+C)"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden sm:inline">Копировать</span>
            </button>
            <button
              type="button"
              onClick={() => runAction('cut')}
              className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
              title="Вырезать (Ctrl+X)"
            >
              <Scissors className="w-4 h-4" />
              <span className="hidden sm:inline">Вырезать</span>
            </button>
            <button
              type="button"
              onClick={() => runAction('paste')}
              className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
              title="Вставить (Ctrl+V)"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span className="hidden sm:inline">Вставить</span>
            </button>
            <button
              type="button"
              onClick={() => runAction('paste-image')}
              className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-rose-600 hover:text-white text-rose-400 border border-rose-500/70 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer rounded-none"
              title="Загрузить картинку из буфера обмена в облако и вставить ссылку"
            >
              <ImagePlus className="w-4 h-4" />
              <span>Картинка из буфера</span>
            </button>
            <span className="text-[14px] text-zinc-400 font-mono ml-auto">
              {content.length.toLocaleString()} симв.
            </span>
          </div>
        )}

        {notice && (
          <div className="px-3 py-1.5 bg-zinc-900 border border-rose-500/60 text-zinc-200 text-[14px]">
            {notice}
          </div>
        )}

        {/* Main Voice-Enabled Draft Editor */}
        <NoirVoiceTextarea
          ref={textareaRef}
          value={content}
          onValueChange={setContent}
          voiceContext="draft_fullscreen_body"
          disabled={readOnly}
          minRows={10}
          maxRows={22}
          placeholder="Текст черновика, сцены, реплик или заметки для книги (можно диктовать с микрофона и вставлять скриншоты Ctrl+V)..."
        />

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800">
          <div className="flex flex-wrap items-center gap-2">
            {draft.id > 0 && onDelete && !readOnly && (
              <NoirButton
                variant="danger"
                onClick={async () => {
                  await onDelete(draft.id);
                  onClose();
                }}
                icon={<Trash2 className="w-4 h-4" />}
              >
                Удалить
              </NoirButton>
            )}
            {onInsertIntoChapter && content.trim() && (
              <NoirButton
                variant="outline"
                onClick={() => {
                  onInsertIntoChapter(content, title);
                  onClose();
                }}
                icon={<FileInput className="w-4 h-4 text-rose-500" />}
              >
                Вставить в главу
              </NoirButton>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <NoirButton variant="subtle" onClick={onClose}>
              Закрыть
            </NoirButton>
            {!readOnly && (
              <NoirButton
                variant="primary"
                onClick={handleSaveClick}
                loading={saving}
                icon={<Save className="w-4 h-4 text-black" />}
              >
                Сохранить черновик
              </NoirButton>
            )}
          </div>
        </div>
      </div>
    </NoirModal>
  );
};
