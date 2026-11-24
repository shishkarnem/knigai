import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, FileText, Lock, Save } from 'lucide-react';
import { Book } from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { NoirButton } from '../../common/NoirButton';
import { NoirVoiceInput } from '../../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../../voice/NoirVoiceTextarea';
import { updateBook } from '../../../services/db/bookRepository';

interface BookHeadersEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book | null;
  onBookUpdated: (updated: Book) => void;
}

/**
 * Restricted header-only editor for books downloaded via external parsers
 * (Flibusta, OPDS, Samlib, Librusec, Anna's Archive, LibriVox).
 * Original book text & chapters remain strictly read-only.
 */
export const BookHeadersEditModal: React.FC<BookHeadersEditModalProps> = ({
  isOpen,
  onClose,
  book,
  onBookUpdated,
}) => {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [author, setAuthor] = useState('');
  const [genresText, setGenresText] = useState('');
  const [runningHeader, setRunningHeader] = useState('');
  const [synopsisOverview, setSynopsisOverview] = useState('');
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (isOpen && book) {
      setTitle(book.title || '');
      setSubtitle(book.subtitle || '');
      setAuthor(book.author || '');
      setGenresText((book.genres || []).slice(0, 5).join(', '));
      setRunningHeader(book.running_header || book.title || '');
      setSynopsisOverview(book.synopsis_overview || '');
      setErrorMsg('');
      setSavedOk(false);
    }
  }, [isOpen, book]);

  if (!book) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Укажите название книги.');
      return;
    }

    setSaving(true);
    setErrorMsg('');
    try {
      const cleanTitle = title.trim();
      const cleanAuthor = author.trim() || 'Автор';
      const parsedGenres = genresText
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean)
        .slice(0, 5);
      const nextGenres = parsedGenres.length > 0 ? parsedGenres : book.genres || ['Литература'];

      const updated: Book = {
        ...book,
        title: cleanTitle,
        subtitle: subtitle.trim(),
        author: cleanAuthor,
        genres: nextGenres,
        running_header: runningHeader.trim() || cleanTitle,
        synopsis_overview: synopsisOverview.trim(),
        cover_config: {
          ...(book.cover_config || {
            frontTitle: cleanTitle,
            frontSubtitle: subtitle.trim(),
            authorName: cleanAuthor,
            spineText: `${cleanTitle} — ${cleanAuthor}`,
            backBlurb: synopsisOverview.trim(),
            genreLabel: nextGenres[0] || '',
            frontImageUrl: '',
            spineColor: '#18181b',
            paperType: 'cream',
            pageCountEstimate: 250,
            isbn: '978-5-00-198274-1',
            barcodeText: 'Издание формата А5',
          }),
          frontTitle: cleanTitle,
          frontSubtitle: subtitle.trim(),
          authorName: cleanAuthor,
          spineText: `${cleanTitle} — ${cleanAuthor}`,
          backBlurb: synopsisOverview.trim() || book.cover_config?.backBlurb || '',
          genreLabel: nextGenres.slice(0, 2).join(' / '),
        },
      };

      await updateBook(updated);
      onBookUpdated(updated);
      setSavedOk(true);
      setTimeout(() => onClose(), 650);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка сохранения заголовков книги.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Редактирование заголовков книги из парсера"
      maxWidth="max-w-xl"
    >
      <form onSubmit={handleSave} className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        <div className="p-3 bg-zinc-950/90 border border-rose-500/70 text-[14px] text-zinc-200 flex items-start gap-2.5">
          <Lock className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-white">Защита оригинала из каталога / парсера</p>
            <p className="text-zinc-400 mt-1 leading-snug">
              Текст глав скачанной книги защищён от изменений. Вы можете править только заголовки, жанры и аннотацию. Для переработки текста или фанфика используйте кнопку «Ремикс».
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {savedOk && (
          <div className="p-3 bg-zinc-900 border border-white text-white text-[14px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-rose-500 shrink-0" />
            <span>Заголовки и метаданные обновлены в базе данных.</span>
          </div>
        )}

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">Название книги:</label>
          <NoirVoiceInput
            required
            value={title}
            onValueChange={setTitle}
            voiceContext="parsed_header_title"
            placeholder="Название произведения"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Подзаголовок / серия:</label>
            <NoirVoiceInput
              value={subtitle}
              onValueChange={setSubtitle}
              voiceContext="parsed_header_subtitle"
              placeholder="Том, подзаголовок или издание"
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Автор:</label>
            <NoirVoiceInput
              value={author}
              onValueChange={setAuthor}
              voiceContext="parsed_header_author"
              placeholder="Имя автора"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Колонтитул книги:</label>
            <NoirVoiceInput
              value={runningHeader}
              onValueChange={setRunningHeader}
              voiceContext="parsed_header_running"
              placeholder="Текст верхнего колонтитула"
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Жанры (до 5, через запятую):</label>
            <NoirVoiceInput
              value={genresText}
              onValueChange={setGenresText}
              voiceContext="parsed_header_genres"
              placeholder="Детектив, Классика, Нуар"
            />
          </div>
        </div>

        <div>
          <label className="flex items-center gap-1.5 text-[14px] font-bold text-white mb-1">
            <FileText className="w-4 h-4 text-rose-500" />
            <span>Аннотация / описание для карточки и обложки:</span>
          </label>
          <NoirVoiceTextarea
            value={synopsisOverview}
            onValueChange={setSynopsisOverview}
            voiceContext="parsed_header_overview"
            minRows={3}
            placeholder="Краткое описание книги..."
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
          <NoirButton type="button" variant="subtle" onClick={onClose} disabled={saving}>
            Отмена
          </NoirButton>
          <NoirButton
            type="submit"
            variant="primary"
            loading={saving}
            icon={<Save className="w-4 h-4 text-black" />}
          >
            Сохранить заголовки
          </NoirButton>
        </div>
      </form>
    </NoirModal>
  );
};
