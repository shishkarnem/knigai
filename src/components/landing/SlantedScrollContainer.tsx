import React, { useEffect, useRef, useState } from 'react';

export type SlantVariant = 'slant-left' | 'slant-right';

interface SlantedScrollContainerProps {
  children: React.ReactNode;
  variant?: SlantVariant;
  slideDirection?: 'left' | 'right';
  className?: string;
  accentColor?: string;
}

export const SlantedScrollContainer: React.FC<SlantedScrollContainerProps> = ({
  children,
  variant = 'slant-left',
  slideDirection = 'left',
  className = '',
  accentColor = '#ef4444',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [slideOffset, setSlideOffset] = useState(slideDirection === 'left' ? -90 : 90);
  const [opacity, setOpacity] = useState(0);

  useEffect(() => {
    let ticking = false;

    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          if (!containerRef.current) {
            ticking = false;
            return;
          }
          const rect = containerRef.current.getBoundingClientRect();
          const winHeight = window.innerHeight || 800;

          // How far the container has entered the screen (0 = just entering bottom, 1 = well into screen)
          const enterDistance = winHeight - rect.top;
          const totalDistance = winHeight * 0.65;
          const progress = Math.max(0, Math.min(1, enterDistance / totalDistance));

          // Neural book zigzag sync: sinusoidal slide wave
          const baseOffset = slideDirection === 'left' ? -160 : 160;
          const currentOffset = baseOffset * (1 - progress);

          setSlideOffset(currentOffset);
          setOpacity(Math.max(0, Math.min(1, progress * 1.4)));

          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [slideDirection]);

  // Parallel slope angle definitions:
  const isLeft = variant === 'slant-left';
  const polygonCss = isLeft
    ? 'polygon(4% 0%, 100% 0%, 96% 100%, 0% 100%)'
    : 'polygon(0% 0%, 96% 0%, 100% 100%, 4% 100%)';

  const svgPoints = isLeft ? '4,0 100,0 96,100 0,100' : '0,0 96,0 100,100 4,100';

  const scale = 0.88 + opacity * 0.12;

  return (
    <div
      ref={containerRef}
      style={{
        transform: `translateX(${slideOffset}px) scale(${scale})`,
        opacity,
        filter: 'none',
        transition: 'transform 0.12s ease-out, opacity 0.15s ease-out',
      }}
      className="w-full relative will-change-transform"
    >
      {/* Outer Slanted Container with 100% Transparency */}
      <div
        style={{
          clipPath: polygonCss,
        }}
        className={`relative w-full bg-transparent p-5 sm:p-8 rounded-none transition-colors overflow-hidden ${className}`}
      >
        {/* Content with safe padding so text never touches angled borders */}
        <div className="relative z-10 w-full px-2 sm:px-5">
          {children}
        </div>
      </div>

      {/* Explicit 100% Visible SVG Border with Parallel Angled Vertical Edges */}
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full pointer-events-none z-20 overflow-visible"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {/* Complete crisp polygon border */}
        <polygon
          points={svgPoints}
          fill="none"
          stroke="rgba(255, 255, 255, 0.55)"
          strokeWidth="1.8"
          vectorEffect="non-scaling-stroke"
        />

        {/* Highlighted Left Angled Parallel Boundary */}
        <line
          x1={isLeft ? 4 : 0}
          y1={0}
          x2={isLeft ? 0 : 4}
          y2={100}
          stroke={accentColor}
          strokeWidth="2.5"
          vectorEffect="non-scaling-stroke"
        />

        {/* Highlighted Right Angled Parallel Boundary */}
        <line
          x1={isLeft ? 100 : 96}
          y1={0}
          x2={isLeft ? 96 : 100}
          y2={100}
          stroke="#ffffff"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        {/* Sharp corner notch indicators at vertices */}
        <rect
          x={isLeft ? 3.5 : -0.5}
          y="-0.5"
          width="1"
          height="1"
          fill={accentColor}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={isLeft ? 99.5 : 95.5}
          y="-0.5"
          width="1"
          height="1"
          fill="#ffffff"
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={isLeft ? -0.5 : 3.5}
          y="99.5"
          width="1"
          height="1"
          fill={accentColor}
          vectorEffect="non-scaling-stroke"
        />
        <rect
          x={isLeft ? 95.5 : 99.5}
          y="99.5"
          width="1"
          height="1"
          fill="#ffffff"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
};
