import type { Express, Request, Response } from 'express';
import net from 'net';

const ALLOWED_FONT_FAMILIES = new Set([
  'PT Serif',
  'Merriweather',
  'EB Garamond',
  'Cormorant Garamond',
  'Literata',
  'Lora',
  'Spectral',
  'Roboto Slab',
  'Courier Prime',
  'Inter',
  'Rubik Marker Hatch',
]);

const fontCache = new Map<string, Buffer>();

function isPrivateOrLocalHost(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase();
  if (!lower || lower === 'localhost' || lower.endsWith('.local') || lower.endsWith('.internal')) {
    return true;
  }
  const ipVersion = net.isIP(lower);
  if (ipVersion === 4) {
    const parts = lower.split('.').map((n) => parseInt(n, 10));
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  } else if (ipVersion === 6) {
    if (lower === '::1' || lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
  }
  return false;
}

export function registerExportRoutes(app: Express): void {
  // CORS-safe high-res image proxy for 300 DPI Canvas/PDF prepress rendering
  app.get('/api/export/image-proxy', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      return res.status(400).json({ error: 'Параметр url обязателен' });
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return res.status(400).json({ error: 'Некорректный URL изображения' });
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return res.status(400).json({ error: 'Разрешены только HTTP/HTTPS URL' });
    }

    if (isPrivateOrLocalHost(parsed.hostname)) {
      return res.status(403).json({ error: 'Доступ к локальным адресам запрещен' });
    }

    try {
      const upstream = await fetch(parsed.toString(), {
        headers: {
          'User-Agent': 'KnigAI-PrintEngine/1.0',
          Accept: 'image/png,image/jpeg,image/webp,image/*;q=0.8',
        },
        signal: AbortSignal.timeout(20000),
      });

      if (!upstream.ok) {
        return res.status(upstream.status).json({ error: `Ошибка загрузки изображения: ${upstream.status}` });
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/') && !contentType.includes('octet-stream')) {
        return res.status(415).json({ error: 'Ответ сервера не является изображением' });
      }

      const arrayBuf = await upstream.arrayBuffer();
      if (arrayBuf.byteLength > 25 * 1024 * 1024) {
        return res.status(413).json({ error: 'Изображение превышает лимит 25 МБ' });
      }

      res.setHeader('Content-Type', contentType.startsWith('image/') ? contentType : 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.send(Buffer.from(arrayBuf));
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Ошибка проксирования изображения',
      });
    }
  });

  // Dynamic Cyrillic TTF font proxy from Google Fonts (with server cache)
  app.get('/api/export/font-ttf', async (req: Request, res: Response) => {
    const family = typeof req.query.family === 'string' ? req.query.family.trim() : '';
    const weight = typeof req.query.weight === 'string' ? req.query.weight.trim() : '400';
    const italic = String(req.query.italic || '0') === '1';

    if (!ALLOWED_FONT_FAMILIES.has(family)) {
      return res.status(400).json({ error: 'Шрифт не поддерживается' });
    }

    const safeWeight = weight === '700' ? '700' : '400';
    const cacheKey = `${family}:${safeWeight}:${italic ? 'italic' : 'normal'}`;
    const cached = fontCache.get(cacheKey);
    if (cached) {
      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(cached);
    }

    try {
      const encodedFamily = encodeURIComponent(family).replace(/%20/g, '+');
      const styleToken = italic ? `${safeWeight}italic` : safeWeight;
      const cssUrl = `https://fonts.googleapis.com/css?family=${encodedFamily}:${styleToken}&subset=cyrillic`;

      const cssRes = await fetch(cssUrl, {
        headers: { 'User-Agent': 'Java/1.8.0' },
        signal: AbortSignal.timeout(10000),
      });
      if (!cssRes.ok) {
        return res.status(502).json({ error: 'Не удалось получить CSS шрифта' });
      }
      const cssText = await cssRes.text();
      const ttfMatch = cssText.match(/url\((https:\/\/[^)]+\.ttf)\)/i);
      if (!ttfMatch?.[1]) {
        return res.status(404).json({ error: 'TTF файл не найден в ответе шрифтов' });
      }

      const fontRes = await fetch(ttfMatch[1], { signal: AbortSignal.timeout(15000) });
      if (!fontRes.ok) {
        return res.status(502).json({ error: 'Ошибка загрузки TTF шрифта' });
      }
      const fontBuffer = Buffer.from(await fontRes.arrayBuffer());
      fontCache.set(cacheKey, fontBuffer);

      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(fontBuffer);
    } catch (err: unknown) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Ошибка загрузки шрифта',
      });
    }
  });
}
