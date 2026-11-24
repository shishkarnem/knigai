import React, { useState, useEffect } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  Eye,
  Copy,
  RefreshCw,
  Upload,
  Image as ImageIcon,
  CheckSquare,
  Square,
  FolderInput,
  Check,
  Volume2,
} from 'lucide-react';
import { FileRecord, FileFolder } from '../../types';
import {
  fetchFiles,
  fetchFolders,
  createFolderInDb,
  deleteFolderInDb,
  deleteFileFromDb,
  batchMoveFilesInDb,
  batchDeleteFilesFromDb,
  formatFileWeight,
  recalculateMissingFileSizes,
} from '../../services/db/fileStorageRepository';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirModal } from '../../components/common/NoirModal';
import { NoirStatus } from '../../components/common/NoirStatus';
import { DropzoneUploader } from '../../components/gallery/DropzoneUploader';
import { FilePreviewModal } from '../../components/gallery/FilePreviewModal';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';

export const AdminGalleryTab: React.FC = () => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRecord | null>(null);
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showUploader, setShowUploader] = useState(false);

  // Single delete modals
  const [fileToDelete, setFileToDelete] = useState<FileRecord | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FileFolder | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Batch selection state
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [isBatchMoveModalOpen, setIsBatchMoveModalOpen] = useState(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [targetBatchFolderId, setTargetBatchFolderId] = useState<number | null>(null);
  const [batchActionLoading, setBatchActionLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadFilesAndFolders();
  }, [selectedFolderId]);

  const loadFilesAndFolders = async () => {
    setLoading(true);
    try {
      const folderParam = selectedFolderId === 'all' ? undefined : selectedFolderId;
      let fileList = await fetchFiles(folderParam, search, undefined, true);
      if (fileList.some((f) => !f.file_size || f.file_size <= 0)) {
        const updatedCount = await recalculateMissingFileSizes();
        if (updatedCount > 0) {
          fileList = await fetchFiles(folderParam, search, undefined, true);
        }
      }
      setFiles(fileList);
      const folderList = await fetchFolders(undefined, true);
      setFolders(folderList);
      // Clean up selected IDs that are no longer in visible files
      setSelectedFileIds((prev) => prev.filter((id) => fileList.some((f) => f.id === id)));
    } catch (err) {
      console.warn('Failed loading admin files:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      const created = await createFolderInDb(newFolderName.trim());
      setFolders([...folders, created]);
      setNewFolderName('');
      setIsNewFolderOpen(false);
      setStatusMsg({ type: 'success', text: `Папка «${created.name}» создана.` });
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Ошибка при создании папки: ' + (err instanceof Error ? err.message : String(err)) });
    }
  };

  const confirmDeleteFolder = async () => {
    if (!folderToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteFolderInDb(folderToDelete.id);
      setFolders(folders.filter((f) => f.id !== folderToDelete.id));
      if (selectedFolderId === folderToDelete.id) setSelectedFolderId('all');
      setFolderToDelete(null);
    } catch (err) {
      console.warn('Delete folder error:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  const confirmDeleteFile = async () => {
    if (!fileToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteFileFromDb(fileToDelete.id);
      setFiles(files.filter((f) => f.id !== fileToDelete.id));
      setSelectedFileIds((prev) => prev.filter((id) => id !== fileToDelete.id));
      setFileToDelete(null);
    } catch (err) {
      console.warn('Delete file error:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Toggle selection of a single file
  const toggleSelectFile = (id: number) => {
    setSelectedFileIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Toggle select all visible files
  const toggleSelectAll = () => {
    if (selectedFileIds.length === files.length) {
      setSelectedFileIds([]);
    } else {
      setSelectedFileIds(files.map((f) => f.id));
    }
  };

  // Execute batch move
  const handleBatchMoveSubmit = async () => {
    if (!selectedFileIds.length) return;
    setBatchActionLoading(true);
    try {
      await batchMoveFilesInDb(selectedFileIds, targetBatchFolderId);
      setIsBatchMoveModalOpen(false);
      setSelectedFileIds([]);
      await loadFilesAndFolders();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Ошибка при массовом перемещении файлов' });
    } finally {
      setBatchActionLoading(false);
    }
  };

  // Execute batch delete
  const handleBatchDeleteSubmit = async () => {
    if (!selectedFileIds.length) return;
    setBatchActionLoading(true);
    try {
      await batchDeleteFilesFromDb(selectedFileIds);
      setIsBatchDeleteModalOpen(false);
      setSelectedFileIds([]);
      await loadFilesAndFolders();
    } catch (err) {
      setStatusMsg({ type: 'error', text: 'Ошибка при массовом удалении файлов' });
    } finally {
      setBatchActionLoading(false);
    }
  };

  const copyUrl = (file: FileRecord) => {
    const url = `${window.location.origin}/file/${file.id}`;
    navigator.clipboard.writeText(url);
    setStatusMsg({ type: 'success', text: 'Ссылка скопирована: ' + url });
  };

  return (
    <div className="flex flex-col gap-5 text-white">
      {/* Top action bar */}
      <div className="noir-container p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border border-zinc-700">
        <div>
          <h3 className="text-[17px] font-bold text-white">
            Медиа-галерея и постоянное хранилище файлов
          </h3>
          <p className="text-[14px] text-zinc-400">
            Зарегистрировано файлов: <strong className="text-white">{files.length}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <NoirButton
            variant="outline"
            onClick={() => setShowUploader(!showUploader)}
            icon={<Upload className="w-4 h-4" />}
          >
            {showUploader ? 'Скрыть загрузчик' : 'Загрузить файлы'}
          </NoirButton>
          <NoirButton
            variant="outline"
            onClick={() => setIsNewFolderOpen(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Новая папка
          </NoirButton>
          <NoirButton
            variant="subtle"
            onClick={loadFilesAndFolders}
            icon={<RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />}
          >
            Обновить
          </NoirButton>
        </div>
      </div>

      {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

      {/* New Folder Inline Form */}
      {isNewFolderOpen && (
        <div className="noir-container p-4 border-2 border-white flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <NoirVoiceInput
            value={newFolderName}
            onValueChange={setNewFolderName}
            onEnter={handleCreateFolder}
            voiceContext="admin_gallery_folder_name"
            placeholder="Название папки (например: Персонажи, Обложки, Главы)..."
            containerClassName="flex-1 min-w-0"
          />
          <NoirButton variant="primary" onClick={handleCreateFolder}>
            Создать
          </NoirButton>
          <NoirButton variant="subtle" onClick={() => setIsNewFolderOpen(false)}>
            Отмена
          </NoirButton>
        </div>
      )}

      {/* Uploader Section */}
      {showUploader && (
        <div className="noir-container p-4 border-2 border-white flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-zinc-700">
            <h4 className="text-[15px] font-bold text-white">
              Пакетная загрузка файлов в галерею
            </h4>
            <span className="text-[14px] text-zinc-400">
              Сохранение прозрачности PNG с альфа-каналом
            </span>
          </div>
          <DropzoneUploader
            folderId={selectedFolderId === 'all' ? null : selectedFolderId}
            onUploadSuccess={() => {
              loadFilesAndFolders();
            }}
          />
        </div>
      )}

      {/* Folders and Search Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Folder Tags */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setSelectedFolderId('all')}
            className={`min-h-[40px] px-3 text-[14px] font-bold border transition-colors cursor-pointer ${
              selectedFolderId === 'all'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            Все файлы
          </button>
          <button
            onClick={() => setSelectedFolderId(null)}
            className={`min-h-[40px] px-3 text-[14px] font-bold border transition-colors cursor-pointer ${
              selectedFolderId === null
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            Без папки
          </button>
          {folders.map((f) => (
            <div key={f.id} className="inline-flex items-center">
              <button
                onClick={() => setSelectedFolderId(f.id)}
                className={`min-h-[40px] px-3 text-[14px] font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  selectedFolderId === f.id
                    ? 'bg-white text-black border-white'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>{f.name}</span>
              </button>
              <button
                onClick={() => setFolderToDelete(f)}
                className="min-h-[40px] px-2 bg-zinc-900 hover:bg-rose-950 text-zinc-400 hover:text-rose-200 border-y border-r border-zinc-700 cursor-pointer"
                title="Удалить папку"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="w-full sm:w-72 min-w-0">
          <NoirVoiceInput
            value={search}
            onValueChange={setSearch}
            onEnter={loadFilesAndFolders}
            voiceContext="admin_gallery_search"
            placeholder="Поиск файла..."
          />
        </div>
      </div>

      {/* Multi-selection Toolbar & Toggle */}
      {files.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950/80 border border-zinc-700">
          <button
            type="button"
            onClick={toggleSelectAll}
            className="flex items-center gap-2 text-[14px] font-bold text-white hover:text-zinc-200 transition cursor-pointer"
          >
            {selectedFileIds.length === files.length && files.length > 0 ? (
              <CheckSquare className="w-4 h-4 text-white" />
            ) : (
              <Square className="w-4 h-4 text-zinc-400" />
            )}
            <span>
              {selectedFileIds.length === files.length && files.length > 0
                ? 'Снять выбор со всех'
                : `Выбрать все (${files.length})`}
            </span>
          </button>

          {selectedFileIds.length > 0 && (
            <div className="flex items-center gap-2 text-[14px]">
              <span className="text-zinc-400">
                Выбрано: <strong className="text-white">{selectedFileIds.length}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedFileIds([])}
                className="text-zinc-400 hover:text-white underline cursor-pointer ml-1"
              >
                Сбросить
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sticky Bulk Action Bar when items selected */}
      {selectedFileIds.length > 0 && (
        <div className="sticky top-16 z-30 p-3.5 bg-zinc-950/95 border-2 border-white shadow-2xl backdrop-blur-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="w-5 h-5 text-white shrink-0" />
            <span className="text-[14px] font-bold text-white">
              Массовые действия над выбранными файлами ({selectedFileIds.length}):
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <NoirButton
              variant="outline"
              onClick={() => {
                setTargetBatchFolderId(null);
                setIsBatchMoveModalOpen(true);
              }}
              icon={<FolderInput className="w-4 h-4" />}
            >
              Перенести в папку ({selectedFileIds.length})
            </NoirButton>

            <NoirButton
              variant="primary"
              onClick={() => setIsBatchDeleteModalOpen(true)}
              className="bg-rose-600 hover:bg-rose-700 text-white border-rose-500"
              icon={<Trash2 className="w-4 h-4 text-white" />}
            >
              Удалить ({selectedFileIds.length})
            </NoirButton>

            <NoirButton
              variant="subtle"
              onClick={() => setSelectedFileIds([])}
            >
              Отмена
            </NoirButton>
          </div>
        </div>
      )}

      {/* Files Grid */}
      {files.length === 0 ? (
        <div className="noir-container p-12 text-center text-zinc-400 border border-zinc-800">
          <ImageIcon className="w-12 h-12 mx-auto text-zinc-600 mb-2" />
          <p className="text-[16px] font-bold text-white">В хранилище нет файлов</p>
          <p className="text-[14px] text-zinc-400 mt-1">
            Нажмите кнопку «Загрузить файлы» или создайте обложку/иллюстрацию в книге.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
          {files.map((file) => {
            const isImg = file.mime_type?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(file.name);
            const isAudio =
              file.mime_type?.startsWith('audio/') ||
              (/\.(mp3|wav|ogg|m4a)$/i.test(file.name) && !file.mime_type?.startsWith('video/'));
            const isSelected = selectedFileIds.includes(file.id);

            return (
              <div
                key={file.id}
                className={`noir-container p-2 flex flex-col justify-between gap-2 border transition-all bg-zinc-950 group relative ${
                  isSelected ? 'border-white ring-2 ring-white shadow-lg' : 'border-zinc-700 hover:border-zinc-400'
                }`}
              >
                {/* Multi-select checkbox badge */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelectFile(file.id);
                  }}
                  className={`absolute top-3 left-3 z-20 w-6 h-6 flex items-center justify-center border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-black border-white'
                      : 'bg-black/80 text-transparent border-zinc-500 hover:border-white'
                  }`}
                  title={isSelected ? 'Снять выбор' : 'Выбрать файл'}
                >
                  <Check className={`w-4 h-4 stroke-[3] ${isSelected ? 'text-black' : 'opacity-0'}`} />
                </button>

                <div
                  onClick={() => setPreviewFile(file)}
                  className="w-full aspect-square overflow-hidden cursor-pointer checkerboard-bg relative flex items-center justify-center bg-zinc-900"
                >
                  {isImg ? (
                    <img
                      src={file.original_url}
                      alt={file.name}
                      className="w-full h-full object-cover group-hover:scale-102 transition-transform"
                      referrerPolicy="no-referrer"
                    />
                  ) : isAudio ? (
                    <div className="w-full h-full bg-zinc-950/90 border border-zinc-800 flex flex-col items-center justify-center gap-1.5 p-2 text-center">
                      <Volume2 className="w-6 h-6 text-rose-500" />
                      <span className="text-[14px] font-bold text-white">Аудио</span>
                    </div>
                  ) : (
                    <span className="text-[14px] text-zinc-300 font-bold p-2 text-center">
                      {file.mime_type}
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 min-w-0">
                  <p className="text-[14px] font-bold text-white truncate" title={file.name}>
                    {file.name}
                  </p>
                  <div className="flex items-center justify-between text-[14px] text-zinc-400 font-mono">
                    <span>#{file.id}</span>
                    <span>{formatFileWeight(file.file_size)}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-1 border-t border-zinc-800">
                  <button
                    onClick={() => setPreviewFile(file)}
                    className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                    title="Предпросмотр"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => copyUrl(file)}
                    className="p-2 text-zinc-300 hover:text-white hover:bg-zinc-800 transition cursor-pointer"
                    title="Копировать короткую ссылку /file/:id"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setFileToDelete(file)}
                    className="p-2 text-rose-400 hover:text-rose-200 hover:bg-rose-950 transition cursor-pointer"
                    title="Удалить файл из БД"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {/* Single Delete File Modal */}
      {fileToDelete && (
        <NoirModal
          isOpen={!!fileToDelete}
          onClose={() => setFileToDelete(null)}
          title="Подтверждение удаления файла"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Вы уверены, что хотите удалить запись о файле <strong className="text-white">«{fileToDelete.name}»</strong> (#{fileToDelete.id}) из базы данных?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setFileToDelete(null)}>
                Отмена
              </NoirButton>
              <NoirButton
                variant="primary"
                onClick={confirmDeleteFile}
                loading={deleteLoading}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-500"
              >
                Удалить файл
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Single Delete Folder Modal */}
      {folderToDelete && (
        <NoirModal
          isOpen={!!folderToDelete}
          onClose={() => setFolderToDelete(null)}
          title="Подтверждение удаления папки"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Удалить папку <strong className="text-white">«{folderToDelete.name}»</strong>? Файлы, находившиеся в ней, не удалятся, а перейдут в категорию «Без папки».
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setFolderToDelete(null)}>
                Отмена
              </NoirButton>
              <NoirButton
                variant="primary"
                onClick={confirmDeleteFolder}
                loading={deleteLoading}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-500"
              >
                Удалить папку
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Batch Move Modal */}
      {isBatchMoveModalOpen && (
        <NoirModal
          isOpen={isBatchMoveModalOpen}
          onClose={() => setIsBatchMoveModalOpen(false)}
          title="Массовый перенос файлов в папку"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Выберите целевую папку для перемещения <strong className="text-white">{selectedFileIds.length}</strong> файлов:
            </p>

            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto p-1 border border-zinc-800 bg-zinc-950">
              <label
                className={`p-3 border flex items-center gap-2.5 cursor-pointer transition ${
                  targetBatchFolderId === null
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                }`}
              >
                <input
                  type="radio"
                  name="batch-folder-dest"
                  checked={targetBatchFolderId === null}
                  onChange={() => setTargetBatchFolderId(null)}
                  className="accent-black"
                />
                <span className="text-[14px]">Без папки (корневая галерея)</span>
              </label>

              {folders.map((f) => (
                <label
                  key={f.id}
                  className={`p-3 border flex items-center gap-2.5 cursor-pointer transition ${
                    targetBatchFolderId === f.id
                      ? 'bg-white text-black border-white font-bold'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-800 hover:text-white'
                  }`}
                >
                  <input
                    type="radio"
                    name="batch-folder-dest"
                    checked={targetBatchFolderId === f.id}
                    onChange={() => setTargetBatchFolderId(f.id)}
                    className="accent-black"
                  />
                  <Folder className="w-4 h-4 shrink-0" />
                  <span className="text-[14px] truncate">{f.name}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setIsBatchMoveModalOpen(false)}>
                Отмена
              </NoirButton>
              <NoirButton
                variant="primary"
                onClick={handleBatchMoveSubmit}
                loading={batchActionLoading}
                icon={<FolderInput className="w-4 h-4 text-black" />}
              >
                Перенести {selectedFileIds.length} файлов
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Batch Delete Modal */}
      {isBatchDeleteModalOpen && (
        <NoirModal
          isOpen={isBatchDeleteModalOpen}
          onClose={() => setIsBatchDeleteModalOpen(false)}
          title="Массовое удаление файлов"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white">
            <p className="text-[14px] text-zinc-300 leading-relaxed">
              Вы действительно хотите удалить <strong className="text-white">{selectedFileIds.length}</strong> выбранных файлов из базы данных?
            </p>
            <p className="text-[14px] text-rose-300 leading-relaxed bg-rose-950/40 p-2.5 border border-rose-800">
              Это действие необратимо. Записи о файлах будут удалены из таблицы file_storage.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setIsBatchDeleteModalOpen(false)}>
                Отмена
              </NoirButton>
              <NoirButton
                variant="primary"
                onClick={handleBatchDeleteSubmit}
                loading={batchActionLoading}
                className="bg-rose-600 hover:bg-rose-700 text-white border-rose-500"
                icon={<Trash2 className="w-4 h-4 text-white" />}
              >
                Удалить {selectedFileIds.length} файлов
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}
    </div>
  );
};
