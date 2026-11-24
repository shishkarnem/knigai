import React, { useState } from 'react';
import { BookOpen, CopyPlus, FileEdit, Lock } from 'lucide-react';
import { AppUser, Book, BookPermissions } from '../../../types';
import { NoirButton } from '../../common/NoirButton';
import { BookHeadersEditModal } from './BookHeadersEditModal';
import { RemixBookModal } from '../RemixBookModal';

interface BookReadOnlyBannerProps {
  book: Book;
  perms: BookPermissions;
  currentUser: AppUser | null;
  onBookUpdated?: (updated: Book) => void;
  onNavigateToReader?: () => void;
  sectionLabel?: string;
}

/**
 * Displays a transparent Noir protection notice when the active book is either:
 * - Downloaded via an external parser (content read-only; headers + remix allowed for owner)
 * - Owned by another author (strictly read-only; Reader + Remix allowed)
 */
export const BookReadOnlyBanner: React.FC<BookReadOnlyBannerProps> = ({
  book,
  perms,
  currentUser,
  onBookUpdated,
  onNavigateToReader,
  sectionLabel = 'редактирование содержимого',
}) => {
  const [isHeadersOpen, setIsHeadersOpen] = useState(false);
  const [isRemixOpen, setIsRemixOpen] = useState(false);

  if (perms.canEditContent) return null;

  const isParser = perms.isParsedBook && perms.isOwner;

  return (
    <div className="noir-container p-4 sm:p-5 border-2 border-rose-500/80 bg-zinc-950/90 flex flex-col gap-3 text-white min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 bg-rose-950/70 border border-rose-500 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-rose-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold text-white leading-snug">
              {isParser
                ? 'Книга из онлайн-каталога (защита текста оригинала)'
                : 'Чужая авторская книга (режим только чтение)'}
            </h3>
            <p className="text-[14px] text-zinc-300 mt-1 leading-relaxed">
              {isParser
                ? `Для книг, загруженных через парсер, ${sectionLabel} заблокировано. Вы можете менять только заголовки, обложку и колонтитулы или создать свой ремикс / продолжение.`
                : `Эта книга принадлежит другому автору — ${sectionLabel} и генерация поверх оригинала запрещены. Вы можете открыть читалку или создать свой ремикс / фанфик.`}
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {perms.canEditHeadersOnly && (
          <NoirButton
            variant="outline"
            onClick={() => setIsHeadersOpen(true)}
            icon={<FileEdit className="w-4 h-4 text-rose-400" />}
          >
            Редактировать заголовки и аннотацию
          </NoirButton>
        )}

        <NoirButton
          variant="primary"
          onClick={() => setIsRemixOpen(true)}
          icon={<CopyPlus className="w-4 h-4 text-black" />}
        >
          Создать свой ремикс / фанфик
        </NoirButton>

        {onNavigateToReader && (
          <NoirButton
            variant="subtle"
            onClick={onNavigateToReader}
            icon={<BookOpen className="w-4 h-4 text-rose-400" />}
          >
            Открыть в читалке
          </NoirButton>
        )}
      </div>

      {isHeadersOpen && (
        <BookHeadersEditModal
          isOpen={isHeadersOpen}
          onClose={() => setIsHeadersOpen(false)}
          book={book}
          onBookUpdated={(upd) => {
            onBookUpdated?.(upd);
            setIsHeadersOpen(false);
          }}
        />
      )}

      {isRemixOpen && (
        <RemixBookModal
          isOpen={isRemixOpen}
          onClose={() => setIsRemixOpen(false)}
          sourceBook={book}
          currentUser={currentUser}
          onRemixCreated={(res) => {
            onBookUpdated?.(res.book);
            setIsRemixOpen(false);
          }}
        />
      )}
    </div>
  );
};
