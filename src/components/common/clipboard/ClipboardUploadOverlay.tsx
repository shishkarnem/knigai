import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Image as ImageIcon, Loader2, AlertCircle } from 'lucide-react';
import {
  CloudUploadProgressEvent,
  subscribeClipboardUploadState,
} from '../../../services/storage/clipboardImageUpload';

export const ClipboardUploadOverlay: React.FC = () => {
  const [state, setState] = useState<CloudUploadProgressEvent>({
    active: false,
    percent: 0,
    stage: 'uploading',
    filename: '',
  });

  useEffect(() => {
    return subscribeClipboardUploadState(setState);
  }, []);

  if (!state.active || typeof document === 'undefined') return null;

  const stageLabel =
    state.stage === 'uploading'
      ? 'Загрузка изображения из буфера в облако...'
      : state.stage === 'registering'
      ? 'Регистрация файла в базе данных и получение ссылки...'
      : state.stage === 'done'
      ? 'Ссылка получена и вставлена в текст!'
      : state.errorMessage || 'Не удалось загрузить изображение';

  return createPortal(
    <div
      className="fixed inset-0 z-[100000] pointer-events-none flex items-end sm:items-center justify-center p-4"
      aria-live="polite"
    >
      <div className="pointer-events-auto w-full max-w-md bg-black/95 border-2 border-white shadow-[0_0_32px_rgba(225,29,72,0.35)] p-4 flex flex-col gap-3 rounded-none font-['PT_Serif',serif]">
        <div className="flex items-center gap-3">
          {state.previewUrl ? (
            <img
              src={state.previewUrl}
              alt="Загрузка из буфера"
              className="w-12 h-12 object-cover border border-zinc-700 shrink-0"
            />
          ) : (
            <div className="w-12 h-12 bg-zinc-900 border border-zinc-700 flex items-center justify-center shrink-0">
              <ImageIcon className="w-6 h-6 text-rose-500" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-white font-bold text-[15px]">
              {state.stage === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
              ) : state.stage === 'error' ? (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              ) : (
                <Loader2 className="w-4 h-4 text-rose-500 animate-spin shrink-0" />
              )}
              <span className="truncate">{stageLabel}</span>
            </div>
            <p className="text-[14px] text-zinc-400 font-mono truncate mt-0.5">
              {state.filename || 'clipboard_image.png'} · {state.percent}%
            </p>
          </div>
        </div>

        {/* Animated Noir Crimson Progress Bar */}
        <div className="w-full h-3 bg-zinc-900 border border-zinc-700 overflow-hidden relative">
          <div
            className="h-full bg-rose-600 transition-all duration-200 ease-out relative"
            style={{ width: `${Math.max(4, state.percent)}%` }}
          >
            {state.stage !== 'done' && state.stage !== 'error' && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse" />
            )}
          </div>
        </div>

        {state.uploadedUrl && state.stage === 'done' && (
          <p className="text-[14px] text-zinc-300 font-mono truncate border-t border-zinc-800 pt-2">
            URL: {state.uploadedUrl}
          </p>
        )}
      </div>
    </div>,
    document.body
  );
};
