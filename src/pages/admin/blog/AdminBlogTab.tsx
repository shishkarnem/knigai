import React, { useEffect, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  ExternalLink,
  Eye,
  Heart,
  MessageSquare,
  Share2,
  RefreshCw,
  Newspaper,
  Rss,
  Loader2,
  Pin,
  PinOff,
} from 'lucide-react';
import {
  BlogPostDto,
  SavRssSyncStatusDto,
  adminDeleteBlogPost,
  adminFetchBlogPosts,
  adminFetchRssStatus,
  adminSyncSavRss,
  adminToggleBlogPostPin,
} from '../../../services/blog/blogApi';
import { countMarkdownChars } from '../../../components/blog/MarkdownRendererNoir';
import { NoirButton } from '../../../components/common/NoirButton';
import { AdminBlogPostEditor } from './AdminBlogPostEditor';

interface AdminBlogTabProps {
  onOpenPublicPost?: (slug: string) => void;
}

export const AdminBlogTab: React.FC<AdminBlogTabProps> = ({ onOpenPublicPost }) => {
  const [posts, setPosts] = useState<BlogPostDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPost, setEditingPost] = useState<BlogPostDto | null | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [syncingRss, setSyncingRss] = useState(false);
  const [rssStatus, setRssStatus] = useState<SavRssSyncStatusDto | null>(null);
  const [pinningId, setPinningId] = useState<number | null>(null);

  const pinnedCount = posts.filter((p) => Boolean(p.is_pinned)).length;

  const sortAdminPosts = (list: BlogPostDto[]): BlogPostDto[] =>
    [...list].sort((a, b) => {
      const pa = a.is_pinned ? 1 : 0;
      const pb = b.is_pinned ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (pa && pb) {
        const ta = a.pinned_at ? new Date(a.pinned_at).getTime() : 0;
        const tb = b.pinned_at ? new Date(b.pinned_at).getTime() : 0;
        if (ta !== tb) return tb - ta;
      }
      const da = new Date(a.published_at || a.created_at || 0).getTime();
      const db = new Date(b.published_at || b.created_at || 0).getTime();
      return db - da || Number(b.id) - Number(a.id);
    });

  const loadPosts = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const [list, status] = await Promise.all([adminFetchBlogPosts(), adminFetchRssStatus()]);
      setPosts(sortAdminPosts(list));
      if (status) setRssStatus(status);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки постов блога');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPosts();
  }, []);

  const handleSyncRss = async () => {
    setSyncingRss(true);
    setErrorMsg('');
    try {
      const result = await adminSyncSavRss({ limit: 100 });
      setRssStatus(result);
      const refreshed = await adminFetchBlogPosts();
      setPosts(sortAdminPosts(refreshed));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка синхронизации RSS SAV AI');
    } finally {
      setSyncingRss(false);
    }
  };

  const handleTogglePin = async (post: BlogPostDto) => {
    const nextPinned = !Boolean(post.is_pinned);
    if (nextPinned && pinnedCount >= 10) {
      setErrorMsg('Можно закрепить не более 10 постов. Сначала открепите один из закреплённых постов.');
      return;
    }
    setPinningId(post.id);
    setErrorMsg('');
    try {
      const res = await adminToggleBlogPostPin(post.id, nextPinned);
      setPosts((prev) =>
        sortAdminPosts(prev.map((item) => (Number(item.id) === Number(post.id) ? res.post : item)))
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось изменить закрепление поста');
    } finally {
      setPinningId(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await adminDeleteBlogPost(id);
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setConfirmDeleteId(null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось удалить пост');
    }
  };

  if (editingPost !== undefined) {
    return (
      <AdminBlogPostEditor
        initialPost={editingPost}
        onCancel={() => setEditingPost(undefined)}
        onSaved={(saved) => {
          setPosts((prev) => {
            const exists = prev.some((p) => Number(p.id) === Number(saved.id));
            if (exists) {
              return prev.map((p) => (Number(p.id) === Number(saved.id) ? saved : p));
            }
            return [saved, ...prev];
          });
          setEditingPost(undefined);
        }}
      />
    );
  }

  const filtered = posts.filter((p) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.title.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q) ||
      (p.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-5 text-white">
      <div className="noir-container p-4 sm:p-5 border border-zinc-700 bg-zinc-950/75 flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-none">
        <div className="flex items-start gap-3">
          <Newspaper className="w-6 h-6 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-[18px] font-bold text-white">
              Управление блогом и SEO-статьями (/blog)
            </h3>
            <p className="text-[14px] text-zinc-400">
              Всего статей в базе PostgreSQL: <strong className="text-white">{posts.length}</strong> · Закреплено в топе:{' '}
              <strong className={pinnedCount >= 10 ? 'text-rose-400' : 'text-white'}>
                {pinnedCount} / 10
              </strong>
              . Все посты индексируются в sitemap.xml, rss.xml и llms.txt.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NoirButton
            type="button"
            variant="outline"
            showTail={false}
            disabled={syncingRss}
            icon={
              syncingRss ? (
                <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
              ) : (
                <Rss className="w-4 h-4 text-rose-500" />
              )
            }
            onClick={handleSyncRss}
          >
            {syncingRss ? 'Синхронизация RSS...' : 'Импорт RSS (SAV AI)'}
          </NoirButton>
          <NoirButton
            type="button"
            variant="subtle"
            showTail={false}
            icon={<RefreshCw className="w-4 h-4" />}
            onClick={loadPosts}
          >
            Обновить
          </NoirButton>
          <NoirButton
            type="button"
            variant="primary"
            showTail={false}
            icon={<Plus className="w-4 h-4 text-black" />}
            onClick={() => setEditingPost(null)}
          >
            Создать пост
          </NoirButton>
        </div>
      </div>

      {rssStatus && (
        <div className="p-3.5 border border-zinc-800 bg-black/70 text-[14px] flex flex-wrap items-center justify-between gap-2 rounded-none">
          <div className="flex flex-wrap items-center gap-2 text-zinc-300">
            <Rss className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              Последний импорт SAV AI ({rssStatus.sourceDomain || 'не задан'}): в ленте {rssStatus.totalInFeed},{' '}
              добавлено <strong className="text-white">{rssStatus.added}</strong>, обновлено{' '}
              <strong className="text-white">{rssStatus.updated}</strong>, пропущено {rssStatus.skipped}.
            </span>
          </div>
          <span className="font-mono text-[14px] text-zinc-400">
            {new Date(rssStatus.syncedAt).toLocaleString('ru-RU')}
          </span>
        </div>
      )}

      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Фильтр по названию, slug или тегу..."
        className="noir-input w-full sm:max-w-md px-3.5 py-2.5 text-[14px] rounded-none"
      />

      {errorMsg && (
        <div className="p-3 border border-rose-500 bg-rose-950/50 text-rose-200 text-[14px]">
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-[14px] text-zinc-400">
          Загрузка публикаций...
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-8 border border-zinc-800 bg-zinc-950/60 text-center text-[14px] text-zinc-400">
          Статьи не найдены. Нажмите «Создать пост», чтобы добавить новую публикацию.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((post) => (
            <div
              key={post.id}
              className={`p-4 bg-zinc-950/75 border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 rounded-none ${
                post.is_pinned
                  ? 'border-rose-500/80 hover:border-rose-400'
                  : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start gap-4 flex-1 min-w-0">
                {(post.cover_video_url || post.cover_image_url) && (
                  <div className="w-full sm:w-44 aspect-video bg-black border border-zinc-800 shrink-0 overflow-hidden">
                    {post.cover_video_url ? (
                      <video
                        src={post.cover_video_url}
                        autoPlay
                        muted
                        loop
                        playsInline
                        preload="auto"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={post.cover_image_url}
                        alt={post.title}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] font-mono">
                    {post.is_pinned && (
                      <span className="px-2 py-0.5 bg-rose-950/80 border border-rose-500 text-rose-200 inline-flex items-center gap-1 font-bold">
                        <Pin className="w-3.5 h-3.5 text-rose-400" />
                        <span>Закреплён</span>
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 border ${
                        post.status === 'published'
                          ? 'border-white/50 text-white'
                          : 'border-rose-500/70 text-rose-300'
                      }`}
                    >
                      {post.status === 'published' ? 'Опубликован' : 'Черновик'}
                    </span>
                    <span className="text-zinc-400">
                      {countMarkdownChars(post.content_markdown).toLocaleString('ru-RU')} знаков
                    </span>
                  </div>

                  <h4 className="text-[16px] font-bold text-white break-words leading-snug">
                    {post.title}
                  </h4>

                  <div className="text-[14px] font-mono text-zinc-400 break-all">
                    /blog/{post.slug}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[14px] font-mono text-zinc-400 pt-1">
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> {post.views_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Heart className="w-3.5 h-3.5 text-rose-500" /> {post.likes_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="w-3.5 h-3.5" /> {post.comments_count || 0}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Share2 className="w-3.5 h-3.5" /> {post.shares_count || 0}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={pinningId === post.id || (!post.is_pinned && pinnedCount >= 10)}
                  onClick={() => handleTogglePin(post)}
                  title={
                    post.is_pinned
                      ? 'Открепить пост'
                      : pinnedCount >= 10
                      ? 'Достигнут лимит в 10 закреплённых постов'
                      : 'Закрепить пост в начале блога'
                  }
                  className={`min-h-[40px] px-3 py-1.5 border text-[14px] inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                    post.is_pinned
                      ? 'border-rose-500 bg-rose-950/75 text-white hover:bg-black'
                      : pinnedCount >= 10
                      ? 'border-zinc-800 bg-black/50 text-zinc-500 cursor-not-allowed'
                      : 'border-zinc-700 hover:border-rose-500 bg-black text-zinc-200 hover:text-white'
                  }`}
                >
                  {pinningId === post.id ? (
                    <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                  ) : post.is_pinned ? (
                    <PinOff className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Pin className="w-4 h-4 text-rose-500" />
                  )}
                  <span>{post.is_pinned ? 'Открепить' : 'Закрепить'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onOpenPublicPost) {
                      onOpenPublicPost(post.slug);
                    } else {
                      window.location.href = `/blog/${encodeURIComponent(post.slug)}`;
                    }
                  }}
                  className="min-h-[40px] px-3 py-1.5 border border-zinc-700 hover:border-white bg-black text-zinc-200 text-[14px] inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <ExternalLink className="w-4 h-4 text-rose-500" />
                  <span>Открыть</span>
                </button>

                <button
                  type="button"
                  onClick={() => setEditingPost(post)}
                  className="min-h-[40px] px-3 py-1.5 border border-white/60 hover:bg-white hover:text-black bg-black text-white font-bold text-[14px] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <Edit3 className="w-4 h-4" />
                  <span>Изменить</span>
                </button>

                {confirmDeleteId === post.id ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDelete(post.id)}
                      className="min-h-[40px] px-3 py-1.5 bg-rose-900 border border-rose-500 text-white text-[14px] font-bold cursor-pointer"
                    >
                      Удалить точно
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="min-h-[40px] px-3 py-1.5 bg-zinc-900 border border-zinc-700 text-zinc-300 text-[14px] cursor-pointer"
                    >
                      Отмена
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(post.id)}
                    className="min-h-[40px] px-3 py-1.5 border border-zinc-700 hover:border-rose-500 bg-black text-zinc-300 hover:text-rose-300 text-[14px] inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
