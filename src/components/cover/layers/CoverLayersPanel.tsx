import React, { useId, useState } from 'react';
import {
  Layers,
  Upload,
  Image as ImageIcon,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ArrowUp,
  ArrowDown,
  Copy,
  Trash2,
  FlipHorizontal2,
  RotateCcw,
  Plus,
} from 'lucide-react';
import { BookCoverConfig, CoverImageLayer, CoverTextLayout } from '../../../types';
import { FileUploadService } from '../../../services/upload/FileUploadService';
import { getOrCreateBookFolder } from '../../../services/db/fileStorageRepository';
import { GalleryPickerModal } from '../../gallery/GalleryPickerModal';
import { NoirButton } from '../../common/NoirButton';

interface CoverLayersPanelProps {
  bookId: number;
  bookTitle: string;
  userUid?: number;
  cover: BookCoverConfig;
  layout: CoverTextLayout;
  activeLayerId: string | null;
  onSelectLayer: (id: string | null) => void;
  onSelectTextSection: (
    section:
      | 'title'
      | 'author'
      | 'subtitle'
      | 'genre'
      | 'back-genre'
      | 'spine'
      | 'spine-title'
      | 'spine-author'
      | 'blurb'
      | 'color'
  ) => void;
  onUpdateCover: (updated: Partial<BookCoverConfig>) => void;
  onUpdateLayout: (key: keyof CoverTextLayout, value: any) => void;
}

const LAYER_FILTERS: Array<{ id: NonNullable<CoverImageLayer['filter']>; label: string }> = [
  { id: 'normal', label: 'Оригинал' },
  { id: 'grayscale', label: 'Ч/Б' },
  { id: 'contrast', label: 'Контраст' },
  { id: 'sepia', label: 'Сепия' },
  { id: 'invert', label: 'Негатив' },
];

const LAYER_BLENDS: Array<{ id: NonNullable<CoverImageLayer['blendMode']>; label: string }> = [
  { id: 'normal', label: 'Обычный' },
  { id: 'multiply', label: 'Умножение' },
  { id: 'screen', label: 'Экран' },
  { id: 'overlay', label: 'Перекрытие' },
];

