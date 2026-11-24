import type { Express, Request, Response } from 'express';
import { QueryPgFn } from '../backup/backupTypes';
import { mirrorUrlToTelegramStorage } from '../files/telegramStorage';
import {
  MAX_PINNED_BLOG_POSTS,
  ensureBlogFolderId,
  ensureBlogSchema,
  ensureUniqueSlug,
  setBlogPostPinned,
  transliterateToSlug,
} from './blogSchema';
import { getLastRssSyncStatus, syncSavRssFeed } from './savRssSync';

const PROTALK_FUNCTION_API_URL = 'https://api.pro-talk.ru/api/v1.0/run_function';
const PROTALK_BOT_ID = 74803;
const PROTALK_BOT_TOKEN = 'GNEMaM7RHVmkmnBtAucqZBILKkYl4PJM';
const PROTALK_FUNCTIONS_BASE_ID = 'appkq3HrzrxYxoAV8';
const PROTALK_IMAGE_FUNCTION_ID = 784;

function parseTags(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map((t) => String(t).trim()).filter(Boolean).slice(0, 12);
      } catch { /* fallback */ }
    }
    return trimmed.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12);
  }
  return [];
}

function isDatabaseImageUrl(url: string): boolean {
  const trimmed = String(url || '').trim();
  if (!trimmed) return true;
  if (/^\/file\/\d+/i.test(trimmed) || /^https?:\/\/[^/]+\/file\/\d+/i.test(trimmed)) return true;
  if (/^https:\/\/file\.pro-talk\.ru\//i.test(trimmed)) return true;
  return false;
}

function extractMarkdownImageUrls(md: string): string[] {
  const urls: string[] = [];
  const regex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(md)) !== null) {
    if (m[1]) urls.push(m[1].trim());
  }
  return urls;
}

