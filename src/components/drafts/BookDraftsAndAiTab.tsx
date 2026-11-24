import React, { useEffect, useState } from 'react';
import { Book, Chapter } from '../../types';
import { fetchChapters, saveChapter, updateBook } from '../../services/db/bookRepository';
import { fetchDrafts } from '../../services/drafts/draftsRepository';
import { AuthorAiCommentPanel } from './AuthorAiCommentPanel';
import { DraftsManagerPanel } from './DraftsManagerPanel';
import { NoirStatus } from '../common/NoirStatus';

interface BookDraftsAndAiTabProps {
  currentBook: Book | null;
  userUid?: number;
  readOnly?: boolean;
  onBookUpdated: (book: Book) => void;
  onProceedToChapters: () => void;
  authorInstructionsValue?: string;
  onAuthorInstructionsLocalChange?: (val: string) => void;
}

/**
 * Constructor sub-tab combining:
 * 1) Book-wide Author AI directives (`book.author_instructions`)
 * 2) Full Personal Drafts & OCR Notes Manager (`book_drafts`)
 * 3) Direct 1-click "Assemble Chapter from Drafts" saving into chapters table
 */
export const BookDraftsAndAiTab: React.FC<BookDraftsAndAiTabProps> = ({
  currentBook,
  userUid,
  readOnly = false,
  onBookUpdated,
  onProceedToChapters,
  authorInstructionsValue,
  onAuthorInstructionsLocalChange,
}) => {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeAiDraftsCount, setActiveAiDraftsCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');

  useEffect(() => {
    if (!currentBook?.id) {
      setChapters([]);
      return;
    }
    fetchChapters(currentBook.id, userUid)
      .then((list) => setChapters(list || []))
      .catch(() => {});

    fetchDrafts({ userUid: userUid ?? currentBook.user_uid, bookId: currentBook.id, includeUnattached: false })
      .then((list) => {
        setActiveAiDraftsCount(list.filter((d) => d.include_in_ai && d.status !== 'archive').length);
      })
      .catch(() => {});
  }, [currentBook?.id, userUid]);

  const handleSaveInstructions = async (nextVal: string) => {
    onAuthorInstructionsLocalChange?.(nextVal);
    if (!currentBook || readOnly) return;
    const updated: Book = { ...currentBook, author_instructions: nextVal };
    await updateBook(updated);
    onBookUpdated(updated);
  };

  const handleAssembleChapterFromDrafts = async (combinedText: string, suggestedTitle: string) => {
    if (!currentBook || readOnly) return;
    const nextNum = chapters.reduce((m, c) => Math.max(m, c.chapter_number), 0) + 1;
    const created = await saveChapter(
      {
        book_id: currentBook.id,
        chapter_number: nextNum,
        title: suggestedTitle || `Глава ${nextNum}`,
        synopsis: combinedText.slice(0, 240),
        content: combinedText,
        illustration_url: '',
        illustration_prompt: '',
        status: combinedText.trim().length > 100 ? 'ready' : 'draft',
      },
      undefined,
      userUid
    );
    setChapters((prev) => [...prev, created]);
    setStatusMessage(`Глава #${created.chapter_number} «${created.title}» собрана из черновиков и сохранена!`);
  };

  const effectiveInstructions =
    authorInstructionsValue !== undefined
      ? authorInstructionsValue
      : currentBook?.author_instructions || '';

  return (
    <div className="flex flex-col gap-5 min-w-0">
      <AuthorAiCommentPanel
        title="Общие указания и пожелания автора для ИИ (вся книга)"
        subtitle="Учитываются нейросетью при создании концепта, плана глав, написании текста, ремейках и сиквелах."
        value={effectiveInstructions}
        activeDraftsCount={activeAiDraftsCount}
        readOnly={readOnly}
        onSave={handleSaveInstructions}
      />

      {statusMessage && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1">
            <NoirStatus type="success" message={statusMessage} />
          </div>
          <button
            type="button"
            onClick={onProceedToChapters}
            className="min-h-[42px] px-4 bg-white text-black font-bold text-[14px] border border-white cursor-pointer shrink-0"
          >
            Открыть во вкладке «Главы» →
          </button>
        </div>
      )}

      <DraftsManagerPanel
        book={currentBook}
        chapters={chapters}
        userUid={userUid}
        readOnly={readOnly}
        onDraftsChanged={(list) =>
          setActiveAiDraftsCount(
            list.filter((d) => d.book_id === currentBook?.id && d.include_in_ai && d.status !== 'archive').length
          )
        }
        onAssembleChapter={currentBook && !readOnly ? handleAssembleChapterFromDrafts : undefined}
      />
    </div>
  );
};
