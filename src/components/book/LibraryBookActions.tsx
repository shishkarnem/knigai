import React from 'react';
import {
  BookOpen,
  CopyPlus,
  Download,
  Eye,
  GitBranch,
  Globe,
  Headphones,
  Lock,
  Palette,
  Share2,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { Book } from '../../types';

interface BubbleTailProps {
  fillClass: string;
  strokeClass: string;
}

const BubbleTail: React.FC<BubbleTailProps> = ({ fillClass, strokeClass }) => (
  <svg
    aria-hidden="true"
    className="absolute -bottom-[6.5px] left-3 w-[12px] h-[7px] overflow-visible pointer-events-none z-10"
    viewBox="0 0 12 7"
  >
    <polygon points="0,0 3,7 12,0" className={`${fillClass} transition-colors`} />
    <polyline
      points="0,0 3,7 12,0"
      fill="none"
      strokeWidth="1.5"
      strokeLinecap="square"
      className={`${strokeClass} transition-colors`}
    />
  </svg>
);

interface LibraryBookActionsProps {
  book: Book;
  isAudioBook: boolean;
  isCached: boolean;
  isCachingThis: boolean;
  permissions: import('../../types').BookPermissions;
  onReadOnline: () => void;
  onReadFromCache: () => void;
  onCacheBook: () => void;
  onRemoveFromCache: () => void;
  onOpenPublish: () => void;
  onOpenRemix: () => void;
  onOpenConstructor: () => void;
  onOpenHeadersEdit: () => void;
  onOpenDetails: () => void;
  onOpenSequel: () => void;
  onOpenCover: () => void;
  onTogglePublish: () => void;
  onDeleteRequest: () => void;
}

export const LibraryBookActions: React.FC<LibraryBookActionsProps> = ({
  book,
  isAudioBook,
  isCached,
  isCachingThis,
  permissions,
  onReadOnline,
  onReadFromCache,
  onCacheBook,
  onRemoveFromCache,
  onOpenPublish,
  onOpenRemix,
  onOpenConstructor,
  onOpenHeadersEdit,
  onOpenDetails,
  onOpenSequel,
  onOpenCover,
  onTogglePublish,
  onDeleteRequest,
}) => {
  return (
    <div className="flex flex-col gap-3.5 pt-2.5 border-t border-zinc-800">
      {/* Row 1: Primary Reading & Offline Cache Bubbles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onReadOnline}
          className="relative group min-h-[44px] px-3.5 bg-white text-black hover:bg-zinc-200 text-[14px] font-bold border-2 border-white transition cursor-pointer flex items-center justify-center gap-1.5 rounded-none shadow"
        >
          {isAudioBook ? (
            <Headphones className="w-4 h-4 text-black shrink-0" />
          ) : (
            <BookOpen className="w-4 h-4 text-black shrink-0" />
          )}
          <span>{isAudioBook ? 'Слушать аудио' : 'Читалка'}</span>
          <BubbleTail
            fillClass="fill-white group-hover:fill-zinc-200"
            strokeClass="stroke-white group-hover:stroke-zinc-200"
          />
        </button>

        {isCached ? (
          <button
            type="button"
            onClick={onReadFromCache}
            className="relative group min-h-[44px] px-3.5 bg-rose-600 hover:bg-rose-500 text-white text-[14px] font-bold border border-rose-400 transition cursor-pointer flex items-center justify-center gap-1.5 rounded-none shadow"
            title="Читать из локального кэша устройства (без интернета)"
          >
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Из кэша</span>
            <BubbleTail
              fillClass="fill-rose-600 group-hover:fill-rose-500"
              strokeClass="stroke-rose-400"
            />
          </button>
        ) : (
          <button
            type="button"
            onClick={onCacheBook}
            disabled={isCachingThis}
            className="relative group min-h-[44px] px-3.5 bg-zinc-950/85 hover:bg-white text-zinc-100 hover:text-black text-[14px] font-bold border border-white/60 hover:border-white transition cursor-pointer flex items-center justify-center gap-1.5 rounded-none disabled:opacity-50"
            title="Загрузить книгу на это устройство для чтения офлайн"
          >
            <Download className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{isCachingThis ? 'Загрузка...' : 'В кэш'}</span>
            <BubbleTail
              fillClass="fill-zinc-950 group-hover:fill-white"
              strokeClass="stroke-white/60 group-hover:stroke-white"
            />
          </button>
        )}
      </div>

      {/* Row 2: Book Speech-Bubble Controls */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-3 pt-1">
        <button
          type="button"
          onClick={onOpenDetails}
          className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/75 hover:bg-white text-zinc-100 hover:text-black border border-white/45 hover:border-white text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
          title="Полное описание, синопсис глав и связи серии"
        >
          <Eye className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Подробнее</span>
          <BubbleTail
            fillClass="fill-zinc-950 group-hover:fill-white"
            strokeClass="stroke-white/45 group-hover:stroke-white"
          />
        </button>

        {/* Own editable books: direct Editor button */}
        {permissions.canEditContent && (
          <button
            type="button"
            onClick={onOpenConstructor}
            className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/85 hover:bg-white text-white hover:text-black border border-white hover:border-white text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
            title="Открыть вашу книгу в редакторе (конструктор, главы, черновики)"
          >
            <BookOpen className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Редактор</span>
            <BubbleTail
              fillClass="fill-zinc-950 group-hover:fill-white"
              strokeClass="stroke-white"
            />
          </button>
        )}

        {/* Owned parser-downloaded books: headers/cover-only edit */}
        {permissions.canEditHeadersOnly && (
          <button
            type="button"
            onClick={onOpenHeadersEdit}
            className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/85 hover:bg-white text-white hover:text-black border border-zinc-400 hover:border-white text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
            title="Книга из парсера: можно править только заголовки и обложку"
          >
            <Lock className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Заголовки</span>
            <BubbleTail
              fillClass="fill-zinc-950 group-hover:fill-white"
              strokeClass="stroke-zinc-400 group-hover:stroke-white"
            />
          </button>
        )}

        {/* Dedicated Remix button (creates personal editable copy) */}
        <button
          type="button"
          onClick={onOpenRemix}
          className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/85 hover:bg-white text-white hover:text-black border border-rose-500/80 hover:border-white text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
          title="Создать личную редактируемую копию (фанфик или переделку) на основе этой книги"
        >
          <CopyPlus className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Ремикс</span>
          <BubbleTail
            fillClass="fill-zinc-950 group-hover:fill-white"
            strokeClass="stroke-rose-500/80 group-hover:stroke-white"
          />
        </button>

        <button
          type="button"
          onClick={onOpenSequel}
          className="relative group min-h-[44px] px-3 py-1.5 bg-rose-950/50 hover:bg-rose-600 text-rose-200 hover:text-white border border-rose-500/80 hover:border-rose-400 text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
          title="Создать сиквел, приквел или спин-офф на основе этой книги"
        >
          <GitBranch className="w-4 h-4 text-rose-400 group-hover:text-white shrink-0" />
          <span>Продолжение</span>
          <BubbleTail
            fillClass="fill-rose-950 group-hover:fill-rose-600"
            strokeClass="stroke-rose-500/80 group-hover:stroke-rose-400"
          />
        </button>

        <button
          type="button"
          onClick={onOpenPublish}
          className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/80 hover:bg-rose-600 text-zinc-100 hover:text-white border border-rose-500/60 hover:border-rose-400 text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
          title="Опубликовать в Флибусту, Самиздат, Либрусек и Яндекс Книги"
        >
          <Share2 className="w-4 h-4 text-rose-500 group-hover:text-white shrink-0" />
          <span>Выложить на платформы</span>
          <BubbleTail
            fillClass="fill-zinc-950 group-hover:fill-rose-600"
            strokeClass="stroke-rose-500/60 group-hover:stroke-rose-400"
          />
        </button>

        {permissions.isOwner && (
          <button
            type="button"
            onClick={onOpenCover}
            className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-900/80 hover:bg-white text-zinc-200 hover:text-black border border-zinc-600 hover:border-white text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
            title="Перейти в конструктор переплета и обложки А5"
          >
            <Palette className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Переплет</span>
            <BubbleTail
              fillClass="fill-zinc-900 group-hover:fill-white"
              strokeClass="stroke-zinc-600 group-hover:stroke-white"
            />
          </button>
        )}

        {isCached && (
          <button
            type="button"
            onClick={onRemoveFromCache}
            className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/75 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-400 text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
          >
            <X className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Очистить кэш</span>
            <BubbleTail
              fillClass="fill-zinc-950 group-hover:fill-zinc-800"
              strokeClass="stroke-zinc-700 group-hover:stroke-zinc-400"
            />
          </button>
        )}

        {permissions.canPublishOrDelete && (
          <>
            <button
              type="button"
              onClick={onTogglePublish}
              className="relative group min-h-[44px] px-3 py-1.5 bg-zinc-950/75 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 hover:border-zinc-400 text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
              title={book.is_published ? 'Снять книгу с публикации' : 'Опубликовать книгу в общий доступ'}
            >
              {book.is_published ? (
                <Lock className="w-4 h-4 text-zinc-400 group-hover:text-white shrink-0" />
              ) : (
                <Globe className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{book.is_published ? 'Снять' : 'Опубликовать'}</span>
              <BubbleTail
                fillClass="fill-zinc-950 group-hover:fill-zinc-800"
                strokeClass="stroke-zinc-700 group-hover:stroke-zinc-400"
              />
            </button>

            <button
              type="button"
              onClick={onDeleteRequest}
              className="relative group min-h-[44px] px-3 py-1.5 bg-rose-950/55 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-500/80 hover:border-rose-400 text-[14px] font-bold transition cursor-pointer inline-flex items-center gap-1.5 rounded-none"
              title="Удалить книгу из библиотеки"
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Удалить</span>
              <BubbleTail
                fillClass="fill-rose-950 group-hover:fill-rose-600"
                strokeClass="stroke-rose-500/80 group-hover:stroke-rose-400"
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
