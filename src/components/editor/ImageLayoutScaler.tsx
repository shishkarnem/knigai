import React, { useRef, useState } from 'react';
import { Maximize2, Upload } from 'lucide-react';
import { ImageLayoutConfig } from '../../types';
import { getUploadService } from '../../services/upload/FileUploadService';
import { ImagePlacementVisualEditor } from './ImagePlacementVisualEditor';

export interface ImageLayoutScalerProps {
  layout: ImageLayoutConfig;
  onChangeLayout: (layout: ImageLayoutConfig) => void;
  imageUrl?: string;
  onImageChanged?: (newUrl: string) => void;
  sampleText?: string;
  showPageAnchorControls?: boolean;
}

export const ImageLayoutScaler: React.FC<ImageLayoutScalerProps> = ({
  layout,
  onChangeLayout,
  imageUrl,
  onImageChanged,
  sampleText = 'В ночном небе парящего архипелага медленно угасал Сердечный Кристалл. Следователь Кайрен Норт стоял на смотровой площадке тринадцатого яруса, наблюдая за движением теней...',
  showPageAnchorControls = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setUploading(true);
    setUploadError(null);

    try {
      const uploadService = getUploadService();
      const record = await uploadService.uploadFileAndRegister(file, null, true);
      if (onImageChanged) {
        onImageChanged(record.original_url);
      }
    } catch (err: unknown) {
      setUploadError(
        'Ошибка загрузки изображения: ' + (err instanceof Error ? err.message : 'неизвестная ошибка')
      );
    } finally {
      setUploading(false);
    }
  };

  const handleScaleChange = (scale: number) => {
    onChangeLayout({ ...layout, scale });
  };

  return (
    <div className="w-full flex flex-col gap-4 text-white">
      {uploadError && (
        <div className="p-3 bg-rose-950/60 border border-rose-500 text-rose-300 text-[14px] flex items-center justify-between gap-2">
          <span>{uploadError}</span>
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="px-2 py-1 border border-rose-500 text-[14px] cursor-pointer"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* Drag & Drop Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileUpload(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`w-full p-4 border-2 border-dashed cursor-pointer text-center transition-all ${
          isDragging
            ? 'border-white bg-zinc-900'
            : 'border-zinc-700 hover:border-zinc-400 bg-zinc-950/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Upload className="w-5 h-5 text-white shrink-0" />
          <div className="text-left">
            <span className="text-[14px] font-bold text-white block">
              {uploading
                ? 'Загрузка файла на сервер...'
                : 'Перетащите файл картинки прямо сюда или нажмите'}
            </span>
            <span className="text-[14px] text-zinc-400">
              Поддерживается PNG с сохранением прозрачности, JPG, WEBP
            </span>
          </div>
        </div>
      </div>

      {/* Scale Slider */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="img-scale-slider"
            className="text-[14px] font-bold text-white flex items-center gap-2"
          >
            <Maximize2 className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Масштаб размера по плоскости листа:</span>
          </label>
          <span className="text-[14px] font-mono text-zinc-300 tabular-nums">
            {layout.scale}% от ширины
          </span>
        </div>
        <input
          id="img-scale-slider"
          type="range"
          min="30"
          max="100"
          step="5"
          value={layout.scale}
          onChange={(e) => handleScaleChange(parseInt(e.target.value, 10))}
          className="w-full accent-rose-500 cursor-pointer h-2 bg-zinc-800"
        />
        <div className="flex justify-between text-[14px] text-zinc-400">
          <span>30% (компактно)</span>
          <span>50% (полстраницы)</span>
          <span>100% (во всю полосу)</span>
        </div>
      </div>

      {/* Rich 9-Mode Visual Page Placement Editor */}
      <ImagePlacementVisualEditor
        layout={layout}
        onChangeLayout={onChangeLayout}
        imageUrl={imageUrl}
        sampleText={sampleText}
        showPageAnchorControls={showPageAnchorControls}
      />
    </div>
  );
};
