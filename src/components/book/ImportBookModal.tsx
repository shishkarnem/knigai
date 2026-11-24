import React, { useState, useEffect } from 'react';
import { UploadCloud, FileText, Image as ImageIcon, BookOpen, AlertCircle, Link as LinkIcon, HardDrive, X, Download, Coins, Sparkles } from 'lucide-react';
import { Book, Chapter, AppUser, ParsedChapter } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { RubikMarkerHeading } from '../landing/RubikMarkerHeading';
import { convertImportedFilesToBook } from '../../services/import/universalBookConverter';
import { parseUploadedFileToText } from '../../services/import/bookParser';
import { saveNewBook, saveChapter, updateBook, saveCharacter, saveWorldEntity } from '../../services/db/bookRepository';
import { saveBookToDeviceCache } from '../../services/storage/offlineCache';
import { FileUploadService } from '../../services/upload/FileUploadService';
import { syncBookAssetsToGalleryAndFolder } from '../../services/db/fileStorageRepository';
import { estimateBookImportVolume, formatLettersCount, lettersToRubles } from '../../services/billing/costCalculator';
import { getAuthoritativeBalance } from '../../services/billing/transactionService';
import { createNotification } from '../../services/billing/notificationService';
import { analyzeAndEnrichBookWithAi } from '../../services/import/bookImportAi';
import { INITIAL_LETTERS_BALANCE } from '../../services/auth/authService';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';

interface ImportBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  onBookImported: (book: Book, chapters: Chapter[]) => void;
}

const POPULAR_GENRES = [
  'Фэнтези',
  'Детектив нуар',
  'Киберпанк',
  'Фантастика',
  'Графический роман',
  'Приключения',
  'Романтическая проза',
  'Исторический роман',
  'Триллер',
];

