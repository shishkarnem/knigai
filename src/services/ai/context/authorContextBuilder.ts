import { Book, Chapter } from '../../../types';
import { fetchActiveAiDraftsContext } from '../../drafts/draftsRepository';

export interface AuthorAiContextResult {
  authorInstructionsBlock: string;
  chapterCommentBlock: string;
  bookDraftsBlock: string;
  chapterDraftsBlock: string;
  combinedPromptBlock: string;
  draftsCount: number;
  hasBookInstructions: boolean;
  hasChapterComment: boolean;
}

/**
 * Gathers author-level AI wishes, chapter-specific instructions, and active included drafts
 * from PostgreSQL/cache and builds a single compact directive block for all AI generators.
 */
export async function loadBookAuthorAiContext(params: {
  book?: Book | null;
  chapter?: Chapter | null;
  userUid?: number;
  maxDraftChars?: number;
}): Promise<AuthorAiContextResult> {
  const { book, chapter, userUid, maxDraftChars = 3400 } = params;

  const bookInstructions = (book?.author_instructions || '').trim();
  const chapterComment = (chapter?.author_comment || '').trim();

  let bookDraftsBlock = '';
  let chapterDraftsBlock = '';
  let draftsCount = 0;

  if (book?.id) {
    try {
      const draftsCtx = await fetchActiveAiDraftsContext({
        bookId: book.id,
        chapterNumber: chapter?.chapter_number,
        userUid: userUid ?? book.user_uid,
        maxChars: maxDraftChars,
      });
      bookDraftsBlock = draftsCtx.bookDraftsBlock;
      chapterDraftsBlock = draftsCtx.chapterDraftsBlock;
      draftsCount = draftsCtx.draftsCount;
    } catch {
      // non-fatal fallback if offline
    }
  }

  const authorInstructionsBlock = bookInstructions
    ? `[ПОЖЕЛАНИЯ И ДИРЕКТИВЫ АВТОРА К КНИГЕ / СТИЛЮ / ФАНФИКУ — СОБЛЮДАТЬ ОБЯЗАТЕЛЬНО]:\n${bookInstructions.slice(0, 1600)}`
    : '';

  const chapterCommentBlock = chapterComment
    ? `[КОММЕНТАРИЙ АВТОРА ДЛЯ ГЛАВЫ #${chapter?.chapter_number ?? ''} — ВЫПОЛНИТЬ В СЦЕНАХ]:\n${chapterComment.slice(0, 1400)}`
    : '';

  const sections: string[] = [];
  if (authorInstructionsBlock) sections.push(authorInstructionsBlock);
  if (chapterCommentBlock) sections.push(chapterCommentBlock);
  if (chapterDraftsBlock) {
    sections.push(`[ЧЕРНОВИКИ И ЗАМЕТКИ К ЭТОЙ ГЛАВЕ (включены в контекст ИИ)]:\n${chapterDraftsBlock}`);
  }
  if (bookDraftsBlock) {
    sections.push(`[АКТИВНЫЕ ЗАМЕТКИ И ЧЕРНОВИКИ ПО КНИГЕ (учитывать в каноне и деталях)]:\n${bookDraftsBlock}`);
  }

  return {
    authorInstructionsBlock,
    chapterCommentBlock,
    bookDraftsBlock,
    chapterDraftsBlock,
    combinedPromptBlock: sections.join('\n\n'),
    draftsCount,
    hasBookInstructions: Boolean(bookInstructions),
    hasChapterComment: Boolean(chapterComment),
  };
}
