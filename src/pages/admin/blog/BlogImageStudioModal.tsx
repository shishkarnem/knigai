import React, { useEffect, useState } from 'react';
import { Sparkles, Upload, Images, Check, Image as ImageIcon, Loader2 } from 'lucide-react';
import { NoirModal } from '../../../components/common/NoirModal';
import { NoirButton } from '../../../components/common/NoirButton';
import {
  BlogImageFileDto,
  adminFetchBlogImages,
  adminGenerateBlogImage16x9,
} from '../../../services/blog/blogApi';
import { getUploadService } from '../../../services/upload/FileUploadService';

interface BlogImageStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetMode: 'cover' | 'inline';
  onSelectImage: (file: { id?: number; shortUrl: string; name: string }) => void;
}

export const BlogImageStudioModal: React.FC<BlogImageStudioModalProps> = ({
  isOpen,
  onClose,
  targetMode,
  onSelectImage,
}) => {
  const [tab, setTab] = useState<'generate' | 'upload' | 'gallery'>('generate');
  const [prompt, setPrompt] = useState('');
  const [imageName, setImageName] = useState('');
  const [generating, setGenerating] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [gallery, setGallery] = useState<BlogImageFileDto[]>([]);
  const [blogFolderId, setBlogFolderId] = useState<number | null>(null);
  const [loadingGallery, setLoadingGallery] = useState(false);
  const [lastCreated, setLastCreated] = useState<BlogImageFileDto | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const loadGallery = async () => {
    setLoadingGallery(true);
    try {
      const res = await adminFetchBlogImages();
      setBlogFolderId(res.blogFolderId);
      setGallery(res.images);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось загрузить галерею');
    } finally {
      setLoadingGallery(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setLastCreated(null);
      loadGallery();
    }
  }, [isOpen]);

  const handleGenerate16x9 = async (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim().length < 4) {
      setErrorMsg('Опишите сцену для генерации 16:9 иллюстрации.');
      return;
    }
    setErrorMsg('');
    setGenerating(true);
    try {
      const created = await adminGenerateBlogImage16x9(prompt.trim(), imageName.trim() || undefined);
      setLastCreated(created);
      setGallery((prev) => [created, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка генерации изображения 16:9');
    } finally {
      setGenerating(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setUploading(true);
    try {
      const uploader = getUploadService();
      const registered = await uploader.uploadFileAndRegister(file, blogFolderId, true, {
        caption: `📰 Изображение для блога KnigAI: ${file.name}`,
      });
      const dto: BlogImageFileDto = {
        id: Number(registered.id),
        name: registered.name || file.name,
        original_url: registered.original_url,
        short_url: `/file/${registered.id}`,
        mime_type: registered.mime_type || file.type,
        file_size: Number(registered.file_size || file.size),
        folder_id: registered.folder_id ?? blogFolderId,
        created_at: registered.created_at || new Date().toISOString(),
      };
      setLastCreated(dto);
      setGallery((prev) => [dto, ...prev]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки файла в БД');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePick = (item: BlogImageFileDto) => {
    onSelectImage({
      id: item.id,
      shortUrl: item.short_url || `/file/${item.id}`,
      name: item.name,
    });
    onClose();
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        targetMode === 'cover'
          ? 'Обложка поста (строго 16:9 · только из базы данных)'
          : 'Иллюстрация в Markdown (16:9 · только ссылки из БД)'
      }
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-5 text-white">
        {/* Wrapping tabs */}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('generate')}
            className={`min-h-[42px] px-4 py-2 border text-[14px] font-bold inline-flex items-center gap-2 cursor-pointer rounded-none ${
              tab === 'generate'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            <Sparkles className={`w-4 h-4 ${tab === 'generate' ? 'text-black' : 'text-rose-500'}`} />
            <span>Сгенерировать 16:9 по промпту</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`min-h-[42px] px-4 py-2 border text-[14px] font-bold inline-flex items-center gap-2 cursor-pointer rounded-none ${
              tab === 'upload'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            <Upload className={`w-4 h-4 ${tab === 'upload' ? 'text-black' : 'text-rose-500'}`} />
            <span>Загрузить в БД через загрузчик</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('gallery')}
            className={`min-h-[42px] px-4 py-2 border text-[14px] font-bold inline-flex items-center gap-2 cursor-pointer rounded-none ${
              tab === 'gallery'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            <Images className={`w-4 h-4 ${tab === 'gallery' ? 'text-black' : 'text-rose-500'}`} />
            <span>Выбрать из базы данных ({gallery.length})</span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 border border-rose-500 bg-rose-950/50 text-rose-200 text-[14px]">
            {errorMsg}
          </div>
        )}

        {/* Tab 1: Generate strictly 16:9 */}
        {tab === 'generate' && (
          <form onSubmit={handleGenerate16x9} className="flex flex-col gap-4">
            <div className="p-3 border border-zinc-800 bg-black/65 text-[14px] text-zinc-300">
              Генератор создаёт строго горизонтальную картинку <strong className="text-white">16:9</strong>, сохраняет её в облако и регистрирует в таблице <code className="text-rose-400">file_storage</code> для вставки в виде <code className="text-rose-400">/file/:id</code>.
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-zinc-200">
                Подпись / Имя файла (необязательно)
              </label>
              <input
                type="text"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                placeholder="Например: Подарочная книга на столе"
                className="noir-input w-full px-3.5 py-2.5 text-[14px] rounded-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-zinc-200">
                Промпт для генерации 16:9 (можно на русском или английском)
              </label>
              <textarea
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Опишите сцену: например, открытая книга формата А5 с нуарными иллюстрациями на тёмном дубовом столе, красная закладка..."
                className="noir-input w-full px-3.5 py-2.5 text-[14px] rounded-none"
              />
            </div>

            <NoirButton
              type="submit"
              variant="primary"
              loading={generating}
              icon={<Sparkles className="w-4 h-4 text-black" />}
              showTail={false}
              className="self-start"
            >
              {generating ? 'Генерация 16:9 и сохранение в БД...' : 'Сгенерировать 16:9 и сохранить в БД'}
            </NoirButton>
          </form>
        )}

        {/* Tab 2: Upload via FileUploadService */}
        {tab === 'upload' && (
          <div className="p-6 border border-dashed border-zinc-600 bg-zinc-950/60 flex flex-col items-center justify-center gap-4 text-center rounded-none">
            <ImageIcon className="w-10 h-10 text-rose-500" />
            <div className="text-[15px] text-zinc-200">
              Загрузите изображение с компьютера в папку <strong className="text-white">«Блог и статьи»</strong> в PostgreSQL.
            </div>
            <label className="inline-flex items-center gap-2 px-5 py-3 bg-white text-black font-bold text-[14px] cursor-pointer hover:bg-zinc-200">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>{uploading ? 'Загрузка в облако и БД...' : 'Выбрать файл изображения'}</span>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        )}

        {/* Recently created/uploaded image preview & instant pick */}
        {lastCreated && (
          <div className="p-4 border border-rose-500 bg-black/80 flex flex-col sm:flex-row gap-4 items-center">
            <div className="w-full sm:w-56 aspect-video overflow-hidden border border-zinc-700 shrink-0 bg-black">
              <img
                src={lastCreated.short_url}
                alt={lastCreated.name}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 min-w-0 flex flex-col gap-2">
              <div className="text-[14px] text-rose-400 font-bold">
                Готово! Изображение сохранено в базе данных:
              </div>
              <div className="text-[14px] font-mono text-white break-all">
                {lastCreated.short_url}
              </div>
              <NoirButton
                type="button"
                variant="primary"
                showTail={false}
                icon={<Check className="w-4 h-4 text-black" />}
                onClick={() => handlePick(lastCreated)}
                className="self-start mt-1"
              >
                {targetMode === 'cover' ? 'Установить как обложку' : 'Вставить в текст поста'}
              </NoirButton>
            </div>
          </div>
        )}

        {/* Tab 3: Database gallery grid */}
        {tab === 'gallery' && (
          <div className="flex flex-col gap-3">
            {loadingGallery ? (
              <div className="p-8 text-center text-[14px] text-zinc-400">
                Загрузка картинок из базы данных...
              </div>
            ) : gallery.length === 0 ? (
              <div className="p-8 border border-zinc-800 text-center text-[14px] text-zinc-400">
                В галерее пока нет изображений. Сгенерируйте 16:9 картинку или загрузите файл.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                {gallery.map((item) => (
                  <div
                    key={item.id}
                    className="border border-zinc-800 hover:border-rose-500 bg-zinc-950/80 flex flex-col justify-between transition-colors rounded-none overflow-hidden"
                  >
                    <div className="w-full aspect-video bg-black border-b border-zinc-800 overflow-hidden">
                      <img
                        src={item.short_url || `/file/${item.id}`}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="p-3 flex flex-col gap-2">
                      <div className="text-[14px] text-white truncate" title={item.name}>
                        {item.name}
                      </div>
                      <div className="text-[14px] font-mono text-zinc-400">
                        {item.short_url}
                      </div>
                      <button
                        type="button"
                        onClick={() => handlePick(item)}
                        className="w-full min-h-[38px] px-3 py-1.5 bg-white hover:bg-zinc-200 text-black font-bold text-[14px] cursor-pointer"
                      >
                        {targetMode === 'cover' ? 'На обложку' : 'Вставить в Markdown'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </NoirModal>
  );
};
