import React, { useState } from 'react';
import { Globe, BookOpen, Layers, Check, Sparkles, X, Share2 } from 'lucide-react';
import { Book, Chapter } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { SUPPORTED_PUBLISHING_PLATFORMS, PublishingPlatformId } from '../../services/platforms';
import { PlatformPublishCard } from './PlatformPublishCard';

interface PublishPlatformsModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapters: Chapter[];
}

export const PublishPlatformsModal: React.FC<PublishPlatformsModalProps> = ({
  isOpen,
  onClose,
  book,
  chapters,
}) => {
  const [selectedPlatformId, setSelectedPlatformId] = useState<PublishingPlatformId | 'all'>('all');

  const filteredPlatforms = selectedPlatformId === 'all'
    ? SUPPORTED_PUBLISHING_PLATFORMS
    : SUPPORTED_PUBLISHING_PLATFORMS.filter((p) => p.id === selectedPlatformId);

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Публикация и выкладывание книги: Флибуста, Самиздат, Либрусек, Яндекс Книги"
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        {/* Intro Banner */}
        <div className="p-3.5 bg-zinc-950/80 border border-zinc-800 flex flex-col gap-1.5 text-[14px]">
          <span className="text-rose-400 font-mono font-bold flex items-center gap-1.5">
            <Share2 className="w-4 h-4 text-rose-500" />
            <span>Прямая дистрибуция книги «{book.title}» ({chapters.length} глав)</span>
          </span>
          <p className="text-zinc-300 leading-relaxed">
            Автоматическая сборка готовых пакетов публикаций под технические требования каждой площадки. Мы генерируем валидные файлы FB2 с метаданными для Флибусты и Либрусека, размеченный HTML с тегами для Самиздата Мошкова и EPUB 3.0 со спецификацией OPF для Яндекс Книг (Букмейт).
          </p>
        </div>

        {/* Platform quick selector */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[14px] pt-1 border-b border-zinc-800 pb-2">
          <span className="text-zinc-400 mr-1 text-[14px]">Площадка:</span>
          <button
            type="button"
            onClick={() => setSelectedPlatformId('all')}
            className={`min-h-[38px] px-3 border transition cursor-pointer text-[14px] font-bold ${
              selectedPlatformId === 'all'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
            }`}
          >
            Все площадки
          </button>
          {SUPPORTED_PUBLISHING_PLATFORMS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPlatformId(p.id)}
              className={`min-h-[38px] px-3 border transition cursor-pointer text-[14px] font-bold ${
                selectedPlatformId === p.id
                  ? 'bg-rose-600 border-rose-500 text-white'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
              }`}
            >
              {p.name.split(' ')[0]}
            </button>
          ))}
        </div>

        {/* Platforms list */}
        <div className="flex flex-col gap-3.5 max-h-[60vh] overflow-y-auto pr-1">
          {filteredPlatforms.map((platform) => (
            <PlatformPublishCard
              key={platform.id}
              platform={platform}
              book={book}
              chapters={chapters}
            />
          ))}
        </div>
      </div>
    </NoirModal>
  );
};
