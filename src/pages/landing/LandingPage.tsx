import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  BookOpen,
  Layers,
  Palette,
  Users,
  ArrowRight,
  Gift,
  Printer,
  Share2,
  BookMarked,
  Heart,
  Baby,
  Briefcase,
  ExternalLink,
  CheckCircle,
  HelpCircle,
  TrendingUp,
} from 'lucide-react';
import { AppUser, AppRoute } from '../../types';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirModal } from '../../components/common/NoirModal';
import { KNIG_HERO_PC_URL, HERO_MOB_URL } from '../../constants/assets';
import { NeuroBook } from '../../components/landing/NeuroBook';
import { RubikMarkerHeading } from '../../components/landing/RubikMarkerHeading';
import { SlantedScrollContainer } from '../../components/landing/SlantedScrollContainer';
import { AnimeMangaCard } from '../../components/landing/AnimeMangaCard';
import { LandingFooter } from '../../components/landing/LandingFooter';
import { LandingCalculatorSection } from '../../components/calculator/LandingCalculatorSection';
import { LandingBlogSection } from '../../components/blog/LandingBlogSection';

interface LandingPageProps {
  currentUser: AppUser | null;
  onOpenAuth: () => void;
  onNavigate: (route: AppRoute) => void;
  onOpenBlogPost?: (slug: string) => void;
}

interface MangaPanelData {
  id: string;
  badge: string;
  title: string;
  shortDesc: string;
  icon: React.ReactNode;
  clipDesktop: string;
  rotateDeg: string;
  accent: 'rose' | 'white' | 'zinc';
  fullTitle: string;
  fullDesc: string[];
  bulletPoints: string[];
  ctaText: string;
  targetRoute?: AppRoute;
}

interface MangaRowPairProps {
  leftPanel: MangaPanelData;
  rightPanel: MangaPanelData;
  leftIndex: number;
  rightIndex: number;
  leftWidthClass: string;
  rightWidthClass: string;
  onSelectPanel: (panel: MangaPanelData) => void;
}