export const ImportBookModal: React.FC<ImportBookModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onBookImported,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'url'>('file');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [directUrl, setDirectUrl] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState(currentUser?.name || 'Автор KnigAI');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('Фэнтези');
  const [customGenre, setCustomGenre] = useState('');
  const [isPublished, setIsPublished] = useState(true);
  const [cacheLocally, setCacheLocally] = useState(true);
  const [runAiAnalysis, setRunAiAnalysis] = useState(true);
  const [parsedTextPreview, setParsedTextPreview] = useState('');
  const [liveBalance, setLiveBalance] = useState<number>(currentUser?.letters_balance ?? INITIAL_LETTERS_BALANCE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (currentUser?.uid) {
      getAuthoritativeBalance(currentUser.uid)
        .then(setLiveBalance)
        .catch(() => setLiveBalance(currentUser.letters_balance ?? INITIAL_LETTERS_BALANCE));
    }
  }, [isOpen, currentUser?.uid, currentUser?.letters_balance]);

  const volumeEstimate = parsedTextPreview
    ? estimateBookImportVolume(parsedTextPreview, runAiAnalysis)
    : null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const fileList = Array.from(files);
    setSelectedFiles(fileList);
    setErrorMessage(null);

    const firstFile = fileList[0];
    const cleanName = firstFile.name.replace(/\.[^/.]+$/, '').trim();
    if (!title) {
      setTitle(cleanName);
    }

    // Auto-detect genre & type
    const isAudio = fileList.every((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['mp3', 'm4b', 'm4a', 'aac', 'ogg', 'wav', 'flac'].includes(ext || '');
    });
    const isComic = fileList.every((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      return ['cbz', 'cbr', 'png', 'jpg', 'jpeg', 'webp'].includes(ext || '');
    });

    if (isAudio) {
      setGenre('Аудиокнига');
    } else if (isComic) {
      setGenre('Манга / Комикс');
    }

    // Automatically inspect text volume & metadata across uploaded files
    Promise.all(
      fileList
        .filter((f) => !/\.(mp3|m4b|m4a|aac|ogg|wav|flac|png|jpe?g|webp|cbz|cbr)$/i.test(f.name))
        .slice(0, 12)
        .map((f) => parseUploadedFileToText(f).catch(() => null))
    )
      .then((results) => {
        const valid = results.filter((r): r is NonNullable<typeof r> => Boolean(r));
        const combinedText = valid.map((r) => r.text || '').join('\n\n');
        setParsedTextPreview(combinedText);

        const firstParsed = valid[0];
        if (firstParsed) {
          if (firstParsed.detectedTitle && firstParsed.detectedTitle.trim()) {
            setTitle(firstParsed.detectedTitle.trim());
          }
          if (firstParsed.detectedAuthor && firstParsed.detectedAuthor.trim()) {
            setAuthor(firstParsed.detectedAuthor.trim());
          }
          if (firstParsed.detectedDescription && firstParsed.detectedDescription.trim()) {
            setDescription(firstParsed.detectedDescription.trim());
          }
          if (firstParsed.detectedGenre && firstParsed.detectedGenre.trim()) {
            const match = POPULAR_GENRES.find((g) =>
              g.toLowerCase().includes(firstParsed.detectedGenre!.toLowerCase())
            );
            if (match) {
              setGenre(match);
            } else {
              setCustomGenre(firstParsed.detectedGenre.trim());
            }
          }
        }
      })
      .catch((err) => {
        console.warn('Metadata autodetection notice:', err);
      });
  };

  const handleRemoveFile = (index: number) => {
    const updated = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(updated);
    if (updated.length === 0) {
      setParsedTextPreview('');
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      // 1. Direct URL download & import mode
      if (activeTab === 'url') {
        const cleanUrl = directUrl.trim();
        if (!cleanUrl) {
          setErrorMessage('Введите прямую ссылку на скачивание книги (FB2, TXT, EPUB, RTF, HTML, MOBI, ZIP)');
          setIsProcessing(false);
          return;
        }

        setProcessingStatus('Скачивание и анализ произведения с удаленного сервера...');
        const res = await fetch('/api/parser/import-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: cleanUrl,
            user_uid: currentUser?.uid,
            title: title.trim() || undefined,
            author: author.trim() || undefined,
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Не удалось загрузить книгу по ссылке (${res.status})`);
        }

        const data = await res.json();
        const savedBook: Book = data.book;
        const savedChapters: Chapter[] = data.chapters || [];

        // Save to offline cache if selected
        if (cacheLocally) {
          setProcessingStatus('Сохранение в локальный кэш устройства...');
          await saveBookToDeviceCache(savedBook, savedChapters);
        }

        onBookImported(savedBook, savedChapters);
        onClose();
        return;
      }

      // 2. Local file import mode
      if (selectedFiles.length === 0) {
        setErrorMessage('Пожалуйста, выберите файл(ы) книги для импорта');
        setIsProcessing(false);
        return;
      }

      if (runAiAnalysis && volumeEstimate && volumeEstimate.aiLettersCost > 0 && currentUser?.uid) {
        if (liveBalance < volumeEstimate.aiLettersCost) {
          setErrorMessage(
            `Недостаточно букв для ИИ-разбора книги. Требуется ≈ ${formatLettersCount(volumeEstimate.aiLettersCost)} букв, доступно: ${formatLettersCount(liveBalance)}. Отключите ИИ-анализ или пополните баланс.`
          );
          setIsProcessing(false);
          return;
        }
      }

      const finalGenre = customGenre.trim() || genre;
      const finalAuthor = author.trim() || currentUser?.name || 'Автор KnigAI';
      const finalTitle = title.trim() || selectedFiles[0].name.replace(/\.[^/.]+$/, '');

      setProcessingStatus('Загрузка исходного файла в защищенное хранилище...');
      let originalFileUrl: string | undefined;
      let fileStorageId: number | undefined;

      try {
        const uploadService = new FileUploadService();
        const fileRecord = await uploadService.uploadFileAndRegister(selectedFiles[0], null, false, {
          title: finalTitle,
          author: finalAuthor,
          description: description.trim(),
        });
        originalFileUrl = fileRecord.original_url;
        fileStorageId = fileRecord.id;
      } catch (uploadErr) {
        console.warn('Notice: filestore upload notice:', uploadErr);
      }

      setProcessingStatus('Разметка глав и структуры страниц...');
      const converted = await convertImportedFilesToBook(selectedFiles, {
        title: finalTitle,
        author: finalAuthor,
        description: description.trim(),
        genre: finalGenre,
        userUid: currentUser?.uid,
        isPublished,
        originalFileUrl,
        fileStorageId,
      });

      setProcessingStatus('Сохранение произведения в базу данных...');
      const savedBook = await saveNewBook(converted.book, currentUser?.uid);

      const savedChapters: Chapter[] = [];
      for (const chap of converted.chapters) {
        const savedChap = await saveChapter(
          {
            ...chap,
            book_id: savedBook.id,
          },
          undefined,
          currentUser?.uid
        );
        savedChapters.push(savedChap);
      }

      setProcessingStatus('Синхронизация иллюстраций и создание папки книги в галерее...');
      const synced = await syncBookAssetsToGalleryAndFolder(savedBook, savedChapters, currentUser?.uid);
      let finalBook = synced.updatedBook;
      let finalChapters = synced.updatedChapters;

      // Optional AI analysis of synopses & lore with real billing & centered waiting overlay
      if (runAiAnalysis && finalChapters.length > 0 && parsedTextPreview.trim().length > 80) {
        try {
          const parsedChaps: ParsedChapter[] = finalChapters.map((c) => ({
            chapterNumber: c.chapter_number,
            title: c.title,
            content: c.content || '',
            wordCount: (c.content || '').split(/\s+/).filter(Boolean).length,
          }));
          await runWithGenerationOverlay(
            {
              title: `ИИ-разбор импорта «${finalTitle}»`,
              subtitle: `Глав в книге: ${finalChapters.length}`,
              initialStatus: 'Книга сохранена в БД. ИИ анализирует сюжет, персонажей и синопсисы...',
              totalSteps: 1,
              estimatedLetters: volumeEstimate?.aiLettersCost || 0,
            },
            async (ctx) => {
              ctx.addApplied(`Книга и главы (${finalChapters.length} шт.) сохранены в БД`);
              const aiRes = await analyzeAndEnrichBookWithAi(finalTitle, parsedChaps, {
                userUid: currentUser?.uid,
                bookId: finalBook.id,
                onProgress: (m) => {
                  setProcessingStatus(m);
                  ctx.setStatus(m);
                },
              });
              finalBook = {
                ...finalBook,
                synopsis_overview: aiRes.synopsis_overview || finalBook.synopsis_overview,
                genres: aiRes.genres.length > 0 ? aiRes.genres.slice(0, 5) : finalBook.genres,
                genre_weights: aiRes.genre_weights || finalBook.genre_weights,
                style_config: aiRes.style_config || finalBook.style_config,
                basic_plots: aiRes.basic_plots.length > 0 ? aiRes.basic_plots.slice(0, 3) : finalBook.basic_plots,
              };
              await updateBook(finalBook);

              const synopsisMap = new Map(aiRes.chaptersWithSynopses.map((c) => [c.chapterNumber, c.synopsis || '']));
              finalChapters = await Promise.all(
                finalChapters.map(async (c) => {
                  const syn = synopsisMap.get(c.chapter_number);
                  if (syn) {
                    const updatedC = { ...c, synopsis: syn };
                    await saveChapter(updatedC, updatedC.id, currentUser?.uid);
                    return updatedC;
                  }
                  return c;
                })
              );

              for (const ch of aiRes.characters) {
                await saveCharacter(
                  {
                    book_id: finalBook.id,
                    name: ch.name,
                    role: 'второстепенный',
                    description: ch.description || '',
                    visual_card_url: '',
                    visual_prompt: '',
                    traits: [],
                  },
                  undefined,
                  currentUser?.uid
                );
              }

              for (const we of aiRes.world_entities) {
                await saveWorldEntity(
                  {
                    book_id: finalBook.id,
                    entity_type: we.entity_type,
                    name: we.name,
                    subtitle_or_role: we.entity_type,
                    description: we.description || '',
                    attributes: {},
                    visual_prompt: '',
                    image_url: '',
                  },
                  undefined,
                  currentUser?.uid
                );
              }
              ctx.addApplied(`Персонажи (${aiRes.characters.length}) и сущности лора (${aiRes.world_entities.length}) сохранены`);
              ctx.setProgress(1, 1);
              return aiRes;
            }
          );
        } catch (aiErr) {
          console.warn('Optional AI enrichment notice on import:', aiErr);
        }
      }

      if (currentUser?.uid) {
        await createNotification({
          userUid: currentUser.uid,
          type: 'import',
          title: `Импортирована книга «${finalBook.title}»`,
          message: `Загружено глав: ${finalChapters.length}. Все файлы сохранены в папку книги и готовы к чтению.`,
          link: 'library',
        });
      }

      if (cacheLocally) {
        setProcessingStatus('Сохранение в локальный кэш устройства...');
        await saveBookToDeviceCache(finalBook, finalChapters);
      }

      onBookImported(finalBook, finalChapters);
      onClose();
    } catch (err: unknown) {
      console.error('Import error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Произошла ошибка при конвертации книги');
    } finally {
      setIsProcessing(false);
      setProcessingStatus('');
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Добавить книгу в общую библиотеку"
      maxWidth="max-w-2xl"
    >
      <form onSubmit={handleImport} className="flex flex-col gap-5 text-white font-serif">
        <div className="flex flex-col gap-1 pb-3 border-b border-zinc-800">
          <div className="inline-flex items-center gap-2 text-rose-500 font-mono text-[14px]">
            <UploadCloud className="w-4 h-4" />
            <span>Конвертация в формат читалки</span>
          </div>
          <RubikMarkerHeading
            as="h3"
            text="Импорт книги, комикса (CBR/CBZ) или аудиокниги"
            className="text-[20px] sm:text-[24px] leading-tight"
          />
          <p className="text-[14px] text-zinc-300 leading-relaxed">
            Поддерживаются все форматы: FB2, TXT, EPUB, RTF, HTML, MOBI, AZW, PDF, комиксы CBR/CBZ, архивы ZIP, а также аудиокниги MP3, M4B, AAC, FLAC.
          </p>
        </div>

        {/* Tab Selector */}
        <div className="flex border border-zinc-800 bg-zinc-950/80">
          <button
            type="button"
            onClick={() => setActiveTab('file')}
            className={`flex-1 py-2.5 px-4 text-[14px] font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'file'
                ? 'bg-white text-black border-r border-zinc-800 font-bold'
                : 'text-zinc-400 hover:text-white border-r border-zinc-800'
            }`}
          >
            <UploadCloud className="w-4 h-4 text-rose-500" />
            <span>Файл с устройства</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-2.5 px-4 text-[14px] font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              activeTab === 'url'
                ? 'bg-white text-black font-bold'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <LinkIcon className="w-4 h-4 text-rose-500" />
            <span>Скачать по ссылке / URL</span>
          </button>
        </div>

        {/* Tab 1: File Drop Area */}
        {activeTab === 'file' && (
          <div className="flex flex-col gap-2">
            <label className="text-[14px] font-bold text-white flex items-center justify-between">
              <span>Выберите файл или файлы для загрузки:</span>
              <span className="text-zinc-400 font-mono text-[14px]">До 100 МБ</span>
            </label>

            <label
              htmlFor="import-book-file"
              className="border-2 border-dashed border-zinc-700 hover:border-white p-5 text-center flex flex-col items-center justify-center gap-2.5 bg-zinc-950/70 transition-colors cursor-pointer group"
            >
              <div className="p-3 bg-zinc-900 border border-zinc-800 text-rose-500 group-hover:text-white transition-colors">
                <UploadCloud className="w-6 h-6" />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-bold text-white group-hover:underline">
                  Нажмите для выбора файла или перетащите его сюда
                </span>
                <span className="text-[14px] text-zinc-400">
                  Книги: FB2, TXT, EPUB, RTF, HTML, MOBI, PDF, ZIP · Комиксы: CBZ, CBR · Аудио: MP3, M4B, AAC, FLAC
                </span>
              </div>
              <input
                id="import-book-file"
                type="file"
                accept=".png,.jpg,.jpeg,.webp,.cbz,.cbr,.epub,.fb2,.mobi,.azw,.azw3,.pdf,.txt,.doc,.docx,.rtf,.html,.htm,.zip,.mp3,.m4b,.m4a,.aac,.ogg,.wav,.flac"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="p-3 bg-zinc-900/80 border border-zinc-800 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[14px] text-zinc-300 font-mono">
                  <span>Выбрано файлов: {selectedFiles.length}</span>
                  <span>
                    Общий размер: {(selectedFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(2)} МБ
                  </span>
                </div>
                <div className="max-h-28 overflow-y-auto flex flex-col gap-1.5 pr-1">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 p-1.5 bg-black/60 border border-zinc-800 text-[14px]"
                    >
                      <div className="flex items-center gap-2 truncate">
                        {file.name.match(/\.(png|jpe?g|webp)$/i) ? (
                          <ImageIcon className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                        )}
                        <span className="truncate text-white">{file.name}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(idx)}
                        className="p-1 hover:text-rose-400 text-zinc-400 cursor-pointer shrink-0"
                        title="Удалить файл"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Live Volume & AI Cost Calculator */}
            {volumeEstimate && volumeEstimate.charCount > 0 && (
              <div className="p-3.5 bg-zinc-950 border border-zinc-700 flex flex-col gap-2.5 text-[14px]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-2">
                  <div className="flex items-center gap-2 font-bold text-white">
                    <Coins className="w-4 h-4 text-rose-500" />
                    <span>Предварительный расчет объема и стоимости:</span>
                  </div>
                  {currentUser && (
                    <span
                      className={`px-2 py-0.5 text-[14px] font-mono font-bold border ${
                        !runAiAnalysis || liveBalance >= volumeEstimate.aiLettersCost
                          ? 'bg-zinc-900 text-white border-white'
                          : 'bg-rose-950 text-rose-300 border-rose-500'
                      }`}
                    >
                      {!runAiAnalysis
                        ? 'ИИ-разбор отключен (0 букв)'
                        : liveBalance >= volumeEstimate.aiLettersCost
                        ? 'Хватает средств на балансе'
                        : 'Недостаточно букв на балансе'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[14px]">
                  <div>
                    <span className="text-zinc-400 block">Символов:</span>
                    <strong className="text-white">{formatLettersCount(volumeEstimate.charCount)}</strong>
                    <span className="text-zinc-500 block">без пробелов: {formatLettersCount(volumeEstimate.nonSpaceCharCount)}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Слов / глав:</span>
                    <strong className="text-white">{formatLettersCount(volumeEstimate.wordCount)}</strong>
                    <span className="text-zinc-500 block">≈ {volumeEstimate.estimatedChapters} глав</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Стоимость ИИ:</span>
                    <strong className="text-rose-400">
                      {runAiAnalysis ? `${formatLettersCount(volumeEstimate.aiLettersCost)} букв` : '0 букв'}
                    </strong>
                    <span className="text-zinc-400 block">
                      {runAiAnalysis ? `≈ ${volumeEstimate.aiRublesCost} ₽` : 'без затрат ИИ'}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block">Ваш баланс:</span>
                    <strong className="text-white">{formatLettersCount(liveBalance)} букв</strong>
                    <span className="text-zinc-500 block">≈ {lettersToRubles(liveBalance)} ₽</span>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 pt-2 border-t border-zinc-800 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={runAiAnalysis}
                    onChange={(e) => setRunAiAnalysis(e.target.checked)}
                    className="w-4 h-4 mt-1 accent-rose-600 rounded-none cursor-pointer shrink-0"
                  />
                  <span className="text-[14px] text-zinc-200 leading-snug">
                    <strong className="text-white inline-flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                      Запустить ИИ-анализ при импорте
                    </strong>{' '}
                    (автосинопсисы глав, персонажи, локации, артефакты и законы мира)
                  </span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: URL Input Area */}
        {activeTab === 'url' && (
          <div className="flex flex-col gap-2 p-4 bg-zinc-950/80 border border-zinc-800">
            <label className="text-[14px] font-bold text-white flex items-center gap-2">
              <LinkIcon className="w-4 h-4 text-rose-500" />
              <span>Прямая ссылка на скачивание книги:</span>
            </label>
            <input
              type="url"
              value={directUrl}
              onChange={(e) => setDirectUrl(e.target.value)}
              placeholder="https://www.rulit.me/download-books-17438.html?t=fb2 (или txt, epub, mobi, rtf, html, zip)"
              className="min-h-[44px] px-3.5 noir-input text-[14px] font-mono text-zinc-200"
            />
            <p className="text-[14px] text-zinc-400">
              Сервер KnigAI скачает книгу, распакует архив (ZIP/FB2/EPUB), выделит все реальные главы и обложку, а также сохранит исходный файл в защищенное хранилище.
            </p>
          </div>
        )}

        {/* Metadata Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-white">
              Название книги: {activeTab === 'file' && <span className="text-rose-500">*</span>}
            </label>
            <NoirVoiceInput
              value={title}
              onValueChange={setTitle}
              voiceContext="import_book_title"
              placeholder={activeTab === 'url' ? 'Определится автоматически или введите свое' : 'Введите название произведения'}
              required={activeTab === 'file'}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-white">
              Автор (псевдоним):
            </label>
            <NoirVoiceInput
              value={author}
              onValueChange={setAuthor}
              voiceContext="import_book_author"
              placeholder="Имя или псевдоним автора"
            />
          </div>
        </div>

        {/* Description / Annotation input */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-bold text-white flex flex-wrap items-center justify-between gap-2">
            <span>Аннотация / описание книги:</span>
            <span className="text-zinc-400 font-normal text-[14px]">Определяется автоматически из файла</span>
          </label>
          <NoirVoiceTextarea
            value={description}
            onValueChange={setDescription}
            voiceContext="import_book_description"
            minRows={3}
            placeholder="Краткое описание сюжета произведения, аннотация или синопсис..."
          />
        </div>

        {/* Genre Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-[14px] font-bold text-white">
            Жанр произведения:
          </label>
          <div className="flex flex-wrap gap-1.5">
            {POPULAR_GENRES.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGenre(g);
                  setCustomGenre('');
                }}
                className={`px-3 py-1.5 text-[14px] border transition cursor-pointer ${
                  genre === g && !customGenre
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-zinc-950/80 text-zinc-300 border-zinc-800 hover:border-zinc-500'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <NoirVoiceInput
            value={customGenre}
            onValueChange={setCustomGenre}
            voiceContext="import_book_custom_genre"
            placeholder="Или введите свой оригинальный жанр"
            containerClassName="mt-1"
          />
        </div>

        {/* Publication & Offline Cache Toggles */}
        <div className="p-3.5 bg-zinc-950/80 border border-zinc-800 flex flex-col gap-3">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 accent-rose-600 rounded-none cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-white">
                Опубликовать в общей библиотеке
              </span>
              <span className="text-[14px] text-zinc-400">
                Книга станет доступна всем пользователям и гостям для онлайн-чтения и скачивания в кэш.
              </span>
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer select-none border-t border-zinc-900 pt-2.5">
            <input
              type="checkbox"
              checked={cacheLocally}
              onChange={(e) => setCacheLocally(e.target.checked)}
              className="w-4 h-4 accent-rose-600 rounded-none cursor-pointer"
            />
            <div className="flex flex-col">
              <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-rose-500" />
                <span>Сохранить в локальный кэш устройства для офлайн-чтения</span>
              </span>
              <span className="text-[14px] text-zinc-400">
                Книга будет моментально доступна с этого устройства даже без доступа в интернет.
              </span>
            </div>
          </label>
        </div>

        {/* Error Notification */}
        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Processing Indicator */}
        {isProcessing && processingStatus && (
          <div className="p-3 bg-zinc-900/90 border border-rose-500/50 text-zinc-200 text-[14px] flex items-center gap-2.5 animate-pulse">
            <Download className="w-4 h-4 text-rose-500 animate-bounce" />
            <span>{processingStatus}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
          <NoirButton
            type="button"
            variant="subtle"
            onClick={onClose}
            disabled={isProcessing}
          >
            Отмена
          </NoirButton>

          <NoirButton
            type="submit"
            variant="primary"
            loading={isProcessing}
            icon={<BookOpen className="w-4 h-4 text-black" />}
            className="text-[15px] font-bold bg-white text-black hover:bg-zinc-200 border-2 border-white"
          >
            {isProcessing ? 'Обработка и сохранение...' : (activeTab === 'url' ? 'Скачать и открыть в читалке' : 'Импортировать в библиотеку')}
          </NoirButton>
        </div>
      </form>
    </NoirModal>
  );
};
