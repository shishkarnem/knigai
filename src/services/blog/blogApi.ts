import { AppUser } from '../../types';

export interface BlogPostDto {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  content_markdown: string;
  content_length?: number;
  cover_image_url: string;
  cover_video_url?: string;
  cover_file_id?: number | null;
  tags: string[];
  seo_keywords: string;
  seo_title?: string;
  seo_description?: string;
  author_name: string;
  author_role?: string;
  author_uid?: number | null;
  read_time_minutes?: number;
  external_id?: string;
  source_url?: string;
  telegram_post_url?: string;
  telegram_channel?: string;
  media_json?: string;
  buttons_json?: string;
  is_pinned?: boolean;
  pinned_at?: string | null;
  status: 'published' | 'draft';
  views_count: number;
  likes_count: number;
  shares_count: number;
  comments_count: number;
  liked_by_me?: boolean;
  published_at: string;
  created_at?: string;
  updated_at?: string;
}

export interface BlogCommentDto {
  id: number;
  post_id: number;
  parent_id: number | null;
  user_uid: number | null;
  author_name: string;
  author_avatar?: string;
  is_guest: boolean;
  content: string;
  likes_count: number;
  liked_by_me?: boolean;
  created_at: string;
}

export interface BlogImageFileDto {
  id: number;
  name: string;
  original_url: string;
  short_url: string;
  mime_type: string;
  file_size: number;
  folder_id: number | null;
  created_at: string;
}

const GUEST_TOKEN_KEY = 'knigai_blog_visitor_token';
const GUEST_NAME_KEY = 'knigai_blog_guest_name';

const CYR_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export function transliterateToSlug(input: string): string {
  const lower = String(input || '').trim().toLowerCase();
  let out = '';
  for (const ch of lower) {
    if (CYR_MAP[ch] !== undefined) {
      out += CYR_MAP[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (/[\s\-_—–.,:/\\|!?+]+/.test(ch)) {
      out += '-';
    }
  }
  const clean = out.replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 96);
  return clean || 'post';
}

export function getBlogGuestToken(): string {
  try {
    let token = localStorage.getItem(GUEST_TOKEN_KEY) || '';
    if (!token) {
      token = `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(GUEST_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return 'v_anon_session';
  }
}

export function getBlogGuestName(): string {
  try {
    return (localStorage.getItem(GUEST_NAME_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function setBlogGuestName(name: string): string {
  const clean = String(name || '').trim().slice(0, 60);
  try {
    if (clean) {
      localStorage.setItem(GUEST_NAME_KEY, clean);
    } else {
      localStorage.removeItem(GUEST_NAME_KEY);
    }
  } catch {
    // ignore storage errors
  }
  return clean;
}

export function getCurrentVisitorKey(currentUser: AppUser | null): string {
  if (currentUser?.uid) return `uid:${currentUser.uid}`;
  return `anon:${getBlogGuestToken()}`;
}

export function buildActorPayload(
  currentUser: AppUser | null,
  guestNameOverride?: string
): {
  user_uid?: number;
  author_name?: string;
  guest_name?: string;
  visitor_token: string;
} {
  const visitor_token = getBlogGuestToken();
  if (currentUser?.uid) {
    const authorName =
      (currentUser.name || '').trim() ||
      (currentUser.email ? currentUser.email.split('@')[0] : '') ||
      `Автор #${currentUser.uid}`;
    return {
      user_uid: currentUser.uid,
      author_name: authorName,
      visitor_token,
    };
  }
  const guestName = (guestNameOverride !== undefined ? guestNameOverride : getBlogGuestName()).trim();
  return {
    guest_name: guestName,
    visitor_token,
  };
}

export interface BlogTagCountDto {
  tag: string;
  count: number;
}

export interface BlogPostsPageResult {
  posts: BlogPostDto[];
  total: number;
  hasMore: boolean;
  allTags: BlogTagCountDto[];
}

export async function fetchBlogPostsPage(params?: {
  search?: string;
  tag?: string;
  currentUser?: AppUser | null;
  limit?: number;
  offset?: number;
  summary?: boolean;
}): Promise<BlogPostsPageResult> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.tag) qs.set('tag', params.tag);
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.offset !== undefined) qs.set('offset', String(params.offset));
  if (params?.summary) qs.set('summary', '1');
  qs.set('visitor_key', getCurrentVisitorKey(params?.currentUser || null));

  const res = await fetch(`/api/blog/posts?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось загрузить статьи блога');
  }
  return {
    posts: data.posts || [],
    total: Number(data.total ?? (data.posts?.length || 0)),
    hasMore: Boolean(data.hasMore),
    allTags: Array.isArray(data.allTags) ? data.allTags : [],
  };
}

export async function fetchBlogPosts(params?: {
  search?: string;
  tag?: string;
  currentUser?: AppUser | null;
  limit?: number;
  offset?: number;
  summary?: boolean;
}): Promise<BlogPostDto[]> {
  const page = await fetchBlogPostsPage(params);
  return page.posts;
}

export async function fetchBlogPostBySlug(
  slug: string,
  currentUser: AppUser | null,
  skipView = false
): Promise<{
  post: BlogPostDto;
  comments: BlogCommentDto[];
  related: BlogPostDto[];
}> {
  const qs = new URLSearchParams();
  qs.set('visitor_key', getCurrentVisitorKey(currentUser));
  if (skipView) qs.set('skip_view', '1');

  const res = await fetch(`/api/blog/posts/${encodeURIComponent(slug)}?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Статья не найдена');
  }
  return {
    post: data.post,
    comments: data.comments || [],
    related: data.related || [],
  };
}

