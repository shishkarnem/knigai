import React from 'react';
import { ImageLayoutConfig } from '../../../types';
import { getImageFilterStyle } from '../../editor/ImageFilterControl';
import { getGradientBlendStyle } from '../hooks/pageIllustrationParser';

interface InlineIllustrationBlockProps {
  url: string;
  alt?: string;
  layout: ImageLayoutConfig;
  isLightTheme?: boolean;
  compact?: boolean;
}

export const InlineIllustrationBlock: React.FC<InlineIllustrationBlockProps> = ({
  url,
  alt = 'Иллюстрация',
  layout,
  isLightTheme = false,
  compact = false,
}) => {
  const mode = layout.mode || 'full-width';
  const scale = Math.min(100, Math.max(30, layout.scale || 85));
  const caption = layout.caption !== undefined ? layout.caption : alt !== 'Иллюстрация' ? alt : '';
  const filterStyle = getImageFilterStyle(layout.filter, layout.colorTint);
  const offsetTransform =
    layout.offsetX || layout.offsetY
      ? `translate(${layout.offsetX || 0}px, ${layout.offsetY || 0}px)`
      : undefined;

  const maxHClass = compact ? 'max-h-36' : 'max-h-56';

  if (mode === 'wrap-left') {
    return (
      <figure
        className="float-left mr-3 mb-2 checkerboard-bg p-1 border border-zinc-600/60 overflow-hidden shadow-md"
        style={{
          width: `${scale}%`,
          maxWidth: compact ? '52%' : '48%',
          transform: offsetTransform,
        }}
      >
        <img
          src={url}
          alt={alt}
          className="w-full h-auto object-contain"
          referrerPolicy="no-referrer"
          style={filterStyle}
        />
        {caption && (
          <figcaption className="text-[14px] italic opacity-80 text-center mt-1 leading-tight">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (mode === 'wrap-right') {
    return (
      <figure
        className="float-right ml-3 mb-2 checkerboard-bg p-1 border border-zinc-600/60 overflow-hidden shadow-md"
        style={{
          width: `${scale}%`,
          maxWidth: compact ? '52%' : '48%',
          transform: offsetTransform,
        }}
      >
        <img
          src={url}
          alt={alt}
          className="w-full h-auto object-contain"
          referrerPolicy="no-referrer"
          style={filterStyle}
        />
        {caption && (
          <figcaption className="text-[14px] italic opacity-80 text-center mt-1 leading-tight">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (mode === 'header-break') {
    return (
      <figure
        className="mx-auto my-2.5 clear-both flex flex-col items-center"
        style={{ width: `${scale}%`, transform: offsetTransform }}
      >
        <div className="w-12 h-0.5 bg-rose-500 mb-1.5" />
        <div className="w-full checkerboard-bg p-1 border-y-2 border-zinc-500/70 flex items-center justify-center overflow-hidden">
          <img
            src={url}
            alt={alt}
            className={`${maxHClass} w-auto object-contain mx-auto`}
            referrerPolicy="no-referrer"
            style={filterStyle}
          />
        </div>
        {caption && (
          <figcaption className="text-[14px] italic opacity-80 text-center mt-1 leading-tight">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (mode === 'gradient-blend') {
    const gradStyle = getGradientBlendStyle(layout.gradientDirection || 'bottom', layout.bgOpacity ?? 85);
    return (
      <figure
        className="mx-auto my-2 clear-both overflow-hidden flex flex-col items-center"
        style={{ width: `${scale}%`, transform: offsetTransform }}
      >
        <img
          src={url}
          alt={alt}
          className={`${maxHClass} w-full object-cover`}
          referrerPolicy="no-referrer"
          style={{ ...filterStyle, ...gradStyle }}
        />
        {caption && (
          <figcaption className="text-[14px] italic opacity-75 text-center -mt-2 relative z-10 leading-tight">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (mode === 'graphic-panel') {
    return (
      <figure
        className={`mx-auto my-2.5 clear-both relative border-2 ${
          isLightTheme ? 'border-black bg-zinc-900 text-white' : 'border-white bg-black text-white'
        } shadow-xl overflow-hidden`}
        style={{ width: `${scale}%`, transform: offsetTransform }}
      >
        <span className="absolute top-0 left-0 w-3 h-3 bg-rose-600 z-10" aria-hidden="true" />
        <img
          src={url}
          alt={alt}
          className={`${compact ? 'max-h-40' : 'max-h-60'} w-full object-cover block`}
          referrerPolicy="no-referrer"
          style={filterStyle}
        />
        {caption && (
          <figcaption className="px-2.5 py-1.5 bg-black/95 border-t border-rose-500/80 text-white text-[14px] font-bold leading-snug">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  if (mode === 'photo-polaroid') {
    return (
      <figure
        className={`mx-auto my-2.5 clear-both p-2 pb-3 border shadow-2xl ${
          isLightTheme
            ? 'bg-zinc-100 border-zinc-400 text-zinc-900'
            : 'bg-zinc-950/95 border-zinc-500 text-zinc-100'
        }`}
        style={{ width: `${scale}%`, transform: offsetTransform }}
      >
        <div className="border border-zinc-700/70 overflow-hidden bg-black flex items-center justify-center">
          <img
            src={url}
            alt={alt}
            className={`${compact ? 'max-h-36' : 'max-h-52'} w-full object-cover`}
            referrerPolicy="no-referrer"
            style={filterStyle}
          />
        </div>
        <div className="mt-2 pt-1.5 border-t border-rose-500/50 flex items-center justify-between gap-2">
          <figcaption className="text-[14px] italic truncate flex-1 text-center">
            {caption || 'Архивный кадр'}
          </figcaption>
        </div>
      </figure>
    );
  }

  if (mode === 'split-vertical') {
    return (
      <figure
        className="w-full clear-both flex flex-col border border-zinc-600/70 bg-black/50 p-1 shadow-md"
        style={{ transform: offsetTransform }}
      >
        <img
          src={url}
          alt={alt}
          className={`${compact ? 'max-h-40' : 'max-h-64'} w-full object-cover`}
          referrerPolicy="no-referrer"
          style={filterStyle}
        />
        {caption && (
          <figcaption className="text-[14px] italic opacity-85 px-1.5 pt-1 leading-tight text-center">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  // Default: full-width
  return (
    <figure
      className="mx-auto mb-2.5 clear-both flex flex-col items-center"
      style={{ width: `${scale}%`, transform: offsetTransform }}
    >
      <div className="w-full checkerboard-bg p-1 border border-zinc-500/50 flex items-center justify-center overflow-hidden shadow-md">
        <img
          src={url}
          alt={alt}
          className={`${maxHClass} w-auto object-contain mx-auto`}
          referrerPolicy="no-referrer"
          style={filterStyle}
        />
      </div>
      {caption && (
        <figcaption className="text-[14px] italic opacity-80 text-center mt-1 leading-tight">
          {caption}
        </figcaption>
      )}
    </figure>
  );
};
