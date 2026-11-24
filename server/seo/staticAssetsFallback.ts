import type { Express, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { EMAIL_BANNER_URL, EMAIL_LOGO_URL } from '../auth/passwordResetEmailTemplate';

interface RemoteAssetSpec {
  remoteUrl: string;
  mimeType: string;
}

const REMOTE_STATIC_ASSETS: Record<string, RemoteAssetSpec> = {
  '/apple-touch-icon.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETw4gKjwPDgdZMmI6eTZzEzJraBwzNzYHAD09NgssKwlkM3cYUj4zeRQhMgMPHQ1cNSQNBQJpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/pwa-192x192.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETwIgKjwPDDgZI2QWRmhdfih7OwULNT4qFydTFxssKwgZM3cYUj4zeRQjKn0jNTEwMgg7LjxpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/pwa-512x512.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETzwgKjwPAgIAHSs3czNyP1RhHSkuCCsIfy0AChssKwgzM3cYUj4zeRQhPyIKDgUvUw4TWhJpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/pwa-maskable-512x512.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETzAgKjwPACUcbzggBC8Mfj5zByQyDAMyARgwaBssKwgjM3cYUj4zeRQiH3E1PCAYLQEgOzxpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/yandex-tableau-50x50.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETzQgKjwPAB86KBtRexRdcQtaEgUdATYzBl8eAQssKwhkM3cYUj4zeRQiKA4ICmU7LghsKSxpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/yandex-tableau-120x120.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETyggKjwPODccPGssZWlQBzRFNSARPxcvZj8gGgssKwsZM3cYUj4zeRQiQSwuGTsDAD8yKzxpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/mstile-150x150.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETywgKjwPOSYCHhwaehFkHxFbNDshdDYJGRwsID0sKwszM3cYUj4zeRQiDwRPHTwSJ3cNVSxpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/mstile-310x310.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETyAgKjwPPhQtDysaTAhPFjhaaHkBAys8AgU3LRssKwsjM3cYUj4zeRQhFhwYHQNRUBQ2WAJpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/og-banner-1200x630.png': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoET2kgKjwPPQElIBUHcBgAGTdEEi01aBQBMTgCDwssKwtkM3cYUj4zeRQiIycAByBZI30wJixpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/favicon.ico': {
    remoteUrl:
      'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKlJzP2IIL1oQCjoETw4gKjwPDgdZMmI6eTZzEzJraBwzNzYHAD09NgssKwlkM3cYUj4zeRQhMgMPHQ1cNSQNBQJpFx5KYQ10VAZoeE9xT2ITKSwDIBgyHjAVAw1-KlN6KRMrMhQqHDgUIz1aDHQqE3lqUjodH2B7SXdLaGFeUXxjXVA.png',
    mimeType: 'image/png',
  },
  '/email/knigai-logo-email.png': {
    remoteUrl: EMAIL_LOGO_URL,
    mimeType: 'image/png',
  },
  '/email/noir-reset-banner.jpg': {
    remoteUrl: EMAIL_BANNER_URL,
    mimeType: 'image/jpeg',
  },
};

const FONT_FALLBACK_MAP: Record<string, { family: string; weight: string; italic: boolean }> = {
  '/fonts/PTSerif-Regular.ttf': { family: 'PT Serif', weight: '400', italic: false },
  '/fonts/PTSerif-Bold.ttf': { family: 'PT Serif', weight: '700', italic: false },
  '/fonts/PTSerif-Italic.ttf': { family: 'PT Serif', weight: '400', italic: true },
  '/fonts/PTSerif-BoldItalic.ttf': { family: 'PT Serif', weight: '700', italic: true },
  '/fonts/RubikMarkerHatch-Regular.ttf': { family: 'Rubik Marker Hatch', weight: '400', italic: false },
};

const binaryMemoryCache = new Map<string, Buffer>();

