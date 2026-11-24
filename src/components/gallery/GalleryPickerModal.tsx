import React, { useState, useEffect } from 'react';
import { Image as ImageIcon, Upload, Check, Folder } from 'lucide-react';
import { FileRecord, FileFolder } from '../../types';
import { fetchFiles, fetchFolders } from '../../services/db/fileStorageRepository';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { DropzoneUploader } from './DropzoneUploader';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';

interface GalleryPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUrl: (url: string, name?: string) => void;
  title?: string;
  selectedUrl?: string;
}

export const GalleryPickerModal: React.FC<GalleryPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectUrl,
  title = 'Выбор референса из галереи',
  selectedUrl = '',
}) => {
  const [activeTab, setActiveTab] = useState<'gallery' | 'upload'>('gallery');
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null | 'all'>('all');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, selectedFolderId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const folderParam = selectedFolderId === 'all' ? undefined : selectedFolderId;
      const fileList = await fetchFiles(folderParam, search);
      setFiles(fileList);
      const folderList = await fetchFolders();
      setFolders(folderList);
    } catch (err) {
      console.warn('Failed loading gallery files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (file: FileRecord) => {
    onSelectUrl(file.original_url, file.name);
    onClose();
  };

  return (
    <NoirModal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-4xl">
      <div className="flex flex-col gap-4 text-white">
        {/* Tab switcher */}
        <div className="flex items-center gap-2 border-b border-zinc-700 pb-2">
          <button
            onClick={() => setActiveTab('gallery')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border cursor-pointer transition-colors ${
              activeTab === 'gallery'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <ImageIcon className="w-4 h-4 inline mr-1.5" />
            Галерея файлов ({files.length})
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`min-h-[44px] px-4 text-[14px] font-bold border cursor-pointer transition-colors ${
              activeTab === 'upload'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1.5" />
            Загрузить новый файл
          </button>
        </div>

        {activeTab === 'upload' ? (
          <div className="py-2 flex flex-col gap-3">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Загрузите изображение с вашего устройства. Файл будет сохранен с сохранением прозрачности PNG и зарегистрирован в вашей базе файлов.
            </p>
            <DropzoneUploader
              folderId={selectedFolderId === 'all' ? null : selectedFolderId}
              onUploadSuccess={() => {
                setActiveTab('gallery');
                loadData();
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Search and Folders filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <NoirVoiceInput
                value={search}
                onValueChange={setSearch}
                onEnter={loadData}
                voiceContext="gallery_picker_search"
                placeholder="Поиск по названию файла..."
                containerClassName="flex-1 min-w-0"
              />

              {folders.length > 0 && (
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-zinc-400 shrink-0" />
                  <select
                    value={selectedFolderId === null ? 'null' : selectedFolderId}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'all') setSelectedFolderId('all');
                      else if (val === 'null') setSelectedFolderId(null);
                      else setSelectedFolderId(parseInt(val, 10));
                    }}
                    className="min-h-[44px] px-3 noir-input text-[14px]"
                  >
                    <option value="all">Все папки</option>
                    <option value="null">Без папки</option>
                    {folders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Images Grid */}
            {loading ? (
              <div className="py-16 text-center text-zinc-400">
                Загрузка файлов из базы данных...
              </div>
            ) : files.length === 0 ? (
              <div className="py-16 text-center border-2 border-dashed border-zinc-800 text-zinc-400">
                <ImageIcon className="w-10 h-10 mx-auto text-zinc-600 mb-2" />
                <p className="text-[16px] font-bold text-white">В галерее пока нет файлов</p>
                <p className="text-[14px] text-zinc-400 mt-1">
                  Перейдите во вкладку «Загрузить новый файл», чтобы добавить картинки.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[50vh] overflow-y-auto p-1">
                {files.map((file) => {
                  const isSelected = selectedUrl === file.original_url;
                  const isImg = file.mime_type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);

                  return (
                    <div
                      key={file.id}
                      onClick={() => handleSelect(file)}
                      className={`relative group cursor-pointer border-2 transition-all p-1 flex flex-col justify-between bg-zinc-950 ${
                        isSelected
                          ? 'border-white bg-zinc-900 shadow-lg'
                          : 'border-zinc-800 hover:border-zinc-400'
                      }`}
                    >
                      <div className="w-full aspect-square overflow-hidden flex items-center justify-center bg-zinc-900 checkerboard-bg relative">
                        {isImg ? (
                          <img
                            src={file.original_url}
                            alt={file.name}
                            className="w-full h-full object-cover group-hover:scale-102 transition-transform"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <span className="text-[14px] text-zinc-400 font-bold p-2 text-center">
                            {file.mime_type}
                          </span>
                        )}

                        {isSelected && (
                          <div className="absolute top-1 right-1 w-6 h-6 bg-white text-black flex items-center justify-center">
                            <Check className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="pt-1.5 px-0.5">
                        <p className="text-[14px] font-bold text-white truncate" title={file.name}>
                          {file.name}
                        </p>
                        <p className="text-[14px] text-zinc-400 font-mono">
                          #{file.id}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Modal footer */}
        <div className="flex items-center justify-end pt-3 border-t border-zinc-800">
          <NoirButton variant="subtle" onClick={onClose}>
            Закрыть
          </NoirButton>
        </div>
      </div>
    </NoirModal>
  );
};
