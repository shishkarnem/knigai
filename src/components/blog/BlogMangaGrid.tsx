import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Eye, Heart, MessageSquare, Pin } from 'lucide-react';
import { BlogPostDto } from '../../services/blog/blogApi';
import { estimateReadMinutes } from './MarkdownRendererNoir';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import { SlantedScrollContainer } from '../landing/SlantedScrollContainer';

interface BlogMangaCardProps {
  post: BlogPostDto;
  index: number;
  accent: 'rose' | 'white';
  onOpen: (slug: string) => void;
  style?: React.CSSProperties;
  className?: string;
}

const BlogMangaCard: React.FC<BlogMangaCardProps> = ({
  post,
  index,
  accent,
  onOpen,
  style,
  className = '',
}) => {
  const isLeft = index % 2 === 0;
  const rowIdx = Math.floor(index / 2);
  const isRowEven = rowIdx % 2 === 0;

  // Identical parallel diagonal border geometry to AnimeMangaCard on the Landing Page
  const clipPath = isLeft
    ? isRowEven
      ? 'polygon(0% 0%, 94% 0%, 100% 100%, 0% 100%)'
      : 'polygon(0% 0%, 100% 0%, 94% 100%, 0% 100%)'
    : isRowEven
    ? 'polygon(0% 0%, 100% 0%, 100% 100%, 6% 100%)'
    : 'polygon(6% 0%, 100% 0%, 100% 100%, 0% 100%)';

  const svgPolygonPoints = isLeft
    ? isRowEven
      ? '0,0 94,0 100,100 0,100'
      : '0,0 100,0 94,100 0,100'
    : isRowEven
    ? '0,0 100,0 100,100 6,100'
    : '6,0 100,0 100,100 0,100';

  const isRose = accent === 'rose';

  // Sloped Padding System matching AnimeMangaCard so diagonal borders never clip content
  let rowPadHeader = 'px-2 sm:px-5';
  let rowPadMedia = 'px-2 sm:px-5';
  let rowPadTitle = 'px-2 sm:px-5';
  let rowPadDesc = 'px-2 sm:px-5';
  let rowPadFooter = 'px-2 sm:px-5';

  if (isLeft) {
    if (isRowEven) {
      rowPadHeader = 'pl-2 sm:pl-5 pr-4 sm:pr-12';
      rowPadMedia = 'pl-2 sm:pl-5 pr-4 sm:pr-10';
      rowPadTitle = 'pl-2 sm:pl-5 pr-3.5 sm:pr-9';
      rowPadDesc = 'pl-2 sm:pl-5 pr-2.5 sm:pr-7';
      rowPadFooter = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
    } else {
      rowPadHeader = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
      rowPadMedia = 'pl-2 sm:pl-5 pr-3 sm:pr-8';
      rowPadTitle = 'pl-2 sm:pl-5 pr-2.5 sm:pr-7';
      rowPadDesc = 'pl-2 sm:pl-5 pr-3.5 sm:pr-10';
      rowPadFooter = 'pl-2 sm:pl-5 pr-4 sm:pr-14';
    }
  } else {
    if (isRowEven) {
      rowPadHeader = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
      rowPadMedia = 'pl-3 sm:pl-8 pr-2 sm:pr-5';
      rowPadTitle = 'pl-3 sm:pl-7 pr-2 sm:pr-5';
      rowPadDesc = 'pl-3.5 sm:pl-10 pr-2 sm:pr-5';
      rowPadFooter = 'pl-4 sm:pl-14 pr-2 sm:pr-5';
    } else {
      rowPadHeader = 'pl-4 sm:pl-12 pr-2 sm:pr-5';
      rowPadMedia = 'pl-4 sm:pl-10 pr-2 sm:pr-5';
      rowPadTitle = 'pl-3.5 sm:pl-9 pr-2 sm:pr-5';
      rowPadDesc = 'pl-2.5 sm:pl-7 pr-2 sm:pr-5';
      rowPadFooter = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
    }
  }

  const readMins = estimateReadMinutes(
    post.content_markdown,
    post.content_length,
    post.read_time_minutes
  );
  const badgeText = post.tags?.[0] || 'Статья KnigAI';
  const indexLabel = `#${String(index + 1).padStart(2, '0')}`;

  return (
    <article
      style={{
        filter: 'none',
        ...style,
      }}
      className={`relative will-change-transform ${className}`}
    >
      <div
        onClick={() => onOpen(post.slug)}
        style={{ clipPath }}
        className="group relative w-full bg-black/25 hover:bg-black/45 pt-3.5 pb-3 sm:pt-5 sm:pb-4 transition-all duration-300 cursor-pointer hover:scale-[1.01] flex flex-col justify-between gap-2.5 sm:gap-3.5 overflow-hidden rounded-none min-h-[340px] sm:min-h-[370px]"
      >
        {/* Solid crisp SVG slanted border & highlighted dividing edge */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <polygon
            points={svgPolygonPoints}
            fill="none"
            stroke={isRose ? 'rgba(239, 68, 68, 0.75)' : 'rgba(255, 255, 255, 0.5)'}
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />
          {isLeft ? (
            <line
              x1={isRowEven ? 94 : 100}
              y1={0}
              x2={isRowEven ? 100 : 94}
              y2={100}
              stroke={isRose ? '#ef4444' : '#ffffff'}
              strokeWidth="2.8"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <line
              x1={isRowEven ? 0 : 6}
              y1={0}
              x2={isRowEven ? 6 : 0}
              y2={100}
              stroke={isRose ? '#ef4444' : '#ffffff'}
              strokeWidth="2.8"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* 1. Badge & Panel Number */}
        <div className={`relative z-10 flex items-center justify-between gap-1.5 sm:gap-2 w-full ${rowPadHeader}`}>
          <div className="flex items-center gap-1.5 min-w-0">
            <BookOpen className={`w-4 h-4 shrink-0 ${isRose ? 'text-rose-500' : 'text-white'}`} />
            <span
              className={`text-[14px] font-mono px-2 py-0.5 border truncate ${
                isRose
                  ? 'bg-transparent border-rose-500 text-rose-300'
                  : 'bg-transparent border-zinc-700 text-zinc-300'
              }`}
            >
              {badgeText}
            </span>
          </div>

          <span className="font-mono text-[14px] text-zinc-400 font-bold group-hover:text-white transition-colors shrink-0 inline-flex items-center gap-1.5">
            {post.is_pinned && <Pin className="w-3.5 h-3.5 text-rose-500" />}
            <span>{indexLabel}</span>
          </span>
        </div>

        {/* 2. 16:9 Cover Artwork (video cover plays inline without poster) */}
        <div className={`relative z-10 w-full ${rowPadMedia}`}>
          <div className="w-full aspect-video bg-black/70 border border-zinc-800/90 overflow-hidden rounded-none">
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
                <BookOpen className="w-9 h-9 text-rose-500/70" />
              </div>
            )}
          </div>
        </div>

        {/* 3. Rubik Marker Hatch Title */}
        <div className={`relative z-10 w-full ${rowPadTitle}`}>
          <RubikMarkerHeading
            as="h2"
            text={post.title}
            className="text-[15px] sm:text-[19px] leading-tight transition-colors group-hover:text-rose-400"
          />
        </div>

        {/* 4. Excerpt in PT Serif */}
        <div className={`relative z-10 flex-1 w-full ${rowPadDesc}`}>
          <p className="text-[14px] text-zinc-300 leading-snug sm:leading-relaxed font-['PT_Serif',serif] line-clamp-3 sm:line-clamp-3">
            {post.excerpt || post.subtitle}
          </p>
        </div>

        {/* 5. Footer Metrics & CTA */}
        <div className={`relative z-10 pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[14px] w-full ${rowPadFooter}`}>
          <div className="flex items-center gap-2.5 font-mono text-zinc-400">
            <span>{readMins} мин</span>
            <span className="inline-flex items-center gap-1 hidden sm:inline-flex">
              <Eye className="w-3.5 h-3.5" /> {post.views_count || 0}
            </span>
            <span className="inline-flex items-center gap-1">
              <Heart className="w-3.5 h-3.5 text-rose-500" /> {post.likes_count || 0}
            </span>
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" /> {post.comments_count || 0}
            </span>
          </div>

          <span className="text-rose-400 group-hover:text-white font-bold inline-flex items-center gap-1 transition-colors">
            <span>Открыть</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </span>
        </div>
      </div>
    </article>
  );
};