function hasValidBinaryHeader(buf: Buffer, expectedMime: string): boolean {
  if (!buf || buf.byteLength < 64) return false;
  if (expectedMime === 'image/png') {
    return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  }
  if (expectedMime === 'image/jpeg') {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  return true;
}

async function fetchRemoteBinaryAsset(assetPath: string, spec: RemoteAssetSpec): Promise<Buffer | null> {
  const cached = binaryMemoryCache.get(assetPath);
  if (cached) return cached;

  try {
    const upstream = await fetch(spec.remoteUrl, {
      headers: {
        'User-Agent': 'KnigAI-AssetProxy/1.0',
        Accept: `${spec.mimeType},image/*;q=0.8`,
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!upstream.ok) return null;
    const buf = Buffer.from(await upstream.arrayBuffer());
    if (!hasValidBinaryHeader(buf, spec.mimeType)) return null;
    binaryMemoryCache.set(assetPath, buf);
    return buf;
  } catch {
    return null;
  }
}

async function fetchGoogleFontTtf(fontPath: string): Promise<Buffer | null> {
  const cached = binaryMemoryCache.get(fontPath);
  if (cached) return cached;

  const spec = FONT_FALLBACK_MAP[fontPath];
  if (!spec) return null;

  try {
    const encodedFamily = encodeURIComponent(spec.family).replace(/%20/g, '+');
    const styleToken = spec.italic ? `${spec.weight}italic` : spec.weight;
    const cssUrl = `https://fonts.googleapis.com/css?family=${encodedFamily}:${styleToken}&subset=cyrillic`;
    const cssRes = await fetch(cssUrl, {
      headers: { 'User-Agent': 'Java/1.8.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!cssRes.ok) return null;
    const cssText = await cssRes.text();
    const ttfMatch = cssText.match(/url\((https:\/\/[^)]+\.ttf)\)/i);
    if (!ttfMatch?.[1]) return null;

    const fontRes = await fetch(ttfMatch[1], { signal: AbortSignal.timeout(15000) });
    if (!fontRes.ok) return null;
    const buf = Buffer.from(await fontRes.arrayBuffer());
    if (buf.byteLength < 8000) return null;
    binaryMemoryCache.set(fontPath, buf);
    return buf;
  } catch {
    return null;
  }
}

function findExistingDiskFile(distDir: string, publicDir: string, relPath: string): string | null {
  const trimmed = relPath.replace(/^\/+/, '');
  const distCandidate = path.resolve(distDir, trimmed);
  if (fs.existsSync(distCandidate) && fs.statSync(distCandidate).isFile()) {
    return distCandidate;
  }
  const publicCandidate = path.resolve(publicDir, trimmed);
  if (fs.existsSync(publicCandidate) && fs.statSync(publicCandidate).isFile()) {
    return publicCandidate;
  }
  return null;
}

export function registerStaticAssetsFallback(app: Express, distDir: string, publicDir: string): void {
  const serveImageAsset = async (assetKey: string, reqPath: string, res: Response) => {
    const spec = REMOTE_STATIC_ASSETS[assetKey];
    if (!spec) return res.status(404).type('text/plain').send('Asset not found');

    const diskKey = assetKey === '/favicon.ico' ? '/apple-touch-icon.png' : assetKey;
    const diskPath = findExistingDiskFile(distDir, publicDir, diskKey);
    if (diskPath) {
      res.setHeader('Content-Type', spec.mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.sendFile(diskPath);
    }

    const buf = await fetchRemoteBinaryAsset(diskKey, spec);
    if (!buf) {
      return res.status(502).type('text/plain').send(`Asset temporarily unavailable: ${reqPath}`);
    }

    res.setHeader('Content-Type', spec.mimeType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buf);
  };

  for (const assetPath of Object.keys(REMOTE_STATIC_ASSETS)) {
    app.get(assetPath, (req: Request, res: Response) => {
      void serveImageAsset(assetPath, req.path, res);
    });
  }

  // Guard against relative icon lookups on nested client routes (e.g. /profile/apple-touch-icon.png)
  app.get(
    /^\/(?:profile|system-admin|library|blog|oferta|privacy|agreement|consent|payment)\/(apple-touch-icon\.png|pwa-192x192\.png|pwa-512x512\.png|pwa-maskable-512x512\.png|yandex-tableau-50x50\.png|yandex-tableau-120x120\.png|mstile-150x150\.png|mstile-310x310\.png|og-banner-1200x630\.png|favicon\.ico)$/,
    (req: Request, res: Response) => {
      const basename = `/${path.posix.basename(req.path)}`;
      void serveImageAsset(basename, req.path, res);
    }
  );

  for (const fontPath of Object.keys(FONT_FALLBACK_MAP)) {
    app.get(fontPath, async (_req: Request, res: Response) => {
      const diskPath = findExistingDiskFile(distDir, publicDir, fontPath);
      if (diskPath) {
        res.setHeader('Content-Type', 'font/ttf');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.sendFile(diskPath);
      }

      const buf = await fetchGoogleFontTtf(fontPath);
      if (!buf) {
        return res.status(502).type('text/plain').send('Font temporarily unavailable');
      }

      res.setHeader('Content-Type', 'font/ttf');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.send(buf);
    });
  }

  // Warm manifest icons into RAM asynchronously if missing on disk in production
  const warmupAssets = [
    '/apple-touch-icon.png',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    '/pwa-maskable-512x512.png',
    '/yandex-tableau-120x120.png',
    '/yandex-tableau-50x50.png',
  ];
  setTimeout(() => {
    for (const key of warmupAssets) {
      if (!findExistingDiskFile(distDir, publicDir, key)) {
        void fetchRemoteBinaryAsset(key, REMOTE_STATIC_ASSETS[key]);
      }
    }
  }, 500);
}
