import { executePgQuery } from '../pgProxy';
import { Book, BookReworkMode, Chapter, ChapterRevision } from '../../../types';
import { fetchAllBooks, saveChapter } from '../bookRepository';

export async function saveChapterRevision(params: {
  bookId: number;
  chapterId?: number | null;
  chapterNumber: number;
  title: string;
  synopsis?: string;
  content: string;
  revisionNote?: string;
  mode?: BookReworkMode | string;
}): Promise<ChapterRevision | null> {
  if (!params.bookId || (!params.content?.trim() && !params.synopsis?.trim())) {
    return null;
  }
  try {
    const res = await executePgQuery<ChapterRevision>(
      `INSERT INTO chapter_revisions (
        book_id, chapter_id, chapter_number, title, synopsis, content, revision_note, mode
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *;`,
      [
        params.bookId,
        params.chapterId || null,
        params.chapterNumber,
        params.title || `Глава ${params.chapterNumber}`,
        params.synopsis || '',
        params.content || '',
        params.revisionNote || 'Автоснимок перед изменением',
        params.mode || 'edit',
      ]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      ...row,
      id: Number(row.id),
      book_id: Number(row.book_id),
      chapter_id: row.chapter_id != null ? Number(row.chapter_id) : null,
      chapter_number: Number(row.chapter_number),
    };
  } catch (err) {
    console.warn('[revisionRepository] Save revision notice:', err);
    return null;
  }
}

export async function fetchChapterRevisions(
  bookId: number,
  chapterNumber: number
): Promise<ChapterRevision[]> {
  try {
    const res = await executePgQuery<ChapterRevision>(
      `SELECT id, book_id, chapter_id, chapter_number, title, synopsis, content, revision_note, mode, created_at
       FROM chapter_revisions
       WHERE book_id = $1 AND chapter_number = $2
       ORDER BY id DESC
       LIMIT 20;`,
      [bookId, chapterNumber]
    );
    return (res.rows || []).map((row) => ({
      ...row,
      id: Number(row.id),
      book_id: Number(row.book_id),
      chapter_id: row.chapter_id != null ? Number(row.chapter_id) : null,
      chapter_number: Number(row.chapter_number),
    }));
  } catch (err) {
    console.warn('[revisionRepository] Fetch revisions notice:', err);
    return [];
  }
}

export async function restoreChapterRevision(params: {
  bookId: number;
  currentChapter: Chapter;
  revision: ChapterRevision;
  userUid?: number;
}): Promise<Chapter> {
  const { bookId, currentChapter, revision, userUid } = params;

  // Save current chapter state before rolling back so user can also revert the rollback
  if (currentChapter.content?.trim()) {
    await saveChapterRevision({
      bookId,
      chapterId: currentChapter.id,
      chapterNumber: currentChapter.chapter_number,
      title: currentChapter.title,
      synopsis: currentChapter.synopsis,
      content: currentChapter.content,
      revisionNote: `Снимок перед откатом к ревизии #${revision.id}`,
      mode: 'edit',
    });
  }

  const restoredChapter: Chapter = {
    ...currentChapter,
    title: revision.title || currentChapter.title,
    synopsis: revision.synopsis ?? currentChapter.synopsis,
    content: revision.content || '',
    status: (revision.content || '').length > 100 ? 'ready' : currentChapter.status,
  };

  return saveChapter(restoredChapter, currentChapter.id, userUid);
}

export async function fetchBookRelations(book: Book, userUid?: number): Promise<{
  parentBook: Book | null;
  childBooks: Book[];
}> {
  try {
    const allBooks = await fetchAllBooks(userUid || book.user_uid);
    const parentBook = book.parent_book_id
      ? allBooks.find((b) => b.id === Number(book.parent_book_id)) || null
      : null;
    const childBooks = allBooks.filter(
      (b) => Number(b.parent_book_id) === Number(book.id) && b.id !== book.id
    );
    return { parentBook, childBooks };
  } catch {
    return { parentBook: null, childBooks: [] };
  }
}
