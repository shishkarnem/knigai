import React from 'react';

interface RainStreak {
  id: number;
  x1: number;
  y1: number;
  len: number;
  dur: string;
  begin: string;
  crimson?: boolean;
  opacity: number;
  width: number;
}

const FAR_RAIN: RainStreak[] = Array.from({ length: 28 }, (_, i) => ({
  id: i,
  x1: ((i * 53) % 1440),
  y1: -140 - ((i * 89) % 400),
  len: 44 + (i % 4) * 14,
  dur: `${1.55 + (i % 5) * 0.22}s`,
  begin: `-${((i * 0.37) % 1.8).toFixed(2)}s`,
  crimson: i % 4 === 0,
  opacity: i % 4 === 0 ? 0.24 : 0.16,
  width: 1,
}));

const NEAR_RAIN: RainStreak[] = Array.from({ length: 20 }, (_, i) => ({
  id: i + 100,
  x1: ((i * 79 + 25) % 1440),
  y1: -180 - ((i * 113) % 500),
  len: 68 + (i % 3) * 22,
  dur: `${1.05 + (i % 4) * 0.18}s`,
  begin: `-${((i * 0.29) % 1.4).toFixed(2)}s`,
  crimson: i % 3 === 0,
  opacity: i % 3 === 0 ? 0.38 : 0.24,
  width: i % 3 === 0 ? 1.5 : 1.1,
}));

const PUDDLE_RIPPLES = [
  { cx: 210, cy: 828, maxRx: 78, maxRy: 16, dur: '3.2s', begin: '0s', crimson: true },
  { cx: 495, cy: 856, maxRx: 96, maxRy: 19, dur: '3.8s', begin: '-1.1s', crimson: false },
  { cx: 760, cy: 834, maxRx: 84, maxRy: 17, dur: '2.9s', begin: '-2.1s', crimson: true },
  { cx: 1055, cy: 864, maxRx: 108, maxRy: 21, dur: '3.5s', begin: '-0.6s', crimson: true },
  { cx: 1275, cy: 832, maxRx: 74, maxRy: 15, dur: '3.1s', begin: '-1.8s', crimson: false },
  { cx: 640, cy: 874, maxRx: 118, maxRy: 22, dur: '4.2s', begin: '-2.7s', crimson: true },
];

