import React, { useId, useRef, useState } from 'react';
import {
  Sparkles,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Trash2,
  Move,
  Maximize2,
} from 'lucide-react';
import { Book, BookCoverConfig, CoverImageTransform, WorldEntity } from '../../types';
import { NoirButton } from '../common/NoirButton';
import { NoirPromptTextarea } from '../editor/NoirPromptTextarea';
import { ImageFilterControl, getImageFilterStyle } from '../editor/ImageFilterControl';
import { PricingInfoModalButton } from '../billing/PricingInfoModalButton';
import { FileUploadService } from '../../services/upload/FileUploadService';
import { getOrCreateBookFolder } from '../../services/db/fileStorageRepository';
import { estimateImageGenerationLetters, formatLettersCount } from '../../services/billing/costCalculator';

export type CoverArtSlot = 'front' | 'back' | 'fullWrap';

interface CoverArtStudioPanelProps {
  book: Book;
  cover: BookCoverConfig;
  activeSlot: CoverArtSlot;
  onChangeSlot: (slot: CoverArtSlot) => void;
  worldEntities: WorldEntity[];
  userUid?: number;
  frontPrompt: string;
  onChangeFrontPrompt: (val: string) => void;
  backPrompt: string;
  onChangeBackPrompt: (val: string) => void;
  fullWrapPrompt: string;
  onChangeFullWrapPrompt: (val: string) => void;
  frontRefUrl: string;
  onChangeFrontRefUrl: (url: string) => void;
  genLoading: boolean;
  coverQaLoading: boolean;
  onGenerateSlot: (slot: CoverArtSlot) => void;
  onOpenGalleryForSlot: (slot: CoverArtSlot) => void;
  onCheckCoverQa: (url: string) => void;
  onUpdateCover: (updated: Partial<BookCoverConfig>) => void;
}

const DEFAULT_POS: Required<CoverImageTransform> = { posX: 50, posY: 50, zoom: 100 };

