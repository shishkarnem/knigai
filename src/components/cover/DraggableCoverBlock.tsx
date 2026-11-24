import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Move,
  AlignCenter,
  AlignLeft,
  AlignRight,
  AlignJustify,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalSpaceAround,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
} from 'lucide-react';

export type VerticalAlign = 'top' | 'center' | 'bottom' | 'space-between';
export type HorizontalAlign = 'left' | 'center' | 'right' | 'justify';

interface DraggableCoverBlockProps {
  id: string;
  label: string;
  offsetX: number;
  offsetY: number;
  widthPercent?: number;
  heightPx?: number;
  showGuides: boolean;
  isSelected?: boolean;
  isHidden?: boolean;
  alignV?: VerticalAlign;
  alignH?: HorizontalAlign;
  snapPointsX?: number[];
  snapPointsY?: number[];
  onSelect?: () => void;
  onOffsetChange: (newX: number, newY: number) => void;
  onWidthChange?: (newWidth: number) => void;
  onHeightChange?: (newHeight: number) => void;
  onAlignVChange?: (align: VerticalAlign) => void;
  onAlignHChange?: (align: HorizontalAlign) => void;
  onToggleHidden?: () => void;
  onSnapChange?: (snap: { verticalGuide?: boolean; horizontalGuide?: boolean } | null) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  allowHorizontal?: boolean;
  allowVertical?: boolean;
  verticalToolbar?: boolean;
  toolbarPlacement?: 'top' | 'bottom';
}

const SNAP_THRESHOLD = 7;

