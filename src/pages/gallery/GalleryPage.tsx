import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  Upload,
  Folder,
  Trash2,
  Copy,
  Check,
  Search,
  Filter,
  ExternalLink,
  Sliders,
  Sparkles,
  BookOpen,
  Volume2,
} from 'lucide-react';
import { FileRecord, FileFolder, Book, AppUser } from '../../types';
import {
  fetchFiles,
  fetchFolders,
  deleteFileFromDb,
  createFolderInDb,
  formatFileWeight,
  recalculateMissingFileSizes,
} from '../../services/db/fileStorageRepository';
import { DropzoneUploader } from '../../components/gallery/DropzoneUploader';
import { NoirButton } from '../../components/common/NoirButton';
import { NoirModal } from '../../components/common/NoirModal';
import { NoirStatus } from '../../components/common/NoirStatus';
import { ImageFilterControl, getImageFilterStyle } from '../../components/editor/ImageFilterControl';
import { NoirVoiceInput } from '../../components/voice/NoirVoiceInput';
import { NoirAudioPlayer } from '../../components/voice/NoirAudioPlayer';
import { pickBestImageAmong4With763 } from '../../services/ai/decision/bookClassifier763';

interface GalleryPageProps {
  activeBook?: Book | null;
  currentUser?: AppUser | null;
  onOpenAuth?: () => void;
  onNavigateToCover?: () => void;
  onNavigateToChapters?: () => void;
}

