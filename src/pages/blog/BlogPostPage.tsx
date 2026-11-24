import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  ExternalLink,
  Eye,
  Sparkles,
  User,
} from 'lucide-react';
import { AppRoute, AppUser } from '../../types';
import {
  BlogCommentDto,
  BlogPostDto,
  fetchBlogPostBySlug,
} from '../../services/blog/blogApi';
import { syncBlogPostSeo } from '../../services/blog/blogSeoClient';
import {
  countMarkdownChars,
  estimateReadMinutes,
  MarkdownRendererNoir,
} from '../../components/blog/MarkdownRendererNoir';
import {
  hasTgButtonsInMarkdown,
  normalizeButtonsRows,
  sanitizeBlogUrl,
} from '../../components/blog/rich/tgBlockParser';
import { TgButtonsBlock } from '../../components/blog/rich/TgRichBlocks';
import { BlogShareBar } from '../../components/blog/BlogShareBar';
import { BlogCommentsSection } from '../../components/blog/BlogCommentsSection';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { NoirButton } from '../../components/common/NoirButton';
import { isUserAdmin } from '../../services/auth/authService';

interface BlogPostPageProps {
  slug: string;
  currentUser: AppUser | null;
  onNavigate: (route: AppRoute) => void;
  onOpenBlogIndex: () => void;
  onOpenPost: (slug: string) => void;
  onOpenAuth: () => void;
}

