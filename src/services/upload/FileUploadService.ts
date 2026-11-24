import { FileRecord } from '../../types';

export { type FileRecord };

export const STORAGE_TGF_URL = 'https://file.pro-talk.ru/tgf';
export const DEFAULT_TOKEN = 'YGpaUXFjXl5tZ1h3GH0AG0cLDBsyTwwZBFYNIjU6LjwQeAlFIAYFNWYBNDVrNRQYaGtdWGtjUgVvAH9YAmk';

export interface FileMap {
  [key: string]: string;
}

export class FileUploadService {
  private token: string;

  constructor(token?: string) {
    const saved = localStorage.getItem('protalk_upload_token');
    // Migrate old token if present in localStorage
    if (saved === 'b2VcU3NrVVttYlh3GHM_AEQ4eA8yDR4FGREODwsaLyUqQjpTEA8HGzMdFB8aORQYaG9dWGpkVQRvAXM') {
      localStorage.setItem('protalk_upload_token', DEFAULT_TOKEN);
      this.token = DEFAULT_TOKEN;
    } else {
      this.token = token || saved || DEFAULT_TOKEN;
    }
  }

  public setToken(token: string): void {
    this.token = token;
    localStorage.setItem('protalk_upload_token', token);
  }

  public getToken(): string {
    return this.token;
  }

  /**
   * Загрузка файла в ProTalk Storage (https://file.pro-talk.ru/tgf)
   * Возвращает прямую ссылку https://file.pro-talk.ru/tgf/...
   */
  async uploadFromFile(
    file: File,
    preserveAlpha = true,
    metadata?: { title?: string; author?: string; description?: string; caption?: string; folderId?: number | null }
  ): Promise<string> {
    // 1. Try server endpoint /api/upload which properly formats RFC 5987 UTF-8 filename, X-Upload-Token, and Telegram caption
    try {
      const serverFormData = new FormData();
      serverFormData.append('file', file, file.name);
      serverFormData.append('upload_token', this.token);
      if (metadata?.folderId) serverFormData.append('folder_id', String(metadata.folderId));
      if (metadata?.title) serverFormData.append('title', metadata.title);
      if (metadata?.author) serverFormData.append('author', metadata.author);
      if (metadata?.description) serverFormData.append('description', metadata.description);
      if (metadata?.caption) serverFormData.append('caption', metadata.caption);

      const serverRes = await fetch('/api/upload', {
        method: 'POST',
        body: serverFormData,
      });

      if (serverRes.ok) {
        const data = await serverRes.json();
        const first = data.files?.[0] || data;
        const resolved = first?.original_url || first?.url || first?.file_url;
        if (resolved) return resolved;
      }
    } catch {
      // fallback to direct storage upload
    }

    // 2. Direct upload fallback with caption & filename
    const formData = new FormData();
    const caption = metadata?.caption || (
      metadata?.title || metadata?.author
        ? `📖 Книга: ${metadata.title || 'Без названия'}\n✍️ Автор: ${metadata.author || 'Не указан'}${metadata.description ? `\n📝 ${metadata.description.slice(0, 200)}...` : ''}\n📁 Файл: ${file.name}`
        : `📁 Файл: ${file.name}`
    );
    formData.append('caption', caption);
    formData.append('file', file, file.name);

    const headers: Record<string, string> = {
      'X-Upload-Token': this.token,
      'X-Preserve-Alpha': preserveAlpha ? 'true' : 'false',
    };

    const response = await fetch(STORAGE_TGF_URL, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Ошибка загрузки файла в хранилище [${response.status}]: ${errText}`);
    }

    const data = await response.json();
    const resolvedUrl = data.url || data.file_url || data.link;
    if (!resolvedUrl) {
      throw new Error('Хранилище не вернуло URL файла');
    }
    return resolvedUrl;
  }

  /**
   * Загрузка одного файла с автоматической регистрацией в базе галереи
   */
  async uploadFileAndRegister(
    file: File,
    folderId?: number | null,
    preserveAlpha = true,
    metadata?: { title?: string; author?: string; description?: string; caption?: string }
  ): Promise<FileRecord> {
    const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
    const originalUrl = await this.uploadFromFile(file, preserveAlpha || isPng, {
      ...metadata,
      folderId,
    });

    const res = await fetch('/api/admin/files/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: file.name,
        original_url: originalUrl,
        mime_type: file.type || (isPng ? 'image/png' : 'image/jpeg'),
        file_size: file.size,
        folder_id: folderId || null,
        upload_to_telegram: false,
      }),
    });

    if (!res.ok) {
      throw new Error('Ошибка регистрации файла в галерее');
    }

    return await res.json();
  }

  /**
   * Массовая загрузка файлов с регистрацией в локальной базе галереи
   */
  async uploadBatch(
    files: File[],
    folderId?: number | null,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<FileRecord[]> {
    const results: FileRecord[] = [];
    let completed = 0;

    for (const file of files) {
      const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
      const originalUrl = await this.uploadFromFile(file, true, { folderId });

      const res = await fetch('/api/admin/files/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          original_url: originalUrl,
          mime_type: file.type || (isPng ? 'image/png' : 'image/jpeg'),
          file_size: file.size,
          folder_id: folderId || null,
          upload_to_telegram: false,
        }),
      });

      if (!res.ok) {
        throw new Error('Ошибка регистрации файла в галерее');
      }

      const registered = await res.json();
      results.push(registered);

      completed++;
      if (onProgress) onProgress(completed, files.length);
    }

    return results;
  }

  /**
   * Загрузка по внешнему URL через серверный шлюз Telegram (X-Upload-Token)
   */
  async uploadFromUrl(url: string, name?: string, folderId?: number | null): Promise<FileRecord> {
    const res = await fetch('/api/admin/files/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name || 'Загружено по ссылке',
        original_url: url,
        mime_type: 'image/jpeg',
        file_size: 0,
        folder_id: folderId || null,
        upload_to_telegram: true,
        upload_token: this.token,
      }),
    });

    if (!res.ok) {
      throw new Error('Ошибка загрузки по URL и регистрации в галерее');
    }

    return await res.json();
  }

  /**
   * Загрузка из Blob
   */
  async uploadFromBlob(blob: Blob, filename: string, folderId?: number | null): Promise<FileRecord> {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    return this.uploadFileAndRegister(file, folderId, true);
  }

  /**
   * Загрузка из base64 строки
   */
  async uploadFromBase64(base64: string, filename: string, folderId?: number | null): Promise<FileRecord> {
    const res = await fetch(base64);
    const blob = await res.blob();
    return this.uploadFromBlob(blob, filename, folderId);
  }

  // Key replacement utilities
  replaceKeysWithUrls(text: string, map: FileMap): string {
    let result = text;
    for (const [key, url] of Object.entries(map)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), url);
    }
    return result;
  }

  replaceUrlsWithKeys(text: string, map: FileMap): string {
    let result = text;
    for (const [key, url] of Object.entries(map)) {
      result = result.replace(new RegExp(url, 'g'), `{{${key}}}`);
    }
    return result;
  }
}

let uploadService: FileUploadService | null = null;

export function getUploadService(): FileUploadService {
  if (!uploadService) {
    uploadService = new FileUploadService();
  }
  return uploadService;
}
