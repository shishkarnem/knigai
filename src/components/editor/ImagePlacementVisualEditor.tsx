import React from 'react';
import { RotateCcw, Layers, Grid, Frame, Sliders } from 'lucide-react';
import { ImageLayoutConfig, ImagePageZone, ImagePlacementMode } from '../../types';
import {
  GRADIENT_DIRECTION_OPTIONS,
  ILLUSTRATION_MODES_META,
  PAGE_ZONE_OPTIONS,
  getGradientBlendStyle,
} from '../reader/hooks/pageIllustrationParser';
import { getImageFilterStyle } from './ImageFilterControl';

interface ImagePlacementVisualEditorProps {
  layout: ImageLayoutConfig;
  onChangeLayout: (next: ImageLayoutConfig) => void;
  imageUrl?: string;
  sampleText?: string;
  showPageAnchorControls?: boolean;
}

const ModeSchematicIcon: React.FC<{ mode: ImagePlacementMode; active: boolean }> = ({
  mode,
  active,
}) => {
  const artTone = active ? 'bg-rose-600' : 'bg-rose-500/80';
  const lineTone = active ? 'bg-zinc-900/80' : 'bg-zinc-600';

  if (mode === 'wrap-left') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex flex-col gap-0.5 shrink-0">
        <div className="flex gap-1 items-start">
          <div className={`w-4 h-5 ${artTone} shrink-0`} />
          <div className="flex-1 flex flex-col gap-0.5">
            <div className={`h-1 ${lineTone}`} />
            <div className={`h-1 ${lineTone}`} />
            <div className={`h-1 ${lineTone}`} />
          </div>
        </div>
        <div className={`h-1 ${lineTone} w-full`} />
        <div className={`h-1 ${lineTone} w-3/4`} />
      </div>
    );
  }
  if (mode === 'wrap-right') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex flex-col gap-0.5 shrink-0">
        <div className="flex gap-1 items-start">
          <div className="flex-1 flex flex-col gap-0.5">
            <div className={`h-1 ${lineTone}`} />
            <div className={`h-1 ${lineTone}`} />
            <div className={`h-1 ${lineTone}`} />
          </div>
          <div className={`w-4 h-5 ${artTone} shrink-0`} />
        </div>
        <div className={`h-1 ${lineTone} w-full`} />
        <div className={`h-1 ${lineTone} w-3/4`} />
      </div>
    );
  }
  if (mode === 'header-break') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex flex-col gap-1 shrink-0">
        <div className={`h-1 ${lineTone} w-2/3 mx-auto`} />
        <div className={`h-4 ${artTone} w-full`} />
        <div className={`h-1 ${lineTone} w-full`} />
        <div className={`h-1 ${lineTone} w-4/5`} />
      </div>
    );
  }
  if (mode === 'page-bg') {
    return (
      <div className={`w-10 h-12 border border-current p-1 relative flex flex-col justify-center gap-1 shrink-0 ${artTone} opacity-90`}>
        <div className="h-1 bg-white/95 w-full" />
        <div className="h-1 bg-white/95 w-full" />
        <div className="h-1 bg-white/95 w-2/3" />
      </div>
    );
  }
  if (mode === 'gradient-blend') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex flex-col justify-between shrink-0 bg-gradient-to-b from-rose-600/90 via-rose-900/30 to-transparent">
        <div className="h-3" />
        <div className="flex flex-col gap-0.5">
          <div className={`h-1 ${lineTone} w-full`} />
          <div className={`h-1 ${lineTone} w-3/4`} />
        </div>
      </div>
    );
  }
  if (mode === 'graphic-panel') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex flex-col gap-0.5 shrink-0">
        <div className={`h-6 ${artTone} border border-current relative`}>
          <div className="absolute bottom-0 inset-x-0 h-1.5 bg-black" />
        </div>
        <div className={`h-1 ${lineTone} w-full`} />
        <div className={`h-1 ${lineTone} w-2/3`} />
      </div>
    );
  }
  if (mode === 'photo-polaroid') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex flex-col items-center gap-1 shrink-0">
        <div className="w-full p-0.5 border border-current flex flex-col items-center gap-0.5">
          <div className={`w-full h-4 ${artTone}`} />
          <div className="h-0.5 w-4 bg-rose-500" />
        </div>
        <div className={`h-1 ${lineTone} w-full`} />
      </div>
    );
  }
  if (mode === 'split-vertical') {
    return (
      <div className="w-10 h-12 border border-current p-1 flex gap-1 shrink-0">
        <div className={`w-4 h-full ${artTone}`} />
        <div className="flex-1 flex flex-col gap-1 justify-center">
          <div className={`h-1 ${lineTone}`} />
          <div className={`h-1 ${lineTone}`} />
          <div className={`h-1 ${lineTone}`} />
          <div className={`h-1 ${lineTone}`} />
        </div>
      </div>
    );
  }
  // full-width
  return (
    <div className="w-10 h-12 border border-current p-1 flex flex-col gap-1 shrink-0">
      <div className={`h-5 ${artTone} w-full`} />
      <div className={`h-1 ${lineTone} w-full`} />
      <div className={`h-1 ${lineTone} w-5/6`} />
    </div>
  );
};

