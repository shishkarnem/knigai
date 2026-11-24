import React from 'react';
import {
  BookOpen,
  ListOrdered,
  Users,
  Palette,
  Image as ImageIcon,
  Library,
  Glasses,
  User,
  Shield,
  BookMarked,
  Coins,
  Bell,
} from 'lucide-react';
import { AppRoute, AppUser, Book, Chapter } from '../../types';
import { isUserAdmin } from '../../services/auth/authService';

interface CabinetSubnavProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  currentUser: AppUser | null;
  activeBook?: Book | null;
  chapters?: Chapter[];
}

interface SubnavItem {
  id: AppRoute;
  label: string;
  shortLabel?: string;
  icon: React.ReactNode;
  badge?: string;
}

export const CabinetSubnav: React.FC<CabinetSubnavProps> = ({
  currentRoute,
  onRouteChange,
  currentUser,
  activeBook,
  chapters = [],
}) => {
  const isAdmin = currentUser ? isUserAdmin(currentUser) : false;

  const writtenCount = chapters.filter((c) => c.content && c.content.trim().length > 100).length;
  const totalPlanned = chapters.length;
  const chaptersBadge = activeBook
    ? totalPlanned > 0
      ? `${writtenCount}/${totalPlanned}`
      : `0/${activeBook.target_chapters || 10}`
    : undefined;

  // 1. Identify which group the current route belongs to
  const isConstructorGroup = ['constructor', 'chapters', 'characters', 'cover', 'gallery'].includes(currentRoute);
  const isLibraryGroup = ['library', 'reader'].includes(currentRoute);
  const isProfileGroup = ['profile', 'balance', 'notifications', 'admin'].includes(currentRoute);

  let groupTitle = '';
  let groupItems: SubnavItem[] = [];

  if (isConstructorGroup) {
    groupTitle = 'Раздел: Конструктор';
    groupItems = [
      {
        id: 'constructor',
        label: 'Конструктор',
        shortLabel: 'Конструктор',
        icon: <BookOpen className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'chapters',
        label: 'Главы',
        shortLabel: 'Главы',
        icon: <ListOrdered className="w-4 h-4 shrink-0" />,
        badge: chaptersBadge,
      },
      {
        id: 'characters',
        label: 'Персонажи и Лор',
        shortLabel: 'Лор и Герои',
        icon: <Users className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'cover',
        label: 'Переплет',
        shortLabel: 'Переплет',
        icon: <Palette className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'gallery',
        label: 'Галерея',
        shortLabel: 'Галерея',
        icon: <ImageIcon className="w-4 h-4 shrink-0" />,
      },
    ];
  } else if (isLibraryGroup) {
    groupTitle = 'Раздел: Библиотека';
    groupItems = [
      {
        id: 'library',
        label: 'Библиотека книг',
        shortLabel: 'Библиотека',
        icon: <Library className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'reader',
        label: 'Читалка',
        shortLabel: 'Читалка',
        icon: <Glasses className="w-4 h-4 shrink-0" />,
      },
    ];
  } else if (isProfileGroup) {
    groupTitle = 'Раздел: Профиль';
    groupItems = [
      {
        id: 'profile',
        label: 'Профиль автора',
        shortLabel: 'Профиль',
        icon: <User className="w-4 h-4 shrink-0" />,
      },
      {
        id: 'balance',
        label: 'Баланс и история',
        shortLabel: 'Баланс',
        icon: <Coins className="w-4 h-4 shrink-0 text-rose-500" />,
      },
      {
        id: 'notifications',
        label: 'Уведомления',
        shortLabel: 'Уведомления',
        icon: <Bell className="w-4 h-4 shrink-0 text-rose-500" />,
      },
    ];

    if (isAdmin) {
      groupItems.push({
        id: 'admin',
        label: 'Админка',
        shortLabel: 'Админка',
        icon: <Shield className="w-4 h-4 shrink-0 text-rose-500" />,
        badge: 'root',
      });
    }
  } else {
    return null;
  }

  return (
    <div className="w-full bg-zinc-950/70 border border-zinc-800 p-2.5 sm:p-3 backdrop-blur-md transition-colors flex flex-col gap-2.5">
      {/* Top bar with group indicator and active book info if available */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-rose-500 shrink-0" />
          <span className="text-[14px] font-bold text-zinc-300 font-mono tracking-tight">
            {groupTitle}
          </span>
        </div>

        {activeBook && isConstructorGroup && (
          <div className="flex items-center gap-1.5 text-[14px] text-zinc-400 max-w-full truncate">
            <BookMarked className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span className="text-zinc-500 hidden sm:inline">Книга:</span>
            <span className="text-white font-bold truncate max-w-[200px] sm:max-w-[320px]">
              «{activeBook.title}»
            </span>
          </div>
        )}
      </div>

      {/* Mutual Switcher Buttons - Message Bubble Noir Style without rounded corners */}
      {/* On mobile: flex-wrap to prevent horizontal scrolling */}
      <div className="flex flex-wrap items-center gap-2">
        {groupItems.map((item) => {
          const isActive = currentRoute === item.id;
          const isItemAdmin = item.id === 'admin';

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onRouteChange(item.id)}
              className={`relative min-h-[44px] px-3.5 sm:px-4 py-2 text-[14px] font-bold flex items-center gap-2 transition-all cursor-pointer select-none ${
                isActive
                  ? isItemAdmin
                    ? 'bg-rose-950 text-white border-2 border-rose-500 shadow-md'
                    : 'bg-white text-black border-2 border-white shadow-md'
                  : 'bg-zinc-950/80 hover:bg-zinc-900 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-500'
              }`}
            >
              {item.icon}
              <span className="leading-none">{item.label}</span>

              {item.badge && (
                <span
                  className={`text-[14px] px-1.5 py-0.5 font-mono font-bold leading-none ${
                    isActive
                      ? 'bg-black text-white'
                      : 'bg-zinc-800 text-zinc-300 border border-zinc-600'
                  }`}
                >
                  {item.badge}
                </span>
              )}

              {/* Message Bubble Tail Indicator when active */}
              {isActive && (
                <span
                  aria-hidden="true"
                  className={`absolute -bottom-1.5 left-4 w-2 h-2 rotate-45 ${
                    isItemAdmin ? 'bg-rose-500' : 'bg-white'
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};
