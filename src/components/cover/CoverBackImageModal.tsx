import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Upload, Link, Check, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Book, WorldEntity } from '../../types';
import { orchestrateCoverImage } from '../../services/ai/orchestrator';
import { FileUploadService } from '../../services/upload/FileUploadService';
import { getOrCreateBookFolder } from '../../services/db/fileStorageRepository';
import { getPromptConfig, renderPrompt } from '../../services/db/promptRepository';
import { estimateImageGenerationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import { NoirPromptTextarea } from '../editor/NoirPromptTextarea';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';
import { GalleryPickerModal } from '../gallery/GalleryPickerModal';

interface CoverBackImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  worldEntities?: WorldEntity[];
  userUid?: number;
  initialImageUrl?: string;
  onImageSelected: (url: string) => void;
}

export const CoverBackImageModal: React.FC<CoverBackImageModalProps> = ({
  isOpen,
  onClose,
  book,
  worldEntities = [],
  userUid,
  initialImageUrl,
  onImageSelected,
}) => {
  const [activeTab, setActiveTab] = useState<'generate' | 'upload' | 'url'>('generate');
  const [customPrompt, setCustomPrompt] = useState(
    `Vertical back cover art for "${book.title}". Genre: ${book.genres.join(', ')}. Atmospheric, mysterious background, high contrast black and white inks with dramatic noir lighting, subtle red accents.`
  );
  const [backRefUrl, setBackRefUrl] = useState('');
  const [urlInput, setUrlInput] = useState(initialImageUrl || '');
  const [previewUrl, setPreviewUrl] = useState(initialImageUrl || '');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const entitiesSummary = worldEntities
      .slice(0, 6)
      .map((e) => `${e.name}${e.subtitle_or_role ? ` (${e.subtitle_or_role})` : ''}: ${(e.description || '').slice(0, 80)}`)
      .join('; ');
    const firstRef = worldEntities.find((e) => Boolean(e.image_url?.trim()))?.image_url || '';
    setBackRefUrl((prev) => prev || firstRef);

    getPromptConfig('back_cover_art')
      .then((cfg) => {
        if (cfg.template) {
          setCustomPrompt(
            renderPrompt(cfg.template, {
              title: book.title,
              genres: (book.genres || []).join(', '),
              synopsis_overview: book.synopsis_overview?.slice(0, 220) || 'dramatic noir atmosphere',
              entities_summary: entitiesSummary || 'dark noir aesthetic',
            })
          );
        }
      })
      .catch(() => {});
  }, [isOpen, book.id, worldEntities]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      await runWithGenerationOverlay(
        {
          title: 'Генерация задней обложки А5',
          subtitle: `Книга: «${book.title}»`,
          initialStatus: 'Художник-ИИ создает композицию задней стороны переплета...',
          totalSteps: 1,
          estimatedLetters: estimateImageGenerationLetters(customPrompt.length),
        },
        async (ctx) => {
          const res = await orchestrateCoverImage({
            book,
            scenePrompt: customPrompt,
            referenceUrl: backRefUrl,
            isBackCover: true,
            worldEntities,
            userUid,
          });
          setPreviewUrl(res.url);
          ctx.addApplied('Иллюстрация задней стороны переплета сохранена в галерею');
          ctx.setProgress(1, 1);
          return res;
        }
      );
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка генерации изображения');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        setErrorMsg('Файл слишком велик (макс 20 МБ)');
        return;
      }
      setIsLoading(true);
      try {
        const uploader = new FileUploadService();
        const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
        const fileRecord = await uploader.uploadFileAndRegister(file, folder.id, true, {
          title: `Задняя обложка — «${book.title}»`,
          description: `Изображение переплета книги «${book.title}»`,
        });
        const resolved = fileRecord.original_url || fileRecord.short_url || '';
        setPreviewUrl(resolved);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки файла в хранилище');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleApply = () => {
    if (previewUrl) {
      onImageSelected(previewUrl);
      onClose();
    }
  };

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[500] flex items-center justify-center p-2.5 sm:p-4 bg-black/55 backdrop-blur-md overflow-y-auto select-none"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-xl my-auto noir-modal border-2 border-white shadow-2xl flex flex-col text-white max-h-[90dvh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between p-3.5 border-b border-zinc-800 bg-black/50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-rose-500" />
            <h3 className="text-[16px] sm:text-[17px] font-bold text-white">
              Изображение для задней стороны переплета (А5)
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-zinc-400 hover:text-white border border-transparent hover:border-zinc-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-3 border-b border-zinc-800 bg-zinc-900/80 text-[14px]">
          <button
            type="button"
            onClick={() => setActiveTab('generate')}
            className={`py-2.5 px-2 font-bold text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'generate'
                ? 'border-rose-500 text-white bg-black/50'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-rose-500" />
            <span>ИИ-генерация</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-2.5 px-2 font-bold text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'upload'
                ? 'border-rose-500 text-white bg-black/50'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Upload className="w-3.5 h-3.5 text-zinc-300" />
            <span>Загрузка файла</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`py-2.5 px-2 font-bold text-center border-b-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'url'
                ? 'border-rose-500 text-white bg-black/50'
                : 'border-transparent text-zinc-400 hover:text-white'
            }`}
          >
            <Link className="w-3.5 h-3.5 text-zinc-300" />
            <span>По ссылке</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex flex-col gap-4">
          {errorMsg && (
            <div className="p-3 bg-rose-950/40 border border-rose-500/80 text-rose-300 text-[14px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {activeTab === 'generate' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[14px] font-bold text-zinc-300 mb-1">
                  Промпт для ИИ-художника (задняя сторона):
                </label>
                <NoirPromptTextarea
                  minRows={2}
                  maxRows={10}
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="Опишите сцену задней обложки..."
                />
              </div>

              {worldEntities.some((e) => Boolean(e.image_url?.trim())) && (
                <div className="flex flex-col gap-1.5 p-2 bg-black border border-zinc-800">
                  <span className="text-[14px] font-bold text-zinc-300">
                    Референс сущности мира:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {worldEntities
                      .filter((e) => Boolean(e.image_url?.trim()))
                      .map((e) => {
                        const selected = backRefUrl === e.image_url;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => setBackRefUrl(selected ? '' : e.image_url)}
                            className={`min-h-[36px] px-2 text-[14px] border font-bold flex items-center gap-1.5 cursor-pointer ${
                              selected
                                ? 'bg-white text-black border-white'
                                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                            }`}
                          >
                            <img src={e.image_url} alt="" className="w-4 h-4 object-cover shrink-0" referrerPolicy="no-referrer" />
                            <span>{e.name}</span>
                            {selected && <span className="underline">✓</span>}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isLoading}
                className="min-h-[42px] px-4 bg-rose-600 hover:bg-rose-500 text-white font-bold transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-[14px]"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {isLoading
                    ? 'Генерация изображения...'
                    : `Сгенерировать иллюстрацию (≈ ${formatLettersCount(estimateImageGenerationLetters(customPrompt.length))} букв)`}
                </span>
              </button>
            </div>
          )}

          {activeTab === 'upload' && (
            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-zinc-700 hover:border-zinc-500 bg-black/40 text-center gap-3">
              <Upload className="w-8 h-8 text-rose-500" />
              <div>
                <p className="text-[14px] font-bold text-white mb-0.5">Выберите файл с устройства</p>
                <p className="text-[14px] text-zinc-400">PNG, JPG или WEBP до 15 МБ</p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <label className="min-h-[38px] px-4 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-bold transition flex items-center gap-2 cursor-pointer text-[14px]">
                  <span>Выбрать изображение</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setIsGalleryOpen(true)}
                  className="min-h-[38px] px-4 bg-zinc-900 border border-zinc-700 hover:border-rose-500 text-white font-bold transition flex items-center gap-2 cursor-pointer text-[14px]"
                >
                  <ImageIcon className="w-4 h-4 text-rose-500" />
                  <span>Из медиа-галереи</span>
                </button>
              </div>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="flex flex-col gap-2">
              <label className="block text-[14px] font-bold text-zinc-300">
                Прямая ссылка на изображение (URL):
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setPreviewUrl(e.target.value);
                  }}
                  placeholder="https://example.com/cover-back.jpg"
                  className="flex-1 min-h-[40px] px-3 bg-black border border-zinc-700 text-white text-[14px]"
                />
                <button
                  type="button"
                  onClick={() => setPreviewUrl(urlInput)}
                  className="min-h-[40px] px-3 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-bold text-[14px] cursor-pointer"
                >
                  Предпросмотр
                </button>
              </div>
            </div>
          )}

          {/* Preview Box */}
          {previewUrl && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-800">
              <span className="text-[14px] font-bold text-zinc-400">Предпросмотр задника:</span>
              <div className="w-40 aspect-[148/210] border-2 border-zinc-600 overflow-hidden mx-auto bg-black shadow-lg">
                <img
                  src={previewUrl}
                  alt="Предпросмотр"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={() => setErrorMsg('Не удалось загрузить изображение по указанному адресу')}
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 border-t border-zinc-800 bg-black flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] px-4 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-300 font-bold transition text-[14px] cursor-pointer"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!previewUrl}
            className="min-h-[38px] px-5 bg-white text-black hover:bg-zinc-200 font-bold transition flex items-center gap-1.5 text-[14px] cursor-pointer disabled:opacity-40"
          >
            <Check className="w-4 h-4 text-black" />
            <span>Применить к задней обложке</span>
          </button>
        </div>
        {isGalleryOpen && (
          <GalleryPickerModal
            isOpen={isGalleryOpen}
            onClose={() => setIsGalleryOpen(false)}
            onSelectUrl={(url) => {
              setPreviewUrl(url);
              setIsGalleryOpen(false);
            }}
            selectedUrl={previewUrl}
            title="Выбор изображения для задней стороны переплета"
          />
        )}
      </div>
    </div>,
    document.body
  );
};