export const NoirRainNeonBackground: React.FC = () => {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-0 pointer-events-none overflow-hidden select-none bg-[#050507]"
    >
      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full block"
      >
        <defs>
          {/* Ambient crimson noir glows */}
          <radialGradient id="noirGlowLeft" cx="12%" cy="22%" r="48%">
            <stop offset="0%" stopColor="#e11d48" stopOpacity="0.24" />
            <stop offset="45%" stopColor="#881337" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#050507" stopOpacity="0" />
          </radialGradient>

          <radialGradient id="noirGlowRight" cx="88%" cy="30%" r="44%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.22" />
            <stop offset="48%" stopColor="#9f1239" stopOpacity="0.09" />
            <stop offset="100%" stopColor="#050507" stopOpacity="0" />
          </radialGradient>

          {/* Wet asphalt & puddle bottom sheen */}
          <linearGradient id="noirAsphaltSheen" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#050507" stopOpacity="0" />
            <stop offset="40%" stopColor="#1f070e" stopOpacity="0.55" />
            <stop offset="78%" stopColor="#4c0519" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#09090b" stopOpacity="0.92" />
          </linearGradient>

          {/* Vertical shimmering neon reflections in puddles */}
          <linearGradient id="puddleReflCrimson" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.48" />
            <stop offset="55%" stopColor="#e11d48" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#050507" stopOpacity="0" />
          </linearGradient>

          <linearGradient id="puddleReflWhite" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.24" />
            <stop offset="65%" stopColor="#fecdd3" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#050507" stopOpacity="0" />
          </linearGradient>

          {/* Diagonal atmospheric streetlamp fog */}
          <linearGradient id="noirFogBeam" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.06" />
            <stop offset="50%" stopColor="#f43f5e" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#050507" stopOpacity="0" />
          </linearGradient>

          <filter id="noirNeonBlur" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Base Deep Noir Backdrop & Crimson Haze */}
        <rect x="0" y="0" width="1440" height="900" fill="#050507" />
        <rect x="0" y="0" width="1440" height="900" fill="url(#noirGlowLeft)" />
        <rect x="0" y="0" width="1440" height="900" fill="url(#noirGlowRight)" />

        {/* Subtle Noir Architectural Grid / Alley Perspective Lines */}
        <g stroke="#ffffff" strokeOpacity="0.035" strokeWidth="1">
          <line x1="0" y1="740" x2="1440" y2="740" />
          <line x1="160" y1="0" x2="160" y2="740" />
          <line x1="1280" y1="0" x2="1280" y2="740" />
        </g>

        {/* Diagonal Streetlight Beams */}
        <polygon points="90,0 320,0 640,760 220,760" fill="url(#noirFogBeam)" />
        <polygon points="1180,0 1380,0 1090,760 790,760" fill="url(#noirFogBeam)" />

        {/* Crimson Neon Alley Tubes (Left & Right Silhouettes) */}
        <g filter="url(#noirNeonBlur)">
          {/* Left vertical double crimson neon tube with subtle realistic flicker */}
          <line x1="72" y1="88" x2="72" y2="490" stroke="#f43f5e" strokeWidth="3.5">
            <animate
              attributeName="stroke-opacity"
              values="0.85;0.95;0.35;0.92;0.88;0.55;0.95"
              keyTimes="0;0.42;0.44;0.46;0.78;0.8;1"
              dur="6.5s"
              repeatCount="indefinite"
            />
          </line>
          <line x1="86" y1="140" x2="86" y2="430" stroke="#e11d48" strokeWidth="2" strokeOpacity="0.65" />

          {/* Left sharp geometric neon sign frame */}
          <rect
            x="44"
            y="180"
            width="92"
            height="190"
            fill="none"
            stroke="#fb7185"
            strokeWidth="1.5"
            strokeOpacity="0.45"
          />

          {/* Right vertical crimson neon tubes & horizontal roof strip */}
          <line x1="1364" y1="115" x2="1364" y2="540" stroke="#e11d48" strokeWidth="3.5">
            <animate
              attributeName="stroke-opacity"
              values="0.9;0.85;0.95;0.25;0.9;0.92"
              keyTimes="0;0.3;0.65;0.67;0.7;1"
              dur="5.2s"
              repeatCount="indefinite"
            />
          </line>
          <line x1="1348" y1="160" x2="1348" y2="470" stroke="#ffffff" strokeWidth="1.2" strokeOpacity="0.35" />
          <line x1="1210" y1="115" x2="1364" y2="115" stroke="#f43f5e" strokeWidth="2.5" strokeOpacity="0.7" />
        </g>

        {/* Wet Asphalt Surface & Vertical Neon Reflections */}
        <rect x="0" y="715" width="1440" height="185" fill="url(#noirAsphaltSheen)" />
        <g opacity="0.75">
          <rect x="64" y="745" width="18" height="140" fill="url(#puddleReflCrimson)">
            <animate attributeName="opacity" values="0.65;0.95;0.65" dur="2.8s" repeatCount="indefinite" />
          </rect>
          <rect x="1352" y="742" width="22" height="145" fill="url(#puddleReflCrimson)">
            <animate attributeName="opacity" values="0.9;0.55;0.9" dur="3.4s" repeatCount="indefinite" />
          </rect>
          <rect x="330" y="758" width="14" height="110" fill="url(#puddleReflWhite)">
            <animate attributeName="opacity" values="0.4;0.75;0.4" dur="3.9s" repeatCount="indefinite" />
          </rect>
          <rect x="1080" y="754" width="16" height="115" fill="url(#puddleReflCrimson)">
            <animate attributeName="opacity" values="0.5;0.85;0.5" dur="3.1s" repeatCount="indefinite" />
          </rect>
        </g>

        {/* Puddle Contours (Wet Noir Street Pools) */}
        <g fill="#050507" fillOpacity="0.45" stroke="#f43f5e" strokeWidth="1" strokeOpacity="0.22">
          <ellipse cx="210" cy="830" rx="140" ry="26" />
          <ellipse cx="640" cy="868" rx="220" ry="32" stroke="#ffffff" strokeOpacity="0.16" />
          <ellipse cx="1065" cy="856" rx="170" ry="28" />
        </g>

        {/* Animated Puddle Ripples from Raindrops */}
        {PUDDLE_RIPPLES.map((p, idx) => (
          <g key={idx}>
            <ellipse
              cx={p.cx}
              cy={p.cy}
              rx={10}
              ry={2}
              fill="none"
              stroke={p.crimson ? '#f43f5e' : '#ffffff'}
              strokeWidth="1.4"
            >
              <animate attributeName="rx" values={`8;${p.maxRx}`} dur={p.dur} begin={p.begin} repeatCount="indefinite" />
              <animate attributeName="ry" values={`2;${p.maxRy}`} dur={p.dur} begin={p.begin} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.85;0.45;0" dur={p.dur} begin={p.begin} repeatCount="indefinite" />
            </ellipse>
            <ellipse
              cx={p.cx}
              cy={p.cy}
              rx={4}
              ry={1}
              fill="none"
              stroke={p.crimson ? '#fb7185' : '#e4e4e7'}
              strokeWidth="1"
            >
              <animate
                attributeName="rx"
                values={`4;${Math.round(p.maxRx * 0.62)}`}
                dur={p.dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
              <animate
                attributeName="ry"
                values={`1;${Math.round(p.maxRy * 0.62)}`}
                dur={p.dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.9;0.35;0"
                dur={p.dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
            </ellipse>
            {/* Tiny vertical splash tick on droplet impact */}
            <line
              x1={p.cx}
              y1={p.cy - 2}
              x2={p.cx - 2}
              y2={p.cy - 14}
              stroke={p.crimson ? '#fda4af' : '#ffffff'}
              strokeWidth="1.2"
            >
              <animate
                attributeName="opacity"
                values="0.9;0;0"
                keyTimes="0;0.12;1"
                dur={p.dur}
                begin={p.begin}
                repeatCount="indefinite"
              />
            </line>
          </g>
        ))}

        {/* Far Slanted Rain Layer */}
        <g>
          {FAR_RAIN.map((drop) => (
            <line
              key={drop.id}
              x1={drop.x1}
              y1={drop.y1}
              x2={drop.x1 - drop.len * 0.18}
              y2={drop.y1 + drop.len}
              stroke={drop.crimson ? '#f43f5e' : '#e4e4e7'}
              strokeWidth={drop.width}
              strokeOpacity={drop.opacity}
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to="-195 1060"
                dur={drop.dur}
                begin={drop.begin}
                repeatCount="indefinite"
              />
            </line>
          ))}
        </g>

        {/* Foreground Crisp Slanted Rain Layer */}
        <g>
          {NEAR_RAIN.map((drop) => (
            <line
              key={drop.id}
              x1={drop.x1}
              y1={drop.y1}
              x2={drop.x1 - drop.len * 0.2}
              y2={drop.y1 + drop.len}
              stroke={drop.crimson ? '#fb7185' : '#ffffff'}
              strokeWidth={drop.width}
              strokeOpacity={drop.opacity}
            >
              <animateTransform
                attributeName="transform"
                type="translate"
                from="0 0"
                to="-220 1120"
                dur={drop.dur}
                begin={drop.begin}
                repeatCount="indefinite"
              />
            </line>
          ))}
        </g>
      </svg>
    </div>
  );
};
