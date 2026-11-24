import { XMLParser } from 'fast-xml-parser';
import { QueryPgFn } from '../backup/backupTypes';
import {
  KNIGAI_DEFAULT_COVER_URL,
  ensureBlogSchema,
  ensureUniqueSlug,
  replaceSavDefaultCoverText,
} from './blogSchema';

export const SAV_RSS_DOMAINS = [
  'https://savbot.ru',
  'https://sav-ai.ru',
  'https://aisav.ru',
  'https://ai-greenland.ru',
  'https://aisav.online',
];

const SYNC_STATUS_CONFIG_KEY = 'sav_rss_last_sync';
const SYNC_INTERVAL_MS = 10 * 60 * 1000;
const INITIAL_DELAY_MS = 10 * 1000;
const PER_ATTEMPT_TIMEOUT_MS = 15000;

export interface SavRssSyncResult {
  success: boolean;
  sourceDomain: string;
  sourceUrl: string;
  totalInFeed: number;
  added: number;
  updated: number;
  skipped: number;
  errors: string[];
  syncedAt: string;
  error?: string;
}

interface ParsedMediaItem {
  type: 'photo' | 'video';
  url?: string;
  posterUrl?: string;
  postUrl?: string;
  tooLarge?: boolean;
  sizeMb?: number;
  width?: number;
  height?: number;
  duration?: number;
  caption?: string;
}

interface ParsedButtonItem {
  text: string;
  url: string;
  isTelegramFallback?: boolean;
}

let activeSyncPromise: Promise<SavRssSyncResult> | null = null;
let schedulerStarted = false;

export function sanitizeExternalUrl(raw: unknown, allowRelative = true): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(javascript|data|vbscript):/i.test(value)) return '';
  if (allowRelative && value.startsWith('/')) return value;
  if (/^(https?:|mailto:|tel:|tg:)/i.test(value)) return value;
  return '';
}

function isVideoExtension(url: string): boolean {
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function unwrapXmlValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    return String(val);
  }
  if (Array.isArray(val)) {
    return val.map(unwrapXmlValue).find((s) => s.trim().length > 0) || '';
  }
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (obj.__cdata !== undefined) return unwrapXmlValue(obj.__cdata);
    if (obj['#text'] !== undefined) return unwrapXmlValue(obj['#text']);
    if (obj['@_url'] !== undefined) return unwrapXmlValue(obj['@_url']);
  }
  return '';
}

function getPrefixedField(item: Record<string, unknown>, localName: string): unknown {
  const direct = item[`sav:${localName}`];
  if (direct !== undefined) return direct;
  const suffix = `:${localName.toLowerCase()}`;
  for (const key of Object.keys(item)) {
    if (key.toLowerCase().endsWith(suffix)) {
      return item[key];
    }
  }
  return undefined;
}

