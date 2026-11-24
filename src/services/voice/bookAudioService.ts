import { AudioTrack, Book, BookAudioTrack, Chapter } from '../../types';

export async function fetchBookAudioTracks(bookId: number): Promise<BookAudioTrack[]> {
  if (!bookId || bookId <= 0) return [];
  try {
    const res = await fetch(`/api/books/${bookId}/audio`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.tracks) ? data.tracks : [];
  } catch {
    return [];
  }
}

export async function uploadChapterAudioTrack(params: {
  bookId: number;
  bookTitle?: string;
  chapterId?: number | null;
  chapterNumber?: number | null;
  userUid?: number;
  audioBlob: Blob | File;
  filename?: string;
  title?: string;
  narratorName?: string;
  sourceType?: 'voice_record' | 'dictation_stt' | 'uploaded_file';
  durationSec?: number;
  isPrimary?: boolean;
  transcribe?: boolean;
}): Promise<{
  track: BookAudioTrack;
  tracks: BookAudioTrack[];
  recognized_text: string;
  file_id: number | null;
  folder_id: number | null;
}> {
  const form = new FormData();
  const safeName =
    params.filename ||
    (params.audioBlob instanceof File ? params.audioBlob.name : `chapter_${params.chapterNumber || 0}.webm`);
  form.append('audio', params.audioBlob, safeName);
  if (params.bookTitle) form.append('book_title', params.bookTitle);
  if (params.chapterId) form.append('chapter_id', String(params.chapterId));
  if (params.chapterNumber) form.append('chapter_number', String(params.chapterNumber));
  if (params.userUid) form.append('user_uid', String(params.userUid));
  if (params.title) form.append('title', params.title);
  if (params.narratorName) form.append('narrator_name', params.narratorName);
  form.append('source_type', params.sourceType || 'voice_record');
  if (params.durationSec !== undefined) form.append('duration_sec', String(Math.round(params.durationSec)));
  form.append('is_primary', String(params.isPrimary ?? true));
  form.append('transcribe', String(Boolean(params.transcribe)));
  form.append('mime_type', params.audioBlob.type || 'audio/webm');

  const res = await fetch(`/api/books/${params.bookId}/audio/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || `Ошибка загрузки аудио (${res.status})`);
  }
  return {
    track: data.track,
    tracks: data.tracks || [],
    recognized_text: data.recognized_text || '',
    file_id: data.file_id ?? null,
    folder_id: data.folder_id ?? null,
  };
}

export async function attachExistingFileToChapterAudio(params: {
  bookId: number;
  fileId: number;
  chapterId?: number | null;
  chapterNumber?: number | null;
  userUid?: number;
  title?: string;
  narratorName?: string;
  durationSec?: number;
  isPrimary?: boolean;
}): Promise<{ track: BookAudioTrack; tracks: BookAudioTrack[] }> {
  const res = await fetch(`/api/books/${params.bookId}/audio/attach-existing`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: params.fileId,
      chapter_id: params.chapterId ?? null,
      chapter_number: params.chapterNumber ?? null,
      user_uid: params.userUid ?? null,
      title: params.title,
      narrator_name: params.narratorName || 'Автор',
      duration_sec: params.durationSec || 0,
      is_primary: params.isPrimary ?? true,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось прикрепить аудиофайл');
  }
  return { track: data.track, tracks: data.tracks || [] };
}

export async function updateBookAudioTrack(
  bookId: number,
  trackId: number,
  patch: {
    title?: string;
    narrator_name?: string;
    is_primary?: boolean;
    chapter_id?: number | null;
    chapter_number?: number | null;
  }
): Promise<BookAudioTrack[]> {
  const res = await fetch(`/api/books/${bookId}/audio/${trackId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось обновить аудиодорожку');
  }
  return data.tracks || [];
}

export async function deleteBookAudioTrack(
  bookId: number,
  trackId: number,
  deleteFile = false
): Promise<BookAudioTrack[]> {
  const res = await fetch(`/api/books/${bookId}/audio/${trackId}?delete_file=${deleteFile ? 'true' : 'false'}`, {
    method: 'DELETE',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось удалить аудиодорожку');
  }
  return data.tracks || [];
}

/**
 * Merges DB book_audio_tracks with legacy book.audio_tracks and chapter.audio_url without duplicates.
 */
export function buildUnifiedAudioPlaylist(
  dbTracks: BookAudioTrack[],
  book: Book,
  chapters: Chapter[]
): AudioTrack[] {
  const seenUrls = new Set<string>();
  const result: AudioTrack[] = [];

  for (const t of dbTracks) {
    if (!t.audio_url) continue;
    seenUrls.add(t.audio_url);
    result.push({
      id: `bat_${t.id}`,
      track_db_id: t.id,
      title: t.title,
      url: t.audio_url,
      duration: t.duration_sec && t.duration_sec > 0 ? Math.round(t.duration_sec) : undefined,
      chapter_number: t.chapter_number ?? undefined,
      chapter_id: t.chapter_id ?? null,
      narrator_name: t.narrator_name,
      source_type: t.source_type,
      file_id: t.file_id ?? null,
      is_primary: t.is_primary,
    });
  }

  for (const ch of chapters) {
    if (ch.audio_url && !seenUrls.has(ch.audio_url)) {
      seenUrls.add(ch.audio_url);
      result.push({
        id: `ch_${ch.id || ch.chapter_number}`,
        title: ch.title || `Глава ${ch.chapter_number}`,
        url: ch.audio_url,
        duration: ch.audio_duration_sec ?? undefined,
        chapter_number: ch.chapter_number,
        chapter_id: ch.id,
        narrator_name: book.author || 'Автор',
        source_type: 'chapter_legacy',
        is_primary: true,
      });
    }
  }

  if (Array.isArray(book.audio_tracks)) {
    for (let i = 0; i < book.audio_tracks.length; i++) {
      const legacy = book.audio_tracks[i];
      if (legacy?.url && !seenUrls.has(legacy.url)) {
        seenUrls.add(legacy.url);
        result.push({
          ...legacy,
          chapter_number: legacy.chapter_number ?? i + 1,
        });
      }
    }
  }

  return result.sort((a, b) => {
    const ca = a.chapter_number ?? 99999;
    const cb = b.chapter_number ?? 99999;
    if (ca !== cb) return ca - cb;
    if (Boolean(a.is_primary) !== Boolean(b.is_primary)) return a.is_primary ? -1 : 1;
    return 0;
  });
}
