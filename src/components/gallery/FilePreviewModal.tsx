import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Copy, ExternalLink, HardDrive, FileText, Calendar, Check } from 'lucide-react';
import { FileRecord } from '../../types';
import { ImageFilterControl, getImageFilterStyle } from '../editor/ImageFilterControl';
import { NoirAudioPlayer } from '../voice/NoirAudioPlayer';

interface FilePreviewModalProps {
  file: FileRecord | null;
  onClose: () => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ file, onClose }) => {
  const [filter, setFilter] = useState<'normal' | 'grayscale' | 'contrast' | 'sepia' | 'invert'>('normal');
  const [colorTint, setColorTint] = useState<string | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, onClose]);

  if (!file || typeof document === 'undefined') return null;

  const shortUrl = `${window.location.origin}/file/${file.id}`;
  const isImage = file.mime_type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file.name);
  const isAudio =
    file.mime_type?.startsWith('audio/') ||
    (/\.(mp3|wav|ogg|m4a)$/i.test(file.name) && !file.mime_type?.startsWith('video/'));
  const isVideo = !isAudio && (file.mime_type?.startsWith('video/') || /\.(mp4|webm)$/i.test(file.name));
  const isPng = file.mime_type?.includes('png') || file.name.toLowerCase().endsWith('.png');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 Б';
    if (bytes < 1024) return `${bytes} Б`;
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[500] flex justify-center items-center p-2.5 sm:p-5 bg-black/55 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative w-full max-w-3xl my-auto max-h-[90dvh] flex flex-col noir-modal shadow-2xl overflow-hidden rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky Header with Title and Close Button */}
        <div className="p-4 sm:p-5 border-b border-zinc-800 flex items-center justify-between gap-3 bg-zinc-950 shrink-0">
          <h3 className="text-[17px] sm:text-[18px] font-bold text-white truncate">{file.name}</h3>
          <button
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] p-2 text-zinc-400 hover:text-black hover:bg-white border border-zinc-700 transition cursor-pointer shrink-0 flex items-center justify-center"
            title="Закрыть"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body: Single Big Preview + Filters + Metadata */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col gap-5">
          {/* 1. Single Upper Big Preview Area */}
          <div className="relative w-full h-56 sm:h-72 md:h-80 overflow-hidden flex items-center justify-center border-2 border-zinc-700 bg-zinc-900 shrink-0">
            {isImage ? (
              /* Checkerboard grid for PNG transparency verification */
              <div className="w-full h-full flex items-center justify-center p-4 checkerboard-bg">
                <img
                  src={file.original_url}
                  alt={file.name}
                  style={getImageFilterStyle(filter, colorTint)}
                  className="max-h-full max-w-full object-contain shadow-2xl transition-all"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : isVideo ? (
              <video src={file.original_url} controls className="max-h-full max-w-full" />
            ) : isAudio ? (
              <div className="w-full max-w-xl px-4">
                <NoirAudioPlayer audioUrl={file.original_url} label={file.name} />
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 text-zinc-400">
                <FileText className="w-16 h-16 text-zinc-500" />
                <span className="text-[14px]">Предпросмотр формата недоступен</span>
              </div>
            )}
          </div>

          {/* 2. Filter Controls for Images (WITHOUT duplicate second preview window) */}
          {isImage && (
            <div className="border border-zinc-800 p-4 bg-black/40">
              <ImageFilterControl
                filter={filter}
                colorTint={colorTint}
                onChangeFilter={setFilter}
                onChangeColorTint={setColorTint}
                isPng={isPng}
              />
            </div>
          )}

          {/* 3. Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[14px] text-zinc-300">
            <div className="flex items-center gap-2.5 bg-zinc-900 p-3 border border-zinc-800">
              <HardDrive className="w-4 h-4 text-white shrink-0" />
              <div>
                <div className="text-zinc-500 text-[14px]">Размер:</div>
                <div className="font-semibold text-white">{formatBytes(file.file_size)}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-zinc-900 p-3 border border-zinc-800">
              <FileText className="w-4 h-4 text-white shrink-0" />
              <div>
                <div className="text-zinc-500 text-[14px]">MIME-тип:</div>
                <div className="font-semibold text-white truncate">{file.mime_type || 'image/jpeg'}</div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 bg-zinc-900 p-3 border border-zinc-800">
              <Calendar className="w-4 h-4 text-white shrink-0" />
              <div>
                <div className="text-zinc-500 text-[14px]">Дата загрузки:</div>
                <div className="font-semibold text-white">{new Date(file.created_at).toLocaleDateString()}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Footer: Links and Action Buttons */}
        <div className="p-4 sm:p-5 border-t border-zinc-800 bg-zinc-950 flex flex-col sm:flex-row gap-3 shrink-0">
          <div className="flex-1 flex items-center bg-zinc-900 border border-zinc-700 px-3 py-2">
            <input
              readOnly
              value={shortUrl}
              className="bg-transparent text-[14px] font-mono text-zinc-200 w-full focus:outline-hidden"
            />
            <button
              onClick={() => copyToClipboard(shortUrl)}
              className="ml-2 p-1.5 hover:bg-white hover:text-black text-zinc-300 border border-zinc-600 transition cursor-pointer flex items-center gap-1 shrink-0"
              title="Копировать короткую ссылку"
            >
              {copied ? <Check className="w-4 h-4 text-rose-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <a
            href={file.original_url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white text-black text-[14px] font-bold hover:bg-zinc-200 transition shrink-0"
          >
            <span>Открыть оригинал</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};