function stripHtmlTags(rawHtml: string): string {
  return String(rawHtml || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseIsoDateSafe(raw: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return new Date().toISOString();
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function parseMediaJsonArray(raw: string): ParsedMediaItem[] {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    const out: ParsedMediaItem[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== 'object') continue;
      const obj = entry as Record<string, unknown>;
      const type = obj.type === 'video' ? 'video' : 'photo';
      const tooLarge = Boolean(obj.tooLarge);
      const url = tooLarge ? '' : replaceSavDefaultCoverText(sanitizeExternalUrl(obj.url, true));
      const posterUrl = tooLarge
        ? replaceSavDefaultCoverText(sanitizeExternalUrl(obj.posterUrl, true))
        : '';
      const postUrl = sanitizeExternalUrl(obj.postUrl, false);
      out.push({
        type,
        url: url || undefined,
        posterUrl: posterUrl || undefined,
        postUrl: postUrl || undefined,
        tooLarge,
        sizeMb: typeof obj.sizeMb === 'number' ? obj.sizeMb : undefined,
        width: typeof obj.width === 'number' ? obj.width : undefined,
        height: typeof obj.height === 'number' ? obj.height : undefined,
        duration: typeof obj.duration === 'number' ? obj.duration : undefined,
        caption: typeof obj.caption === 'string' ? obj.caption : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function parseButtonsJsonArray(raw: string): ParsedButtonItem[][] {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    const rows: ParsedButtonItem[][] = [];
    for (const row of parsed) {
      if (!Array.isArray(row)) continue;
      const cleanRow: ParsedButtonItem[] = [];
      for (const btn of row) {
        if (!btn || typeof btn !== 'object') continue;
        const b = btn as Record<string, unknown>;
        const text = String(b.text || '').trim();
        const url = sanitizeExternalUrl(b.url, true);
        if (text && url) {
          cleanRow.push({
            text,
            url,
            isTelegramFallback: Boolean(b.isTelegramFallback),
          });
        }
      }
      if (cleanRow.length > 0) rows.push(cleanRow);
    }
    return rows;
  } catch {
    return [];
  }
}

async function fetchRssXmlWithFailover(options?: {
  limit?: number;
  category?: string;
}): Promise<{ xml: string; domain: string; url: string }> {
  const limit = Math.min(200, Math.max(1, Number(options?.limit || 100)));
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (options?.category && options.category.trim()) {
    qs.set('category', options.category.trim());
  }
  const querySuffix = `?${qs.toString()}`;
  const attemptErrors: string[] = [];

  for (const domain of SAV_RSS_DOMAINS) {
    for (const feedPath of ['/rss.xml', '/feed.xml']) {
      const targetUrl = `${domain}${feedPath}${querySuffix}`;
      try {
        const res = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
            'Cache-Control': 'no-cache',
            'User-Agent': 'KnigAI-Blog-RSS-Sync/1.0',
          },
          signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
        });
        if (!res.ok || res.status >= 500) {
          attemptErrors.push(`${targetUrl} -> HTTP ${res.status}`);
          continue;
        }
        const xmlText = await res.text();
        if (!xmlText || !xmlText.includes('<rss')) {
          attemptErrors.push(`${targetUrl} -> не содержит <rss>`);
          continue;
        }
        return { xml: xmlText, domain, url: targetUrl };
      } catch (err) {
        attemptErrors.push(`${targetUrl} -> ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  throw new Error(`Все 5 доменов SAV AI недоступны: ${attemptErrors.slice(0, 4).join('; ')}`);
}

async function persistSyncStatus(queryPg: QueryPgFn, status: SavRssSyncResult): Promise<void> {
  try {
    await queryPg(
      `CREATE TABLE IF NOT EXISTS blog_rss_sync_state (
        id TEXT PRIMARY KEY,
        status_json TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );`
    );
    await queryPg(
      `INSERT INTO blog_rss_sync_state (id, status_json, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET status_json = EXCLUDED.status_json, updated_at = now();`,
      [SYNC_STATUS_CONFIG_KEY, JSON.stringify(status)]
    );
  } catch (err) {
    console.warn('[KnigAI RSS Sync] Persist status notice:', err);
  }
}

export async function getLastRssSyncStatus(queryPg: QueryPgFn): Promise<SavRssSyncResult | null> {
  try {
    await queryPg(
      `CREATE TABLE IF NOT EXISTS blog_rss_sync_state (
        id TEXT PRIMARY KEY,
        status_json TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT now()
      );`
    );
    const res = await queryPg<{ status_json: string }>(
      `SELECT status_json FROM blog_rss_sync_state WHERE id = $1 LIMIT 1;`,
      [SYNC_STATUS_CONFIG_KEY]
    );
    const raw = res.rows?.[0]?.status_json;
    if (!raw) return null;
    return JSON.parse(raw) as SavRssSyncResult;
  } catch {
    return null;
  }
}

async function runSyncSavRssFeedInternal(
  queryPg: QueryPgFn,
  options?: { limit?: number; category?: string }
): Promise<SavRssSyncResult> {
  await ensureBlogSchema(queryPg);
  const syncedAt = new Date().toISOString();

  let fetched: { xml: string; domain: string; url: string };
  try {
    fetched = await fetchRssXmlWithFailover(options);
  } catch (err) {
    const failStatus: SavRssSyncResult = {
      success: false,
      sourceDomain: '',
      sourceUrl: '',
      totalInFeed: 0,
      added: 0,
      updated: 0,
      skipped: 0,
      errors: [err instanceof Error ? err.message : String(err)],
      syncedAt,
      error: err instanceof Error ? err.message : String(err),
    };
    await persistSyncStatus(queryPg, failStatus);
    return failStatus;
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    cdataPropName: '__cdata',
    parseTagValue: false,
    trimValues: false,
  });

  const parsedXml = parser.parse(fetched.xml) as Record<string, any>;
  const channel = parsedXml?.rss?.channel;
  const rawItems = channel?.item;
  const items: Record<string, any>[] = Array.isArray(rawItems)
    ? rawItems
    : rawItems
    ? [rawItems]
    : [];

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const item of items) {
    try {
      const savId = unwrapXmlValue(getPrefixedField(item, 'id')).trim();
      const guidVal = unwrapXmlValue(item.guid).trim();
      const linkVal = sanitizeExternalUrl(unwrapXmlValue(item.link), false);
      const externalId = savId || guidVal || linkVal;
      if (!externalId) {
        skipped++;
        continue;
      }

      const incomingUpdatedAt =
        unwrapXmlValue(getPrefixedField(item, 'updatedAt')).trim() ||
        unwrapXmlValue(item['atom:updated']).trim() ||
        unwrapXmlValue(getPrefixedField(item, 'publishedAt')).trim() ||
        unwrapXmlValue(item.pubDate).trim();

      const existingRes = await queryPg<{ id: number; slug: string; external_updated_at: string | null }>(
        `SELECT id, slug, external_updated_at FROM blog_posts WHERE external_id = $1 LIMIT 1;`,
        [externalId]
      );
      const existing = existingRes.rows?.[0];

      if (existing && incomingUpdatedAt && existing.external_updated_at === incomingUpdatedAt) {
        skipped++;
        continue;
      }

      const rawTitle = unwrapXmlValue(item.title).replace(/\s+/g, ' ').trim();
      if (!rawTitle) {
        skipped++;
        continue;
      }

      const rawSavSlug = unwrapXmlValue(getPrefixedField(item, 'slug')).trim();
      const category = unwrapXmlValue(getPrefixedField(item, 'category')).trim() || unwrapXmlValue(item.category).trim();
      const tags = category ? [category] : ['ИИ-технологии'];

      const authorName =
        unwrapXmlValue(getPrefixedField(item, 'authorName')).trim() ||
        unwrapXmlValue(item['dc:creator']).trim() ||
        unwrapXmlValue(item.author).trim() ||
        'SAV AI';
      const authorRole = unwrapXmlValue(getPrefixedField(item, 'authorRole')).trim();
      const readTimeMinutes =
        parseInt(unwrapXmlValue(getPrefixedField(item, 'readTimeMinutes')).trim(), 10) || 0;

      const seoTitle = unwrapXmlValue(getPrefixedField(item, 'seoTitle')).trim() || rawTitle;
      const seoDescription = unwrapXmlValue(getPrefixedField(item, 'seoDescription')).trim();
      const seoKeywords = unwrapXmlValue(getPrefixedField(item, 'seoKeywords')).trim() || category;

      const descriptionText = stripHtmlTags(unwrapXmlValue(item.description));
      const excerpt = (seoDescription || descriptionText || rawTitle).slice(0, 320);

      const telegramPostUrl = sanitizeExternalUrl(unwrapXmlValue(getPrefixedField(item, 'telegramPostUrl')), false);
      const telegramChannel = unwrapXmlValue(getPrefixedField(item, 'telegramChannel')).trim();

      const mediaItems = parseMediaJsonArray(unwrapXmlValue(getPrefixedField(item, 'mediaJson')));
      const buttonsRows = parseButtonsJsonArray(unwrapXmlValue(getPrefixedField(item, 'buttonsJson')));

      // Cover Video: sav:coverVideo || enclosure video || first playable non-tooLarge video from mediaJson
      let coverVideoUrl = sanitizeExternalUrl(unwrapXmlValue(getPrefixedField(item, 'coverVideo')), true);
      if (!coverVideoUrl && item.enclosure) {
        const enc = Array.isArray(item.enclosure) ? item.enclosure[0] : item.enclosure;
        const encType = String(enc?.['@_type'] || '').toLowerCase();
        if (encType.startsWith('video/')) {
          coverVideoUrl = sanitizeExternalUrl(enc?.['@_url'], true);
        }
      }
      if (!coverVideoUrl) {
        const firstVideo = mediaItems.find((m) => m.type === 'video' && !m.tooLarge && m.url);
        if (firstVideo?.url) coverVideoUrl = firstVideo.url;
      }

      // Cover Image: MUST ALWAYS be an image URL, never .mp4/video
      const enclosureArr = Array.isArray(item.enclosure)
        ? item.enclosure
        : item.enclosure
        ? [item.enclosure]
        : [];
      const mediaContentArr = Array.isArray(item['media:content'])
        ? item['media:content']
        : item['media:content']
        ? [item['media:content']]
        : [];
      const imageCandidates = [
        unwrapXmlValue(getPrefixedField(item, 'coverImage')),
        item['media:thumbnail']?.['@_url'],
        enclosureArr.find((e: any) => String(e?.['@_type'] || '').toLowerCase().startsWith('image/'))?.['@_url'],
        mediaContentArr.find((m: any) => String(m?.['@_medium'] || '').toLowerCase() === 'image')?.['@_url'],
        mediaItems.find((m) => m.type === 'photo' && m.url)?.url,
      ];
      let coverImageUrl = '';
      for (const candidate of imageCandidates) {
        const safe = replaceSavDefaultCoverText(sanitizeExternalUrl(candidate, true));
        if (safe && !isVideoExtension(safe)) {
          coverImageUrl = safe;
          break;
        }
      }
      if (!coverImageUrl) {
        coverImageUrl = KNIGAI_DEFAULT_COVER_URL;
      }

      // Full Markdown from sav:contentMarkdown (preferred) or content:encoded fallback
      let contentMarkdown = replaceSavDefaultCoverText(
        unwrapXmlValue(getPrefixedField(item, 'contentMarkdown')).trim()
      );
      if (!contentMarkdown) {
        const encodedHtml = unwrapXmlValue(item['content:encoded']);
        contentMarkdown = replaceSavDefaultCoverText(stripHtmlTags(encodedHtml) || descriptionText || rawTitle);
      }

      const publishedAtIso = parseIsoDateSafe(
        unwrapXmlValue(getPrefixedField(item, 'publishedAt')).trim() || unwrapXmlValue(item.pubDate).trim()
      );

      if (existing) {
        const uniqueSlug = await ensureUniqueSlug(queryPg, rawSavSlug || existing.slug || rawTitle, existing.id);

        // Guard unique title constraint if another distinct row shares the exact same title
        let safeTitle = rawTitle;
        const dupTitle = await queryPg<{ id: number }>(
          `SELECT id FROM blog_posts WHERE LOWER(title) = LOWER($1) AND id <> $2 LIMIT 1;`,
          [safeTitle, existing.id]
        );
        if (dupTitle.rows && dupTitle.rows.length > 0) {
          safeTitle = `${rawTitle} · ${externalId.slice(-5)}`;
        }

        await queryPg(
          `UPDATE blog_posts
           SET slug = $1,
               title = $2,
               subtitle = $3,
               excerpt = $4,
               content_markdown = $5,
               cover_image_url = $6,
               cover_video_url = $7,
               tags = $8::jsonb,
               seo_keywords = $9,
               seo_title = $10,
               seo_description = $11,
               author_name = $12,
               author_role = $13,
               read_time_minutes = $14,
               external_updated_at = $15,
               source_url = $16,
               telegram_post_url = $17,
               telegram_channel = $18,
               media_json = $19,
               buttons_json = $20,
               status = 'published',
               updated_at = now()
           WHERE id = $21;`,
          [
            uniqueSlug,
            safeTitle,
            excerpt,
            excerpt,
            contentMarkdown,
            coverImageUrl,
            coverVideoUrl,
            JSON.stringify(tags),
            seoKeywords,
            seoTitle,
            seoDescription || excerpt,
            authorName,
            authorRole,
            readTimeMinutes,
            incomingUpdatedAt,
            linkVal,
            telegramPostUrl,
            telegramChannel,
            JSON.stringify(mediaItems),
            JSON.stringify(buttonsRows),
            existing.id,
          ]
        );
        updated++;
      } else {
        const uniqueSlug = await ensureUniqueSlug(queryPg, rawSavSlug || rawTitle);

        let safeTitle = rawTitle;
        const dupTitle = await queryPg<{ id: number }>(
          `SELECT id FROM blog_posts WHERE LOWER(title) = LOWER($1) LIMIT 1;`,
          [safeTitle]
        );
        if (dupTitle.rows && dupTitle.rows.length > 0) {
          safeTitle = `${rawTitle} · ${externalId.slice(-5)}`;
        }

        await queryPg(
          `INSERT INTO blog_posts (
             slug, title, subtitle, excerpt, content_markdown,
             cover_image_url, cover_video_url, tags,
             seo_keywords, seo_title, seo_description,
             author_name, author_role, author_uid, read_time_minutes,
             external_id, external_updated_at, source_url,
             telegram_post_url, telegram_channel, media_json, buttons_json,
             status, published_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5,
             $6, $7, $8::jsonb,
             $9, $10, $11,
             $12, $13, 10000000001, $14,
             $15, $16, $17,
             $18, $19, $20, $21,
             'published', $22::timestamptz, now()
           );`,
          [
            uniqueSlug,
            safeTitle,
            excerpt,
            excerpt,
            contentMarkdown,
            coverImageUrl,
            coverVideoUrl,
            JSON.stringify(tags),
            seoKeywords,
            seoTitle,
            seoDescription || excerpt,
            authorName,
            authorRole,
            readTimeMinutes,
            externalId,
            incomingUpdatedAt,
            linkVal,
            telegramPostUrl,
            telegramChannel,
            JSON.stringify(mediaItems),
            JSON.stringify(buttonsRows),
            publishedAtIso,
          ]
        );
        added++;
      }
    } catch (itemErr) {
      errors.push(itemErr instanceof Error ? itemErr.message : String(itemErr));
    }
  }

  const result: SavRssSyncResult = {
    success: true,
    sourceDomain: fetched.domain,
    sourceUrl: fetched.url,
    totalInFeed: items.length,
    added,
    updated,
    skipped,
    errors: errors.slice(0, 10),
    syncedAt,
  };
  await persistSyncStatus(queryPg, result);
  console.log(
    `[KnigAI RSS Sync] ${fetched.domain}: total=${items.length}, added=${added}, updated=${updated}, skipped=${skipped}`
  );
  return result;
}

export function syncSavRssFeed(
  queryPg: QueryPgFn,
  options?: { limit?: number; category?: string }
): Promise<SavRssSyncResult> {
  if (activeSyncPromise) return activeSyncPromise;
  activeSyncPromise = runSyncSavRssFeedInternal(queryPg, options).finally(() => {
    activeSyncPromise = null;
  });
  return activeSyncPromise;
}

export function startSavRssScheduler(queryPg: QueryPgFn): void {
  if (schedulerStarted) return;
  schedulerStarted = true;

  setTimeout(() => {
    syncSavRssFeed(queryPg, { limit: 100 }).catch((err) =>
      console.warn('[KnigAI RSS Sync] Initial boot sync notice:', err)
    );
  }, INITIAL_DELAY_MS);

  setInterval(() => {
    syncSavRssFeed(queryPg, { limit: 100 }).catch((err) =>
      console.warn('[KnigAI RSS Sync] Periodic sync notice:', err)
    );
  }, SYNC_INTERVAL_MS);
}
