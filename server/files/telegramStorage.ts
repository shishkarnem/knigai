export const TELEGRAM_STORAGE_URL = 'https://file.pro-talk.ru/tgf';
export const DEFAULT_UPLOAD_TOKEN =
  process.env.PROTALK_UPLOAD_TOKEN ||
  'YGpaUXFjXl5tZ1h3GH0AG0cLDBsyTwwZBFYNIjU6LjwQeAlFIAYFNWYBNDVrNRQYaGtdWGtjUgVvAH9YAmk';

export interface TelegramUploadResult {
  url: string;
  size: number;
  mimeType: string;
}

function detectMimeFromBuffer(buf: Buffer, fallbackMime?: string, filename?: string): string {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'image/jpeg';
  }
  if (buf.length >= 4 && buf.slice(0, 4).toString('ascii') === '%PDF') {
    return 'application/pdf';
  }
  if (filename?.toLowerCase().endsWith('.png')) return 'image/png';
  if (filename?.toLowerCase().endsWith('.webp')) return 'image/webp';
  if (filename?.toLowerCase().endsWith('.pdf')) return 'application/pdf';
  if (filename?.toLowerCase().endsWith('.webm')) return 'audio/webm';
  return fallbackMime || 'image/jpeg';
}

export async function uploadBufferToTelegramStorage(params: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  caption?: string;
  preserveAlpha?: boolean;
  uploadToken?: string;
}): Promise<TelegramUploadResult> {
  const safeFilename = (params.filename || 'file.jpg').trim();
  const encodedFilename = encodeURIComponent(safeFilename);
  const mime = detectMimeFromBuffer(params.buffer, params.mimeType, safeFilename);
  const boundary = '----NodeFormBoundary' + Math.random().toString(36).substring(2) + Date.now().toString(36);
  const caption = (params.caption || `📁 Файл: ${safeFilename}`).trim();

  const parts: Buffer[] = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`
    ),
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}\r\nContent-Type: ${mime}\r\n\r\n`
    ),
    params.buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ];

  const body = Buffer.concat(parts);
  const token = (params.uploadToken || DEFAULT_UPLOAD_TOKEN).trim();

  const filestoreRes = await fetch(TELEGRAM_STORAGE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': String(body.length),
      'X-Upload-Token': token,
      'X-Preserve-Alpha': params.preserveAlpha !== false ? 'true' : 'false',
    },
    body,
    signal: AbortSignal.timeout(25000),
  });

  if (!filestoreRes.ok) {
    const errorText = await filestoreRes.text();
    throw new Error(`Telegram Storage error [${filestoreRes.status}]: ${errorText}`);
  }

  const rawText = (await filestoreRes.text()).trim();
  let finalUrl = rawText;
  try {
    const parsed = JSON.parse(rawText);
    if (parsed && typeof (parsed.url || parsed.file_url || parsed.link) === 'string') {
      finalUrl = parsed.url || parsed.file_url || parsed.link;
    }
  } catch {
    // plain text URL
  }

  if (!finalUrl || !/^https?:\/\//i.test(finalUrl)) {
    throw new Error(`Telegram Storage returned invalid URL: ${rawText}`);
  }

  return {
    url: finalUrl,
    size: params.buffer.byteLength,
    mimeType: mime,
  };
}

export async function mirrorUrlToTelegramStorage(params: {
  sourceUrl: string;
  filename: string;
  mimeType?: string;
  caption?: string;
  uploadToken?: string;
}): Promise<TelegramUploadResult> {
  const src = String(params.sourceUrl || '').trim();
  if (!src) {
    throw new Error('sourceUrl обязателен для загрузки в Telegram Storage');
  }

  let buffer: Buffer;
  let detectedMime = params.mimeType;

  if (src.startsWith('data:')) {
    const commaIdx = src.indexOf(',');
    const meta = commaIdx !== -1 ? src.slice(0, commaIdx) : '';
    const base64Data = commaIdx !== -1 ? src.slice(commaIdx + 1) : src;
    const m = meta.match(/data:([^;]+)/);
    if (m?.[1]) detectedMime = m[1];
    buffer = Buffer.from(base64Data, 'base64');
  } else {
    const downloadRes = await fetch(src, { signal: AbortSignal.timeout(20000) });
    if (!downloadRes.ok) {
      throw new Error(`Не удалось скачать файл (${downloadRes.status}) перед отправкой в Telegram`);
    }
    const headerMime = downloadRes.headers.get('content-type');
    if (headerMime) detectedMime = headerMime.split(';')[0].trim();
    const arrBuf = await downloadRes.arrayBuffer();
    buffer = Buffer.from(arrBuf);
  }

  return uploadBufferToTelegramStorage({
    buffer,
    filename: params.filename,
    mimeType: detectedMime,
    caption: params.caption || `🎨 Сгенерировано ИИ: ${params.filename}`,
    preserveAlpha: true,
    uploadToken: params.uploadToken,
  });
}