function normalizeImageUrlToDbRelative(url: string): string {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^https?:\/\/[^/]+(\/file\/\d+(?:\/[^?#]*)?)/i);
  return match && match[1] ? match[1] : trimmed;
}

async function resolveActor(
  queryPg: QueryPgFn,
  body: Record<string, unknown>
): Promise<{
  ok: true;
  visitorKey: string;
  userUid: number | null;
  authorName: string;
  authorAvatar: string;
  isGuest: boolean;
  visitorToken: string | null;
} | { ok: false; error: string }> {
  const rawUid = body.user_uid ? Number(body.user_uid) : null;
  const visitorToken =
    typeof body.visitor_token === 'string' && body.visitor_token.trim()
      ? body.visitor_token.trim().slice(0, 80)
      : null;

  if (rawUid && Number.isFinite(rawUid) && rawUid > 0) {
    try {
      const uRes = await queryPg<{ uid: number; name: string | null; email: string | null; avatar_url: string | null }>(
        'SELECT uid, name, email, avatar_url FROM users WHERE uid = $1 LIMIT 1;',
        [rawUid]
      );
      const user = uRes.rows?.[0];
      if (user) {
        const displayName =
          (user.name || '').trim() ||
          (user.email ? user.email.split('@')[0] : '') ||
          `Автор #${user.uid}`;
        return {
          ok: true,
          visitorKey: `uid:${user.uid}`,
          userUid: Number(user.uid),
          authorName: displayName,
          authorAvatar: user.avatar_url || '',
          isGuest: false,
          visitorToken,
        };
      }
    } catch {
      // fallback below
    }
    const fallbackName =
      typeof body.author_name === 'string' && body.author_name.trim()
        ? body.author_name.trim().slice(0, 60)
        : `Пользователь #${rawUid}`;
    return {
      ok: true,
      visitorKey: `uid:${rawUid}`,
      userUid: rawUid,
      authorName: fallbackName,
      authorAvatar: '',
      isGuest: false,
      visitorToken,
    };
  }

  const guestName = typeof body.guest_name === 'string' ? body.guest_name.trim() : '';
  if (guestName.length < 2) {
    return {
      ok: false,
      error: 'Укажите ваше имя (минимум 2 символа) для участия без регистрации.',
    };
  }
  const safeToken = visitorToken || `guest_${transliterateToSlug(guestName)}_${Date.now()}`;
  return {
    ok: true,
    visitorKey: `anon:${safeToken}`,
    userUid: null,
    authorName: guestName.slice(0, 60),
    authorAvatar: '',
    isGuest: true,
    visitorToken: safeToken,
  };
}

export function registerBlogRoutes(app: Express, queryPg: QueryPgFn): void {
  // 1. Public paginated list of published posts
  app.get('/api/blog/posts', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const search = String(req.query.search || '').trim();
      const tag = String(req.query.tag || '').trim();
      const visitorKey = String(req.query.visitor_key || '').trim();
      const summaryOnly = String(req.query.summary || '') === '1';
      const limit = Math.min(20, Math.max(1, parseInt(String(req.query.limit || 10), 10) || 10));
      const offset = Math.max(0, parseInt(String(req.query.offset || 0), 10) || 0);
      const whereParts: string[] = [`status = 'published'`];
      const params: (string | number | boolean | null)[] = [];
      if (search) {
        params.push(`%${search}%`);
        const idx = params.length;
        whereParts.push(`(title ILIKE $${idx} OR COALESCE(subtitle,'') ILIKE $${idx} OR COALESCE(excerpt,'') ILIKE $${idx} OR content_markdown ILIKE $${idx})`);
      }
      if (tag) {
        params.push(tag);
        whereParts.push(`tags ? $${params.length}`);
      }
      const whereSql = whereParts.join(' AND ');
      const contentCol = summaryOnly ? `'' AS content_markdown` : `content_markdown`;
      const listSql = `SELECT id, slug, title, subtitle, excerpt, ${contentCol}, CHAR_LENGTH(COALESCE(content_markdown, ''))::int AS content_length, cover_image_url, cover_video_url, cover_file_id, tags, seo_keywords, seo_title, seo_description, author_name, author_role, author_uid, read_time_minutes, external_id, source_url, telegram_post_url, telegram_channel, COALESCE(is_pinned, false) AS is_pinned, pinned_at, status, views_count, likes_count, shares_count, comments_count, published_at, created_at, updated_at FROM blog_posts WHERE ${whereSql} ORDER BY COALESCE(is_pinned, false) DESC, pinned_at DESC NULLS LAST, published_at DESC, id DESC LIMIT ${limit} OFFSET ${offset};`;
      const [listRes, countRes, tagsRes] = await Promise.all([
        queryPg<Record<string, unknown>>(listSql, params),
        queryPg<{ total: number }>(`SELECT COUNT(*)::int AS total FROM blog_posts WHERE ${whereSql};`, params),
        offset === 0
          ? queryPg<{ tag: string; count: number }>(`SELECT t AS tag, COUNT(*)::int AS count FROM blog_posts, jsonb_array_elements_text(tags) AS t WHERE status = 'published' GROUP BY t ORDER BY count DESC, t ASC;`).catch(() => ({ rows: [] as Array<{ tag: string; count: number }> }))
          : Promise.resolve({ rows: [] as Array<{ tag: string; count: number }> }),
      ]);
      const rows = listRes.rows || [];
      const total = Number(countRes.rows?.[0]?.total ?? rows.length);
      let likedPostIds = new Set<number>();
      if (visitorKey && rows.length > 0) {
        const ids = rows.map((r) => Number(r.id)).filter(Boolean);
        if (ids.length > 0) {
          const likesRes = await queryPg<{ post_id: number }>(`SELECT post_id FROM blog_post_likes WHERE visitor_key = $1 AND post_id = ANY($2::bigint[]);`, [visitorKey, `{${ids.join(',')}}`]).catch(() => ({ rows: [] as Array<{ post_id: number }> }));
          likedPostIds = new Set((likesRes.rows || []).map((l) => Number(l.post_id)));
        }
      }
      const posts = rows.map((row) => ({ ...row, tags: parseTags(row.tags), liked_by_me: likedPostIds.has(Number(row.id)) }));
      res.json({ success: true, posts, total, hasMore: offset + rows.length < total, allTags: tagsRes.rows || [] });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 2. Public single post by slug + comments tree + views increment
  app.get('/api/blog/posts/:slug', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const slug = decodeURIComponent(String(req.params.slug || '')).trim();
      const visitorKey = String(req.query.visitor_key || '').trim();
      const skipView = String(req.query.skip_view || '') === '1';

      if (!slug) {
        return res.status(400).json({ success: false, error: 'Не указан slug статьи' });
      }

      const postRes = await queryPg<Record<string, unknown>>(
        `SELECT * FROM blog_posts WHERE slug = $1 AND status = 'published' LIMIT 1;`,
        [slug]
      );
      const post = postRes.rows?.[0];
      if (!post) {
        return res.status(404).json({ success: false, error: 'Статья не найдена' });
      }

      const postId = Number(post.id);
      if (!skipView) {
        await queryPg(`UPDATE blog_posts SET views_count = COALESCE(views_count, 0) + 1 WHERE id = $1;`, [
          postId,
        ]).catch(() => {});
        post.views_count = Number(post.views_count || 0) + 1;
      }

      const commentsRes = await queryPg<Record<string, unknown>>(
        `SELECT id, post_id, parent_id, user_uid, author_name, author_avatar, is_guest, content, likes_count, created_at
         FROM blog_comments
         WHERE post_id = $1
         ORDER BY created_at ASC, id ASC;`,
        [postId]
      );

      let postLikedByMe = false;
      const likedCommentIds = new Set<number>();

      if (visitorKey) {
        const postLikeRes = await queryPg<{ id: number }>(
          `SELECT id FROM blog_post_likes WHERE post_id = $1 AND visitor_key = $2 LIMIT 1;`,
          [postId, visitorKey]
        ).catch(() => ({ rows: [] }));
        postLikedByMe = (postLikeRes.rows || []).length > 0;

        const commentIds = (commentsRes.rows || []).map((c) => Number(c.id)).filter(Boolean);
        if (commentIds.length > 0) {
          const clRes = await queryPg<{ comment_id: number }>(
            `SELECT comment_id FROM blog_comment_likes WHERE visitor_key = $1 AND comment_id = ANY($2::bigint[]);`,
            [visitorKey, `{${commentIds.join(',')}}`]
          ).catch(() => ({ rows: [] as Array<{ comment_id: number }> }));
          for (const row of clRes.rows || []) {
            likedCommentIds.add(Number(row.comment_id));
          }
        }
      }

      const relatedRes = await queryPg<Record<string, unknown>>(
        `SELECT id, slug, title, subtitle, excerpt, cover_image_url, cover_video_url, tags, author_name, read_time_minutes, external_id, views_count, likes_count, shares_count, comments_count, published_at
         FROM blog_posts
         WHERE status = 'published' AND id <> $1
         ORDER BY published_at DESC, id DESC
         LIMIT 3;`,
        [postId]
      );

      res.json({
        success: true,
        post: {
          ...post,
          tags: parseTags(post.tags),
          liked_by_me: postLikedByMe,
        },
        comments: (commentsRes.rows || []).map((c) => ({
          ...c,
          liked_by_me: likedCommentIds.has(Number(c.id)),
        })),
        related: (relatedRes.rows || []).map((r) => ({
          ...r,
          tags: parseTags(r.tags),
        })),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 3. Toggle like on a post (authenticated or guest with name)
  app.post('/api/blog/posts/:slug/like', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const slug = decodeURIComponent(String(req.params.slug || '')).trim();
      const postRes = await queryPg<{ id: number }>(
        `SELECT id FROM blog_posts WHERE slug = $1 AND status = 'published' LIMIT 1;`,
        [slug]
      );
      const post = postRes.rows?.[0];
      if (!post) {
        return res.status(404).json({ success: false, error: 'Пост не найден' });
      }

      const actor = await resolveActor(queryPg, req.body || {});
      if (actor.ok === false) {
        return res.status(400).json({ success: false, needName: true, error: actor.error });
      }

      const postId = Number(post.id);
      const existing = await queryPg<{ id: number }>(
        `SELECT id FROM blog_post_likes WHERE post_id = $1 AND visitor_key = $2 LIMIT 1;`,
        [postId, actor.visitorKey]
      );

      let liked = false;
      if (existing.rows && existing.rows.length > 0) {
        await queryPg(`DELETE FROM blog_post_likes WHERE id = $1;`, [existing.rows[0].id]);
        liked = false;
      } else {
        await queryPg(
          `INSERT INTO blog_post_likes (post_id, visitor_key, user_uid, author_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (post_id, visitor_key) DO NOTHING;`,
          [postId, actor.visitorKey, actor.userUid, actor.authorName]
        );
        liked = true;
      }

      const cntRes = await queryPg<{ total: string }>(
        `SELECT COUNT(*) AS total FROM blog_post_likes WHERE post_id = $1;`,
        [postId]
      );
      const likesCount = Number(cntRes.rows?.[0]?.total || 0);
      await queryPg(`UPDATE blog_posts SET likes_count = $1 WHERE id = $2;`, [likesCount, postId]);

      res.json({
        success: true,
        liked,
        likes_count: likesCount,
        visitor_key: actor.visitorKey,
        author_name: actor.authorName,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 4. Record repost/share on a post
  app.post('/api/blog/posts/:slug/repost', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const slug = decodeURIComponent(String(req.params.slug || '')).trim();
      const postRes = await queryPg<{ id: number; shares_count: number }>(
        `SELECT id, shares_count FROM blog_posts WHERE slug = $1 AND status = 'published' LIMIT 1;`,
        [slug]
      );
      const post = postRes.rows?.[0];
      if (!post) {
        return res.status(404).json({ success: false, error: 'Пост не найден' });
      }

      const actor = await resolveActor(queryPg, req.body || {});
      if (actor.ok === false) {
        return res.status(400).json({ success: false, needName: true, error: actor.error });
      }

      const channel = String(req.body?.channel || 'link').trim().slice(0, 30) || 'link';
      const postId = Number(post.id);

      await queryPg(
        `INSERT INTO blog_post_reposts (post_id, visitor_key, user_uid, author_name, channel)
         VALUES ($1, $2, $3, $4, $5);`,
        [postId, actor.visitorKey, actor.userUid, actor.authorName, channel]
      );

      const updRes = await queryPg<{ shares_count: number }>(
        `UPDATE blog_posts SET shares_count = COALESCE(shares_count, 0) + 1 WHERE id = $1 RETURNING shares_count;`,
        [postId]
      );

      res.json({
        success: true,
        shares_count: Number(updRes.rows?.[0]?.shares_count || Number(post.shares_count || 0) + 1),
        author_name: actor.authorName,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Add comment or reply to post
  app.post('/api/blog/posts/:slug/comments', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const slug = decodeURIComponent(String(req.params.slug || '')).trim();
      const postRes = await queryPg<{ id: number }>(
        `SELECT id FROM blog_posts WHERE slug = $1 AND status = 'published' LIMIT 1;`,
        [slug]
      );
      const post = postRes.rows?.[0];
      if (!post) {
        return res.status(404).json({ success: false, error: 'Пост не найден' });
      }

      const actor = await resolveActor(queryPg, req.body || {});
      if (actor.ok === false) {
        return res.status(400).json({ success: false, needName: true, error: actor.error });
      }

      const content = String(req.body?.content || '').trim();
      if (content.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Текст комментария должен содержать минимум 2 символа.',
        });
      }
      if (content.length > 4000) {
        return res.status(400).json({
          success: false,
          error: 'Комментарий не может превышать 4000 символов.',
        });
      }

      const postId = Number(post.id);
      let parentId: number | null = req.body?.parent_id ? Number(req.body.parent_id) : null;
      if (parentId !== null) {
        if (!Number.isFinite(parentId) || parentId <= 0) {
          parentId = null;
        } else {
          const parentCheck = await queryPg<{ id: number }>(
            `SELECT id FROM blog_comments WHERE id = $1 AND post_id = $2 LIMIT 1;`,
            [parentId, postId]
          );
          if (!parentCheck.rows?.[0]) {
            return res.status(400).json({ success: false, error: 'Родительский комментарий не найден' });
          }
        }
      }

      const insRes = await queryPg<Record<string, unknown>>(
        `INSERT INTO blog_comments (
           post_id, parent_id, user_uid, visitor_token, author_name, author_avatar, is_guest, content
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, post_id, parent_id, user_uid, author_name, author_avatar, is_guest, content, likes_count, created_at;`,
        [
          postId,
          parentId,
          actor.userUid,
          actor.visitorToken,
          actor.authorName,
          actor.authorAvatar,
          actor.isGuest,
          content,
        ]
      );

      const cntRes = await queryPg<{ total: string }>(
        `SELECT COUNT(*) AS total FROM blog_comments WHERE post_id = $1;`,
        [postId]
      );
      const commentsCount = Number(cntRes.rows?.[0]?.total || 0);
      await queryPg(`UPDATE blog_posts SET comments_count = $1 WHERE id = $2;`, [commentsCount, postId]);

      res.json({
        success: true,
        comment: {
          ...insRes.rows[0],
          liked_by_me: false,
        },
        comments_count: commentsCount,
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 6. Toggle like on a comment or reply
  app.post('/api/blog/comments/:id/like', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const commentId = parseInt(req.params.id, 10);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID комментария' });
      }

      const cRes = await queryPg<{ id: number }>(
        `SELECT id FROM blog_comments WHERE id = $1 LIMIT 1;`,
        [commentId]
      );
      if (!cRes.rows?.[0]) {
        return res.status(404).json({ success: false, error: 'Комментарий не найден' });
      }

      const actor = await resolveActor(queryPg, req.body || {});
      if (actor.ok === false) {
        return res.status(400).json({ success: false, needName: true, error: actor.error });
      }

      const existing = await queryPg<{ id: number }>(
        `SELECT id FROM blog_comment_likes WHERE comment_id = $1 AND visitor_key = $2 LIMIT 1;`,
        [commentId, actor.visitorKey]
      );

      let liked = false;
      if (existing.rows && existing.rows.length > 0) {
        await queryPg(`DELETE FROM blog_comment_likes WHERE id = $1;`, [existing.rows[0].id]);
        liked = false;
      } else {
        await queryPg(
          `INSERT INTO blog_comment_likes (comment_id, visitor_key, user_uid, author_name)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (comment_id, visitor_key) DO NOTHING;`,
          [commentId, actor.visitorKey, actor.userUid, actor.authorName]
        );
        liked = true;
      }

      const cntRes = await queryPg<{ total: string }>(
        `SELECT COUNT(*) AS total FROM blog_comment_likes WHERE comment_id = $1;`,
        [commentId]
      );
      const likesCount = Number(cntRes.rows?.[0]?.total || 0);
      await queryPg(`UPDATE blog_comments SET likes_count = $1 WHERE id = $2;`, [likesCount, commentId]);

      res.json({
        success: true,
        liked,
        likes_count: likesCount,
        visitor_key: actor.visitorKey,
        author_name: actor.authorName,
      });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 7. Admin: list all posts (pinned first, then published_at DESC)
  app.get('/api/admin/blog/posts', async (_req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const { rows } = await queryPg<Record<string, unknown>>(
        `SELECT * FROM blog_posts ORDER BY COALESCE(is_pinned, false) DESC, pinned_at DESC NULLS LAST, published_at DESC, id DESC;`
      );
      const posts = (rows || []).map((row) => ({ ...row, tags: parseTags(row.tags) }));
      const pinnedCount = posts.filter((p) => Boolean((p as Record<string, unknown>).is_pinned)).length;
      res.json({ success: true, posts, pinnedCount, maxPinned: MAX_PINNED_BLOG_POSTS });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 8. Admin: create blog post
  app.post('/api/admin/blog/posts', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const title = String(req.body?.title || '').trim();
      const subtitle = String(req.body?.subtitle || '').trim();
      const excerpt = String(req.body?.excerpt || '').trim();
      const contentMarkdown = String(req.body?.content_markdown || '').trim();
      const coverImageUrl = normalizeImageUrlToDbRelative(String(req.body?.cover_image_url || ''));
      const coverFileId = req.body?.cover_file_id ? Number(req.body.cover_file_id) : null;
      const tags = parseTags(req.body?.tags);
      const seoKeywords = String(req.body?.seo_keywords || '').trim();
      const authorName = String(req.body?.author_name || 'Редакция KnigAI').trim() || 'Редакция KnigAI';
      const authorUid = req.body?.author_uid ? Number(req.body.author_uid) : 10000000001;
      const status = req.body?.status === 'draft' ? 'draft' : 'published';

      if (title.length < 3) {
        return res.status(400).json({ success: false, error: 'Укажите уникальное название темы поста (минимум 3 символа).' });
      }
      if (!contentMarkdown) {
        return res.status(400).json({ success: false, error: 'Текст поста в формате Markdown не может быть пустым.' });
      }
      if (coverImageUrl && !isDatabaseImageUrl(coverImageUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Обложка должна быть загружена в базу данных (галерею KnigAI) и использовать ссылку /file/:id или облака.',
        });
      }

      const inlineImgs = extractMarkdownImageUrls(contentMarkdown);
      const invalidInline = inlineImgs.find((u) => !isDatabaseImageUrl(u));
      if (invalidInline) {
        return res.status(400).json({
          success: false,
          error: `Картинка в тексте (${invalidInline}) должна быть загружена в базу данных галереи KnigAI.`,
        });
      }

      // Unique title check
      const dupTitle = await queryPg<{ id: number }>(
        `SELECT id FROM blog_posts WHERE LOWER(title) = LOWER($1) LIMIT 1;`,
        [title]
      );
      if (dupTitle.rows && dupTitle.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Пост с таким названием (темой) уже существует. Название поста должно быть уникальным.',
        });
      }

      const desiredSlugInput = String(req.body?.slug || '').trim() || title;
      const uniqueSlug = await ensureUniqueSlug(queryPg, desiredSlugInput);

      const insRes = await queryPg<Record<string, unknown>>(
        `INSERT INTO blog_posts (
           slug, title, subtitle, excerpt, content_markdown, cover_image_url, cover_file_id,
           tags, seo_keywords, author_name, author_uid, status, published_at, updated_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, now(), now())
         RETURNING *;`,
        [
          uniqueSlug,
          title,
          subtitle,
          excerpt || subtitle || title,
          contentMarkdown,
          coverImageUrl,
          coverFileId,
          JSON.stringify(tags),
          seoKeywords,
          authorName,
          authorUid,
          status,
        ]
      );

      res.json({
        success: true,
        post: {
          ...insRes.rows[0],
          tags: parseTags(insRes.rows[0]?.tags),
        },
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 9. Admin: update blog post
  app.put('/api/admin/blog/posts/:id', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const postId = parseInt(req.params.id, 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID поста' });
      }

      const existingRes = await queryPg<Record<string, unknown>>(
        `SELECT * FROM blog_posts WHERE id = $1 LIMIT 1;`,
        [postId]
      );
      const existing = existingRes.rows?.[0];
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Пост не найден' });
      }

      const title = String(req.body?.title ?? existing.title).trim();
      const subtitle = String(req.body?.subtitle ?? existing.subtitle ?? '').trim();
      const excerpt = String(req.body?.excerpt ?? existing.excerpt ?? '').trim();
      const contentMarkdown = String(req.body?.content_markdown ?? existing.content_markdown).trim();
      const coverImageUrl = normalizeImageUrlToDbRelative(
        String(req.body?.cover_image_url ?? existing.cover_image_url ?? '')
      );
      const coverFileId =
        req.body?.cover_file_id !== undefined
          ? (req.body.cover_file_id ? Number(req.body.cover_file_id) : null)
          : (existing.cover_file_id ? Number(existing.cover_file_id) : null);
      const tags = req.body?.tags !== undefined ? parseTags(req.body.tags) : parseTags(existing.tags);
      const seoKeywords = String(req.body?.seo_keywords ?? existing.seo_keywords ?? '').trim();
      const authorName = String(req.body?.author_name ?? existing.author_name ?? 'Редакция KnigAI').trim();
      const status = req.body?.status === 'draft' ? 'draft' : 'published';

      if (title.length < 3) {
        return res.status(400).json({ success: false, error: 'Название темы должно быть минимум 3 символа.' });
      }
      if (!contentMarkdown) {
        return res.status(400).json({ success: false, error: 'Текст поста не может быть пустым.' });
      }
      if (!existing.external_id && coverImageUrl && !isDatabaseImageUrl(coverImageUrl)) {
        return res.status(400).json({
          success: false,
          error: 'Обложка должна использовать ссылку из нашей базы данных (/file/:id или облако KnigAI).',
        });
      }

      const invalidInline = existing.external_id
        ? undefined
        : extractMarkdownImageUrls(contentMarkdown).find((u) => !isDatabaseImageUrl(u));
      if (invalidInline) {
        return res.status(400).json({
          success: false,
          error: `Картинка в тексте (${invalidInline}) должна использовать ссылку из базы данных KnigAI.`,
        });
      }

      const dupTitle = await queryPg<{ id: number }>(
        `SELECT id FROM blog_posts WHERE LOWER(title) = LOWER($1) AND id <> $2 LIMIT 1;`,
        [title, postId]
      );
      if (dupTitle.rows && dupTitle.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Другой пост с таким названием уже существует.',
        });
      }

      const desiredSlugInput = String(req.body?.slug || '').trim() || title;
      const uniqueSlug = await ensureUniqueSlug(queryPg, desiredSlugInput, postId);

      const updRes = await queryPg<Record<string, unknown>>(
        `UPDATE blog_posts
         SET slug = $1,
             title = $2,
             subtitle = $3,
             excerpt = $4,
             content_markdown = $5,
             cover_image_url = $6,
             cover_file_id = $7,
             tags = $8::jsonb,
             seo_keywords = $9,
             author_name = $10,
             status = $11,
             updated_at = now()
         WHERE id = $12
         RETURNING *;`,
        [
          uniqueSlug,
          title,
          subtitle,
          excerpt || subtitle || title,
          contentMarkdown,
          coverImageUrl,
          coverFileId,
          JSON.stringify(tags),
          seoKeywords,
          authorName,
          status,
          postId,
        ]
      );

      res.json({ success: true, post: { ...updRes.rows[0], tags: parseTags(updRes.rows[0]?.tags) } });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 9b. Admin: pin / unpin blog post (up to 10 pinned posts)
  app.post('/api/admin/blog/posts/:id/pin', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const postId = parseInt(req.params.id, 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID поста' });
      }
      const desired = req.body?.pinned !== undefined ? Boolean(req.body.pinned) : undefined;
      const result = await setBlogPostPinned(queryPg, postId, desired);
      if (result.ok === false) {
        return res.status(result.status).json({ success: false, error: result.error });
      }
      res.json({
        success: true,
        post: { ...result.post, tags: parseTags(result.post?.tags) },
        pinnedCount: result.pinnedCount,
        maxPinned: result.maxPinned,
      });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 10. Admin: delete blog post
  app.delete('/api/admin/blog/posts/:id', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const postId = parseInt(req.params.id, 10);
      if (!Number.isFinite(postId) || postId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID поста' });
      }
      await queryPg(`DELETE FROM blog_posts WHERE id = $1;`, [postId]);
      res.json({ success: true, deletedId: postId });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 11. Admin: delete blog comment
  app.delete('/api/admin/blog/comments/:id', async (req: Request, res: Response) => {
    try {
      await ensureBlogSchema(queryPg);
      const commentId = parseInt(req.params.id, 10);
      if (!Number.isFinite(commentId) || commentId <= 0) {
        return res.status(400).json({ success: false, error: 'Некорректный ID комментария' });
      }
      const deleted = await queryPg<{ post_id: number }>(
        `DELETE FROM blog_comments WHERE id = $1 RETURNING post_id;`,
        [commentId]
      );
      const postId = deleted.rows?.[0]?.post_id;
      if (postId) {
        const cntRes = await queryPg<{ total: string }>(`SELECT COUNT(*) AS total FROM blog_comments WHERE post_id = $1;`, [postId]);
        await queryPg(`UPDATE blog_posts SET comments_count = $1 WHERE id = $2;`, [Number(cntRes.rows?.[0]?.total || 0), postId]);
      }
      res.json({ success: true, deletedId: commentId });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  // 12. Admin: list DB images for blog picker + blog folder ID
  app.get('/api/admin/blog/images', async (_req: Request, res: Response) => {
    try {
      const blogFolderId = await ensureBlogFolderId(queryPg);
      const { rows } = await queryPg<{
        id: number;
        name: string;
        original_url: string;
        mime_type: string;
        file_size: number;
        folder_id: number | null;
        created_at: string;
      }>(
        `SELECT id, COALESCE(name, filename, 'image.jpg') AS name, COALESCE(original_url, url, '') AS original_url,
                COALESCE(mime_type, 'image/jpeg') AS mime_type, COALESCE(file_size, size_bytes, 0) AS file_size,
                folder_id, created_at
         FROM file_storage
         WHERE (mime_type ILIKE 'image/%' OR name ~* '\\.(png|jpe?g|webp|gif)$')
         ORDER BY (CASE WHEN folder_id = $1 THEN 0 ELSE 1 END) ASC, id DESC
         LIMIT 200;`,
        [blogFolderId || -1]
      );

      res.json({
        success: true,
        blogFolderId,
        images: (rows || []).map((f) => ({
          ...f,
          short_url: `/file/${f.id}`,
        })),
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 13. Admin: generate 16:9 horizontal image by prompt & persist to Telegram Storage + file_storage DB
  app.post('/api/admin/blog/generate-image', async (req: Request, res: Response) => {
    try {
      const userPrompt = String(req.body?.prompt || '').trim();
      const imageNameRaw = String(req.body?.name || '').trim();
      if (userPrompt.length < 4) {
        return res.status(400).json({
          success: false,
          error: 'Введите промпт для генерации горизонтального изображения 16:9.',
        });
      }

      const fullPrompt = `${userPrompt}. Strict horizontal 16:9 widescreen composition, cinematic editorial noir lighting, black ink and crimson accents, ultra detailed, no text overlays.`;
      const genRes = await fetch(PROTALK_FUNCTION_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          function_id: PROTALK_IMAGE_FUNCTION_ID,
          functions_base_id: PROTALK_FUNCTIONS_BASE_ID,
          bot_id: PROTALK_BOT_ID,
          bot_token: PROTALK_BOT_TOKEN,
          arguments: {
            prompt: fullPrompt,
            aspect_ratio: '16:9',
            resolution: '1K',
            filesUrl: '',
            debug: false,
          },
        }),
        signal: AbortSignal.timeout(55000),
      });

      if (!genRes.ok) {
        const errTxt = await genRes.text();
        return res.status(502).json({
          success: false,
          error: `Ошибка генерации изображения (${genRes.status}): ${errTxt.slice(0, 200)}`,
        });
      }

      const genData = (await genRes.json()) as {
        images?: Array<{ url?: string; media_type?: string; size_bytes?: number }>;
        error?: string;
      };
      const generatedUrl = genData?.images?.[0]?.url;
      if (!generatedUrl) {
        return res.status(502).json({
          success: false,
          error: genData?.error || 'Генератор не вернул изображение',
        });
      }

      const folderId = await ensureBlogFolderId(queryPg);
      const slugPart = transliterateToSlug(imageNameRaw || userPrompt.slice(0, 48));
      const cleanFilename = `blog_${slugPart}_${Date.now().toString().slice(-5)}.jpg`;

      let finalUrl = generatedUrl;
      let resolvedSize = Number(genData?.images?.[0]?.size_bytes || 0);
      let finalMime = String(genData?.images?.[0]?.media_type || 'image/jpeg');

      if (!finalUrl.startsWith('https://file.pro-talk.ru/tgf/')) {
        try {
          const mirrored = await mirrorUrlToTelegramStorage({
            sourceUrl: generatedUrl,
            filename: cleanFilename,
            mimeType: finalMime,
            caption: `📰 Блог KnigAI (16:9): ${imageNameRaw || userPrompt.slice(0, 100)}`,
          });
          finalUrl = mirrored.url;
          resolvedSize = mirrored.size;
          finalMime = mirrored.mimeType || finalMime;
        } catch (mirrorErr) {
          console.warn('[Blog Generate Image] Mirror fallback to generated URL:', mirrorErr);
        }
      }

      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let fileKey = '';
      for (let i = 0; i < 8; i++) {
        fileKey += chars.charAt(Math.floor(Math.random() * chars.length));
      }

      const insertRes = await queryPg<{
        id: number;
        file_key: string;
        name: string;
        original_url: string;
        mime_type: string;
        file_size: number;
        folder_id: number | null;
        created_at: string;
      }>(
        `INSERT INTO file_storage (user_uid, file_key, name, filename, original_url, url, mime_type, file_size, size_bytes, folder_id)
         VALUES ($1, $2, $3, $3, $4, $4, $5, $6, $6, $7)
         RETURNING id, file_key, name, original_url, mime_type, file_size, folder_id, created_at;`,
        [10000000001, fileKey, cleanFilename, finalUrl, finalMime, resolvedSize, folderId]
      );

      const saved = insertRes.rows[0];
      res.json({
        success: true,
        file: {
          ...saved,
          short_url: `/file/${saved.id}`,
        },
      });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 14. Trigger SAV AI RSS 2.0 feed sync & inspect last sync status
  app.post(['/api/blog/sync-rss', '/api/admin/blog/sync-rss'], async (req: Request, res: Response) => {
    try {
      const limitRaw = req.body?.limit ?? req.query.limit;
      const limit = limitRaw ? Math.min(200, Math.max(1, Number(limitRaw))) : 100;
      const category =
        typeof (req.body?.category ?? req.query.category) === 'string'
          ? String(req.body?.category ?? req.query.category).trim()
          : undefined;
      const result = await syncSavRssFeed(queryPg, { limit, category });
      res.status(result.success ? 200 : 502).json(result);
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.get(['/api/blog/rss-status', '/api/admin/blog/rss-status'], async (_req: Request, res: Response) => {
    try {
      const status = await getLastRssSyncStatus(queryPg);
      res.json({ success: true, status });
    } catch (err: unknown) {
      res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
  });
}
