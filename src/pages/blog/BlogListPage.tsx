import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Search,
  Newspaper,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { AppRoute, AppUser } from '../../types';
import {
  BlogPostDto,
  BlogTagCountDto,
  fetchBlogPostsPage,
} from '../../services/blog/blogApi';
import { syncBlogIndexSeo } from '../../services/blog/blogSeoClient';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { SlantedScrollContainer } from '../../components/landing/SlantedScrollContainer';
import { NeuroBook } from '../../components/landing/NeuroBook';
import {
  BlogMangaRowPair,
  BlogMangaSkeletonPair,
  BlogMangaSoloCard,
} from '../../components/blog/BlogMangaGrid';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { NoirButton } from '../../components/common/NoirButton';

interface BlogListPageProps {
  currentUser: AppUser | null;
  onNavigate: (route: AppRoute) => void;
  onOpenPost: (slug: string) => void;
}

const INITIAL_BATCH_SIZE = 10;
const STREAM_BATCH_SIZE = 10;

export const BlogListPage: React.FC<BlogListPageProps> = ({
  currentUser,
  onNavigate,
  onOpenPost,
}) => {
  const [posts, setPosts] = useState<BlogPostDto[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [allTags, setAllTags] = useState<BlogTagCountDto[]>([]);
  const [loadingInitial, setLoadingInitial] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [searchInput, setSearchInput] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const queryIdRef = useRef<number>(0);
  const isFetchingRef = useRef<boolean>(false);

  useEffect(() => {
    syncBlogIndexSeo();
  }, []);

  // Debounce search query so PostgreSQL is queried smoothly without flicker
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 280);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Initial fast lightweight batch (no hardcoded articles; strict truth from PostgreSQL)
  useEffect(() => {
    const currentQueryId = ++queryIdRef.current;
    isFetchingRef.current = true;
    setLoadingInitial(true);
    setErrorMsg('');

    fetchBlogPostsPage({
      currentUser,
      search: debouncedSearch || undefined,
      tag: selectedTag || undefined,
      limit: INITIAL_BATCH_SIZE,
      offset: 0,
      summary: true,
    })
      .then((res) => {
        if (queryIdRef.current !== currentQueryId) return;
        setPosts(res.posts);
        setTotalCount(res.total);
        setHasMore(res.hasMore);
        if (res.allTags.length > 0) {
          setAllTags((prev) =>
            (!debouncedSearch && !selectedTag) || prev.length === 0 ? res.allTags : prev
          );
        }
      })
      .catch((err) => {
        if (queryIdRef.current !== currentQueryId) return;
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки статей');
      })
      .finally(() => {
        if (queryIdRef.current === currentQueryId) {
          isFetchingRef.current = false;
          setLoadingInitial(false);
        }
      });
  }, [currentUser?.uid, debouncedSearch, selectedTag]);

  const loadNextBatch = useCallback(async () => {
    if (isFetchingRef.current || !hasMore || loadingInitial) return;
    const activeQueryId = queryIdRef.current;
    isFetchingRef.current = true;
    setLoadingMore(true);

    try {
      const res = await fetchBlogPostsPage({
        currentUser,
        search: debouncedSearch || undefined,
        tag: selectedTag || undefined,
        limit: STREAM_BATCH_SIZE,
        offset: posts.length,
        summary: true,
      });
      if (queryIdRef.current !== activeQueryId) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => Number(p.id)));
        const fresh = res.posts.filter((p) => !seen.has(Number(p.id)));
        return [...prev, ...fresh];
      });
      setTotalCount(res.total);
      setHasMore(res.hasMore);
    } catch (err) {
      if (queryIdRef.current === activeQueryId) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка догрузки статей');
      }
    } finally {
      if (queryIdRef.current === activeQueryId) {
        isFetchingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [currentUser, debouncedSearch, selectedTag, posts.length, hasMore, loadingInitial]);

  // Smooth on-scroll lazy batch loading (10 articles per batch from PostgreSQL)
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingInitial && !loadingMore) {
          loadNextBatch();
        }
      },
      { rootMargin: '280px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadingInitial, loadingMore, loadNextBatch]);

  // Group loaded posts into asymmetric 2-panel manga rows matching LandingPage
  const { pairs, trailingSolo } = useMemo(() => {
    const pairList: Array<{ left: BlogPostDto; right: BlogPostDto; leftIdx: number; rightIdx: number; pairIdx: number }> = [];
    for (let i = 0; i + 1 < posts.length; i += 2) {
      pairList.push({
        left: posts[i],
        right: posts[i + 1],
        leftIdx: i,
        rightIdx: i + 1,
        pairIdx: Math.floor(i / 2),
      });
    }
    const solo = posts.length % 2 === 1 ? { post: posts[posts.length - 1], index: posts.length - 1 } : null;
    return { pairs: pairList, trailingSolo: solo };
  }, [posts]);

  return (
    <div className="relative w-full min-h-screen flex flex-col gap-10 sm:gap-14 bg-black text-white pb-0 overflow-hidden font-['PT_Serif',serif]">
      {/* Animated 3D Holographic NeuroBook floating & zigzagging behind manga panels */}
      <NeuroBook />

      <div className="relative z-20 flex-1 w-full flex flex-col gap-10 sm:gap-14 pt-6 sm:pt-10">
        {/* Top Navigation Bar */}
        <div className="w-full px-[2%] sm:px-[5%] flex flex-wrap items-center justify-between gap-3">
          <NoirButton
            type="button"
            variant="outline"
            onClick={() => onNavigate('landing')}
            icon={<ArrowLeft className="w-4 h-4 text-rose-500" />}
          >
            На главную
          </NoirButton>

          <NoirButton
            type="button"
            variant="subtle"
            onClick={() => onNavigate('library')}
            icon={<BookOpen className="w-4 h-4 text-rose-500" />}
          >
            Библиотека книг
          </NoirButton>
        </div>

        {/* Slanted Editorial Hero Banner (matches Manifesto section on LandingPage) */}
        <section className="w-full px-[2%] sm:px-[5%]">
          <SlantedScrollContainer
            variant="slant-left"
            slideDirection="left"
            className="flex flex-col gap-5"
          >
            <div className="flex flex-col gap-3">
              <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-bold">
                <Newspaper className="w-4 h-4" />
                <span>Журнал и база знаний фабрики книг KnigAI</span>
              </div>

              <RubikMarkerHeading
                as="h1"
                text="Блог о создании ИИ-книг, печати А5 и авторском издательстве"
                className="text-[24px] sm:text-[38px] leading-tight"
              />

              <p className="text-[14px] sm:text-[16px] text-zinc-200 leading-relaxed max-w-4xl">
                Практические руководства по работе с каскадной генерацией сюжета до 100 глав, оформлению переплётов формата А5, голосовой диктовке рукописей и печати подарочных книг от 1 экземпляра по всей России.
              </p>
            </div>

            {/* Search & Wrapping Tag Bubble Filter */}
            <div className="flex flex-col gap-3 pt-3 border-t border-white/15">
              <div className="relative w-full sm:max-w-lg">
                <Search className="w-4 h-4 text-rose-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Поиск по темам, жанрам и ключевым запросам..."
                  className="noir-input w-full pl-10 pr-4 py-2.5 text-[14px] rounded-none"
                />
              </div>

              {allTags.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedTag('')}
                    className={`min-h-[38px] px-3.5 py-1.5 border text-[14px] font-bold transition-colors cursor-pointer rounded-none ${
                      selectedTag === ''
                        ? 'bg-white text-black border-white'
                        : 'bg-black/60 text-zinc-300 border-zinc-700 hover:border-white'
                    }`}
                  >
                    Все темы {totalCount > 0 && !selectedTag && !debouncedSearch ? `(${totalCount})` : ''}
                  </button>
                  {allTags.map(({ tag, count }) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
                      className={`min-h-[38px] px-3.5 py-1.5 border text-[14px] transition-colors cursor-pointer rounded-none ${
                        selectedTag === tag
                          ? 'bg-rose-950/80 text-white border-rose-500 font-bold'
                          : 'bg-black/60 text-zinc-300 border-zinc-800 hover:border-rose-500'
                      }`}
                    >
                      {tag} · {count}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </SlantedScrollContainer>
        </section>

        {/* Manga Panels Section (Asymmetric 2-in-a-row slanted grid matching "Готовые сценарии") */}
        <section className="w-full px-[2%] sm:px-[5%] flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 border-b-2 border-white/30 pb-4">
            <RubikMarkerHeading
              as="h2"
              text="Статьи и кейсы KnigAI"
              className="text-[24px] sm:text-[34px] leading-tight"
            />
            <span className="text-[14px] font-mono text-zinc-400">
              {loadingInitial
                ? 'Подключаемся к базе знаний...'
                : `Загружено ${posts.length}${totalCount > 0 ? ` из ${totalCount}` : ''}`}
            </span>
          </div>

          {errorMsg && (
            <div className="p-4 border border-rose-500 bg-rose-950/50 text-rose-200 text-[14px] rounded-none">
              {errorMsg}
            </div>
          )}

          {loadingInitial ? (
            <div className="flex flex-col gap-4 sm:gap-8">
              <BlogMangaSkeletonPair pairIdx={0} />
              <BlogMangaSkeletonPair pairIdx={1} />
            </div>
          ) : posts.length === 0 ? (
            <div className="p-8 bg-black/50 border border-zinc-800 text-center flex flex-col items-center gap-4 rounded-none">
              <p className="text-[16px] text-zinc-300">По выбранному фильтру статей не найдено.</p>
              <NoirButton
                type="button"
                variant="outline"
                onClick={() => {
                  setSearchInput('');
                  setSelectedTag('');
                }}
              >
                Сбросить фильтр
              </NoirButton>
            </div>
          ) : (
            <div className="relative w-full flex flex-col gap-4 sm:gap-10">
              {pairs.map((pair) => (
                <BlogMangaRowPair
                  key={`${pair.left.id}-${pair.right.id}`}
                  leftPost={pair.left}
                  rightPost={pair.right}
                  leftIndex={pair.leftIdx}
                  rightIndex={pair.rightIdx}
                  pairIdx={pair.pairIdx}
                  onOpenPost={onOpenPost}
                />
              ))}

              {trailingSolo && (
                <BlogMangaSoloCard
                  key={trailingSolo.post.id}
                  post={trailingSolo.post}
                  index={trailingSolo.index}
                  onOpenPost={onOpenPost}
                />
              )}

              {loadingMore && <BlogMangaSkeletonPair pairIdx={pairs.length} />}
            </div>
          )}

          {/* Progressive stream sentinel & manual button */}
          <div ref={sentinelRef} className="w-full flex justify-center pt-2">
            {hasMore && !loadingInitial && (
              <NoirButton
                type="button"
                variant="outline"
                onClick={loadNextBatch}
                disabled={loadingMore}
                icon={
                  loadingMore ? (
                    <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />
                  ) : (
                    <Newspaper className="w-4 h-4 text-rose-500" />
                  )
                }
              >
                {loadingMore ? 'Подгружаем следующие 10 статей...' : 'Загрузить ещё 10 статей'}
              </NoirButton>
            )}
          </div>
        </section>

        {/* Bottom Slanted CTA (triggers smooth NeuroBook fade-out right before footer) */}
        <section id="secondary-cta-section" className="w-full px-[2%] sm:px-[5%] relative z-20">
          <SlantedScrollContainer
            variant="slant-right"
            slideDirection="right"
            className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left"
          >
            <div className="flex flex-col gap-3 max-w-xl">
              <RubikMarkerHeading
                as="h2"
                text="Хотите превратить свою идею в настоящую книгу?"
                className="text-[22px] sm:text-[32px] leading-tight"
              />
              <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed">
                Откройте конструктор KnigAI: создайте сюжет до 100 глав, соберите переплёт формата А5 и закажите печать от 1 экземпляра.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full sm:w-auto">
              <NoirButton
                type="button"
                variant="primary"
                onClick={() => onNavigate(currentUser ? 'constructor' : 'library')}
                icon={<Sparkles className="w-4 h-4 text-black" />}
                className="w-full sm:w-auto text-[15px] px-6 py-3.5 font-bold"
              >
                {currentUser ? 'Открыть конструктор' : 'Смотреть библиотеку'}
              </NoirButton>
              <NoirButton
                type="button"
                variant="outline"
                onClick={() => onNavigate('reader')}
                className="w-full sm:w-auto text-[15px] px-5 py-3.5"
              >
                3D-читалка
              </NoirButton>
            </div>
          </SlantedScrollContainer>
        </section>
      </div>

      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
};
