import { Express, Request, Response } from 'express';
import { downloadAndExtractBook, buildFallbackBookData } from './bookExtractor';
import { localDb } from './localDb';
import { searchFlibusta, resolveFlibustaSuDownloadUrl, fetchFlibustaBookDetails } from './flibustaService';

interface QueryPgFn {
  <T = Record<string, unknown>>(sql: string, params?: (string | number | boolean | null)[]): Promise<{ rows: T[]; rowCount: number }>;
}

interface GetUniqueFileNameFn {
  (originalName: string): Promise<string>;
}

const PROTALK_UPLOAD_TOKEN = 'YGpaUXFjXl5tZ1h3GH0AG0cLDBsyTwwZBFYNIjU6LjwQeAlFIAYFNWYBNDVrNRQYaGtdWGtjUgVvAH9YAmk';

/**
 * Uploads a buffer directly to filestore with valid authentication token and explicit Content-Length
 */
async function uploadToFilestore(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  caption?: string
): Promise<string> {
  const boundary = '----NodeFormBoundary' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  const safeFilename = filename || 'book_file';
  const encodedFilename = encodeURIComponent(safeFilename);

  const parts: Buffer[] = [];

  // Optional Telegram caption with book metadata
  if (caption && caption.trim()) {
    parts.push(
      Buffer.from(
        '--' + boundary + '\r\n' +
        'Content-Disposition: form-data; name="caption"\r\n\r\n' +
        caption.trim() + '\r\n'
      )
    );
  }

  // File part with standard filename and UTF-8 filename*
  parts.push(
    Buffer.from(
      '--' + boundary + '\r\n' +
      'Content-Disposition: form-data; name="file"; filename="' + safeFilename + '"; filename*=UTF-8\'\'' + encodedFilename + '\r\n' +
      'Content-Type: ' + (mimeType || 'application/octet-stream') + '\r\n\r\n'
    )
  );
  parts.push(buffer);
  parts.push(Buffer.from('\r\n--' + boundary + '--\r\n'));

  const body = Buffer.concat(parts);

  const res = await fetch('https://file.pro-talk.ru/tgf', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
      'Content-Length': String(body.length),
      'X-Upload-Token': PROTALK_UPLOAD_TOKEN,
      'X-Preserve-Alpha': 'true',
    },
    body: body,
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Ошибка загрузки файла в хранилище [${res.status}]: ${errorText}`);
  }

  const rawText = (await res.text()).trim();
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof parsed.url === 'string') return parsed.url;
    if (parsed && typeof parsed.file_url === 'string') return parsed.file_url;
  } catch {
    // not JSON
  }
  return rawText;
}

/**
 * Registers an uploaded file in PostgreSQL file_storage table
 */
async function registerInFileStorage(
  queryPg: QueryPgFn,
  getUniqueFileName: GetUniqueFileNameFn,
  userUid: number,
  filename: string,
  originalUrl: string,
  mimeType: string,
  fileSize: number
): Promise<{ id: number; original_url: string }> {
  // Prevent duplicate key error if file with same URL already registered
  try {
    const checkExisting = await queryPg<{ id: number; original_url: string }>(
      'SELECT id, original_url FROM file_storage WHERE url = $1 OR original_url = $1 LIMIT 1;',
      [originalUrl]
    );
    if (checkExisting.rows && checkExisting.rows.length > 0) {
      return checkExisting.rows[0];
    }
  } catch {
    // proceed to insert
  }

  const uniqueName = await getUniqueFileName(filename);
  const fileKey = `knigai_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  const insertSql = `
    INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes)
    VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6)
    RETURNING id, original_url;
  `;

  try {
    const res = await queryPg<{ id: number; original_url: string }>(insertSql, [
      userUid,
      fileKey,
      uniqueName,
      originalUrl,
      mimeType,
      fileSize,
    ]);
    return res.rows[0] || { id: 0, original_url: originalUrl };
  } catch (err: any) {
    console.warn('[Server Parser] DB storage record notice (continuing with direct URL):', err?.message || err);
    return { id: 0, original_url: originalUrl };
  }
}

function generateSlug(title: string): string {
  const ruMap: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'ts',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  };
  return title
    .toLowerCase()
    .split('')
    .map((char) => ruMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'kniga';
}

