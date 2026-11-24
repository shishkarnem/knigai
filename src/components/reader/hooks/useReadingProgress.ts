import { useEffect, useRef, useCallback } from 'react';
import {
  fetchReadingProgress,
  updateReadingChapter,
  ReadingProgressRecord,
} from '../../../services/db/bookRepository';

export type ReadingProgressMode = 'text' | 'manga' | 'audio';

export function getReadPageStorageKey(
  mode: ReadingProgressMode,
  bookId: number,
  userUid?: number
): string {
  const userPart = userUid ? `u${userUid}` : 'guest';
  if (mode === 'manga') return `knigai_manga_page_${userPart}_${bookId}`;
  if (mode === 'audio') return `knigai_audio_track_${userPart}_${bookId}`;
  return `knigai_read_page_${userPart}_${bookId}`;
}

export function readStoredReadingPosition(
  mode: ReadingProgressMode,
  bookId: number,
  userUid?: number
): number | null {
  try {
    const key = getReadPageStorageKey(mode, bookId, userUid);
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      const parsed = parseInt(raw, 10);
      if (!Number.isNaN(parsed) && parsed >= 0) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

export function writeStoredReadingPosition(
  mode: ReadingProgressMode,
  bookId: number,
  userUid: number | undefined,
  index: number
): void {
  if (!bookId || Number.isNaN(index) || index < 0) return;
  try {
    const key = getReadPageStorageKey(mode, bookId, userUid);
    localStorage.setItem(key, Math.floor(index).toString());
  } catch {
    // ignore storage errors
  }
}

interface UseReadingProgressSyncParams {
  bookId: number;
  userUid?: number;
  mode: ReadingProgressMode;
  skipRestore?: boolean;
  onRestoreFromDb: (record: ReadingProgressRecord) => void;
}

export function useReadingProgressSync({
  bookId,
  userUid,
  mode,
  skipRestore = false,
  onRestoreFromDb,
}: UseReadingProgressSyncParams) {
  const isHydratedRef = useRef<boolean>(!userUid);
  const hasUserNavigatedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRestoreRef = useRef(onRestoreFromDb);

  useEffect(() => {
    onRestoreRef.current = onRestoreFromDb;
  }, [onRestoreFromDb]);

  // Reset navigation/hydration tracking whenever bookId or userUid changes
  useEffect(() => {
    let cancelled = false;
    hasUserNavigatedRef.current = false;

    if (!userUid || !bookId) {
      isHydratedRef.current = true;
      return;
    }

    if (skipRestore) {
      isHydratedRef.current = true;
      return;
    }

    isHydratedRef.current = false;

    fetchReadingProgress(bookId, userUid)
      .then((record) => {
        if (cancelled) return;
        isHydratedRef.current = true;
        if (record && !hasUserNavigatedRef.current) {
          onRestoreRef.current(record);
        }
      })
      .catch(() => {
        if (!cancelled) {
          isHydratedRef.current = true;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bookId, userUid, mode, skipRestore]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const markUserNavigated = useCallback(() => {
    hasUserNavigatedRef.current = true;
    isHydratedRef.current = true;
  }, []);

  const persistPosition = useCallback(
    (chapterNumber: number, pageIndex: number, canSaveToDb: boolean) => {
      if (!bookId || !canSaveToDb) return;
      if (!isHydratedRef.current && !hasUserNavigatedRef.current) return;

      writeStoredReadingPosition(mode, bookId, userUid, pageIndex);

      if (!userUid) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      const targetBookId = bookId;
      const targetUserUid = userUid;
      const targetMode = mode;
      saveTimerRef.current = setTimeout(() => {
        updateReadingChapter(targetBookId, chapterNumber, targetUserUid, pageIndex, targetMode);
      }, 280);
    },
    [bookId, userUid, mode]
  );

  return {
    isHydratedRef,
    hasUserNavigatedRef,
    markUserNavigated,
    persistPosition,
  };
}
