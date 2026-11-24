import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Camera,
  Layers,
  Merge,
  Plus,
  Sparkles,
  Upload,
  Undo2,
  ClipboardPaste,
  ImagePlus,
  FolderOpen,
} from 'lucide-react';
import { Book, BookDraft, Chapter } from '../../types';
import {
  attachDraftToBookOrChapter,
  deleteDraft,
  fetchDrafts,
  reorderDrafts,
  saveDraft,
  toggleDraftIncludeInAi,
} from '../../services/drafts/draftsRepository';
import { parseUploadedFileToText } from '../../services/import/bookParser';
import { recognizeDraftImageOcr } from '../../services/drafts/ocrService';
import { runFieldActionFromButton } from '../../hooks/useGlobalFieldClipboard';
import { NoirButton } from '../common/NoirButton';
import { NoirStatus } from '../common/NoirStatus';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { DraftCardItem } from './DraftCardItem';
import { DraftFullscreenModal } from './DraftFullscreenModal';

interface DraftsManagerPanelProps {
  book?: Book | null;
  chapters?: Chapter[];
  activeChapterNumber?: number | null;
  userUid?: number;
  readOnly?: boolean;
  compact?: boolean;
  onDraftsChanged?: (drafts: BookDraft[]) => void;
  onInsertIntoChapter?: (content: string, title: string) => void;
  onAssembleChapter?: (combinedText: string, suggestedTitle: string) => void;
}

type DraftScopeTab = 'chapter' | 'book' | 'basket';

