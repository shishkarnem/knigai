import React, { useEffect, useRef, useState } from 'react';
import { BookCheck, Image as ImageIcon, Sparkles, Trash2, Sliders } from 'lucide-react';
import { Book, BookCoverConfig, CoverImageLayer, CoverTextLayout } from '../../types';
import { DraggableCoverBlock } from './DraggableCoverBlock';
import { getImageFilterStyle } from '../editor/ImageFilterControl';
import { CoverEditorSection } from './CoverPositionEditor';
import { CoverLayerItemOnCanvas } from './layers/CoverLayerItemOnCanvas';

interface CoverWrapPreviewProps {
  book: Book;
  cover: BookCoverConfig;
  layout: CoverTextLayout;
  specs: { spineWidthMm: number; totalWidthMm: number; totalHeightMm: number };
  selectedBlockId: CoverEditorSection | null;
  onSelectBlock: (section: CoverEditorSection | null) => void;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onUpdateLayout: (key: keyof CoverTextLayout, value: any) => void;
  onUpdateCover: (updated: Partial<BookCoverConfig>) => void;
  onOpenBackImageGen: () => void;
  onOpenBackImageUpload: () => void;
  onFocusArtSlot?: (slot: 'front' | 'back' | 'fullWrap') => void;
}

export const CoverWrapPreview: React.FC<CoverWrapPreviewProps> = ({
  book,
  cover,
  layout,
  specs,
  selectedBlockId,
  onSelectBlock,
  activeLayerId,
  onSelectLayer,
  onUpdateLayout,
  onUpdateCover,
  onOpenBackImageGen,
  onOpenBackImageUpload,
  onFocusArtSlot,
}) => {
  const [focusZone, setFocusZone] = useState<'all' | 'back' | 'spine' | 'front'>('all');
  const wrapAreaRef = useRef<HTMLDivElement | null>(null);
  const showGuides = cover.showBlockGuides !== false;
  const spineBg = cover.spineColor || '#18181b';
  const backBg = cover.backColor || spineBg;

  const showBack = focusZone === 'all' || focusZone === 'back';
  const showSpine = focusZone === 'all' || focusZone === 'spine';
  const showFront = focusZone === 'all' || focusZone === 'front';

  // Auto-hide floating block/layer toolbars when clicking outside interactive elements
  useEffect(() => {
    if (!selectedBlockId && !activeLayerId) return;
    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-cover-interactive="true"]')) return;
      onSelectBlock(null);
      onSelectLayer(null);
    };
    document.addEventListener('mousedown', handleDocMouseDown);
    return () => document.removeEventListener('mousedown', handleDocMouseDown);
  }, [selectedBlockId, activeLayerId, onSelectBlock, onSelectLayer]);

  const getCoverPosStyle = (pos?: { posX?: number; posY?: number; zoom?: number }): React.CSSProperties => {
    const x = pos?.posX ?? 50;
    const y = pos?.posY ?? 50;
    const z = (pos?.zoom ?? 100) / 100;
    return {
      objectPosition: `${x}% ${y}%`,
      transform: z !== 1 ? `scale(${z})` : undefined,
      transformOrigin: `${x}% ${y}%`,
    };
  };

  const layers = cover.layers || [];
  const bgLayers = [...layers].filter((l) => l.zIndex < 20).sort((a, b) => a.zIndex - b.zIndex);
  const fgLayers = [...layers].filter((l) => l.zIndex >= 20).sort((a, b) => a.zIndex - b.zIndex);

  const handleUpdateLayer = (id: string, patch: Partial<CoverImageLayer>) => {
    onUpdateCover({
      layers: layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  const handleMoveLayerOrder = (id: string, dir: 'up' | 'down') => {
    const target = layers.find((l) => l.id === id);
    if (!target) return;
    const nextZ = dir === 'up' ? target.zIndex + 2 : Math.max(1, target.zIndex - 2);
    handleUpdateLayer(id, { zIndex: nextZ });
  };

  const handleDeleteLayer = (id: string) => {
    onUpdateCover({ layers: layers.filter((l) => l.id !== id) });
    if (activeLayerId === id) onSelectLayer(null);
  };

  const renderSpineTitle = () => (
    <DraggableCoverBlock
      id="spine-title"
      label="Название на корешке"
      offsetX={layout.spineTitleOffsetX ?? 0}
      offsetY={layout.spineTitleOffsetY ?? (layout.spineOffsetY ?? 0)}
      widthPercent={layout.spineTitleWidth ?? 100}
      heightPx={layout.spineTitleHeight ?? 190}
      alignV={layout.spineTitleAlignV || 'center'}
      alignH={layout.spineTitleAlignH || 'center'}
      isHidden={Boolean(layout.spineTitleHidden)}
      showGuides={showGuides}
      allowHorizontal={true}
      allowVertical={true}
      verticalToolbar={true}
      isSelected={selectedBlockId === 'spine-title' || selectedBlockId === 'spine'}
      onSelect={() => {
        onSelectLayer(null);
        onSelectBlock('spine-title');
      }}
      onOffsetChange={(x, y) => {
        onUpdateLayout('spineTitleOffsetX', x);
        onUpdateLayout('spineTitleOffsetY', y);
      }}
      onWidthChange={(w) => onUpdateLayout('spineTitleWidth', w)}
      onHeightChange={(h) => onUpdateLayout('spineTitleHeight', h)}
      onAlignVChange={(v) => onUpdateLayout('spineTitleAlignV', v)}
      onAlignHChange={(h) => onUpdateLayout('spineTitleAlignH', h === 'justify' ? 'center' : h)}
      onToggleHidden={() => onUpdateLayout('spineTitleHidden', !layout.spineTitleHidden)}
      snapPointsX={[0]}
      snapPointsY={[0, -50, 50]}
    >
      <span
        className="font-bold text-white leading-snug break-words"
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: `${layout.spineTitleFontSize ?? layout.spineFontSize ?? 13}px`,
          maxHeight: `${layout.spineTitleHeight ?? 190}px`,
          textAlign: (layout.spineTitleAlignH || 'center') as any,
        }}
        title={cover.frontTitle || book.title}
      >
        {cover.frontTitle || book.title}
      </span>
    </DraggableCoverBlock>
  );

  const renderSpineAuthor = () => (
    <DraggableCoverBlock
      id="spine-author"
      label="Автор на корешке"
      offsetX={layout.spineAuthorOffsetX ?? 0}
      offsetY={layout.spineAuthorOffsetY ?? 0}
      widthPercent={layout.spineAuthorWidth ?? 100}
      heightPx={layout.spineAuthorHeight ?? 120}
      alignV={layout.spineAuthorAlignV || 'center'}
      alignH={layout.spineAuthorAlignH || 'center'}
      isHidden={Boolean(layout.spineAuthorHidden)}
      showGuides={showGuides}
      allowHorizontal={true}
      allowVertical={true}
      verticalToolbar={true}
      isSelected={selectedBlockId === 'spine-author' || selectedBlockId === 'spine'}
      onSelect={() => {
        onSelectLayer(null);
        onSelectBlock('spine-author');
      }}
      onOffsetChange={(x, y) => {
        onUpdateLayout('spineAuthorOffsetX', x);
        onUpdateLayout('spineAuthorOffsetY', y);
      }}
      onWidthChange={(w) => onUpdateLayout('spineAuthorWidth', w)}
      onHeightChange={(h) => onUpdateLayout('spineAuthorHeight', h)}
      onAlignVChange={(v) => onUpdateLayout('spineAuthorAlignV', v)}
      onAlignHChange={(h) => onUpdateLayout('spineAuthorAlignH', h === 'justify' ? 'center' : h)}
      onToggleHidden={() => onUpdateLayout('spineAuthorHidden', !layout.spineAuthorHidden)}
      snapPointsX={[0]}
      snapPointsY={[0, -30, 30]}
    >
      <span
        className="font-semibold text-zinc-300 leading-snug break-words"
        style={{
          writingMode: 'vertical-rl',
          textOrientation: 'mixed',
          fontSize: `${layout.spineAuthorFontSize ?? 12}px`,
          maxHeight: `${layout.spineAuthorHeight ?? 120}px`,
          textAlign: (layout.spineAuthorAlignH || 'center') as any,
        }}
        title={cover.authorName || book.author}
      >
        {cover.authorName || book.author}
      </span>
    </DraggableCoverBlock>
  );

  return (
    <div className="noir-container p-3 sm:p-5 border border-zinc-700 flex flex-col gap-3">
      {/* Header Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-zinc-800 flex-wrap gap-2">
        <h3 className="text-[16px] sm:text-[17px] font-bold text-white flex items-center gap-2">
          <BookCheck className="w-5 h-5 text-rose-500" />
          <span>Интерактивная развертка книжного переплета (Jacket Wrap)</span>
        </h3>

        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <button
            type="button"
            onClick={() => onUpdateCover({ showBlockGuides: !showGuides })}
            className={`min-h-[38px] px-3 border text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer ${
              showGuides
                ? 'bg-rose-950/40 text-rose-400 border-rose-500/80 hover:bg-rose-900/50'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-current" />
            <span>{showGuides ? 'Скрыть поля контейнеров' : 'Показать границы блоков'}</span>
          </button>

          <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300 hover:text-white">
            <input
              type="checkbox"
              checked={cover.hideBranding || false}
              onChange={(e) => onUpdateCover({ hideBranding: e.target.checked })}
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Убрать надписи А5 и KnigAI</span>
          </label>
        </div>
      </div>

      {/* Responsive Zone Focus Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[14px] text-zinc-400 mr-1">Вид развертки:</span>
          {(
            [
              { id: 'all', label: 'Вся развертка' },
              { id: 'back', label: 'Задник' },
              { id: 'spine', label: 'Корешок' },
              { id: 'front', label: 'Лицо' },
            ] as const
          ).map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setFocusZone(z.id)}
              className={`min-h-[38px] px-3 text-[14px] font-bold border transition cursor-pointer ${
                focusZone === z.id
                  ? 'bg-white text-black border-white'
                  : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
              }`}
            >
              {z.label}
            </button>
          ))}
        </div>

        {onFocusArtSlot && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => onFocusArtSlot('back')}
              className="min-h-[36px] px-3 bg-zinc-900 border border-zinc-700 hover:border-rose-500 text-zinc-200 text-[14px] font-bold cursor-pointer"
            >
              Фон задника
            </button>
            <button
              type="button"
              onClick={() => onFocusArtSlot('fullWrap')}
              className="min-h-[36px] px-3 bg-rose-950/60 border border-rose-500 hover:bg-rose-600 text-white text-[14px] font-bold cursor-pointer"
            >
              Разворот 16:9 целиком
            </button>
          </div>
        )}
      </div>

      {/* Scaled Wrap Container */}
      <div
        ref={wrapAreaRef}
        onClick={() => {
          onSelectBlock(null);
          onSelectLayer(null);
        }}
        className="w-full overflow-x-auto py-14 px-14"
      >
        <div className="mx-auto flex items-stretch justify-center bg-black border-2 border-white/80 shadow-2xl p-2 w-max relative">
          {/* Continuous Full Horizontal Wrap Background */}
          {cover.fullWrapImageUrl && (
            <div className="absolute inset-2 overflow-hidden pointer-events-none z-0">
              <img
                src={cover.fullWrapImageUrl}
                alt="Панорамный разворот переплета"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                style={{
                  ...getImageFilterStyle(cover.imageFilter, cover.colorTint),
                  ...getCoverPosStyle(cover.fullWrapImagePos),
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/60" />
            </div>
          )}

          {/* Background PNG/Decor Layers (behind text blocks) */}
          {bgLayers.length > 0 && (
            <div className="absolute inset-2 pointer-events-none z-15">
              {bgLayers.map((layer) => (
                <CoverLayerItemOnCanvas
                  key={layer.id}
                  layer={layer}
                  isSelected={activeLayerId === layer.id}
                  showGuides={showGuides}
                  onSelect={() => {
                    onSelectBlock(null);
                    onSelectLayer(layer.id);
                  }}
                  onUpdate={(patch) => handleUpdateLayer(layer.id, patch)}
                  onMoveOrder={(dir) => handleMoveLayerOrder(layer.id, dir)}
                  onDelete={() => handleDeleteLayer(layer.id)}
                />
              ))}
            </div>
          )}

          {/* 1. Back Cover (Portrait A5) */}
          {showBack && (
            <div
              className="w-[260px] sm:w-[300px] aspect-[148/210] p-5 border-r border-zinc-800/80 flex flex-col justify-between shrink-0 relative overflow-visible z-10"
              style={{ backgroundColor: cover.fullWrapImageUrl && !cover.backImageUrl ? 'transparent' : backBg }}
            >
              {cover.backImageUrl ? (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img
                    src={cover.backImageUrl}
                    alt="Задняя сторона переплета"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    style={{
                      ...getImageFilterStyle(cover.imageFilter, cover.colorTint),
                      ...getCoverPosStyle(cover.backImagePos),
                    }}
                  />
                </div>
              ) : null}

              {(cover.backImageUrl || cover.fullWrapImageUrl) && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/75 pointer-events-none" />
              )}

              <div className="flex flex-col gap-2 relative z-10">
                {/* Draggable Back Genre Label */}
                <DraggableCoverBlock
                  id="back-genre"
                  label="Жанр (задник)"
                  offsetX={layout.backGenreOffsetX ?? 0}
                  offsetY={layout.backGenreOffsetY ?? 0}
                  widthPercent={layout.backGenreContainerWidth ?? 100}
                  heightPx={layout.backGenreContainerHeight ?? 32}
                  alignV={layout.backGenreAlignV || 'top'}
                  alignH={layout.backGenreAlignH || 'left'}
                  isHidden={Boolean(layout.backGenreHidden)}
                  toolbarPlacement="bottom"
                  showGuides={showGuides}
                  isSelected={selectedBlockId === 'back-genre'}
                  onSelect={() => {
                    onSelectLayer(null);
                    onSelectBlock('back-genre');
                  }}
                  onOffsetChange={(x, y) => {
                    onUpdateLayout('backGenreOffsetX', x);
                    onUpdateLayout('backGenreOffsetY', y);
                  }}
                  onWidthChange={(w) => onUpdateLayout('backGenreContainerWidth', w)}
                  onHeightChange={(h) => onUpdateLayout('backGenreContainerHeight', h)}
                  onAlignVChange={(v) => onUpdateLayout('backGenreAlignV', v)}
                  onAlignHChange={(h) => onUpdateLayout('backGenreAlignH', h)}
                  onToggleHidden={() => onUpdateLayout('backGenreHidden', !layout.backGenreHidden)}
                  snapPointsX={[0]}
                  snapPointsY={[0]}
                >
                  <span
                    className="font-mono text-zinc-400 w-full block leading-tight"
                    style={{
                      fontSize: `${layout.backGenreFontSize ?? 14}px`,
                      textAlign: (layout.backGenreAlignH || 'left') as any,
                    }}
                  >
                    {cover.genreLabel || book.genres.join(' / ')}
                  </span>
                </DraggableCoverBlock>

                <h4 className="text-[16px] sm:text-[17px] font-bold text-white leading-tight">
                  {cover.frontTitle || book.title}
                </h4>

                <DraggableCoverBlock
                  id="blurb"
                  label="Аннотация"
                  offsetX={layout.blurbOffsetX ?? 0}
                  offsetY={layout.blurbOffsetY ?? 0}
                  widthPercent={layout.blurbContainerWidth ?? 100}
                  heightPx={layout.blurbContainerHeight ?? 165}
                  alignV={layout.blurbAlignV || 'top'}
                  alignH={layout.blurbAlignH || 'left'}
                  isHidden={Boolean(layout.blurbHidden)}
                  toolbarPlacement="top"
                  showGuides={showGuides}
                  isSelected={selectedBlockId === 'blurb'}
                  onSelect={() => {
                    onSelectLayer(null);
                    onSelectBlock('blurb');
                  }}
                  onOffsetChange={(x, y) => {
                    onUpdateLayout('blurbOffsetX', x);
                    onUpdateLayout('blurbOffsetY', y);
                  }}
                  onWidthChange={(w) => onUpdateLayout('blurbContainerWidth', w)}
                  onHeightChange={(h) => onUpdateLayout('blurbContainerHeight', h)}
                  onAlignVChange={(v) => onUpdateLayout('blurbAlignV', v)}
                  onAlignHChange={(h) => onUpdateLayout('blurbAlignH', h)}
                  onToggleHidden={() => onUpdateLayout('blurbHidden', !layout.blurbHidden)}
                  snapPointsX={[0, -20, 20]}
                  snapPointsY={[0, -40, 40]}
                >
                  <p
                    className="text-zinc-300 leading-relaxed line-clamp-8 whitespace-pre-line font-serif w-full block"
                    style={{
                      fontSize: `${layout.blurbFontSize ?? 14}px`,
                      textAlign: (layout.blurbAlignH || 'left') as any,
                    }}
                  >
                    {cover.backBlurb || book.synopsis_overview || 'Аннотация издания...'}
                  </p>
                </DraggableCoverBlock>
              </div>

              <div className="p-2.5 bg-white text-black border border-white flex items-center justify-between gap-3 mt-4 relative z-10">
                <div className="flex flex-col text-[14px]">
                  <span className="font-mono font-bold text-black">{cover.isbn}</span>
                  {!cover.hideBranding && <span className="text-zinc-600 text-[14px]">{cover.barcodeText}</span>}
                </div>
                <div className="flex items-center gap-0.5 h-7">
                  {Array.from({ length: 22 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-black h-full"
                      style={{ width: i % 3 === 0 ? '3px' : '1.5px' }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 2. Spine */}
          {showSpine && (
            <div
              className={`border-r border-zinc-700 relative select-none shrink-0 flex flex-col items-center justify-center overflow-visible py-10 ${
                selectedBlockId === 'spine' || selectedBlockId === 'spine-title' || selectedBlockId === 'spine-author'
                  ? 'z-30'
                  : 'z-10'
              }`}
              style={{
                width: `${Math.max(44, specs.spineWidthMm * 3.5)}px`,
                backgroundColor: cover.fullWrapImageUrl ? 'rgba(0,0,0,0.45)' : spineBg,
              }}
            >
              {!cover.hideBranding && (
                <div className="absolute top-3 left-0 right-0 flex justify-center pointer-events-none z-10">
                  <span className="text-[14px] font-bold text-white rotate-90 whitespace-nowrap opacity-80">
                    KnigAI
                  </span>
                </div>
              )}

              <div className="w-full flex-1 flex flex-col items-center justify-center gap-3 relative py-2">
                {layout.spineSwapOrder ? (
                  <>
                    {renderSpineAuthor()}
                    {renderSpineTitle()}
                  </>
                ) : (
                  <>
                    {renderSpineTitle()}
                    {renderSpineAuthor()}
                  </>
                )}
              </div>

              {!cover.hideBranding && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center pointer-events-none z-10">
                  <span className="text-[14px] text-zinc-400 rotate-90 whitespace-nowrap">
                    А5
                  </span>
                </div>
              )}
            </div>
          )}

          {/* 3. Front Cover (Right Side, A5) */}
          {showFront && (
            <div
              className={`w-[260px] sm:w-[300px] aspect-[148/210] relative overflow-visible ${
                cover.fullWrapImageUrl && !cover.frontImageUrl ? 'bg-transparent' : 'bg-zinc-950'
              } flex flex-col justify-between p-5 text-white border-l border-zinc-800/80 shrink-0 z-10`}
            >
              {cover.frontImageUrl ? (
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <img
                    src={cover.frontImageUrl}
                    alt="Лицевая обложка"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    style={{
                      ...getImageFilterStyle(cover.imageFilter, cover.colorTint),
                      ...getCoverPosStyle(cover.frontImagePos),
                    }}
                  />
                </div>
              ) : !cover.fullWrapImageUrl ? (
                <div className="absolute inset-0 bg-gradient-to-b from-zinc-900 to-black manga-screentone pointer-events-none" />
              ) : null}

              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/70 pointer-events-none" />

              <div className="relative z-10 flex flex-col h-full justify-between">
                <div className="flex flex-col gap-1">
                  {/* Draggable Editable Front Genre Label */}
                  <DraggableCoverBlock
                    id="genre"
                    label="Жанр"
                    offsetX={layout.genreOffsetX ?? 0}
                    offsetY={layout.genreOffsetY ?? 0}
                    widthPercent={layout.genreContainerWidth ?? 100}
                    heightPx={layout.genreContainerHeight ?? 32}
                    alignV={layout.genreAlignV || 'top'}
                    alignH={layout.genreAlignH || 'left'}
                    isHidden={Boolean(layout.genreHidden)}
                    toolbarPlacement="bottom"
                    showGuides={showGuides}
                    isSelected={selectedBlockId === 'genre'}
                    onSelect={() => {
                      onSelectLayer(null);
                      onSelectBlock('genre');
                    }}
                    onOffsetChange={(x, y) => {
                      onUpdateLayout('genreOffsetX', x);
                      onUpdateLayout('genreOffsetY', y);
                    }}
                    onWidthChange={(w) => onUpdateLayout('genreContainerWidth', w)}
                    onHeightChange={(h) => onUpdateLayout('genreContainerHeight', h)}
                    onAlignVChange={(v) => onUpdateLayout('genreAlignV', v)}
                    onAlignHChange={(h) => onUpdateLayout('genreAlignH', h)}
                    onToggleHidden={() => onUpdateLayout('genreHidden', !layout.genreHidden)}
                    snapPointsX={[0, layout.authorOffsetX ?? 0, layout.titleOffsetX ?? 0]}
                    snapPointsY={[0]}
                  >
                    <span
                      className="font-mono text-zinc-300 leading-tight w-full block"
                      style={{
                        fontSize: `${layout.genreFontSize ?? 14}px`,
                        textAlign: (layout.genreAlignH || 'left') as any,
                      }}
                    >
                      {cover.genreLabel || book.genres.join(' / ')}
                    </span>
                  </DraggableCoverBlock>

                  {/* Draggable Author */}
                  <DraggableCoverBlock
                    id="author"
                    label="Автор"
                    offsetX={layout.authorOffsetX ?? 0}
                    offsetY={layout.authorOffsetY ?? 0}
                    widthPercent={layout.authorContainerWidth ?? 100}
                    heightPx={layout.authorContainerHeight ?? 42}
                    alignV={layout.authorAlignV || 'top'}
                    alignH={layout.authorAlignH || 'left'}
                    isHidden={Boolean(layout.authorHidden)}
                    toolbarPlacement="bottom"
                    showGuides={showGuides}
                    isSelected={selectedBlockId === 'author'}
                    onSelect={() => {
                      onSelectLayer(null);
                      onSelectBlock('author');
                    }}
                    onOffsetChange={(x, y) => {
                      onUpdateLayout('authorOffsetX', x);
                      onUpdateLayout('authorOffsetY', y);
                    }}
                    onWidthChange={(w) => onUpdateLayout('authorContainerWidth', w)}
                    onHeightChange={(h) => onUpdateLayout('authorContainerHeight', h)}
                    onAlignVChange={(v) => onUpdateLayout('authorAlignV', v)}
                    onAlignHChange={(h) => onUpdateLayout('authorAlignH', h)}
                    onToggleHidden={() => onUpdateLayout('authorHidden', !layout.authorHidden)}
                    snapPointsX={[0, layout.titleOffsetX ?? 0, layout.subtitleOffsetX ?? 0]}
                    snapPointsY={[0, 30, -30]}
                    className="mt-1"
                  >
                    <span
                      className="font-bold text-white block leading-tight w-full"
                      style={{
                        fontSize: `${layout.authorFontSize ?? 15}px`,
                        textAlign: (layout.authorAlignH || 'left') as any,
                      }}
                    >
                      {cover.authorName || book.author}
                    </span>
                  </DraggableCoverBlock>
                </div>

                {/* Bottom Title & Subtitle */}
                <div className="flex flex-col gap-1.5 mt-auto">
                  <DraggableCoverBlock
                    id="title"
                    label="Название"
                    offsetX={layout.titleOffsetX ?? 0}
                    offsetY={layout.titleOffsetY ?? 0}
                    widthPercent={layout.titleContainerWidth ?? 100}
                    heightPx={layout.titleContainerHeight ?? 90}
                    alignV={layout.titleAlignV || 'top'}
                    alignH={layout.titleAlignH || 'left'}
                    isHidden={Boolean(layout.titleHidden)}
                    toolbarPlacement="top"
                    showGuides={showGuides}
                    isSelected={selectedBlockId === 'title'}
                    onSelect={() => {
                      onSelectLayer(null);
                      onSelectBlock('title');
                    }}
                    onOffsetChange={(x, y) => {
                      onUpdateLayout('titleOffsetX', x);
                      onUpdateLayout('titleOffsetY', y);
                    }}
                    onWidthChange={(w) => onUpdateLayout('titleContainerWidth', w)}
                    onHeightChange={(h) => onUpdateLayout('titleContainerHeight', h)}
                    onAlignVChange={(v) => onUpdateLayout('titleAlignV', v)}
                    onAlignHChange={(h) => onUpdateLayout('titleAlignH', h)}
                    onToggleHidden={() => onUpdateLayout('titleHidden', !layout.titleHidden)}
                    snapPointsX={[0, layout.authorOffsetX ?? 0, layout.subtitleOffsetX ?? 0]}
                    snapPointsY={[0, -60, 60]}
                  >
                    <h3
                      className="font-extrabold text-white leading-tight w-full block"
                      style={{
                        fontSize: `${layout.titleFontSize ?? 22}px`,
                        textAlign: (layout.titleAlignH || 'left') as any,
                      }}
                    >
                      {cover.frontTitle || book.title}
                    </h3>
                  </DraggableCoverBlock>

                  {cover.frontSubtitle ? (
                    <DraggableCoverBlock
                      id="subtitle"
                      label="Подзаголовок"
                      offsetX={layout.subtitleOffsetX ?? 0}
                      offsetY={layout.subtitleOffsetY ?? 0}
                      widthPercent={layout.subtitleContainerWidth ?? 100}
                      heightPx={layout.subtitleContainerHeight ?? 48}
                      alignV={layout.subtitleAlignV || 'top'}
                      alignH={layout.subtitleAlignH || 'left'}
                      isHidden={Boolean(layout.subtitleHidden)}
                      toolbarPlacement="top"
                      showGuides={showGuides}
                      isSelected={selectedBlockId === 'subtitle'}
                      onSelect={() => {
                        onSelectLayer(null);
                        onSelectBlock('subtitle');
                      }}
                      onOffsetChange={(x, y) => {
                        onUpdateLayout('subtitleOffsetX', x);
                        onUpdateLayout('subtitleOffsetY', y);
                      }}
                      onWidthChange={(w) => onUpdateLayout('subtitleContainerWidth', w)}
                      onHeightChange={(h) => onUpdateLayout('subtitleContainerHeight', h)}
                      onAlignVChange={(v) => onUpdateLayout('subtitleAlignV', v)}
                      onAlignHChange={(h) => onUpdateLayout('subtitleAlignH', h)}
                      onToggleHidden={() => onUpdateLayout('subtitleHidden', !layout.subtitleHidden)}
                      snapPointsX={[0, layout.titleOffsetX ?? 0, layout.authorOffsetX ?? 0]}
                      snapPointsY={[0]}
                    >
                      <p
                        className="text-zinc-300 leading-snug w-full block"
                        style={{
                          fontSize: `${layout.subtitleFontSize ?? 14}px`,
                          textAlign: (layout.subtitleAlignH || 'left') as any,
                        }}
                      >
                        {cover.frontSubtitle}
                      </p>
                    </DraggableCoverBlock>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Foreground PNG/Decor Layers (above text blocks) */}
          {fgLayers.length > 0 && (
            <div className="absolute inset-2 pointer-events-none z-25">
              {fgLayers.map((layer) => (
                <CoverLayerItemOnCanvas
                  key={layer.id}
                  layer={layer}
                  isSelected={activeLayerId === layer.id}
                  showGuides={showGuides}
                  onSelect={() => {
                    onSelectBlock(null);
                    onSelectLayer(layer.id);
                  }}
                  onUpdate={(patch) => handleUpdateLayer(layer.id, patch)}
                  onMoveOrder={(dir) => handleMoveLayerOrder(layer.id, dir)}
                  onDelete={() => handleDeleteLayer(layer.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Back Cover Quick Image Actions Bar */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800 text-[14px] flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 font-bold">Задняя сторона переплета:</span>
          {cover.backImageUrl ? (
            <span className="text-rose-400 text-[14px] font-mono">Картинка установлена</span>
          ) : (
            <span className="text-zinc-500 text-[14px]">Цветовая схема книги ({spineBg})</span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenBackImageGen}
            className="min-h-[38px] px-3 bg-zinc-900 border border-zinc-700 hover:border-rose-500 hover:text-white text-zinc-200 font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
          >
            <Sparkles className="w-4 h-4 text-rose-500" />
            <span>Сгенерировать ИИ-картинку задника</span>
          </button>

          <button
            type="button"
            onClick={onOpenBackImageUpload}
            className="min-h-[38px] px-3 bg-zinc-900 border border-zinc-700 hover:border-zinc-400 hover:text-white text-zinc-200 font-bold transition flex items-center gap-1.5 cursor-pointer text-[14px]"
          >
            <ImageIcon className="w-4 h-4 text-zinc-300" />
            <span>Вставить свою картинку</span>
          </button>

          {cover.backImageUrl && (
            <button
              type="button"
              onClick={() => onUpdateCover({ backImageUrl: '' })}
              className="min-h-[38px] px-2.5 bg-zinc-900 border border-zinc-700 hover:bg-rose-950/60 hover:text-rose-400 text-zinc-400 font-bold transition flex items-center gap-1 cursor-pointer text-[14px]"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Сбросить</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