export const GalleryPage: React.FC<GalleryPageProps> = ({
  activeBook,
  currentUser,
  onOpenAuth,
  onNavigateToCover,
  onNavigateToChapters,
}) => {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null | 'all'>('all');
  const [filterType, setFilterType] = useState<'all' | 'png' | 'jpeg' | 'audio'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  // Deletion confirmation modal
  const [fileToDelete, setFileToDelete] = useState<FileRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Inspector modal
  const [inspectFile, setInspectFile] = useState<FileRecord | null>(null);
  const [inspectFilter, setInspectFilter] = useState<'normal' | 'grayscale' | 'contrast' | 'sepia' | 'invert'>('normal');
  const [inspectTint, setInspectTint] = useState<string | undefined>(undefined);

  // New folder modal
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Multimodal 763 compare mode (up to 4 images)
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [comparing, setComparing] = useState(false);
  const [bestPickedId, setBestPickedId] = useState<number | null>(null);

  useEffect(() => {
    loadFiles();
  }, [selectedFolderId, filterType, currentUser]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      const folderParam = selectedFolderId === 'all' ? undefined : selectedFolderId;
      let fileList = await fetchFiles(folderParam, search, currentUser?.uid, true);
      if (fileList.some((f) => !f.file_size || f.file_size <= 0)) {
        const updatedCount = await recalculateMissingFileSizes();
        if (updatedCount > 0) {
          fileList = await fetchFiles(folderParam, search, currentUser?.uid, true);
        }
      }
      setFiles(fileList);
      const folderList = await fetchFolders(currentUser?.uid);
      setFolders(folderList);
    } catch (err) {
      console.warn('Failed loading gallery files:', err);
    } finally {
      setLoading(false);
    }
  };

  const openDeleteModal = (file: FileRecord) => {
    setFileToDelete(file);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;
    setDeleting(true);
    try {
      try {
        await fetch(`/api/files/${fileToDelete.id}`, { method: 'DELETE' });
      } catch (apiErr) {
        console.warn('API delete notice:', apiErr);
      }
      await deleteFileFromDb(fileToDelete.id);
      setFiles((prev) => prev.filter((f) => f.id !== fileToDelete.id));
      if (inspectFile?.id === fileToDelete.id) {
        setInspectFile(null);
      }
      setStatusMsg({ type: 'success', text: `Файл «${fileToDelete.name}» успешно удален из базы данных` });
      setFileToDelete(null);
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка удаления: ' + (err instanceof Error ? err.message : String(err)) });
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyLink = (file: FileRecord) => {
    navigator.clipboard.writeText(file.original_url);
    setCopiedId(file.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await createFolderInDb(newFolderName.trim(), '#ffffff', currentUser?.uid);
      setNewFolderName('');
      setIsFolderModalOpen(false);
      loadFiles();
      setStatusMsg({ type: 'success', text: 'Папка создана' });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка создания папки: ' + (err instanceof Error ? err.message : '') });
    }
  };

  const toggleCompareId = (id: number) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const handleCompareWith763 = async () => {
    const picked = files.filter((f) => compareIds.includes(f.id)).slice(0, 4);
    if (picked.length < 2) {
      setStatusMsg({ type: 'error', text: 'Отметьте от 2 до 4 изображений в сетке для сравнения 763.' });
      return;
    }
    setComparing(true);
    setBestPickedId(null);
    try {
      const res = await pickBestImageAmong4With763({
        candidates: picked.map((f) => ({ id: f.id, label: f.name, url: f.original_url })),
        contextDescription: activeBook
          ? `Книга «${activeBook.title}» (${activeBook.genres.join(', ')}). ${activeBook.synopsis_overview?.slice(0, 200) || ''}`
          : 'Книжная иллюстрация в стиле нуар',
        userUid: currentUser?.uid,
        bookId: activeBook?.id,
        bookTitle: activeBook?.title,
      });
      const bestNum = Number(res.bestId);
      setBestPickedId(bestNum);
      const winner = picked.find((f) => f.id === bestNum);
      setStatusMsg({
        type: 'success',
        text: `763 (PPLX) выбрала лучший арт: «${winner?.name || '#' + bestNum}» (списано ${res.costLetters.toLocaleString('ru-RU')} букв).`,
      });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: 'Ошибка сравнения 763: ' + (err instanceof Error ? err.message : '') });
    } finally {
      setComparing(false);
    }
  };

  const isAudioFile = (f: FileRecord) =>
    Boolean(
      f.mime_type?.startsWith('audio/') ||
      (/\.(mp3|wav|ogg|m4a|m4b|webm|aac)$/i.test(f.name) && !f.mime_type?.startsWith('video/'))
    );

  const displayedFiles = files.filter((f) => {
    if (filterType === 'png') return f.mime_type.includes('png') || f.name.toLowerCase().endsWith('.png');
    if (filterType === 'jpeg') return f.mime_type.includes('jpeg') || f.name.toLowerCase().endsWith('.jpg');
    if (filterType === 'audio') return isAudioFile(f);
    return true;
  });

  if (!currentUser) {
    return (
      <div className="w-full flex flex-col gap-6 text-white">
        <div className="noir-container p-8 sm:p-12 border-2 border-white text-center flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 bg-white text-black flex items-center justify-center font-bold">
            <ImageIcon className="w-8 h-8 text-black" />
          </div>
          <h2 className="text-[20px] font-bold text-white tracking-tight">
            Личная галерея доступна только после регистрации
          </h2>
          <p className="text-[14px] text-zinc-300 max-w-lg leading-relaxed">
            Чтобы загружать файлы с сохранением прозрачности PNG и иметь к ним постоянный доступ в личном кабинете, войдите в аккаунт. Каждый файл сохраняется с вашим уникальным 11-значным UID.
          </p>
          <div className="pt-2">
            <NoirButton variant="primary" onClick={onOpenAuth}>
              Войти или зарегистрироваться
            </NoirButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6 text-white">
      {/* Top Header Card */}
      <div className="noir-container p-5 sm:p-6 border-2 border-white shadow-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-white text-black flex items-center justify-center font-bold">
            <ImageIcon className="w-5 h-5 text-black" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-white tracking-tight">
              Галерея файлов
            </h2>
            <p className="text-[14px] text-zinc-400 mt-0.5">
              Персональные файлы автора (UID: {currentUser.uid}) с поддержкой PNG альфа-прозрачности
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {compareIds.length > 0 && (
            <NoirButton
              variant="primary"
              onClick={handleCompareWith763}
              loading={comparing}
              icon={<Sparkles className="w-4 h-4 text-black" />}
            >
              Выбрать лучший из {compareIds.length} (763)
            </NoirButton>
          )}
          <NoirButton
            variant="outline"
            onClick={() => setIsFolderModalOpen(true)}
            icon={<Folder className="w-4 h-4" />}
          >
            Создать папку
          </NoirButton>
        </div>
      </div>

      {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

      {/* Upload Dropzone */}
      <div className="noir-container p-5 border border-zinc-700 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-white" />
            Прямая загрузка в хранилище с сохранением прозрачности фона PNG
          </h3>
          <span className="text-[14px] text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 font-mono">
            png alpha
          </span>
        </div>
        <DropzoneUploader
          folderId={selectedFolderId === 'all' ? null : selectedFolderId}
          onUploadSuccess={() => {
            loadFiles();
            setStatusMsg({ type: 'success', text: 'Файлы успешно загружены в галерею!' });
          }}
        />
      </div>

      {/* Filters & Search Toolbar */}
      <div className="noir-container p-4 border border-zinc-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <Search className="w-4 h-4 text-zinc-400 shrink-0 hidden sm:block" />
          <NoirVoiceInput
            value={search}
            onValueChange={setSearch}
            onEnter={loadFiles}
            voiceContext="gallery_search"
            placeholder="Поиск по названию файла..."
            containerClassName="flex-1 min-w-0"
          />
          <NoirButton variant="outline" onClick={loadFiles} className="shrink-0">
            Найти
          </NoirButton>
        </div>

        {/* Type & Folder Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* File type filter */}
          <div className="flex flex-wrap items-center gap-1 border border-zinc-700 p-0.5 bg-zinc-900">
            <button
              type="button"
              onClick={() => setFilterType('all')}
              className={`min-h-[36px] px-3 text-[14px] font-bold cursor-pointer transition-colors ${
                filterType === 'all' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
              }`}
            >
              Все ({files.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterType('png')}
              className={`min-h-[36px] px-3 text-[14px] font-bold cursor-pointer transition-colors ${
                filterType === 'png' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
              }`}
            >
              PNG без фона
            </button>
            <button
              type="button"
              onClick={() => setFilterType('jpeg')}
              className={`min-h-[36px] px-3 text-[14px] font-bold cursor-pointer transition-colors ${
                filterType === 'jpeg' ? 'bg-white text-black' : 'text-zinc-300 hover:text-white'
              }`}
            >
              JPG / Арт
            </button>
            <button
              type="button"
              onClick={() => setFilterType('audio')}
              className={`min-h-[36px] px-3 text-[14px] font-bold cursor-pointer transition-colors flex items-center gap-1.5 ${
                filterType === 'audio' ? 'bg-rose-600 text-white' : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Аудио</span>
            </button>
          </div>

          {/* Folder dropdown */}
          <select
            value={selectedFolderId === null ? 'null' : selectedFolderId}
            onChange={(e) => {
              const val = e.target.value;
              if (val === 'all') setSelectedFolderId('all');
              else if (val === 'null') setSelectedFolderId(null);
              else setSelectedFolderId(parseInt(val, 10));
            }}
            className="min-h-[44px] px-3 noir-input text-[14px] font-bold"
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
      </div>

      {/* Files Grid */}
      {loading ? (
        <div className="py-20 text-center text-zinc-400">
          Загрузка файлов из базы данных...
        </div>
      ) : displayedFiles.length === 0 ? (
        <div className="noir-container p-12 text-center text-zinc-400 border border-zinc-800">
          <ImageIcon className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-[16px] font-bold text-white">В галерее пока нет файлов</p>
          <p className="text-[14px] text-zinc-400 mt-1">
            Загрузите файлы с устройства или сгенерируйте обложки и иллюстрации в конструкторе книги
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayedFiles.map((file) => {
            const isPng = file.mime_type.includes('png') || file.name.toLowerCase().endsWith('.png');
            const isAudio = isAudioFile(file);
            const isInCompare = compareIds.includes(file.id);
            const isWinner = bestPickedId === file.id;
            return (
              <div
                key={file.id}
                className={`noir-container border transition-all flex flex-col justify-between group overflow-hidden ${
                  isWinner ? 'border-rose-500 ring-1 ring-rose-500' : isInCompare ? 'border-white' : 'border-zinc-700 hover:border-white'
                }`}
              >
                {/* Thumbnail area with transparent checkerboard */}
                <div
                  onClick={() => {
                    setInspectFile(file);
                    setInspectFilter('normal');
                    setInspectTint(undefined);
                  }}
                  className="relative aspect-square checkerboard-bg p-2 flex items-center justify-center cursor-pointer overflow-hidden"
                >
                  {isAudio ? (
                    <div className="w-full h-full bg-zinc-950/90 border border-zinc-800 flex flex-col items-center justify-center gap-2 p-3 text-center">
                      <div className="w-12 h-12 border border-rose-500 bg-black flex items-center justify-center">
                        <Volume2 className="w-6 h-6 text-rose-500" />
                      </div>
                      <span className="text-[14px] font-bold text-white">Голосовая запись</span>
                      <span className="text-[14px] font-mono text-zinc-400">
                        {file.mime_type || 'audio'}
                      </span>
                      <audio
                        controls
                        preload="none"
                        src={file.original_url}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full h-9 mt-1"
                      />
                    </div>
                  ) : (
                    <img
                      src={file.original_url}
                      alt={file.name}
                      className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                    />
                  )}
                  {isPng && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-black/80 text-[14px] font-mono text-zinc-200 border border-zinc-700">
                      png alpha
                    </span>
                  )}
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/80 text-[14px] text-zinc-300 border border-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity">
                    Открыть
                  </span>
                </div>

                {/* File Info */}
                <div className="p-3 bg-zinc-950/80 flex flex-col gap-2 border-t border-zinc-800">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold text-white truncate" title={file.name}>
                      {file.name}
                    </div>
                    <div className="text-[14px] text-zinc-400 font-mono mt-0.5 flex items-center justify-between gap-2">
                      <span>{file.file_size > 0 ? formatFileWeight(file.file_size) : '0 Б'}</span>
                      <span className="truncate max-w-[120px]">{file.created_at?.slice(0, 10)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-between gap-1 pt-1 border-t border-zinc-900">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(file)}
                      className="min-h-[40px] flex-1 px-2 text-[14px] font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 flex items-center justify-center gap-1 cursor-pointer"
                      title="Скопировать прямую ссылку"
                    >
                      {copiedId === file.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Скопировано</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Ссылка</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setInspectFile(file);
                        setInspectFilter('normal');
                        setInspectTint(undefined);
                      }}
                      className="min-h-[40px] px-3 text-[14px] font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white border border-zinc-700 flex items-center justify-center cursor-pointer"
                      title="Фильтры и инспектор"
                    >
                      <Sliders className="w-4 h-4" />
                    </button>

                    {!isAudio && (
                      <button
                        type="button"
                        onClick={() => toggleCompareId(file.id)}
                        className={`min-h-[40px] px-2.5 text-[14px] font-bold border flex items-center justify-center cursor-pointer ${
                          isWinner
                            ? 'bg-rose-600 text-white border-rose-500'
                            : isInCompare
                            ? 'bg-white text-black border-white'
                            : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
                        }`}
                        title="Выбрать для сравнения 763 (до 4 артов)"
                      >
                        {isWinner ? '★' : isInCompare ? '✓' : '763'}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => openDeleteModal(file)}
                      className="min-h-[40px] px-3 text-[14px] font-bold bg-zinc-900 hover:bg-rose-950/80 text-zinc-400 hover:text-rose-300 border border-zinc-700 flex items-center justify-center cursor-pointer"
                      title="Удалить файл из базы данных"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* File Inspector & Filter Modal */}
      {inspectFile && (
        <NoirModal
          isOpen={!!inspectFile}
          onClose={() => setInspectFile(null)}
          title={`Инспектор файла: ${inspectFile.name}`}
          maxWidth="max-w-3xl"
        >
          <div className="flex flex-col gap-5 text-white">
            {/* Direct URL input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-white flex items-center justify-between">
                <span>Прямая ссылка на файл:</span>
                <a
                  href={inspectFile.original_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[14px] text-zinc-300 hover:text-white flex items-center gap-1"
                >
                  <span>Открыть оригинал</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={inspectFile.original_url}
                  className="w-full min-h-[44px] px-3 noir-input font-mono text-[14px]"
                />
                <NoirButton
                  variant="outline"
                  onClick={() => handleCopyLink(inspectFile)}
                  icon={copiedId === inspectFile.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                >
                  {copiedId === inspectFile.id ? 'Скопировано' : 'Копировать'}
                </NoirButton>
              </div>
            </div>

            {/* 1. Single Upper Big Preview */}
            {isAudioFile(inspectFile) ? (
              <div className="p-4 border-2 border-zinc-700 bg-zinc-950/80 flex flex-col gap-3">
                <span className="text-[14px] font-bold text-white flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-rose-500" />
                  <span>Аудиозапись из облачной папки</span>
                </span>
                <NoirAudioPlayer audioUrl={inspectFile.original_url} label={inspectFile.name} />
              </div>
            ) : (
              <>
                <div className="relative w-full h-56 sm:h-72 overflow-hidden flex items-center justify-center border-2 border-zinc-700 bg-zinc-900 shrink-0 checkerboard-bg">
                  <img
                    src={inspectFile.original_url}
                    alt={inspectFile.name}
                    style={getImageFilterStyle(inspectFilter, inspectTint)}
                    className="max-h-full max-w-full object-contain shadow-2xl transition-all"
                    referrerPolicy="no-referrer"
                  />
                </div>

                {/* Color Filter & Transparency Controls */}
                <ImageFilterControl
                  filter={inspectFilter}
                  colorTint={inspectTint}
                  onChangeFilter={setInspectFilter}
                  onChangeColorTint={setInspectTint}
                  isPng={inspectFile.mime_type.includes('png') || inspectFile.name.toLowerCase().endsWith('.png')}
                />
              </>
            )}

            {/* Quick Actions for book creation */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-zinc-800">
              <div className="flex items-center gap-2">
                {onNavigateToCover && (
                  <NoirButton
                    variant="outline"
                    onClick={() => {
                      onNavigateToCover();
                      setInspectFile(null);
                    }}
                    icon={<Sparkles className="w-4 h-4" />}
                  >
                    Вставить в обложку
                  </NoirButton>
                )}
                {onNavigateToChapters && (
                  <NoirButton
                    variant="outline"
                    onClick={() => {
                      onNavigateToChapters();
                      setInspectFile(null);
                    }}
                    icon={<BookOpen className="w-4 h-4" />}
                  >
                    Вставить в главу
                  </NoirButton>
                )}
                <NoirButton
                  variant="danger"
                  onClick={() => openDeleteModal(inspectFile)}
                  icon={<Trash2 className="w-4 h-4" />}
                >
                  Удалить файл
                </NoirButton>
              </div>

              <NoirButton variant="primary" onClick={() => setInspectFile(null)}>
                Закрыть
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <NoirModal
          isOpen={!!fileToDelete}
          onClose={() => !deleting && setFileToDelete(null)}
          title="Разрешение на удаление файла"
          maxWidth="max-w-md"
        >
          <div className="flex flex-col gap-4 text-white">
            <div className="flex items-center gap-3 p-3 bg-zinc-950/80 border border-zinc-700">
              <div className="w-16 h-16 shrink-0 checkerboard-bg border border-zinc-600 flex items-center justify-center overflow-hidden">
                {isAudioFile(fileToDelete) ? (
                  <Volume2 className="w-7 h-7 text-rose-500" />
                ) : (
                  <img
                    src={fileToDelete.original_url}
                    alt={fileToDelete.name}
                    className="max-h-full max-w-full object-contain"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-bold text-white truncate" title={fileToDelete.name}>
                  {fileToDelete.name}
                </div>
                <div className="text-[14px] text-zinc-400 font-mono mt-0.5">
                  Формат: {fileToDelete.mime_type || (fileToDelete.name.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')}
                </div>
                <div className="text-[14px] text-zinc-400 font-mono">
                  ID в базе: #{fileToDelete.id}
                </div>
              </div>
            </div>

            <div className="p-3 bg-rose-950/30 border border-rose-900 text-[14px] text-rose-200 leading-relaxed">
              Вы действительно хотите удалить этот файл из базы данных? Все ссылки на данный файл перестанут действовать.
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton
                variant="outline"
                onClick={() => setFileToDelete(null)}
                disabled={deleting}
              >
                Отмена
              </NoirButton>
              <NoirButton
                variant="danger"
                onClick={confirmDelete}
                loading={deleting}
                icon={<Trash2 className="w-4 h-4" />}
              >
                Удалить из базы данных
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}

      {/* New Folder Modal */}
      <NoirModal
        isOpen={isFolderModalOpen}
        onClose={() => setIsFolderModalOpen(false)}
        title="Создание папки в галерее"
        maxWidth="max-w-md"
      >
        <div className="flex flex-col gap-4 text-white">
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-white">Название папки:</label>
            <NoirVoiceInput
              value={newFolderName}
              onValueChange={setNewFolderName}
              voiceContext="gallery_folder_name"
              placeholder="Например: Обложки 2026, Персонажи..."
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <NoirButton variant="outline" onClick={() => setIsFolderModalOpen(false)}>
              Отмена
            </NoirButton>
            <NoirButton variant="primary" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Создать
            </NoirButton>
          </div>
        </div>
      </NoirModal>
    </div>
  );
};