export const ImagePlacementVisualEditor: React.FC<ImagePlacementVisualEditorProps> = ({
  layout,
  onChangeLayout,
  imageUrl,
  sampleText = 'В ночном небе парящего архипелага медленно угасал Сердечный Кристалл. Следователь стоял на краю смотровой площадки, глядя на движение теней внизу.',
  showPageAnchorControls = true,
}) => {
  const mode = layout.mode || 'full-width';
  const pageZone: ImagePageZone = layout.pageZone || 'auto';
  const targetPage = Math.max(1, layout.targetPageInChapter || 1);
  const bgOpacity = layout.bgOpacity ?? (mode === 'page-bg' ? 35 : 85);
  const gradientDirection = layout.gradientDirection || 'bottom';
  const offsetX = layout.offsetX || 0;
  const offsetY = layout.offsetY || 0;
  const caption = layout.caption || '';

  const update = (patch: Partial<ImageLayoutConfig>) => {
    onChangeLayout({ ...layout, ...patch });
  };

  return (
    <div className="flex flex-col gap-4 text-white">
      {/* 1. 9 Placement Modes Grid */}
      <div className="flex flex-col gap-2">
        <label className="text-[14px] font-bold text-white flex items-center gap-2">
          <Frame className="w-4 h-4 text-rose-500 shrink-0" />
          <span>Способ вставки иллюстрации в книгу (9 макетов):</span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ILLUSTRATION_MODES_META.map((opt) => {
            const isActive = mode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => update({ mode: opt.mode })}
                className={`min-h-[60px] p-2.5 text-left border cursor-pointer flex items-center gap-2.5 transition-all ${
                  isActive
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-950/75 text-zinc-200 border-zinc-700 hover:border-rose-500'
                }`}
              >
                <ModeSchematicIcon mode={opt.mode} active={isActive} />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold leading-tight">{opt.label}</div>
                  <div className={`text-[14px] leading-snug mt-0.5 ${isActive ? 'text-zinc-800' : 'text-zinc-400'}`}>
                    {opt.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Page Anchor & Zone Picker */}
      {showPageAnchorControls && (
        <div className="p-3 bg-zinc-950/85 border border-zinc-700 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] font-bold text-white flex items-center gap-2">
              <Grid className="w-4 h-4 text-rose-500 shrink-0" />
              <span>Куда вставить на странице главы:</span>
            </span>

            <div className="flex items-center gap-2">
              <label htmlFor="target-page-input" className="text-[14px] text-zinc-300">
                Стр. внутри главы:
              </label>
              <input
                id="target-page-input"
                type="number"
                min={1}
                max={99}
                value={targetPage}
                onChange={(e) =>
                  update({ targetPageInChapter: Math.max(1, parseInt(e.target.value, 10) || 1) })
                }
                className="w-16 min-h-[38px] px-2 noir-input text-[14px] font-mono text-center"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {PAGE_ZONE_OPTIONS.map((z) => {
              const active = pageZone === z.zone;
              return (
                <button
                  key={z.zone}
                  type="button"
                  onClick={() => update({ pageZone: z.zone })}
                  className={`min-h-[44px] px-2.5 py-2 text-left border cursor-pointer transition ${
                    active
                      ? 'bg-rose-600 text-white border-rose-500 font-bold'
                      : 'bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-white'
                  }`}
                >
                  <div className="text-[14px] font-bold leading-tight">{z.label}</div>
                  <div className={`text-[14px] leading-tight mt-0.5 ${active ? 'text-rose-100' : 'text-zinc-400'}`}>
                    {z.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. Blend / Opacity / Nudge / Caption Controls */}
      <div className="p-3 bg-zinc-950/85 border border-zinc-700 flex flex-col gap-3">
        {(mode === 'page-bg' || mode === 'gradient-blend') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex justify-between text-[14px] mb-1">
                <span className="font-bold flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-rose-500" />
                  <span>Прозрачность арта:</span>
                </span>
                <span className="font-mono text-rose-400">{bgOpacity}%</span>
              </div>
              <input
                type="range"
                min={15}
                max={95}
                step={5}
                value={bgOpacity}
                onChange={(e) => update({ bgOpacity: parseInt(e.target.value, 10) })}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            {mode === 'gradient-blend' && (
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Направление градиента:
                </label>
                <select
                  value={gradientDirection}
                  onChange={(e) =>
                    update({
                      gradientDirection: e.target.value as 'bottom' | 'top' | 'left' | 'right',
                    })
                  }
                  className="w-full min-h-[42px] px-2.5 noir-input text-[14px]"
                >
                  {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
                    <option key={opt.dir} value={opt.dir}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Fine X/Y Offset & Caption */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between text-[14px] mb-1">
              <span className="font-bold flex items-center gap-1.5">
                <Sliders className="w-4 h-4 text-rose-500" />
                <span>Тонкий сдвиг X / Y:</span>
              </span>
              <button
                type="button"
                onClick={() => update({ offsetX: 0, offsetY: 0 })}
                className="text-[14px] text-rose-400 hover:text-white flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>({offsetX},{offsetY}) Сброс</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[14px] text-zinc-400 flex flex-col gap-0.5">
                <span>По горизонтали ({offsetX}px)</span>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  step={2}
                  value={offsetX}
                  onChange={(e) => update({ offsetX: parseInt(e.target.value, 10) })}
                  className="w-full accent-white cursor-pointer"
                />
              </label>
              <label className="text-[14px] text-zinc-400 flex flex-col gap-0.5">
                <span>По вертикали ({offsetY}px)</span>
                <input
                  type="range"
                  min={-40}
                  max={40}
                  step={2}
                  value={offsetY}
                  onChange={(e) => update({ offsetY: parseInt(e.target.value, 10) })}
                  className="w-full accent-white cursor-pointer"
                />
              </label>
            </div>
          </div>

          <div>
            <label htmlFor="img-caption-input" className="block text-[14px] font-bold text-white mb-1">
              Титр / подпись в книге:
            </label>
            <input
              id="img-caption-input"
              type="text"
              value={caption}
              onChange={(e) => update({ caption: e.target.value })}
              placeholder="Напр.: Старый маяк в ночь бури..."
              className="w-full min-h-[42px] px-3 noir-input text-[14px]"
            />
          </div>
        </div>
      </div>

      {/* 4. Interactive Live A5 Sheet Mini Preview */}
      {imageUrl && (
        <div className="flex flex-col gap-1.5">
          <div className="text-[14px] text-zinc-300 font-bold">
            Живой макет страницы А5 ({ILLUSTRATION_MODES_META.find((m) => m.mode === mode)?.label}):
          </div>
          <div className="w-full max-w-[320px] mx-auto aspect-[148/210] bg-zinc-950 border-2 border-zinc-500 p-3 relative overflow-hidden flex flex-col justify-between shadow-2xl">
            {/* Background Mode */}
            {mode === 'page-bg' && (
              <>
                <img
                  src={imageUrl}
                  alt="Фон листа"
                  className="absolute inset-0 w-full h-full object-cover z-0"
                  referrerPolicy="no-referrer"
                  style={{
                    ...getImageFilterStyle(layout.filter, layout.colorTint),
                    opacity: Math.min(0.9, Math.max(0.15, bgOpacity / 100)),
                    transform: `translate(${offsetX}px, ${offsetY}px)`,
                  }}
                />
                <div className="absolute inset-0 bg-black/45 z-0 pointer-events-none" />
              </>
            )}

            {/* Header strip */}
            <div className="relative z-10 text-[14px] text-zinc-400 border-b border-zinc-700 pb-1 flex justify-between">
              <span className="truncate">Глава</span>
              <span className="font-mono">Стр. {targetPage}</span>
            </div>

            {/* Body Preview */}
            <div className="relative z-10 flex-1 overflow-hidden py-2 flex flex-col justify-start">
              {pageZone === 'full-page' ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <img
                    src={imageUrl}
                    alt="Разворот"
                    className="max-h-full w-auto object-contain border border-zinc-600"
                    referrerPolicy="no-referrer"
                    style={getImageFilterStyle(layout.filter, layout.colorTint)}
                  />
                  {caption && (
                    <div className="text-[14px] italic text-zinc-300 text-center mt-1 truncate w-full">
                      {caption}
                    </div>
                  )}
                </div>
              ) : mode === 'split-vertical' ? (
                <div className="grid grid-cols-12 gap-2 items-start h-full">
                  <div className="col-span-5">
                    <img
                      src={imageUrl}
                      alt="Колонка"
                      className="w-full h-44 object-cover border border-zinc-600"
                      referrerPolicy="no-referrer"
                      style={{
                        ...getImageFilterStyle(layout.filter, layout.colorTint),
                        transform: `translate(${offsetX}px, ${offsetY}px)`,
                      }}
                    />
                    {caption && <div className="text-[14px] text-zinc-300 mt-1 truncate">{caption}</div>}
                  </div>
                  <p className="col-span-7 text-[14px] text-zinc-200 leading-snug text-justify overflow-hidden">
                    {sampleText}
                  </p>
                </div>
              ) : (
                <div className="clearfix text-[14px] text-zinc-200 leading-snug">
                  {pageZone === 'page-end' && (
                    <p className="mb-2 text-justify">{sampleText.slice(0, 140)}...</p>
                  )}

                  {mode !== 'page-bg' && (
                    <div
                      className={
                        mode === 'wrap-left'
                          ? 'float-left mr-2.5 mb-1 border border-zinc-600'
                          : mode === 'wrap-right'
                          ? 'float-right ml-2.5 mb-1 border border-zinc-600'
                          : mode === 'graphic-panel'
                          ? 'mx-auto mb-2 border-2 border-white bg-black relative clear-both'
                          : mode === 'photo-polaroid'
                          ? 'mx-auto mb-2 p-1.5 bg-zinc-900 border border-zinc-400 clear-both'
                          : 'mx-auto mb-2 clear-both'
                      }
                      style={{
                        width: `${layout.scale}%`,
                        maxWidth: mode === 'wrap-left' || mode === 'wrap-right' ? '50%' : '100%',
                        transform: `translate(${offsetX}px, ${offsetY}px)`,
                      }}
                    >
                      {mode === 'graphic-panel' && (
                        <span className="absolute top-0 left-0 w-2.5 h-2.5 bg-rose-600 z-10" />
                      )}
                      <img
                        src={imageUrl}
                        alt="Предпросмотр"
                        className="max-h-32 w-full object-cover block"
                        referrerPolicy="no-referrer"
                        style={
                          mode === 'gradient-blend'
                            ? {
                                ...getImageFilterStyle(layout.filter, layout.colorTint),
                                ...getGradientBlendStyle(gradientDirection, bgOpacity),
                              }
                            : getImageFilterStyle(layout.filter, layout.colorTint)
                        }
                      />
                      {caption && (
                        <div className="text-[14px] italic text-zinc-300 text-center px-1 py-0.5 truncate bg-black/70">
                          {caption}
                        </div>
                      )}
                    </div>
                  )}

                  {pageZone !== 'page-end' && (
                    <p className="text-justify">{sampleText}</p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="relative z-10 text-[14px] text-zinc-400 border-t border-zinc-700 pt-1 flex justify-between font-mono">
              <span>{targetPage}</span>
              <span>KnigAI</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
