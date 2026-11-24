import React from 'react';
import { ImageLayoutConfig, ImagePageZone, ImagePlacementMode } from '../../../types';
import { parseMarkdownImageTag } from '../../writer/writerUtils';

export interface IllustrationModeMeta {
  mode: ImagePlacementMode;
  label: string;
  shortLabel: string;
  desc: string;
  category: 'classic' | 'graphic' | 'blend';
}

export const ILLUSTRATION_MODES_META: IllustrationModeMeta[] = [
  {
    mode: 'full-width',
    label: 'По всей ширине',
    shortLabel: 'Во всю ширину',
    desc: 'Иллюстрация на всю ширину книжной полосы',
    category: 'classic',
  },
  {
    mode: 'wrap-left',
    label: 'Обтекание слева',
    shortLabel: 'Обтекание слева',
    desc: 'Картинка слева, текст обтекает её справа',
    category: 'classic',
  },
  {
    mode: 'wrap-right',
    label: 'Обтекание справа',
    shortLabel: 'Обтекание справа',
    desc: 'Картинка справа, текст обтекает её слева',
    category: 'classic',
  },
  {
    mode: 'header-break',
    label: 'Заставка абзаца',
    shortLabel: 'Заставка',
    desc: 'Выделенная врезка под заголовком или перед сценой',
    category: 'classic',
  },
  {
    mode: 'page-bg',
    label: 'На фон страницы',
    shortLabel: 'На фон листа',
    desc: 'Полноразмерный фон под текстом с настройкой прозрачности',
    category: 'blend',
  },
  {
    mode: 'gradient-blend',
    label: 'В градиент на край',
    shortLabel: 'Градиент',
    desc: 'Плавное растворение краёв арта в фон книжной страницы',
    category: 'blend',
  },
  {
    mode: 'graphic-panel',
    label: 'Панель комикса',
    shortLabel: 'Комикс-панель',
    desc: 'Рамка графической новеллы с титром и алым акцентом',
    category: 'graphic',
  },
  {
    mode: 'photo-polaroid',
    label: 'Фотокнига / Паспарту',
    shortLabel: 'Фотокнига',
    desc: 'Галерейное паспарту с подписью под кадром',
    category: 'graphic',
  },
  {
    mode: 'split-vertical',
    label: 'Две колонки (Арт | Текст)',
    shortLabel: 'Колонка Арт|Текст',
    desc: 'Вертикальное разделение листа: иллюстрация и проза рядом',
    category: 'graphic',
  },
];

export const PAGE_ZONE_OPTIONS: Array<{ zone: ImagePageZone; label: string; hint: string }> = [
  { zone: 'auto', label: 'Авто-позиция', hint: 'Стандартная врезка перед текстом' },
  { zone: 'page-start', label: 'Верх страницы', hint: 'Сразу под заголовком / колонтитулом' },
  { zone: 'page-middle', label: 'Середина листа', hint: 'Между абзацами в центре страницы' },
  { zone: 'page-end', label: 'Низ страницы', hint: 'В финале текста перед подвалом' },
  { zone: 'full-page', label: 'Отдельный лист', hint: 'Чистый разворот графической новеллы' },
];

export const GRADIENT_DIRECTION_OPTIONS: Array<{
  dir: 'bottom' | 'top' | 'left' | 'right';
  label: string;
}> = [
  { dir: 'bottom', label: 'Растворение вниз' },
  { dir: 'top', label: 'Растворение вверх' },
  { dir: 'left', label: 'Растворение влево' },
  { dir: 'right', label: 'Растворение вправо' },
];

/**
 * Generates seamless theme-agnostic CSS mask gradients for 'gradient-blend'
 */
export function getGradientBlendStyle(
  direction: 'bottom' | 'top' | 'left' | 'right' = 'bottom',
  bgOpacity = 85
): React.CSSProperties {
  const linearDir =
    direction === 'bottom'
      ? 'to bottom, black 35%, rgba(0,0,0,0.65) 68%, transparent 100%'
      : direction === 'top'
      ? 'to top, black 35%, rgba(0,0,0,0.65) 68%, transparent 100%'
      : direction === 'left'
      ? 'to left, black 35%, rgba(0,0,0,0.65) 68%, transparent 100%'
      : 'to right, black 35%, rgba(0,0,0,0.65) 68%, transparent 100%';

  const maskValue = `linear-gradient(${linearDir})`;
  return {
    WebkitMaskImage: maskValue,
    maskImage: maskValue,
    opacity: Math.min(1, Math.max(0.15, bgOpacity / 100)),
  };
}

export interface DetectedInlineImage {
  url: string;
  alt: string;
  layoutConfig: ImageLayoutConfig;
}

export function detectStandaloneMarkdownImage(rawPara: string): DetectedInlineImage | null {
  const trimmed = rawPara.trim();
  const match = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
  if (!match) return null;
  const parsed = parseMarkdownImageTag(match[1] || '', match[2] || '');
  return {
    url: match[2].trim(),
    alt: parsed.alt || 'Иллюстрация',
    layoutConfig: parsed.layoutConfig,
  };
}