interface BlogMangaRowPairProps {
  leftPost: BlogPostDto;
  rightPost: BlogPostDto;
  leftIndex: number;
  rightIndex: number;
  pairIdx: number;
  onOpenPost: (slug: string) => void;
}

const ROW_LAYOUT_CYCLES = [
  {
    leftWidth: 'w-[58%] sm:w-[57%]',
    rightWidth: 'w-[41%] sm:w-[41%] mt-3 sm:mt-10',
    leftAccent: 'rose' as const,
    rightAccent: 'white' as const,
  },
  {
    leftWidth: 'w-[41%] sm:w-[41%] mt-3 sm:mt-12',
    rightWidth: 'w-[58%] sm:w-[57%]',
    leftAccent: 'white' as const,
    rightAccent: 'rose' as const,
  },
  {
    leftWidth: 'w-[56%] sm:w-[54%]',
    rightWidth: 'w-[43%] sm:w-[44%] mt-3 sm:mt-9',
    leftAccent: 'white' as const,
    rightAccent: 'white' as const,
  },
  {
    leftWidth: 'w-[43%] sm:w-[43%] mt-3 sm:mt-10',
    rightWidth: 'w-[56%] sm:w-[55%]',
    leftAccent: 'rose' as const,
    rightAccent: 'white' as const,
  },
];