export const DraftsManagerPanel: React.FC<DraftsManagerPanelProps> = ({
  book,
  chapters = [],
  activeChapterNumber = null,
  userUid,
  readOnly = false,
  compact = false,
  onDraftsChanged,
  onInsertIntoChapter,
  onAssembleChapter,
}) => {
  const uidPrefix = useId();
  const [scope, setScope] = useState<DraftScopeTab>(activeChapterNumber ? 'chapter' : 'book');
  const [drafts, setDrafts] = useState<BookDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [editingDraft, setEditingDraft] = useState<BookDraft | null>(null);

  // Quick Add composer
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [includeNewInAi, setIncludeNewInAi] = useState(true);
  const [busyMsg, setBusyMsg] = useState('');
  const [ocrPercent, setOcrPercent] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (activeChapterNumber) {
      setScope('chapter');
    }
  }, [activeChapterNumber]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const list = await fetchDrafts({
        userUid: userUid ?? book?.user_uid,
        bookId: book?.id ?? null,
        includeUnattached: true,
      });
      setDrafts(list);
      onDraftsChanged?.(list);
    } catch {
      // ignore offline
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [book?.id, userUid]);

  const chapterDrafts = activeChapterNumber
    ? drafts.filter(
        (d) =>
          Number(d.book_id) === Number(book?.id) &&
          Number(d.chapter_number) === Number(activeChapterNumber)
      )
    : [];

  const bookDrafts = book
    ? drafts.filter((d) => Number(d.book_id) === Number(book.id))
    : [];

  const basketDrafts = drafts.filter((d) => d.book_id == null);

  const visibleDrafts =
    scope === 'chapter' && activeChapterNumber
      ? chapterDrafts
      : scope === 'basket'
      ? basketDrafts
      : bookDrafts;

  const activeAiCount = drafts.filter(
    (d) => (d.book_id === book?.id || d.book_id == null) && d.include_in_ai && d.status !== 'archive'
  ).length;

  const handleCreateQuickDraft = async () => {
    if (readOnly || !newContent.trim()) return;
    setErrorMsg('');
    const targetChapter = scope === 'chapter' && activeChapterNumber ? activeChapterNumber : null;
    const targetBookId = scope === 'basket' ? null : book?.id ?? null;

    const saved = await saveDraft({
      user_uid: userUid ?? book?.user_uid ?? null,
      book_id: targetBookId,
      chapter_id: null,
      chapter_number: targetChapter,
      draft_type: targetChapter ? 'chapter_draft' : targetBookId ? 'book_note' : 'unattached',
      title: newTitle.trim() || (targetChapter ? `Черновик для гл. #${targetChapter}` : 'Авторская заметка'),
      content: newContent.trim(),
      source_type: 'manual',
      source_image_url: null,
      status: 'idea',
      include_in_ai: includeNewInAi,
      sort_order: visibleDrafts.length + 1,
    });
    const next = [saved, ...drafts];
    setDrafts(next);
    onDraftsChanged?.(next);
    setNewTitle('');
    setNewContent('');
  };

  const handleUploadTextFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || readOnly) return;
    setErrorMsg('');
    setBusyMsg('Читаем и разбираем загруженные файлы черновиков...');
    try {
      const targetChapter = scope === 'chapter' && activeChapterNumber ? activeChapterNumber : null;
      const targetBookId = scope === 'basket' ? null : book?.id ?? null;
      const added: BookDraft[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const parsed = await parseUploadedFileToText(f);
        if (parsed.text.trim()) {
          const saved = await saveDraft({
            user_uid: userUid ?? book?.user_uid ?? null,
            book_id: targetBookId,
            chapter_id: null,
            chapter_number: targetChapter,
            draft_type: targetChapter ? 'chapter_draft' : targetBookId ? 'book_note' : 'unattached',
            title: parsed.detectedTitle || f.name.replace(/\.[^/.]+$/, ''),
            content: parsed.text.trim(),
            source_type: 'file',
            source_image_url: null,
            status: 'in_work',
            include_in_ai: true,
            sort_order: visibleDrafts.length + i + 1,
          });
          added.push(saved);
        }
      }
      if (added.length > 0) {
        const next = [...added, ...drafts];
        setDrafts(next);
        onDraftsChanged?.(next);
        setBusyMsg(`Загружено и сохранено черновиков: ${added.length} шт.`);
      }
    } catch (err: unknown) {
      setErrorMsg('Ошибка чтения файла черновика: ' + (err instanceof Error ? err.message : ''));
    } finally {
      e.target.value = '';
      setTimeout(() => setBusyMsg(''), 3000);
    }
  };

  const handleUploadPhotoOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || readOnly) return;
    setErrorMsg('');
    try {
      const targetChapter = scope === 'chapter' && activeChapterNumber ? activeChapterNumber : null;
      const targetBookId = scope === 'basket' ? null : book?.id ?? null;
      const created: BookDraft[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setOcrPercent(10);
        setBusyMsg(`Скан ${i + 1}/${files.length}: загрузка и распознавание текста (OCR)...`);
        const res = await recognizeDraftImageOcr({
          file,
          filename: file.name,
          userUid,
          onProgress: (msg, pct) => {
            setBusyMsg(`[${i + 1}/${files.length}] ${msg}`);
            if (typeof pct === 'number') setOcrPercent(pct);
          },
        });
        const saved = await saveDraft({
          user_uid: userUid ?? book?.user_uid ?? null,
          book_id: targetBookId,
          chapter_id: null,
          chapter_number: targetChapter,
          draft_type: targetChapter ? 'chapter_draft' : targetBookId ? 'book_note' : 'unattached',
          title: res.suggestedTitle,
          content: res.recognizedText,
          source_type: 'ocr_image',
          source_image_url: res.imageUrl,
          status: 'in_work',
          include_in_ai: true,
          sort_order: visibleDrafts.length + i + 1,
        });
        created.push(saved);
      }

      const next = [...created, ...drafts];
      setDrafts(next);
      onDraftsChanged?.(next);
      setBusyMsg(`Распознано и сохранено фото-черновиков: ${created.length} шт.`);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка OCR распознавания фото');
    } finally {
      setOcrPercent(null);
      e.target.value = '';
      setTimeout(() => setBusyMsg(''), 3500);
    }
  };

  const handleToggleAi = async (d: BookDraft) => {
    if (readOnly) return;
    const nextVal = !d.include_in_ai;
    await toggleDraftIncludeInAi(d.id, nextVal);
    const next = drafts.map((item) => (item.id === d.id ? { ...item, include_in_ai: nextVal } : item));
    setDrafts(next);
    onDraftsChanged?.(next);
  };

  const handleDelete = async (id: number) => {
    if (readOnly) return;
    await deleteDraft(id);
    const next = drafts.filter((d) => d.id !== id);
    setDrafts(next);
    setSelectedIds((prev) => prev.filter((x) => x !== id));
    onDraftsChanged?.(next);
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    if (readOnly) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= visibleDrafts.length) return;
    const reorderedVisible = [...visibleDrafts];
    const tmp = reorderedVisible[index];
    reorderedVisible[index] = reorderedVisible[targetIdx];
    reorderedVisible[targetIdx] = tmp;

    await reorderDrafts(reorderedVisible.map((d) => d.id));
    const idOrder = new Map(reorderedVisible.map((d, i) => [d.id, i + 1]));
    const next = drafts
      .map((d) => (idOrder.has(d.id) ? { ...d, sort_order: idOrder.get(d.id)! } : d))
      .sort((a, b) => a.sort_order - b.sort_order);
    setDrafts(next);
    onDraftsChanged?.(next);
  };

  const handleAssignChapter = async (d: BookDraft, chapNum: number | null) => {
    if (!book?.id || readOnly) return;
    await attachDraftToBookOrChapter({
      draftId: d.id,
      bookId: book.id,
      chapterNumber: chapNum,
      draftType: chapNum ? 'chapter_draft' : 'book_note',
    });
    const next = drafts.map((x) =>
      x.id === d.id
        ? {
            ...x,
            book_id: book.id,
            chapter_number: chapNum,
            draft_type: (chapNum ? 'chapter_draft' : 'book_note') as BookDraft['draft_type'],
          }
        : x
    );
    setDrafts(next);
    onDraftsChanged?.(next);
  };

  const handleAttachToBook = async (d: BookDraft) => {
    if (!book?.id || readOnly) return;
    const targetChap = activeChapterNumber || null;
    await attachDraftToBookOrChapter({
      draftId: d.id,
      bookId: book.id,
      chapterNumber: targetChap,
      draftType: targetChap ? 'chapter_draft' : 'book_note',
    });
    const next = drafts.map((x) =>
      x.id === d.id
        ? {
            ...x,
            book_id: book.id,
            chapter_number: targetChap,
            draft_type: (targetChap ? 'chapter_draft' : 'book_note') as BookDraft['draft_type'],
          }
        : x
    );
    setDrafts(next);
    onDraftsChanged?.(next);
    setBusyMsg(`Заметка «${d.title}» прикреплена к книге.`);
    setTimeout(() => setBusyMsg(''), 2500);
  };

  const handleMergeSelected = async () => {
    if (selectedIds.length < 2 || readOnly) return;
    const picked = visibleDrafts.filter((d) => selectedIds.includes(d.id));
    if (picked.length < 2) return;
    const mergedTitle = picked.map((p) => p.title).slice(0, 2).join(' + ');
    const mergedBody = picked.map((p) => `## ${p.title}\n\n${p.content.trim()}`).join('\n\n* * *\n\n');
    const saved = await saveDraft({
      user_uid: userUid ?? book?.user_uid ?? null,
      book_id: scope === 'basket' ? null : book?.id ?? null,
      chapter_id: null,
      chapter_number: scope === 'chapter' && activeChapterNumber ? activeChapterNumber : null,
      draft_type: scope === 'chapter' && activeChapterNumber ? 'chapter_draft' : book ? 'book_note' : 'unattached',
      title: `Склейка: ${mergedTitle}`.slice(0, 90),
      content: mergedBody,
      source_type: 'manual',
      source_image_url: null,
      status: 'included',
      include_in_ai: true,
      sort_order: 0,
    });
    const next = [saved, ...drafts];
    setDrafts(next);
    setSelectedIds([]);
    onDraftsChanged?.(next);
    setBusyMsg(`Склеено ${picked.length} заметок в новый черновик «${saved.title}».`);
    setTimeout(() => setBusyMsg(''), 2800);
  };

  const handleAssembleSelected = () => {
    if (!onAssembleChapter) return;
    const picked =
      selectedIds.length > 0
        ? visibleDrafts.filter((d) => selectedIds.includes(d.id))
        : visibleDrafts;
    if (picked.length === 0) return;
    const combinedText = picked.map((p) => p.content.trim()).filter(Boolean).join('\n\n* * *\n\n');
    onAssembleChapter(combinedText, picked[0].title);
  };

  return (
    <div className={`noir-container border border-zinc-700 flex flex-col gap-3.5 text-white min-w-0 ${compact ? 'p-3' : 'p-4 sm:p-5'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-zinc-800">
        <div className="min-w-0">
          <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Личные черновики и заметки</span>
          </h3>
          <p className="text-[14px] text-zinc-400 mt-0.5">
            Активных в ИИ: <strong className="text-rose-400">{activeAiCount}</strong> · диктуйте голосом, загружайте файлы или фото рукописей.
          </p>
        </div>
      </div>

      {/* Vertical / Wrapping Scope Switcher (zero horizontal scroll) */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1.5">
        {activeChapterNumber && (
          <button
            type="button"
            onClick={() => {
              setScope('chapter');
              setSelectedIds([]);
            }}
            className={`min-h-[42px] px-3 text-[14px] font-bold border text-left transition cursor-pointer ${
              scope === 'chapter'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            Черновики главы #{activeChapterNumber} ({chapterDrafts.length})
          </button>
        )}

        {book && (
          <button
            type="button"
            onClick={() => {
              setScope('book');
              setSelectedIds([]);
            }}
            className={`min-h-[42px] px-3 text-[14px] font-bold border text-left transition cursor-pointer ${
              scope === 'book'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            Заметки книги ({bookDrafts.length})
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setScope('basket');
            setSelectedIds([]);
          }}
          className={`min-h-[42px] px-3 text-[14px] font-bold border text-left transition cursor-pointer flex items-center gap-1.5 ${
            scope === 'basket'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-white'
          }`}
        >
          <FolderOpen className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Корзина идей ({basketDrafts.length})</span>
        </button>
      </div>

      {busyMsg && (
        <div className="p-2.5 bg-zinc-950 border border-rose-500/70 flex flex-col gap-1.5 text-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-200">{busyMsg}</span>
            {ocrPercent !== null && (
              <span className="font-mono text-rose-400 font-bold">{ocrPercent}%</span>
            )}
          </div>
          {ocrPercent !== null && (
            <div className="w-full h-1.5 bg-zinc-900 overflow-hidden">
              <div
                className="h-full bg-rose-600 transition-all duration-200"
                style={{ width: `${ocrPercent}%` }}
              />
            </div>
          )}
        </div>
      )}
      {errorMsg && <NoirStatus type="error" message={errorMsg} />}

      {/* Quick Composer (manual, voice, file, photo OCR) */}
      {!readOnly && (
        <div className="p-3 bg-zinc-950/85 border border-zinc-800 flex flex-col gap-2.5">
          <NoirVoiceInput
            value={newTitle}
            onValueChange={setNewTitle}
            voiceContext="quick_draft_title"
            placeholder="Заголовок заметки / сцены (необязательно)..."
          />

          <NoirVoiceTextarea
            ref={composerRef}
            value={newContent}
            onValueChange={setNewContent}
            voiceContext="quick_draft_body"
            minRows={compact ? 3 : 4}
            maxRows={10}
            placeholder="Запишите идею, надиктуйте голосом через микрофон или вставьте картинку через Ctrl+V..."
          />

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => runFieldActionFromButton('undo', composerRef.current, { userUid })}
              className="min-h-[36px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-300 border border-zinc-700 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Отменить (Ctrl+Z)"
            >
              <Undo2 className="w-3.5 h-3.5" />
              {!compact && <span>Отменить</span>}
            </button>
            <button
              type="button"
              onClick={() =>
                runFieldActionFromButton('paste', composerRef.current, {
                  userUid,
                  value: newContent,
                  onValueChange: setNewContent,
                })
              }
              className="min-h-[36px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-300 border border-zinc-700 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Вставить из буфера (Ctrl+V)"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              {!compact && <span>Вставить</span>}
            </button>
            <button
              type="button"
              onClick={() =>
                runFieldActionFromButton('paste-image', composerRef.current, {
                  userUid,
                  value: newContent,
                  onValueChange: setNewContent,
                })
              }
              className="min-h-[36px] px-2.5 bg-zinc-900 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/70 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Загрузить изображение из буфера обмена в облако"
            >
              <ImagePlus className="w-3.5 h-3.5" />
              <span>Картинка из буфера</span>
            </button>

            <button
              type="button"
              onClick={() => setIncludeNewInAi(!includeNewInAi)}
              className={`min-h-[36px] px-2.5 border text-[14px] font-bold flex items-center gap-1 cursor-pointer ml-auto ${
                includeNewInAi
                  ? 'bg-rose-950/70 text-white border-rose-500'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>{includeNewInAi ? 'В ИИ' : 'Не слать ИИ'}</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <NoirButton
              variant="primary"
              onClick={handleCreateQuickDraft}
              disabled={!newContent.trim()}
              icon={<Plus className="w-4 h-4 text-black" />}
            >
              Сохранить заметку
            </NoirButton>

            <label
              htmlFor={`drafts-file-${uidPrefix}`}
              className="min-h-[42px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Upload className="w-4 h-4 text-rose-500" />
              <span>Файл (.txt/.docx/.fb2/.pdf)</span>
            </label>
            <input
              id={`drafts-file-${uidPrefix}`}
              type="file"
              multiple
              accept=".txt,.md,.fb2,.epub,.docx,.doc,.pdf"
              onChange={handleUploadTextFiles}
              className="hidden"
            />

            <label
              htmlFor={`drafts-ocr-${uidPrefix}`}
              className="min-h-[42px] px-3 bg-zinc-900 hover:bg-rose-600 text-white border border-rose-500 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer transition"
              title="Загрузить фото блокнота или скан — ИИ распознает текст и сохранит редактируемый черновик"
            >
              <Camera className="w-4 h-4 text-rose-400" />
              <span>Фото / скан (OCR)</span>
            </label>
            <input
              id={`drafts-ocr-${uidPrefix}`}
              type="file"
              multiple
              accept="image/*"
              onChange={handleUploadPhotoOcr}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Batch Toolbar */}
      {visibleDrafts.length > 0 && (selectedIds.length > 0 || onAssembleChapter) && (
        <div className="p-2.5 bg-zinc-950 border border-zinc-700 flex flex-wrap items-center justify-between gap-2 text-[14px]">
          <span className="text-zinc-300">
            Выбрано: <strong className="text-white font-mono">{selectedIds.length}</strong> из {visibleDrafts.length}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.length >= 2 && !readOnly && (
              <NoirButton
                variant="outline"
                onClick={handleMergeSelected}
                icon={<Merge className="w-4 h-4 text-rose-500" />}
              >
                Склеить выбранные
              </NoirButton>
            )}
            {onAssembleChapter && (
              <NoirButton
                variant="primary"
                onClick={handleAssembleSelected}
                icon={<Layers className="w-4 h-4 text-black" />}
              >
                {selectedIds.length > 0 ? 'Собрать главу из выбранных' : 'Собрать главу из всех'}
              </NoirButton>
            )}
          </div>
        </div>
      )}

      {/* Drafts List */}
      {loading ? (
        <div className="p-6 text-center text-[14px] text-zinc-400 border border-zinc-800">
          Загрузка черновиков из базы данных...
        </div>
      ) : visibleDrafts.length === 0 ? (
        <div className="p-6 text-center text-[14px] text-zinc-400 border border-zinc-800 bg-black/50">
          В этом разделе пока нет заметок. Надиктуйте текст голосом, вставьте текст или загрузите фото рукописи!
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {visibleDrafts.map((d, idx) => (
            <DraftCardItem
              key={d.id}
              draft={d}
              index={idx}
              total={visibleDrafts.length}
              selected={selectedIds.includes(d.id)}
              chapters={chapters}
              readOnly={readOnly}
              onToggleSelect={(id) =>
                setSelectedIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              onOpenDetail={(item) => setEditingDraft(item)}
              onToggleIncludeAi={handleToggleAi}
              onMove={handleMove}
              onDelete={handleDelete}
              onAssignChapter={book ? handleAssignChapter : undefined}
              onInsertText={
                onInsertIntoChapter ? (item) => onInsertIntoChapter(item.content, item.title) : undefined
              }
              onAttachToBook={book && d.book_id == null ? handleAttachToBook : undefined}
            />
          ))}
        </div>
      )}

      {editingDraft && (
        <DraftFullscreenModal
          isOpen={Boolean(editingDraft)}
          onClose={() => setEditingDraft(null)}
          draft={editingDraft}
          chapters={chapters}
          userUid={userUid}
          readOnly={readOnly}
          onSave={async (updated, existingId) => {
            const saved = await saveDraft(updated, existingId);
            const next = existingId
              ? drafts.map((x) => (x.id === existingId ? saved : x))
              : [saved, ...drafts];
            setDrafts(next);
            onDraftsChanged?.(next);
          }}
          onDelete={handleDelete}
          onInsertIntoChapter={onInsertIntoChapter}
        />
      )}
    </div>
  );
};
