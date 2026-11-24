import { executePgQuery } from '../db/pgProxy';
import {
  BookDraft,
  BookDraftSourceType,
  BookDraftStatus,
  BookDraftType,
  DraftFragment,
} from '../../types';

const CACHE_KEY_PREFIX = 'knigai_book_drafts_';

function normalizeDraftRow(row: Record<string, unknown>): BookDraft {
  return {
    id: Number(row.id),
    user_uid: row.user_uid != null ? Number(row.user_uid) : null,
    book_id: row.book_id != null ? Number(row.book_id) : null,
    chapter_id: row.chapter_id != null ? Number(row.chapter_id) : null,
    chapter_number: row.chapter_number != null ? Number(row.chapter_number) : null,
    draft_type: (String(row.draft_type || 'note') as BookDraftType) || 'book_note',
    title: String(row.title || 'Без названия'),
    content: String(row.content || ''),
    source_type: (String(row.source_type || 'manual') as BookDraftSourceType) || 'manual',
    source_image_url: row.source_image_url ? String(row.source_image_url) : null,
    status: (String(row.status || 'idea') as BookDraftStatus) || 'idea',
    include_in_ai: row.include_in_ai !== false,
    sort_order: Number(row.sort_order) || 0,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

function getCacheKey(userUid?: number | null, bookId?: number | null): string {
  return `${CACHE_KEY_PREFIX}${userUid || 'anon'}_${bookId || 'all'}`;
}

export async function fetchDrafts(params: {
  userUid?: number | null;
  bookId?: number | null;
  includeUnattached?: boolean;
}): Promise<BookDraft[]> {
  const { userUid, bookId, includeUnattached = true } = params;
  const cacheKey = getCacheKey(userUid, bookId);

  try {
    const conditions: string[] = [];
    const sqlParams: (string | number | boolean | null)[] = [];

    if (userUid) {
      sqlParams.push(userUid);
      conditions.push(`(user_uid = $${sqlParams.length} OR user_uid IS NULL)`);
    }

    if (bookId && includeUnattached) {
      sqlParams.push(bookId);
      conditions.push(`(book_id = $${sqlParams.length} OR book_id IS NULL)`);
    } else if (bookId) {
      sqlParams.push(bookId);
      conditions.push(`book_id = $${sqlParams.length}`);
    }

    const whereSql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const res = await executePgQuery<Record<string, unknown>>(
      `SELECT id, user_uid, book_id, chapter_id, chapter_number, draft_type, title, content, source_type, source_image_url, status, include_in_ai, sort_order, created_at, updated_at
       FROM book_drafts
       ${whereSql}
       ORDER BY sort_order ASC, id DESC
       LIMIT 300;`,
      sqlParams
    );

    const list = (res.rows || []).map(normalizeDraftRow);
    try {
      localStorage.setItem(cacheKey, JSON.stringify(list));
    } catch {
      // ignore storage quota
    }
    return list;
  } catch (err) {
    console.warn('[draftsRepository] fetchDrafts DB notice:', err);
    try {
      const raw = localStorage.getItem(cacheKey);
      return raw ? (JSON.parse(raw) as BookDraft[]) : [];
    } catch {
      return [];
    }
  }
}

export async function fetchActiveAiDraftsContext(params: {
  bookId: number;
  chapterNumber?: number;
  userUid?: number;
  maxChars?: number;
}): Promise<{
  bookDraftsBlock: string;
  chapterDraftsBlock: string;
  draftsCount: number;
}> {
  const maxChars = params.maxChars ?? 3600;
  try {
    const all = await fetchDrafts({
      userUid: params.userUid,
      bookId: params.bookId,
      includeUnattached: false,
    });
    const active = all.filter((d) => d.include_in_ai && d.status !== 'archive' && d.content.trim().length > 0);
    const chapterSpecific = params.chapterNumber
      ? active.filter((d) => Number(d.chapter_number) === Number(params.chapterNumber))
      : [];
    const bookWide = active.filter(
      (d) => !d.chapter_number || (params.chapterNumber && Number(d.chapter_number) !== Number(params.chapterNumber) && d.draft_type === 'book_note')
    );

    const formatList = (items: BookDraft[], limit: number) => {
      let acc = '';
      for (const item of items) {
        const line = `• [${item.title}]: ${item.content.trim().slice(0, 1100)}\n`;
        if (acc.length + line.length > limit) break;
        acc += line;
      }
      return acc.trim();
    };

    return {
      bookDraftsBlock: formatList(bookWide, Math.round(maxChars * 0.5)),
      chapterDraftsBlock: formatList(chapterSpecific, Math.round(maxChars * 0.5)),
      draftsCount: bookWide.length + chapterSpecific.length,
    };
  } catch {
    return { bookDraftsBlock: '', chapterDraftsBlock: '', draftsCount: 0 };
  }
}

export async function saveDraft(
  draft: Omit<BookDraft, 'id'>,
  existingId?: number
): Promise<BookDraft> {
  if (existingId) {
    try {
      const res = await executePgQuery<Record<string, unknown>>(
        `UPDATE book_drafts
         SET book_id = $1, chapter_id = $2, chapter_number = $3, draft_type = $4,
             title = $5, content = $6, source_type = $7, source_image_url = $8,
             status = $9, include_in_ai = $10, sort_order = $11, updated_at = now()
         WHERE id = $12
         RETURNING *;`,
        [
          draft.book_id ?? null,
          draft.chapter_id ?? null,
          draft.chapter_number ?? null,
          draft.draft_type || 'note',
          draft.title.trim() || 'Заметка без названия',
          draft.content || '',
          draft.source_type || 'manual',
          draft.source_image_url ?? null,
          draft.status || 'idea',
          draft.include_in_ai ?? true,
          draft.sort_order ?? 0,
          existingId,
        ]
      );
      if (res.rows?.[0]) return normalizeDraftRow(res.rows[0]);
    } catch (err) {
      console.warn('[draftsRepository] update error:', err);
    }
    return { ...draft, id: existingId };
  }

  try {
    const res = await executePgQuery<Record<string, unknown>>(
      `INSERT INTO book_drafts (
        user_uid, book_id, chapter_id, chapter_number, draft_type,
        title, content, source_type, source_image_url, status, include_in_ai, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *;`,
      [
        draft.user_uid ?? null,
        draft.book_id ?? null,
        draft.chapter_id ?? null,
        draft.chapter_number ?? null,
        draft.draft_type || 'note',
        draft.title.trim() || 'Заметка без названия',
        draft.content || '',
        draft.source_type || 'manual',
        draft.source_image_url ?? null,
        draft.status || 'idea',
        draft.include_in_ai ?? true,
        draft.sort_order ?? 0,
      ]
    );
    if (res.rows?.[0]) return normalizeDraftRow(res.rows[0]);
  } catch (err) {
    console.warn('[draftsRepository] insert error:', err);
  }
  return { ...draft, id: Date.now() };
}

export async function deleteDraft(draftId: number): Promise<void> {
  try {
    await executePgQuery('DELETE FROM book_drafts WHERE id = $1;', [draftId]);
  } catch (err) {
    console.warn('[draftsRepository] delete error:', err);
  }
}

export async function attachDraftToBookOrChapter(params: {
  draftId: number;
  bookId: number;
  chapterId?: number | null;
  chapterNumber?: number | null;
  draftType?: BookDraftType;
}): Promise<void> {
  try {
    await executePgQuery(
      `UPDATE book_drafts
       SET book_id = $1, chapter_id = $2, chapter_number = $3,
           draft_type = COALESCE($4, draft_type), updated_at = now()
       WHERE id = $5;`,
      [
        params.bookId,
        params.chapterId ?? null,
        params.chapterNumber ?? null,
        params.draftType ?? null,
        params.draftId,
      ]
    );
  } catch (err) {
    console.warn('[draftsRepository] attach error:', err);
  }
}

export async function toggleDraftIncludeInAi(draftId: number, include: boolean): Promise<void> {
  try {
    await executePgQuery(
      `UPDATE book_drafts SET include_in_ai = $1, updated_at = now() WHERE id = $2;`,
      [include, draftId]
    );
  } catch (err) {
    console.warn('[draftsRepository] toggle AI inclusion error:', err);
  }
}

export async function reorderDrafts(orderedIds: number[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    try {
      await executePgQuery('UPDATE book_drafts SET sort_order = $1 WHERE id = $2;', [
        i + 1,
        orderedIds[i],
      ]);
    } catch {
      // ignore individual ordering failure
    }
  }
}

export async function persistInitialBookDrafts(
  bookId: number,
  userUid: number | undefined,
  fragments?: DraftFragment[]
): Promise<void> {
  if (!fragments || fragments.length === 0) return;
  for (let i = 0; i < fragments.length; i++) {
    const f = fragments[i];
    if (!f.content?.trim()) continue;
    await saveDraft({
      user_uid: userUid ?? null,
      book_id: bookId,
      chapter_id: null,
      chapter_number: null,
      draft_type: 'book_note',
      title: f.title || `Черновик ${i + 1}`,
      content: f.content.trim(),
      source_type: f.sourceType || (f.filename ? 'file' : 'manual'),
      source_image_url: f.sourceImageUrl ?? null,
      status: 'in_work',
      include_in_ai: true,
      sort_order: f.order || i + 1,
    });
  }
}

