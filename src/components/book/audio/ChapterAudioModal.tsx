import React, { useState, useEffect } from 'react';
import {
  Headphones,
  Mic,
  UploadCloud,
  FolderOpen,
  Star,
  Trash2,
  Check,
  Loader2,
  Edit3,
} from 'lucide-react';
import { Book, BookAudioTrack, Chapter, FileRecord } from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { NoirButton } from '../../common/NoirButton';
import { NoirStatus } from '../../common/NoirStatus';
import { NoirAudioPlayer } from '../../voice/NoirAudioPlayer';
import { ChapterTeleprompterRecorder } from './ChapterTeleprompterRecorder';
import {
  attachExistingFileToChapterAudio,
  deleteBookAudioTrack,
  updateBookAudioTrack,
  uploadChapterAudioTrack,
} from '../../../services/voice/bookAudioService';
import { fetchFiles, formatFileWeight, getOrCreateBookFolder } from '../../../services/db/fileStorageRepository';
import { saveChapter } from '../../../services/db/bookRepository';

interface ChapterAudioModalProps {
  book: Book;
  chapter: Chapter;
  allTracks: BookAudioTrack[];
  userUid?: number;
  defaultNarrator: string;
  onClose: () => void;
  onTracksUpdated: (nextTracks: BookAudioTrack[]) => void;
  onChapterUpdated?: (updatedChapter: Chapter) => void;
}

type ModalTab = 'record' | 'upload' | 'tracks';

