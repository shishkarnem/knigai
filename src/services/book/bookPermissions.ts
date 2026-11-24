import { AppUser, Book, BookPermissions } from '../../types';

/**
 * Determines if a book originated from external online catalog/archive parsers
 * (Flibusta, OPDS, Samlib, Librusec, Yandex Books, Anna's Archive, LibriVox)
 */
export function isParsedExternalBook(book: Book | null | undefined): boolean {
  if (!book) return false;
  if (book.is_parsed_source === true) return true;
  if (book.original_file_url && book.original_file_url.trim().length > 0) return true;
  if (book.book_meta?.flibustaBookId) return true;
  if (book.book_meta?.sourceUrl && book.book_meta.sourceUrl.trim().length > 0) return true;
  return false;
}

/**
 * Strict ownership & edit protection rules:
 * - Own non-parsed books: full edit access (canEditContent = true)
 * - Own parser-downloaded books: read-only chapters/content; ONLY metadata headers + cover + Remix/Sequel
 * - Foreign books (another user's UID or public unowned seed for non-admins): strictly read-only; ONLY Reader, Cache, Details, Remix, Sequel
 */
export function getBookPermissions(
  book: Book | null | undefined,
  currentUser: AppUser | null | undefined
): BookPermissions {
  if (!book) {
    return {
      isOwner: false,
      isParsedBook: false,
      isForeignBook: true,
      canEditContent: false,
      canEditHeadersOnly: false,
      canCreateRemix: false,
      canCreateSequel: false,
      canPublishOrDelete: false,
    };
  }

  const isOwner = Boolean(
    currentUser &&
      ((book.user_uid != null && Number(book.user_uid) === Number(currentUser.uid)) ||
        (book.user_uid == null && Boolean(currentUser.is_admin)))
  );

  const isParsedBook = isParsedExternalBook(book);
  const isForeignBook = !isOwner;

  return {
    isOwner,
    isParsedBook,
    isForeignBook,
    canEditContent: isOwner && !isParsedBook,
    canEditHeadersOnly: isOwner && isParsedBook,
    canCreateRemix: Boolean(currentUser) || true, // guest prompts auth when clicking Remix
    canCreateSequel: Boolean(currentUser) || true,
    canPublishOrDelete: isOwner,
  };
}
