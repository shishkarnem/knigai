import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, BookOpen, Shield } from 'lucide-react';
import { AppRoute, Book, Chapter, Character, AppUser, ParsedChapter } from './types';
import { fetchAllBooks, fetchChapters, fetchCharacters, saveNewBook, saveChapter, saveCharacter, saveWorldEntity } from './services/db/bookRepository';
import { getCurrentUser, clearUserSession, saveUserSession } from './services/auth/authService';
import { bootstrapDatabaseSchema } from './services/db/pgProxy';
import { BookAiAnalysisResult } from './services/import/bookImportAi';
import { NewBookModal } from './components/book/NewBookModal';
import { PrintExportModal } from './components/book/print/PrintExportModal';
import { getCachedBookBundle } from './services/storage/offlineCache';
import { syncBookAssetsToGalleryAndFolder } from './services/db/fileStorageRepository';
import { BALANCE_CHANGED_EVENT, getAuthoritativeBalance } from './services/billing/transactionService';
import { createNotification } from './services/billing/notificationService';
import { persistInitialBookDrafts } from './services/drafts/draftsRepository';

// Noir Components & Modals
import { NoirHeader } from './components/common/NoirHeader';
import { NoirModal } from './components/common/NoirModal';
import { NoirButton } from './components/common/NoirButton';
import { AuthModalNoir } from './components/auth/AuthModalNoir';
import { BasicPlotSelector } from './components/plots/BasicPlotSelector';
import { CabinetSidebar } from './components/cabinet/CabinetSidebar';
import { CabinetMobileNav } from './components/cabinet/CabinetMobileNav';
import { CabinetSubnav } from './components/cabinet/CabinetSubnav';
import { isUserAdmin } from './services/auth/authService';
import { AiWaitingOverlayModal } from './components/generation/AiWaitingOverlayModal';
import { NoirRainNeonBackground } from './components/cabinet/bg/NoirRainNeonBackground';
import { NoirClickRipples } from './components/cabinet/bg/NoirClickRipples';
import { ClipboardUploadOverlay } from './components/common/clipboard/ClipboardUploadOverlay';
import { useGlobalFieldClipboard } from './hooks/useGlobalFieldClipboard';
import {
  authenticateWithTelegramWebApp,
  isRunningInsideTelegramWebApp,
} from './services/auth/telegramWebAppAuth';

// Pages
import { LandingPage } from './pages/landing/LandingPage';
import { LibraryPage } from './pages/library/LibraryPage';
import { ConstructorPage } from './pages/book/ConstructorPage';
import { ChaptersPage } from './pages/book/ChaptersPage';
import { CharactersPage } from './pages/book/CharactersPage';
import { CoverPage } from './pages/book/CoverPage';
import { ReaderPage } from './pages/book/ReaderPage';
import { GalleryPage } from './pages/gallery/GalleryPage';
import { AdminPage } from './pages/admin/AdminPage';
import { OfertaPage } from './pages/legal/OfertaPage';
import { PrivacyPolicyPage } from './pages/legal/PrivacyPolicyPage';
import { UserAgreementPage } from './pages/legal/UserAgreementPage';
import { PersonalDataConsentPage } from './pages/legal/PersonalDataConsentPage';
import { PaymentResultPage } from './pages/legal/PaymentResultPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { BalancePage } from './pages/profile/BalancePage';
import { NotificationsPage } from './pages/profile/NotificationsPage';
import { BlogListPage } from './pages/blog/BlogListPage';
import { BlogPostPage } from './pages/blog/BlogPostPage';
import {
  pathToRoute,
  routeToPath,
  isFullBleedPublicRoute,
  extractBlogSlugFromPath,
} from './constants/appRoutes';
import { resetDefaultSeo } from './services/blog/blogSeoClient';
import { buildInitialDemoBook, buildInitialDemoChapters } from './constants/initialDemoBook';

