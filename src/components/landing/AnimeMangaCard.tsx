import React from 'react';
import { ArrowRight } from 'lucide-react';
import { RubikMarkerHeading } from './RubikMarkerHeading';

export interface MangaCardProps {
  id: string;
  badge: string;
  title: string;
  shortDesc: string;
  icon: React.ReactNode;
  accent: 'rose' | 'white' | 'zinc';
  index: number;
  onClick: () => void;
  style?: React.CSSProperties;
  className?: string;
}

export const AnimeMangaCard: React.FC<MangaCardProps> = ({
  badge,
  title,
  shortDesc,
  icon,
  accent,
  index,
  onClick,
  style,
  className = '',
}) => {
  const isLeft = index % 2 === 0;
  const rowIdx = Math.floor(index / 2);
  const isRowEven = rowIdx % 2 === 0;

  // Geometry: Parallel adjacent edges for pairs of cards
  // Row even: Left right-edge (+6%), Right left-edge (+6%) => PARALLEL
  // Row odd:  Left right-edge (-6%), Right left-edge (-6%) => PARALLEL
  const clipPath = isLeft
    ? isRowEven
      ? 'polygon(0% 0%, 94% 0%, 100% 100%, 0% 100%)'
      : 'polygon(0% 0%, 100% 0%, 94% 100%, 0% 100%)'
    : isRowEven
    ? 'polygon(0% 0%, 100% 0%, 100% 100%, 6% 100%)'
    : 'polygon(6% 0%, 100% 0%, 100% 100%, 0% 100%)';

  const svgPolygonPoints = isLeft
    ? isRowEven
      ? '0,0 94,0 100,100 0,100'
      : '0,0 100,0 94,100 0,100'
    : isRowEven
    ? '0,0 100,0 100,100 6,100'
    : '6,0 100,0 100,100 0,100';

  const isRose = accent === 'rose';

  // Sloped Padding System:
  // Each content row's padding shifts dynamically to match the exact diagonal slant of the boundary,
  // preventing any clipping of icons, text, or buttons while creating an authentic comic panel slope.
  let rowPadHeader = 'px-2 sm:px-5';
  let rowPadTitle = 'px-2 sm:px-5';
  let rowPadDesc = 'px-2 sm:px-5';
  let rowPadFooter = 'px-2 sm:px-5';

  if (isLeft) {
    if (isRowEven) {
      // Slant cuts inward at top-right
      rowPadHeader = 'pl-2 sm:pl-5 pr-4 sm:pr-12';
      rowPadTitle = 'pl-2 sm:pl-5 pr-3.5 sm:pr-9';
      rowPadDesc = 'pl-2 sm:pl-5 pr-2.5 sm:pr-7';
      rowPadFooter = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
    } else {
      // Slant cuts inward at bottom-right
      rowPadHeader = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
      rowPadTitle = 'pl-2 sm:pl-5 pr-2.5 sm:pr-7';
      rowPadDesc = 'pl-2 sm:pl-5 pr-3.5 sm:pr-10';
      rowPadFooter = 'pl-2 sm:pl-5 pr-4 sm:pr-14';
    }
  } else {
    if (isRowEven) {
      // Slant cuts inward at bottom-left
      rowPadHeader = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
      rowPadTitle = 'pl-3 sm:pl-7 pr-2 sm:pr-5';
      rowPadDesc = 'pl-3.5 sm:pl-10 pr-2 sm:pr-5';
      rowPadFooter = 'pl-4 sm:pl-14 pr-2 sm:pr-5';
    } else {
      // Slant cuts inward at top-left
      rowPadHeader = 'pl-4 sm:pl-12 pr-2 sm:pr-5';
      rowPadTitle = 'pl-3.5 sm:pl-9 pr-2 sm:pr-5';
      rowPadDesc = 'pl-2.5 sm:pl-7 pr-2 sm:pr-5';
      rowPadFooter = 'pl-2 sm:pl-5 pr-2 sm:pr-5';
    }
  }

  return (
    <div
      style={{
        filter: 'none',
        ...style,
      }}
      className={`relative will-change-transform ${className}`}
    >
      <div
        onClick={onClick}
        style={{
          clipPath,
        }}
        className="group relative w-full bg-transparent pt-3.5 pb-3 sm:pt-5 sm:pb-4 transition-all duration-300 cursor-pointer hover:scale-[1.01] flex flex-col justify-between gap-2.5 sm:gap-4 overflow-hidden rounded-none min-h-[330px] sm:min-h-[250px]"
      >
        {/* 100% Visible Solid SVG Border with Parallel Dividing Angled Edge */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          {/* Main frame border */}
          <polygon
            points={svgPolygonPoints}
            fill="none"
            stroke={isRose ? 'rgba(239, 68, 68, 0.75)' : 'rgba(255, 255, 255, 0.5)'}
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
          />

          {/* Highlighted Parallel Adjacent Dividing Edge */}
          {isLeft ? (
            <line
              x1={isRowEven ? 94 : 100}
              y1={0}
              x2={isRowEven ? 100 : 94}
              y2={100}
              stroke={isRose ? '#ef4444' : '#ffffff'}
              strokeWidth="2.8"
              vectorEffect="non-scaling-stroke"
            />
          ) : (
            <line
              x1={isRowEven ? 0 : 6}
              y1={0}
              x2={isRowEven ? 6 : 0}
              y2={100}
              stroke={isRose ? '#ef4444' : '#ffffff'}
              strokeWidth="2.8"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* 1. Top Badge & Comic Panel Number with sloped clearance */}
        <div className={`relative z-10 flex items-center justify-between gap-1.5 sm:gap-2 w-full ${rowPadHeader}`}>
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <div className="p-1 bg-transparent border-0 shrink-0">
              {icon}
            </div>
            <span
              className={`text-[14px] font-mono px-2 py-0.5 border truncate ${
                isRose
                  ? 'bg-transparent border-rose-500 text-rose-300'
                  : 'bg-transparent border-zinc-700 text-zinc-300'
              }`}
            >
              {badge}
            </span>
          </div>

          <span className="font-mono text-[14px] text-zinc-400 font-bold group-hover:text-white transition-colors shrink-0">
            #0{index + 1}
          </span>
        </div>

        {/* 2. Panel Title with sloped clearance */}
        <div className={`relative z-10 w-full ${rowPadTitle}`}>
          <RubikMarkerHeading
            as="h3"
            text={title}
            className="text-[15px] sm:text-[19px] leading-tight transition-colors group-hover:text-rose-400"
          />
        </div>

        {/* 3. Short Description with sloped clearance (Full text on mobile) */}
        <div className={`relative z-10 flex-1 w-full ${rowPadDesc}`}>
          <p className="text-[14px] text-zinc-300 leading-snug sm:leading-relaxed font-['PT_Serif',serif] line-clamp-none">
            {shortDesc}
          </p>
        </div>

        {/* 4. Bottom Action Hint with sloped clearance (No cut-off for "Открыть") */}
        <div className={`relative z-10 pt-2 border-t border-zinc-800/80 flex items-center justify-between text-[14px] w-full ${rowPadFooter}`}>
          <span className="text-zinc-400 group-hover:text-white font-medium flex items-center gap-1 transition-colors">
            <span>Подробнее</span>
            <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
          </span>
          <span className="text-rose-500 text-[14px] font-mono opacity-80 group-hover:opacity-100 hidden sm:inline">
            Открыть
          </span>
        </div>
      </div>
    </div>
  );
};
