import React, { useState, useRef } from 'react';
import { UploadCloud, Loader2 } from 'lucide-react';
import { FileUploadService } from '../../services/upload/FileUploadService';

interface DropzoneUploaderProps {
  folderId?: number | null;
  onUploadSuccess: () => void;
  onError?: (error: string) => void;
}

export const DropzoneUploader: React.FC<DropzoneUploaderProps> = ({ folderId, onUploadSuccess, onError }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    setUploading(true);
    const service = new FileUploadService();

    try {
      await service.uploadBatch(Array.from(files), folderId, (loaded, total) => {
        setProgress({ loaded, total });
      });
      onUploadSuccess();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Ошибка при загрузке файлов';
      setErrorMsg(msg);
      if (onError) onError(msg);
    } finally {
      setUploading(false);
      setProgress({ loaded: 0, total: 0 });
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`w-full p-5 sm:p-7 border-2 border-dashed rounded-none text-center cursor-pointer transition-all backdrop-blur-md ${
          isDragging
            ? 'border-rose-500 bg-rose-950/20'
            : 'border-zinc-700 hover:border-zinc-400 bg-black/40 hover:bg-black/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/png,image/*"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />

        <div className="flex flex-col items-center justify-center gap-3">
          {uploading ? (
            <>
              <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
              <p className="text-[15px] font-medium text-zinc-100">
                Загрузка {progress.loaded} из {progress.total}...
              </p>
              <p className="text-[14px] text-zinc-400">
                Сохранение прозрачности фона (альфа-канала)
              </p>
            </>
          ) : (
            <>
              <div className="p-3 bg-zinc-900/60 border border-zinc-700 rounded-none text-zinc-100">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-[15px] font-semibold text-zinc-100">
                Перетащите PNG-файлы сюда или нажмите для выбора
              </p>
              <p className="text-[14px] text-zinc-400">
                Полная поддержка прозрачного фона (альфа-канал сохраняется)
              </p>
            </>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mt-3 text-[14px] text-rose-300 bg-rose-950/60 border border-rose-600/60 p-3 rounded-none">
          {errorMsg}
        </div>
      )}
    </div>
  );
};
