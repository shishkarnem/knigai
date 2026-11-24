import { QueryPgFn } from '../backup/backupTypes';

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

export function transliterateToSlug(input: string): string {
  const raw = String(input || '')
    .trim()
    .toLowerCase();
  if (!raw) return 'knigai-post';

  const transliterated = Array.from(raw)
    .map((ch) => (Object.prototype.hasOwnProperty.call(CYRILLIC_TO_LATIN, ch) ? CYRILLIC_TO_LATIN[ch] : ch))
    .join('');

  const cleaned = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 110)
    .replace(/-+$/g, '');

  return cleaned || `post-${Date.now()}`;
}

export async function ensureUniqueSlug(
  queryPg: QueryPgFn,
  desiredTitleOrSlug: string,
  excludePostId?: number
): Promise<string> {
  const baseSlug = transliterateToSlug(desiredTitleOrSlug);
  let candidate = baseSlug;
  let counter = 2;

  while (counter < 200) {
    const res = excludePostId
      ? await queryPg<{ id: number }>(
          'SELECT id FROM blog_posts WHERE slug = $1 AND id <> $2 LIMIT 1;',
          [candidate, excludePostId]
        )
      : await queryPg<{ id: number }>(
          'SELECT id FROM blog_posts WHERE slug = $1 LIMIT 1;',
          [candidate]
        );

    if (!res.rows || res.rows.length === 0) {
      return candidate;
    }
    candidate = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return `${baseSlug}-${Date.now()}`;
}

export async function ensureBlogFolderId(queryPg: QueryPgFn): Promise<number | null> {
  try {
    const existing = await queryPg<{ id: number }>(
      `SELECT id FROM file_folders WHERE LOWER(name) = 'блог и статьи' LIMIT 1;`
    );
    if (existing.rows?.[0]?.id) {
      return Number(existing.rows[0].id);
    }
    const created = await queryPg<{ id: number }>(
      `INSERT INTO file_folders (user_uid, name, color) VALUES (10000000001, 'Блог и статьи', '#f43f5e') RETURNING id;`
    );
    return created.rows?.[0]?.id ? Number(created.rows[0].id) : null;
  } catch {
    return null;
  }
}

export const SAV_DEFAULT_COVER_URL =
  'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMJH0GOjgMOTE_BA9wETwiCzYmBQ95AyhoBSJLMhgZEyQdKwssKyoEUnQKdGsEfDonABIYETY4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png';

export const KNIGAI_DEFAULT_COVER_URL =
  'https://file.pro-talk.ru/tgf/GgMpJwQ9JCkYKglyGHQMEWI8ORwvLi4_Ji8TEyYbDwBaGxoDdxdUKARMdR4ZEyQ7NwssKxtqBAMKRzJScTl_Sz8AKho4NRQmEV9uZlUAaA11VQJrCjgDAzkkAVczLRouDiMXfQxTNBdFGT8aIyw2ZyIcIQsIKjIuHhtsBXZSBGZ5T3FP.png';

export const MAX_PINNED_BLOG_POSTS = 10;

export function replaceSavDefaultCoverText(input: string): string {
  const val = String(input || '');
  if (!val || !val.includes(SAV_DEFAULT_COVER_URL)) return val;
  return val.split(SAV_DEFAULT_COVER_URL).join(KNIGAI_DEFAULT_COVER_URL);
}

export async function replaceSavDefaultCoverEverywhereInDb(queryPg: QueryPgFn): Promise<number> {
  const likeArg = `%${SAV_DEFAULT_COVER_URL}%`;
  let updatedTotal = 0;

  try {
    const bpRes = await queryPg<{ id: number }>(
      `UPDATE blog_posts
       SET cover_image_url = REPLACE(COALESCE(cover_image_url, ''), $1, $2),
           content_markdown = REPLACE(COALESCE(content_markdown, ''), $1, $2),
           media_json = REPLACE(COALESCE(media_json, '[]'), $1, $2),
           excerpt = REPLACE(COALESCE(excerpt, ''), $1, $2),
           seo_description = REPLACE(COALESCE(seo_description, ''), $1, $2),
           updated_at = now()
       WHERE cover_image_url LIKE $3
          OR content_markdown LIKE $3
          OR media_json LIKE $3
          OR excerpt LIKE $3
          OR seo_description LIKE $3
       RETURNING id;`,
      [SAV_DEFAULT_COVER_URL, KNIGAI_DEFAULT_COVER_URL, likeArg]
    );
    updatedTotal += bpRes.rows?.length || 0;
  } catch (err) {
    console.warn('[KnigAI Blog] Cover replace in blog_posts notice:', err);
  }

  const extraUpdates: Array<{ sql: string }> = [
    {
      sql: `UPDATE file_storage
            SET original_url = REPLACE(COALESCE(original_url, ''), $1, $2),
                url = REPLACE(COALESCE(url, ''), $1, $2)
            WHERE original_url LIKE $3 OR url LIKE $3;`,
    },
    {
      sql: `UPDATE gallery
            SET image_url = REPLACE(COALESCE(image_url, ''), $1, $2)
            WHERE image_url LIKE $3;`,
    },
    {
      sql: `UPDATE books
            SET cover_config = REPLACE(COALESCE(cover_config, ''), $1, $2)
            WHERE cover_config LIKE $3;`,
    },
    {
      sql: `UPDATE chapters
            SET illustration_url = REPLACE(COALESCE(illustration_url, ''), $1, $2),
                content = REPLACE(COALESCE(content, ''), $1, $2)
            WHERE illustration_url LIKE $3 OR content LIKE $3;`,
    },
  ];

  for (const item of extraUpdates) {
    await queryPg(item.sql, [SAV_DEFAULT_COVER_URL, KNIGAI_DEFAULT_COVER_URL, likeArg]).catch(() => {});
  }

  return updatedTotal;
}

export async function setBlogPostPinned(
  queryPg: QueryPgFn,
  postId: number,
  desiredPinned?: boolean
): Promise<{
  ok: true;
  post: Record<string, unknown>;
  pinnedCount: number;
  maxPinned: number;
} | { ok: false; status: number; error: string }> {
  const existingRes = await queryPg<{ id: number; is_pinned: boolean | null }>(
    `SELECT id, COALESCE(is_pinned, false) AS is_pinned FROM blog_posts WHERE id = $1 LIMIT 1;`,
    [postId]
  );
  const existing = existingRes.rows?.[0];
  if (!existing) {
    return { ok: false, status: 404, error: 'Пост не найден' };
  }

  const nextPinned = desiredPinned !== undefined ? Boolean(desiredPinned) : !Boolean(existing.is_pinned);

  if (nextPinned && !existing.is_pinned) {
    const cntRes = await queryPg<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM blog_posts WHERE COALESCE(is_pinned, false) = true AND id <> $1;`,
      [postId]
    );
    const currentPinned = Number(cntRes.rows?.[0]?.cnt || 0);
    if (currentPinned >= MAX_PINNED_BLOG_POSTS) {
      return {
        ok: false,
        status: 400,
        error: `Можно закрепить не более ${MAX_PINNED_BLOG_POSTS} постов. Сначала открепите один из закреплённых постов.`,
      };
    }
  }

  const updRes = await queryPg<Record<string, unknown>>(
    `UPDATE blog_posts
     SET is_pinned = $1,
         pinned_at = CASE WHEN $1 THEN COALESCE(pinned_at, now()) ELSE NULL END
     WHERE id = $2
     RETURNING *;`,
    [nextPinned, postId]
  );

  const totalRes = await queryPg<{ cnt: number }>(
    `SELECT COUNT(*)::int AS cnt FROM blog_posts WHERE COALESCE(is_pinned, false) = true;`
  );

  return {
    ok: true,
    post: updRes.rows[0],
    pinnedCount: Number(totalRes.rows?.[0]?.cnt || 0),
    maxPinned: MAX_PINNED_BLOG_POSTS,
  };
}

let blogSchemaReady = false;
let blogSchemaPromise: Promise<void> | null = null;

export async function ensureBlogSchema(queryPg: QueryPgFn): Promise<void> {
  if (blogSchemaReady) return;
  if (blogSchemaPromise) return blogSchemaPromise;

  blogSchemaPromise = (async () => {
    const ddlStatements = [
    `CREATE TABLE IF NOT EXISTS blog_posts (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      title TEXT UNIQUE NOT NULL,
      subtitle TEXT DEFAULT '',
      excerpt TEXT DEFAULT '',
      content_markdown TEXT NOT NULL,
      cover_image_url TEXT DEFAULT '',
      cover_video_url TEXT DEFAULT '',
      cover_file_id BIGINT,
      tags JSONB DEFAULT '[]'::jsonb,
      seo_keywords TEXT DEFAULT '',
      seo_title TEXT DEFAULT '',
      seo_description TEXT DEFAULT '',
      author_name TEXT DEFAULT 'Редакция KnigAI',
      author_role TEXT DEFAULT '',
      author_uid BIGINT DEFAULT 10000000001,
      read_time_minutes INT DEFAULT 0,
      external_id TEXT UNIQUE,
      external_updated_at TEXT DEFAULT '',
      source_url TEXT DEFAULT '',
      telegram_post_url TEXT DEFAULT '',
      telegram_channel TEXT DEFAULT '',
      media_json TEXT DEFAULT '[]',
      buttons_json TEXT DEFAULT '[]',
      is_pinned BOOLEAN DEFAULT false,
      pinned_at TIMESTAMPTZ,
      status TEXT DEFAULT 'published',
      views_count INT DEFAULT 0,
      likes_count INT DEFAULT 0,
      shares_count INT DEFAULT 0,
      comments_count INT DEFAULT 0,
      published_at TIMESTAMPTZ DEFAULT now(),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS external_id TEXT;`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS external_updated_at TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS cover_video_url TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS source_url TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS telegram_post_url TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS telegram_channel TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS author_role TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS read_time_minutes INT DEFAULT 0;`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS seo_title TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS seo_description TEXT DEFAULT '';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS media_json TEXT DEFAULT '[]';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS buttons_json TEXT DEFAULT '[]';`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT false;`,
    `ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_blog_posts_external_id ON blog_posts (external_id) WHERE external_id IS NOT NULL;`,
    `CREATE INDEX IF NOT EXISTS idx_blog_posts_status_pub ON blog_posts (status, published_at DESC);`,
    `CREATE INDEX IF NOT EXISTS idx_blog_posts_pinned_pub ON blog_posts (is_pinned DESC, pinned_at DESC NULLS LAST, published_at DESC, id DESC);`,
    `CREATE TABLE IF NOT EXISTS blog_post_likes (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      visitor_key TEXT NOT NULL,
      user_uid BIGINT,
      author_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (post_id, visitor_key)
    );`,
    `CREATE TABLE IF NOT EXISTS blog_post_reposts (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      visitor_key TEXT NOT NULL,
      user_uid BIGINT,
      author_name TEXT NOT NULL,
      channel TEXT DEFAULT 'link',
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE TABLE IF NOT EXISTS blog_comments (
      id BIGSERIAL PRIMARY KEY,
      post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
      parent_id BIGINT REFERENCES blog_comments(id) ON DELETE CASCADE,
      user_uid BIGINT,
      visitor_token TEXT,
      author_name TEXT NOT NULL,
      author_avatar TEXT DEFAULT '',
      is_guest BOOLEAN DEFAULT false,
      content TEXT NOT NULL,
      likes_count INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now()
    );`,
    `CREATE INDEX IF NOT EXISTS idx_blog_comments_post ON blog_comments (post_id, created_at ASC);`,
    `CREATE TABLE IF NOT EXISTS blog_comment_likes (
      id BIGSERIAL PRIMARY KEY,
      comment_id BIGINT NOT NULL REFERENCES blog_comments(id) ON DELETE CASCADE,
      visitor_key TEXT NOT NULL,
      user_uid BIGINT,
      author_name TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE (comment_id, visitor_key)
    );`,
  ];

    for (const sql of ddlStatements) {
      await queryPg(sql);
    }

    await replaceSavDefaultCoverEverywhereInDb(queryPg);
    await ensureBlogFolderId(queryPg);
    blogSchemaReady = true;
  })().finally(() => {
    blogSchemaPromise = null;
  });

  return blogSchemaPromise;
}
