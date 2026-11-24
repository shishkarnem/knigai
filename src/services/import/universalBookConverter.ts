import JSZip from 'jszip';
import { Book, Chapter, AudioTrack } from '../../types';
import { splitBookIntoChapters, parseUploadedFileToText } from './bookParser';
import { generateSlug } from '../db/bookRepository';
import { parseComicArchive } from './comicArchiveParser';
import { parseEpubFile, parseMobiFile } from './mobiEpubParser';

export interface ConvertedBookResult {
  book: Omit<Book, 'id'>;
  chapters: Omit<Chapter, 'id'>[];
}

const AUDIO_EXTENSIONS = ['mp3', 'm4b', 'm4a', 'aac', 'ogg', 'wav', 'flac'];
const COMIC_EXTENSIONS = ['cbz', 'cbr'];
const MOBI_EXTENSIONS = ['mobi', 'azw', 'azw3'];

/**
 * Converts any file or array of files:
 * - Ebooks: epub, fb2, mobi, azw, azw3, txt, pdf, doc, docx, rtf, html, htm, zip (fb2.zip, txt.zip)
 * - Comics & Manga: cbz, cbr, png, jpg, jpeg, webp
 * - Audiobooks: mp3, m4b, m4a, aac, ogg, wav, flac
 * into a structured Book with complete chapters for the 3D reader.
 */