const MangaRowPair: React.FC<MangaRowPairProps> = ({
  leftPanel,
  rightPanel,
  leftIndex,
  rightIndex,
  leftWidthClass,
  rightWidthClass,
  onSelectPanel,
}) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [physics, setPhysics] = useState({
    leftTransform: 'translateX(0px) translateY(0px) rotate(0deg)',
    leftOpacity: 0,
    rightTransform: 'translateX(0px) translateY(0px) rotate(0deg)',
    rightOpacity: 0,
  });

  useEffect(() => {
    let ticking = false;

    const updatePhysics = () => {
      if (!rowRef.current) return;
      const rect = rowRef.current.getBoundingClientRect();
      const winH = window.innerHeight || 800;
      const isMobile = window.innerWidth < 768;

      // Scroll progress for this specific pair
      const progress = Math.max(0, (winH * 0.94 - rect.top) / (winH * 0.60));

      // 1. Left card: falls & slides in first (progress 0.0 -> 0.28)
      const tLeft = Math.min(1, Math.max(0, progress / 0.28));
      const slideLeftDist = isMobile ? 32 : 110;
      const fallDist = isMobile ? 32 : 65;
      const rotDist = isMobile ? 1.5 : 3.5;
      const entryFallLeft = -fallDist * (1 - tLeft);
      const entrySlideLeft = -slideLeftDist * (1 - tLeft);
      const entryRotLeft = -rotDist * (1 - tLeft);
      const leftOpacity = Math.min(1, tLeft * 1.6);

      // 2. Right card: falls & slides in second, reaching 100% arrival by progress = 0.40
      // Right card completes its full landing at translateX(0px) so its right edge is completely on screen!
      const tRight = Math.min(1, Math.max(0, (progress - 0.12) / 0.28));
      const slideRightDist = isMobile ? 36 : 110;
      const entryFallRight = -fallDist * (1 - tRight);
      const entrySlideRight = slideRightDist * (1 - tRight);
      const entryRotRight = rotDist * (1 - tRight);
      const rightOpacity = Math.min(1, tRight * 1.6);

      // 3. Ongoing dynamic displacement:
      // Begins strictly AFTER both cards have 100% landed and settled (progress > 0.45)
      let shiftLeftX = 0;
      let shiftLeftY = 0;
      let shiftRightX = 0;
      let shiftRightY = 0;

      if (progress > 0.45) {
        const post = progress - 0.45;
        if (isMobile) {
          // On mobile, keep shiftRightX strictly 0 so the right border is never pushed past the screen edge
          shiftLeftX = 0;
          shiftLeftY = Math.min(12, post * 8);
          shiftRightX = 0;
          shiftRightY = Math.min(16, post * 10);
        } else {
          // Desktop comic panel dynamic displacement
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
  }, []);

  return (
    <div ref={rowRef} className="flex flex-row items-start gap-1 sm:gap-6 w-full relative">
      <AnimeMangaCard
        id={leftPanel.id}
        badge={leftPanel.badge}
        title={leftPanel.title}
        shortDesc={leftPanel.shortDesc}
        icon={leftPanel.icon}
        accent={leftPanel.accent}
        index={leftIndex}
        onClick={() => onSelectPanel(leftPanel)}
        className={leftWidthClass}
        style={{
          transform: physics.leftTransform,
          opacity: physics.leftOpacity,
          transition: 'transform 0.1s ease-out, opacity 0.15s ease-out',
        }}
      />
      <AnimeMangaCard
        id={rightPanel.id}
        badge={rightPanel.badge}
        title={rightPanel.title}
        shortDesc={rightPanel.shortDesc}
        icon={rightPanel.icon}
        accent={rightPanel.accent}
        index={rightIndex}
        onClick={() => onSelectPanel(rightPanel)}
        className={rightWidthClass}
        style={{
          transform: physics.rightTransform,
          opacity: physics.rightOpacity,
          transition: 'transform 0.1s ease-out, opacity 0.15s ease-out',
        }}
      />
    </div>
  );
};

export const LandingPage: React.FC<LandingPageProps> = ({
  currentUser,
  onOpenAuth,
  onNavigate,
  onOpenBlogPost,
}) => {
  const [selectedPanel, setSelectedPanel] = useState<MangaPanelData | null>(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCta = (route?: AppRoute) => {
    if (route) {
      if (!currentUser && (route === 'constructor' || route === 'cover' || route === 'gallery' || route === 'profile')) {
        onOpenAuth();
      } else {
        onNavigate(route);
      }
    } else if (currentUser) {
      onNavigate('constructor');
    } else {
      onNavigate('library');
    }
  };

  // Manga panels definition with authentic manga cut angles (clip-path) and zero uppercase
  const mangaPanels: MangaPanelData[] = [
    {
      id: 'gift',
      badge: 'Хит сезона',
      title: '«Лучший подарок — это ИИ книга»',
      shortDesc: 'Персональный роман к юбилею или дню рождения, где юбиляр — главный герой захватывающего сюжета.',
      icon: <Gift className="w-5 h-5 text-rose-500" />,
      clipDesktop: 'polygon(0% 0%, 100% 3%, 98% 100%, 0% 97%)',
      rotateDeg: '-rotate-0.5',
      accent: 'rose',
      fullTitle: 'Персональная книга в подарок: юбиляр — герой романа',
      fullDesc: [
        'Представьте восторг именинника или близкого человека, когда он берет в руки настоящую твердую книгу формата А5 со своей фамилией на обложке и захватывающей историей, где каждое событие переплетается с его реальной жизнью, мечтами и характером.',
        'Искусственный интеллект создает связный художественный сюжет с каскадом глав, генерирует иллюстрации в стиле графического романа или книжного нуара и формирует готовый к печати макет переплета с корешком.',
      ],
      bulletPoints: [
        'Любые жанры: от детективного расследования и фэнтези до комедии и романтической хроники',
        'Персонажи по фото и описанию внешности с точным сохранением черт лица',
        'Печать от одного экземпляра с праздничной доставкой прямо виновнику торжества',
      ],
      ctaText: 'Создать подарочную книгу',
      targetRoute: 'constructor',
    },
    {
      id: 'print-rf',
      badge: 'Уникально в РФ',
      title: 'Тиражи от 1 экземпляра по всей России',
      shortDesc: 'В РФ нет аналогов Amazon KDP. Мы подключаем партнерские типографии для печати и быстрой доставки.',
      icon: <Printer className="w-5 h-5 text-white" />,
      clipDesktop: 'polygon(2% 2%, 100% 0%, 97% 98%, 0% 100%)',
      rotateDeg: 'rotate-0.5',
      accent: 'white',
      fullTitle: 'Печать и доставка книг от 1 экземпляра по всей России',
      fullDesc: [
        'Раньше выпустить единичный тираж было мучением: издательства требовали миллионные бюджеты и тиражи от 1000 штук, а зарубежные платформы (вроде Amazon KDP) прекратили работу с авторами из РФ.',
        'Мы решаем главную боль рынка: генерируем точный полиграфический PDF-макет А5 с корешком под вычисленную толщину страниц и передаем файл в партнерские типографии, доставляющие книгу в любой город России.',
      ],
      bulletPoints: [
        'Точный расчет толщины корешка для бумаги 80г и 120г под любое число страниц',
        'Полиграфическое разрешение 300 DPI и правильные отступы под обрезку (bleed 3мм)',
        'Доставка до двери или в пункты выдачи СДЭК/Boxberry/Почта России',
      ],
      ctaText: 'Собрать макет для печати',
      targetRoute: 'cover',
    },
    {
      id: 'free-layout',
      badge: 'Бесплатно за регистрацию',
      title: 'Бесплатный макет переплета и оформление',
      shortDesc: 'Есть готовый текст? Соберите переплет А5, корешок и иллюстрации без ИИ генерации текста.',
      icon: <Palette className="w-5 h-5 text-white" />,
      clipDesktop: 'polygon(0% 1%, 98% 0%, 100% 98%, 1% 100%)',
      rotateDeg: '-rotate-0.5',
      accent: 'white',
      fullTitle: 'Бесплатный редактор переплета, корешка и верстки',
      fullDesc: [
        'Вам не обязательно генерировать текст через нейросеть, если у вас уже есть свои наброски, повесть, стихи или научная работа.',
        'Сразу после бесплатной регистрации вы получаете полноценный редактор переплета: загружайте иллюстрации без потери прозрачности, настраивайте градиенты, управляйте положением текста на корешке и экспортируйте готовый PDF.',
      ],
      bulletPoints: [
        'Интерактивный редактор лицевой, оборотной стороны и корешка переплета А5',
        'Свободное перемещение и масштабирование надписей на обложке',
        'Инспектор медиафайлов с поддержкой фильтров и прозрачного фона PNG',
      ],
      ctaText: 'Открыть редактор переплета',
      targetRoute: 'cover',
    },
    {
      id: 'corporate',
      badge: 'B2B решение',
      title: 'Корпоративные подарки и онбординг',
      shortDesc: 'Геймифицированная книга адаптации для сотрудников и статусная книга о компании для партнеров.',
      icon: <Briefcase className="w-5 h-5 text-rose-500" />,
      clipDesktop: 'polygon(1% 0%, 100% 2%, 99% 100%, 0% 98%)',
      rotateDeg: 'rotate-0.5',
      accent: 'rose',
      fullTitle: 'Корпоративные книги, онбординг и подарки партнерам',
      fullDesc: [
        'Замените скучные PDF-регламенты на захватывающий корпоративный графический роман, где новичок проходит путь от стажера до ключевого лидера проектов, знакомясь с ценностями и культурой команды.',
        'Для партнеров и клиентов — премиальные персонализированные издания с историей совместных успехов и благодарностью за сотрудничество.',
      ],
      bulletPoints: [
        'Повышение вовлеченности новых сотрудников в первые 90 дней работы',
        'Уникальный премиальный мерч, который клиенты хранят на рабочем столе годами',
        'Фиксация фирменного стиля и айдентики бренда на переплете',
      ],
      ctaText: 'Спроектировать корпоративную книгу',
      targetRoute: 'constructor',
    },
    {
      id: 'kids',
      badge: 'Детям',
      title: 'Обучающие сказки с ребенком в главной роли',
      shortDesc: 'Персональная детская книга развивает фантазию, уверенность и любовь к самостоятельному чтению.',
      icon: <Baby className="w-5 h-5 text-white" />,
      clipDesktop: 'polygon(0% 2%, 99% 0%, 98% 100%, 1% 99%)',
      rotateDeg: '-rotate-0.5',
      accent: 'white',
      fullTitle: 'Обучающие детские книги с участием вашего ребенка',
      fullDesc: [
        'Дети гораздо охотнее читают и выполняют развивающие задания, когда на страницах книги видят себя, своих домашних питомцев и любимые игрушки.',
        'Создавайте поучительные терапевтические сказки, помогающие побороть страхи, адаптироваться к детскому саду или школе, а также освоить буквы и цифры в увлекательной игровой форме.',
      ],
      bulletPoints: [
        'Мягкая терапевтическая подача через любимые сюжеты и персонажей',
        'Яркие иллюстрации с участием ребенка на каждом развороте',
        'Память на всю жизнь, бережно хранимая на семейной книжной полке',
      ],
      ctaText: 'Создать детскую книгу',
      targetRoute: 'constructor',
    },
    {
      id: 'fanfics',
      badge: 'Фандомы и мерч',
      title: 'Фанфики, ремиксы и коллекционный мерч',
      shortDesc: 'Овеществите любимые истории сообщества в осязаемый печатный том с эксклюзивным артом.',
      icon: <Sparkles className="w-5 h-5 text-white" />,
      clipDesktop: 'polygon(2% 0%, 100% 1%, 97% 99%, 0% 100%)',
      rotateDeg: 'rotate-0.5',
      accent: 'white',
      fullTitle: 'Материализация фанфиков, фан-арта и независимых историй',
      fullDesc: [
        'Миллионы авторов публикуют фанфики в сети, но мечтают подержать в руках настоящий печатный том с профессиональным оформлением и корешком.',
        'KnigAI позволяет превратить сетевой текст в шикарный коллекционный артбук или подарочный том с нуарными иллюстрациями, нумерацией страниц и типографской версткой.',
      ],
      bulletPoints: [
        'Создание лимитированных тиражей для друзей и подписчиков',
        'Интеграция авторских артов и иллюстраций с сохранением прозрачности',
        'Готовые пресеты для популярных жанров: киберпанк, исекай, детектив, мистика',
      ],
      ctaText: 'Оформить фан-книгу',
      targetRoute: 'constructor',
    },
    {
      id: '3d-reader',
      badge: 'Читалка',
      title: 'Публикация в приложении и бонусы за лайки',
      shortDesc: 'Публикуйте книги для онлайн-чтения в интерактивном формате с перелистыванием страниц и получайте реферальные баллы.',
      icon: <BookOpen className="w-5 h-5 text-rose-500" />,
      clipDesktop: 'polygon(0% 0%, 100% 2%, 98% 98%, 1% 100%)',
      rotateDeg: '-rotate-0.5',
      accent: 'rose',
      fullTitle: 'Интерактивная читалка и система авторских бонусов',
      fullDesc: [
        'Опубликуйте свою книгу в общем каталоге KnigAI платно или бесплатно в один клик. Читатели получают доступ к интерактивной трехмерной читалке с эффектом живого перелистывания страниц и шелеста бумаги.',
        'Делитесь ссылкой на книгу в соцсетях: за каждый лайк и прочтение начисляются реферальные баллы, которые можно использовать для генерации новых глав и заказа печати.',
      ],
      bulletPoints: [
        'Реалистичный 3D рендеринг книги с переворотом страниц и эффектом глубины',
        'Вирусная реферальная механика: делитесь книгой и получайте бонусы за лайки',
        'Монетизация авторских прав: открытый доступ или премиум-подписка',
      ],
      ctaText: 'Смотреть читалку',
      targetRoute: 'reader',
    },
    {
      id: 'translation',
      badge: 'Локализация',
      title: 'Перевод и адаптация зарубежных изданий',
      shortDesc: 'Переводите редкие зарубежные произведения, сохраняя авторский стиль и форматируя под стандарт А5.',
      icon: <BookMarked className="w-5 h-5 text-white" />,
      clipDesktop: 'polygon(1% 1%, 99% 0%, 100% 99%, 0% 98%)',
      rotateDeg: 'rotate-0.5',
      accent: 'white',
      fullTitle: 'Локализация и коллекционное издание редких книг',
      fullDesc: [
        'Многие интересные зарубежные книги никогда не издавались в России. С помощью KnigAI вы можете перевести текст с любого языка с глубокой литературной адаптацией.',
        'ИИ бережно сохраняет авторскую терминологию, адаптирует идиомы под русскоязычного читателя и верстает готовый том со сносками и оглавлением.',
      ],
      bulletPoints: [
        'Глубокая литературная адаптация с сохранением ритма оригинала',
        'Автоматическая генерация оглавления, примечаний и структуры глав',
        'Печать коллекционного экземпляра для личной домашней библиотеки',
      ],
      ctaText: 'Начать локализацию',
      targetRoute: 'constructor',
    },
  ];

  return (
    <div className="relative w-full flex flex-col gap-10 sm:gap-14 text-white pb-0 overflow-hidden mt-0 sm:-mt-[65px] font-['PT_Serif',serif]">
      {/* Background Interactive 3D Holographic NeuroBook (Three.js with Zigzag Scroll & Mouse Parallax) */}
      <NeuroBook />

      {/* 1. Full-width Hero Artwork Section with Parallax and Soft Fade Hiding Effect */}
      <section className="relative w-full overflow-hidden bg-black flex flex-col justify-start pt-1 sm:pt-0">

        {/* Parallax Image Container - smooth glide with vertical transparency mask */}
        <div
          style={{
            transform: `translateY(${Math.min(scrollY * 0.22, 160)}px) scale(1.05)`,
            transition: 'transform 0.05s ease-out',
            maskImage: 'linear-gradient(to bottom, black 60%, rgba(0,0,0,0.5) 82%, transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to bottom, black 60%, rgba(0,0,0,0.5) 82%, transparent 100%)',
          }}
          className="w-full will-change-transform relative z-0"
        >
          {/* Desktop Banner (KnigHero.png) - full width, natural aspect ratio, top not clipped, bottom fades softly */}
          <img
            src={KNIG_HERO_PC_URL}
            alt="KnigAI — Нейросетевая фабрика книг"
            className="hidden md:block w-full h-auto object-contain select-none pointer-events-none"
          />

          {/* Mobile Banner (HeroMob.jpg) - full width, natural aspect ratio, top not clipped */}
          <img
            src={HERO_MOB_URL}
            alt="KnigAI — Нейросетевая фабрика книг"
            className="md:hidden w-full h-auto object-contain object-top select-none pointer-events-none"
          />
        </div>

        {/* Bottom transparent gradient transition for seamless hiding behind next block */}
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-44 sm:h-64 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-10"
        />
      </section>

      {/* 2. Hero Headline, Description and Action Buttons (Overlapping bottom fade with 100% transparency) */}
      <section className="w-full px-[2%] sm:px-[5%] flex flex-col gap-6 max-w-4xl relative z-20 -mt-16 sm:-mt-24 md:-mt-32">
        {/* Rubik Marker Hatch Heading with ~30% random red words/letters */}
        <RubikMarkerHeading
          as="h1"
          text="«Лучший подарок — это собственная ИИ книга»"
          className="text-[28px] sm:text-[44px] lg:text-[50px] leading-[1.15] drop-shadow-[0_4px_10px_rgba(0,0,0,0.9)]"
        />

        {/* Subtitle / Pain point narrative - 100% transparent container with PT Serif */}
        <p className="text-[15px] sm:text-[18px] text-zinc-200 leading-relaxed font-['PT_Serif',serif] max-w-3xl bg-transparent p-0 pl-4 border-l-4 border-rose-600">
          Создайте полноценную книгу с любыми персонажами в пару кликов: сгенерируйте сюжет до 100 глав, иллюстрации, переплет формата А5 и напечатайте тираж <strong className="text-white underline decoration-rose-500">от 1 экземпляра</strong> с недорогой доставкой по всей России через проверенные типографии-партнеры.
        </p>

        {/* Action Buttons in Hero Section: ИИ-Конструктор and Читалка (Редактор переплета removed from hero) */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <NoirButton
            variant="primary"
            onClick={() => (currentUser ? onNavigate('profile') : onOpenAuth())}
            icon={<Sparkles className="w-4 h-4 text-black" />}
            className="text-[15px] px-6 py-3.5 bg-white hover:bg-zinc-200 text-black font-bold border-2 border-white shadow-xl"
          >
            ИИ-Конструктор
          </NoirButton>

          <NoirButton
            variant="outline"
            onClick={() => onNavigate('reader')}
            icon={<BookOpen className="w-4 h-4 text-rose-500" />}
            className="text-[15px] px-5 py-3.5 bg-black/80 hover:bg-zinc-900 border-2 border-zinc-500 text-white"
          >
            Читалка
          </NoirButton>
        </div>
      </section>

      {/* 3. Market Problem vs Solution (Manifesto) - Diagonal Slanted Container with Parallel Angle and Realtime Slide-in */}
      <section className="w-full px-[2%] sm:px-[5%] relative z-20">
        <SlantedScrollContainer
          variant="slant-left"
          slideDirection="left"
          className="flex flex-col md:flex-row items-center justify-between gap-6"
        >
          <div className="flex-1 flex flex-col gap-3">
            <div className="inline-flex items-center gap-2 text-rose-500 text-[14px] font-bold">
              <TrendingUp className="w-4 h-4" />
              <span>Свободная ниша на российском рынке</span>
            </div>
            <RubikMarkerHeading
              as="h2"
              text="Реально, обычный человек не знает, как издать свою книгу"
              className="text-[22px] sm:text-[30px] leading-tight"
            />
            <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed font-['PT_Serif',serif]">
              Есть рукопись, идея для комикса или наброски мемуаров — но куда идти? На Амазон ручками нельзя (он заблокирован для авторов из РФ), а классические типографии требуют заоблачные бюджеты. Мы взяли эту боль рынка и создали готовую фабрику: от первой мысли до осязаемого томика на вашей полке.
            </p>
          </div>

          <div className="w-full md:w-auto shrink-0 flex flex-col sm:flex-row md:flex-col gap-3">
            <div className="p-4 bg-transparent border border-white/30 flex flex-col gap-1 min-w-[220px]">
              <span className="text-[14px] text-zinc-400">Стоимость макета:</span>
              <span className="text-[20px] font-black text-white font-mono">0 ₽ за регистрацию</span>
            </div>
            <div className="p-4 bg-transparent border border-rose-600/60 flex flex-col gap-1 min-w-[220px]">
              <span className="text-[14px] text-zinc-400">Тираж для печати:</span>
              <span className="text-[20px] font-black text-rose-500 font-mono">от 1 экземпляра</span>
            </div>
          </div>
        </SlantedScrollContainer>
      </section>

      {/* 4. Manga Page Interactive Panels Section with Asymmetric Dynamic Manga Layout & One-by-One Animation */}
      <section className="w-full px-[2%] sm:px-[5%] flex flex-col gap-6 relative z-20">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 border-b-2 border-white/30 pb-4">
          <div>
            <RubikMarkerHeading
              as="h2"
              text="Готовые сценарии использования KnigAI"
              className="text-[24px] sm:text-[34px] leading-tight"
            />
          </div>
        </div>

        {/* Asymmetric Manga Panel Pairs: 2-in-a-row on both Mobile and PC with Parallel Dividing Borders & Variable Proportions */}
        {/* Asymmetric Manga Panel Pairs with Continuous Scroll Fall Entry & Displacement Physics */}
        <div className="relative w-full flex flex-col gap-3 sm:gap-8">
          {/* Pair 1: Items 0 (58% mobile / 57% desktop) & 1 (41% mobile / 41% desktop, offset) with gap-1 */}
          <MangaRowPair
            leftPanel={mangaPanels[0]}
            rightPanel={mangaPanels[1]}
            leftIndex={0}
            rightIndex={1}
            leftWidthClass="w-[58%] sm:w-[57%]"
            rightWidthClass="w-[41%] sm:w-[41%] mt-3 sm:mt-10"
            onSelectPanel={setSelectedPanel}
          />

          {/* Pair 2: Items 2 (41% mobile / 41% desktop, offset) & 3 (58% mobile / 57% desktop) with gap-1 */}
          <MangaRowPair
            leftPanel={mangaPanels[2]}
            rightPanel={mangaPanels[3]}
            leftIndex={2}
            rightIndex={3}
            leftWidthClass="w-[41%] sm:w-[41%] mt-3 sm:mt-12"
            rightWidthClass="w-[58%] sm:w-[57%]"
            onSelectPanel={setSelectedPanel}
          />

          {/* Pair 3: Items 4 (56% mobile / 54% desktop) & 5 (43% mobile / 44% desktop, offset) with gap-1 */}
          <MangaRowPair
            leftPanel={mangaPanels[4]}
            rightPanel={mangaPanels[5]}
            leftIndex={4}
            rightIndex={5}
            leftWidthClass="w-[56%] sm:w-[54%]"
            rightWidthClass="w-[43%] sm:w-[44%] mt-3 sm:mt-9"
            onSelectPanel={setSelectedPanel}
          />

          {/* Pair 4: Items 6 (43% mobile / 43% desktop, offset) & 7 (56% mobile / 55% desktop) with gap-1 */}
          <MangaRowPair
            leftPanel={mangaPanels[6]}
            rightPanel={mangaPanels[7]}
            leftIndex={6}
            rightIndex={7}
            leftWidthClass="w-[43%] sm:w-[43%] mt-3 sm:mt-10"
            rightWidthClass="w-[56%] sm:w-[55%]"
            onSelectPanel={setSelectedPanel}
          />
        </div>
      </section>

      {/* 5. Interactive Letters & Token Pricing Calculator with Slanted Diagonal Edges */}
      <LandingCalculatorSection
        currentUser={currentUser}
        onOpenAuth={onOpenAuth}
        onNavigate={onNavigate}
      />

      {/* 5b. KnigAI SEO Journal / Blog Preview */}
      <LandingBlogSection
        currentUser={currentUser}
        onOpenBlogIndex={() => onNavigate('blog')}
        onOpenBlogPost={(slug) => (onOpenBlogPost ? onOpenBlogPost(slug) : onNavigate('blog'))}
      />

      {/* 6. Secondary CTA Banner - Slanted Container with Parallel Border and Realtime Slide-in */}
      <section id="secondary-cta-section" className="w-full px-[2%] sm:px-[5%] relative z-20">
        <SlantedScrollContainer
          variant="slant-right"
          slideDirection="right"
          className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left"
        >
          <div className="flex flex-col gap-3 max-w-xl relative z-10">
            <RubikMarkerHeading
              as="h2"
              text="Готовы создать первую книгу прямо сейчас?"
              className="text-[22px] sm:text-[32px] leading-tight"
            />
            <p className="text-[14px] sm:text-[15px] text-zinc-300 leading-relaxed font-['PT_Serif',serif]">
              Регистрация занимает 30 секунд. Вы сразу получаете доступ ко всем генераторам, каскаду глав до 100 частей, редактору переплета А5 и персональной галерее с сохранением прозрачности PNG.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 relative z-10 w-full sm:w-auto">
            <NoirButton
              variant="primary"
              onClick={() => handleCta('constructor')}
              className="w-full sm:w-auto text-[15px] px-6 py-3.5 font-bold bg-white text-black hover:bg-zinc-200 border-2 border-white"
            >
              Начать бесплатно
            </NoirButton>
            <NoirButton
              variant="outline"
              onClick={() => onNavigate('reader')}
              className="w-full sm:w-auto text-[15px] px-5 py-3.5 border border-zinc-600 hover:border-white text-white"
            >
              Смотреть читалку
            </NoirButton>
          </div>
        </SlantedScrollContainer>
      </section>

      {/* 5. Clickable Modal for Selected Manga Panel */}
      {selectedPanel && (
        <NoirModal
          isOpen={!!selectedPanel}
          onClose={() => setSelectedPanel(null)}
          title={selectedPanel.fullTitle}
          maxWidth="max-w-2xl"
        >
          <div className="flex flex-col gap-5 text-white">
            {/* Badge & Icon banner */}
            <div className="flex items-center gap-2.5 pb-3 border-b border-zinc-800">
              <div className="p-1 bg-transparent border-0 flex items-center justify-center">
                {selectedPanel.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-[14px] font-mono text-rose-400">
                  {selectedPanel.badge}
                </span>
                <span className="text-[16px] font-bold text-white">
                  {selectedPanel.title}
                </span>
              </div>
            </div>

            {/* Description Paragraphs */}
            <div className="flex flex-col gap-3 text-[14px] sm:text-[15px] text-zinc-200 leading-relaxed font-serif">
              {selectedPanel.fullDesc.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {/* Bullet Points */}
            <div className="p-4 bg-zinc-950 border border-zinc-800 flex flex-col gap-2.5">
              <h4 className="text-[14px] font-bold text-white tracking-wide font-mono">
                Ключевые преимущества:
              </h4>
              <ul className="flex flex-col gap-2 text-[14px] text-zinc-300">
                {selectedPanel.bulletPoints.map((bp, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <CheckCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                    <span>{bp}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-zinc-800">
              <NoirButton
                variant="subtle"
                onClick={() => setSelectedPanel(null)}
                className="text-[14px]"
              >
                Закрыть
              </NoirButton>

              <NoirButton
                variant="primary"
                onClick={() => {
                  const target = selectedPanel.targetRoute;
                  setSelectedPanel(null);
                  handleCta(target);
                }}
                icon={<ArrowRight className="w-4 h-4 text-black" />}
                className="text-[14px] font-bold bg-white text-black hover:bg-zinc-200"
              >
                {selectedPanel.ctaText}
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Footer with legal requisites, message bubble buttons and oferta */}
      <LandingFooter onNavigate={onNavigate} />
    </div>
  );
};
