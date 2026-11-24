import React, { useId, useMemo, useState } from 'react';
import { Image as ImageIcon, ImagePlus, Sparkles, Upload, Check } from 'lucide-react';
import { Book, Chapter, Character, WorldEntity } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirStatus } from '../common/NoirStatus';
import { GalleryPickerModal } from '../gallery/GalleryPickerModal';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { uploadBlobToCloudWithProgress } from '../../services/storage/clipboardImageUpload';
import { orchestrateChapterIllustration } from '../../services/ai/orchestrator';
import { runWithGenerationOverlay } from '../../services/ai/session/generationSession';
import { estimateImageGenerationLetters, formatLettersCount } from '../../services/billing/costCalculator';
import {
  extractMarkdownImages,
  InlineImageMode,
  insertSnippetAtParagraphIndex,
  ParsedMarkdownImageBlock,
  serializeMarkdownImage,
} from './writerUtils';
import {
  GRADIENT_DIRECTION_OPTIONS,
  ILLUSTRATION_MODES_META,
} from '../reader/hooks/pageIllustrationParser';

interface WriterImageToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapter: Chapter;
  content: string;
  selectedExcerpt: string;
  worldEntities: WorldEntity[];
  characters: Character[];
  userUid?: number;
  onInsertMarkdown: (markdownSnippet: string) => void;
  onUpdateWholeContent: (nextContent: string) => void;
  onTriggerClipboardImagePaste: () => void;
}

