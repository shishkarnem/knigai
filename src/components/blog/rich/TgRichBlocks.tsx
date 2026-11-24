import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Maximize2,
  X,
} from 'lucide-react';
import {
  TgButtonItem,
  TgCollapseData,
  TgMediaItem,
  sanitizeBlogUrl,
} from './tgBlockParser';

function formatDuration(sec?: number): string {
  if (!sec || !Number.isFinite(sec) || sec <= 0) return '';
  const total = Math.round(sec);
  const mins = Math.floor(total / 60);
  const rem = total % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

export const TgVideoBlock: React.FC<{
  item: TgMediaItem;
  fallbackPostUrl?: string;
}> = ({ item, fallbackPostUrl }) => {
  const safeVideoUrl = !item.tooLarge ? sanitizeBlogUrl(item.url, true) : '';
  const safePosterUrl = item.tooLarge ? sanitizeBlogUrl(item.posterUrl, true) : '';
  const safePostUrl = sanitizeBlogUrl(item.postUrl || fallbackPostUrl, false);
  const durLabel = formatDuration(item.duration);

  if (safeVideoUrl) {
    return (
      <figure className="my-6 flex flex-col gap-2 w-full">
        <div className="relative w-full border border-zinc-800 bg-black rounded-none overflow-hidden">
          <video
            src={safeVideoUrl}
            controls
            playsInline
            preload="auto"
            className="w-full max-h-[540px] object-contain bg-black"
          />
        </div>
        {(item.caption || durLabel) && (
          <figcaption className="text-[14px] text-zinc-400 font-['PT_Serif',serif] italic px-1 border-b border-zinc-800/70 pb-1.5">
            {item.caption || ''}
            {durLabel ? `${item.caption ? ' · ' : ''}${durLabel}` : ''}
          </figcaption>
        )}
      </figure>
    );
  }

  // Fallback card when tooLarge === true or no direct playable stream URL
  return (
    <div className="my-6 border border-rose-500/75 bg-zinc-950/75 p-4 sm:p-5 flex flex-col gap-4 rounded-none">
      {safePosterUrl && (
        <div className="relative w-full aspect-video border border-zinc-800 bg-black overflow-hidden">
          <img
            src={safePosterUrl}
            alt={item.caption || 'Видеопубликация Telegram'}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover opacity-85"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 flex items-end p-3">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 bg-black/80 border border-rose-500 text-[14px] text-white font-mono">
              <Film className="w-4 h-4 text-rose-500" />
              <span>
                Видео {item.sizeMb ? `(${item.sizeMb} МБ)` : ''}
                {durLabel ? ` · ${durLabel}` : ''}
              </span>
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-bold text-white inline-flex items-center gap-2">
            <Film className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Полное видео доступно в Telegram</span>
          </span>
          {item.caption && (
            <p className="text-[14px] text-zinc-300 font-['PT_Serif',serif]">{item.caption}</p>
          )}
        </div>

        {safePostUrl && (
          <a
            href={safePostUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-4 py-2.5 bg-black border border-rose-500 hover:bg-rose-950/80 text-white text-[14px] font-bold inline-flex items-center justify-center gap-2 shrink-0 rounded-none transition-colors"
          >
            <span>Смотреть видео в Telegram</span>
            <ExternalLink className="w-4 h-4 text-rose-400" />
          </a>
        )}
      </div>
    </div>
  );
};

export const TgGalleryBlock: React.FC<{
  items: TgMediaItem[];
  fallbackPostUrl?: string;
}> = ({ items, fallbackPostUrl }) => {
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const photos = items.filter((m) => m.type === 'photo' && sanitizeBlogUrl(m.url, true));
  const videos = items.filter((m) => m.type === 'video');

  if (photos.length === 0 && videos.length === 0) return null;

  const gridCols =
    photos.length === 1
      ? 'grid-cols-1'
      : photos.length === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <div className="my-6 flex flex-col gap-4 w-full">
      {photos.length > 0 && (
        <div className={`grid ${gridCols} gap-3`}>
          {photos.map((photo, idx) => {
            const safeUrl = sanitizeBlogUrl(photo.url, true);
            return (
              <figure
                key={`${safeUrl}-${idx}`}
                className="group relative border border-zinc-800 bg-black/75 overflow-hidden cursor-pointer rounded-none"
                onClick={() => setLightboxIdx(idx)}
              >
                <div className="relative w-full aspect-video overflow-hidden">
                  <img
                    src={safeUrl}
                    alt={photo.caption || `Изображение галереи ${idx + 1}`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                  <span className="absolute top-2 right-2 p-1.5 bg-black/75 border border-white/40 text-white opacity-90 group-hover:border-rose-500 transition-colors">
                    <Maximize2 className="w-3.5 h-3.5" />
                  </span>
                </div>
                {photo.caption && (
                  <figcaption className="p-2.5 text-[14px] text-zinc-300 border-t border-zinc-800 font-['PT_Serif',serif]">
                    {photo.caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      )}

      {videos.map((vid, idx) => (
        <TgVideoBlock key={`gvid-${idx}`} item={vid} fallbackPostUrl={fallbackPostUrl} />
      ))}

      {/* Transparent Noir Gallery Lightbox Modal */}
      {lightboxIdx !== null && photos[lightboxIdx] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[120] bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-6"
          onClick={() => setLightboxIdx(null)}
        >
          <div
            className="noir-modal relative w-full max-w-4xl p-3 sm:p-5 flex flex-col gap-3 rounded-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-zinc-800 pb-2">
              <span className="font-mono text-[14px] text-zinc-300">
                Фото {lightboxIdx + 1} из {photos.length}
              </span>
              <button
                type="button"
                onClick={() => setLightboxIdx(null)}
                className="min-h-[38px] px-3 border border-white/60 hover:border-rose-500 bg-black text-white inline-flex items-center gap-1.5 text-[14px] cursor-pointer rounded-none"
              >
                <X className="w-4 h-4 text-rose-500" />
                <span>Закрыть</span>
              </button>
            </div>

            <div className="relative w-full max-h-[72vh] flex items-center justify-center bg-black/70 border border-zinc-800 overflow-hidden">
              <img
                src={sanitizeBlogUrl(photos[lightboxIdx].url, true)}
                alt={photos[lightboxIdx].caption || 'Просмотр фото'}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>

            {photos.length > 1 && (
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setLightboxIdx((lightboxIdx - 1 + photos.length) % photos.length)}
                  className="min-h-[42px] px-4 border border-zinc-700 hover:border-white bg-black text-white text-[14px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
                >
                  <ChevronLeft className="w-4 h-4 text-rose-500" />
                  <span>Предыдущее</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxIdx((lightboxIdx + 1) % photos.length)}
                  className="min-h-[42px] px-4 border border-zinc-700 hover:border-white bg-black text-white text-[14px] inline-flex items-center gap-1.5 cursor-pointer rounded-none"
                >
                  <span>Следующее</span>
                  <ChevronRight className="w-4 h-4 text-rose-500" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const TgButtonsBlock: React.FC<{ rows: TgButtonItem[][] }> = ({ rows }) => {
  if (!rows || rows.length === 0) return null;

  return (
    <div className="my-6 flex flex-col gap-2.5 w-full">
      {rows.map((row, rIdx) => (
        <div key={rIdx} className="flex flex-wrap items-stretch gap-2.5">
          {row.map((btn, bIdx) => {
            const safeUrl = sanitizeBlogUrl(btn.url, true);
            if (!safeUrl) return null;
            const external = /^https?:\/\//i.test(safeUrl);
            return (
              <a
                key={`${safeUrl}-${bIdx}`}
                href={safeUrl}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
                className={`min-h-[44px] px-4 py-2.5 border text-[14px] font-bold inline-flex items-center justify-center gap-2 transition-colors rounded-none flex-1 sm:flex-initial break-words text-center ${
                  btn.isTelegramFallback
                    ? 'bg-rose-950/70 border-rose-500 text-white hover:bg-rose-900/80'
                    : 'bg-black/75 border-white/60 text-white hover:bg-white hover:text-black'
                }`}
              >
                <span>{btn.text}</span>
                {external && <ExternalLink className="w-4 h-4 shrink-0 text-rose-400" />}
              </a>
            );
          })}
        </div>
      ))}
    </div>
  );
};

export const TgCollapseBlock: React.FC<{
  data: TgCollapseData;
  renderMarkdown: (md: string) => React.ReactNode;
}> = ({ data, renderMarkdown }) => {
  const [expanded, setExpanded] = useState<boolean>(Boolean(data.isOpen));
  const hasSummary = Boolean(data.summary && data.summary.trim().length > 0);

  if (hasSummary) {
    return (
      <div className="my-6 border border-rose-500/70 bg-zinc-950/65 rounded-none overflow-hidden">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left bg-black/50 hover:bg-black/75 border-b border-zinc-800 cursor-pointer transition-colors"
        >
          <span className="text-[15px] sm:text-[16px] font-bold text-white break-words">
            {data.summary}
          </span>
          <ChevronDown
            className={`w-5 h-5 text-rose-500 shrink-0 transition-transform duration-300 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {expanded && (
          <div className="p-4 sm:p-5 flex flex-col gap-3">
            {renderMarkdown(data.markdown)}
            {data.credit && (
              <div className="pt-2 border-t border-zinc-800/70 text-[14px] text-zinc-400 italic">
                — {data.credit}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Collapsed Telegram quote block (no summary provided)
  return (
    <div className="my-6 border-l-4 border-rose-500 border-y border-r border-zinc-800 bg-zinc-950/65 p-4 sm:p-5 flex flex-col gap-3 rounded-none">
      <div className={`relative overflow-hidden transition-all duration-300 ${expanded ? '' : 'max-h-[168px]'}`}>
        {renderMarkdown(data.markdown)}
        {!expanded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/70">
        {data.credit ? (
          <span className="text-[14px] text-zinc-400 italic">— {data.credit}</span>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="min-h-[38px] px-3.5 py-1.5 border border-rose-500/80 bg-black hover:bg-rose-950/70 text-rose-300 hover:text-white text-[14px] font-bold inline-flex items-center gap-1.5 cursor-pointer rounded-none transition-colors"
        >
          <span>{expanded ? 'Свернуть цитату' : 'Развернуть цитату'}</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
    </div>
  );
};