export const CoverArtStudioPanel: React.FC<CoverArtStudioPanelProps> = ({
  book,
  cover,
  activeSlot,
  onChangeSlot,
  worldEntities,
  userUid,
  frontPrompt,
  onChangeFrontPrompt,
  backPrompt,
  onChangeBackPrompt,
  fullWrapPrompt,
  onChangeFullWrapPrompt,
  frontRefUrl,
  onChangeFrontRefUrl,
  genLoading,
  coverQaLoading,
  onGenerateSlot,
  onOpenGalleryForSlot,
  onCheckCoverQa,
  onUpdateCover,
}) => {
  const uploadInputId = useId();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [urlDraft, setUrlDraft] = useState('');
  const dragPadRef = useRef<HTMLDivElement>(null);
  const [isDraggingFocal, setIsDraggingFocal] = useState(false);

  const currentUrl =
    activeSlot === 'front'
      ? cover.frontImageUrl
      : activeSlot === 'back'
      ? cover.backImageUrl || ''
      : cover.fullWrapImageUrl || '';

  const currentPos: Required<CoverImageTransform> = {
    ...DEFAULT_POS,
    ...(activeSlot === 'front'
      ? cover.frontImagePos
      : activeSlot === 'back'
      ? cover.backImagePos
      : cover.fullWrapImagePos),
  };

  const currentPrompt =
    activeSlot === 'front'
      ? frontPrompt
      : activeSlot === 'back'
      ? backPrompt
      : fullWrapPrompt;

  const setPromptForSlot = (val: string) => {
    if (activeSlot === 'front') onChangeFrontPrompt(val);
    else if (activeSlot === 'back') onChangeBackPrompt(val);
    else onChangeFullWrapPrompt(val);
  };

  const setUrlForSlot = (url: string) => {
    if (activeSlot === 'front') onUpdateCover({ frontImageUrl: url });
    else if (activeSlot === 'back') onUpdateCover({ backImageUrl: url });
    else onUpdateCover({ fullWrapImageUrl: url });
  };

  const setPosForSlot = (patch: Partial<CoverImageTransform>) => {
    const next: CoverImageTransform = { ...currentPos, ...patch };
    if (activeSlot === 'front') onUpdateCover({ frontImagePos: next });
    else if (activeSlot === 'back') onUpdateCover({ backImagePos: next });
    else onUpdateCover({ fullWrapImagePos: next });
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Файл слишком велик (макс 20 МБ)');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      const uploader = new FileUploadService();
      const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
      const slotLabel =
        activeSlot === 'front'
          ? 'Лицевая обложка'
          : activeSlot === 'back'
          ? 'Задняя обложка'
          : 'Единый разворот переплета';
      const rec = await uploader.uploadFileAndRegister(file, folder.id, true, {
        title: `${slotLabel} — «${book.title}»`,
        description: `Изображение переплета книги «${book.title}»`,
      });
      const resolved = rec.original_url || rec.short_url || '';
      if (resolved) setUrlForSlot(resolved);
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const updateFocalFromPointer = (clientX: number, clientY: number) => {
    const box = dragPadRef.current?.getBoundingClientRect();
    if (!box) return;
    const xPct = Math.round(Math.min(100, Math.max(0, ((clientX - box.left) / box.width) * 100)));
    const yPct = Math.round(Math.min(100, Math.max(0, ((clientY - box.top) / box.height) * 100)));
    setPosForSlot({ posX: xPct, posY: yPct });
  };

  const slots: Array<{ id: CoverArtSlot; title: string; subtitle: string; hasArt: boolean }> = [
    {
      id: 'front',
      title: 'Лицевая сторона (А5)',
      subtitle: 'Вертикаль 3:4',
      hasArt: Boolean(cover.frontImageUrl),
    },
    {
      id: 'back',
      title: 'Задняя сторона (А5)',
      subtitle: 'Вертикаль 3:4',
      hasArt: Boolean(cover.backImageUrl),
    },
    {
      id: 'fullWrap',
      title: 'Весь разворот сразу',
      subtitle: 'Горизонталь 16:9 (Зад + Корешок + Лицо)',
      hasArt: Boolean(cover.fullWrapImageUrl),
    },
  ];

  const slotTitle =
    activeSlot === 'front'
      ? 'Лицевая вертикальная обложка (А5, 3:4)'
      : activeSlot === 'back'
      ? 'Задняя вертикальная сторона переплета (А5, 3:4)'
      : 'Единый горизонтальный разворот всего переплета (16:9)';

  return (
    <div className="noir-container p-4 sm:p-6 border border-zinc-700 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div>
          <h3 className="text-[17px] font-bold text-white">
            Изображения переплета: Лицевая, Задняя сторона и Весь разворот (16:9)
          </h3>
          <p className="text-[14px] text-zinc-400 mt-0.5">
            Выберите сторону книги, сгенерируйте ИИ или загрузите картинку и отрегулируйте её положение и масштаб.
          </p>
        </div>
        <PricingInfoModalButton compact label="Тарифы на арты" />
      </div>

      {/* 3 Slot Tabs (responsive grid, zero horizontal scroll) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {slots.map((s) => {
          const active = activeSlot === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onChangeSlot(s.id)}
              className={`min-h-[54px] px-3 py-2 text-left border transition cursor-pointer flex items-center justify-between gap-2 ${
                active
                  ? 'bg-rose-600 text-white border-rose-500'
                  : 'bg-zinc-950/85 text-zinc-200 border-zinc-700 hover:border-white'
              }`}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-bold leading-tight">{s.title}</div>
                <div className={`text-[14px] leading-tight mt-0.5 ${active ? 'text-rose-100' : 'text-zinc-400'}`}>
                  {s.subtitle}
                </div>
              </div>
              {s.hasArt && (
                <span
                  className={`px-2 py-0.5 text-[14px] font-mono shrink-0 border ${
                    active ? 'bg-black/40 border-white text-white' : 'bg-zinc-900 border-zinc-600 text-rose-400'
                  }`}
                >
                  ✓
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active Slot Prompt & Actions */}
      <div className="p-3.5 bg-zinc-950/75 border border-zinc-800 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[15px] font-bold text-white">{slotTitle}</span>
          {activeSlot === 'fullWrap' && (
            <span className="text-[14px] text-rose-400">
              Панорамная картинка растянется бесшовно на задник, корешок и лицевую сторону
            </span>
          )}
        </div>

        <NoirPromptTextarea
          minRows={2}
          maxRows={8}
          value={currentPrompt}
          onChange={(e) => setPromptForSlot(e.target.value)}
          placeholder={`Промпт для ИИ (${slotTitle})...`}
        />

        {/* Entity References */}
        {worldEntities.some((e) => Boolean(e.image_url?.trim())) && (
          <div className="flex flex-col gap-1.5 p-2.5 bg-black/70 border border-zinc-800">
            <span className="text-[14px] font-bold text-zinc-300">
              Визуальный референс сущности мира:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {worldEntities
                .filter((e) => Boolean(e.image_url?.trim()))
                .map((e) => {
                  const selected = frontRefUrl === e.image_url;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onChangeFrontRefUrl(selected ? '' : e.image_url)}
                      className={`min-h-[38px] px-2.5 text-[14px] border font-bold flex items-center gap-1.5 cursor-pointer transition ${
                        selected
                          ? 'bg-white text-black border-white'
                          : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                      }`}
                    >
                      <img src={e.image_url} alt="" className="w-5 h-5 object-cover shrink-0" referrerPolicy="no-referrer" />
                      <span>{e.name}</span>
                      {selected && <span className="underline">✓</span>}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* Action Buttons Row */}
        <div className="flex flex-wrap items-center gap-2">
          <NoirButton
            variant="primary"
            onClick={() => onGenerateSlot(activeSlot)}
            loading={genLoading}
            icon={<Sparkles className="w-4 h-4 text-black" />}
          >
            {activeSlot === 'fullWrap'
              ? `Сгенерировать разворот 16:9 (≈ ${formatLettersCount(estimateImageGenerationLetters(currentPrompt.length))} букв)`
              : `Сгенерировать арт 3:4 (≈ ${formatLettersCount(estimateImageGenerationLetters(currentPrompt.length))} букв)`}
          </NoirButton>

          <NoirButton
            variant="outline"
            onClick={() => onOpenGalleryForSlot(activeSlot)}
            icon={<ImageIcon className="w-4 h-4" />}
          >
            Выбрать из галереи
          </NoirButton>

          <label
            htmlFor={`cover-slot-upload-${uploadInputId}`}
            className="min-h-[44px] px-4 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 font-bold text-[14px] flex items-center gap-2 cursor-pointer transition"
          >
            <Upload className="w-4 h-4 text-rose-500" />
            <span>{uploading ? 'Загрузка...' : 'Загрузить с устройства'}</span>
          </label>
          <input
            id={`cover-slot-upload-${uploadInputId}`}
            type="file"
            accept="image/*"
            onChange={handleUploadFile}
            className="hidden"
          />
        </div>

        {/* Direct URL input */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="Или вставьте прямую ссылку (URL) на изображение..."
            className="flex-1 min-w-[200px] min-h-[40px] px-3 noir-input text-[14px]"
          />
          <NoirButton
            variant="subtle"
            disabled={!urlDraft.trim()}
            onClick={() => {
              if (urlDraft.trim()) {
                setUrlForSlot(urlDraft.trim());
                setUrlDraft('');
              }
            }}
          >
            Установить URL
          </NoirButton>
        </div>

        {uploadError && (
          <div className="text-[14px] text-rose-400 border border-rose-500 p-2 bg-rose-950/40">
            {uploadError}
          </div>
        )}
      </div>

      {/* Current Image & Interactive Position + Zoom Editor */}
      {currentUrl && (
        <div className="p-3.5 bg-zinc-950/85 border border-zinc-700 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
            <span className="text-[15px] font-bold text-white flex items-center gap-2">
              <Move className="w-4 h-4 text-rose-500" />
              <span>Положение и масштаб картинки на переплете</span>
            </span>

            <div className="flex flex-wrap items-center gap-2">
              <NoirButton
                variant="outline"
                onClick={() => onCheckCoverQa(currentUrl)}
                loading={coverQaLoading}
                icon={<Sparkles className="w-4 h-4 text-rose-500" />}
              >
                Оценка 763
              </NoirButton>
              <button
                type="button"
                onClick={() => setPosForSlot({ posX: 50, posY: 50, zoom: 100 })}
                className="min-h-[38px] px-3 bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 text-[14px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>По центру (100%)</span>
              </button>
              <button
                type="button"
                onClick={() => setUrlForSlot('')}
                className="min-h-[38px] px-3 bg-rose-950/60 border border-rose-600 hover:bg-rose-600 text-white text-[14px] font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Удалить</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            {/* Interactive Focal-Point & Zoom Preview Box */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[14px] text-zinc-400">
                Потяните прямо по кадру или кликните, чтобы сместить фокус изображения:
              </span>
              <div
                ref={dragPadRef}
                onMouseDown={(e) => {
                  setIsDraggingFocal(true);
                  updateFocalFromPointer(e.clientX, e.clientY);
                }}
                onMouseMove={(e) => {
                  if (isDraggingFocal) updateFocalFromPointer(e.clientX, e.clientY);
                }}
                onMouseUp={() => setIsDraggingFocal(false)}
                onMouseLeave={() => setIsDraggingFocal(false)}
                onTouchStart={(e) => {
                  setIsDraggingFocal(true);
                  updateFocalFromPointer(e.touches[0].clientX, e.touches[0].clientY);
                }}
                onTouchMove={(e) => {
                  if (isDraggingFocal) updateFocalFromPointer(e.touches[0].clientX, e.touches[0].clientY);
                }}
                onTouchEnd={() => setIsDraggingFocal(false)}
                className={`mx-auto w-full border-2 border-rose-500/80 overflow-hidden relative cursor-crosshair select-none bg-black ${
                  activeSlot === 'fullWrap'
                    ? 'max-w-[340px] aspect-[16/9]'
                    : 'max-w-[180px] aspect-[148/210]'
                }`}
              >
                <img
                  src={currentUrl}
                  alt="Настройка кадрирования"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none"
                  referrerPolicy="no-referrer"
                  style={{
                    ...getImageFilterStyle(cover.imageFilter, cover.colorTint),
                    objectPosition: `${currentPos.posX}% ${currentPos.posY}%`,
                    transform: `scale(${currentPos.zoom / 100})`,
                    transformOrigin: `${currentPos.posX}% ${currentPos.posY}%`,
                  }}
                />
                {/* Crosshair marker */}
                <div
                  className="w-4 h-4 -ml-2 -mt-2 border-2 border-rose-500 bg-white/80 pointer-events-none absolute"
                  style={{ left: `${currentPos.posX}%`, top: `${currentPos.posY}%` }}
                />
              </div>
            </div>

            {/* Sliders for X, Y, Zoom */}
            <div className="flex flex-col gap-3">
              <div>
                <div className="flex justify-between text-[14px] mb-1">
                  <span className="font-bold text-white">Смещение по горизонтали (X):</span>
                  <span className="font-mono text-rose-400">{currentPos.posX}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={currentPos.posX}
                  onChange={(e) => setPosForSlot({ posX: parseInt(e.target.value, 10) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[14px] mb-1">
                  <span className="font-bold text-white">Смещение по вертикали (Y):</span>
                  <span className="font-mono text-rose-400">{currentPos.posY}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={currentPos.posY}
                  onChange={(e) => setPosForSlot({ posY: parseInt(e.target.value, 10) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-[14px] mb-1">
                  <span className="font-bold text-white flex items-center gap-1.5">
                    <Maximize2 className="w-4 h-4 text-rose-500" />
                    <span>Масштаб (Зум кадра):</span>
                  </span>
                  <span className="font-mono text-rose-400">{currentPos.zoom}%</span>
                </div>
                <input
                  type="range"
                  min={100}
                  max={220}
                  step={5}
                  value={currentPos.zoom}
                  onChange={(e) => setPosForSlot({ zoom: parseInt(e.target.value, 10) })}
                  className="w-full accent-rose-500 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Filter and Tint on Cover Images */}
          <div className="pt-3 border-t border-zinc-800">
            <ImageFilterControl
              filter={cover.imageFilter || 'normal'}
              colorTint={cover.colorTint}
              onChangeFilter={(f) => onUpdateCover({ imageFilter: f })}
              onChangeColorTint={(t) => onUpdateCover({ colorTint: t })}
              isPng={currentUrl.toLowerCase().includes('.png')}
            />
          </div>
        </div>
      )}
    </div>
  );
};
