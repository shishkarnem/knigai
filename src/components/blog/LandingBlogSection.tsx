import React, { useEffect, useState } from 'react';
import { ArrowRight, BookOpen, Eye, Heart, MessageSquare, Pin, Share2, Newspaper } from 'lucide-react';
import { BlogPostDto, fetchBlogPosts } from '../../services/blog/blogApi';
import { estimateReadMinutes } from './MarkdownRendererNoir';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import { NoirButton } from '../common/NoirButton';
import { AppUser } from '../../types';

interface LandingBlogSectionProps {
  currentUser: AppUser | null;
  onOpenBlogIndex: () => void;
  onOpenBlogPost: (slug: string) => void;
}

export const LandingBlogSection: React.FC<LandingBlogSectionProps> = ({
  currentUser,
  onOpenBlogIndex,
  onOpenBlogPost,
}) => {
  const [posts, setPosts] = useState<BlogPostDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchBlogPosts({ currentUser, limit: 3 })
      .then((list) => {
        if (active) setPosts(list.slice(0, 3));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentUser?.uid]);

  if (!loading && posts.length === 0) {
    return null;
  }

  return (
    <section
      id="landing-blog-section"
      className="w-full px-[2%] sm:px-[5%] relative z-20 flex flex-col gap-6"
    >
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b-2 border-white/25 pb-4">
        <div className="flex flex-col gap-2">
          <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-bold">
            <Newspaper className="w-4 h-4" />
            <span>Журнал и база знаний KnigAI</span>
          </div>
          <RubikMarkerHeading
            as="h2"
            text="Блог фабрики книг: идеи, руководства и кейсы"
            className="text-[24px] sm:text-[34px] leading-tight"
          />
        </div>

        <NoirButton
          type="button"
          variant="outline"
          onClick={onOpenBlogIndex}
          icon={<ArrowRight className="w-4 h-4 text-rose-500" />}
          className="self-start md:self-auto"
        >
          Все статьи блога (/blog)
        </NoirButton>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((idx) => (
            <div
              key={idx}
              className="h-80 bg-zinc-950/60 border border-zinc-800 animate-pulse rounded-none"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {posts.map((post, idx) => (
            <article
              key={post.id}
              onClick={() => onOpenBlogPost(post.slug)}
              className={`group cursor-pointer flex flex-col justify-between bg-zinc-950/75 border transition-all rounded-none overflow-hidden ${
                idx === 0
                  ? 'border-rose-500/70 hover:border-white'
                  : 'border-zinc-800 hover:border-rose-500'
              }`}
            >
              <div>
                <div className="relative w-full aspect-video overflow-hidden bg-black border-b border-zinc-800">
                  {post.cover_video_url ? (
                    <video
                      src={post.cover_video_url}
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="auto"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : post.cover_image_url ? (
                    <img
                      src={post.cover_image_url}
                      alt={post.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-600">
                      <BookOpen className="w-10 h-10 text-rose-500/60" />
                    </div>
                  )}
                </div>

                <div className="p-4 sm:p-5 flex flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2 text-[14px] text-zinc-400 font-mono">
                    {post.is_pinned && (
                      <>
                        <span className="text-rose-400 font-bold inline-flex items-center gap-1">
                          <Pin className="w-3.5 h-3.5 text-rose-500" />
                          <span>Закреплено</span>
                        </span>
                        <span className="text-zinc-600">·</span>
                      </>
                    )}
                    <span>
                      {estimateReadMinutes(
                        post.content_markdown,
                        post.content_length,
                        post.read_time_minutes
                      )}{' '}
                      мин чтения
                    </span>
                    {post.tags?.[0] && (
                      <>
                        <span className="text-zinc-600">·</span>
                        <span className="text-rose-400">{post.tags[0]}</span>
                      </>
                    )}
                  </div>

                  <h3 className="text-[18px] sm:text-[19px] font-bold text-white leading-snug group-hover:text-rose-400 transition-colors break-words">
                    {post.title}
                  </h3>

                  <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed line-clamp-3 font-['PT_Serif',serif]">
                    {post.excerpt || post.subtitle}
                  </p>
                </div>
              </div>

              <div className="px-4 sm:px-5 py-3 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[14px] text-zinc-400 font-mono">
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-zinc-500" />
                    {post.views_count || 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="w-3.5 h-3.5 text-rose-500" />
                    {post.likes_count || 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                    {post.comments_count || 0}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Share2 className="w-3.5 h-3.5 text-zinc-400" />
                    {post.shares_count || 0}
                  </span>
                </div>

                <span className="text-rose-400 group-hover:text-white inline-flex items-center gap-1 font-sans font-bold">
                  <span>Читать</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
