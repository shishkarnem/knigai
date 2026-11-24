import React, { useMemo, useState, useRef } from 'react';
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Quote,
  List,
  Minus,
  Image as ImageIcon,
  Eye,
  Edit3,
  Columns,
} from 'lucide-react';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { GalleryPickerModal } from '../gallery/GalleryPickerModal';
import { NoirVoiceMicButton } from '../voice/NoirVoiceMicButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import {
  InlineImageMode,
  insertSnippetAtParagraphIndex,
  serializeMarkdownImage,
} from '../writer/writerUtils';
import {
  detectStandaloneMarkdownImage,
  GRADIENT_DIRECTION_OPTIONS,
  ILLUSTRATION_MODES_META,
} from '../reader/hooks/pageIllustrationParser';
import { InlineIllustrationBlock } from '../reader/modals/InlineIllustrationBlock';

export interface MarkdownBookEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

export const MarkdownBookEditor: React.FC<MarkdownBookEditorProps> = ({
  value,
  onChange,
  placeholder = 'Введите или отредактируйте текст главы в формате Markdown...',
  minHeight = 'min-h-[340px]',
}) => {
  const [viewMode, setViewMode] = useState<'editor' | 'preview' | 'split'>('editor');
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [isGalleryPickerOpen, setIsGalleryPickerOpen] = useState(false);

  const [imgUrl, setImgUrl] = useState('');
  const [imgAlt, setImgAlt] = useState('');
  const [imgScale, setImgScale] = useState(80);
  const [imgLayout, setImgLayout] = useState<InlineImageMode>('full');
  const [imgOpacity, setImgOpacity] = useState(40);
  const [gradDir, setGradDir] = useState<'bottom' | 'top' | 'left' | 'right'>('bottom');
  const [insertPos, setInsertPos] = useState<string>('cursor');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const paragraphs = useMemo(
    () =>
      value
        .split('\n\n')
        .map((p) => p.trim())
        .filter(Boolean),
    [value]
  );

  const applyFormatting = (before: string, after: string = '') => {
    const el = textareaRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.substring(start, end) || 'текст';
    const replacement = `${before}${selected}${after}`;
    const nextValue = value.substring(0, start) + replacement + value.substring(end);

    onChange(nextValue);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    }, 10);
  };

  const handleInsertImage = () => {
    if (!imgUrl.trim()) return;
    const snippet = serializeMarkdownImage({
      alt: imgAlt || 'Иллюстрация',
      url: imgUrl.trim(),
      layout: imgLayout,
      scale: imgScale,
      bgOpacity: imgLayout === 'page-bg' || imgLayout === 'gradient-blend' ? imgOpacity : undefined,
      gradientDirection: imgLayout === 'gradient-blend' ? gradDir : undefined,
    });

    if (insertPos === 'cursor') {
      const el = textareaRef.current;
      const mdSnippet = `\n\n${snippet}\n\n`;
      if (el) {
        const start = el.selectionStart;
        onChange(value.substring(0, start) + mdSnippet + value.substring(start));
      } else {
        onChange(value + mdSnippet);
      }
    } else {
      const idx = parseInt(insertPos, 10);
      onChange(insertSnippetAtParagraphIndex(value, snippet, Number.isNaN(idx) ? 99999 : idx));
    }

    setIsImageModalOpen(false);
    setImgUrl('');
    setImgAlt('');
  };

  const renderMarkdownPreview = (text: string) => {
    if (!text.trim()) {
      return (
        <div className="text-zinc-500 italic py-8 text-center text-[14px]">
          Текст пока пуст. Введите текст в редакторе слева.
        </div>
      );
    }

    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const detectedImg = detectStandaloneMarkdownImage(trimmed);

      if (detectedImg) {
        if (detectedImg.layoutConfig.mode === 'page-bg') {
          elements.push(
            <div
              key={index}
              className="my-3 relative p-4 border border-rose-500/60 overflow-hidden bg-black clear-both"
            >
              <img
                src={detectedImg.url}
                alt={detectedImg.alt}
                className="absolute inset-0 w-full h-full object-cover"
                style={{
                  opacity: Math.min(0.9, Math.max(0.15, (detectedImg.layoutConfig.bgOpacity ?? 38) / 100)),
                }}
              />
              <div className="relative z-10 text-[14px] text-white font-bold bg-black/70 px-2.5 py-1 inline-block border border-zinc-600">
                Фоновая иллюстрация страницы ({detectedImg.layoutConfig.bgOpacity ?? 38}%): {detectedImg.alt}
              </div>
            </div>
          );
          return;
        }

        elements.push(
          <InlineIllustrationBlock
            key={index}
            url={detectedImg.url}
            alt={detectedImg.alt}
            layout={detectedImg.layoutConfig}
            compact
          />
        );
        return;
      }

      if (trimmed.startsWith('### ')) {
        elements.push(
          <h4 key={index} className="text-[17px] font-bold text-white mt-4 mb-1">
            {trimmed.replace('### ', '')}
          </h4>
        );
      } else if (trimmed.startsWith('## ')) {
        elements.push(
          <h3 key={index} className="text-[19px] font-bold text-white mt-5 mb-2 border-b border-zinc-700 pb-1">
            {trimmed.replace('## ', '')}
          </h3>
        );
      } else if (trimmed.startsWith('# ')) {
        elements.push(
          <h2 key={index} className="text-[22px] font-bold text-white mt-6 mb-3">
            {trimmed.replace('# ', '')}
          </h2>
        );
      } else if (trimmed.startsWith('> ')) {
        elements.push(
          <blockquote key={index} className="border-l-4 border-white pl-3.5 my-2.5 text-zinc-300 italic text-[14px]">
            {trimmed.replace('> ', '')}
          </blockquote>
        );
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        elements.push(
          <li key={index} className="ml-5 list-disc text-zinc-300 text-[14px]">
            {trimmed.replace(/^[-*]\s+/, '')}
          </li>
        );
      } else if (trimmed === '---') {
        elements.push(<hr key={index} className="my-4 border-zinc-700" />);
      } else if (trimmed.length > 0) {
        const formatted = trimmed
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');

        elements.push(
          <p
            key={index}
            className="text-[14px] text-zinc-200 leading-relaxed mb-3 text-justify"
            dangerouslySetInnerHTML={{ __html: formatted }}
          />
        );
      }
    });

    return <div className="prose prose-invert max-w-none clearfix">{elements}</div>;
  };

  return (
    <div className="w-full flex flex-col gap-2 text-white">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-zinc-950/80 border border-zinc-700">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            title="Жирный шрифт"
            onClick={() => applyFormatting('**', '**')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Курсив"
            onClick={() => applyFormatting('*', '*')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
          >
            <Italic className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-6 bg-zinc-700 mx-1" />
          <button
            type="button"
            title="Заголовок 1"
            onClick={() => applyFormatting('# ')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer font-bold"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Заголовок 2"
            onClick={() => applyFormatting('## ')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer font-bold"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Цитата"
            onClick={() => applyFormatting('> ')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
          >
            <Quote className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Список"
            onClick={() => applyFormatting('- ')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            title="Разделитель"
            onClick={() => applyFormatting('\n---\n')}
            className="w-9 h-9 flex items-center justify-center bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="w-[1px] h-6 bg-zinc-700 mx-1" />
          <button
            type="button"
            onClick={() => setIsImageModalOpen(true)}
            className="min-h-[44px] px-3 flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 hover:border-white text-white cursor-pointer text-[14px]"
          >
            <ImageIcon className="w-4 h-4 text-white" />
            <span>Вставить картинку</span>
          </button>
          <NoirVoiceMicButton
            value={value}
            onChange={onChange}
            targetRef={textareaRef}
            fieldContext="chapter_markdown_editor"
            compact={false}
            label="Диктовка"
          />
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setViewMode('editor')}
            className={`min-h-[36px] px-2.5 text-[14px] font-bold border cursor-pointer ${
              viewMode === 'editor'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5 inline mr-1" />
            Код
          </button>
          <button
            type="button"
            onClick={() => setViewMode('preview')}
            className={`min-h-[36px] px-2.5 text-[14px] font-bold border cursor-pointer ${
              viewMode === 'preview'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Eye className="w-3.5 h-3.5 inline mr-1" />
            UI макет
          </button>
          <button
            type="button"
            onClick={() => setViewMode('split')}
            className={`min-h-[36px] px-2.5 text-[14px] font-bold border cursor-pointer hidden md:flex items-center ${
              viewMode === 'split'
                ? 'bg-white text-black border-white'
                : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5 inline mr-1" />
            Сплит
          </button>
        </div>
      </div>

      {/* Editor & Preview Bodies */}
      <div className="w-full">
        {viewMode === 'editor' && (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full p-4 noir-input font-mono text-[14px] leading-relaxed resize-y ${minHeight}`}
          />
        )}

        {viewMode === 'preview' && (
          <div className={`w-full p-5 bg-zinc-950/90 border border-zinc-700 overflow-y-auto ${minHeight}`}>
            {renderMarkdownPreview(value)}
          </div>
        )}

        {viewMode === 'split' && (
          <div className="grid grid-cols-2 gap-3">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className={`w-full p-4 noir-input font-mono text-[14px] leading-relaxed resize-y ${minHeight}`}
            />
            <div className={`w-full p-5 bg-zinc-950/90 border border-zinc-700 overflow-y-auto ${minHeight}`}>
              {renderMarkdownPreview(value)}
            </div>
          </div>
        )}
      </div>

      {/* Image Insertion Modal */}
      <NoirModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        title="Конструктор вставки иллюстрации в текст главы"
        maxWidth="max-w-xl"
      >
        <div className="flex flex-col gap-4 text-white">
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-white flex items-center justify-between">
              <span>Ссылка на изображение (URL):</span>
              <button
                type="button"
                onClick={() => setIsGalleryPickerOpen(true)}
                className="text-[14px] text-zinc-300 hover:text-white underline cursor-pointer"
              >
                Выбрать из галереи
              </button>
            </label>
            <input
              type="text"
              value={imgUrl}
              onChange={(e) => setImgUrl(e.target.value)}
              placeholder="https://..."
              className="w-full min-h-[44px] px-3 noir-input text-[14px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-white">Подпись / титр (alt):</label>
            <NoirVoiceInput
              value={imgAlt}
              onValueChange={setImgAlt}
              voiceContext="chapter_image_caption"
              placeholder="Кайрен Норт на смотровой площадке"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="md-img-layout" className="text-[14px] font-bold text-white">
                Позиционирование (9 макетов):
              </label>
              <select
                id="md-img-layout"
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="md-img-scale" className="text-[14px] font-bold text-white">
                Масштаб ширины ({imgScale}%):
              </label>
              <input
                id="md-img-scale"
                type="range"
                min="30"
                max="100"
                step="5"
                value={imgScale}
                onChange={(e) => setImgScale(parseInt(e.target.value, 10))}
                className="w-full accent-rose-500 cursor-pointer mt-3"
              />
            </div>
          </div>

          {(imgLayout === 'page-bg' || imgLayout === 'gradient-blend') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[14px] font-bold text-white mb-1">
                  Прозрачность ({imgOpacity}%):
                </label>
                <input
                  type="range"
                  min={15}
                  max={95}
                  step={5}
                  value={imgOpacity}
                  onChange={(e) => setImgOpacity(parseInt(e.target.value, 10))}
                  className="w-full accent-rose-500 cursor-pointer mt-2"
                />
              </div>
              {imgLayout === 'gradient-blend' && (
                <div>
                  <label className="block text-[14px] font-bold text-white mb-1">
                    Градиент растворения:
                  </label>
                  <select
                    value={gradDir}
                    onChange={(e) =>
                      setGradDir(e.target.value as 'bottom' | 'top' | 'left' | 'right')
                    }
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
              <option value="-1">Перед первым абзацем (начало главы)</option>
              {paragraphs.map((p, idx) => (
                <option key={idx} value={String(idx)}>
                  После абзаца #{idx + 1}: «{p.replace(/!\[.*?\]\(.*?\)/g, '[иллюстрация]').slice(0, 48)}...»
                </option>
              ))}
              <option value="99999">В самый конец главы</option>
            </select>
          </div>

          {imgUrl && (
            <div className="border border-zinc-700 p-2 checkerboard-bg max-h-36 flex items-center justify-center overflow-hidden">
              <img src={imgUrl} alt="Предпросмотр" className="max-h-32 object-contain" />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <NoirButton variant="outline" onClick={() => setIsImageModalOpen(false)}>
              Отмена
            </NoirButton>
            <NoirButton variant="primary" onClick={handleInsertImage} disabled={!imgUrl.trim()}>
              Вставить в текст
            </NoirButton>
          </div>
        </div>
      </NoirModal>

      {/* Gallery Picker Modal */}
      <GalleryPickerModal
        isOpen={isGalleryPickerOpen}
        onClose={() => setIsGalleryPickerOpen(false)}
        onSelectUrl={(url) => {
          setImgUrl(url);
          setIsGalleryPickerOpen(false);
        }}
        title="Выбор иллюстрации из галереи для текста"
      />
    </div>
  );
};