export const CoverLayersPanel: React.FC<CoverLayersPanelProps> = ({
  bookId,
  bookTitle,
  userUid,
  cover,
  layout,
  activeLayerId,
  onSelectLayer,
  onSelectTextSection,
  onUpdateCover,
  onUpdateLayout,
}) => {
  const fileInputId = useId();
  const [panelTab, setPanelTab] = useState<'images' | 'text'>('images');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');

  const layers: CoverImageLayer[] = cover.layers || [];
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  const activeLayer = layers.find((l) => l.id === activeLayerId) || null;

  const createLayerFromUrl = (url: string, rawName?: string) => {
    const cleanUrl = url.trim();
    if (!cleanUrl) return;
    const maxZ = layers.reduce((acc, l) => Math.max(acc, l.zIndex), 22);
    const nextLayer: CoverImageLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: rawName || `PNG-слой #${layers.length + 1}`,
      url: cleanUrl,
      x: 110,
      y: 0,
      widthPx: 180,
      scale: 100,
      rotation: 0,
      opacity: 100,
      zIndex: maxZ + 1,
      visible: true,
      locked: false,
      flipX: false,
      blendMode: 'normal',
      filter: 'normal',
    };
    onUpdateCover({ layers: [...layers, nextLayer] });
    onSelectLayer(nextLayer.id);
    setPanelTab('images');
  };

  const handleUploadPng = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const uploader = new FileUploadService();
      const folder = await getOrCreateBookFolder(bookId, bookTitle, userUid);
      const uploaded = await uploader.uploadFileAndRegister(file, folder.id, true);
      const finalUrl = uploaded.original_url || uploaded.short_url || '';
      if (finalUrl) {
        createLayerFromUrl(finalUrl, file.name.replace(/\.[^.]+$/, '').slice(0, 28));
      }
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Ошибка загрузки PNG-слоя');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const updateLayer = (id: string, patch: Partial<CoverImageLayer>) => {
    onUpdateCover({
      layers: layers.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });
  };

  const duplicateLayer = (layer: CoverImageLayer) => {
    const maxZ = layers.reduce((acc, l) => Math.max(acc, l.zIndex), 22);
    const copy: CoverImageLayer = {
      ...layer,
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `${layer.name} (копия)`,
      x: layer.x + 20,
      y: layer.y + 20,
      zIndex: maxZ + 1,
    };
    onUpdateCover({ layers: [...layers, copy] });
    onSelectLayer(copy.id);
  };

  const deleteLayer = (id: string) => {
    onUpdateCover({ layers: layers.filter((l) => l.id !== id) });
    if (activeLayerId === id) onSelectLayer(null);
  };

  const moveOrder = (id: string, dir: 'up' | 'down') => {
    const target = layers.find((l) => l.id === id);
    if (!target) return;
    const nextZ = dir === 'up' ? target.zIndex + 2 : Math.max(1, target.zIndex - 2);
    updateLayer(id, { zIndex: nextZ });
  };

  const textLayerRows: Array<{
    id:
      | 'title'
      | 'subtitle'
      | 'author'
      | 'genre'
      | 'back-genre'
      | 'blurb'
      | 'spine-title'
      | 'spine-author';
    label: string;
    hiddenKey: keyof CoverTextLayout;
    preview: string;
  }> = [
    { id: 'genre', label: 'Жанр / Категория (Лицо)', hiddenKey: 'genreHidden', preview: cover.genreLabel || 'Не задано' },
    { id: 'author', label: 'Имя автора (Лицо)', hiddenKey: 'authorHidden', preview: cover.authorName || 'Автор' },
    { id: 'title', label: 'Название книги (Лицо)', hiddenKey: 'titleHidden', preview: cover.frontTitle || bookTitle },
    { id: 'subtitle', label: 'Подзаголовок (Лицо)', hiddenKey: 'subtitleHidden', preview: cover.frontSubtitle || '(пусто)' },
    { id: 'spine-title', label: 'Название на корешке', hiddenKey: 'spineTitleHidden', preview: cover.frontTitle || bookTitle },
    { id: 'spine-author', label: 'Автор на корешке', hiddenKey: 'spineAuthorHidden', preview: cover.authorName || 'Автор' },
    { id: 'back-genre', label: 'Жанр / Категория (Задник)', hiddenKey: 'backGenreHidden', preview: cover.genreLabel || 'Не задано' },
    { id: 'blurb', label: 'Аннотация (Задник)', hiddenKey: 'blurbHidden', preview: (cover.backBlurb || '').slice(0, 48) },
  ];

  return (
    <div className="noir-container p-4 sm:p-6 border border-zinc-700 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <div>
          <h3 className="text-[17px] font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-rose-500" />
            <span>Мини-Фотошоп: Слои переплета и PNG с прозрачностью</span>
          </h3>
          <p className="text-[14px] text-zinc-400 mt-0.5">
            Добавляйте PNG без фона, стикеры, печати или декор поверх/под текстом. Перемещайте, вращайте и меняйте масштаб слоев.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setPanelTab('images')}
            className={`min-h-[38px] px-3 border text-[14px] font-bold cursor-pointer transition ${
              panelTab === 'images'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            Слои PNG ({layers.length})
          </button>
          <button
            type="button"
            onClick={() => setPanelTab('text')}
            className={`min-h-[38px] px-3 border text-[14px] font-bold cursor-pointer transition ${
              panelTab === 'text'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            Текстовые поля (8)
          </button>
        </div>
      </div>

      {panelTab === 'images' ? (
        <div className="flex flex-col gap-4">
          {/* Upload / Insert PNG Bar */}
          <div className="flex flex-wrap items-center gap-2 p-3 bg-zinc-950 border border-zinc-800">
            <input
              id={fileInputId}
              type="file"
              accept="image/png,image/webp,image/jpeg,image/gif"
              onChange={handleUploadPng}
              className="hidden"
            />
            <NoirButton
              variant="primary"
              loading={uploading}
              onClick={() => document.getElementById(fileInputId)?.click()}
              icon={<Upload className="w-4 h-4 text-black" />}
            >
              Загрузить PNG (с прозрачностью)
            </NoirButton>

            <NoirButton
              variant="outline"
              onClick={() => setGalleryOpen(true)}
              icon={<ImageIcon className="w-4 h-4 text-rose-500" />}
            >
              Взять слой из галереи
            </NoirButton>

            <div className="flex items-center gap-1.5 flex-1 min-w-[220px]">
              <input
                type="url"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                placeholder="Или вставьте URL PNG-картинки..."
                className="flex-1 min-h-[40px] px-3 noir-input text-[14px]"
              />
              <button
                type="button"
                onClick={() => {
                  createLayerFromUrl(urlDraft);
                  setUrlDraft('');
                }}
                disabled={!urlDraft.trim()}
                className="min-h-[40px] px-3 bg-zinc-900 border border-zinc-700 hover:border-white text-white text-[14px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-4 h-4 text-rose-500" />
                <span>Добавить</span>
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="p-2.5 bg-rose-950/50 border border-rose-500 text-rose-200 text-[14px]">
              {uploadError}
            </div>
          )}

          {/* Layer Stack + Active Layer Inspector */}
          {layers.length === 0 ? (
            <div className="p-6 bg-zinc-950/60 border border-dashed border-zinc-800 text-center text-[14px] text-zinc-400">
              Слоев пока нет. Загрузите PNG-картинку с прозрачным фоном (например, логотип, эмблему, мазок кисти или орнамент) или выберите арт из галереи.
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Layer List */}
              <div className="lg:col-span-5 flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-1">
                {sortedLayers.map((layer) => {
                  const isSel = layer.id === activeLayerId;
                  const isAboveText = layer.zIndex >= 20;
                  return (
                    <div
                      key={layer.id}
                      onClick={() => onSelectLayer(layer.id)}
                      className={`p-2.5 border flex items-center gap-2.5 cursor-pointer transition ${
                        isSel
                          ? 'bg-rose-950/35 border-rose-500'
                          : 'bg-zinc-950 border-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      {/* Checkerboard transparency thumbnail */}
                      <div
                        className="w-12 h-12 shrink-0 border border-zinc-700 overflow-hidden flex items-center justify-center"
                        style={{
                          backgroundImage:
                            'linear-gradient(45deg, #27272a 25%, transparent 25%), linear-gradient(-45deg, #27272a 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #27272a 75%), linear-gradient(-45deg, transparent 75%, #27272a 75%)',
                          backgroundSize: '12px 12px',
                          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0',
                        }}
                      >
                        <img
                          src={layer.url}
                          alt={layer.name}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-[14px] font-bold text-white truncate">{layer.name}</div>
                        <div className="text-[14px] text-zinc-400 font-mono">
                          Z:{layer.zIndex} • {isAboveText ? 'Над текстом' : 'На фоне'} • {layer.scale}% • {layer.rotation}°
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
                          className="p-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white cursor-pointer"
                          title={layer.visible ? 'Скрыть слой' : 'Показать слой'}
                        >
                          {layer.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4 text-rose-400" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOrder(layer.id, 'up')}
                          className="p-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white cursor-pointer"
                          title="Выше по слоям"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveOrder(layer.id, 'down')}
                          className="p-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white cursor-pointer"
                          title="Ниже по слоям"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Active Layer Controls */}
              <div className="lg:col-span-7 p-4 bg-zinc-950 border border-zinc-800 flex flex-col gap-3">
                {activeLayer ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
                      <input
                        type="text"
                        value={activeLayer.name}
                        onChange={(e) => updateLayer(activeLayer.id, { name: e.target.value })}
                        className="flex-1 min-w-[160px] h-9 px-2.5 noir-input text-[14px] font-bold"
                        placeholder="Название слоя"
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            updateLayer(activeLayer.id, {
                              zIndex: activeLayer.zIndex >= 20 ? 15 : 26,
                            })
                          }
                          className={`px-2.5 py-1.5 border text-[14px] font-bold cursor-pointer ${
                            activeLayer.zIndex >= 20
                              ? 'bg-rose-600 text-white border-rose-500'
                              : 'bg-zinc-900 text-zinc-200 border-zinc-700'
                          }`}
                        >
                          {activeLayer.zIndex >= 20 ? 'Слой: Поверх текста' : 'Слой: Под текстом'}
                        </button>
                        <button
                          type="button"
                          onClick={() => updateLayer(activeLayer.id, { flipX: !activeLayer.flipX })}
                          className={`p-1.5 border cursor-pointer ${
                            activeLayer.flipX
                              ? 'bg-white text-black border-white'
                              : 'bg-zinc-900 text-zinc-200 border-zinc-700'
                          }`}
                          title="Отразить по горизонтали"
                        >
                          <FlipHorizontal2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateLayer(activeLayer.id, { locked: !activeLayer.locked })}
                          className={`p-1.5 border cursor-pointer ${
                            activeLayer.locked
                              ? 'bg-rose-600 text-white border-rose-500'
                              : 'bg-zinc-900 text-zinc-200 border-zinc-700'
                          }`}
                          title={activeLayer.locked ? 'Разблокировать' : 'Заблокировать'}
                        >
                          {activeLayer.locked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicateLayer(activeLayer)}
                          className="p-1.5 bg-zinc-900 border border-zinc-700 text-zinc-200 hover:text-white cursor-pointer"
                          title="Дублировать слой"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLayer(activeLayer.id)}
                          className="p-1.5 bg-zinc-900 border border-zinc-700 text-rose-400 hover:bg-rose-600 hover:text-white cursor-pointer"
                          title="Удалить слой"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-bold">Позиция X:</span>
                          <span className="font-mono text-rose-400">{activeLayer.x} px</span>
                        </div>
                        <input
                          type="range"
                          min={-420}
                          max={420}
                          value={activeLayer.x}
                          onChange={(e) => updateLayer(activeLayer.id, { x: Number(e.target.value) })}
                          className="w-full accent-rose-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-bold">Позиция Y:</span>
                          <span className="font-mono text-rose-400">{activeLayer.y} px</span>
                        </div>
                        <input
                          type="range"
                          min={-320}
                          max={320}
                          value={activeLayer.y}
                          onChange={(e) => updateLayer(activeLayer.id, { y: Number(e.target.value) })}
                          className="w-full accent-rose-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-bold">Масштаб (Увеличение):</span>
                          <span className="font-mono text-rose-400">{activeLayer.scale}%</span>
                        </div>
                        <input
                          type="range"
                          min={10}
                          max={300}
                          value={activeLayer.scale}
                          onChange={(e) => updateLayer(activeLayer.id, { scale: Number(e.target.value) })}
                          className="w-full accent-rose-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-bold">Поворот:</span>
                          <span className="font-mono text-rose-400">{activeLayer.rotation}°</span>
                        </div>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          value={activeLayer.rotation}
                          onChange={(e) => updateLayer(activeLayer.id, { rotation: Number(e.target.value) })}
                          className="w-full accent-rose-600 cursor-pointer"
                        />
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <span className="font-bold">Прозрачность:</span>
                          <span className="font-mono text-rose-400">{activeLayer.opacity}%</span>
                        </div>
                        <input
                          type="range"
                          min={5}
                          max={100}
                          value={activeLayer.opacity}
                          onChange={(e) => updateLayer(activeLayer.id, { opacity: Number(e.target.value) })}
                          className="w-full accent-rose-600 cursor-pointer"
                        />
                      </div>

                      <div className="flex items-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => updateLayer(activeLayer.id, { x: 0, y: 0, rotation: 0, scale: 100 })}
                          className="w-full min-h-[38px] px-3 bg-zinc-900 border border-zinc-700 hover:border-white text-white font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4 text-rose-500" />
                          <span>Сброс трансформации</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <label className="block text-[14px] text-zinc-400 mb-1">Режим наложения:</label>
                        <select
                          value={activeLayer.blendMode || 'normal'}
                          onChange={(e) =>
                            updateLayer(activeLayer.id, {
                              blendMode: e.target.value as CoverImageLayer['blendMode'],
                            })
                          }
                          className="w-full min-h-[38px] px-2.5 noir-input text-[14px]"
                        >
                          {LAYER_BLENDS.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[14px] text-zinc-400 mb-1">Цветовой фильтр:</label>
                        <select
                          value={activeLayer.filter || 'normal'}
                          onChange={(e) =>
                            updateLayer(activeLayer.id, {
                              filter: e.target.value as CoverImageLayer['filter'],
                            })
                          }
                          className="w-full min-h-[38px] px-2.5 noir-input text-[14px]"
                        >
                          {LAYER_FILTERS.map((f) => (
                            <option key={f.id} value={f.id}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-6 text-center text-[14px] text-zinc-400">
                    Выберите слой из списка слева или кликните по картинке на развертке, чтобы настроить её позицию, вращение, масштаб и прозрачность.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Text Layers Visibility & Quick Select Matrix */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {textLayerRows.map((row) => {
            const isHidden = Boolean(layout[row.hiddenKey]);
            return (
              <div
                key={row.id}
                onClick={() => onSelectTextSection(row.id)}
                className="p-3 bg-zinc-950 border border-zinc-800 hover:border-white flex items-center justify-between gap-3 cursor-pointer transition"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-bold text-white truncate">{row.label}</div>
                  <div className="text-[14px] text-zinc-400 truncate">{row.preview}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUpdateLayout(row.hiddenKey, !isHidden);
                  }}
                  className={`min-h-[36px] px-2.5 border text-[14px] font-bold flex items-center gap-1.5 cursor-pointer shrink-0 ${
                    isHidden
                      ? 'bg-rose-950/60 border-rose-500 text-rose-300'
                      : 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:text-white'
                  }`}
                >
                  {isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-rose-500" />}
                  <span>{isHidden ? 'Скрыто' : 'Видно'}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {galleryOpen && (
        <GalleryPickerModal
          isOpen={galleryOpen}
          onClose={() => setGalleryOpen(false)}
          onSelectUrl={(url) => {
            createLayerFromUrl(url);
            setGalleryOpen(false);
          }}
          title="Выбрать изображение для PNG-слоя переплета"
        />
      )}
    </div>
  );
};
