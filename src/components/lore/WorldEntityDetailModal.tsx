import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Edit2,
  Sparkles,
  User,
  MapPin,
  Box,
  Shield,
  BookMarked,
  ZoomIn,
  Image as ImageIcon,
} from 'lucide-react';
import { WorldEntity, WorldEntityType } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';

interface WorldEntityDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  entity: WorldEntity | null;
  readOnly?: boolean;
  onEdit: (entity: WorldEntity) => void;
  onRequestImage: (entity: WorldEntity) => void;
}

const TYPE_META: Record<WorldEntityType, { label: string; icon: React.ReactNode }> = {
  character: { label: 'персонаж', icon: <User className="w-4 h-4" /> },
  location: { label: 'локация', icon: <MapPin className="w-4 h-4" /> },
  item: { label: 'предмет / артефакт', icon: <Box className="w-4 h-4" /> },
  faction: { label: 'фракция', icon: <Shield className="w-4 h-4" /> },
  law: { label: 'закон мира', icon: <BookMarked className="w-4 h-4" /> },
};

export const WorldEntityDetailModal: React.FC<WorldEntityDetailModalProps> = ({
  isOpen,
  onClose,
  entity,
  readOnly = false,
  onEdit,
  onRequestImage,
}) => {
  const [zoomArt, setZoomArt] = useState(false);

  if (!entity) return null;
  const meta = TYPE_META[entity.entity_type] || TYPE_META.character;
  const attrEntries = Object.entries(entity.attributes || {}).filter(([, val]) => {
    const str = Array.isArray(val) ? val.join(', ') : String(val || '');
    return str.trim().length > 0;
  });

  return (
    <>
      <NoirModal
        isOpen={isOpen}
        onClose={onClose}
        title={entity.name}
        maxWidth="max-w-2xl"
      >
        <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif] max-h-[80vh] overflow-y-auto pr-1">
          {/* Header Metadata & Artwork */}
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-full sm:w-44 aspect-[3/4] bg-zinc-950 border border-zinc-700 shrink-0 relative overflow-hidden flex items-center justify-center group">
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
                    onClick={() => setZoomArt(true)}
                    className="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white"
                    title="Открыть арт крупно"
                    aria-label="Открыть арт крупно"
                  >
                    <ZoomIn className="w-7 h-7" />
                  </button>
                </>
              ) : (
                <div className="p-4 text-center flex flex-col items-center gap-2 text-zinc-500">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-[14px]">Арт ещё не создан</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-black border border-rose-500/80 text-rose-400 text-[14px] font-bold">
                  {meta.icon}
                  <span>{meta.label}</span>
                </span>
                {entity.subtitle_or_role && (
                  <span className="px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-white text-[14px] font-bold break-words">
                    {entity.subtitle_or_role}
                  </span>
                )}
              </div>

              <h3 className="text-[20px] font-bold text-white leading-snug break-words">
                {entity.name}
              </h3>

              <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 text-[15px] text-zinc-200 leading-relaxed whitespace-pre-line break-words">
                {entity.description || 'Описание пока не добавлено.'}
              </div>
            </div>
          </div>

          {/* Structured Attributes */}
          {attrEntries.length > 0 && (
            <div className="flex flex-col gap-2 pt-2 border-t border-zinc-800">
              <span className="text-[14px] font-bold text-rose-400">
                Свойства и канонические детали:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {attrEntries.map(([key, val]) => {
                  const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
                  return (
                    <div
                      key={key}
                      className="p-3 bg-zinc-950/70 border border-zinc-800 text-[14px] leading-snug break-words"
                    >
                      <span className="block text-zinc-400 font-mono mb-0.5">{key}:</span>
                      <span className="text-zinc-100 whitespace-pre-line">{displayVal}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Visual Prompt */}
          {entity.visual_prompt && (
            <div className="p-3 bg-zinc-950/70 border border-zinc-800 flex flex-col gap-1">
              <span className="text-[14px] font-bold text-zinc-400">
                Промпт визуализации:
              </span>
              <p className="text-[14px] font-mono text-zinc-300 leading-relaxed break-words">
                {entity.visual_prompt}
              </p>
            </div>
          )}

          {/* Footer buttons */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-zinc-800">
            {!readOnly ? (
              <NoirButton
                variant="outline"
                onClick={() => {
                  onClose();
                  onRequestImage(entity);
                }}
                icon={<Sparkles className="w-4 h-4 text-rose-500" />}
              >
                {entity.image_url ? 'Перегенерировать арт' : 'Создать арт'}
              </NoirButton>
            ) : (
              <span className="text-[14px] text-zinc-400">Режим только чтение</span>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!readOnly && (
                <NoirButton
                  variant="outline"
                  onClick={() => {
                    onClose();
                    onEdit(entity);
                  }}
                  icon={<Edit2 className="w-4 h-4" />}
                >
                  Изменить
                </NoirButton>
              )}
              <NoirButton variant="primary" onClick={onClose}>
                Закрыть
              </NoirButton>
            </div>
          </div>
        </div>
      </NoirModal>

      {zoomArt && entity.image_url && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[520] bg-black/80 backdrop-blur-md p-4 flex items-center justify-center cursor-pointer"
          onClick={() => setZoomArt(false)}
        >
          <div
            className="relative max-w-2xl max-h-[90dvh] border-2 border-white p-2 noir-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={entity.image_url}
              alt={entity.name}
              className="max-h-[80dvh] w-auto object-contain mx-auto"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>,
        document.body
      )}
    </>
  );
};
