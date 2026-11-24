import React from 'react';
import {
  Library,
  BookOpen,
  ListOrdered,
  Users,
  Palette,
  Glasses,
  Image as ImageIcon,
  Shield,
  User,
  LogOut,
  ChevronRight,
  BookMarked,
} from 'lucide-react';
import { AppRoute, AppUser, Book } from '../../types';
import { isUserAdmin } from '../../services/auth/authService';
import { KNIG_LOGO_URL, KNIG_ROUND_URL } from '../../constants/assets';

interface CabinetSidebarProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  currentUser: AppUser | null;
  activeBook: Book | null;
  onLogout: () => void;
  onOpenAuth: () => void;
}

export const CabinetSidebar: React.FC<CabinetSidebarProps> = ({
  currentRoute,
  onRouteChange,
  currentUser,
  activeBook,
  onLogout,
  onOpenAuth,
}) => {
  if (!currentUser) {
    return (
      <aside className="w-64 shrink-0 hidden lg:flex flex-col gap-4">
        <div className="noir-container p-5 border-2 border-white flex flex-col gap-3 font-serif">
          <div className="flex items-center gap-2">
            <div className="h-8 w-auto bg-transparent flex items-center justify-center shrink-0">
              <img src={KNIG_LOGO_URL} alt="KnigAI" className="h-8 w-auto max-w-[140px] object-contain" />
            </div>
            <span className="text-[16px] font-bold text-white">Гостевой режим</span>
          </div>
          <p className="text-[14px] text-zinc-300 leading-relaxed">
            Вам доступна общая библиотека опубликованных книг и офлайн-кэш для чтения.
          </p>
          <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => onRouteChange('library')}
              className={`w-full min-h-[40px] px-3 text-left text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
                currentRoute === 'library'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
              }`}
            >
              <Library className="w-4 h-4 text-rose-500" />
              <span>Общая библиотека</span>
            </button>
            <button
              type="button"
              onClick={() => onRouteChange('reader')}
              className={`w-full min-h-[40px] px-3 text-left text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer ${
                currentRoute === 'reader'
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
              }`}
            >
              <Glasses className="w-4 h-4 text-rose-500" />
              <span>Читалка</span>
            </button>
          </div>
          <div className="pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onOpenAuth}
              className="w-full min-h-[44px] px-3 bg-white text-black text-[14px] font-bold hover:bg-zinc-200 transition-colors cursor-pointer text-center"
            >
              Войти / Регистрация
            </button>
          </div>
        </div>
      </aside>
    );
  }

  const isAdmin = isUserAdmin(currentUser);

  // 3 Main Sections according to requirements: Profile, Library, Constructor
  const menuItems: {
    id: AppRoute;
    label: string;
    icon: React.ReactNode;
    desc: string;
    subItems: string;
    matches: AppRoute[];
  }[] = [
    {
      id: 'profile',
      label: 'Профиль',
      icon: <User className="w-4 h-4" />,
      desc: 'Главная страница кабинета',
      subItems: isAdmin ? 'Профиль · Баланс · Уведомления · Админка' : 'Профиль · Баланс · Уведомления',
      matches: ['profile', 'balance', 'notifications', 'admin'],
    },
    {
      id: 'library',
      label: 'Библиотека',
      icon: <Library className="w-4 h-4" />,
      desc: 'Все книги автора',
      subItems: 'Библиотека · Читалка',
      matches: ['library', 'reader', 'public-read'],
    },
    {
      id: 'constructor',
      label: 'Конструктор',
      icon: <BookOpen className="w-4 h-4" />,
      desc: 'Фабрика создания книг',
      subItems: 'Конструктор · Главы · Персонажи · Переплет · Галерея',
      matches: ['constructor', 'chapters', 'characters', 'cover', 'gallery'],
    },
  ];

  return (
    <aside className="w-64 shrink-0 hidden lg:flex flex-col gap-4">
      {/* Profile Card */}
      <div
        onClick={() => onRouteChange('profile')}
        className={`noir-container p-4 border flex flex-col gap-3 cursor-pointer transition-all ${
          currentRoute === 'profile'
            ? 'border-white bg-zinc-900/90 shadow-lg'
            : 'border-white/40 hover:border-white'
        }`}
        title="Перейти в профиль автора"
      >
        <div className="flex items-center gap-3">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-transparent border-0 flex items-center justify-center shrink-0">
            <img src={currentUser.avatar_url || KNIG_ROUND_URL} alt="Фото профиля" className="w-full h-full object-cover rounded-full" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-white truncate" title={currentUser.name || currentUser.email}>
              {currentUser.name || 'Автор KnigAI'}
            </div>
            <div className="text-[14px] text-zinc-400 truncate" title={currentUser.email}>
              {currentUser.email}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-[14px] font-mono">
          <span className="text-zinc-400">UID:</span>
          <span className="text-white font-bold">{currentUser.uid}</span>
        </div>

        {isAdmin && (
          <div className="px-2 py-1 bg-rose-950/80 border border-rose-600 text-rose-200 text-[14px] font-bold text-center">
            Администратор системы
          </div>
        )}

        {activeBook && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRouteChange('reader');
            }}
            className="w-full p-2.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 hover:border-rose-500 flex items-center justify-between gap-2 text-[14px] text-left transition cursor-pointer group"
            title="Открыть эту книгу в читалке"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Glasses className="w-4 h-4 text-rose-500 shrink-0 group-hover:scale-110 transition-transform" />
              <div className="flex flex-col truncate">
                <span className="text-zinc-200 group-hover:text-white font-bold truncate text-[14px]">
                  {activeBook.title}
                </span>
                <span className="text-[14px] text-zinc-400 group-hover:text-rose-400 font-mono">
                  Открыть читалку →
                </span>
              </div>
            </div>
            <BookMarked className="w-4 h-4 text-zinc-500 shrink-0 group-hover:text-rose-400" />
          </button>
        )}
      </div>

      {/* Navigation Menu */}
      <nav className="noir-container p-2 border border-zinc-700 flex flex-col gap-1">
        <div className="px-3 py-1.5 text-[14px] text-zinc-400 font-bold border-b border-zinc-800 mb-1">
          Личный кабинет:
        </div>

        {menuItems.map((item) => {
          const isActive = item.matches.includes(currentRoute);

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onRouteChange(item.id)}
              className={`w-full min-h-[48px] px-3 py-2 text-[14px] font-bold flex items-center justify-between text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-white text-black border-2 border-white shadow-md'
                  : 'bg-zinc-950/60 text-zinc-300 hover:bg-zinc-900 hover:text-white border border-transparent hover:border-zinc-700'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="shrink-0">{item.icon}</span>
                <div className="flex flex-col leading-tight truncate">
                  <span className="truncate">{item.label}</span>
                  <span className={`text-[14px] opacity-80 truncate font-normal ${isActive ? 'text-zinc-800' : 'text-zinc-400'}`}>
                    {item.subItems}
                  </span>
                </div>
              </div>
              <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isActive ? 'translate-x-0.5' : 'opacity-40'}`} />
            </button>
          );
        })}

        <div className="pt-2 mt-1 border-t border-zinc-800">
          <button
            type="button"
            onClick={onLogout}
            className="w-full min-h-[40px] px-3 text-[14px] font-bold bg-zinc-950 hover:bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800 flex items-center gap-2 cursor-pointer transition-colors"
          >
            <LogOut className="w-4 h-4 text-zinc-400" />
            <span>Выйти из кабинета</span>
          </button>
        </div>
      </nav>
    </aside>
  );
};