export const WriterImageToolsModal: React.FC<WriterImageToolsModalProps> = ({
  isOpen,
  onClose,
  book,
  chapter,
  content,
  selectedExcerpt,
  worldEntities,
  characters,
  userUid,
  onInsertMarkdown,
  onUpdateWholeContent,
  onTriggerClipboardImagePaste,
}) => {
  const fileId = useId();
  const [section, setSection] = useState<'insert' | 'ai' | 'manage'>('insert');
  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [imgLayout, setImgLayout] = useState<InlineImageMode>('full');
  const [imgScale, setImgScale] = useState(85);
  const [imgOpacity, setImgOpacity] = useState(40);
  const [gradDir, setGradDir] = useState<'bottom' | 'top' | 'left' | 'right'>('bottom');
  const [insertPos, setInsertPos] = useState<string>('cursor');
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const [aiScenePrompt, setAiScenePrompt] = useState(
    selectedExcerpt.trim()
      ? `Иллюстрация сцены в стиле нуар: ${selectedExcerpt.trim().slice(0, 380)}`
      : `Атмосферный момент главы «${chapter.title}»: ${chapter.synopsis || ''}`
  );
  const [aspectRatio, setAspectRatio] = useState<'3:4' | '1:1' | '16:9'>('3:4');
  const [generatingAi, setGeneratingAi] = useState(false);

  const existingImages = useMemo(() => extractMarkdownImages(content), [content]);
  const paragraphs = useMemo(
    () =>
      content
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean),
    [content]
  );

  const buildSerializedSnippet = (url: string, altText: string) =>
    serializeMarkdownImage({
      alt: altText,
      url,
      layout: imgLayout,
      scale: imgScale,
      bgOpacity: imgLayout === 'page-bg' || imgLayout === 'gradient-blend' ? imgOpacity : undefined,
      gradientDirection: imgLayout === 'gradient-blend' ? gradDir : undefined,
    });

  const applySnippetToContent = (snippet: string) => {
    if (insertPos === 'cursor') {
      onInsertMarkdown(`\n\n${snippet}\n\n`);
    } else {
      const idx = parseInt(insertPos, 10);
      const next = insertSnippetAtParagraphIndex(content, snippet, Number.isNaN(idx) ? 99999 : idx);
      onUpdateWholeContent(next);
    }
    onClose();
  };

  const handleUploadFromDevice = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg('');
    setUploadPct(10);
    try {
      const uploaded = await uploadBlobToCloudWithProgress({
        blob: file,
        filename: file.name,
        userUid,
        folderName: `Иллюстрации: ${book.title}`,
        caption: `Иллюстрация для гл. #${chapter.chapter_number}`,
        onProgress: (pct) => setUploadPct(pct),
      });
      setImgUrl(uploaded.url);
      if (!imgAlt) setImgAlt(file.name.replace(/\.[^/.]+$/, ''));
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    } finally {
      setUploadPct(null);
      e.target.value = '';
    }
  };

  const handleGenerateAiArt = async () => {
    if (!aiScenePrompt.trim()) return;
    setGeneratingAi(true);
    setErrorMsg('');
    try {
      const outcome = await runWithGenerationOverlay(
        {
          title: 'Иллюстрация сцены по тексту',
          subtitle: `Глава #${chapter.chapter_number} • «${book.title}»`,
          initialStatus: 'Художник-ИИ рисует иллюстрацию сцены...',
          totalSteps: 1,
          estimatedLetters: estimateImageGenerationLetters(aiScenePrompt.length),
        },
        async (ctx) => {
          const res = await orchestrateChapterIllustration({
            book,
            chapter,
            sceneDescription: aiScenePrompt.trim(),
            aspectRatio,
            worldEntities,
            characters,
            userUid,
            onProgress: ctx.setStatus,
          });
          ctx.addApplied('Иллюстрация создана и добавлена в галерею');
          ctx.setProgress(1, 1);
          return res;
        }
      );
      if (outcome.result?.url) {
        applySnippetToContent(buildSerializedSnippet(outcome.result.url, imgAlt || 'Сцена главы'));
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка генерации иллюстрации');
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleInsertManual = () => {
    if (!imgUrl.trim()) return;
    applySnippetToContent(buildSerializedSnippet(imgUrl.trim(), imgAlt || 'Иллюстрация'));
  };

  const updateExistingImage = (
    block: ParsedMarkdownImageBlock,
    patch: Partial<{
      layout: InlineImageMode;
      scale: number;
      bgOpacity: number;
      gradientDirection: 'bottom' | 'top' | 'left' | 'right';
    }>
  ) => {
    const nextLayout = patch.layout ?? block.layout;
    const replacement = serializeMarkdownImage({
      alt: block.alt,
      url: block.url,
      layout: nextLayout,
      scale: patch.scale ?? block.scale,
      bgOpacity:
        nextLayout === 'page-bg' || nextLayout === 'gradient-blend'
          ? patch.bgOpacity ?? block.bgOpacity
          : undefined,
      gradientDirection:
        nextLayout === 'gradient-blend'
          ? patch.gradientDirection ?? block.gradientDirection
          : undefined,
      offsetX: block.offsetX,
      offsetY: block.offsetY,
    });
    onUpdateWholeContent(content.slice(0, block.startIndex) + replacement + content.slice(block.endIndex));
  };

  const renderLayoutConfigFields = () => (
    <div className="p-3 bg-zinc-950/90 border border-zinc-800 flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Макет размещения на странице (9 вариантов):
          </label>
          <select
            value={imgLayout}
            onChange={(e) => setImgLayout(e.target.value as InlineImageMode)}
            className="w-full min-h-[44px] px-3 noir-input text-[14px]"
          >
            {ILLUSTRATION_MODES_META.map((m) => {
              const val = m.mode === 'full-width' ? 'full' : (m.mode as InlineImageMode);
              return (
                <option key={m.mode} value={val}>
                  {m.label}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Масштаб ширины ({imgScale}%):
          </label>
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={imgScale}
            onChange={(e) => setImgScale(Number(e.target.value))}
            className="w-full accent-rose-500 cursor-pointer mt-3"
          />
        </div>
      </div>

      {(imgLayout === 'page-bg' || imgLayout === 'gradient-blend') && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">
              Прозрачность арта ({imgOpacity}%):
            </label>
            <input
              type="range"
              min={15}
              max={95}
              step={5}
              value={imgOpacity}
              onChange={(e) => setImgOpacity(Number(e.target.value))}
              className="w-full accent-rose-500 cursor-pointer mt-2"
            />
          </div>

          {imgLayout === 'gradient-blend' && (
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Направление градиента:
              </label>
              <select
                value={gradDir}
                onChange={(e) => setGradDir(e.target.value as 'bottom' | 'top' | 'left' | 'right')}
                className="w-full min-h-[42px] px-3 noir-input text-[14px]"
              >
                {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
                  <option key={opt.dir} value={opt.dir}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-[14px] font-bold text-white mb-1">
          Куда вставить в текст главы:
        </label>
        <select
          value={insertPos}
          onChange={(e) => setInsertPos(e.target.value)}
          className="w-full min-h-[44px] px-3 noir-input text-[14px]"
        >
          <option value="cursor">На место текущего курсора</option>
          <option value="-1">Перед первым абзацем (в начало главы)</option>
          {paragraphs.map((p, idx) => (
            <option key={idx} value={String(idx)}>
              После абзаца #{idx + 1}: «{p.replace(/!\[.*?\]\(.*?\)/g, '[иллюстрация]').slice(0, 48)}...»
            </option>
          ))}
          <option value="99999">В самый конец главы</option>
        </select>
      </div>
    </div>
  );

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Картинки и иллюстрации в тексте главы"
      maxWidth="max-w-3xl"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSection('insert')}
            className={`min-h-[40px] px-3.5 text-[14px] font-bold border cursor-pointer ${
              section === 'insert'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            Вставить файл / из буфера / галерею
          </button>
          <button
            type="button"
            onClick={() => setSection('ai')}
            className={`min-h-[40px] px-3.5 text-[14px] font-bold border cursor-pointer flex items-center gap-1.5 ${
              section === 'ai'
                ? 'bg-rose-600 text-white border-rose-500'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-rose-500'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Создать арт ИИ по сцене</span>
          </button>
          <button
            type="button"
            onClick={() => setSection('manage')}
            className={`min-h-[40px] px-3.5 text-[14px] font-bold border cursor-pointer ${
              section === 'manage'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-950 text-zinc-300 border-zinc-700 hover:border-white'
            }`}
          >
            Картинки в тексте ({existingImages.length})
          </button>
        </div>

        {errorMsg && <NoirStatus type="error" message={errorMsg} />}

        {section === 'insert' && (
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsGalleryOpen(true)}
                className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 text-[14px] font-bold flex items-center gap-2 cursor-pointer"
              >
                <ImageIcon className="w-4 h-4 text-rose-500" />
                <span>Из медиа-галереи</span>
              </button>

              <label
                htmlFor={`writer-upload-${fileId}`}
                className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 text-[14px] font-bold flex items-center gap-2 cursor-pointer"
              >
                <Upload className="w-4 h-4 text-rose-500" />
                <span>Загрузить с устройства</span>
              </label>
              <input
                id={`writer-upload-${fileId}`}
                type="file"
                accept="image/*"
                onChange={handleUploadFromDevice}
                className="hidden"
              />

              <button
                type="button"
                onClick={() => {
                  onClose();
                  onTriggerClipboardImagePaste();
                }}
                className="min-h-[44px] px-3.5 bg-rose-950/70 hover:bg-rose-600 text-white border border-rose-500 text-[14px] font-bold flex items-center gap-2 cursor-pointer"
              >
                <ImagePlus className="w-4 h-4" />
                <span>Вставить из буфера обмена (в облако)</span>
              </button>
            </div>

            {uploadPct !== null && (
              <div className="p-2.5 bg-zinc-950 border border-rose-500">
                <div className="flex justify-between text-[14px] mb-1">
                  <span>Загрузка изображения на сервер...</span>
                  <span className="font-mono text-rose-400">{uploadPct}%</span>
                </div>
                <div className="w-full h-1.5 bg-zinc-900">
                  <div className="h-full bg-rose-600 transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
              </div>
            )}

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Прямая ссылка на изображение:
              </label>
              <input
                type="text"
                value={imgUrl}
                onChange={(e) => setImgUrl(e.target.value)}
                placeholder="https://..."
                className="w-full min-h-[44px] px-3 noir-input text-[14px]"
              />
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Подпись / титр под иллюстрацией:
              </label>
              <NoirVoiceInput
                value={imgAlt}
                onValueChange={setImgAlt}
                voiceContext="writer_img_alt"
                placeholder="Встреча под дождём у старого моста..."
              />
            </div>

            {renderLayoutConfigFields()}

            {imgUrl && (
              <div className="p-2 border border-zinc-700 bg-zinc-950 flex justify-center max-h-44 overflow-hidden">
                <img src={imgUrl} alt="Предпросмотр" className="max-h-40 object-contain" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={onClose}>
                Отмена
              </NoirButton>
              <NoirButton
                variant="primary"
                disabled={!imgUrl.trim()}
                onClick={handleInsertManual}
                icon={<Check className="w-4 h-4 text-black" />}
              >
                Вставить в главу
              </NoirButton>
            </div>
          </div>
        )}

        {section === 'ai' && (
          <div className="flex flex-col gap-3.5">
            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Описание сцены для иллюстрации ИИ (по умолчанию взято из выделенного текста):
              </label>
              <NoirVoiceTextarea
                value={aiScenePrompt}
                onValueChange={setAiScenePrompt}
                voiceContext="writer_ai_scene_prompt"
                minRows={4}
                maxRows={8}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">Формат кадра:</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as '3:4' | '1:1' | '16:9')}
                  className="w-full min-h-[44px] px-3 noir-input text-[14px]"
                >
                  <option value="3:4">3:4 (Книжный А5)</option>
                  <option value="1:1">1:1 (Квадрат)</option>
                  <option value="16:9">16:9 (Широкая сцена)</option>
                </select>
              </div>
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">Подпись в тексте:</label>
                <NoirVoiceInput
                  value={imgAlt}
                  onValueChange={setImgAlt}
                  voiceContext="writer_ai_img_alt"
                  placeholder="Ключевая сцена главы..."
                />
              </div>
            </div>

            {renderLayoutConfigFields()}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800">
              <span className="text-[14px] text-zinc-400 font-mono">
                ≈ {formatLettersCount(estimateImageGenerationLetters(aiScenePrompt.length))} букв
              </span>
              <NoirButton
                variant="primary"
                loading={generatingAi}
                onClick={handleGenerateAiArt}
                icon={<Sparkles className="w-4 h-4 text-black" />}
              >
                Создать арт и вставить в текст
              </NoirButton>
            </div>
          </div>
        )}

        {section === 'manage' && (
          <div className="flex flex-col gap-3 max-h-[55vh] overflow-y-auto pr-1">
            {existingImages.length === 0 ? (
              <p className="text-[14px] text-zinc-400 p-4 border border-zinc-800 text-center">
                В тексте этой главы пока нет встроенных Markdown-иллюстраций.
              </p>
            ) : (
              existingImages.map((block, i) => (
                <div
                  key={`${block.url}-${i}`}
                  className="p-3 bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row gap-3 items-start"
                >
                  <img
                    src={block.url}
                    alt={block.alt}
                    className="w-20 h-20 object-cover border border-zinc-700 shrink-0"
                  />
                  <div className="min-w-0 flex-1 flex flex-col gap-2 w-full">
                    <strong className="text-[14px] text-white truncate">{block.alt}</strong>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={block.layout}
                        onChange={(e) =>
                          updateExistingImage(block, { layout: e.target.value as InlineImageMode })
                        }
                        className="min-h-[38px] px-2 noir-input text-[14px]"
                      >
                        {ILLUSTRATION_MODES_META.map((m) => {
                          const val = m.mode === 'full-width' ? 'full' : (m.mode as InlineImageMode);
                          return (
                            <option key={m.mode} value={val}>
                              {m.label}
                            </option>
                          );
                        })}
                      </select>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={30}
                          max={100}
                          step={5}
                          value={block.scale}
                          onChange={(e) =>
                            updateExistingImage(block, { scale: Number(e.target.value) })
                          }
                          className="accent-rose-500 cursor-pointer flex-1"
                        />
                        <span className="text-[14px] font-mono text-zinc-300 shrink-0">
                          {block.scale}%
                        </span>
                      </div>
                    </div>

                    {(block.layout === 'page-bg' || block.layout === 'gradient-blend') && (
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="text-[14px] text-zinc-300 flex items-center gap-2">
                          <span>Прозрачность ({block.bgOpacity}%):</span>
                          <input
                            type="range"
                            min={15}
                            max={95}
                            step={5}
                            value={block.bgOpacity}
                            onChange={(e) =>
                              updateExistingImage(block, { bgOpacity: Number(e.target.value) })
                            }
                            className="accent-rose-500 cursor-pointer w-24"
                          />
                        </label>
                        {block.layout === 'gradient-blend' && (
                          <select
                            value={block.gradientDirection}
                            onChange={(e) =>
                              updateExistingImage(block, {
                                gradientDirection: e.target.value as 'bottom' | 'top' | 'left' | 'right',
                              })
                            }
                            className="min-h-[36px] px-2 noir-input text-[14px]"
                          >
                            {GRADIENT_DIRECTION_OPTIONS.map((opt) => (
                              <option key={opt.dir} value={opt.dir}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {isGalleryOpen && (
        <GalleryPickerModal
          isOpen={isGalleryOpen}
          onClose={() => setIsGalleryOpen(false)}
          onSelectUrl={(url) => {
            setImgUrl(url);
            setIsGalleryOpen(false);
          }}
          selectedUrl={imgUrl}
          title="Выбор иллюстрации для вставки в главу"
        />
      )}
    </NoirModal>
  );
};