export default function App() {
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(() => pathToRoute(window.location.pathname));
  const [blogSlug, setBlogSlug] = useState<string>(() => extractBlogSlugFromPath(window.location.pathname) || '');
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => getCurrentUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPromptMessage, setAuthPromptMessage] = useState('');
  const [authInitialMode, setAuthInitialMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [resetTokenParam, setResetTokenParam] = useState('');
  const [resetEmailParam, setResetEmailParam] = useState('');

  const [books, setBooks] = useState<Book[]>([]);
  const [activeBook, setActiveBook] = useState<Book | null>(null);
  const activeBookRef = useRef<Book | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);

  useEffect(() => {
    activeBookRef.current = activeBook;
  }, [activeBook]);

  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isNewBookModalOpen, setIsNewBookModalOpen] = useState(false);
  const [readerInitialChapter, setReaderInitialChapter] = useState<number>(0);
  const [isReaderFullscreen, setIsReaderFullscreen] = useState(false);

  useGlobalFieldClipboard(currentUser?.uid);

  const isFullscreenReading =
    isReaderFullscreen &&
    (currentRoute === 'reader' || currentRoute === 'public-read') &&
    Boolean(activeBook);

  useEffect(() => {
    // Capture referral UID & password reset token from URL if present
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const refParam = searchParams.get('ref');
      if (refParam && /^\d+$/.test(refParam)) {
        localStorage.setItem('knigai_ref_uid', refParam);
      }

      const urlResetToken = searchParams.get('reset_token');
      const urlResetEmail = searchParams.get('reset_email') || '';
      if (urlResetToken) {
        setResetTokenParam(urlResetToken);
        setResetEmailParam(urlResetEmail);
        setAuthInitialMode('forgot');
        setAuthPromptMessage('');
        setIsAuthModalOpen(true);
        searchParams.delete('reset_token');
        searchParams.delete('reset_email');
        const nextSearch = searchParams.toString();
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`
        );
      }
    } catch {
      // ignore
    }

    // Initial sync of browser route
    const initialRoute = pathToRoute(window.location.pathname);
    setCurrentRoute(initialRoute);
    setBlogSlug(extractBlogSlugFromPath(window.location.pathname) || '');

    // Browser back/forward navigation handler
    const handlePopState = () => {
      const route = pathToRoute(window.location.pathname);
      setCurrentRoute(route);
      setBlogSlug(extractBlogSlugFromPath(window.location.pathname) || '');
    };

    const handleBalanceChange = (e: Event) => {
      const custom = e as CustomEvent<{ balance?: number }>;
      if (typeof custom.detail?.balance === 'number') {
        setCurrentUser((prev) => {
          if (!prev) return prev;
          const updated = { ...prev, letters_balance: custom.detail.balance };
          saveUserSession(updated);
          return updated;
        });
      }
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener(BALANCE_CHANGED_EVENT, handleBalanceChange);
    initApp();

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener(BALANCE_CHANGED_EVENT, handleBalanceChange);
    };
  }, []);

  // Keep user's Letters balance synchronized with PostgreSQL in real time across header & sidebar
  useEffect(() => {
    if (!currentUser?.uid) return;
    const syncBalance = () => {
      if (document.visibilityState === 'hidden') return;
      getAuthoritativeBalance(currentUser.uid).catch(() => {});
    };
    const interval = setInterval(syncBalance, 5000);
    window.addEventListener('focus', syncBalance);
    document.addEventListener('visibilitychange', syncBalance);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', syncBalance);
      document.removeEventListener('visibilitychange', syncBalance);
    };
  }, [currentUser?.uid]);

  // Global rule: Always open pages from the very top on route/page transitions
  useEffect(() => {
    if (currentRoute !== 'reader' && currentRoute !== 'public-read') {
      setIsReaderFullscreen(false);
    }
    if (currentRoute !== 'blog' && currentRoute !== 'blog-post') {
      resetDefaultSeo();
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [currentRoute, blogSlug]);

  const refreshBooksList = async (uidOverride?: number) => {
    try {
      const targetUid = uidOverride !== undefined ? uidOverride : currentUser?.uid;
      const list = await fetchAllBooks(targetUid);
      setBooks(list);
      if (list.length > 0 && (!activeBookRef.current || !list.some((b) => b.id === activeBookRef.current?.id))) {
        selectBook(list[0]);
      }
    } catch {
      // ignore transient refresh failure
    }
  };

  const handleNavigate = (route: AppRoute, preserveChapter = false) => {
    if (!preserveChapter) {
      setReaderInitialChapter(0);
    }
    const targetBook = activeBookRef.current || activeBook;
    if ((route === 'reader' || route === 'public-read') && !targetBook && books.length > 0) {
      selectBook(books[0]);
    }
    if (route === 'library') {
      refreshBooksList(currentUser?.uid);
    }
    if ((route === 'chapters' || route === 'reader') && targetBook) {
      const requestedBookId = targetBook.id;
      fetchChapters(requestedBookId, targetBook.user_uid)
        .then((fresh) => {
          if (activeBookRef.current?.id !== requestedBookId) return;
          if (fresh && fresh.length > 0) setChapters(fresh);
        })
        .catch(() => {});
    }
    setCurrentRoute(route);
    const path = routeToPath(route);
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const handleNavigateToReader = (chapterNumber = 0) => {
    setReaderInitialChapter(chapterNumber);
    handleNavigate('reader', true);
  };

  const handleOpenBlogIndex = () => {
    setBlogSlug('');
    handleNavigate('blog');
  };

  const handleOpenBlogPost = (slug: string) => {
    const cleanSlug = slug.trim();
    if (!cleanSlug) {
      handleOpenBlogIndex();
      return;
    }
    setBlogSlug(cleanSlug);
    setCurrentRoute('blog-post');
    const path = `/blog/${encodeURIComponent(cleanSlug)}`;
    if (window.location.pathname !== path) {
      window.history.pushState({}, '', path);
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const initApp = async () => {
    // Bootstrap DB schema check
    try {
      await bootstrapDatabaseSchema();
    } catch {
      // ignore
    }

    let user = getCurrentUser();
    if (isRunningInsideTelegramWebApp()) {
      try {
        const twaResult = await authenticateWithTelegramWebApp();
        user = twaResult.user;
        setCurrentUser(user);
        if (window.location.pathname === '/' || window.location.pathname === '/landing') {
          setCurrentRoute('profile');
          window.history.replaceState({}, '', '/profile');
        }
      } catch {
        // Fallback to stored session if initData verification failed
      }
    }

    if (user) {
      setCurrentUser(user);
      getAuthoritativeBalance(user.uid)
        .then((authBal) => {
          if (authBal !== user.letters_balance) {
            const refreshed = { ...user, letters_balance: authBal };
            setCurrentUser(refreshed);
            saveUserSession(refreshed);
          }
        })
        .catch(() => {});
    }

    const list = await fetchAllBooks(user?.uid);
    setBooks(list);

    const path = window.location.pathname;
    if (path.startsWith('/read/')) {
      const slug = path.replace('/read/', '').trim();
      const matched = list.find((b) => b.slug === slug || b.slug === decodeURIComponent(slug));
      if (matched) {
        selectBook(matched);
        setCurrentRoute('public-read');
        return;
      }
    }

    if (list.length > 0) {
      selectBook(list[0]);
    } else {
      createInitialDemoBook(user?.uid);
    }
  };

  const createInitialDemoBook = async (uid?: number) => {
    const initial = buildInitialDemoBook(uid);
    const created = await saveNewBook(initial, uid);
    setBooks([created]);
    setActiveBook(created);

    const demoChaps = buildInitialDemoChapters(created.id, uid);
    const savedList: Chapter[] = [];
    for (const c of demoChaps) {
      const s = await saveChapter(c, undefined, uid);
      savedList.push(s);
    }
    setChapters(savedList);
  };

  const selectBook = async (b: Book) => {
    const isDifferentBook = activeBookRef.current?.id !== b.id;
    activeBookRef.current = b;
    setActiveBook(b);
    if (isDifferentBook) {
      setReaderInitialChapter(0);
    }
    // Show offline bundle or per-book local cache immediately if available;
    // otherwise clear previous book's chapters/characters so old book never appears in reader
    const cached = getCachedBookBundle(b.id);
    if (cached && cached.chapters && cached.chapters.length > 0) {
      setChapters(cached.chapters);
      setCharacters(cached.characters || []);
    } else {
      let localChaps: Chapter[] = [];
      let localChars: Character[] = [];
      try {
        const rawChaps = localStorage.getItem(`knigai_chapters_${b.id}`);
        if (rawChaps) {
          const parsed = JSON.parse(rawChaps);
          if (Array.isArray(parsed)) localChaps = parsed;
        }
        const rawChars = localStorage.getItem(`knigai_chars_${b.id}`);
        if (rawChars) {
          const parsed = JSON.parse(rawChars);
          if (Array.isArray(parsed)) localChars = parsed;
        }
      } catch {
        // ignore invalid localStorage cache
      }
      setChapters(localChaps);
      setCharacters(localChars);
    }
    try {
      const [chaps, chars] = await Promise.all([
        fetchChapters(b.id, b.user_uid),
        fetchCharacters(b.id, b.user_uid),
      ]);
      // Discard stale fetch results if another book was selected while loading
      if (activeBookRef.current?.id !== b.id) return;
      if (chaps.length > 0 || !cached?.chapters?.length) {
        setChapters(chaps);
      }
      if (chars.length > 0 || !cached?.characters?.length) {
        setCharacters(chars);
      }
    } catch {
      // keep cached fallback when offline
    }
  };

  const handleUserLoginSuccess = async (user: AppUser) => {
    setCurrentUser(user);
    const list = await fetchAllBooks(user.uid);
    setBooks(list);
    if (list.length > 0) {
      selectBook(list[0]);
    }
    handleNavigate('profile');
  };

  const handleLogout = () => {
    clearUserSession();
    setCurrentUser(null);
    handleNavigate('landing');
  };

  const handleNewBookSubmit = async (
    newTitle: string,
    genres: string[],
    basicPlots?: string[],
    createdChapters?: ParsedChapter[],
    aiAnalysis?: BookAiAnalysisResult
  ) => {
    if (!currentUser) {
      setAuthPromptMessage('Для сохранения книги в личную библиотеку, пожалуйста, укажите ваш email.');
      setIsAuthModalOpen(true);
      return;
    }

    const assignedPlots = (basicPlots && basicPlots.length > 0 ? basicPlots : ['overcoming-the-monster']).slice(0, 3);
    const resolvedGenres = (genres && genres.length > 0 ? genres : ['Темное фэнтези']).slice(0, 5);
    const resolvedTitle = newTitle.trim() || aiAnalysis?.title || 'Книга KnigAI';
    const resolvedSubtitle = aiAnalysis?.synopsis_overview?.slice(0, 80) || 'Хроники ночного мегаполиса';
    const authorName = currentUser.name || currentUser.email.split('@')[0] || 'Автор KnigAI';

    const newBook: Omit<Book, 'id'> = {
      user_uid: currentUser.uid,
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
      author: authorName,
      genres: resolvedGenres,
      genre_weights: aiAnalysis?.genre_weights,
      style_config: aiAnalysis?.style_config,
      basic_plots: assignedPlots,
      target_chapters: createdChapters && createdChapters.length > 0 ? Math.max(10, createdChapters.length) : 100,
      status: 'draft',
      synopsis_overview: aiAnalysis?.synopsis_overview || '',
      author_instructions: aiAnalysis?.author_instructions || '',
      cover_config: {
        frontTitle: resolvedTitle,
        frontSubtitle: resolvedSubtitle,
        authorName,
        spineText: `${resolvedTitle} — ${authorName}`,
        backBlurb: aiAnalysis?.synopsis_overview || 'Новое издание в стиле книжный нуар формата А5.',
        genreLabel: genres.join(' / '),
        frontImageUrl: '',
        spineColor: '#18181b',
        paperType: 'cream',
        pageCountEstimate: createdChapters && createdChapters.length > 0 ? createdChapters.length * 14 : 300,
        isbn: '978-5-00-123456-7',
        barcodeText: 'Издание формата А5',
      },
    };

    const saved = await saveNewBook(newBook, currentUser.uid);
    await persistInitialBookDrafts(saved.id, currentUser.uid, aiAnalysis?.drafts).catch(() => {});

    // Save chapters if imported
    let savedChapters: Chapter[] = [];
    if (createdChapters && createdChapters.length > 0) {
      for (const c of createdChapters) {
        const savedChap = await saveChapter(
          {
            book_id: saved.id,
            chapter_number: c.chapterNumber,
            title: c.title,
            content: c.content,
            synopsis: c.synopsis || '',
            illustration_url: c.illustration_url || '',
            illustration_prompt: '',
            status: 'ready',
          },
          undefined,
          currentUser.uid
        );
        savedChapters.push(savedChap);
      }
    }

    // Save detected characters
    let savedChars: Character[] = [];
    if (aiAnalysis?.characters && aiAnalysis.characters.length > 0) {
      for (const ch of aiAnalysis.characters) {
        let mappedRole: Character['role'] = 'главный герой';
        const roleLower = (ch.role || '').toLowerCase();
        if (roleLower.includes('антагонист') || roleLower.includes('злодей') || roleLower.includes('враг')) {
          mappedRole = 'антагонист';
        } else if (roleLower.includes('наставник') || roleLower.includes('учитель')) {
          mappedRole = 'наставник';
        } else if (roleLower.includes('спутник') || roleLower.includes('друг') || roleLower.includes('помощник')) {
          mappedRole = 'спутник';
        } else if (roleLower.includes('союзник') || roleLower.includes('таинственный')) {
          mappedRole = 'таинственный союзник';
        } else if (roleLower.includes('второстепенный') || roleLower.includes('эпизодический')) {
          mappedRole = 'второстепенный';
        }

        const savedChar = await saveCharacter(
          {
            book_id: saved.id,
            name: ch.name,
            role: mappedRole,
            description: ch.description || '',
            visual_card_url: '',
            visual_prompt: '',
            traits: [],
          },
          undefined,
          currentUser.uid
        );
        savedChars.push(savedChar);
      }
    }

    // Save detected world entities
    if (aiAnalysis?.world_entities && aiAnalysis.world_entities.length > 0) {
      for (const we of aiAnalysis.world_entities) {
        await saveWorldEntity(
          {
            book_id: saved.id,
            entity_type: we.entity_type,
            name: we.name,
            subtitle_or_role: we.entity_type,
            description: we.description || '',
            attributes: {},
            visual_prompt: '',
            image_url: '',
          },
          undefined,
          currentUser.uid
        );
      }
    }

    // Automatically create a dedicated book folder and sync all illustrations/covers to gallery
    const synced = await syncBookAssetsToGalleryAndFolder(saved, savedChapters, currentUser.uid);
    const finalBook = synced.updatedBook;
    const finalChapters = synced.updatedChapters;

    if (finalChapters.length > 0) {
      await createNotification({
        userUid: currentUser.uid,
        type: 'import',
        title: `Книга «${finalBook.title}» создана и разобрана`,
        message: `Импортировано глав: ${finalChapters.length}, персонажей: ${savedChars.length}. Книга открыта в конструкторе.`,
        link: 'constructor',
      });
    }

    setBooks([finalBook, ...books]);
    selectBook(finalBook);
    if (finalChapters.length > 0) {
      setChapters(finalChapters);
    }
    if (savedChars.length > 0) {
      setCharacters(savedChars);
    }
    handleNavigate('constructor');
    setIsNewBookModalOpen(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-white font-sans relative">
      <NoirClickRipples />
      {!isFullBleedPublicRoute(currentRoute) && <NoirRainNeonBackground />}
      {/* Noir Manga Header (hidden in all fullscreen reading modes) */}
      {!isFullscreenReading && (
        <NoirHeader
          currentRoute={currentRoute}
          onRouteChange={handleNavigate}
          activeBook={activeBook}
          currentUser={currentUser}
          onOpenAuth={() => {
            setAuthPromptMessage('');
            setIsAuthModalOpen(true);
          }}
          onLogout={handleLogout}
          onExportClick={() => setIsExportModalOpen(true)}
          onNewBookClick={() => setIsNewBookModalOpen(true)}
        />
      )}

      {/* Main Container: 2% horizontal padding on mobile as unified global rule */}
      <main
        className={`relative flex-1 w-full flex flex-col ${
          isFullscreenReading
            ? 'p-0 z-50'
            : isFullBleedPublicRoute(currentRoute)
            ? 'p-0 z-10'
            : 'z-10 px-[2%] sm:px-[5%] py-4 sm:py-6'
        }`}
      >
        {/* 1. Public Landing, Blog, Legal & Payment Result Pages */}
        {currentRoute === 'landing' ? (
          <LandingPage
            currentUser={currentUser}
            onOpenAuth={() => {
              setAuthPromptMessage('');
              setIsAuthModalOpen(true);
            }}
            onNavigate={handleNavigate}
            onOpenBlogPost={handleOpenBlogPost}
          />
        ) : currentRoute === 'blog' ? (
          <BlogListPage
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenPost={handleOpenBlogPost}
          />
        ) : currentRoute === 'blog-post' ? (
          <BlogPostPage
            slug={blogSlug}
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onOpenBlogIndex={handleOpenBlogIndex}
            onOpenPost={handleOpenBlogPost}
            onOpenAuth={() => {
              setAuthPromptMessage('');
              setIsAuthModalOpen(true);
            }}
          />
        ) : currentRoute === 'oferta' ? (
          <OfertaPage onNavigate={handleNavigate} />
        ) : currentRoute === 'privacy' ? (
          <PrivacyPolicyPage onNavigate={handleNavigate} />
        ) : currentRoute === 'agreement' ? (
          <UserAgreementPage onNavigate={handleNavigate} />
        ) : currentRoute === 'consent' ? (
          <PersonalDataConsentPage onNavigate={handleNavigate} />
        ) : currentRoute === 'payment-success' ? (
          <PaymentResultPage
            mode="success"
            currentUser={currentUser}
            onNavigate={handleNavigate}
            onUserUpdated={(updated) => setCurrentUser(updated)}
          />
        ) : currentRoute === 'payment-fail' ? (
          <PaymentResultPage
            mode="fail"
            currentUser={currentUser}
            onNavigate={handleNavigate}
          />
        ) : (!currentUser && !['library', 'reader', 'public-read'].includes(currentRoute)) ? (
          /* Unauthenticated Gatekeeper for Author Cabinet Pages */
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="noir-container p-8 sm:p-12 border-2 border-white text-center flex flex-col items-center justify-center gap-4 max-w-xl">
              <div className="w-14 h-14 bg-transparent border-0 flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-rose-500" />
              </div>
              <h2 className="text-[20px] font-bold text-white tracking-tight">
                Личный кабинет фабрики книг KnigAI
              </h2>
              <p className="text-[14px] text-zinc-300 leading-relaxed font-['PT_Serif',serif]">
                Разделы «Конструктор», «Главы», «Персонажи», «Переплет» и «Профиль» доступны после входа в личный кабинет. Общая библиотека и читалка открыты для всех без регистрации. Войдите по email или зарегистрируйтесь, чтобы получить уникальный 11-значный UID и сохранять книги в облаке.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <NoirButton variant="outline" onClick={() => handleNavigate('landing')}>
                  На главную
                </NoirButton>
                <NoirButton variant="outline" onClick={() => handleNavigate('library')}>
                  В общую библиотеку
                </NoirButton>
                <NoirButton
                  variant="primary"
                  onClick={() => {
                    setAuthPromptMessage('Войдите или зарегистрируйтесь для доступа к личному кабинету:');
                    setIsAuthModalOpen(true);
                  }}
                >
                  Войти / Регистрация
                </NoirButton>
              </div>
            </div>
          </div>
        ) : currentRoute === 'admin' && !isUserAdmin(currentUser) ? (
          /* Admin Access Denied */
          <div className="flex-1 flex items-center justify-center py-12">
            <div className="noir-container p-8 sm:p-12 border-2 border-rose-500 text-center flex flex-col items-center justify-center gap-4 max-w-lg">
              <div className="w-14 h-14 bg-rose-950 border border-rose-500 text-rose-200 flex items-center justify-center font-bold">
                <Shield className="w-8 h-8" />
              </div>
              <h2 className="text-[20px] font-bold text-white tracking-tight">
                Доступ ограничен
              </h2>
              <p className="text-[14px] text-zinc-300 leading-relaxed">
                Раздел «Админка» доступен только для администратора Тимошенко Дениса (shishkarnem@gmail.com).
              </p>
              <NoirButton variant="primary" onClick={() => handleNavigate('library')}>
                Вернуться в Библиотеку
              </NoirButton>
            </div>
          </div>
        ) : (
          /* Authenticated & Guest Cabinet Layout: Left Menu + Content */
          <div className={`flex-1 flex flex-col lg:flex-row items-start gap-6 ${isFullscreenReading ? 'pb-0' : 'pb-20 lg:pb-6'}`}>
            {!isFullscreenReading && (
              <CabinetSidebar
                currentRoute={currentRoute}
                onRouteChange={handleNavigate}
                currentUser={currentUser}
                activeBook={activeBook}
                onLogout={handleLogout}
                onOpenAuth={() => setIsAuthModalOpen(true)}
              />
            )}

            <div className="flex-1 min-w-0 w-full flex flex-col gap-6">
              {/* Mutual Switcher Buttons for Cabinet Sections in Header */}
              {!isFullscreenReading && (
                <CabinetSubnav
                  currentRoute={currentRoute}
                  onRouteChange={handleNavigate}
                  currentUser={currentUser}
                  activeBook={activeBook}
                  chapters={chapters}
                />
              )}

              {/* 1. Author Profile (Main Cabinet Hub) */}
              {currentRoute === 'profile' && currentUser && (
                <ProfilePage
                  currentUser={currentUser}
                  books={books}
                  activeBook={activeBook}
                  onSelectBook={selectBook}
                  onNavigate={handleNavigate}
                  onOpenNewBookModal={() => setIsNewBookModalOpen(true)}
                  onUserUpdated={(updated) => setCurrentUser(updated)}
                  onLogout={handleLogout}
                />
              )}

              {/* 1b. Billing, Balance & Transactions Ledger */}
              {currentRoute === 'balance' && currentUser && (
                <BalancePage
                  currentUser={currentUser}
                  onNavigate={handleNavigate}
                  onUserUpdated={(updated) => setCurrentUser(updated)}
                />
              )}

              {/* 1c. Author Notifications */}
              {currentRoute === 'notifications' && currentUser && (
                <NotificationsPage
                  currentUser={currentUser}
                  onNavigate={handleNavigate}
                  onUserUpdated={(updated) => setCurrentUser(updated)}
                />
              )}

              {/* 2. Library (Books List) */}
              {currentRoute === 'library' && (
                <LibraryPage
                  books={books}
                  activeBook={activeBook}
                  currentUser={currentUser}
                  onSelectBook={selectBook}
                  onBooksChanged={setBooks}
                  onRefreshBooks={() => refreshBooksList(currentUser?.uid)}
                  onNavigate={handleNavigate}
                  onNavigateToReader={handleNavigateToReader}
                  onOpenNewBookModal={() => setIsNewBookModalOpen(true)}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                />
              )}

              {/* 3. System Admin Database Inspector */}
              {currentRoute === 'admin' && (
                <AdminPage
                  onBackToApp={() => handleNavigate('profile')}
                  onOpenBlogPost={handleOpenBlogPost}
                />
              )}

              {/* 4. Book World Constructor */}
              {currentRoute === 'constructor' && (
                <ConstructorPage
                  currentBook={activeBook}
                  userUid={currentUser?.uid}
                  onOpenNewBookModal={() => setIsNewBookModalOpen(true)}
                  onBookCreated={(saved) => {
                    setActiveBook(saved);
                    setBooks(books.map((b) => (b.id === saved.id ? saved : b)));
                  }}
                  onProceedToChapters={() => handleNavigate('chapters')}
                />
              )}

              {/* 5. Chapters Page */}
              {currentRoute === 'chapters' && activeBook && (
                <ChaptersPage
                  book={activeBook}
                  chapters={chapters}
                  characters={characters}
                  userUid={currentUser?.uid}
                  onChaptersUpdated={(updated) => setChapters(updated)}
                  onBookUpdated={(updatedBook) => {
                    setActiveBook(updatedBook);
                    setBooks((prev) => prev.map((b) => (b.id === updatedBook.id ? updatedBook : b)));
                  }}
                  onNavigateToReader={(chapNum) => handleNavigateToReader(chapNum || 0)}
                />
              )}

              {/* 6. Characters Page */}
              {currentRoute === 'characters' && activeBook && (
                <CharactersPage
                  book={activeBook}
                  characters={characters}
                  userUid={currentUser?.uid}
                  onCharactersUpdated={(updated) => setCharacters(updated)}
                />
              )}

              {/* 7. Cover Page (Переплет) */}
              {currentRoute === 'cover' && activeBook && (
                <CoverPage
                  book={activeBook}
                  chapters={chapters}
                  userUid={currentUser?.uid}
                  onBookUpdated={(updated) => setActiveBook(updated)}
                />
              )}

              {/* 8. 3D Book Reader */}
              {(currentRoute === 'reader' || currentRoute === 'public-read') && (
                activeBook ? (
                  <ReaderPage
                    key={activeBook.id}
                    book={activeBook}
                    chapters={chapters.filter((c) => !c.book_id || Number(c.book_id) === Number(activeBook.id))}
                    characters={characters.filter((c) => !c.book_id || Number(c.book_id) === Number(activeBook.id))}
                    userUid={currentUser?.uid}
                    initialChapterNumber={readerInitialChapter}
                    onOpenExportModal={() => setIsExportModalOpen(true)}
                    onExitReader={() => handleNavigate('library')}
                    onFullscreenChange={setIsReaderFullscreen}
                  />
                ) : (
                  <div className="noir-container p-8 sm:p-12 border-2 border-white text-center flex flex-col items-center justify-center gap-4">
                    <BookOpen className="w-12 h-12 text-rose-500" />
                    <h3 className="text-[20px] font-bold text-white">Книга не выбрана</h3>
                    <p className="text-[14px] text-zinc-300 max-w-md leading-relaxed font-['PT_Serif',serif]">
                      В библиотеке представлены книги авторов и ваши локальные файлы. Выберите книгу для чтения в читалке.
                    </p>
                    <NoirButton variant="primary" onClick={() => handleNavigate('library')}>
                      Перейти в общую библиотеку
                    </NoirButton>
                  </div>
                )
              )}

              {/* 9. Standalone Media Gallery with PNG Alpha */}
              {currentRoute === 'gallery' && (
                <GalleryPage
                  activeBook={activeBook}
                  currentUser={currentUser}
                  onOpenAuth={() => setIsAuthModalOpen(true)}
                  onNavigateToCover={() => handleNavigate('cover')}
                  onNavigateToChapters={() => handleNavigate('chapters')}
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navbar with Sections and Subsections */}
      {currentRoute !== 'landing' && !isFullscreenReading && (
        <CabinetMobileNav
          currentRoute={currentRoute}
          onRouteChange={handleNavigate}
          currentUser={currentUser}
          onLogout={handleLogout}
          onOpenAuth={() => setIsAuthModalOpen(true)}
        />
      )}

      {/* Auth Modal (Email + 11-digit UID + Password Reset) */}
      {isAuthModalOpen && (
        <AuthModalNoir
          isOpen={isAuthModalOpen}
          onClose={() => {
            setIsAuthModalOpen(false);
            setAuthInitialMode('login');
            setResetTokenParam('');
            setResetEmailParam('');
          }}
          onSuccess={handleUserLoginSuccess}
          onNavigate={handleNavigate}
          initialMessage={authPromptMessage}
          initialMode={authInitialMode}
          initialResetToken={resetTokenParam}
          initialResetEmail={resetEmailParam}
        />
      )}

      {/* Print-Ready Typography Export Modal */}
      {isExportModalOpen && activeBook && (
        <PrintExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          book={activeBook}
          chapters={chapters}
          characters={characters}
          userUid={currentUser?.uid}
        />
      )}

      {/* New Book Creation Modal with 4 Modes */}
      {isNewBookModalOpen && (
        <NewBookModal
          isOpen={isNewBookModalOpen}
          onClose={() => setIsNewBookModalOpen(false)}
          currentUser={currentUser}
          availableBooks={books}
          onBookCreated={handleNewBookSubmit}
          onSequelCreated={(created) => {
            setBooks((prev) => [created.book, ...prev]);
            setActiveBook(created.book);
            setChapters(created.chapters);
            setCharacters(created.characters);
            handleNavigate('chapters');
          }}
          onUserBalanceUpdated={(newBal) => {
            if (currentUser) {
              setCurrentUser({ ...currentUser, letters_balance: newBal });
            }
          }}
        />
      )}

      {/* Global Centered Generation Waiting Overlay Modal */}
      <AiWaitingOverlayModal />
      <ClipboardUploadOverlay />
    </div>
  );
}
