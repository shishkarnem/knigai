import { useEffect } from 'react';
import {
  handleClipboardImageUploadAndInsert,
  insertTextIntoFieldPreservingReact,
} from '../services/storage/clipboardImageUpload';

function isEditableTextField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (!target) return false;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement) {
    const allowedTypes = new Set(['text', 'search', 'url', 'email', 'tel', 'password', '']);
    return allowedTypes.has((target.type || 'text').toLowerCase()) && !target.readOnly && !target.disabled;
  }
  return false;
}

function getClipboardImageBlob(clipboardData: DataTransfer | null): Blob | null {
  if (!clipboardData) return null;
  if (clipboardData.items) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile();
        if (f) return f;
      }
    }
  }
  if (clipboardData.files) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const f = clipboardData.files[i];
      if (f.type.startsWith('image/')) return f;
    }
  }
  return null;
}

/**
 * Global keyboard shortcuts & clipboard image paste hook for ALL input/textarea fields.
 * - Ctrl/Cmd+V on image: uploads to Telegram cloud -> file_storage DB -> inserts URL/markdown with animated progress overlay
 * - Components with attribute `data-custom-clipboard="true"` handle paste locally (e.g., Fullscreen Writer with internal React undo history)
 */
export function useGlobalFieldClipboard(userUid?: number | null) {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target;
      if (!isEditableTextField(target)) return;
      if (target.getAttribute('data-custom-clipboard') === 'true') return;

      const imgBlob = getClipboardImageBlob(e.clipboardData);
      if (!imgBlob) return;

      e.preventDefault();
      e.stopPropagation();

      void handleClipboardImageUploadAndInsert({
        blob: imgBlob,
        targetEl: target,
        userUid,
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (!isEditableTextField(target)) return;
      if (target.getAttribute('data-custom-clipboard') === 'true') return;

      // Support Ctrl/Cmd+Backspace or Shift+Delete convenience if needed, keep native Ctrl+C/X/V/Z/Y
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        if (start === end && target instanceof HTMLTextAreaElement) {
          // If nothing selected in textarea on Ctrl+X, do not surprise user unless intended — let native behavior run
          return;
        }
      }

      // Allow programmatic Delete key when element dispatches synthetic Delete
      if (e.key === 'Delete' && e.ctrlKey && !e.shiftKey && !e.altKey) {
        const start = target.selectionStart ?? 0;
        const end = target.selectionEnd ?? 0;
        if (end > start) {
          e.preventDefault();
          target.setSelectionRange(start, end);
          if (typeof document.execCommand === 'function' && document.execCommand('delete')) {
            return;
          }
          insertTextIntoFieldPreservingReact(target, '');
        }
      }
    };

    document.addEventListener('paste', onPaste, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('paste', onPaste, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [userUid]);
}

export async function runFieldActionFromButton(
  action: 'copy' | 'cut' | 'paste' | 'delete' | 'undo' | 'redo' | 'paste-image',
  el: HTMLTextAreaElement | HTMLInputElement | null,
  options?: {
    userUid?: number | null;
    value?: string;
    onValueChange?: (nextVal: string) => void;
    onNotice?: (msg: string) => void;
  }
): Promise<void> {
  if (!el) return;
  el.focus();
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;

  if (action === 'undo') {
    document.execCommand?.('undo');
    return;
  }
  if (action === 'redo') {
    document.execCommand?.('redo');
    return;
  }
  if (action === 'copy') {
    const selected = el.value.slice(start, end) || el.value;
    if (selected && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(selected).catch(() => document.execCommand?.('copy'));
      options?.onNotice?.('Скопировано в буфер обмена');
    } else {
      document.execCommand?.('copy');
    }
    return;
  }
  if (action === 'cut') {
    const selected = el.value.slice(start, end);
    if (!selected) return;
    await navigator.clipboard?.writeText(selected).catch(() => {});
    if (!document.execCommand?.('cut')) {
      const next = el.value.slice(0, start) + el.value.slice(end);
      if (options?.onValueChange) options.onValueChange(next);
      else insertTextIntoFieldPreservingReact(el, '');
    }
    options?.onNotice?.('Вырезано в буфер обмена');
    return;
  }
  if (action === 'delete') {
    if (end > start) {
      if (!document.execCommand?.('delete')) {
        const next = el.value.slice(0, start) + el.value.slice(end);
        if (options?.onValueChange) options.onValueChange(next);
      }
      options?.onNotice?.('Выделенный фрагмент удалён');
    }
    return;
  }
  if (action === 'paste' || action === 'paste-image') {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.read === 'function') {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            await handleClipboardImageUploadAndInsert({
              blob,
              targetEl: el,
              userUid: options?.userUid,
            });
            return;
          }
        }
      }
      if (action === 'paste' && navigator.clipboard?.readText) {
        const txt = await navigator.clipboard.readText();
        if (txt) {
          insertTextIntoFieldPreservingReact(el, txt);
        }
      } else if (action === 'paste-image') {
        options?.onNotice?.('В буфере обмена нет изображения. Нажмите Ctrl+V после скриншота или копирования картинки.');
      }
    } catch {
      options?.onNotice?.('Нажмите Ctrl+V (Cmd+V) в поле для вставки из буфера обмена.');
    }
  }
}
