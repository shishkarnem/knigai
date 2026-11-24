import React, { useEffect, useState } from 'react';
import { BookPlus, Edit3, Eye, Save } from 'lucide-react';
import { Book } from '../../../types';
import { updateBook } from '../../../services/db/bookRepository';
import { NoirButton } from '../../common/NoirButton';
import { NoirVoiceInput } from '../../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../../voice/NoirVoiceTextarea';
import { BasicPlotBadge } from '../../plots/BasicPlotBadge';

interface BookConceptMetadataCardProps {
  currentBook: Book;
  selectedPlots: string[];
  activeStyle: Book['style_config'];
  readOnly?: boolean;
  onBookUpdated: (book: Book) => void;
  onProceedToChapters: () => void;
  onOpenDetails: () => void;
  onStatusMessage: (msg: { type: 'success' | 'error' | 'info'; text: string }) => void;
}

export const BookConceptMetadataCard: React.FC<BookConceptMetadataCardProps> = ({
  currentBook,
  selectedPlots,
  activeStyle,
  readOnly = false,
  onBookUpdated,
  onProceedToChapters,
  onOpenDetails,
  onStatusMessage,
}) => {
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [subtitle, setSubtitle] = useState(currentBook.subtitle || '');
  const [author, setAuthor] = useState(currentBook.author || 'Автор KnigAI');
  const [overview, setOverview] = useState(currentBook.synopsis_overview || '');

  useEffect(() => {
    setSubtitle(currentBook.subtitle || '');
    setAuthor(currentBook.author || 'Автор KnigAI');
    setOverview(currentBook.synopsis_overview || '');
  }, [currentBook]);

  const handleSaveMeta = async () => {
    if (readOnly) return;
    const updated: Book = {
      ...currentBook,
      subtitle,
      author,
      basic_plots: selectedPlots,
      synopsis_overview: overview,
      style_config: activeStyle,
    };
    await updateBook(updated);
    onBookUpdated(updated);
    setIsEditingMeta(false);
    onStatusMessage({ type: 'success', text: 'Метаданные книги обновлены в базе данных' });
  };

  return (
    <div className="noir-container p-4 sm:p-6 border-2 border-white shadow-xl flex flex-col gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-zinc-700">
        <h3 className="text-[17px] font-bold text-white">Текущий зафиксированный концепт</h3>
        <div className="flex flex-wrap items-center gap-2">
          <NoirButton
            variant="outline"
            onClick={onOpenDetails}
            icon={<Eye className="w-4 h-4 text-rose-500" />}
          >
            Подробнее о книге
          </NoirButton>
          {!readOnly && (
            <NoirButton
              variant="outline"
              onClick={() => setIsEditingMeta(!isEditingMeta)}
              icon={<Edit3 className="w-4 h-4 text-white" />}
            >
              {isEditingMeta ? 'Скрыть редактирование' : 'Редактировать синопсис'}
            </NoirButton>
          )}
          <NoirButton
            variant="primary"
            onClick={onProceedToChapters}
            icon={<BookPlus className="w-4 h-4 text-black" />}
          >
            Перейти к главам →
          </NoirButton>
        </div>
      </div>

      {isEditingMeta && !readOnly ? (
        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Подзаголовок:</label>
            <NoirVoiceInput
              value={subtitle}
              onValueChange={setSubtitle}
              voiceContext="book_subtitle"
              placeholder="Подзаголовок книги..."
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Имя автора:</label>
            <NoirVoiceInput
              value={author}
              onValueChange={setAuthor}
              voiceContext="book_author"
              placeholder="Имя или псевдоним автора..."
            />
          </div>
          <div>
            <label className="block text-[14px] font-bold text-white mb-1">Синопсис мира:</label>
            <NoirVoiceTextarea
              minRows={4}
              maxRows={12}
              value={overview}
              onValueChange={setOverview}
              voiceContext="book_synopsis_overview"
              placeholder="Описание вселенной и завязки сюжета..."
            />
          </div>
          <div className="flex justify-end">
            <NoirButton variant="primary" onClick={handleSaveMeta} icon={<Save className="w-4 h-4 text-black" />}>
              Сохранить изменения
            </NoirButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[16px] font-bold text-rose-500">{currentBook.title}</span>
            {currentBook.subtitle && (
              <span className="text-[14px] text-zinc-400">· {currentBook.subtitle}</span>
            )}
            {currentBook.basic_plots && currentBook.basic_plots.length > 0 && (
              <div className="ml-auto">
                <BasicPlotBadge plotIds={currentBook.basic_plots} size="sm" />
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenDetails}
            className="p-4 bg-zinc-950 border border-zinc-800 hover:border-white text-left text-[14px] leading-relaxed text-zinc-300 hover:text-white whitespace-pre-line cursor-pointer transition-colors"
            title="Открыть развёрнутую аннотацию, синопсис глав и паспорт книги"
          >
            {currentBook.synopsis_overview || 'Описание мира формируется...'}
          </button>
        </div>
      )}
    </div>
  );
};