export const BlogMangaRowPair: React.FC<BlogMangaRowPairProps> = ({
  leftPost,
  rightPost,
  leftIndex,
  rightIndex,
  pairIdx,
  onOpenPost,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(false);
  const [physics, setPhysics] = useState({
    leftTransform: 'translateX(-48px) translateY(-28px) rotate(-1.5deg)',
    leftOpacity: 0,
    rightTransform: 'translateX(48px) translateY(-28px) rotate(1.5deg)',
    rightOpacity: 0,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setRevealed(true), 60 + (pairIdx % 2) * 90);
    return () => window.clearTimeout(t);
  }, [pairIdx]);

  useEffect(() => {
    let ticking = false;

    const updatePhysics = () => {
      if (!rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const winH = window.innerHeight || 800;
      const isMobile = window.innerWidth < 768;

      const progress = Math.max(0, (winH * 0.96 - rect.top) / (winH * 0.56));

      const tLeft = Math.min(1, Math.max(0, progress / 0.28));
      const slideLeftDist = isMobile ? 28 : 110;
      const fallDist = isMobile ? 28 : 65;
      const rotDist = isMobile ? 1.5 : 3.5;
      const entryFallLeft = -fallDist * (1 - tLeft);
      const entrySlideLeft = -slideLeftDist * (1 - tLeft);
      const entryRotLeft = -rotDist * (1 - tLeft);
      const leftOpacity = revealed ? Math.min(1, Math.max(0.15, tLeft * 1.6)) : 0;

      const tRight = Math.min(1, Math.max(0, (progress - 0.1) / 0.28));
      const slideRightDist = isMobile ? 32 : 110;
      const entryFallRight = -fallDist * (1 - tRight);
      const entrySlideRight = slideRightDist * (1 - tRight);
      const entryRotRight = rotDist * (1 - tRight);
      const rightOpacity = revealed ? Math.min(1, Math.max(0.15, tRight * 1.6)) : 0;

      let shiftLeftX = 0;
      let shiftLeftY = 0;
      let shiftRightX = 0;
      let shiftRightY = 0;

      if (progress > 0.45) {
        const post = progress - 0.45;
        if (isMobile) {
          shiftLeftY = Math.min(12, post * 8);
          shiftRightY = Math.min(16, post * 10);
        } else {
          shiftLeftX = Math.min(22, post * 18);
          shiftLeftY = post * 8;
          shiftRightX = Math.min(36, post * 28);
          shiftRightY = post * 12;
        }
      }

      setPhysics({
        leftTransform: `translateX(${entrySlideLeft + shiftLeftX}px) translateY(${entryFallLeft + shiftLeftY}px) rotate(${entryRotLeft}deg)`,
        leftOpacity,
        rightTransform: `translateX(${entrySlideRight + shiftRightX}px) translateY(${entryFallRight + shiftRightY}px) rotate(${entryRotRight}deg)`,
        rightOpacity,
      });

      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(updatePhysics);
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    updatePhysics();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [revealed]);

  const layout = ROW_LAYOUT_CYCLES[pairIdx % ROW_LAYOUT_CYCLES.length];

  return (
    <div ref={rowRef} className="flex flex-row items-start gap-1 sm:gap-6 w-full relative">
      <BlogMangaCard
        post={leftPost}
        index={leftIndex}
        accent={layout.leftAccent}
        onOpen={onOpenPost}
        className={layout.leftWidth}
        style={{
          transform: physics.leftTransform,
          opacity: physics.leftOpacity,
          transition: 'transform 0.25s ease-out, opacity 0.35s ease-out',
        }}
      />
      <BlogMangaCard
        post={rightPost}
        index={rightIndex}
        accent={layout.rightAccent}
        onOpen={onOpenPost}
        className={layout.rightWidth}
        style={{
          transform: physics.rightTransform,
          opacity: physics.rightOpacity,
          transition: 'transform 0.25s ease-out, opacity 0.35s ease-out',
        }}
      />
    </div>
  );
};

export const BlogMangaSoloCard: React.FC<{
  post: BlogPostDto;
  index: number;
  onOpenPost: (slug: string) => void;
}> = ({ post, index, onOpenPost }) => {
  const readMins = estimateReadMinutes(
    post.content_markdown,
    post.content_length,
    post.read_time_minutes
  );

  return (
    <div onClick={() => onOpenPost(post.slug)} className="cursor-pointer group">
      <SlantedScrollContainer variant="slant-left" slideDirection="left">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
          <div className="lg:col-span-5 aspect-video bg-black/70 border border-zinc-800 overflow-hidden rounded-none">
            {post.cover_video_url ? (
              <video
                src={post.cover_video_url}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : post.cover_image_url ? (
              <img
                src={post.cover_image_url}
                alt={post.title}
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <BookOpen className="w-10 h-10 text-rose-500/70" />
              </div>
            )}
          </div>

          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2 text-[14px] font-mono text-zinc-400">
              {post.is_pinned && (
                <>
                  <span className="text-rose-400 font-bold inline-flex items-center gap-1">
                    <Pin className="w-3.5 h-3.5 text-rose-500" />
                    <span>Закреплено</span>
                  </span>
                  <span>·</span>
                </>
              )}
              <span className="text-rose-400 font-bold">#{String(index + 1).padStart(2, '0')}</span>
              <span>·</span>
              <span>{post.tags?.[0] || 'Статья KnigAI'}</span>
              <span>·</span>
              <span>{readMins} мин</span>
            </div>

            <RubikMarkerHeading
              as="h2"
              text={post.title}
              className="text-[20px] sm:text-[26px] leading-snug group-hover:text-rose-400 transition-colors"
            />

            <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed line-clamp-3">
              {post.excerpt || post.subtitle}
            </p>

            <div className="pt-2 border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 text-[14px]">
              <div className="flex items-center gap-3 font-mono text-zinc-400">
                <span className="inline-flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5" /> {post.views_count || 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Heart className="w-3.5 h-3.5 text-rose-500" /> {post.likes_count || 0}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5" /> {post.comments_count || 0}
                </span>
              </div>
              <span className="text-rose-400 group-hover:text-white font-bold inline-flex items-center gap-1">
                <span>Открыть статью</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </span>
            </div>
          </div>
        </div>
      </SlantedScrollContainer>
    </div>
  );
};

export const BlogMangaSkeletonPair: React.FC<{ pairIdx?: number }> = ({ pairIdx = 0 }) => {
  const layout = ROW_LAYOUT_CYCLES[pairIdx % ROW_LAYOUT_CYCLES.length];
  return (
    <div className="flex flex-row items-start gap-1 sm:gap-6 w-full relative">
      {[layout.leftWidth, layout.rightWidth].map((widthCls, side) => {
        const isLeft = side === 0;
        const isRowEven = pairIdx % 2 === 0;
        const clipPath = isLeft
          ? isRowEven
            ? 'polygon(0% 0%, 94% 0%, 100% 100%, 0% 100%)'
            : 'polygon(0% 0%, 100% 0%, 94% 100%, 0% 100%)'
          : isRowEven
          ? 'polygon(0% 0%, 100% 0%, 100% 100%, 6% 100%)'
          : 'polygon(6% 0%, 100% 0%, 100% 100%, 0% 100%)';
        return (
          <div
            key={side}
            style={{ clipPath }}
            className={`${widthCls} min-h-[300px] sm:min-h-[340px] border border-zinc-800/80 bg-zinc-950/35 p-4 sm:p-6 flex flex-col justify-between gap-3 animate-pulse rounded-none`}
          >
            <div className="h-5 w-1/3 bg-zinc-800/70" />
            <div className="w-full aspect-video bg-zinc-900/70 border border-zinc-800" />
            <div className="h-6 w-4/5 bg-zinc-800/70" />
            <div className="h-12 w-full bg-zinc-900/60" />
          </div>
        );
      })}
    </div>
  );
};
