import React, { useState, useEffect } from 'react';
import { Library, Coins, Bell, Newspaper, LogIn } from 'lucide-react';
import { AppRoute, Book, AppUser } from '../../types';
import { KNIG_LOGO_URL, KNIG_ROUND_URL } from '../../constants/assets';
import { getUnreadNotificationsCount, NOTIFICATIONS_EVENT } from '../../services/billing/notificationService';
import { BALANCE_CHANGED_EVENT } from '../../services/billing/transactionService';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { HeaderBalanceModal, HeaderNotificationsModal } from '../billing/HeaderQuickModals';

interface NoirHeaderProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
  activeBook: Book | null;
  currentUser: AppUser | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onExportClick?: () => void;
  onNewBookClick?: () => void;
}

export const NoirHeader: React.FC<NoirHeaderProps> = ({
  currentRoute,
  onRouteChange,
  currentUser,
  onOpenAuth,
}) => {
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveBalance, setLiveBalance] = useState<number>(currentUser?.letters_balance ?? 1000000);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  useEffect(() => {
    setLiveBalance(currentUser?.letters_balance ?? 1000000);
  }, [currentUser?.letters_balance, currentUser?.uid]);

  useEffect(() => {
    const onBalChange = (e: Event) => {
      const custom = e as CustomEvent<{ balance?: number }>;
      if (typeof custom.detail?.balance === 'number') {
        setLiveBalance(custom.detail.balance);
      }
    };
    window.addEventListener(BALANCE_CHANGED_EVENT, onBalChange);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, onBalChange);
  }, []);

  useEffect(() => {
    if (!currentUser?.uid) {
      setUnreadCount(0);
      return;
    }
    const refreshUnread = () => {
      getUnreadNotificationsCount(currentUser.uid).then(setUnreadCount).catch(() => {});
    };
    refreshUnread();
    const timer = setInterval(refreshUnread, 30000);
    window.addEventListener(NOTIFICATIONS_EVENT, refreshUnread);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_EVENT, refreshUnread);
    };
  }, [currentUser?.uid]);

  return (
    <>
      <header className="sticky top-0 z-40 w-full bg-black/65 border-b border-white/15 py-2 sm:py-2.5 backdrop-blur-md transition-colors">
        <div className="w-full px-2.5 sm:px-[5%] flex flex-nowrap items-center justify-between gap-1.5 sm:gap-3">
          {/* 1. Brand Logo (Compact single-row logo on mobile, full wordmark on sm+) */}
          <div className="flex items-center shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => onRouteChange('landing')}
              className="flex items-center gap-2 sm:gap-2.5 text-left focus:outline-hidden cursor-pointer group shrink-0"
              title="Главная страница (Лендинг)"
              aria-label="KnigAI — на главную"
            >
              <div className="h-8 sm:h-9 w-auto bg-transparent flex items-center justify-center p-0 shrink-0">
                <img
                  src={KNIG_LOGO_URL}
                  alt="KnigAI"
                  className="h-7 sm:h-9 w-auto max-w-[88px] sm:max-w-[180px] object-contain"
                />
              </div>
              <div className="hidden sm:flex flex-col justify-center text-left">
                <span className="font-['Rubik_Marker_Hatch',cursive] text-[20px] sm:text-[23px] tracking-wide text-white leading-none">
                  Knig<span className="text-rose-500">AI</span>
                </span>
                <span className="text-[14px] text-zinc-300 font-bold flex items-center gap-1.5 mt-0.5 tracking-wide leading-none">
                  <span className="w-1.5 h-1.5 bg-rose-500 shrink-0" />
                  <span>
                    ИИ-фабрика <span className="text-rose-500">книг</span>
                  </span>
                </span>
              </div>
            </button>
          </div>

          {/* Center label when in Cabinet on wide desktop */}
          {currentUser && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-zinc-950/70 border border-zinc-800 text-[14px] text-zinc-300 shrink-0">
              <span className="w-2 h-2 bg-rose-500 rounded-none shrink-0" />
              <span>Личный кабинет автора</span>
            </div>
          )}

          {/* Right Actions: Strict single row on mobile & desktop */}
          {currentUser ? (
            <div className="flex flex-nowrap items-center justify-end gap-1 sm:gap-2 shrink-0">
              {/* 2. Blog Icon */}
              <button
                type="button"
                onClick={() => onRouteChange('blog')}
                title="Блог и статьи KnigAI"
                aria-label="Блог KnigAI"
                className={`flex items-center justify-center gap-1.5 w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-h-[44px] sm:px-3 bg-zinc-950/80 border transition-all text-[14px] font-bold cursor-pointer whitespace-nowrap rounded-none shrink-0 ${
                  currentRoute === 'blog' || currentRoute === 'blog-post'
                    ? 'border-white text-white'
                    : 'border-zinc-700 hover:border-rose-500 text-zinc-200 hover:text-white'
                }`}
              >
                <Newspaper className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="hidden sm:inline">Блог</span>
              </button>

              {/* 3. Question / Pricing Info Modal Icon */}
              <PricingInfoModalButton compact />

              {/* 4. Notifications Bell Icon (opens quick modal with link to /notifications) */}
              <button
                type="button"
                onClick={() => setIsNotificationsModalOpen(true)}
                title="Уведомления"
                aria-label="Уведомления"
                className={`relative flex items-center justify-center w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-w-[44px] sm:min-h-[44px] sm:px-2.5 bg-zinc-950/80 border transition-all cursor-pointer rounded-none shrink-0 ${
                  currentRoute === 'notifications'
                    ? 'border-white text-white'
                    : 'border-zinc-700 hover:border-rose-500 text-zinc-200 hover:text-white'
                }`}
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5 text-rose-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-rose-600 text-white text-[14px] font-mono font-bold flex items-center justify-center border border-black leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* 5. Balance Icon (opens quick balance modal with link to /balance) */}
              <button
                type="button"
                onClick={() => setIsBalanceModalOpen(true)}
                title={`Баланс: ${liveBalance.toLocaleString('ru-RU')} букв (нажмите для деталей)`}
                aria-label={`Баланс: ${liveBalance.toLocaleString('ru-RU')} букв`}
                className={`flex items-center justify-center gap-1.5 w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-h-[44px] sm:px-3 bg-zinc-950/80 border transition-all text-[14px] cursor-pointer whitespace-nowrap rounded-none shrink-0 ${
                  currentRoute === 'balance'
                    ? 'border-white text-white'
                    : 'border-zinc-700 hover:border-rose-500 text-zinc-300 hover:text-white'
                }`}
              >
                <Coins className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="hidden sm:inline font-mono font-bold text-white">
                  {liveBalance.toLocaleString('ru-RU')} букв
                </span>
              </button>

              {/* 6. Profile Icon / Avatar (opens /profile where Logout lives) */}
              <button
                type="button"
                onClick={() => onRouteChange('profile')}
                title="Профиль автора и выход"
                aria-label="Профиль автора"
                className={`flex items-center justify-center gap-2 sm:gap-2.5 w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-h-[44px] p-0 sm:px-2.5 sm:py-1 bg-zinc-950/80 hover:bg-zinc-900 border transition-all text-[14px] cursor-pointer text-left rounded-none shrink-0 ${
                  currentRoute === 'profile'
                    ? 'border-white'
                    : 'border-zinc-700 hover:border-white'
                }`}
              >
                <div className="w-full h-full sm:w-9 sm:h-9 overflow-hidden bg-transparent sm:border sm:border-zinc-700 p-0 flex items-center justify-center shrink-0">
                  <img
                    src={currentUser.avatar_url || KNIG_ROUND_URL}
                    alt="Профиль"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="hidden md:flex flex-col text-left leading-tight">
                  <span className="font-bold text-white text-[14px] truncate max-w-[140px]">
                    {currentUser.name || currentUser.email}
                  </span>
                  <span className="font-mono text-zinc-400 text-[14px]">
                    UID: {currentUser.uid}
                  </span>
                </div>
              </button>
            </div>
          ) : (
            /* Guest header: single row on mobile & desktop */
            <div className="flex flex-nowrap items-center justify-end gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onRouteChange('blog')}
                title="Открыть блог KnigAI"
                aria-label="Блог KnigAI"
                className={`flex items-center justify-center gap-1.5 w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-h-[40px] sm:px-3.5 text-[14px] font-bold border transition-colors cursor-pointer rounded-none shrink-0 ${
                  currentRoute === 'blog' || currentRoute === 'blog-post'
                    ? 'bg-zinc-900 text-white border-white'
                    : 'bg-black/60 text-zinc-200 border-zinc-700 hover:border-rose-500 hover:text-white'
                }`}
              >
                <Newspaper className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="hidden sm:inline">Блог</span>
              </button>

              <PricingInfoModalButton compact />

              <button
                type="button"
                onClick={() => onRouteChange('library')}
                title="Открыть библиотеку всех книг"
                aria-label="Библиотека книг"
                className={`flex items-center justify-center gap-1.5 w-[38px] h-[38px] sm:w-auto sm:h-auto sm:min-h-[40px] sm:px-3.5 text-[14px] font-bold border transition-colors cursor-pointer rounded-none shrink-0 ${
                  currentRoute === 'library'
                    ? 'bg-zinc-900 text-white border-white'
                    : 'bg-black/60 text-zinc-200 border-zinc-700 hover:border-white hover:text-white'
                }`}
              >
                <Library className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="hidden sm:inline">Библиотека</span>
              </button>

              <button
                type="button"
                onClick={onOpenAuth}
                className="flex items-center justify-center gap-1.5 h-[38px] sm:min-h-[40px] px-2.5 sm:px-4 bg-white text-black hover:bg-zinc-200 text-[14px] font-bold transition cursor-pointer whitespace-nowrap rounded-none shrink-0"
              >
                <LogIn className="w-4 h-4 sm:hidden shrink-0" />
                <span className="sm:hidden">Вход</span>
                <span className="hidden sm:inline">Вход / Регистрация</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Quick Info Modals triggered from Header Icons */}
      {currentUser && (
        <>
          <HeaderBalanceModal
            isOpen={isBalanceModalOpen}
            onClose={() => setIsBalanceModalOpen(false)}
            balance={liveBalance}
            onGoToBalance={() => onRouteChange('balance')}
          />
          <HeaderNotificationsModal
            isOpen={isNotificationsModalOpen}
            onClose={() => setIsNotificationsModalOpen(false)}
            userUid={currentUser.uid}
            onNavigate={onRouteChange}
          />
        </>
      )}
    </>
  );
};