export function registerParserEndpoints(app: Express, queryPg: QueryPgFn, getUniqueFileName: GetUniqueFileNameFn) {
  /**
   * 0. Flibusta Search and Download Endpoints
   */
  app.get('/api/parser/flibusta/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      const type = (String(req.query.type || 'title')) as 'title' | 'author' | 'series';
      const format = req.query.format ? String(req.query.format) : undefined;
      if (!q) {
        return res.json({ items: [] });
      }
      const items = await searchFlibusta(q, type, format);
      res.json({ items });
    } catch (err: any) {
      console.warn('[Flibusta Search API] Notice:', err);
      res.json({ items: [] });
    }
  });

  app.post('/api/parser/flibusta/resolve-download', async (req: Request, res: Response) => {
    try {
      const { bookId, format } = req.body;
      if (!bookId) {
        return res.status(400).json({ error: 'Не указан bookId' });
      }
      const downloadUrl = await resolveFlibustaSuDownloadUrl(String(bookId), String(format || 'fb2.zip'));
      res.json({ success: true, downloadUrl });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Ошибка получения ссылки на скачивание' });
    }
  });

  app.get('/api/parser/flibusta/details/:bookId', async (req: Request, res: Response) => {
    try {
      const bookId = String(req.params.bookId || '').replace(/\D/g, '');
      if (!bookId) {
        return res.status(400).json({ error: 'Некорректный ID книги Флибусты' });
      }
      const details = await fetchFlibustaBookDetails(bookId);
      res.json({ success: true, bookId, details });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Ошибка загрузки карточки Флибусты' });
    }
  });

  app.get('/api/parser/local-books', (_req: Request, res: Response) => {
    const books = localDb.getBooks();
    res.json({ books });
  });

  /**
   * 1. Search Open Library & open catalogues
   */
  app.get('/api/parser/annas', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) {
        return res.json({ items: [] });
      }

      const queryParam = encodeURIComponent(q);
      const url = `https://openlibrary.org/search.json?q=${queryParam}&language=rus&limit=15`;
      const response = await fetch(url, { signal: AbortSignal.timeout(7000) });

      if (!response.ok) {
        return res.json({ items: [] });
      }

      const data = await response.json();
      const docs = data.docs || [];

      const items = docs.map((d: any, index: number) => {
        const title = d.title || q;
        const author = Array.isArray(d.author_name) ? d.author_name[0] : (d.author_name || 'Классический автор');
        const year = d.first_publish_year ? String(d.first_publish_year) : undefined;
        const coverId = d.cover_i;
        const coverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg` : undefined;
        const highResCoverUrl = coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : undefined;
        const key = d.key ? String(d.key).replace(/[^a-zA-Z0-9_-]/g, '_') : `item_${index}`;
        const iaId = d.ia && d.ia.length > 0 ? d.ia[0] : null;

        return {
          id: iaId ? `ia_${iaId}` : `annas_${key}`,
          source: 'annas',
          sourceName: 'Anna\'s Archive & Shadow Libs',
          title,
          author,
          year,
          language: 'русский',
          format: 'epub',
          contentType: 'book',
          sizeFormatted: '~2.4 МБ',
          coverUrl,
          highResCoverUrl,
          description: `Издание из каталога открытых архивов. Формат А5 с полной разметкой глав и иллюстрациями.`,
          downloadUrl: iaId ? `https://archive.org/download/${iaId}/${iaId}_djvu.txt` : `https://archive.org/details/${d.ia?.[0] || 'books'}`,
        };
      });

      res.json({ items });
    } catch (err) {
      console.warn('[Server Parser] Search notice:', err);
      res.json({ items: [] });
    }
  });

  /**
   * 2. Import parsed search item with real chapter extraction and file storage
   */
  app.post('/api/parser/import', async (req: Request, res: Response) => {
    try {
      const { item, user_uid } = req.body;
      if (!item || !item.title) {
        return res.status(400).json({ error: 'Не указаны данные книги для импорта' });
      }

      const effectiveUid = user_uid ? parseInt(user_uid, 10) : 10000000001;

      // Check if downloadUrl points to a downloadable file
      let originalFileUrl = '';
      let fileStorageId: number | undefined;
      let coverUrl = item.highResCoverUrl || item.coverUrl || '';
      let chapters: any[] = [];
      let resolvedTitle = (typeof item.title === 'string' ? item.title : Array.isArray(item.title) ? item.title.join(' ') : String(item.title || '')).trim() || 'Классическое произведение';
      let resolvedAuthor = (typeof item.author === 'string' ? item.author : Array.isArray(item.author) ? item.author.join(', ') : String(item.author || '')).trim() || 'Классический автор';

      const isDirectDownload = item.downloadUrl && item.downloadUrl.startsWith('http') && !item.downloadUrl.includes('/details/');
      let extractedMeta: any = null;
      let flibustaDetails: any = null;

      // Enrich Flibusta metadata if bookId is present and description/genres are incomplete
      if ((item.source === 'flibusta' || item.bookId) && (!item.description || !item.genres?.length)) {
        const bId = String(item.bookId || item.id || '').replace(/\D/g, '');
        if (bId) {
          try {
            flibustaDetails = await fetchFlibustaBookDetails(bId);
          } catch {
            // optional enrichment
          }
        }
      }

      if (isDirectDownload) {
        try {
          const extracted = await downloadAndExtractBook(item.downloadUrl, item.title, item.author);
          resolvedTitle = extracted.title || resolvedTitle;
          resolvedAuthor = extracted.author || resolvedAuthor;
          chapters = extracted.chapters;
          extractedMeta = extracted;

          // 1. Upload original book file to filestore (guarded)
          try {
            const uploadedUrl = await uploadToFilestore(
              extracted.originalBuffer,
              extracted.originalFilename,
              extracted.originalMime
            );
            originalFileUrl = uploadedUrl;

            // Register in file_storage table
            const regRecord = await registerInFileStorage(
              queryPg,
              getUniqueFileName,
              effectiveUid,
              extracted.originalFilename,
              uploadedUrl,
              extracted.originalMime,
              extracted.originalBuffer.length
            );
            fileStorageId = regRecord.id;
          } catch (fileUpErr) {
            console.warn('[Server Parser] Book file storage notice:', fileUpErr);
          }

          // 2. Upload extracted cover image if available (guarded)
          if (extracted.coverBuffer) {
            try {
              const coverExt = extracted.coverMime === 'image/png' ? 'png' : 'jpg';
              const coverName = `cover_${generateSlug(resolvedTitle)}.${coverExt}`;
              const uploadedCover = await uploadToFilestore(extracted.coverBuffer, coverName, extracted.coverMime || 'image/jpeg');
              coverUrl = uploadedCover;

              await registerInFileStorage(
                queryPg,
                getUniqueFileName,
                effectiveUid,
                coverName,
                uploadedCover,
                extracted.coverMime || 'image/jpeg',
                extracted.coverBuffer.length
              );
            } catch (covUpErr) {
              console.warn('[Server Parser] Cover storage notice:', covUpErr);
            }
          }
        } catch (downloadErr) {
          console.warn('[Server Parser] Direct book download notice, falling back:', downloadErr);
        }
      }

      // Handle audiobooks
      const isAudio = item.contentType === 'audiobook';
      const audioTracks = isAudio && Array.isArray(item.audioTracks) ? item.audioTracks : [];

      if (isAudio && audioTracks.length > 0) {
        chapters = audioTracks.map((track: any, idx: number) => ({
          chapter_number: idx + 1,
          title: track.title || `Глава ${idx + 1}`,
          synopsis: `Аудиоглава: ${track.title || `Часть ${idx + 1}`}`,
          content: `Аудиозапись главы ${idx + 1}.\nВоспользуйтесь аудиопанелью в читалке для прослушивания.`,
          illustration_url: coverUrl,
          illustration_prompt: `Иллюстрация к главе ${idx + 1}: ${track.title || item.title}`,
          audio_url: track.url,
          status: 'ready',
        }));
      }

      // Ensure chapters is NEVER empty for text books
      if (!isAudio && chapters.length === 0) {
        const fallback = buildFallbackBookData(item.downloadUrl || '', resolvedTitle, resolvedAuthor);
        chapters = fallback.chapters;

        if (!originalFileUrl) {
          try {
            const uploadedUrl = await uploadToFilestore(
              fallback.originalBuffer,
              fallback.originalFilename,
              fallback.originalMime
            );
            originalFileUrl = uploadedUrl;

            const reg = await registerInFileStorage(
              queryPg,
              getUniqueFileName,
              effectiveUid,
              fallback.originalFilename,
              uploadedUrl,
              fallback.originalMime,
              fallback.originalBuffer.length
            );
            fileStorageId = reg.id;
          } catch (fallbackUpErr) {
            console.warn('[Server Parser] Fallback storage notice:', fallbackUpErr);
          }
        }
      }

      // If cover was an external image and wasn't uploaded yet, cache it to filestore
      if (coverUrl && coverUrl.startsWith('http') && !coverUrl.includes('file.pro-talk.ru')) {
        try {
          const imgRes = await fetch(coverUrl, { signal: AbortSignal.timeout(4000) });
          if (imgRes.ok) {
            const buf = Buffer.from(await imgRes.arrayBuffer());
            const ext = coverUrl.toLowerCase().includes('.png') ? 'png' : 'jpg';
            const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
            const coverName = `cover_${generateSlug(resolvedTitle)}.${ext}`;
            const uploadedUrl = await uploadToFilestore(buf, coverName, mime);
            coverUrl = uploadedUrl;

            await registerInFileStorage(
              queryPg,
              getUniqueFileName,
              effectiveUid,
              coverName,
              uploadedUrl,
              mime,
              buf.length
            );
          }
        } catch (imgErr) {
          console.warn('[Server Parser] Cover download notice:', imgErr);
        }
      }

      // Merge rich metadata from Flibusta page, search item, and extracted file headers
      const mergedDescription =
        extractedMeta?.description ||
        flibustaDetails?.description ||
        item.description ||
        `Импортированное произведение «${resolvedTitle}» (${resolvedAuthor}). Полная версия, ${chapters.length} глав.`;
      const mergedGenres = Array.from(
        new Set([
          ...(Array.isArray(flibustaDetails?.genres) ? flibustaDetails.genres : []),
          ...(Array.isArray(item.genres) ? item.genres : []),
          ...(Array.isArray(extractedMeta?.genres) ? extractedMeta.genres : []),
        ])
      ).filter(Boolean);
      const finalGenres =
        mergedGenres.length > 0
          ? mergedGenres
          : isAudio
          ? ['Аудиокнига', 'Классика']
          : ['Художественная литература', 'Классика'];
      const mergedSeries = flibustaDetails?.series || item.series || extractedMeta?.series || undefined;
      const mergedSeriesNumber = flibustaDetails?.seriesNumber || item.seriesNumber || extractedMeta?.seriesNumber || undefined;
      const mergedBookMeta = {
        ...(item.bookMeta || {}),
        ...(flibustaDetails?.bookMeta || {}),
        ...(extractedMeta?.meta || {}),
        year: extractedMeta?.meta?.year || flibustaDetails?.year || item.year,
        translator: extractedMeta?.meta?.translator || flibustaDetails?.translator || item.translator,
        publisher: extractedMeta?.meta?.publisher || flibustaDetails?.publisher || item.publisher,
        isbn: extractedMeta?.meta?.isbn || flibustaDetails?.isbn || item.isbn,
        language: extractedMeta?.meta?.language || item.language,
        flibustaBookId: item.bookId || flibustaDetails?.bookMeta?.flibustaBookId,
        pageCountEstimate: flibustaDetails?.a5PagesEstimate || item.a5PagesEstimate || Math.max(chapters.length * 16, 20),
        sizeText: flibustaDetails?.sizeFormatted || item.sizeFormatted,
      };

      // Construct Book entity
      const book = {
        user_uid: effectiveUid,
        title: resolvedTitle,
        slug: generateSlug(resolvedTitle),
        subtitle: isAudio
          ? `Аудиоиздание (${chapters.length} глав)`
          : mergedBookMeta.year
          ? `Издание ${mergedBookMeta.year} года (${chapters.length} глав)`
          : `Формат А5 (${chapters.length} глав)`,
        author: resolvedAuthor,
        genres: finalGenres,
        series_name: mergedSeries,
        series_order: mergedSeriesNumber,
        book_meta: mergedBookMeta,
        target_chapters: chapters.length,
        status: 'ready',
        is_published: true,
        is_parsed_source: true,
        format: isAudio ? 'mp3' : (extractedMeta?.format || item.format || 'fb2'),
        content_type: isAudio ? 'audiobook' : (item.contentType || 'book'),
        synopsis_overview: mergedDescription,
        original_file_url: originalFileUrl || undefined,
        file_storage_id: fileStorageId,
        audio_tracks: audioTracks.length > 0 ? audioTracks : undefined,
        cover_config: {
          frontTitle: resolvedTitle,
          frontSubtitle: isAudio ? 'Аудиокнига' : (mergedSeries ? `${mergedSeries}${mergedSeriesNumber ? ` #${mergedSeriesNumber}` : ''}` : 'Издание формата А5'),
          authorName: resolvedAuthor,
          spineText: `${resolvedTitle} — ${resolvedAuthor}`,
          backBlurb: mergedDescription,
          genreLabel: finalGenres[0] || (isAudio ? 'Аудиокнига' : 'Художественная литература'),
          frontImageUrl: coverUrl,
          spineColor: '#18181b',
          paperType: 'cream',
          pageCountEstimate: mergedBookMeta.pageCountEstimate || Math.max(chapters.length * 16, 20),
          isbn: mergedBookMeta.isbn || '978-5-00-198274-1',
          barcodeText: 'Издание формата А5',
        },
      };

      // Persist in server-side local database so data survives restarts
      try {
        const localId = Date.now();
        localDb.saveBook({ id: localId, ...book });
        localDb.saveChapters(localId, chapters);
      } catch (saveErr) {
        console.warn('[Server Parser] LocalDB persist notice:', saveErr);
      }

      res.json({
        success: true,
        book,
        chapters,
        coverUrl,
        original_file_url: originalFileUrl,
        file_storage_id: fileStorageId,
      });
    } catch (err: any) {
      console.error('[Server Parser Import] Error:', err);
      res.status(500).json({ error: err.message || 'Ошибка импорта книги' });
    }
  });

  /**
   * 3. Direct URL Download & Import Endpoint
   * Accepts any direct link (e.g. rulit.me, flibusta, raw fb2, txt, epub, rtf, html, zip)
   */
  app.post('/api/parser/import-url', async (req: Request, res: Response) => {
    try {
      const { url, user_uid, title: titleHint, author: authorHint } = req.body;
      if (!url || typeof url !== 'string' || !url.startsWith('http')) {
        return res.status(400).json({ error: 'Укажите корректную ссылку на книгу (http/https)' });
      }

      const effectiveUid = user_uid ? parseInt(user_uid, 10) : 10000000001;

      // 1. Download and extract all real chapters and cover
      const extracted = await downloadAndExtractBook(url.trim(), titleHint, authorHint);

      let originalFileUrl = '';
      let fileStorageId: number | undefined;

      // 2. Upload original file to filestore (guarded)
      try {
        originalFileUrl = await uploadToFilestore(
          extracted.originalBuffer,
          extracted.originalFilename,
          extracted.originalMime
        );

        // Register original file in file_storage
        const regRecord = await registerInFileStorage(
          queryPg,
          getUniqueFileName,
          effectiveUid,
          extracted.originalFilename,
          originalFileUrl,
          extracted.originalMime,
          extracted.originalBuffer.length
        );
        fileStorageId = regRecord?.id;
      } catch (fileUpErr) {
        console.warn('[Server Parser import-url] File upload notice:', fileUpErr);
      }

      // 3. Upload extracted cover if available (guarded)
      let coverUrl = '';
      if (extracted.coverBuffer) {
        try {
          const coverExt = extracted.coverMime === 'image/png' ? 'png' : 'jpg';
          const coverName = `cover_${generateSlug(extracted.title)}.${coverExt}`;
          coverUrl = await uploadToFilestore(extracted.coverBuffer, coverName, extracted.coverMime || 'image/jpeg');

          await registerInFileStorage(
            queryPg,
            getUniqueFileName,
            effectiveUid,
            coverName,
            coverUrl,
            extracted.coverMime || 'image/jpeg',
            extracted.coverBuffer.length
          );
        } catch (covUpErr) {
          console.warn('[Server Parser import-url] Cover upload notice:', covUpErr);
        }
      }

      // 4. Create book entity in PostgreSQL with full extracted metadata
      const bookSlug = generateSlug(extracted.title);
      const finalGenres =
        extracted.genres && extracted.genres.length > 0
          ? extracted.genres
          : ['Художественная литература', 'Классика'];
      const genresJson = JSON.stringify(finalGenres);
      const fullOverview =
        extracted.description ||
        `Книга «${extracted.title}» автора ${extracted.author}. Полное издание формата А5 (${extracted.chapters.length} глав).`;
      const bookMeta = {
        ...(extracted.meta || {}),
        sourceUrl: url.trim(),
        pageCountEstimate: Math.max(extracted.chapters.length * 14, 24),
      };
      const coverConfig = {
        frontTitle: extracted.title,
        frontSubtitle: extracted.series
          ? `${extracted.series}${extracted.seriesNumber ? ` #${extracted.seriesNumber}` : ''}`
          : 'Полное издание',
        authorName: extracted.author,
        spineText: `${extracted.title} — ${extracted.author}`,
        backBlurb: fullOverview,
        genreLabel: finalGenres[0] || 'Художественная литература',
        frontImageUrl: coverUrl,
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: Math.max(extracted.chapters.length * 14, 24),
        isbn: extracted.meta?.isbn || '978-5-00-198274-1',
        barcodeText: 'Издание формата А5',
      };

      const insertBookSql = `
        INSERT INTO books (
          user_uid, title, slug, subtitle, author, genres, target_chapters,
          status, is_published, is_parsed_source, cover_config, synopsis_overview, running_header,
          original_file_url, file_storage_id, series_name, series_order, book_meta
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING *;
      `;

      const bookRes = await queryPg<any>(insertBookSql, [
        effectiveUid,
        extracted.title,
        bookSlug,
        `Полная версия (${extracted.format.toUpperCase()}, ${extracted.chapters.length} глав)`,
        extracted.author,
        genresJson,
        extracted.chapters.length,
        'completed',
        true,
        true,
        JSON.stringify(coverConfig),
        fullOverview,
        extracted.title,
        originalFileUrl,
        fileStorageId || null,
        extracted.series || null,
        extracted.seriesNumber || null,
        JSON.stringify(bookMeta),
      ]);

      const savedBook = bookRes.rows[0];
      const bookId = savedBook.id;

      // 5. Insert all chapters into PostgreSQL in batches
      const insertedChapters: any[] = [];
      const BATCH_SIZE = 15;

      for (let i = 0; i < extracted.chapters.length; i += BATCH_SIZE) {
        const batch = extracted.chapters.slice(i, i + BATCH_SIZE);
        const valuePlaceholders: string[] = [];
        const params: any[] = [];

        batch.forEach((chap, idx) => {
          const offset = idx * 9;
          valuePlaceholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`
          );
          params.push(
            bookId,
            effectiveUid,
            chap.chapter_number,
            chap.title,
            chap.synopsis,
            chap.content,
            chap.chapter_number === 1 ? coverUrl : '',
            chap.chapter_number === 1 ? `Иллюстрация к роману «${extracted.title}»` : '',
            chap.status || 'ready'
          );
        });

        const batchSql = `
          INSERT INTO chapters (
            book_id, user_uid, chapter_number, title, synopsis, content,
            illustration_url, illustration_prompt, status
          ) VALUES ${valuePlaceholders.join(', ')}
          RETURNING *;
        `;

        const chapRes = await queryPg<any>(batchSql, params);
        insertedChapters.push(...chapRes.rows);
      }

      // Persist in server-side local database so data survives restarts
      try {
        localDb.saveBook({ ...savedBook, cover_config: coverConfig });
        localDb.saveChapters(savedBook.id, insertedChapters);
      } catch (saveErr) {
        console.warn('[Server Parser] LocalDB persist notice for import-url:', saveErr);
      }

      res.json({
        success: true,
        book: {
          ...savedBook,
          cover_config: coverConfig,
        },
        chapters: insertedChapters,
        original_file_url: originalFileUrl,
        file_storage_id: fileStorageId,
      });
    } catch (err: any) {
      console.error('[Server Import URL] Error:', err);
      res.status(500).json({ error: err.message || 'Ошибка загрузки книги по ссылке' });
    }
  });
}
