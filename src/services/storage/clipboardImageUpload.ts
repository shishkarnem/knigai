export interface CloudUploadProgressEvent {
  active: boolean;
  percent: number;
  stage: 'uploading' | 'registering' | 'done' | 'error';
  filename: string;
  previewUrl?: string;
  uploadedUrl?: string;
  errorMessage?: string;
}

type UploadListener = (state: CloudUploadProgressEvent) => void;
const listeners = new Set<UploadListener>();

let currentOverlayState: CloudUploadProgressEvent = {
  active: false,
  percent: 0,
  stage: 'uploading',
  filename: '',
};

export function emitClipboardUploadState(next: CloudUploadProgressEvent): void {
  currentOverlayState = next;
  listeners.forEach((fn) => fn(next));
}

export function subscribeClipboardUploadState(listener: UploadListener): () => void {
  listeners.add(listener);
  listener(currentOverlayState);
  return () => {
    listeners.delete(listener);
  };
}

export function insertTextIntoFieldPreservingReact(
  el: HTMLTextAreaElement | HTMLInputElement,
  inserted: string
): boolean {
  try {
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;

    // Set selection range and try execCommand first so native browser Ctrl+Z undo stack is preserved
    el.setSelectionRange(start, end);
    const execOk = typeof document.execCommand === 'function' && document.execCommand('insertText', false, inserted);
    if (execOk) {
      return true;
    }

    const nextValue = el.value.slice(0, start) + inserted + el.value.slice(end);
    const proto =
      el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, nextValue);
    } else {
      el.value = nextValue;
    }
    const cursorPos = start + inserted.length;
    el.setSelectionRange(cursorPos, cursorPos);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (err) {
    console.warn('[insertTextIntoField] error:', err);
    return false;
  }
}

export async function uploadBlobToCloudWithProgress(params: {
  blob: Blob;
  filename?: string;
  userUid?: number | null;
  folderName?: string;
  caption?: string;
  onProgress?: (percent: number, stage: 'uploading' | 'registering' | 'done') => void;
}): Promise<{ url: string; shortUrl: string; size: number; mimeType: string }> {
  const {
    blob,
    filename = `image_${Date.now()}.${blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png'}`,
    userUid,
    folderName = 'Буфер обмена',
    caption,
    onProgress,
  } = params;

  const formData = new FormData();
  formData.append('file', blob, filename);
  if (userUid) formData.append('user_uid', String(userUid));
  formData.append('folder_name', folderName);
  if (caption) formData.append('caption', caption);

  const storedToken =
    typeof localStorage !== 'undefined' ? localStorage.getItem('protalk_upload_token') || '' : '';
  if (storedToken) {
    formData.append('upload_token', storedToken);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/files/upload-clipboard', true);
    if (storedToken) {
      xhr.setRequestHeader('X-Upload-Token', storedToken);
    }

    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) {
        const pct = Math.max(8, Math.min(78, Math.round((ev.loaded / ev.total) * 78)));
        onProgress?.(pct, 'uploading');
      }
    };

    xhr.upload.onload = () => {
      onProgress?.(85, 'registering');
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return;
      try {
        const parsed = JSON.parse(xhr.responseText || '{}');
        if (xhr.status >= 200 && xhr.status < 300 && parsed.success && parsed.url) {
          onProgress?.(100, 'done');
          resolve({
            url: String(parsed.url),
            shortUrl: String(parsed.shortUrl || parsed.url),
            size: Number(parsed.size || blob.size || 0),
            mimeType: String(parsed.mimeType || blob.type || 'image/png'),
          });
        } else {
          reject(new Error(parsed.error || `Ошибка загрузки (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Некорректный ответ сервера при загрузке (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Сетевая ошибка при загрузке изображения в облако'));
    };

    xhr.ontimeout = () => {
      reject(new Error('Таймаут загрузки изображения в облако'));
    };

    xhr.timeout = 45000;
    onProgress?.(5, 'uploading');
    xhr.send(formData);
  });
}

export async function handleClipboardImageUploadAndInsert(params: {
  blob: Blob;
  targetEl?: HTMLTextAreaElement | HTMLInputElement | null;
  userUid?: number | null;
  insertAsMarkdown?: boolean;
  onUrlInserted?: (url: string, markdownSnippet: string) => void;
}): Promise<string | null> {
  const { blob, targetEl, userUid, insertAsMarkdown, onUrlInserted } = params;
  const ext = blob.type.includes('jpeg') ? 'jpg' : blob.type.includes('webp') ? 'webp' : 'png';
  const filename = `clipboard_${Date.now()}.${ext}`;
  const previewUrl = URL.createObjectURL(blob);

  emitClipboardUploadState({
    active: true,
    percent: 6,
    stage: 'uploading',
    filename,
    previewUrl,
  });

  // Smoothly animate between 82% -> 95% while awaiting Telegram cloud URL
  let timer: ReturnType<typeof setInterval> | null = null;
  let currentPct = 6;

  try {
    timer = setInterval(() => {
      if (currentOverlayState.stage === 'registering' && currentPct < 95) {
        currentPct = Math.min(95, currentPct + 2);
        emitClipboardUploadState({
          ...currentOverlayState,
          percent: currentPct,
        });
      }
    }, 220);

    const res = await uploadBlobToCloudWithProgress({
      blob,
      filename,
      userUid,
      folderName: 'Буфер обмена',
      onProgress: (pct, stage) => {
        currentPct = Math.max(currentPct, pct);
        emitClipboardUploadState({
          active: true,
          percent: currentPct,
          stage,
          filename,
          previewUrl,
        });
      },
    });

    if (timer) clearInterval(timer);

    const markdownSnippet = `\n\n![Иллюстрация|scale=85](${res.url})\n\n`;
    const isTextarea = targetEl instanceof HTMLTextAreaElement;
    const pasteFormat = targetEl?.getAttribute('data-paste-format');
    const useMd =
      insertAsMarkdown !== undefined
        ? insertAsMarkdown
        : pasteFormat === 'markdown' || (isTextarea && pasteFormat !== 'url');

    const textToInsert = useMd ? markdownSnippet : res.url;

    if (onUrlInserted) {
      onUrlInserted(res.url, textToInsert);
    } else if (targetEl && document.contains(targetEl)) {
      insertTextIntoFieldPreservingReact(targetEl, textToInsert);
    }

    emitClipboardUploadState({
      active: true,
      percent: 100,
      stage: 'done',
      filename,
      previewUrl,
      uploadedUrl: res.url,
    });

    setTimeout(() => {
      URL.revokeObjectURL(previewUrl);
      emitClipboardUploadState({
        active: false,
        percent: 0,
        stage: 'done',
        filename: '',
      });
    }, 1500);

    return res.url;
  } catch (err: unknown) {
    if (timer) clearInterval(timer);
    emitClipboardUploadState({
      active: true,
      percent: 0,
      stage: 'error',
      filename,
      previewUrl,
      errorMessage: err instanceof Error ? err.message : 'Ошибка загрузки изображения в облако',
    });
    setTimeout(() => {
      URL.revokeObjectURL(previewUrl);
      emitClipboardUploadState({
        active: false,
        percent: 0,
        stage: 'error',
        filename: '',
      });
    }, 3200);
    return null;
  }
}
