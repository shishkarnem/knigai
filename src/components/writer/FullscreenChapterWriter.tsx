import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  ClipboardPaste,
  Copy,
  Delete,
  Heading2,
  Image as ImageIcon,
  ImagePlus,
  Italic,
  Maximize2,
  Minus,
  PanelRight,
  Quote,
  Redo2,
  Save,
  Scissors,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { Book, Chapter, Character, WorldEntity } from '../../types';
import { saveChapter } from '../../services/db/bookRepository';
import { saveChapterRevision } from '../../services/db/revisions/revisionRepository';
import { handleClipboardImageUploadAndInsert } from '../../services/storage/clipboardImageUpload';
import { NoirVoiceMicButton } from '../voice/NoirVoiceMicButton';
import { computeWriterStats, replaceSelectionRange } from './writerUtils';
import { WriterImageToolsModal } from './WriterImageToolsModal';
import { WriterSidePanel } from './WriterSidePanel';

interface FullscreenChapterWriterProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapter: Chapter;
  allChapters: Chapter[];
  characters: Character[];
  worldEntities: WorldEntity[];
  userUid?: number;
  onChapterSaved: (updated: Chapter) => void;
}

export const FullscreenChapterWriter: React.FC<FullscreenChapterWriterProps> = ({
  isOpen,
  onClose,
  book,
  chapter,
  allChapters,
  characters,
  worldEntities,
  userUid,
  onChapterSaved,
}) => {
  const [title, setTitle] = useState(chapter.title);
  const [content, setContent] = useState(chapter.content || '');
  const [authorComment, setAuthorComment] = useState(chapter.author_comment || '');
  const [entityIds, setEntityIds] = useState<number[]>(chapter.entity_ids || []);

  // History stack for complete Undo/Redo across keyboard + programmatic inserts + voice
  const [history, setHistory] = useState<string[]>([chapter.content || '']);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Writer Mode & Aesthetics
  const [writerStyle, setWriterStyle] = useState<'word' | 'notepad'>('word');
  const [sheetTone, setSheetTone] = useState<'noir' | 'contrast'>('noir');
  const [fontSizePx, setFontSizePx] = useState<number>(17);
  const [isSideOpen, setIsSideOpen] = useState<boolean>(
    typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );
  const [isImagesModalOpen, setIsImagesModalOpen] = useState(false);

  // Selection snapshot & mobile viewport handling
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [notice, setNotice] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSnapshottedRef = useRef<string>(chapter.content || '');

  useEffect(() => {
    setTitle(chapter.title);
    setContent(chapter.content || '');
    setAuthorComment(chapter.author_comment || '');
    setEntityIds(chapter.entity_ids || []);
    setHistory([chapter.content || '']);
    setHistoryIndex(0);
    lastSnapshottedRef.current = chapter.content || '';
    setDirty(false);
  }, [chapter.id]);

  // Adjust container height to mobile soft keyboard via visualViewport
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setViewportHeight(Math.round(vv.height));
    update();
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [isOpen]);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 2400);
  };

  const pushTextHistory = (nextText: string) => {
    setContent(nextText);
    setDirty(true);
    setHistory((prev) => {
      if (prev[historyIndex] === nextText) return prev;
      const sliced = prev.slice(0, historyIndex + 1);
      const appended = [...sliced, nextText].slice(-60);
      setHistoryIndex(appended.length - 1);
      return appended;
    });
  };

  const handleUndo = () => {
    if (historyIndex <= 0) return;
    const nextIdx = historyIndex - 1;
    setHistoryIndex(nextIdx);
    setContent(history[nextIdx]);
    setDirty(true);
    showToast('Отменено');
  };

  const handleRedo = () => {
    if (historyIndex >= history.length - 1) return;
    const nextIdx = historyIndex + 1;
    setHistoryIndex(nextIdx);
    setContent(history[nextIdx]);
    setDirty(true);
    showToast('Повторено');
  };

  const syncSelection = () => {
    const el = textareaRef.current;
    if (!el) return;
    setSelection({ start: el.selectionStart ?? 0, end: el.selectionEnd ?? 0 });
  };

  const insertAtCursor = (inserted: string, replaceSel = false) => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart ?? selection.start : selection.start;
    const end = el ? el.selectionEnd ?? selection.end : selection.end;
    const effEnd = replaceSel ? end : start;
    const { nextText, nextCursorStart, nextCursorEnd } = replaceSelectionRange(
      content,
      start,
      effEnd,
      inserted
    );
    pushTextHistory(nextText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(nextCursorStart, nextCursorEnd);
        setSelection({ start: nextCursorStart, end: nextCursorEnd });
      }
    }, 15);
  };

  const wrapSelection = (before: string, after = '') => {
    const el = textareaRef.current;
    const start = el ? el.selectionStart ?? selection.start : selection.start;
    const end = el ? el.selectionEnd ?? selection.end : selection.end;
    const sel = content.slice(start, end) || 'текст';
    const next = content.slice(0, start) + before + sel + after + content.slice(end);
    pushTextHistory(next);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(start + before.length, start + before.length + sel.length);
      }
    }, 15);
  };

  const handleCopy = async () => {
    const sel = content.slice(selection.start, selection.end) || content;
    if (!sel) return;
    await navigator.clipboard?.writeText(sel).catch(() => {});
    showToast(selection.end > selection.start ? 'Выделенное скопировано' : 'Весь текст скопирован');
  };

  const handleCut = async () => {
    if (selection.end <= selection.start) return;
    const sel = content.slice(selection.start, selection.end);
    await navigator.clipboard?.writeText(sel).catch(() => {});
    const { nextText, nextCursorStart } = replaceSelectionRange(content, selection.start, selection.end, '');
    pushTextHistory(nextText);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursorStart, nextCursorStart);
    }, 15);
    showToast('Вырезано');
  };

  const handleDeleteSelection = () => {
    if (selection.end <= selection.start) return;
    const { nextText, nextCursorStart } = replaceSelectionRange(content, selection.start, selection.end, '');
    pushTextHistory(nextText);
    setTimeout(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCursorStart, nextCursorStart);
    }, 15);
    showToast('Удалено');
  };

  const handleClipboardPasteButton = async (imagesOnly = false) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            await handleClipboardImageUploadAndInsert({
              blob,
              targetEl: textareaRef.current,
              userUid,
              insertAsMarkdown: true,
              onUrlInserted: (_url, mdSnippet) => insertAtCursor(mdSnippet, false),
            });
            return;
          }
        }
      }
      if (!imagesOnly && navigator.clipboard?.readText) {
        const txt = await navigator.clipboard.readText();
        if (txt) insertAtCursor(txt, true);
      } else if (imagesOnly) {
        showToast('В буфере нет картинки — скопируйте или сделайте скриншот и нажмите Ctrl+V');
      }
    } catch {
      showToast('Нажмите Ctrl+V (Cmd+V) прямо в редакторе для вставки из буфера обмена');
    }
  };

  const handleSaveNow = async (createSnapshot = true) => {
    setSaving(true);
    try {
      if (
        createSnapshot &&
        lastSnapshottedRef.current.trim().length > 100 &&
        Math.abs(content.length - lastSnapshottedRef.current.length) > 150
      ) {
        await saveChapterRevision({
          bookId: book.id,
          chapterId: chapter.id,
          chapterNumber: chapter.chapter_number,
          title,
          synopsis: chapter.synopsis,
          content: lastSnapshottedRef.current,
          revisionNote: 'Снимок в Режиме писателя',
          mode: 'edit',
        }).catch(() => {});
        lastSnapshottedRef.current = content;
      }

      const updated: Chapter = {
        ...chapter,
        title: title.trim() || chapter.title,
        content,
        author_comment: authorComment,
        entity_ids: entityIds,
        status: content.trim().length > 100 ? 'ready' : chapter.status,
      };
      const saved = await saveChapter(updated, chapter.id, userUid);
      onChapterSaved(saved);
      setDirty(false);
      setLastSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      showToast('Глава сохранена в базе данных');
    } finally {
      setSaving(false);
    }
  };

  // Auto-save every 4.5s if dirty
  useEffect(() => {
    if (!isOpen || !dirty) return;
    const timer = setTimeout(() => {
      void handleSaveNow(false);
    }, 4500);
    return () => clearTimeout(timer);
  }, [isOpen, dirty, content, title, entityIds, authorComment]);

  // Global writer shortcuts (Save / Undo / Redo / Escape)
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void handleSaveNow(true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      handleRedo();
      return;
    }
    if (e.key === 'Escape' && !isImagesModalOpen) {
      onClose();
    }
  };

  const handleTextareaPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            void handleClipboardImageUploadAndInsert({
              blob,
              targetEl: textareaRef.current,
              userUid,
              insertAsMarkdown: true,
              onUrlInserted: (_url, mdSnippet) => insertAtCursor(mdSnippet, false),
            });
            return;
          }
        }
      }
    }
  };

  const stats = useMemo(() => computeWriterStats(content), [content]);
  const selectedExcerpt = content.slice(selection.start, selection.end);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-x-0 top-0 z-[560] bg-black/92 backdrop-blur-md text-white font-['PT_Serif',serif] flex flex-col overflow-hidden"
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
    >
      {/* Top Writer Studio Header */}
      <div className="px-3 sm:px-5 py-2.5 bg-zinc-950/90 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={onClose}
            className="min-w-[42px] min-h-[42px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 font-bold text-[14px] flex items-center gap-1.5 cursor-pointer shrink-0"
            title="Выйти из режима писателя (Esc)"
          >
            <X className="w-4 h-4 text-rose-500" />
            <span className="hidden sm:inline">Закрыть</span>
          </button>

          <span className="px-2 py-1 bg-rose-600 text-white font-mono font-bold text-[14px] shrink-0">
            Гл. #{chapter.chapter_number}
          </span>

          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setDirty(true);
            }}
            placeholder="Название главы..."
            className="min-h-[42px] flex-1 min-w-[140px] px-3 noir-input text-[15px] font-bold"
          />
        </div>

        {/* Mode, Font Size, Stats, Save, Side Panel */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setWriterStyle(writerStyle === 'word' ? 'notepad' : 'word')}
            className="min-h-[40px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Maximize2 className="w-3.5 h-3.5 text-rose-500" />
            <span>{writerStyle === 'word' ? 'Режим: Word' : 'Режим: Блокнот'}</span>
          </button>

          <button
            type="button"
            onClick={() => setSheetTone(sheetTone === 'noir' ? 'contrast' : 'noir')}
            className="min-h-[40px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold cursor-pointer hidden md:inline-flex items-center"
            title="Переключить контраст листа"
          >
            {sheetTone === 'noir' ? 'Лист: Ночь' : 'Лист: Студия'}
          </button>

          <div className="hidden xl:flex items-center border border-zinc-700 bg-zinc-900">
            <button
              type="button"
              onClick={() => setFontSizePx((s) => Math.max(14, s - 1))}
              className="min-w-[36px] min-h-[38px] text-[14px] font-bold text-white hover:bg-zinc-800 cursor-pointer"
              title="Уменьшить шрифт"
            >
              A-
            </button>
            <span className="px-2 text-[14px] font-mono text-zinc-300 flex items-center gap-1">
              <Type className="w-3.5 h-3.5" />
              {fontSizePx}
            </span>
            <button
              type="button"
              onClick={() => setFontSizePx((s) => Math.min(24, s + 1))}
              className="min-w-[36px] min-h-[38px] text-[14px] font-bold text-white hover:bg-zinc-800 cursor-pointer"
              title="Увеличить шрифт"
            >
              A+
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleSaveNow(true)}
            disabled={saving}
            className={`min-h-[40px] px-3.5 font-bold text-[14px] border flex items-center gap-1.5 cursor-pointer ${
              dirty
                ? 'bg-white text-black border-white hover:bg-rose-600 hover:text-white hover:border-rose-500'
                : 'bg-zinc-900 text-white border-zinc-600'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Сохр...' : dirty ? 'Сохранить*' : 'Сохранено'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSideOpen(!isSideOpen)}
            className={`min-h-[40px] px-3 font-bold text-[14px] border flex items-center gap-1.5 cursor-pointer ${
              isSideOpen
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-zinc-900 text-white border-zinc-700 hover:border-white'
            }`}
            title="Заметки, Комментарий ИИ и Точечный ИИ"
          >
            <PanelRight className="w-4 h-4" />
            <span className="hidden sm:inline">Инструменты</span>
          </button>
        </div>
      </div>

      {/* Word Formatting + Clipboard + Voice Toolbar (Compact in Notepad mode) */}
      <div className="px-3 sm:px-5 py-2 bg-zinc-950/80 border-b border-zinc-800 flex flex-wrap items-center gap-1.5 shrink-0">
        {/* Undo / Redo */}
        <button
          type="button"
          disabled={historyIndex <= 0}
          onClick={handleUndo}
          className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white disabled:opacity-30 cursor-pointer flex items-center gap-1 text-[14px]"
          title="Отменить (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          disabled={historyIndex >= history.length - 1}
          onClick={handleRedo}
          className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white disabled:opacity-30 cursor-pointer flex items-center gap-1 text-[14px]"
          title="Повторить (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>

        {writerStyle === 'word' && (
          <>
            <div className="w-[1px] h-6 bg-zinc-800 mx-0.5" />
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Копировать (Ctrl+C)"
            >
              <Copy className="w-4 h-4" />
              <span className="hidden md:inline">Копир.</span>
            </button>
            <button
              type="button"
              disabled={selection.end <= selection.start}
              onClick={handleCut}
              className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 disabled:opacity-35 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Вырезать (Ctrl+X)"
            >
              <Scissors className="w-4 h-4" />
              <span className="hidden md:inline">Вырез.</span>
            </button>
            <button
              type="button"
              onClick={() => handleClipboardPasteButton(false)}
              className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Вставить из буфера (Ctrl+V)"
            >
              <ClipboardPaste className="w-4 h-4" />
              <span className="hidden md:inline">Встав.</span>
            </button>
            <button
              type="button"
              disabled={selection.end <= selection.start}
              onClick={handleDeleteSelection}
              className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-rose-500 text-rose-300 disabled:opacity-35 text-[14px] flex items-center gap-1 cursor-pointer"
              title="Удалить выделенное (Delete)"
            >
              <Delete className="w-4 h-4" />
            </button>

            <div className="w-[1px] h-6 bg-zinc-800 mx-0.5" />

            <button
              type="button"
              onClick={() => wrapSelection('**', '**')}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
              title="Жирный"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => wrapSelection('*', '*')}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
              title="Курсив"
            >
              <Italic className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n\n## ', false)}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
              title="Подзаголовок"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n\n> ', false)}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
              title="Цитата"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertAtCursor('\n\n* * *\n\n', false)}
              className="min-w-[38px] min-h-[38px] flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
              title="Разделитель сцены (* * *)"
            >
              <Minus className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={() => handleClipboardPasteButton(true)}
          className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/70 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer"
          title="Вставить картинку из буфера обмена с загрузкой в облако"
        >
          <ImagePlus className="w-4 h-4" />
          <span className="hidden sm:inline">Фото из буфера</span>
        </button>

        <button
          type="button"
          onClick={() => setIsImagesModalOpen(true)}
          className="min-h-[38px] px-2.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer"
        >
          <ImageIcon className="w-4 h-4 text-rose-500" />
          <span>Иллюстрации</span>
        </button>

        {/* Integrated Microphone Voice Dictation directly in Writer Mode */}
        <NoirVoiceMicButton
          value={content}
          onChange={pushTextHistory}
          targetRef={textareaRef}
          fieldContext="fullscreen_chapter_writer"
          compact={false}
          label="Диктовка"
        />

        {notice && (
          <span className="px-2.5 py-1 bg-rose-950 border border-rose-500 text-rose-200 text-[14px] ml-auto">
            {notice}
          </span>
        )}
      </div>

      {/* Main Split Workspace: Center Writing Canvas + Side Studio */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        <div
          className={`flex-1 min-w-0 h-full overflow-y-auto p-3 sm:p-6 flex justify-center ${
            sheetTone === 'contrast' ? 'bg-zinc-900/90' : 'bg-black/80'
          }`}
        >
          <div
            className={`w-full ${
              writerStyle === 'word' ? 'max-w-4xl border border-zinc-800 bg-zinc-950/90 p-4 sm:p-8 shadow-2xl' : 'max-w-5xl'
            } flex flex-col min-h-full`}
          >
            <textarea
              ref={textareaRef}
              data-custom-clipboard="true"
              value={content}
              onChange={(e) => {
                pushTextHistory(e.target.value);
                syncSelection();
              }}
              onSelect={syncSelection}
              onClick={syncSelection}
              onKeyUp={syncSelection}
              onKeyDown={handleTextareaKeyDown}
              onPaste={handleTextareaPaste}
              placeholder="Начните писать сцену, надиктуйте голосом через кнопку «Диктовка» или вставьте скриншот через Ctrl+V..."
              style={{ fontSize: `${fontSizePx}px`, lineHeight: 1.75 }}
              className="w-full flex-1 min-h-[60vh] bg-transparent text-zinc-100 placeholder-zinc-600 focus:outline-none resize-none font-['PT_Serif',serif]"
            />
          </div>
        </div>

        {/* Desktop Side Panel or Mobile Drawer */}
        {isSideOpen && (
          <div className="fixed inset-0 top-[104px] z-[565] lg:static lg:inset-auto lg:w-[360px] xl:w-[400px] lg:shrink-0 h-full">
            <WriterSidePanel
              book={book}
              chapter={chapter}
              allChapters={allChapters}
              worldEntities={worldEntities}
              content={content}
              selectedText={selectedExcerpt}
              selectionStart={selection.start}
              selectionEnd={selection.end}
              selectedEntityIds={entityIds}
              authorComment={authorComment}
              userUid={userUid}
              onCloseMobile={() => setIsSideOpen(false)}
              onInsertAtCursor={insertAtCursor}
              onSaveAuthorComment={async (nextComment) => {
                setAuthorComment(nextComment);
                const updated: Chapter = { ...chapter, title, content, author_comment: nextComment, entity_ids: entityIds };
                const saved = await saveChapter(updated, chapter.id, userUid);
                onChapterSaved(saved);
              }}
              onToggleEntity={(entId) => {
                setEntityIds((prev) =>
                  prev.includes(entId) ? prev.filter((x) => x !== entId) : [...prev, entId]
                );
                setDirty(true);
              }}
            />
          </div>
        )}
      </div>

      {/* Bottom Sticky Status Bar */}
      <div className="px-3 sm:px-5 py-2 bg-zinc-950/95 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[14px] text-zinc-400 shrink-0">
        <div className="flex flex-wrap items-center gap-3 font-mono">
          <span>
            Объем: <strong className="text-rose-400">~{stats.a5Pages} стр. А5</strong>
          </span>
          <span>Слов: <strong className="text-white">{stats.words}</strong></span>
          <span>Символов: <strong className="text-white">{stats.chars.toLocaleString()}</strong></span>
        </div>
        <div className="text-[14px]">
          {lastSavedAt ? `Автосохранение: ${lastSavedAt}` : 'Ctrl+S — сохранить · Ctrl+Z — отмена · Ctrl+V картинки — автозагрузка в облако'}
        </div>
      </div>

      {isImagesModalOpen && (
        <WriterImageToolsModal
          isOpen={isImagesModalOpen}
          onClose={() => setIsImagesModalOpen(false)}
          book={book}
          chapter={chapter}
          content={content}
          selectedExcerpt={selectedExcerpt}
          worldEntities={worldEntities}
          characters={characters}
          userUid={userUid}
          onInsertMarkdown={(snippet) => insertAtCursor(snippet, false)}
          onUpdateWholeContent={(next) => pushTextHistory(next)}
          onTriggerClipboardImagePaste={() => void handleClipboardPasteButton(true)}
        />
      )}
    </div>,
    document.body
  );
};