export async function convertImportedFilesToBook(
  files: File[],
  meta: {
    title?: string;
    author?: string;
    description?: string;
    genre?: string;
    userUid?: number;
    isPublished?: boolean;
    originalFileUrl?: string;
    fileStorageId?: number;
  }
): Promise<ConvertedBookResult> {
  if (!files || files.length === 0) {
    throw new Error('Не выбраны файлы для импорта книги');
  }

  const primaryFile = files[0];
  const fileExt = primaryFile.name.split('.').pop()?.toLowerCase() || '';

  const assignedTitle = (meta.title && meta.title.trim()) ||
    primaryFile.name.replace(/\.[^/.]+$/, '').trim() ||
    'Новая книга';
  let assignedAuthor = (meta.author && meta.author.trim()) || 'Автор KnigAI';

  // 0. ZIP ARCHIVE (e.g. RuLit, Flibusta, or zipped books)
  if (fileExt === 'zip') {
    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(await primaryFile.arrayBuffer());
      const allFiles = Object.values(loadedZip.files).filter((f) => !f.dir);

      // Find primary book file
      const bookEntry = allFiles.find((f) =>
        /\.(fb2|txt|rtf|epub|mobi|azw3?|html?)$/i.test(f.name)
      );

      // Find cover image if present
      const coverEntry = allFiles.find((f) =>
        /\.(jpe?g|png|webp)$/i.test(f.name)
      );

      let extractedCoverUrl = '';
      if (coverEntry) {
        const coverBuf = await coverEntry.async('uint8array');
        const coverExt = coverEntry.name.split('.').pop()?.toLowerCase() || 'jpg';
        const mime = coverExt === 'png' ? 'image/png' : 'image/jpeg';
        const base64 = btoa(
          new Uint8Array(coverBuf).reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        extractedCoverUrl = `data:${mime};base64,${base64}`;
      }

      if (bookEntry) {
        const bookBuf = await bookEntry.async('uint8array');
        const innerExt = bookEntry.name.split('.').pop()?.toLowerCase() || 'txt';
        const innerFile = new File([bookBuf as any], bookEntry.name, {
          type: innerExt === 'epub' ? 'application/epub+zip' : 'application/octet-stream',
        });

        // Parse inner book file
        const result = await convertImportedFilesToBook([innerFile], {
          ...meta,
          title: meta.title || assignedTitle,
          author: meta.author || assignedAuthor,
        });

        // Attach cover if found in zip
        if (extractedCoverUrl && !result.book.cover_config.frontImageUrl) {
          result.book.cover_config.frontImageUrl = extractedCoverUrl;
        }

        if (meta.originalFileUrl) {
          result.book.original_file_url = meta.originalFileUrl;
          result.book.file_storage_id = meta.fileStorageId;
        }

        return result;
      }

      // If no book document found, check if zip contains comic pages
      const imageEntries = allFiles.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
      if (imageEntries.length > 0) {
        return parseComicArchive(primaryFile).then((comic) => {
          const finalTitle = (meta.title && meta.title.trim()) || comic.title || assignedTitle;
          const finalGenre = (meta.genre && meta.genre.trim()) || 'Манга / Комикс';

          const chapters: Omit<Chapter, 'id'>[] = comic.pages.map((p, idx) => ({
            book_id: 0,
            user_uid: meta.userUid,
            chapter_number: idx + 1,
            title: p.title || `Страница ${idx + 1}`,
            synopsis: `Графическая страница ${idx + 1} комикса «${finalTitle}».`,
            content: '',
            illustration_url: p.imageUrl,
            illustration_prompt: `Страница комикса ${finalTitle}`,
            status: 'ready',
            image_layout: {
              mode: 'full-width',
              scale: 100,
              filter: 'normal',
            },
          }));

          const book: Omit<Book, 'id'> = {
            user_uid: meta.userUid,
            title: finalTitle,
            slug: generateSlug(finalTitle),
            subtitle: `Графический роман (${comic.pages.length} страниц)`,
            author: assignedAuthor,
            genres: [finalGenre, 'Графический роман'],
            target_chapters: chapters.length,
            status: 'completed',
            is_published: meta.isPublished ?? true,
            synopsis_overview: `Комикс/манга «${finalTitle}». Издание формата А5, ${comic.pages.length} страниц.`,
            running_header: finalTitle,
            original_file_url: meta.originalFileUrl,
            file_storage_id: meta.fileStorageId,
            cover_config: {
              frontTitle: finalTitle,
              frontSubtitle: finalGenre,
              authorName: assignedAuthor,
              spineText: `${finalTitle} — ${assignedAuthor}`,
              backBlurb: `Графический роман «${finalTitle}» из ${comic.pages.length} страниц.`,
              genreLabel: finalGenre,
              frontImageUrl: comic.coverUrl,
              spineColor: '#18181b',
              paperType: 'cream',
              pageCountEstimate: comic.pages.length + 8,
              isbn: '978-5-00-192847-3',
              barcodeText: 'Издание формата А5',
            },
          };

          return { book, chapters };
        });
      }
    } catch (zipErr) {
      console.warn('ZIP extraction notice:', zipErr);
    }
  }

  // 1. COMIC ARCHIVE (CBZ, CBR)
  if (COMIC_EXTENSIONS.includes(fileExt)) {
    const comic = await parseComicArchive(primaryFile);
    const finalTitle = (meta.title && meta.title.trim()) || comic.title || assignedTitle;
    const finalGenre = (meta.genre && meta.genre.trim()) || 'Манга / Комикс';

    const chapters: Omit<Chapter, 'id'>[] = comic.pages.map((p, idx) => ({
      book_id: 0,
      user_uid: meta.userUid,
      chapter_number: idx + 1,
      title: p.title || `Страница ${idx + 1}`,
      synopsis: `Графическая страница ${idx + 1} комикса «${finalTitle}».`,
      content: '', // Empty text so comic reader renders full-page graphic spread
      illustration_url: p.imageUrl,
      illustration_prompt: `Страница комикса ${finalTitle}`,
      status: 'ready',
      image_layout: {
        mode: 'full-width',
        scale: 100,
        filter: 'normal',
      },
    }));

    const book: Omit<Book, 'id'> = {
      user_uid: meta.userUid,
      title: finalTitle,
      slug: generateSlug(finalTitle),
      subtitle: `Графический роман (${comic.pages.length} страниц)`,
      author: assignedAuthor,
      genres: [finalGenre, 'Графический роман'],
      target_chapters: chapters.length,
      status: 'completed',
      is_published: meta.isPublished ?? true,
      synopsis_overview: `Комикс/манга «${finalTitle}». Издание формата А5, ${comic.pages.length} страниц.`,
      running_header: finalTitle,
      cover_config: {
        frontTitle: finalTitle,
        frontSubtitle: finalGenre,
        authorName: assignedAuthor,
        spineText: `${finalTitle} — ${assignedAuthor}`,
        backBlurb: `Графический роман «${finalTitle}» из ${comic.pages.length} страниц.`,
        genreLabel: finalGenre,
        frontImageUrl: comic.coverUrl,
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: comic.pages.length + 8,
        isbn: '978-5-00-192847-3',
        barcodeText: 'Издание формата А5',
      },
    };

    return { book, chapters };
  }

  // 2. AUDIOBOOK IMPORT (MP3, M4B, M4A, AAC, OGG, WAV, FLAC)
  const isAudio = files.every((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    return AUDIO_EXTENSIONS.includes(ext);
  });

  if (isAudio) {
    const sortedAudioFiles = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const audioTracks: AudioTrack[] = [];
    const chapters: Omit<Chapter, 'id'>[] = [];

    for (let i = 0; i < sortedAudioFiles.length; i++) {
      const f = sortedAudioFiles[i];
      const trackUrl = URL.createObjectURL(f);
      const cleanTrackName = f.name.replace(/\.[^/.]+$/, '').trim();

      const track: AudioTrack = {
        id: `audio_${Date.now()}_${i + 1}`,
        title: cleanTrackName || `Глава ${i + 1}`,
        url: trackUrl,
        chapter_number: i + 1,
      };
      audioTracks.push(track);

      chapters.push({
        book_id: 0,
        user_uid: meta.userUid,
        chapter_number: i + 1,
        title: track.title,
        synopsis: `Аудиозапись главы ${i + 1}: «${track.title}».`,
        content: `Аудиозапись главы ${i + 1}.\n\nВоспользуйтесь аудиопанелью в читалке для прослушивания этой главы. Переключайтесь между главами и управляйте скоростью воспроизведения.`,
        illustration_url: '',
        illustration_prompt: '',
        audio_url: trackUrl,
        status: 'ready',
      });
    }

    const finalGenre = (meta.genre && meta.genre.trim()) || 'Аудиокнига';
    const book: Omit<Book, 'id'> = {
      user_uid: meta.userUid,
      title: assignedTitle,
      slug: generateSlug(assignedTitle),
      subtitle: `Аудиоиздание (${audioTracks.length} аудиоглав)`,
      author: assignedAuthor,
      genres: [finalGenre, 'Классика'],
      target_chapters: chapters.length,
      status: 'completed',
      is_published: meta.isPublished ?? true,
      synopsis_overview: `Аудиокнига «${assignedTitle}» (${assignedAuthor}). Включает ${audioTracks.length} аудиоглав.`,
      running_header: assignedTitle,
      original_file_url: meta.originalFileUrl,
      file_storage_id: meta.fileStorageId,
      audio_tracks: audioTracks,
      cover_config: {
        frontTitle: assignedTitle,
        frontSubtitle: 'Аудиокнига',
        authorName: assignedAuthor,
        spineText: `${assignedTitle} — ${assignedAuthor}`,
        backBlurb: `Аудиокнига «${assignedTitle}» в формате книжный нуар А5.`,
        genreLabel: finalGenre,
        frontImageUrl: '',
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: chapters.length * 4 + 10,
        isbn: '978-5-00-192848-0',
        barcodeText: 'Издание формата А5',
      },
    };

    return { book, chapters };
  }

  // 3. EPUB IMPORT (.epub)
  if (fileExt === 'epub') {
    const epub = await parseEpubFile(primaryFile);
    const finalTitle = (meta.title && meta.title.trim()) || epub.title || assignedTitle;
    const finalAuthor = (meta.author && meta.author.trim()) || epub.author || assignedAuthor;
    const finalGenre = (meta.genre && meta.genre.trim()) || 'Художественная литература';

    const chapters: Omit<Chapter, 'id'>[] = epub.chapters.map((c, idx) => ({
      book_id: 0,
      user_uid: meta.userUid,
      chapter_number: idx + 1,
      title: c.title || `Глава ${idx + 1}`,
      synopsis: `Глава ${idx + 1}: ${c.title}. Объем: ${c.wordCount} слов.`,
      content: c.content,
      illustration_url: '',
      illustration_prompt: '',
      status: 'ready',
    }));

    const book: Omit<Book, 'id'> = {
      user_uid: meta.userUid,
      title: finalTitle,
      slug: generateSlug(finalTitle),
      subtitle: 'Полное издание (EPUB)',
      author: finalAuthor,
      genres: [finalGenre],
      target_chapters: chapters.length,
      status: 'completed',
      is_published: meta.isPublished ?? true,
      synopsis_overview: epub.description || `Книга «${finalTitle}» автора ${finalAuthor}. Включает ${chapters.length} глав.`,
      running_header: finalTitle,
      original_file_url: meta.originalFileUrl,
      file_storage_id: meta.fileStorageId,
      cover_config: {
        frontTitle: finalTitle,
        frontSubtitle: finalGenre,
        authorName: finalAuthor,
        spineText: `${finalTitle} — ${finalAuthor}`,
        backBlurb: epub.description || `Книга «${finalTitle}».`,
        genreLabel: finalGenre,
        frontImageUrl: '',
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: chapters.length * 14 + 16,
        isbn: '978-5-00-184920-4',
        barcodeText: 'Издание формата А5',
      },
    };

    return { book, chapters };
  }

  // 4. MOBI / AZW / AZW3 IMPORT
  if (MOBI_EXTENSIONS.includes(fileExt)) {
    const mobi = await parseMobiFile(primaryFile);
    const finalTitle = (meta.title && meta.title.trim()) || mobi.title || assignedTitle;
    const finalGenre = (meta.genre && meta.genre.trim()) || 'Художественная литература';

    const chapters: Omit<Chapter, 'id'>[] = mobi.chapters.map((c, idx) => ({
      book_id: 0,
      user_uid: meta.userUid,
      chapter_number: idx + 1,
      title: c.title || `Глава ${idx + 1}`,
      synopsis: `Глава ${idx + 1}: ${c.title}. В главе ${c.wordCount} слов.`,
      content: c.content,
      illustration_url: '',
      illustration_prompt: '',
      status: 'ready',
    }));

    const book: Omit<Book, 'id'> = {
      user_uid: meta.userUid,
      title: finalTitle,
      slug: generateSlug(finalTitle),
      subtitle: `Издание MOBI (${chapters.length} глав)`,
      author: assignedAuthor,
      genres: [finalGenre],
      target_chapters: chapters.length,
      status: 'completed',
      is_published: meta.isPublished ?? true,
      synopsis_overview: `Книга «${finalTitle}». Включает ${chapters.length} глав.`,
      running_header: finalTitle,
      original_file_url: meta.originalFileUrl,
      file_storage_id: meta.fileStorageId,
      cover_config: {
        frontTitle: finalTitle,
        frontSubtitle: finalGenre,
        authorName: assignedAuthor,
        spineText: `${finalTitle} — ${assignedAuthor}`,
        backBlurb: `Книга «${finalTitle}».`,
        genreLabel: finalGenre,
        frontImageUrl: '',
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: chapters.length * 12 + 10,
        isbn: '978-5-00-184921-1',
        barcodeText: 'Издание формата А5',
      },
    };

    return { book, chapters };
  }

  // 5. IMAGE-BASED BOOK (PNG, JPG, WEBP)
  const isAllImages = files.every((f) => {
    const ext = f.name.split('.').pop()?.toLowerCase();
    return ext === 'png' || ext === 'jpg' || ext === 'jpeg' || ext === 'webp';
  });

  if (isAllImages) {
    const sortedFiles = [...files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    const chapters: Omit<Chapter, 'id'>[] = [];
    let coverUrl = '';

    for (let i = 0; i < sortedFiles.length; i++) {
      const file = sortedFiles[i];
      const dataUrl = await fileToDataUrl(file);
      const pageTitle = file.name.replace(/\.[^/.]+$/, '');

      if (i === 0) coverUrl = dataUrl;

      chapters.push({
        book_id: 0,
        user_uid: meta.userUid,
        chapter_number: i + 1,
        title: pageTitle.length > 25 ? `Страница ${i + 1}` : pageTitle,
        synopsis: `Графическая страница ${i + 1} книги «${assignedTitle}».`,
        content: '',
        illustration_url: dataUrl,
        illustration_prompt: `Графическая страница книги ${assignedTitle}`,
        status: 'ready',
        image_layout: {
          mode: 'full-width',
          scale: 100,
          filter: 'normal',
        },
      });
    }

    const finalGenre = (meta.genre && meta.genre.trim()) || 'Графический роман';
    const book: Omit<Book, 'id'> = {
      user_uid: meta.userUid,
      title: assignedTitle,
      slug: generateSlug(assignedTitle),
      subtitle: `Графическое издание (${sortedFiles.length} страниц)`,
      author: assignedAuthor,
      genres: [finalGenre, 'Иллюстрированное издание'],
      target_chapters: chapters.length,
      status: 'completed',
      is_published: meta.isPublished ?? true,
      synopsis_overview: `Графическое издание «${assignedTitle}». ${chapters.length} страниц формата А5.`,
      running_header: assignedTitle,
      original_file_url: meta.originalFileUrl,
      file_storage_id: meta.fileStorageId,
      cover_config: {
        frontTitle: assignedTitle,
        frontSubtitle: finalGenre,
        authorName: assignedAuthor,
        spineText: `${assignedTitle} — ${assignedAuthor}`,
        backBlurb: `Книга «${assignedTitle}».`,
        genreLabel: finalGenre,
        frontImageUrl: coverUrl,
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: chapters.length * 2 + 10,
        isbn: '978-5-00-184920-4',
        barcodeText: 'Издание формата А5',
      },
    };

    return { book, chapters };
  }

  // 6. TEXT-BASED IMPORT (TXT, FB2, RTF, HTML, DOCX, DOC, PDF)
  let accumulatedText = '';
  let detectedDocTitle = '';
  let detectedAuthor = '';
  let detectedDescription = '';
  let extractedCover = '';
  let explicitChapters: Omit<Chapter, 'id'>[] = [];

  for (const file of files) {
    const parsed = await parseUploadedFileToText(file);
    if (!detectedDocTitle && parsed.detectedTitle) {
      detectedDocTitle = parsed.detectedTitle;
    }
    if (!detectedAuthor && parsed.detectedAuthor) {
      detectedAuthor = parsed.detectedAuthor;
    }
    if (!detectedDescription && parsed.detectedDescription) {
      detectedDescription = parsed.detectedDescription;
    }
    if (!extractedCover && parsed.coverBase64) {
      extractedCover = parsed.coverBase64;
    }
    if (parsed.chapters && parsed.chapters.length > 0 && explicitChapters.length === 0) {
      explicitChapters = parsed.chapters.map((pc, idx) => ({
        book_id: 0,
        user_uid: meta.userUid,
        chapter_number: idx + 1,
        title: pc.title || `Глава ${idx + 1}`,
        synopsis: pc.synopsis || `Краткое содержание главы ${idx + 1}: ${pc.title}. В главе ${pc.wordCount} слов.`,
        content: pc.content,
        illustration_url: pc.illustration_url || (idx === 0 && extractedCover ? extractedCover : ''),
        illustration_prompt: '',
        status: 'ready',
      }));
    }
    if (parsed.text && parsed.text.trim()) {
      accumulatedText += (accumulatedText ? '\n\n' : '') + parsed.text.trim();
    }
  }

  if (!accumulatedText.trim() && explicitChapters.length === 0) {
    throw new Error('Файлы не содержат читаемого текста или повреждены');
  }

  const finalTitle = (meta.title && meta.title.trim()) || detectedDocTitle || assignedTitle;
  const finalAuthor = (meta.author && meta.author.trim()) || detectedAuthor || assignedAuthor;
  const chapters: Omit<Chapter, 'id'>[] = explicitChapters.length > 0
    ? explicitChapters
    : splitBookIntoChapters(accumulatedText, finalTitle).map((pc, idx) => ({
        book_id: 0,
        user_uid: meta.userUid,
        chapter_number: idx + 1,
        title: pc.title || `Глава ${idx + 1}`,
        synopsis: `Краткое содержание главы ${idx + 1}: ${pc.title}. В главе ${pc.wordCount} слов.`,
        content: pc.content,
        illustration_url: pc.illustration_url || (idx === 0 && extractedCover ? extractedCover : ''),
        illustration_prompt: '',
        status: 'ready',
      }));

  const finalGenre = (meta.genre && meta.genre.trim()) || 'Современная проза';

  const book: Omit<Book, 'id'> = {
    user_uid: meta.userUid,
    title: finalTitle,
    slug: generateSlug(finalTitle),
    subtitle: `Издание в формате А5 (${fileExt.toUpperCase()})`,
    author: finalAuthor,
    genres: [finalGenre],
    target_chapters: chapters.length,
    status: 'completed',
    is_published: meta.isPublished ?? true,
    synopsis_overview: (meta.description && meta.description.trim()) || detectedDescription || `Книга «${finalTitle}» автора ${finalAuthor}. Включает ${chapters.length} глав.`,
    running_header: finalTitle,
    original_file_url: meta.originalFileUrl,
    file_storage_id: meta.fileStorageId,
    cover_config: {
      frontTitle: finalTitle,
      frontSubtitle: finalGenre,
      authorName: finalAuthor,
      spineText: `${finalTitle} — ${finalAuthor}`,
      backBlurb: (meta.description && meta.description.trim()) || detectedDescription || `Книга «${finalTitle}» автора ${finalAuthor}.`,
      genreLabel: finalGenre,
      frontImageUrl: extractedCover || '',
      spineColor: '#18181b',
      paperType: 'cream',
      pageCountEstimate: chapters.length * 14 + 12,
      isbn: '978-5-00-184920-4',
      barcodeText: 'Издание формата А5',
    },
  };

  return { book, chapters };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Не удалось прочитать файл ${file.name}`));
    reader.readAsDataURL(file);
  });
}
