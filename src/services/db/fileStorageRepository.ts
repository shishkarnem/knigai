import { executePgQuery } from './pgProxy';
import { FileRecord, FileFolder, Book, Chapter } from '../../types';

export function generateFileKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export async function fetchFiles(
  folderId?: number | null,
  search?: string,
  userUid?: number,
  isAllAllowed = true
): Promise<FileRecord[]> {
  try {
    let sql = 'SELECT id, user_uid, file_key, COALESCE(name, filename, \'file\') as name, COALESCE(original_url, url, \'\') as original_url, mime_type, COALESCE(file_size, size_bytes, 0) as file_size, folder_id, created_at FROM file_storage';
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (userUid && !isAllAllowed) {
      params.push(userUid);
      conditions.push(`(user_uid = $${params.length} OR user_uid IS NULL OR user_uid = 10000000001)`);
    }

    if (folderId === null) {
      conditions.push('folder_id IS NULL');
    } else if (folderId !== undefined) {
      params.push(folderId);
      conditions.push(`folder_id = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(name ILIKE $${params.length} OR filename ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY id DESC LIMIT 300;';

    const res = await executePgQuery<FileRecord>(sql, params);
    return res.rows.map((f) => {
      let cleanUrl = f.original_url || '';
      if (cleanUrl.startsWith('{') && cleanUrl.includes('"url"')) {
        try {
          const parsed = JSON.parse(cleanUrl);
          cleanUrl = parsed.url || cleanUrl;
        } catch {
          // ignore
        }
      }
      return {
        ...f,
        original_url: cleanUrl,
        short_url: `${window.location.origin}/file/${f.id}`,
      };
    });
  } catch (err) {
    console.warn('Failed to fetch files from DB:', err);
    return [];
  }
}

export function formatFileWeight(bytes?: number | null): string {
  const safe = Number(bytes || 0);
  if (safe <= 0) return '0 Б';
  if (safe < 1024) return `${safe} Б`;
  if (safe < 1024 * 1024) return `${Math.max(1, Math.round(safe / 1024))} КБ`;
  return `${(safe / (1024 * 1024)).toFixed(2)} МБ`;
}

export async function recalculateMissingFileSizes(): Promise<number> {
  try {
    const res = await fetch('/api/admin/files/recalculate-sizes', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      return Number(data?.updatedCount || 0);
    }
  } catch (err) {
    console.warn('Recalculate file sizes error:', err);
  }
  return 0;
}

export async function registerFileInDb(file: {
  name: string;
  original_url: string;
  mime_type?: string;
  file_size?: number;
  folder_id?: number | null;
  file_key?: string;
  user_uid?: number;
  upload_to_telegram?: boolean;
  caption?: string;
}): Promise<FileRecord> {
  const key = file.file_key || generateFileKey();
  const mime = file.mime_type || 'image/png';
  const size = file.file_size || 0;
  const folder = file.folder_id || null;
  const assignedUid = file.user_uid || null;
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const storedToken =
    typeof localStorage !== 'undefined' ? localStorage.getItem('protalk_upload_token') || undefined : undefined;

  // Prefer server endpoint so generated/remote files are uploaded to Telegram Storage via token and weights are measured cleanly
  if (typeof fetch !== 'undefined') {
    try {
      const srvRes = await fetch('/api/admin/files/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          original_url: file.original_url,
          mime_type: mime,
          file_size: size,
          folder_id: folder,
          user_uid: assignedUid,
          upload_to_telegram: file.upload_to_telegram ?? true,
          upload_token: storedToken,
          caption: file.caption,
        }),
      });
      if (srvRes.ok) {
        const row = await srvRes.json();
        if (row && row.id) {
          return {
            id: Number(row.id),
            user_uid: row.user_uid ?? assignedUid ?? undefined,
            file_key: row.file_key || key,
            name: row.name || file.name,
            original_url: row.original_url || file.original_url,
            short_url: origin ? `${origin}/file/${row.id}` : `/file/${row.id}`,
            mime_type: row.mime_type || mime,
            file_size: Number(row.file_size || row.size_bytes || size || 0),
            folder_id: row.folder_id ?? folder,
            created_at: row.created_at || new Date().toISOString(),
          };
        }
      }
    } catch (srvErr) {
      console.warn('Server file register fallback to direct DB:', srvErr);
    }
  }

  try {
    const res = await executePgQuery<{ id: number }>(
      `INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
       VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7) RETURNING id;`,
      [assignedUid, key, file.name, file.original_url, mime, size, folder]
    );

    const newId = res.rows[0]?.id || Date.now();
    return {
      id: newId,
      user_uid: assignedUid || undefined,
      file_key: key,
      name: file.name,
      original_url: file.original_url,
      short_url: origin ? `${origin}/file/${newId}` : `/file/${newId}`,
      mime_type: mime,
      file_size: size,
      folder_id: folder,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('DB register file error:', err);
    const fallbackId = Date.now();
    return {
      id: fallbackId,
      user_uid: assignedUid || undefined,
      file_key: key,
      name: file.name,
      original_url: file.original_url,
      short_url: file.original_url,
      mime_type: mime,
      file_size: size,
      folder_id: folder,
      created_at: new Date().toISOString(),
    };
  }
}

export async function moveFileInDb(id: number, folderId: number | null): Promise<boolean> {
  try {
    await executePgQuery('UPDATE file_storage SET folder_id = $1 WHERE id = $2;', [folderId, id]);
    return true;
  } catch (e) {
    console.warn('Move file error:', e);
    return false;
  }
}

export async function batchMoveFilesInDb(ids: number[], folderId: number | null): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(', ');
    await executePgQuery(`UPDATE file_storage SET folder_id = $1 WHERE id IN (${placeholders});`, [folderId, ...ids]);
    return true;
  } catch (e) {
    console.warn('Batch move files error:', e);
    return false;
  }
}

export async function deleteFileFromDb(id: number): Promise<boolean> {
  try {
    await executePgQuery('DELETE FROM file_storage WHERE id = $1;', [id]);
    return true;
  } catch (e) {
    console.warn('Delete file error:', e);
    return false;
  }
}

export async function batchDeleteFilesFromDb(ids: number[]): Promise<boolean> {
  if (!ids.length) return true;
  try {
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
    await executePgQuery(`DELETE FROM file_storage WHERE id IN (${placeholders});`, ids);
    return true;
  } catch (e) {
    console.warn('Batch delete files error:', e);
    return false;
  }
}

export async function fetchFolders(userUid?: number, isAllAllowed = false): Promise<FileFolder[]> {
  if (!userUid && !isAllAllowed) return [];
  try {
    let sql = 'SELECT id, user_uid, name, color, created_at FROM file_folders';
    const params: (string | number)[] = [];
    if (userUid) {
      sql += ' WHERE user_uid = $1';
      params.push(userUid);
    }
    sql += ' ORDER BY name ASC;';
    const res = await executePgQuery<FileFolder>(sql, params);
    return res.rows || [];
  } catch (err) {
    console.warn('Failed to fetch folders:', err);
    return [];
  }
}

export async function createFolderInDb(name: string, color = '#ffffff', userUid?: number): Promise<FileFolder> {
  const assignedUid = userUid || null;
  try {
    const res = await executePgQuery<{ id: number }>(
      'INSERT INTO file_folders (user_uid, name, color) VALUES ($1, $2, $3) RETURNING id;',
      [assignedUid, name, color]
    );
    const newId = res.rows[0]?.id || Date.now();
    return {
      id: newId,
      user_uid: assignedUid || undefined,
      name,
      color,
      created_at: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('Create folder error:', err);
    return {
      id: Date.now(),
      user_uid: assignedUid || undefined,
      name,
      color,
      created_at: new Date().toISOString(),
    };
  }
}

export async function deleteFolderInDb(id: number): Promise<boolean> {
  try {
    await executePgQuery('DELETE FROM file_folders WHERE id = $1;', [id]);
    return true;
  } catch (err) {
    console.warn('Delete folder error:', err);
    return false;
  }
}

export async function getOrCreateBookFolder(
  bookId: number,
  bookTitle: string,
  userUid?: number
): Promise<FileFolder> {
  const folderName = `Книга: «${bookTitle}»`;
  const assignedUid = userUid || null;
  try {
    const existing = await executePgQuery<FileFolder>(
      'SELECT id, user_uid, name, color, created_at FROM file_folders WHERE (user_uid = $1 OR user_uid IS NULL) AND name = $2 LIMIT 1;',
      [assignedUid, folderName]
    );
    if (existing.rows && existing.rows.length > 0) {
      return existing.rows[0];
    }
    return await createFolderInDb(folderName, '#ef4444', userUid);
  } catch (err) {
    console.warn('Failed to get/create book folder, falling back to virtual folder:', err);
    return {
      id: bookId + 100000,
      name: folderName,
      color: '#ef4444',
      user_uid: userUid,
      created_at: new Date().toISOString(),
    };
  }
}

/**
 * Automatically creates a dedicated folder for the book and syncs
 * any extracted chapter illustrations or covers into file_storage gallery.
 */
export async function syncBookAssetsToGalleryAndFolder(
  book: Book,
  chapters: Chapter[],
  userUid?: number
): Promise<{ updatedBook: Book; updatedChapters: Chapter[] }> {
  try {
    const bookFolder = await getOrCreateBookFolder(book.id, book.title, userUid);
    const folderId = bookFolder.id;

    // 1. If book has a primary uploaded file, assign it to this folder
    if (book.file_storage_id) {
      await moveFileInDb(book.file_storage_id, folderId);
    }

    let updatedBook: Book = { ...book };

    // 2. If cover has an inline data: URL image, register it in gallery
    if (book.cover_config?.frontImageUrl && book.cover_config.frontImageUrl.startsWith('data:')) {
      const coverRecord = await registerFileInDb({
        name: `Обложка — «${book.title}»`,
        original_url: book.cover_config.frontImageUrl,
        mime_type: book.cover_config.frontImageUrl.includes('png') ? 'image/png' : 'image/jpeg',
        file_size: Math.round(book.cover_config.frontImageUrl.length * 0.75),
        folder_id: folderId,
        user_uid: userUid,
      });
      const persistentUrl = coverRecord.original_url || coverRecord.short_url || `/file/${coverRecord.id}`;
      updatedBook = {
        ...updatedBook,
        cover_config: {
          ...updatedBook.cover_config,
          frontImageUrl: persistentUrl,
        },
      };
      try {
        await executePgQuery('UPDATE books SET cover_config = $1 WHERE id = $2;', [
          JSON.stringify(updatedBook.cover_config),
          book.id,
        ]);
      } catch (e) {
        console.warn('Update book cover error in DB:', e);
      }
    }

    // 3. For each chapter, register illustrations to gallery if they have inline data: URLs
    const updatedChapters: Chapter[] = [];
    for (const chap of chapters) {
      if (chap.illustration_url && chap.illustration_url.startsWith('data:')) {
        const fileRecord = await registerFileInDb({
          name: `Глава ${chap.chapter_number} — «${chap.title || book.title}»`,
          original_url: chap.illustration_url,
          mime_type: chap.illustration_url.includes('png') ? 'image/png' : 'image/jpeg',
          file_size: Math.round(chap.illustration_url.length * 0.75),
          folder_id: folderId,
          user_uid: userUid,
        });
        const persistentUrl = fileRecord.original_url || fileRecord.short_url || `/file/${fileRecord.id}`;
        const updatedChap: Chapter = {
          ...chap,
          illustration_url: persistentUrl,
        };
        try {
          await executePgQuery('UPDATE chapters SET illustration_url = $1 WHERE id = $2;', [
            persistentUrl,
            chap.id,
          ]);
        } catch (e) {
          console.warn('Update chapter illustration error in DB:', e);
        }
        updatedChapters.push(updatedChap);
      } else {
        updatedChapters.push(chap);
      }
    }

    return { updatedBook, updatedChapters };
  } catch (err) {
    console.warn('syncBookAssetsToGalleryAndFolder error:', err);
    return { updatedBook: book, updatedChapters: chapters };
  }
}