export async function toggleBlogPostLike(
  slug: string,
  currentUser: AppUser | null,
  guestName?: string
): Promise<{ liked: boolean; likes_count: number }> {
  const res = await fetch(`/api/blog/posts/${encodeURIComponent(slug)}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildActorPayload(currentUser, guestName)),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = new Error(data.error || 'Не удалось поставить лайк') as Error & { needName?: boolean };
    err.needName = Boolean(data.needName);
    throw err;
  }
  return { liked: Boolean(data.liked), likes_count: Number(data.likes_count || 0) };
}

export async function recordBlogPostRepost(
  slug: string,
  currentUser: AppUser | null,
  channel: string,
  guestName?: string
): Promise<{ shares_count: number }> {
  const res = await fetch(`/api/blog/posts/${encodeURIComponent(slug)}/repost`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildActorPayload(currentUser, guestName),
      channel,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = new Error(data.error || 'Не удалось зафиксировать репост') as Error & { needName?: boolean };
    err.needName = Boolean(data.needName);
    throw err;
  }
  return { shares_count: Number(data.shares_count || 0) };
}

export async function createBlogComment(
  slug: string,
  content: string,
  currentUser: AppUser | null,
  parentId?: number | null,
  guestName?: string
): Promise<{ comment: BlogCommentDto; comments_count: number }> {
  const res = await fetch(`/api/blog/posts/${encodeURIComponent(slug)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...buildActorPayload(currentUser, guestName),
      content,
      parent_id: parentId ?? null,
    }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = new Error(data.error || 'Не удалось отправить комментарий') as Error & { needName?: boolean };
    err.needName = Boolean(data.needName);
    throw err;
  }
  return {
    comment: data.comment,
    comments_count: Number(data.comments_count || 0),
  };
}

export async function toggleBlogCommentLike(
  commentId: number,
  currentUser: AppUser | null,
  guestName?: string
): Promise<{ liked: boolean; likes_count: number }> {
  const res = await fetch(`/api/blog/comments/${commentId}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildActorPayload(currentUser, guestName)),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    const err = new Error(data.error || 'Не удалось оценить комментарий') as Error & { needName?: boolean };
    err.needName = Boolean(data.needName);
    throw err;
  }
  return { liked: Boolean(data.liked), likes_count: Number(data.likes_count || 0) };
}

export async function adminFetchBlogPosts(): Promise<BlogPostDto[]> {
  const res = await fetch('/api/admin/blog/posts');
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Ошибка загрузки постов');
  return data.posts || [];
}

export async function adminCreateBlogPost(payload: Partial<BlogPostDto>): Promise<BlogPostDto> {
  const res = await fetch('/api/admin/blog/posts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Ошибка создания поста');
  return data.post;
}

export async function adminUpdateBlogPost(id: number, payload: Partial<BlogPostDto>): Promise<BlogPostDto> {
  const res = await fetch(`/api/admin/blog/posts/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Ошибка обновления поста');
  return data.post;
}

export async function adminDeleteBlogPost(id: number): Promise<void> {
  const res = await fetch(`/api/admin/blog/posts/${id}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Ошибка удаления поста');
}

export async function adminDeleteBlogComment(commentId: number): Promise<void> {
  const res = await fetch(`/api/admin/blog/comments/${commentId}`, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Ошибка удаления комментария');
}

export async function adminFetchBlogImages(): Promise<{ blogFolderId: number | null; images: BlogImageFileDto[] }> {
  const res = await fetch('/api/admin/blog/images');
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.error || 'Ошибка загрузки галереи');
  return { blogFolderId: data.blogFolderId ?? null, images: data.images || [] };
}

export async function adminGenerateBlogImage16x9(prompt: string, name?: string): Promise<BlogImageFileDto> {
  const res = await fetch('/api/admin/blog/generate-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, name }),
  });
  const data = await res.json();
  if (!res.ok || !data.success || !data.file) {
    throw new Error(data.error || 'Не удалось сгенерировать 16:9 изображение');
  }
  return data.file;
}

export interface SavRssSyncStatusDto {
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

export async function adminSyncSavRss(options?: {
  limit?: number;
  category?: string;
}): Promise<SavRssSyncStatusDto> {
  const res = await fetch('/api/admin/blog/sync-rss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось синхронизировать RSS-ленту SAV AI');
  }
  return data as SavRssSyncStatusDto;
}

export async function adminFetchRssStatus(): Promise<SavRssSyncStatusDto | null> {
  const res = await fetch('/api/admin/blog/rss-status');
  const data = await res.json();
  if (!res.ok || !data.success) return null;
  return (data.status as SavRssSyncStatusDto) || null;
}

export async function adminToggleBlogPostPin(
  id: number,
  pinned?: boolean
): Promise<{ post: BlogPostDto; pinnedCount: number; maxPinned: number }> {
  const res = await fetch(`/api/admin/blog/posts/${id}/pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pinned === undefined ? {} : { pinned }),
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || 'Не удалось изменить статус закрепления');
  }
  return {
    post: data.post as BlogPostDto,
    pinnedCount: Number(data.pinnedCount ?? 0),
    maxPinned: Number(data.maxPinned ?? 10),
  };
}