export const DraggableCoverBlock: React.FC<DraggableCoverBlockProps> = ({
  label,
  offsetX,
  offsetY,
  widthPercent,
  heightPx,
  showGuides,
  isSelected,
  isHidden = false,
  alignV = 'top',
  alignH = 'left',
  snapPointsX = [0],
  snapPointsY = [0],
  onSelect,
  onOffsetChange,
  onWidthChange,
  onHeightChange,
  onAlignVChange,
  onAlignHChange,
  onToggleHidden,
  onSnapChange,
  children,
  className = '',
  style = {},
  allowHorizontal = true,
  allowVertical = true,
  verticalToolbar = false,
  toolbarPlacement = 'top',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [resizeMode, setResizeMode] = useState<'none' | 'width' | 'height' | 'both'>('none');
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [activeSnap, setActiveSnap] = useState<{ verticalGuide: boolean; horizontalGuide: boolean }>({
    verticalGuide: false,
    horizontalGuide: false,
  });

  const dragStartRef = useRef<{ startX: number; startY: number; initOffsetX: number; initOffsetY: number }>({
    startX: 0,
    startY: 0,
    initOffsetX: 0,
    initOffsetY: 0,
  });

  const resizeStartRef = useRef<{
    startX: number;
    startY: number;
    initWidth: number;
    initHeight: number;
  }>({
    startX: 0,
    startY: 0,
    initWidth: 100,
    initHeight: 80,
  });

  const handleDragStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (onSelect) onSelect();
    setIsDragging(true);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    dragStartRef.current = {
      startX: clientX,
      startY: clientY,
      initOffsetX: offsetX,
      initOffsetY: offsetY,
    };
  };

  const handleResizeStart = (e: React.MouseEvent | React.TouchEvent, mode: 'width' | 'height' | 'both') => {
    e.stopPropagation();
    if (onSelect) onSelect();
    setResizeMode(mode);

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const currentHeight = heightPx || (containerRef.current ? containerRef.current.offsetHeight : 80);

    resizeStartRef.current = {
      startX: clientX,
      startY: clientY,
      initWidth: widthPercent ?? 100,
      initHeight: currentHeight,
    };
  };

  const handleGlobalMouseMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if ('touches' in e && e.cancelable) {
        e.preventDefault();
      }
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (isDragging) {
        const deltaX = clientX - dragStartRef.current.startX;
        const deltaY = clientY - dragStartRef.current.startY;

        let rawX = allowHorizontal ? Math.round(dragStartRef.current.initOffsetX + deltaX) : offsetX;
        let rawY = allowVertical ? Math.round(dragStartRef.current.initOffsetY + deltaY) : offsetY;

        let snappedV = false;
        let snappedH = false;

        if (allowHorizontal) {
          for (const targetX of snapPointsX) {
            if (Math.abs(rawX - targetX) <= SNAP_THRESHOLD) {
              rawX = targetX;
              snappedV = true;
              break;
            }
          }
        }

        if (allowVertical) {
          for (const targetY of snapPointsY) {
            if (Math.abs(rawY - targetY) <= SNAP_THRESHOLD) {
              rawY = targetY;
              snappedH = true;
              break;
            }
          }
        }

        setActiveSnap({ verticalGuide: snappedV, horizontalGuide: snappedH });
        if (onSnapChange) onSnapChange({ verticalGuide: snappedV, horizontalGuide: snappedH });

        onOffsetChange(
          Math.max(-280, Math.min(280, rawX)),
          Math.max(-280, Math.min(280, rawY))
        );
      } else if (resizeMode !== 'none') {
        const deltaX = clientX - resizeStartRef.current.startX;
        const deltaY = clientY - resizeStartRef.current.startY;

        if ((resizeMode === 'width' || resizeMode === 'both') && onWidthChange) {
          const nextWidth = Math.round(resizeStartRef.current.initWidth + deltaX * 0.45);
          onWidthChange(Math.max(30, Math.min(150, nextWidth)));
        }

        if ((resizeMode === 'height' || resizeMode === 'both') && onHeightChange) {
          const nextHeight = Math.round(resizeStartRef.current.initHeight + deltaY);
          onHeightChange(Math.max(24, Math.min(450, nextHeight)));
        }
      }
    },
    [
      isDragging,
      resizeMode,
      allowHorizontal,
      allowVertical,
      offsetX,
      offsetY,
      snapPointsX,
      snapPointsY,
      onOffsetChange,
      onWidthChange,
      onHeightChange,
      onSnapChange,
    ]
  );

  const handleGlobalMouseUp = useCallback(() => {
    setIsDragging(false);
    setResizeMode('none');
    setActiveSnap({ verticalGuide: false, horizontalGuide: false });
    if (onSnapChange) onSnapChange(null);
  }, [onSnapChange]);

  useEffect(() => {
    if (isDragging || resizeMode !== 'none') {
      window.addEventListener('mousemove', handleGlobalMouseMove);
      window.addEventListener('mouseup', handleGlobalMouseUp);
      window.addEventListener('touchmove', handleGlobalMouseMove, { passive: false });
      window.addEventListener('touchend', handleGlobalMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove);
        window.removeEventListener('mouseup', handleGlobalMouseUp);
        window.removeEventListener('touchmove', handleGlobalMouseMove);
        window.removeEventListener('touchend', handleGlobalMouseUp);
      };
    }
  }, [isDragging, resizeMode, handleGlobalMouseMove, handleGlobalMouseUp]);

  // Explicit flex alignment styles so text ALWAYS shifts visibly inside container
  const justifyCss: React.CSSProperties['justifyContent'] =
    alignV === 'center'
      ? 'center'
      : alignV === 'bottom'
      ? 'flex-end'
      : alignV === 'space-between'
      ? 'space-between'
      : 'flex-start';

  const alignItemsCss: React.CSSProperties['alignItems'] =
    alignH === 'center'
      ? 'center'
      : alignH === 'right'
      ? 'flex-end'
      : alignH === 'justify'
      ? 'stretch'
      : 'flex-start';

  const textAlignCss: React.CSSProperties['textAlign'] = alignH;

  if (isHidden && !showGuides) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      data-cover-interactive="true"
      onClick={(e) => {
        e.stopPropagation();
        if (onSelect) onSelect();
      }}
      className={`relative transition-shadow flex flex-col ${className} ${
        isHidden ? 'opacity-30' : ''
      } ${
        showGuides
          ? isSelected || isDragging
            ? 'border-2 border-dashed border-rose-500 bg-rose-950/15 z-30'
            : 'border border-dashed border-zinc-400/55 hover:border-zinc-200 z-20'
          : 'border-0 z-20'
      }`}
      style={{
        ...style,
        transform: `translate(${offsetX}px, ${offsetY}px)`,
        width: widthPercent !== undefined ? `${widthPercent}%` : undefined,
        height: heightPx !== undefined ? `${heightPx}px` : undefined,
        minHeight: heightPx !== undefined ? `${heightPx}px` : undefined,
      }}
    >
      {/* Magnetic Snap Center Guides */}
      {isDragging && activeSnap.verticalGuide && (
        <div className="absolute top-[-400px] bottom-[-400px] left-1/2 -translate-x-1/2 w-0.5 border-l-2 border-dashed border-rose-500 pointer-events-none z-40" />
      )}
      {isDragging && activeSnap.horizontalGuide && (
        <div className="absolute left-[-400px] right-[-400px] top-1/2 -translate-y-1/2 h-0.5 border-t-2 border-dashed border-rose-500 pointer-events-none z-40" />
      )}

      {/* Translucent Frosted Floating Toolbar (never overlaps field text; collapses/expands) */}
      {showGuides && (isSelected || isDragging) && (
        <div
          data-cover-interactive="true"
          className={
            verticalToolbar
              ? 'absolute top-1/2 left-full ml-3 -translate-y-1/2 w-0 h-0 flex items-center justify-center z-50 pointer-events-none'
              : 'contents'
          }
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={
              verticalToolbar
                ? 'pointer-events-auto rotate-90 origin-center flex flex-nowrap items-center gap-1 p-1 bg-black/65 backdrop-blur-md border border-rose-500/80 shadow-2xl select-none whitespace-nowrap'
                : `absolute ${
                    toolbarPlacement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
                  } left-0 z-50 flex flex-wrap items-center gap-1 p-1 bg-black/65 backdrop-blur-md border border-rose-500/80 shadow-2xl select-none max-w-[270px] sm:max-w-none`
            }
          >
            {/* Drag Handle */}
            <div
              onMouseDown={handleDragStart}
              onTouchStart={handleDragStart}
              className="touch-none flex items-center gap-1 px-2 py-0.5 text-[14px] font-mono font-bold cursor-move bg-rose-600/90 text-white whitespace-nowrap shrink-0"
              title="Потяните для перемещения блока"
            >
              <Move className="w-3.5 h-3.5 text-white shrink-0" />
              <span className={verticalToolbar ? 'max-w-[100px] truncate' : ''}>{label}</span>
              <span className="text-[14px] opacity-90 font-mono">
                ({offsetX > 0 ? `+${offsetX}` : offsetX},{offsetY > 0 ? `+${offsetY}` : offsetY})
              </span>
            </div>

            {!isToolbarCollapsed && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOffsetChange(0, offsetY);
                  }}
                  className="px-1.5 py-0.5 text-[14px] bg-black/55 hover:bg-white hover:text-black text-zinc-200 border border-zinc-600/80 font-mono transition cursor-pointer shrink-0"
                  title="По центру X = 0"
                >
                  X:0
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOffsetChange(offsetX, 0);
                  }}
                  className="px-1.5 py-0.5 text-[14px] bg-black/55 hover:bg-white hover:text-black text-zinc-200 border border-zinc-600/80 font-mono transition cursor-pointer shrink-0"
                  title="По центру Y = 0"
                >
                  Y:0
                </button>

                {onAlignVChange && (
                  <div className="flex items-center gap-0.5 bg-black/55 p-0.5 border border-zinc-600/80">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignVChange('top');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignV === 'top' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="Вертикально: верх"
                    >
                      <AlignVerticalJustifyStart className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignVChange('center');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignV === 'center' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="Вертикально: центр"
                    >
                      <AlignVerticalJustifyCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignVChange('bottom');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignV === 'bottom' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="Вертикально: низ"
                    >
                      <AlignVerticalJustifyEnd className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignVChange('space-between');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignV === 'space-between'
                          ? 'bg-rose-600 text-white'
                          : 'text-zinc-300 hover:text-white'
                      }`}
                      title="Равномерно по высоте"
                    >
                      <AlignVerticalSpaceAround className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {onAlignHChange && (
                  <div className="flex items-center gap-0.5 bg-black/55 p-0.5 border border-zinc-600/80">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignHChange('left');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignH === 'left' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="По левому краю"
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignHChange('center');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignH === 'center' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="По горизонтальному центру"
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignHChange('right');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignH === 'right' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="По правому краю"
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onAlignHChange('justify');
                      }}
                      className={`p-1 transition cursor-pointer ${
                        alignH === 'justify' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
                      }`}
                      title="По ширине"
                    >
                      <AlignJustify className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {onToggleHidden && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleHidden();
                    }}
                    className={`p-1 border transition cursor-pointer shrink-0 ${
                      isHidden
                        ? 'bg-rose-600 text-white border-rose-400'
                        : 'bg-black/55 text-zinc-200 border-zinc-600/80 hover:border-white'
                    }`}
                    title={isHidden ? 'Показать поле на обложке' : 'Скрыть поле с обложки'}
                  >
                    {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                )}
              </>
            )}

            {/* Collapse / Expand Toolbar Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsToolbarCollapsed((p) => !p);
              }}
              className="p-1 bg-black/55 hover:bg-white hover:text-black text-zinc-200 border border-zinc-600/80 transition cursor-pointer shrink-0"
              title={isToolbarCollapsed ? 'Развернуть панель настроек' : 'Свернуть панель настроек'}
            >
              {isToolbarCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Inner Content Container with deterministic Flex alignment */}
      <div
        className="w-full h-full flex-1 min-h-0 flex flex-col cursor-pointer"
        style={{
          justifyContent: justifyCss,
          alignItems: alignItemsCss,
          textAlign: textAlignCss,
        }}
      >
        {isHidden ? (
          <span className="text-[14px] font-mono text-zinc-400 italic px-1 select-none">
            [Скрыто: {label}]
          </span>
        ) : (
          children
        )}
      </div>

      {/* Resize Handles */}
      {showGuides && (isSelected || isDragging) && onWidthChange && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'width')}
          onTouchStart={(e) => handleResizeStart(e, 'width')}
          className="touch-none absolute -right-2.5 top-1/2 -translate-y-1/2 w-5 h-9 flex items-center justify-center cursor-ew-resize select-none z-30 bg-rose-600/85 text-white shadow-md"
          title="Потяните для изменения ширины контейнера"
        >
          <span className="text-[14px] font-bold leading-none">⋮</span>
        </div>
      )}

      {showGuides && (isSelected || isDragging) && onHeightChange && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'height')}
          onTouchStart={(e) => handleResizeStart(e, 'height')}
          className="touch-none absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-9 h-5 flex items-center justify-center cursor-ns-resize select-none z-30 bg-rose-600/85 text-white shadow-md"
          title="Потяните для регулировки высоты контейнера"
        >
          <span className="text-[14px] font-bold leading-none">⋯</span>
        </div>
      )}

      {showGuides && (isSelected || isDragging) && onWidthChange && onHeightChange && (
        <div
          onMouseDown={(e) => handleResizeStart(e, 'both')}
          onTouchStart={(e) => handleResizeStart(e, 'both')}
          className="touch-none absolute -bottom-2.5 -right-2.5 w-6 h-6 flex items-center justify-center cursor-nwse-resize select-none z-30 bg-white/90 text-black border border-rose-600 shadow-md"
          title="Потяните угол для ширины и высоты"
        >
          <span className="text-[14px] font-bold leading-none">⤡</span>
        </div>
      )}
    </div>
  );
};
