import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Lock,
  Move,
  RotateCw,
  Trash2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
import { CoverImageLayer } from '../../../types';
import { getImageFilterStyle } from '../../editor/ImageFilterControl';

interface CoverLayerItemOnCanvasProps {
  layer: CoverImageLayer;
  isSelected: boolean;
  showGuides: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<CoverImageLayer>) => void;
  onMoveOrder: (direction: 'up' | 'down') => void;
  onDelete: () => void;
}

export const CoverLayerItemOnCanvas: React.FC<CoverLayerItemOnCanvasProps> = ({
  layer,
  isSelected,
  showGuides,
  onSelect,
  onUpdate,
  onMoveOrder,
  onDelete,
}) => {
  const [dragMode, setDragMode] = useState<'none' | 'move' | 'scale' | 'rotate'>('none');
  const [collapsed, setCollapsed] = useState(false);
  const centerRef = useRef<{ cx: number; cy: number }>({ cx: 0, cy: 0 });
  const startRef = useRef<{
    clientX: number;
    clientY: number;
    x: number;
    y: number;
    scale: number;
    rotation: number;
  }>({
    clientX: 0,
    clientY: 0,
    x: 0,
    y: 0,
    scale: 100,
    rotation: 0,
  });
  const boxRef = useRef<HTMLDivElement | null>(null);

  const startPointer = (
    e: React.MouseEvent | React.TouchEvent,
    mode: 'move' | 'scale' | 'rotate'
  ) => {
    e.stopPropagation();
    onSelect();
    if (layer.locked) return;

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    if (boxRef.current) {
      const rect = boxRef.current.getBoundingClientRect();
      centerRef.current = {
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
      };
    }

    startRef.current = {
      clientX,
      clientY,
      x: layer.x,
      y: layer.y,
      scale: layer.scale,
      rotation: layer.rotation,
    };
    setDragMode(mode);
  };

  const handleMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (dragMode === 'none') return;
      if ('touches' in e && e.cancelable) e.preventDefault();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      if (dragMode === 'move') {
        const dx = clientX - startRef.current.clientX;
        const dy = clientY - startRef.current.clientY;
        onUpdate({
          x: Math.max(-420, Math.min(420, Math.round(startRef.current.x + dx))),
          y: Math.max(-320, Math.min(320, Math.round(startRef.current.y + dy))),
        });
      } else if (dragMode === 'scale') {
        const dx = clientX - startRef.current.clientX;
        const dy = clientY - startRef.current.clientY;
        const delta = Math.round((dx + dy) * 0.45);
        onUpdate({
          scale: Math.max(10, Math.min(300, startRef.current.scale + delta)),
        });
      } else if (dragMode === 'rotate') {
        const angleRad = Math.atan2(
          clientY - centerRef.current.cy,
          clientX - centerRef.current.cx
        );
        const deg = Math.round((angleRad * 180) / Math.PI) + 90;
        const normalized = ((deg + 180) % 360 + 360) % 360 - 180;
        onUpdate({ rotation: normalized });
      }
    },
    [dragMode, onUpdate]
  );

  const handleUp = useCallback(() => {
    setDragMode('none');
  }, []);

  useEffect(() => {
    if (dragMode === 'none') return;
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('touchmove', handleMove, { passive: false });
    window.addEventListener('touchend', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('touchmove', handleMove);
      window.removeEventListener('touchend', handleUp);
    };
  }, [dragMode, handleMove, handleUp]);

  if (!layer.visible && !showGuides) return null;

  const filterCss = getImageFilterStyle(layer.filter);
  const scaleFactor = Math.max(0.1, layer.scale / 100);
  const displayWidth = Math.max(24, layer.widthPx * scaleFactor);

  return (
    <div
      ref={boxRef}
      data-cover-interactive="true"
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseDown={(e) => {
        if (!layer.locked) startPointer(e, 'move');
      }}
      onTouchStart={(e) => {
        if (!layer.locked) startPointer(e, 'move');
      }}
      className={`absolute select-none touch-none ${
        layer.locked ? 'cursor-default' : 'cursor-move'
      } ${!layer.visible ? 'opacity-25' : ''}`}
      style={{
        left: '50%',
        top: '50%',
        width: `${displayWidth}px`,
        transform: `translate(calc(-50% + ${layer.x}px), calc(-50% + ${layer.y}px)) rotate(${layer.rotation}deg)`,
        transformOrigin: 'center center',
        zIndex: isSelected ? Math.max(layer.zIndex, 35) : layer.zIndex,
        pointerEvents: 'auto',
      }}
    >
      {/* Translucent Frosted Layer Controls when selected (placed outside layer image box) */}
      {showGuides && isSelected && (
        <div
          data-cover-interactive="true"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ transform: `rotate(${-layer.rotation}deg)` }}
          className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 flex flex-nowrap items-center gap-1 p-1 bg-black/65 backdrop-blur-md border border-rose-500/80 shadow-2xl whitespace-nowrap"
        >
          <span
            onMouseDown={(e) => startPointer(e, 'move')}
            onTouchStart={(e) => startPointer(e, 'move')}
            className="px-2 py-0.5 bg-rose-600/90 text-white text-[14px] font-mono font-bold flex items-center gap-1 cursor-move"
          >
            <Move className="w-3.5 h-3.5" />
            <span className="max-w-[110px] truncate">{layer.name}</span>
          </span>

          {!collapsed && (
            <>
              <button
                type="button"
                onClick={() => onUpdate({ rotation: ((layer.rotation - 15 + 180) % 360 + 360) % 360 - 180 })}
                className="px-1.5 py-0.5 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:text-white text-[14px] font-mono cursor-pointer"
                title="Повернуть -15°"
              >
                -15°
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ rotation: ((layer.rotation + 15 + 180) % 360 + 360) % 360 - 180 })}
                className="px-1.5 py-0.5 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:text-white text-[14px] font-mono cursor-pointer"
                title="Повернуть +15°"
              >
                +15°
              </button>
              <button
                type="button"
                onClick={() => onMoveOrder('up')}
                className="p-1 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:text-white cursor-pointer"
                title="Поднять слой выше"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onMoveOrder('down')}
                className="p-1 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:text-white cursor-pointer"
                title="Опустить слой ниже"
              >
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ visible: !layer.visible })}
                className="p-1 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:text-white cursor-pointer"
                title={layer.visible ? 'Скрыть слой' : 'Показать слой'}
              >
                {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5 text-rose-400" />}
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ locked: !layer.locked })}
                className={`p-1 border cursor-pointer ${
                  layer.locked
                    ? 'bg-rose-600 border-rose-400 text-white'
                    : 'bg-black/55 border-zinc-600/80 text-zinc-200 hover:text-white'
                }`}
                title={layer.locked ? 'Разблокировать слой' : 'Закрепить слой'}
              >
                <Lock className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="p-1 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:bg-rose-600 hover:text-white cursor-pointer"
                title="Удалить слой"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setCollapsed((p) => !p)}
            className="p-1 bg-black/55 border border-zinc-600/80 text-zinc-200 hover:text-white cursor-pointer"
            title={collapsed ? 'Развернуть панель слоя' : 'Свернуть панель слоя'}
          >
            {collapsed ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Selection Frame */}
      <div
        className={`relative w-full ${
          showGuides && isSelected
            ? 'outline-2 outline-dashed outline-rose-500'
            : showGuides
            ? 'hover:outline hover:outline-dashed hover:outline-zinc-400/70'
            : ''
        }`}
      >
        <img
          src={layer.url}
          alt={layer.name}
          draggable={false}
          referrerPolicy="no-referrer"
          className="w-full h-auto block pointer-events-none select-none"
          style={{
            opacity: Math.max(0.05, Math.min(1, layer.opacity / 100)),
            mixBlendMode: layer.blendMode || 'normal',
            transform: layer.flipX ? 'scaleX(-1)' : undefined,
            ...filterCss,
          }}
        />
      </div>

      {/* Rotate Handle */}
      {showGuides && isSelected && !layer.locked && (
        <div
          onMouseDown={(e) => startPointer(e, 'rotate')}
          onTouchStart={(e) => startPointer(e, 'rotate')}
          className="touch-none absolute -top-7 right-0 w-6 h-6 bg-black/75 backdrop-blur-md border border-rose-500 text-white flex items-center justify-center cursor-grab shadow-md z-40"
          title="Потяните для вращения слоя"
        >
          <RotateCw className="w-3.5 h-3.5 text-rose-400" />
        </div>
      )}

      {/* Scale Handle */}
      {showGuides && isSelected && !layer.locked && (
        <div
          onMouseDown={(e) => startPointer(e, 'scale')}
          onTouchStart={(e) => startPointer(e, 'scale')}
          className="touch-none absolute -bottom-2.5 -right-2.5 w-6 h-6 bg-white/90 text-black border border-rose-600 flex items-center justify-center cursor-nwse-resize shadow-md z-40"
          title="Потяните для масштабирования слоя"
        >
          <span className="text-[14px] font-bold leading-none">⤡</span>
        </div>
      )}
    </div>
  );
};