export const BlogPostPage: React.FC<BlogPostPageProps> = ({
  slug,
  currentUser,
  onNavigate,
  onOpenBlogIndex,
  onOpenPost,
  onOpenAuth,
}) => {
  const [post, setPost] = useState<BlogPostDto | null>(null);
  const [comments, setComments] = useState<BlogCommentDto[]>([]);
  const [related, setRelated] = useState<BlogPostDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMsg('');
    fetchBlogPostBySlug(slug, currentUser, false)
      .then((res) => {
        if (!active) return;
        setPost(res.post);
        setComments(res.comments);
        setRelated(res.related);
        syncBlogPostSeo(res.post);
      })
      .catch((err) => {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Статья не найдена');
        setPost(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [slug, currentUser?.uid]);

  const formatDate = (iso?: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const fallbackButtonRows = useMemo(() => {
    if (!post?.buttons_json || hasTgButtonsInMarkdown(post.content_markdown)) return [];
    try {
      return normalizeButtonsRows(JSON.parse(post.buttons_json));
    } catch {
      return [];
    }
  }, [post?.buttons_json, post?.content_markdown]);

  const safeTelegramUrl = useMemo(
    () => sanitizeBlogUrl(post?.telegram_post_url || '', false),
    [post?.telegram_post_url]
  );

  return (
    <div className="w-full min-h-screen flex flex-col bg-black/95 text-white font-['PT_Serif',serif]">
      <div className="flex-1 w-full max-w-5xl mx-auto px-[3%] sm:px-[4%] py-8 sm:py-12 flex flex-col gap-8">
        {/* Top Breadcrumb Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <NoirButton
              type="button"
              variant="outline"
              onClick={onOpenBlogIndex}
              icon={<ArrowLeft className="w-4 h-4 text-rose-500" />}
            >
              Ко всем статьям блога
            </NoirButton>

            <NoirButton
              type="button"
              variant="subtle"
              onClick={() => onNavigate('landing')}
            >
              На главную
            </NoirButton>
          </div>

          <NoirButton
            type="button"
            variant="primary"
            onClick={() => (currentUser ? onNavigate('constructor') : onOpenAuth())}
            icon={<Sparkles className="w-4 h-4 text-black" />}
          >
            Создать книгу в KnigAI
          </NoirButton>
        </div>

        {loading ? (
          <div className="p-8 bg-zinc-950/75 border border-zinc-800 flex flex-col gap-4 animate-pulse">
            <div className="h-10 w-3/4 bg-zinc-900" />
            <div className="w-full aspect-video bg-zinc-900" />
            <div className="h-40 w-full bg-zinc-900" />
          </div>
        ) : errorMsg || !post ? (
          <div className="p-10 bg-zinc-950/75 border border-rose-500 text-center flex flex-col items-center gap-4">
            <RubikMarkerHeading as="h1" text="Статья не найдена" className="text-[28px]" />
            <p className="text-[15px] text-zinc-300">
              {errorMsg || 'Запрошенная публикация отсутствует или была снята с публикации.'}
            </p>
            <NoirButton type="button" variant="primary" onClick={onOpenBlogIndex}>
              Вернуться в блог
            </NoirButton>
          </div>
        ) : (
          <article className="flex flex-col gap-7">
            {/* Article Header Card (goes directly to content without duplicating cover artwork) */}
            <header className="p-5 sm:p-8 bg-zinc-950/75 border border-white/25 flex flex-col gap-4 rounded-none">
              <div className="flex flex-wrap items-center gap-3 text-[14px] font-mono text-zinc-400">
                <span className="inline-flex items-center gap-1.5 text-zinc-200">
                  <User className="w-4 h-4 text-rose-500" />
                  <span>{post.author_name || 'Редакция KnigAI'}</span>
                  {post.author_role ? (
                    <span className="text-zinc-400">({post.author_role})</span>
                  ) : null}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-rose-500" />
                  {formatDate(post.published_at || post.created_at)}
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-rose-500" />
                  {estimateReadMinutes(
                    post.content_markdown,
                    post.content_length,
                    post.read_time_minutes
                  )}{' '}
                  мин ({countMarkdownChars(post.content_markdown).toLocaleString('ru-RU')} зн.)
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-rose-500" />
                  {post.views_count || 0} просм.
                </span>
              </div>

              <RubikMarkerHeading
                as="h1"
                text={post.title}
                className="text-[26px] sm:text-[38px] leading-[1.2]"
              />

              {post.subtitle && post.subtitle.trim() !== post.title.trim() && (
                <p className="text-[16px] sm:text-[18px] text-zinc-300 leading-relaxed">
                  {post.subtitle}
                </p>
              )}

              {(post.tags?.length > 0 || safeTelegramUrl) && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 font-mono text-[14px]">
                  <div className="flex flex-wrap items-center gap-2">
                    {(post.tags || []).map((tag) => (
                      <span
                        key={tag}
                        className="px-2.5 py-1 bg-black/75 border border-zinc-800 text-rose-400"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>

                  {safeTelegramUrl && (
                    <a
                      href={safeTelegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-black/80 border border-rose-500/70 hover:bg-rose-950/70 text-zinc-200 hover:text-white inline-flex items-center gap-1.5 transition-colors rounded-none"
                    >
                      <span>{post.telegram_channel || 'Оригинал в Telegram'}</span>
                      <ExternalLink className="w-3.5 h-3.5 text-rose-400" />
                    </a>
                  )}
                </div>
              )}
            </header>

            {/* Main Markdown Article Content */}
            <div className="p-5 sm:p-9 bg-zinc-950/70 border border-zinc-800 rounded-none">
              <MarkdownRendererNoir
                markdown={post.content_markdown}
                telegramPostUrl={safeTelegramUrl || undefined}
              />
              {fallbackButtonRows.length > 0 && <TgButtonsBlock rows={fallbackButtonRows} />}
            </div>

            {/* Product CTA Strip inside article */}
            <div className="p-5 sm:p-7 bg-zinc-950/80 border border-rose-500/75 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-none">
              <div className="flex flex-col gap-1.5">
                <span className="text-[16px] sm:text-[18px] font-bold text-white">
                  Попробуйте конструктор книг KnigAI бесплатно
                </span>
                <p className="text-[14px] sm:text-[15px] text-zinc-300">
                  1 000 000 букв при регистрации, бесплатный редактор переплёта А5 и печать от 1 экземпляра.
                </p>
              </div>
              <NoirButton
                type="button"
                variant="primary"
                onClick={() => (currentUser ? onNavigate('constructor') : onOpenAuth())}
                icon={<BookOpen className="w-4 h-4 text-black" />}
                className="shrink-0"
              >
                Начать книгу
              </NoirButton>
            </div>

            {/* Likes, Reposts & Social Card Preview */}
            <BlogShareBar
              post={post}
              currentUser={currentUser}
              onPostUpdated={(upd) => setPost((prev) => (prev ? { ...prev, ...upd } : prev))}
            />

            {/* Comments & Replies Tree */}
            <BlogCommentsSection
              slug={post.slug}
              comments={comments}
              currentUser={currentUser}
              isAdmin={isUserAdmin(currentUser)}
              onCommentsUpdated={(nextComments, totalCount) => {
                setComments(nextComments);
                setPost((prev) => (prev ? { ...prev, comments_count: totalCount } : prev));
              }}
            />

            {/* Related Posts */}
            {related.length > 0 && (
              <section className="pt-6 border-t border-zinc-800 flex flex-col gap-5">
                <RubikMarkerHeading
                  as="h2"
                  text="Читайте также в блоге KnigAI"
                  className="text-[22px] sm:text-[26px]"
                />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {related.map((item) => (
                    <article
                      key={item.id}
                      onClick={() => onOpenPost(item.slug)}
                      className="group cursor-pointer bg-zinc-950/75 border border-zinc-800 hover:border-rose-500 transition-all flex flex-col justify-between rounded-none overflow-hidden"
                    >
                      <div>
                        <div className="w-full aspect-video bg-black border-b border-zinc-800 overflow-hidden">
                          {item.cover_video_url ? (
                            <video
                              src={item.cover_video_url}
                              autoPlay
                              muted
                              loop
                              playsInline
                              preload="auto"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : item.cover_image_url ? (
                            <img
                              src={item.cover_image_url}
                              alt={item.title}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : null}
                        </div>
                        <div className="p-4 flex flex-col gap-2">
                          <h3 className="text-[16px] font-bold text-white group-hover:text-rose-400 transition-colors leading-snug break-words">
                            {item.title}
                          </h3>
                          <p className="text-[14px] text-zinc-400 line-clamp-2">
                            {item.excerpt || item.subtitle}
                          </p>
                        </div>
                      </div>
                      <div className="px-4 py-3 border-t border-zinc-800/70 text-[14px] font-bold text-rose-400 group-hover:text-white inline-flex items-center gap-1">
                        <span>Читать</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </article>
        )}
      </div>

      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
};
