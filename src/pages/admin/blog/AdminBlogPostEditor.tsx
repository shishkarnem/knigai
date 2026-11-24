import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Eye,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  Quote,
  Save,
} from 'lucide-react';
import {
  BlogPostDto,
  adminCreateBlogPost,
  adminUpdateBlogPost,
  transliterateToSlug,
} from '../../../services/blog/blogApi';
import {
  MarkdownRendererNoir,
  countMarkdownChars,
  estimateReadMinutes,
} from '../../../components/blog/MarkdownRendererNoir';
import { NoirButton } from '../../../components/common/NoirButton';
import { BlogImageStudioModal } from './BlogImageStudioModal';

interface AdminBlogPostEditorProps {
  initialPost: BlogPostDto | null;
  onCancel: () => void;
  onSaved: (post: BlogPostDto) => void;
}

export const AdminBlogPostEditor: React.FC<AdminBlogPostEditorProps> = ({
  initialPost,
  onCancel,
  onSaved,
}) => {
  const [title, setTitle] = useState(initialPost?.title || '');
  const [slug, setSlug] = useState(initialPost?.slug || '');
  const [slugTouched, setSlugTouched] = useState(Boolean(initialPost?.slug));
  const [subtitle, setSubtitle] = useState(initialPost?.subtitle || '');
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt || '');
  const [seoKeywords, setSeoKeywords] = useState(initialPost?.seo_keywords || '');
  const [tagsInput, setTagsInput] = useState((initialPost?.tags || []).join(', '));
  const [authorName, setAuthorName] = useState(initialPost?.author_name || 'Редакция KnigAI');
  const [status, setStatus] = useState<'published' | 'draft'>(initialPost?.status || 'published');
  const [coverImageUrl, setCoverImageUrl] = useState(initialPost?.cover_image_url || '');
  const [coverFileId, setCoverFileId] = useState<number | null>(initialPost?.cover_file_id ?? null);
  const [contentMarkdown, setContentMarkdown] = useState(initialPost?.content_markdown || '');

  const [showPreview, setShowPreview] = useState(true);
  const [studioMode, setStudioMode] = useState<'cover' | 'inline' | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const effectiveSlug = useMemo(
    () => (slug.trim() ? transliterateToSlug(slug) : transliterateToSlug(title)),
    [slug, title]
  );
  const charCount = countMarkdownChars(contentMarkdown);
  const readMins = estimateReadMinutes(contentMarkdown);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    if (!slugTouched) {
      setSlug(transliterateToSlug(val));
    }
  };

  const insertAroundSelection = (before: string, after = '', placeholder = 'текст') => {
    const el = textareaRef.current;
    if (!el) {
      setContentMarkdown((prev) => `${prev}\n${before}${placeholder}${after}`);
      return;
    }
    const start = el.selectionStart ?? contentMarkdown.length;
    const end = el.selectionEnd ?? contentMarkdown.length;
    const selected = contentMarkdown.slice(start, end) || placeholder;
    const next =
      contentMarkdown.slice(0, start) + before + selected + after + contentMarkdown.slice(end);
    setContentMarkdown(next);
    setTimeout(() => {
      el.focus();
      const cursorPos = start + before.length + selected.length;
      el.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  const handleImagePicked = (file: { id?: number; shortUrl: string; name: string }) => {
    if (studioMode === 'cover') {
      setCoverImageUrl(file.shortUrl);
      setCoverFileId(file.id ?? null);
    } else if (studioMode === 'inline') {
      const alt = file.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') || 'Иллюстрация KnigAI';
      insertAroundSelection(`\n\n![${alt}](${file.shortUrl})\n\n`, '', '');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (title.trim().length < 3) {
      setErrorMsg('Укажите уникальное название темы поста (минимум 3 символа).');
      return;
    }
    if (!contentMarkdown.trim()) {
      setErrorMsg('Напишите текст статьи в формате Markdown.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: title.trim(),
        slug: effectiveSlug,
        subtitle: subtitle.trim(),
        excerpt: excerpt.trim() || subtitle.trim() || title.trim(),
        seo_keywords: seoKeywords.trim(),
        tags: tagsInput
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        author_name: authorName.trim() || 'Редакция KnigAI',
        status,
        cover_image_url: coverImageUrl.trim(),
        cover_file_id: coverFileId,
        content_markdown: contentMarkdown,
      };

      const saved = initialPost?.id
        ? await adminUpdateBlogPost(initialPost.id, payload)
        : await adminCreateBlogPost(payload);
      onSaved(saved);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось сохранить пост');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-5 text-white">
      <div className="p-4 sm:p-5 bg-zinc-950/75 border border-white/25 flex flex-wrap items-center justify-between gap-3 rounded-none">
        <div className="flex items-center gap-3">
          <NoirButton
            type="button"
            variant="subtle"
            onClick={onCancel}
            icon={<ArrowLeft className="w-4 h-4" />}
            showTail={false}
          >
            Назад к списку
          </NoirButton>
          <span className="text-[17px] font-bold">
            {initialPost ? `Редактирование поста #${initialPost.id}` : 'Новый пост в блог KnigAI'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className={`min-h-[42px] px-4 py-2 border text-[14px] font-bold inline-flex items-center gap-2 cursor-pointer rounded-none ${
              showPreview
                ? 'bg-zinc-900 border-rose-500 text-white'
                : 'bg-black border-zinc-700 text-zinc-300'
            }`}
          >
            <Eye className="w-4 h-4 text-rose-500" />
            <span>{showPreview ? 'Скрыть предпросмотр' : 'Показать предпросмотр'}</span>
          </button>

          <NoirButton
            type="submit"
            variant="primary"
            loading={saving}
            icon={<Save className="w-4 h-4 text-black" />}
            showTail={false}
          >
            {initialPost ? 'Сохранить изменения' : 'Опубликовать пост'}
          </NoirButton>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 border border-rose-500 bg-rose-950/50 text-rose-200 text-[14px]">
          {errorMsg}
        </div>
      )}

      {/* Metadata & Cover */}
      <div className="p-5 bg-zinc-950/75 border border-zinc-800 grid grid-cols-1 lg:grid-cols-12 gap-5 rounded-none">
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-zinc-200">
              Уникальное название (тема) поста
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Например: Как создать персональную книгу в подарок на юбилей"
              className="noir-input w-full px-3.5 py-2.5 text-[15px] rounded-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-zinc-200">
              Уникальный Slug-адрес (транскрипция для SEO URL)
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              placeholder="kak-sozdat-personalnuyu-knigu-v-podarok"
              className="noir-input w-full px-3.5 py-2 text-[14px] font-mono rounded-none"
            />
            <span className="text-[14px] text-zinc-400 font-mono break-all">
              URL: /blog/{effectiveSlug}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-zinc-200">Подзаголовок</label>
            <input
              type="text"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Краткий лид под заголовком статьи..."
              className="noir-input w-full px-3.5 py-2.5 text-[14px] rounded-none"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[14px] font-bold text-zinc-200">
              SEO-описание для поиска, соцсетей и нейросетей (Excerpt)
            </label>
            <textarea
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="Краткое описание статьи для сниппетов и карточек репоста..."
              className="noir-input w-full px-3.5 py-2 text-[14px] rounded-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-zinc-200">Теги (через запятую)</label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="Подарки, ИИ-книги, Печать А5"
                className="noir-input w-full px-3.5 py-2 text-[14px] rounded-none"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-zinc-200">SEO ключевые слова</label>
              <input
                type="text"
                value={seoKeywords}
                onChange={(e) => setSeoKeywords(e.target.value)}
                placeholder="создать книгу ИИ, печать А5 от 1 шт"
                className="noir-input w-full px-3.5 py-2 text-[14px] rounded-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-zinc-200">Автор</label>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                className="noir-input w-full px-3.5 py-2 text-[14px] rounded-none"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[14px] font-bold text-zinc-200">Статус публикации</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value === 'draft' ? 'draft' : 'published')}
                className="noir-input w-full px-3.5 py-2.5 text-[14px] rounded-none bg-black"
              >
                <option value="published">Опубликован (в блоге и sitemap.xml)</option>
                <option value="draft">Черновик (скрыт от читателей)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Cover Image 16:9 Picker */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          <label className="text-[14px] font-bold text-zinc-200">
            Обложка поста (16:9 · только из базы данных /file/:id)
          </label>
          <div className="w-full aspect-video border border-zinc-700 bg-black overflow-hidden flex items-center justify-center rounded-none">
            {coverImageUrl ? (
              <img
                src={coverImageUrl}
                alt="Обложка поста"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[14px] text-zinc-500 px-4 text-center">
                Обложка 16:9 не выбрана
              </span>
            )}
          </div>
          <input
            type="text"
            value={coverImageUrl}
            onChange={(e) => setCoverImageUrl(e.target.value)}
            placeholder="/file/..."
            className="noir-input w-full px-3 py-2 text-[14px] font-mono rounded-none"
          />
          <div className="flex flex-wrap gap-2">
            <NoirButton
              type="button"
              variant="outline"
              showTail={false}
              icon={<ImageIcon className="w-4 h-4 text-rose-500" />}
              onClick={() => setStudioMode('cover')}
            >
              Сгенерировать 16:9 / Выбрать из БД
            </NoirButton>
            {coverImageUrl && (
              <NoirButton
                type="button"
                variant="subtle"
                showTail={false}
                onClick={() => {
                  setCoverImageUrl('');
                  setCoverFileId(null);
                }}
              >
                Очистить
              </NoirButton>
            )}
          </div>
        </div>
      </div>

      {/* Markdown Toolbar + Editor & Live Preview */}
      <div className="p-4 sm:p-5 bg-zinc-950/75 border border-zinc-800 flex flex-col gap-4 rounded-none">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => insertAroundSelection('\n# ', '\n', 'Заголовок H1')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
              title="Заголовок H1 (Rubik Marker Hatch)"
            >
              <Heading1 className="w-4 h-4 text-rose-500" /> H1
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('\n## ', '\n', 'Заголовок H2')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
              title="Заголовок H2 (Rubik Marker Hatch)"
            >
              <Heading2 className="w-4 h-4 text-rose-500" /> H2
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('\n### ', '\n', 'Подзаголовок H3')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
              title="Заголовок H3 (Rubik Marker Hatch)"
            >
              <Heading3 className="w-4 h-4 text-rose-500" /> H3
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('**', '**', 'жирный текст')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Bold className="w-4 h-4 text-rose-500" />
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('*', '*', 'курсив')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Italic className="w-4 h-4 text-rose-500" />
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('\n- ', '', 'Пункт списка')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <List className="w-4 h-4 text-rose-500" />
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('\n> ', '\n', 'Цитата или важная мысль')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <Quote className="w-4 h-4 text-rose-500" />
            </button>
            <button
              type="button"
              onClick={() => insertAroundSelection('[', '](https://knigai.ru)', 'текст ссылки')}
              className="min-h-[38px] px-2.5 border border-zinc-700 hover:border-white bg-black text-[14px] font-bold inline-flex items-center gap-1 cursor-pointer"
            >
              <LinkIcon className="w-4 h-4 text-rose-500" />
            </button>
            <button
              type="button"
              onClick={() => setStudioMode('inline')}
              className="min-h-[38px] px-3 border border-rose-500/80 hover:border-rose-400 bg-rose-950/40 text-[14px] font-bold inline-flex items-center gap-1.5 cursor-pointer text-white"
            >
              <ImageIcon className="w-4 h-4 text-rose-400" />
              <span>Вставить картинку 16:9 из БД</span>
            </button>
          </div>

          <div className="text-[14px] font-mono text-zinc-400">
            Объём: <strong className="text-white">{charCount.toLocaleString('ru-RU')}</strong> зн. · {readMins} мин
          </div>
        </div>

        <div className={`grid grid-cols-1 ${showPreview ? 'xl:grid-cols-2' : ''} gap-5`}>
          <textarea
            ref={textareaRef}
            rows={20}
            value={contentMarkdown}
            onChange={(e) => setContentMarkdown(e.target.value)}
            placeholder="# Заголовок H1&#10;&#10;Основной текст статьи в формате Markdown..."
            className="noir-input w-full p-4 text-[15px] font-mono leading-relaxed rounded-none min-h-[460px]"
          />

          {showPreview && (
            <div className="p-5 bg-black/80 border border-zinc-800 overflow-y-auto max-h-[620px] rounded-none">
              <div className="text-[14px] font-mono text-rose-400 border-b border-zinc-800 pb-2 mb-4">
                Предпросмотр в стиле KnigAI (Rubik Marker Hatch + PT Serif):
              </div>
              <MarkdownRendererNoir markdown={contentMarkdown} />
            </div>
          )}
        </div>
      </div>

      <BlogImageStudioModal
        isOpen={studioMode !== null}
        onClose={() => setStudioMode(null)}
        targetMode={studioMode || 'inline'}
        onSelectImage={handleImagePicked}
      />
    </form>
  );
};
