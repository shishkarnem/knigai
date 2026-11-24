import React, { useState } from 'react';
import { ChevronDown, BookOpen, ListOrdered, Users, Palette, Glasses, Shield, Image as ImageIcon, Globe, Library } from 'lucide-react';
import { AppRoute } from '../../types';

interface NoirMobileNavProps {
  currentRoute: AppRoute;
  onRouteChange: (route: AppRoute) => void;
}

const ROUTES: { id: AppRoute; label: string; icon: React.ReactNode }[] = [
  { id: 'landing', label: 'Лендинг возможностей', icon: <Globe className="w-4 h-4" /> },
  { id: 'library', label: 'Мои книги (Библиотека)', icon: <Library className="w-4 h-4" /> },
  { id: 'constructor', label: '1. Конструктор мира и 100 жанров', icon: <BookOpen className="w-4 h-4" /> },
  { id: 'chapters', label: '2. Сюжет и каскад 100 глав', icon: <ListOrdered className="w-4 h-4" /> },
  { id: 'characters', label: '3. Персонажи и коллажи ракурсов', icon: <Users className="w-4 h-4" /> },
  { id: 'cover', label: '4. Переплет и обложка Amazon A5', icon: <Palette className="w-4 h-4" /> },
  { id: 'reader', label: '5. Читалка книги А5', icon: <Glasses className="w-4 h-4" /> },
  { id: 'gallery', label: '6. Галерея файлов и PNG Alpha', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'admin', label: '7. Админка базы данных (/system-admin)', icon: <Shield className="w-4 h-4" /> },
];

export const NoirMobileNav: React.FC<NoirMobileNavProps> = ({
  currentRoute,
  onRouteChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const current = ROUTES.find((r) => r.id === currentRoute) || ROUTES[0];

  return (
    <div className="xl:hidden w-full mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full min-h-[48px] px-4 py-2.5 noir-container flex items-center justify-between text-left shadow-xs cursor-pointer border border-white/30"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <span className="w-7 h-7 bg-white text-black flex items-center justify-center shrink-0">
            {current.icon}
          </span>
          <span className="text-[14px] font-bold text-white truncate">
            {current.label}
          </span>
        </div>
        <ChevronDown
          className={`w-5 h-5 text-zinc-300 transition-transform duration-150 shrink-0 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="mt-1 w-full noir-container p-2 flex flex-col gap-1 border-2 border-white animate-in fade-in duration-100 z-30">
          {ROUTES.map((route) => {
            const isActive = route.id === currentRoute;
            return (
              <button
                key={route.id}
                onClick={() => {
                  onRouteChange(route.id);
                  setIsOpen(false);
                }}
                className={`w-full min-h-[44px] px-3.5 py-2.5 text-[14px] font-bold flex items-center gap-2.5 text-left transition-all ${
                  isActive
                    ? 'bg-white text-black border border-white'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-transparent'
                }`}
              >
                <span className="shrink-0">{route.icon}</span>
                <span className="break-words leading-tight flex-1">{route.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
