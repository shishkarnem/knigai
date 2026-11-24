import React, { useState, useEffect } from 'react';
import { CopyPlus, Sparkles, AlertCircle } from 'lucide-react';
import { Book, Chapter, Character, AppUser } from '../../types';
import { NoirModal } from '../common/NoirModal';
import { NoirButton } from '../common/NoirButton';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../voice/NoirVoiceTextarea';
import { cloneBookForRemix } from '../../services/db/bookRepository';

interface RemixBookModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceBook: Book | null;
  currentUser: AppUser | null;
  onRemixCreated: (result: { book: Book; chapters: Chapter[]; characters: Character[] }) => void;
}

export const RemixBookModal: React.FC<RemixBookModalProps> = ({
  isOpen,
  onClose,
  sourceBook,
  currentUser,
  onRemixCreated,
}) => {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [authorInstructions, setAuthorInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && sourceBook) {
      setTitle(`[Фанфик] ${sourceBook.title}`);
      setAuthor(currentUser?.name || 'Автор KnigAI');
      setAuthorInstructions('');
      setErrorMsg(null);
    }
  }, [isOpen, sourceBook, currentUser]);

  if (!sourceBook) return null;

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setErrorMsg('Укажите название нового ремикса');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    try {
      const cloned = await cloneBookForRemix(
        sourceBook,
        title.trim(),
        author.trim() || currentUser?.name || 'Автор KnigAI',
        currentUser?.uid,
        { authorInstructions }
      );
      onRemixCreated(cloned);
      onClose();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Не удалось клонировать книгу для ремикса');
    } finally {
      setLoading(false);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Ремикс / Фанфик (личная копия для редактирования)"
      maxWidth="max-w-lg"
    >
      <form onSubmit={handleConfirm} className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        <div className="p-3 bg-zinc-950/90 border border-zinc-800 text-[14px] text-zinc-300 leading-relaxed flex items-start gap-2.5">
          <CopyPlus className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-white font-bold">
              Клонирование книги «{sourceBook.title}»
            </p>
            <p className="text-zinc-400 mt-1">
              Будет создана ваша личная редактируемая копия со всеми главами, персонажами, сущностями мира и переплетом. Исходная книга останется нетронутой.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 bg-rose-950/80 border border-rose-500 text-rose-200 text-[14px] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Название вашего ремикса / фанфика:
          </label>
          <NoirVoiceInput
            required
            value={title}
            onValueChange={setTitle}
            voiceContext="remix_book_title"
            placeholder="[Фанфик] Новая история"
          />
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Автор ремикса:
          </label>
          <NoirVoiceInput
            value={author}
            onValueChange={setAuthor}
            voiceContext="remix_book_author"
            placeholder="Ваш авторский псевдоним"
          />
        </div>

        <div>
          <label className="block text-[14px] font-bold text-white mb-1">
            Комментарий и пожелания для ИИ (учитывается во всех главах ремикса):
          </label>
          <NoirVoiceTextarea
            value={authorInstructions}
            onValueChange={setAuthorInstructions}
            voiceContext="remix_author_instructions"
            minRows={3}
            placeholder="Например: перенести действие в киберпанк-Петербург, изменить характер антагониста, добавить детективную интригу..."
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-800">
          <NoirButton type="button" variant="subtle" onClick={onClose} disabled={loading}>
            Отмена
          </NoirButton>
          <NoirButton
            type="submit"
            variant="primary"
            loading={loading}
            icon={<Sparkles className="w-4 h-4 text-black" />}
          >
            Создать ремикс и открыть редактор
          </NoirButton>
        </div>
      </form>
    </NoirModal>
  );
};
