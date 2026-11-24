import React, { useMemo } from 'react';

interface RubikMarkerHeadingProps {
  text: string;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'span';
  className?: string;
  redRatio?: number; // default ~0.3 (30%)
}

// Simple deterministic hash for stable rendering across server/client and re-renders
function getDeterministicHash(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export const RubikMarkerHeading: React.FC<RubikMarkerHeadingProps> = ({
  text,
  as: Component = 'h2',
  className = '',
  redRatio = 0.3,
}) => {
  const renderedContent = useMemo(() => {
    const words = text.split(/(\s+)/);

    return words.map((chunk, wordIdx) => {
      // Preserve whitespace
      if (/^\s+$/.test(chunk)) {
        return chunk;
      }

      const wordHash = getDeterministicHash(chunk, wordIdx * 17);
      const isWordRed = wordHash % 100 < redRatio * 100 * 0.6; // ~18% full words red

      if (isWordRed) {
        return (
          <span key={wordIdx} className="text-rose-600 inline-block">
            {chunk}
          </span>
        );
      }

      // Otherwise, select individual letters inside the word (~20% of letters red)
      const letters = Array.from(chunk);
      return (
        <span key={wordIdx} className="text-white inline-block">
          {letters.map((char, charIdx) => {
            const charHash = getDeterministicHash(char + chunk, wordIdx * 31 + charIdx * 13);
            const isCharRed = charHash % 100 < redRatio * 100 * 0.7; // individual letter accent

            if (isCharRed) {
              return (
                <span key={charIdx} className="text-rose-500">
                  {char}
                </span>
              );
            }
            return (
              <span key={charIdx} className="text-white">
                {char}
              </span>
            );
          })}
        </span>
      );
    });
  }, [text, redRatio]);

  return (
    <Component
      style={{ fontFamily: "'Rubik Marker Hatch', cursive, sans-serif" }}
      className={`tracking-wide font-normal ${className}`}
    >
      {renderedContent}
    </Component>
  );
};