export const ChapterAudioModal: React.FC<ChapterAudioModalProps> = ({
  book,
  chapter,
  allTracks,
  userUid,
  defaultNarrator,
  onClose,
  onTracksUpdated,
  onChapterUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('record');
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);

  // Upload file state
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedDurationSec, setDetectedDurationSec] = useState(0);
  const [uploadTitle, setUploadTitle] = useState(chapter.title);
  const [uploadNarrator, setUploadNarrator] = useState(defaultNarrator || 'Автор');
  const [uploadPrimary, setUploadPrimary] = useState(true);
  const [uploadTranscribe, setUploadTranscribe] = useState(false);

  // Cloud book folder files
  const [folderAudioFiles, setFolderAudioFiles] = useState<FileRecord[]>([]);
  const [loadingFolderFiles, setLoadingFolderFiles] = useState(false);

  // Inline edit state for track
  const [editingTrackId, setEditingTrackId] = useState<number | null>(null);
  const [editTrackTitle, setEditTrackTitle] = useState('');
  const [editNarrator, setEditNarrator] = useState('');

  const chapterTracks = allTracks.filter(
    (t) =>
      (chapter.id && t.chapter_id === chapter.id) ||
      t.chapter_number === chapter.chapter_number
  );

  useEffect(() => {
    setUploadTitle(chapter.title);
  }, [chapter.id, chapter.title]);

  const loadFolderAudioFiles = async () => {
    setLoadingFolderFiles(true);
    try {
      const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
      const files = await fetchFiles(folder?.id, undefined, userUid, false);
      const audioOnly = files.filter(
        (f) =>
          f.mime_type?.startsWith('audio/') ||
          /\.(mp3|m4a|m4b|wav|ogg|webm|aac)$/i.test(f.name)
      );
      setFolderAudioFiles(audioOnly);
    } catch {
      setFolderAudioFiles([]);
    } finally {
      setLoadingFolderFiles(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'upload') {
      loadFolderAudioFiles();
    }
  }, [activeTab]);

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setDetectedDurationSec(0);
    setStatusMsg(null);
    const objUrl = URL.createObjectURL(file);
    const audio = new Audio(objUrl);
    audio.onloadedmetadata = () => {
      if (Number.isFinite(audio.duration)) {
        setDetectedDurationSec(Math.round(audio.duration));
      }
      URL.revokeObjectURL(objUrl);
    };
    audio.onerror = () => URL.revokeObjectURL(objUrl);
  };

  const applyRecognizedTextIfNeeded = async (recognizedText: string) => {
    const clean = recognizedText.trim();
    if (!clean || !onChapterUpdated) return;
    const prev = chapter.content?.trim() || '';
    const nextContent = prev ? `${prev}\n\n${clean}` : clean;
    const saved = await saveChapter(
      { ...chapter, content: nextContent, status: nextContent.length > 100 ? 'ready' : chapter.status },
      chapter.id,
      userUid
    );
    onChapterUpdated(saved);
  };

  const handleUploadRecorded = async (payload: {
    blob: Blob;
    title: string;
    narratorName: string;
    durationSec: number;
    isPrimary: boolean;
    transcribe: boolean;
    sourceType: 'voice_record' | 'dictation_stt';
  }) => {
    setUploading(true);
    setStatusMsg(null);
    try {
      const res = await uploadChapterAudioTrack({
        bookId: book.id,
        bookTitle: book.title,
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
        userUid,
        audioBlob: payload.blob,
        title: payload.title,
        narratorName: payload.narratorName,
        sourceType: payload.sourceType,
        durationSec: payload.durationSec,
        isPrimary: payload.isPrimary,
        transcribe: payload.transcribe,
      });

      if (payload.transcribe && res.recognized_text) {
        await applyRecognizedTextIfNeeded(res.recognized_text);
      }
      onTracksUpdated(res.tracks);
      setStatusMsg({
        type: 'success',
        text: payload.transcribe && res.recognized_text
          ? 'Озвучка сохранена в папку книги, а распознанный текст добавлен в главу.'
          : 'Голосовая озвучка сохранена в облачную папку книги и привязана к главе.',
      });
      setActiveTab('tracks');
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка загрузки записи',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadDeviceFile = async () => {
    if (!selectedFile || uploading) return;
    setUploading(true);
    setStatusMsg(null);
    try {
      const res = await uploadChapterAudioTrack({
        bookId: book.id,
        bookTitle: book.title,
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
        userUid,
        audioBlob: selectedFile,
        filename: selectedFile.name,
        title: uploadTitle.trim() || chapter.title,
        narratorName: uploadNarrator.trim() || 'Автор',
        sourceType: 'uploaded_file',
        durationSec: detectedDurationSec,
        isPrimary: uploadPrimary,
        transcribe: uploadTranscribe,
      });

      if (uploadTranscribe && res.recognized_text) {
        await applyRecognizedTextIfNeeded(res.recognized_text);
      }
      setSelectedFile(null);
      onTracksUpdated(res.tracks);
      setStatusMsg({
        type: 'success',
        text: 'Аудиофайл сохранён в облачную папку книги и подключён к комбинированному чтению.',
      });
      setActiveTab('tracks');
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка загрузки аудиофайла',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleAttachExisting = async (file: FileRecord) => {
    setUploading(true);
    setStatusMsg(null);
    try {
      const res = await attachExistingFileToChapterAudio({
        bookId: book.id,
        fileId: file.id,
        chapterId: chapter.id,
        chapterNumber: chapter.chapter_number,
        userUid,
        title: `${chapter.title} (${file.name})`,
        narratorName: uploadNarrator.trim() || 'Автор',
        isPrimary: true,
      });
      onTracksUpdated(res.tracks);
      setStatusMsg({
        type: 'success',
        text: `Файл «${file.name}» прикреплён как озвучка главы ${chapter.chapter_number}.`,
      });
      setActiveTab('tracks');
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Ошибка прикрепления файла',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleMakePrimary = async (trackId: number) => {
    try {
      const next = await updateBookAudioTrack(book.id, trackId, { is_primary: true });
      onTracksUpdated(next);
      setStatusMsg({ type: 'success', text: 'Основная дорожка главы обновлена.' });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка обновления' });
    }
  };

  const handleSaveEdit = async (trackId: number) => {
    try {
      const next = await updateBookAudioTrack(book.id, trackId, {
        title: editTrackTitle,
        narrator_name: editNarrator,
      });
      onTracksUpdated(next);
      setEditingTrackId(null);
      setStatusMsg({ type: 'success', text: 'Данные дорожки обновлены.' });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка сохранения' });
    }
  };

  const handleDeleteTrack = async (trackId: number) => {
    try {
      const next = await deleteBookAudioTrack(book.id, trackId, false);
      onTracksUpdated(next);
      setStatusMsg({ type: 'info', text: 'Дорожка отвязана от главы (оригинал файла остался в папке книги).' });
    } catch (err: unknown) {
      setStatusMsg({ type: 'error', text: err instanceof Error ? err.message : 'Ошибка удаления' });
    }
  };

  return (
    <NoirModal
      isOpen={true}
      onClose={onClose}
      title={`Озвучка и диктовка — Глава ${chapter.chapter_number}: ${chapter.title}`}
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        {/* Vertical-wrap Noir bubble tabs (no horizontal scroll on mobile) */}
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab('record')}
            className={`min-h-[44px] px-4 py-2 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer rounded-none ${
              activeTab === 'record'
                ? 'bg-rose-600 text-white border-white'
                : 'bg-zinc-950/80 text-zinc-200 border-zinc-700 hover:border-white'
            }`}
          >
            <Mic className="w-4 h-4 shrink-0" />
            <span>Записать / Диктовать с суфлёром</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`min-h-[44px] px-4 py-2 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer rounded-none ${
              activeTab === 'upload'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-200 border-zinc-700 hover:border-white'
            }`}
          >
            <UploadCloud className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Загрузить файл / Из папки книги</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tracks')}
            className={`min-h-[44px] px-4 py-2 text-[14px] font-bold border transition flex items-center gap-2 cursor-pointer rounded-none ${
              activeTab === 'tracks'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950/80 text-zinc-200 border-zinc-700 hover:border-white'
            }`}
          >
            <Headphones className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Дорожки главы ({chapterTracks.length})</span>
          </button>
        </div>

        {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

        {activeTab === 'record' && (
          <ChapterTeleprompterRecorder
            bookTitle={book.title}
            chapterTitle={chapter.title}
            chapterContent={chapter.content}
            chapterSynopsis={chapter.synopsis}
            defaultNarrator={defaultNarrator}
            hasExistingText={Boolean(chapter.content && chapter.content.trim().length > 50)}
            uploading={uploading}
            onUploadRecorded={handleUploadRecorded}
          />
        )}

        {activeTab === 'upload' && (
          <div className="flex flex-col gap-5">
            <div className="p-4 border border-zinc-700 bg-black/70 flex flex-col gap-3">
              <div className="flex items-center gap-2 font-bold text-[15px] text-white">
                <UploadCloud className="w-4 h-4 text-rose-500" />
                <span>Загрузить готовый аудиофайл с устройства (.mp3, .m4a, .wav, .ogg, .webm)</span>
              </div>

              <label className="w-full min-h-[72px] p-4 border-2 border-dashed border-zinc-700 hover:border-white bg-zinc-950/70 flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center">
                <span className="text-[14px] font-bold text-white">
                  {selectedFile
                    ? `Выбран файл: ${selectedFile.name} (${formatFileWeight(selectedFile.size)})`
                    : 'Нажмите, чтобы выбрать аудиофайл чтения главы'}
                </span>
                {detectedDurationSec > 0 && (
                  <span className="text-[14px] font-mono text-rose-400">
                    Длительность: {Math.floor(detectedDurationSec / 60)}:{String(detectedDurationSec % 60).padStart(2, '0')}
                  </span>
                )}
                <input
                  type="file"
                  accept="audio/*,.mp3,.m4a,.m4b,.wav,.ogg,.webm,.aac"
                  onChange={handleFilePicked}
                  className="hidden"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[14px]">
                <div>
                  <label className="block text-zinc-300 mb-1">Название дорожки:</label>
                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                  />
                </div>
                <div>
                  <label className="block text-zinc-300 mb-1">Чтец / автор озвучки:</label>
                  <input
                    type="text"
                    value={uploadNarrator}
                    onChange={(e) => setUploadNarrator(e.target.value)}
                    className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-4 text-[14px]">
                <label className="flex items-center gap-2 cursor-pointer text-zinc-200">
                  <input
                    type="checkbox"
                    checked={uploadPrimary}
                    onChange={(e) => setUploadPrimary(e.target.checked)}
                    className="accent-rose-600 w-4 h-4"
                  />
                  <span>Сделать основной для этой главы</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-zinc-200">
                  <input
                    type="checkbox"
                    checked={uploadTranscribe}
                    onChange={(e) => setUploadTranscribe(e.target.checked)}
                    className="accent-rose-600 w-4 h-4"
                  />
                  <span>Также распознать текст в главу (STT)</span>
                </label>
              </div>

              <div className="flex justify-end">
                <NoirButton
                  variant="primary"
                  disabled={!selectedFile}
                  loading={uploading}
                  onClick={handleUploadDeviceFile}
                  icon={<UploadCloud className="w-4 h-4 text-black" />}
                >
                  Загрузить в папку «Книга: «{book.title}»»
                </NoirButton>
              </div>
            </div>

            {/* Existing audio files in the book's cloud folder */}
            <div className="p-4 border border-zinc-800 bg-zinc-950/60 flex flex-col gap-3">
              <div className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                <span className="text-[14px] font-bold text-white flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-rose-500" />
                  <span>Аудиофайлы в облачной папке «Книга: «{book.title}»»</span>
                </span>
                {loadingFolderFiles && <Loader2 className="w-4 h-4 text-rose-500 animate-spin" />}
              </div>

              {folderAudioFiles.length === 0 ? (
                <p className="text-[14px] text-zinc-400">
                  В облачной папке этой книги пока нет сохранённых аудиофайлов. Запишите голос или загрузите файл выше.
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-52 overflow-y-auto">
                  {folderAudioFiles.map((f) => (
                    <div
                      key={f.id}
                      className="p-2.5 bg-black/70 border border-zinc-800 flex flex-wrap items-center justify-between gap-2 text-[14px]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white truncate">{f.name}</div>
                        <div className="font-mono text-zinc-400 text-[14px]">
                          {formatFileWeight(f.file_size)}
                        </div>
                      </div>
                      <NoirButton
                        variant="outline"
                        disabled={uploading}
                        onClick={() => handleAttachExisting(f)}
                        icon={<Check className="w-4 h-4 text-rose-500" />}
                      >
                        Прикрепить к главе
                      </NoirButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'tracks' && (
          <div className="flex flex-col gap-3">
            {chapterTracks.length === 0 ? (
              <div className="p-8 border border-zinc-800 bg-black/50 text-center flex flex-col items-center gap-3">
                <Headphones className="w-10 h-10 text-zinc-600" />
                <p className="text-[15px] font-bold text-white">К этой главе ещё не прикреплены аудиозаписи</p>
                <p className="text-[14px] text-zinc-400 max-w-md">
                  Запишите живое чтение с суфлёром или загрузите готовый файл — читатели смогут слушать его прямо в 3D-читалке.
                </p>
              </div>
            ) : (
              chapterTracks.map((t) => {
                const isEditing = editingTrackId === t.id;
                return (
                  <div
                    key={t.id}
                    className={`p-4 border bg-zinc-950/75 flex flex-col gap-3 ${
                      t.is_primary ? 'border-rose-500' : 'border-zinc-700'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {isEditing ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              type="text"
                              value={editTrackTitle}
                              onChange={(e) => setEditTrackTitle(e.target.value)}
                              className="min-h-[40px] px-2.5 noir-input text-[14px]"
                            />
                            <input
                              type="text"
                              value={editNarrator}
                              onChange={(e) => setEditNarrator(e.target.value)}
                              className="min-h-[40px] px-2.5 noir-input text-[14px]"
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[15px] font-bold text-white">{t.title}</span>
                              {t.is_primary && (
                                <span className="px-2 py-0.5 bg-rose-600 text-white text-[14px] font-bold">
                                  основная
                                </span>
                              )}
                            </div>
                            <div className="text-[14px] text-zinc-400 font-mono mt-0.5">
                              Чтец: {t.narrator_name} ·{' '}
                              {t.source_type === 'dictation_stt'
                                ? 'Диктовка + STT'
                                : t.source_type === 'uploaded_file'
                                ? 'Загруженный файл'
                                : 'Запись в студии'}
                              {t.file_size ? ` · ${formatFileWeight(t.file_size)}` : ''}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {isEditing ? (
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(t.id)}
                            className="min-h-[40px] px-3 bg-white text-black font-bold text-[14px] cursor-pointer rounded-none"
                          >
                            Сохранить
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTrackId(t.id);
                              setEditTrackTitle(t.title);
                              setEditNarrator(t.narrator_name);
                            }}
                            className="min-h-[40px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 text-[14px] flex items-center gap-1 cursor-pointer rounded-none"
                            title="Переименовать"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {!t.is_primary && (
                          <button
                            type="button"
                            onClick={() => handleMakePrimary(t.id)}
                            className="min-h-[40px] px-3 bg-zinc-900 border border-rose-500/70 hover:bg-rose-600 text-white text-[14px] font-bold flex items-center gap-1 cursor-pointer rounded-none"
                          >
                            <Star className="w-4 h-4 text-rose-400" />
                            <span>Сделать основной</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteTrack(t.id)}
                          className="min-h-[40px] px-2.5 bg-zinc-900 border border-zinc-700 hover:border-rose-500 text-zinc-400 hover:text-rose-400 text-[14px] flex items-center cursor-pointer rounded-none"
                          title="Удалить привязку дорожки"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <NoirAudioPlayer audioUrl={t.audio_url} label={t.title} />
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </NoirModal>
  );
};
