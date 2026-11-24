import React from 'react';
import { Sliders, RefreshCw, SunMedium, Palette } from 'lucide-react';
import { ImageLayoutConfig } from '../../types';

export interface ImageFilterControlProps {
  filter: ImageLayoutConfig['filter'];
  colorTint?: string;
  onChangeFilter: (filter: ImageLayoutConfig['filter']) => void;
  onChangeColorTint: (tint: string | undefined) => void;
  previewUrl?: string;
  isPng?: boolean;
}

export const PRESET_FILTERS: { key: ImageLayoutConfig['filter']; label: string; desc: string }[] = [
  { key: 'normal', label: 'Оригинал', desc: 'Естественные цвета изображения' },
  { key: 'grayscale', label: 'Обесцвечивание (Ч/Б)', desc: 'Классический ч/б стиль книги' },
  { key: 'contrast', label: 'Глубокий нуар', desc: 'Повышенный контраст черных тушей' },
  { key: 'sepia', label: 'Винтажная сепия', desc: 'Эффект старинной книги' },
  { key: 'invert', label: 'Инверсия (Негатив)', desc: 'Инвертированные контрастные линии' },
];

export const COLOR_TINT_PRESETS = [
  { name: 'Без оттенка', value: undefined, hex: '#000000', filter: '' },
  { name: 'Алый нуар', value: 'rgba(239, 68, 68, 0.45)', hex: '#ef4444', filter: 'sepia(100%) saturate(450%) hue-rotate(330deg)' },
  { name: 'Кровавый кармин', value: 'rgba(185, 28, 28, 0.50)', hex: '#b91c1c', filter: 'sepia(100%) saturate(650%) hue-rotate(320deg) brightness(85%)' },
  { name: 'Янтарный огонь', value: 'rgba(245, 158, 11, 0.45)', hex: '#f59e0b', filter: 'sepia(100%) saturate(350%) hue-rotate(5deg)' },
  { name: 'Серебристый иней', value: 'rgba(228, 228, 231, 0.35)', hex: '#e4e4e7', filter: 'grayscale(100%) brightness(130%) contrast(115%)' },
  { name: 'Угольная вуаль', value: 'rgba(39, 39, 42, 0.55)', hex: '#27272a', filter: 'grayscale(100%) brightness(70%) contrast(140%)' },
];

/**
 * Returns CSS style object applied strictly to the image element
 * Container stays completely transparent, only image pixels are filtered.
 */
export function getImageFilterStyle(
  filter: ImageLayoutConfig['filter'] = 'normal',
  colorTint?: string
): React.CSSProperties {
  let baseFilter = '';

  switch (filter) {
    case 'grayscale':
      baseFilter = 'grayscale(100%) contrast(110%)';
      break;
    case 'contrast':
      baseFilter = 'contrast(160%) brightness(95%) grayscale(50%)';
      break;
    case 'sepia':
      baseFilter = 'sepia(85%) contrast(105%) brightness(95%)';
      break;
    case 'invert':
      baseFilter = 'invert(100%) hue-rotate(180deg)';
      break;
    default:
      baseFilter = '';
  }

  // Direct CSS tint filter strictly applied to image pixels (alpha channel 100% preserved)
  let tintFilter = '';
  if (colorTint) {
    const preset = COLOR_TINT_PRESETS.find((p) => p.value === colorTint || p.hex === colorTint);
    if (preset && preset.filter) {
      tintFilter = preset.filter;
    } else if (colorTint.includes('239') || colorTint.includes('ef4444')) {
      tintFilter = 'sepia(100%) saturate(450%) hue-rotate(330deg)';
    } else if (colorTint.includes('185') || colorTint.includes('b91c1c')) {
      tintFilter = 'sepia(100%) saturate(650%) hue-rotate(320deg) brightness(85%)';
    } else if (colorTint.includes('245') || colorTint.includes('f59e0b')) {
      tintFilter = 'sepia(100%) saturate(350%) hue-rotate(5deg)';
    } else if (colorTint.includes('228') || colorTint.includes('e4e4e7')) {
      tintFilter = 'grayscale(100%) brightness(130%) contrast(115%)';
    } else if (colorTint.includes('39') || colorTint.includes('27272a')) {
      tintFilter = 'grayscale(100%) brightness(70%) contrast(140%)';
    }
  }

  const combinedFilter = [baseFilter, tintFilter].filter(Boolean).join(' ') || 'none';

  return {
    filter: combinedFilter,
    backgroundColor: 'transparent',
  };
}

export const ImageFilterControl: React.FC<ImageFilterControlProps> = ({
  filter,
  colorTint,
  onChangeFilter,
  onChangeColorTint,
  previewUrl,
  isPng = false,
}) => {
  return (
    <div className="w-full flex flex-col gap-4 text-white">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
        <div className="flex items-center gap-2">
          <Sliders className="w-4 h-4 text-white" />
          <span className="text-[14px] font-bold text-white">
            Фильтры и обесцвечивание (только на изображение)
          </span>
        </div>
        {isPng && (
          <span className="text-[14px] px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300">
            png прозрачность сохранена
          </span>
        )}
      </div>

      {/* Preset Filter Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {PRESET_FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onChangeFilter(item.key)}
            className={`min-h-[44px] p-2 text-left border cursor-pointer transition-all ${
              filter === item.key
                ? 'bg-white text-black border-white shadow-sm'
                : 'bg-zinc-950/70 text-zinc-300 border-zinc-700 hover:border-zinc-400'
            }`}
          >
            <div className="text-[14px] font-bold leading-tight">{item.label}</div>
            <div className="text-[14px] opacity-75 truncate">{item.desc}</div>
          </button>
        ))}
      </div>

      {/* Color Tint Presets */}
      <div className="flex flex-col gap-2">
        <label className="text-[14px] font-bold text-zinc-300 flex items-center gap-1.5">
          <Palette className="w-4 h-4 text-zinc-400" />
          Маска цветового тонирования (прозрачный альфа-фон сохраняется):
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {COLOR_TINT_PRESETS.map((tint) => {
            const isSelected = colorTint === tint.value;
            return (
              <button
                key={tint.name}
                type="button"
                onClick={() => onChangeColorTint(tint.value)}
                className={`min-h-[38px] px-3 py-1 flex items-center gap-2 border cursor-pointer transition-all ${
                  isSelected
                    ? 'border-white bg-zinc-800 text-white font-bold ring-1 ring-white'
                    : 'border-zinc-800 bg-zinc-950/80 text-zinc-400 hover:text-white'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 border border-zinc-500 shrink-0"
                  style={{ backgroundColor: tint.hex }}
                />
                <span className="text-[14px]">{tint.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
