import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Edit2, Trash2, Image as ImageIcon, Sparkles, MapPin, Shield, BookMarked, Box, User, ZoomIn } from 'lucide-react';
import { WorldEntity, WorldEntityType } from '../../types';
import { NoirButton } from '../common/NoirButton';

interface WorldEntityCardProps {
  entity: WorldEntity;
  readOnly?: boolean;
  onEdit: (entity: WorldEntity) => void;
  onDelete: (id: number) => void;
  onRequestImage: (entity: WorldEntity) => void;
  onViewDetail: (entity: WorldEntity) => void;
  onViewImage?: (url: string, title: string) => void;
}

const TYPE_CONFIG: Record<WorldEntityType, { label: string; icon: React.ReactNode }> = {
  character: { label: 'персонаж', icon: <User className="w-4 h-4" /> },
  location: { label: 'локация', icon: <MapPin className="w-4 h-4" /> },
  item: { label: 'предмет / артефакт', icon: <Box className="w-4 h-4" /> },
  faction: { label: 'фракция', icon: <Shield className="w-4 h-4" /> },
  law: { label: 'закон мира', icon: <BookMarked className="w-4 h-4" /> },
};

export const WorldEntityCard: React.FC<WorldEntityCardProps> = ({
  entity,
  readOnly = false,
  onEdit,
  onDelete,
  onRequestImage,
  onViewDetail,
}) => {
  const [isZoomOpen, setIsZoomOpen] = useState(false);
  const cfg = TYPE_CONFIG[entity.entity_type] || TYPE_CONFIG.character;

  const renderAttributePills = () => {
    if (!entity.attributes || Object.keys(entity.attributes).length === 0) return null;

    const filteredEntries = Object.entries(entity.attributes)
      .filter(([key, val]) => {
        if (!val) return false;
        const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
        if (!displayVal.trim()) return false;
        if (
          key.toLowerCase() === 'role' &&
          entity.subtitle_or_role &&
          displayVal.trim().toLowerCase() === entity.subtitle_or_role.trim().toLowerCase()
        ) {
          return false;
        }
        return true;
      })
      .slice(0, 3);

    if (filteredEntries.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1.5 mt-2 min-w-0">
        {filteredEntries.map(([key, val]) => {
          const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
          return (
            <span
              key={key}
              className="px-2 py-0.5 bg-zinc-950/90 border border-zinc-800 text-[14px] text-zinc-300 max-w-full break-words leading-snug"
              title={`${key}: ${displayVal}`}
            >
              <span className="text-zinc-500 font-medium">{key}: </span>
              <span className="text-zinc-200">{displayVal}</span>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="noir-container p-4 border border-zinc-800 hover:border-zinc-500 transition-all flex flex-col justify-between gap-4 overflow-hidden w-full min-w-0">
      <div className="flex flex-col sm:flex-row gap-4 items-start min-w-0">
        {/* Image Slot / Manual Generation Button */}
        <div className="w-full sm:w-28 md:w-32 aspect-[3/4] max-h-60 sm:max-h-none bg-zinc-900/90 border border-zinc-700 relative overflow-hidden shrink-0 flex flex-col items-center justify-center group">
          {entity.image_url ? (
            <>
              <img
                src={entity.image_url}
                alt={entity.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
              <button
                type="button"
                onClick={() => setIsZoomOpen(true)}
                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white cursor-pointer"
                title="Увеличить"
                aria-label="Увеличить изображение"
              >
                <ZoomIn className="w-6 h-6" />
              </button>
            </>
          ) : (
            <div className="p-3 text-center flex flex-col items-center justify-center gap-2">
              <ImageIcon className="w-7 h-7 text-zinc-500" />
              <span className="text-[14px] text-zinc-400">без арта</span>
            </div>
          )}
        </div>

        {/* Clickable Content Details -> opens WorldEntityDetailModal */}
        <button
          type="button"
          onClick={() => onViewDetail(entity)}
          className="flex-1 min-w-0 w-full flex flex-col gap-1.5 text-left cursor-pointer group/info"
          title="Нажмите, чтобы прочитать полное описание и все свойства"
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-black/80 border border-zinc-700 text-rose-400 text-[14px] font-bold">
              {cfg.icon}
              <span>{cfg.label}</span>
            </span>

            {entity.subtitle_or_role && (
              <span className="text-[14px] font-bold text-white px-2 py-0.5 bg-zinc-900/90 border border-zinc-800 break-words max-w-full">
                {entity.subtitle_or_role}
              </span>
            )}
          </div>

          <h3 className="text-[17px] font-bold text-white leading-tight break-words mt-1 group-hover/info:text-rose-400 transition-colors">
            {entity.name}
          </h3>

          <p className="text-[14px] text-zinc-300 leading-relaxed font-['PT_Serif',serif] line-clamp-4 mt-0.5 whitespace-pre-line break-words">
            {entity.description || 'Описание уточняется...'}
          </p>

          {renderAttributePills()}

          <span className="text-[14px] text-rose-400 font-bold mt-1 group-hover/info:underline">
            Подробнее о записи →
          </span>
        </button>
      </div>

      {/* Responsive Card Action Footer:
          - Desktop (sm+): Row 1 = Перегенерировать/Создать арт; Row 2 = Изменить + Удалить
          - Mobile (<sm): 1 row of 3 icon-only buttons */}
      {!readOnly && (
        <div className="pt-3 border-t border-zinc-800/80 w-full min-w-0">
          {/* Mobile 3-in-row icon-only layout */}
          <div className="grid grid-cols-3 gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => onRequestImage(entity)}
              aria-label={entity.image_url ? 'Перегенерировать арт' : 'Создать арт'}
              title={entity.image_url ? 'Перегенерировать арт' : 'Создать арт'}
              className="min-h-[44px] flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-rose-500/80 text-rose-400 hover:text-white transition cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onEdit(entity)}
              aria-label="Изменить"
              title="Изменить"
              className="min-h-[44px] flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 hover:text-white transition cursor-pointer"
            >
              <Edit2 className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => onDelete(entity.id)}
              aria-label="Удалить"
              title="Удалить"
              className="min-h-[44px] flex items-center justify-center bg-zinc-900 hover:bg-rose-950/80 border border-zinc-700 text-rose-400 hover:text-white transition cursor-pointer"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>

          {/* Desktop 2-row layout: Row 1 = Regenerate Art; Row 2 = Edit + Delete */}
          <div className="hidden sm:flex sm:flex-col sm:gap-2">
            <NoirButton
              variant="outline"
              onClick={() => onRequestImage(entity)}
              icon={<Sparkles className="w-4 h-4 text-rose-500" />}
              className="w-full"
            >
              {entity.image_url ? 'Перегенерировать арт' : 'Создать арт'}
            </NoirButton>

            <div className="grid grid-cols-2 gap-2">
              <NoirButton
                variant="subtle"
                onClick={() => onEdit(entity)}
                icon={<Edit2 className="w-4 h-4" />}
                className="w-full"
              >
                Изменить
              </NoirButton>
              <NoirButton
                variant="subtle"
                onClick={() => onDelete(entity.id)}
                icon={<Trash2 className="w-4 h-4 text-rose-500" />}
                className="w-full"
              >
                Удалить
              </NoirButton>
            </div>
          </div>
        </div>
      )}

      {/* Zoom modal */}
      {isZoomOpen && entity.image_url && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[520] bg-black/80 backdrop-blur-md p-4 flex items-center justify-center cursor-pointer"
          onClick={() => setIsZoomOpen(false)}
        >
          <div
            className="relative max-w-2xl max-h-[90dvh] border-2 border-white p-2 noir-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <img src={entity.image_url} alt={entity.name} className="max-h-[80dvh] w-auto object-contain mx-auto" />
            <div className="mt-2 text-center text-[14px] font-bold text-white">
              {entity.name} ({cfg.label})
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
