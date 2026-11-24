import React, { useEffect, useRef, useState } from 'react';

interface RippleBurst {
  id: number;
  x: number;
  y: number;
  crimsonAccent: boolean;
}

export const NoirClickRipples: React.FC = () => {
  const [ripples, setRipples] = useState<RippleBurst[]>([]);
  const nextIdRef = useRef(1);

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      if (typeof e.clientX !== 'number' || typeof e.clientY !== 'number') return;
      const id = nextIdRef.current++;
      const crimsonAccent = id % 2 === 1;
      const x = e.clientX;
      const y = e.clientY;

      setRipples((prev) => [...prev.slice(-10), { id, x, y, crimsonAccent }]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((item) => item.id !== id));
      }, 850);
    };

    window.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  if (ripples.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden select-none"
    >
      {ripples.map((r) => (
        <svg
          key={r.id}
          width="170"
          height="170"
          viewBox="0 0 170 170"
          className="fixed pointer-events-none"
          style={{
            left: `${r.x - 85}px`,
            top: `${r.y - 85}px`,
          }}
        >
          {/* Outer crimson or stark white ink puddle wave */}
          <circle
            cx="85"
            cy="85"
            r="74"
            fill="none"
            stroke={r.crimsonAccent ? '#f43f5e' : '#ffffff'}
            strokeWidth="2"
            strokeOpacity="0.85"
            className="noir-ripple-outer"
          />
          {/* Secondary concentric contrast ring */}
          <circle
            cx="85"
            cy="85"
            r="60"
            fill="none"
            stroke={r.crimsonAccent ? '#ffffff' : '#e11d48'}
            strokeWidth="1.5"
            strokeOpacity="0.7"
            strokeDasharray="6 4"
            className="noir-ripple-inner"
          />
          {/* Center droplet impact ring */}
          <circle
            cx="85"
            cy="85"
            r="34"
            fill="none"
            stroke="#fb7185"
            strokeWidth="1.2"
            strokeOpacity="0.65"
            className="noir-ripple-inner"
          />
        </svg>
      ))}
    </div>
  );
};
