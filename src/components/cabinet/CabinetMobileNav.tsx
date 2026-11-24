import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Library,
  BookOpen,
  User,
  ListOrdered,
  Users,
  Palette,
  Glasses,
  Image as ImageIcon,
  Shield,
  Menu,
  X,
  ChevronRight,
  LogOut,
  Coins,
  Bell,
} from 'lucide-react';
import { AppRoute, AppUser } from '../../types';
import { isUserAdmin } from '../../services/auth/authService';
import { KNIG_ROUND_URL } from '../../constants/assets';

interface CabinetMobileNavProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  currentUser: AppUser | null;
  onLogout: () => void;
  onOpenAuth: () => void;
}

interface MainTab {
  id: AppRoute;
  label: string;
  icon: React.ReactNode;
  matches: AppRoute[];
  subsections: { id: AppRoute; label: string; icon: React.ReactNode }[];
}

export const CabinetMobileNav: React.FC<CabinetMobileNavProps> = ({
  currentRoute,
  onRouteChange,
  currentUser,
  onLogout,
  onOpenAuth,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  if (!currentUser) {
    return (
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-t border-white/20 p-1.5 flex items-center justify-between gap-1 font-['PT_Serif',serif]">
        <button
          type="button"
          onClick={() => onRouteChange('landing')}
          className="flex-1 min-h-[44px] py-1 px-1 flex flex-col items-center justify-center text-[14px] text-zinc-300 border border-zinc-800 bg-zinc-950 hover:border-white transition-colors cursor-pointer"
        >
          <span>Главная</span>
        </button>
        <button
          type="button"
          onClick={() => onRouteChange('library')}
          className={`flex-1 min-h-[44px] py-1 px-1 flex flex-col items-center justify-center text-[14px] font-bold border transition-colors cursor-pointer ${
            currentRoute === 'library'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
          }`}
        >
          <span>Библиотека</span>
        </button>
        <button
          type="button"
          onClick={() => onRouteChange('reader')}
          className={`flex-1 min-h-[44px] py-1 px-1 flex flex-col items-center justify-center text-[14px] font-bold border transition-colors cursor-pointer ${
            currentRoute === 'reader'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
          }`}
        >
          <span>Читалка</span>
        </button>
        <button
          type="button"
          onClick={onOpenAuth}
          className="min-h-[44px] px-3 bg-zinc-900 border border-rose-500 text-rose-300 text-[14px] font-bold cursor-pointer shrink-0"
        >
          Войти
        </button>
      </div>
    );
  }

  const isAdmin = isUserAdmin(currentUser);

  // Exactly 3 main sections as required: Profile, Library, Constructor
  const mainTabs: MainTab[] = [
    {
      id: 'profile',
      label: 'Профиль',
      icon: <User className="w-5 h-5" />,
      matches: ['profile', 'balance', 'notifications', 'admin'],
      subsections: [
        { id: 'profile', label: 'Профиль автора', icon: <User className="w-4 h-4" /> },
        { id: 'balance', label: 'Баланс и история', icon: <Coins className="w-4 h-4 text-rose-500" /> },
        { id: 'notifications', label: 'Уведомления', icon: <Bell className="w-4 h-4 text-rose-500" /> },
        ...(isAdmin
          ? [{ id: 'admin' as AppRoute, label: 'Админка', icon: <Shield className="w-4 h-4 text-rose-500" /> }]
          : []),
      ],
    },
    {
      id: 'library',
      label: 'Библиотека',
      icon: <Library className="w-5 h-5" />,
      matches: ['library', 'reader', 'public-read'],
      subsections: [
        { id: 'library', label: 'Библиотека книг', icon: <Library className="w-3.5 h-3.5" /> },
        { id: 'reader', label: 'Читалка', icon: <Glasses className="w-3.5 h-3.5" /> },
      ],
    },
    {
      id: 'constructor',
      label: 'Конструктор',
      icon: <BookOpen className="w-5 h-5" />,
      matches: ['constructor', 'chapters', 'characters', 'cover', 'gallery'],
      subsections: [
        { id: 'constructor', label: 'Конструктор', icon: <BookOpen className="w-3.5 h-3.5" /> },
        { id: 'chapters', label: 'Главы', icon: <ListOrdered className="w-3.5 h-3.5" /> },
        { id: 'characters', label: 'Персонажи', icon: <Users className="w-3.5 h-3.5" /> },
        { id: 'cover', label: 'Переплет', icon: <Palette className="w-3.5 h-3.5" /> },
        { id: 'gallery', label: 'Галерея', icon: <ImageIcon className="w-3.5 h-3.5" /> },
      ],
    },
  ];

  const handleSelectRoute = (route: AppRoute) => {
    onRouteChange(route);
    setIsOpen(false);
  };

  return (
    <>
      {/* Full Structure Drawer when user taps overview/menu */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="lg:hidden fixed inset-0 z-[480] bg-black/65 backdrop-blur-md flex flex-col justify-end p-2.5 animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false);
          }}
        >
          <div
            className="w-full max-h-[85vh] noir-modal border-2 border-white p-4 flex flex-col gap-3 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/20 shrink-0">
              <div
                onClick={() => handleSelectRoute('profile')}
                className="flex items-center gap-3 cursor-pointer group"
                title="Перейти в профиль"
              >
                <div className="w-12 h-12 rounded-full overflow-hidden bg-transparent border-0 flex items-center justify-center shrink-0">
                  <img src={currentUser.avatar_url || KNIG_ROUND_URL} alt="Фото профиля" className="w-full h-full object-cover rounded-full" />
                </div>
                <div className="flex flex-col leading-tight">
                  <span className="text-[15px] font-bold text-white group-hover:text-rose-400 transition-colors">
                    {currentUser.name || 'Автор KnigAI'}
                  </span>
                  <span className="text-[14px] text-zinc-400">
                    UID: {currentUser.uid}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-zinc-700 bg-zinc-900 text-white hover:bg-white hover:text-black cursor-pointer"
                aria-label="Закрыть"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Vertical list of 3 Main Groups & their mutual sub-sections */}
            <div className="overflow-y-auto flex-1 flex flex-col gap-3 pr-1 py-1">
              {mainTabs.map((group) => {
                const isGroupActive = group.matches.includes(currentRoute);

                return (
                  <div
                    key={group.id}
                    className={`p-3 border flex flex-col gap-2.5 transition-all ${
                      isGroupActive ? 'bg-zinc-900 border-white' : 'bg-zinc-950/80 border-zinc-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectRoute(group.id)}
                      className="w-full flex items-center justify-between text-left cursor-pointer min-h-[44px]"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="shrink-0 text-white">{group.icon}</span>
                        <span className="text-[16px] font-bold text-white">{group.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isGroupActive && (
                          <span className="px-2 py-0.5 bg-white text-black text-[14px] font-bold">
                            Активен
                          </span>
                        )}
                        <ChevronRight className="w-4 h-4 text-zinc-400" />
                      </div>
                    </button>

                    {/* Subsections Message Bubbles */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-zinc-800/80">
                      {group.subsections.map((sub) => {
                        const isSubActive = currentRoute === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => handleSelectRoute(sub.id)}
                            className={`min-h-[38px] px-3 py-1 text-[14px] flex items-center gap-1.5 transition-colors cursor-pointer text-left ${
                              isSubActive
                                ? 'bg-white text-black font-bold border-2 border-white'
                                : 'bg-zinc-900 hover:bg-white hover:text-black text-zinc-300 border border-zinc-700'
                            }`}
                          >
                            {sub.icon}
                            <span>{sub.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Logout button inside drawer */}
            <div className="pt-2 border-t border-zinc-800 shrink-0 flex items-center justify-between">
              <span className="text-[14px] text-zinc-400 font-mono">UID: {currentUser.uid}</span>
              <button
                type="button"
                onClick={() => {
                  onLogout();
                  setIsOpen(false);
                }}
                className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-rose-950/60 border border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-rose-200 text-[14px] font-bold flex items-center gap-2 cursor-pointer transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Выйти</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Main 3 Sections Bottom Navbar: Профиль, Библиотека, Конструктор */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-black/95 backdrop-blur-md border-t border-white/20 px-2 py-1.5 pb-safe">
        <div className="max-w-md mx-auto grid grid-cols-4 gap-1 text-center">
          {mainTabs.map((tab) => {
            const isActive = tab.matches.includes(currentRoute);

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleSelectRoute(tab.id)}
                className={`min-h-[50px] py-1 px-1 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white text-black font-bold border-2 border-white'
                    : 'text-zinc-300 hover:text-white bg-zinc-950/80 border border-zinc-800'
                }`}
              >
                <span className="shrink-0">{tab.icon}</span>
                <span className="text-[14px] leading-tight truncate max-w-full">
                  {tab.label}
                </span>
              </button>
            );
          })}

          {/* 4th button: Все разделы / Меню drawer */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="min-h-[50px] py-1 px-1 flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer text-zinc-300 hover:text-white bg-zinc-900/90 border border-zinc-700"
            title="Все разделы кабинета"
          >
            <Menu className="w-5 h-5 shrink-0" />
            <span className="text-[14px] leading-tight truncate max-w-full">
              Разделы
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};
