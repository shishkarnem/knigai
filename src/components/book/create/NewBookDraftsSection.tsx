import React, { useEffect, useId, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Coins,
  Edit2,
  FolderOpen,
  Plus,
  Save,
  ScanText,
  Trash2,
  Upload,
} from 'lucide-react';
import { BookDraft, DraftFragment } from '../../../types';
import { parseUploadedFileToText } from '../../../services/import/bookParser';
import { recognizeDraftImageOcr } from '../../../services/drafts/ocrService';
import { fetchDrafts } from '../../../services/drafts/draftsRepository';
import {
  ImportVolumeEstimate,
  formatLettersCount,
  lettersToRubles,
} from '../../../services/billing/costCalculator';
import { NoirButton } from '../../common/NoirButton';
import { NoirModal } from '../../common/NoirModal';
import { NoirVoiceInput } from '../../voice/NoirVoiceInput';
import { NoirVoiceTextarea } from '../../voice/NoirVoiceTextarea';

interface NewBookDraftsSectionProps {
  draftTitle: string;
  onDraftTitleChange: (val: string) => void;
  draftsList: DraftFragment[];
  onDraftsListChange: React.Dispatch<React.SetStateAction<DraftFragment[]>>;
  draftsCost: ImportVolumeEstimate;
  currentBalance: number;
  userUid?: number;
  isProcessing: boolean;
  onSetBusy: (busy: boolean, statusText?: string) => void;
  onError: (msg: string) => void;
}

export const NewBookDraftsSection: React.FC<NewBookDraftsSectionProps> = ({
  draftTitle,
  onDraftTitleChange,
  draftsList,
  onDraftsListChange,
  draftsCost,
  currentBalance,
  userUid,
  isProcessing,
  onSetBusy,
  onError,
}) => {
  const fileInputId = useId();
  const [draftInputTitle, setDraftInputTitle] = useState('');
  const [draftInputContent, setDraftInputContent] = useState('');
  const [ocrPercent, setOcrPercent] = useState<number | null>(null);
  const [ocrLabel, setOcrLabel] = useState('');
  const [basketIdeas, setBasketIdeas] = useState<BookDraft[]>([]);
  const [showBasket, setShowBasket] = useState(false);
  const [editingFrag, setEditingFrag] = useState<DraftFragment | null>(null);
  const [editFragTitle, setEditFragTitle] = useState('');
  const [editFragContent, setEditFragContent] = useState('');

  useEffect(() => {
    if (!userUid) return;
    fetchDrafts({ userUid, includeUnattached: true })
      .then((list) => setBasketIdeas(list.filter((d) => d.book_id == null)))
      .catch(() => {});
  }, [userUid]);

  const handleAddDraftFragment = () => {
    if (!draftInputContent.trim()) return;
    const newFragment: DraftFragment = {
      id: `draft-${Date.now()}-${Math.random()}`,
      title: draftInputTitle.trim() || `Фрагмент ${draftsList.length + 1}`,
      content: draftInputContent.trim(),
      order: draftsList.length + 1,
      charCount: draftInputContent.trim().length,
      sourceType: 'manual',
    };
    onDraftsListChange((prev) => [...prev, newFragment]);
    setDraftInputTitle('');
    setDraftInputContent('');
  };

  const handleUploadDraftFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    onError('');
    onSetBusy(true, 'Чтение файлов черновиков...');
    try {
      const newItems: DraftFragment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const parsed = await parseUploadedFileToText(file);
        if (parsed.text.trim()) {
          newItems.push({
            id: `draft-file-${Date.now()}-${i}`,
            title: parsed.detectedTitle || file.name,
            content: parsed.text.trim(),
            order: draftsList.length + i + 1,
            filename: file.name,
            charCount: parsed.text.trim().length,
            sourceType: 'file',
          });
        }
      }
      onDraftsListChange((prev) => [...prev, ...newItems]);
      if (!draftTitle && newItems.length > 0) {
        onDraftTitleChange(newItems[0].title.replace(/\.[^/.]+$/, ''));
      }
    } catch (err: unknown) {
      onError('Не удалось прочитать файлы: ' + (err instanceof Error ? err.message : ''));
    } finally {
      onSetBusy(false, '');
      e.target.value = '';
    }
  };

  const handleUploadPhotoOcr = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    onError('');
    onSetBusy(true, 'Загрузка и OCR-распознавание фото черновиков...');
    try {
      const added: DraftFragment[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setOcrPercent(8);
        const res = await recognizeDraftImageOcr({
          file,
          filename: file.name,
          userUid,
          onProgress: (msg, pct) => {
            setOcrLabel(`[${i + 1}/${files.length}] ${msg}`);
            if (typeof pct === 'number') setOcrPercent(pct);
          },
        });
        added.push({
          id: `draft-ocr-${Date.now()}-${i}`,
          title: res.suggestedTitle,
          content: res.recognizedText,
          order: draftsList.length + i + 1,
          filename: file.name,
          charCount: res.recognizedText.length,
          sourceType: 'ocr_image',
          sourceImageUrl: res.imageUrl,
        });
      }
      onDraftsListChange((prev) => [...prev, ...added]);
      if (!draftTitle && added.length > 0) {
        onDraftTitleChange(added[0].title.slice(0, 60));
      }
    } catch (err: unknown) {
      onError('Ошибка распознавания фото: ' + (err instanceof Error ? err.message : ''));
    } finally {
      setOcrPercent(null);
      setOcrLabel('');
      onSetBusy(false, '');
      e.target.value = '';
    }
  };

  const handlePullFromBasket = (idea: BookDraft) => {
    if (draftsList.some((d) => d.title === idea.title && d.content === idea.content)) return;
    const item: DraftFragment = {
      id: `draft-basket-${idea.id}-${Date.now()}`,
      title: idea.title,
      content: idea.content,
      order: draftsList.length + 1,
      charCount: idea.content.length,
      sourceType: idea.source_type || 'manual',
      sourceImageUrl: idea.source_image_url || undefined,
    };
    onDraftsListChange((prev) => [...prev, item]);
    if (!draftTitle) onDraftTitleChange(idea.title);
  };

  const moveDraft = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === draftsList.length - 1) return;
    const updated = [...draftsList];
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    updated.forEach((d, i) => {
      d.order = i + 1;
    });
    onDraftsListChange(updated);
  };

  const openEditModal = (item: DraftFragment) => {
    setEditingFrag(item);
    setEditFragTitle(item.title);
    setEditFragContent(item.content);
  };

  const saveEditModal = () => {
    if (!editingFrag) return;
    onDraftsListChange((prev) =>
      prev.map((d) =>
        d.id === editingFrag.id
          ? {
              ...d,
              title: editFragTitle.trim() || d.title,
              content: editFragContent,
              charCount: editFragContent.length,
            }
          : d
      )
    );
    setEditingFrag(null);
  };

  return (
    <div className="flex flex-col gap-4 pt-2 border-t border-zinc-800">
      <div>
        <label className="block text-[14px] font-bold text-white mb-1">
          Рабочее название книги:
        </label>
        <NoirVoiceInput
          value={draftTitle}
          onValueChange={onDraftTitleChange}
          voiceContext="new_book_draft_title"
          placeholder="Название книги из черновиков..."
        />
      </div>

      {/* Upload Text Files, Photo OCR, and Idea Basket */}
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={`draft-file-upload-${fileInputId}`}
          className="min-h-[44px] px-3.5 bg-zinc-900 border border-zinc-700 hover:bg-white hover:text-black text-white font-bold transition flex items-center gap-2 cursor-pointer text-[14px]"
        >
          <Upload className="w-4 h-4 text-rose-500" />
          <span>Файлы (.txt, .docx, .fb2, .pdf)</span>
        </label>
        <input
          id={`draft-file-upload-${fileInputId}`}
          type="file"
          multiple
          accept=".txt,.md,.fb2,.epub,.docx,.doc,.pdf"
          onChange={handleUploadDraftFiles}
          className="hidden"
        />

        <label
          htmlFor={`draft-ocr-upload-${fileInputId}`}
          className="min-h-[44px] px-3.5 bg-zinc-900 border border-rose-500 hover:bg-rose-600 text-white font-bold transition flex items-center gap-2 cursor-pointer text-[14px]"
          title="Загрузите фото рукописей или распечаток — ИИ распознает текст"
        >
          <Camera className="w-4 h-4 text-rose-400" />
          <span>Фото / скан (OCR)</span>
        </label>
        <input
          id={`draft-ocr-upload-${fileInputId}`}
          type="file"
          multiple
          accept="image/*"
          onChange={handleUploadPhotoOcr}
          className="hidden"
        />

        {basketIdeas.length > 0 && (
          <button
            type="button"
            onClick={() => setShowBasket(!showBasket)}
            className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-600 font-bold text-[14px] flex items-center gap-2 cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-rose-500" />
            <span>Из корзины идей ({basketIdeas.length})</span>
          </button>
        )}
      </div>

      {ocrPercent !== null && (
        <div className="p-3 bg-zinc-950 border border-rose-500 flex flex-col gap-1.5 text-[14px]">
          <div className="flex items-center justify-between gap-2">
            <span className="text-zinc-200 flex items-center gap-1.5">
              <ScanText className="w-4 h-4 text-rose-400" />
              <span>{ocrLabel || 'Распознавание текста со скана...'}</span>
            </span>
            <span className="font-mono text-rose-400 font-bold">{ocrPercent}%</span>
          </div>
          <div className="w-full h-1.5 bg-zinc-900 overflow-hidden">
            <div className="h-full bg-rose-600 transition-all duration-200" style={{ width: `${ocrPercent}%` }} />
          </div>
        </div>
      )}

      {showBasket && basketIdeas.length > 0 && (
        <div className="p-3 bg-zinc-950/90 border border-zinc-700 flex flex-col gap-2">
          <span className="text-[14px] font-bold text-white">Сохранённые идеи из корзины:</span>
          <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
            {basketIdeas.map((idea) => (
              <div
                key={idea.id}
                className="p-2 bg-zinc-900 border border-zinc-800 flex items-center justify-between gap-2 text-[14px]"
              >
                <div className="min-w-0 flex-1">
                  <strong className="text-white block truncate">{idea.title}</strong>
                  <span className="text-zinc-400 line-clamp-1">{idea.content}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handlePullFromBasket(idea)}
                  className="min-h-[36px] px-3 bg-white text-black font-bold text-[14px] shrink-0 cursor-pointer"
                >
                  + Взять
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual or Voice Draft Input */}
      <div className="p-3 bg-zinc-950 border border-zinc-800 flex flex-col gap-2.5">
        <span className="text-[14px] font-bold text-zinc-300">
          Добавить фрагмент текста или надиктовать голосом:
        </span>
        <NoirVoiceInput
          value={draftInputTitle}
          onValueChange={setDraftInputTitle}
          voiceContext="new_book_draft_fragment_title"
          placeholder="Заголовок фрагмента (например: Глава 1 или Сцена на площади)..."
        />
        <NoirVoiceTextarea
          value={draftInputContent}
          onValueChange={setDraftInputContent}
          voiceContext="new_book_draft_fragment_text"
          placeholder="Вставьте текст черновика, картинку Ctrl+V или надиктуйте голосом..."
          minRows={4}
        />
        <div className="flex justify-end">
          <NoirButton
            variant="outline"
            onClick={handleAddDraftFragment}
            disabled={!draftInputContent.trim() || isProcessing}
            icon={<Plus className="w-4 h-4 text-rose-500" />}
          >
            Добавить в список черновиков
          </NoirButton>
        </div>
      </div>

      {/* List of drafts */}
      {draftsList.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-[14px] font-bold text-white">
            Фрагменты книги ({draftsList.length} — нажмите на текст для редактирования):
          </span>
          <div className="flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
            {draftsList.map((item, idx) => (
              <div
                key={item.id}
                className="p-2.5 bg-zinc-900/90 border border-zinc-700 flex items-center justify-between gap-2.5 text-[14px]"
              >
                <button
                  type="button"
                  onClick={() => openEditModal(item)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer group"
                >
                  {item.sourceImageUrl ? (
                    <img
                      src={item.sourceImageUrl}
                      alt=""
                      className="w-9 h-9 object-cover border border-zinc-600 shrink-0"
                    />
                  ) : (
                    <span className="w-7 h-7 bg-zinc-800 text-white border border-zinc-600 flex items-center justify-center font-mono font-bold text-[14px] shrink-0">
                      {idx + 1}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <strong className="text-white group-hover:text-rose-400 block truncate transition-colors">
                      {item.title}
                    </strong>
                    <span className="text-zinc-400 text-[14px] font-mono block truncate">
                      {item.sourceType === 'ocr_image' ? 'скан OCR · ' : ''}
                      {item.charCount.toLocaleString()} симв. ({Math.round(item.charCount / 6)} слов)
                    </span>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditModal(item)}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 hover:border-white text-zinc-200 cursor-pointer"
                    title="Редактировать фрагмент"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDraft(idx, 'up')}
                    disabled={idx === 0}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Поднять выше"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDraft(idx, 'down')}
                    disabled={idx === draftsList.length - 1}
                    className="w-8 h-8 flex items-center justify-center bg-zinc-800 border border-zinc-700 hover:border-zinc-500 text-zinc-300 disabled:opacity-30 cursor-pointer"
                    title="Опустить ниже"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDraftsListChange((prev) => prev.filter((d) => d.id !== item.id))}
                    className="w-8 h-8 flex items-center justify-center bg-rose-950 border border-rose-800 text-rose-300 hover:bg-rose-900 cursor-pointer ml-0.5"
                    title="Удалить"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Volume & Cost Calculator */}
      {draftsList.length > 0 && (
        <div className="noir-container p-3.5 bg-zinc-950 border border-zinc-700 flex flex-col gap-2 text-[14px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-1.5">
            <div className="font-bold text-white flex items-center gap-2">
              <Coins className="w-4 h-4 text-rose-500" />
              <span>Расчет объема и стоимости анализа черновиков:</span>
            </div>
            <span
              className={`px-2 py-0.5 text-[14px] font-mono border ${
                currentBalance >= draftsCost.lettersCost
                  ? 'bg-zinc-900 text-white border-white'
                  : 'bg-rose-950 text-rose-300 border-rose-500'
              }`}
            >
              {currentBalance >= draftsCost.lettersCost ? 'Хватает средств' : 'Недостаточно букв'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[14px]">
            <div>
              <span className="text-zinc-400 block">Символов:</span>
              <strong className="text-white">{formatLettersCount(draftsCost.charCount)}</strong>
            </div>
            <div>
              <span className="text-zinc-400 block">Фрагментов:</span>
              <strong className="text-white">{draftsList.length}</strong>
            </div>
            <div>
              <span className="text-zinc-400 block">Стоимость ИИ:</span>
              <strong className="text-rose-400">{formatLettersCount(draftsCost.lettersCost)} букв</strong>
              <span className="text-zinc-400 block">≈ {draftsCost.rublesCost} ₽</span>
            </div>
            <div>
              <span className="text-zinc-400 block">Ваш баланс:</span>
              <strong className="text-white">{formatLettersCount(currentBalance)}</strong>
              <span className="text-zinc-500 block">≈ {lettersToRubles(currentBalance)} ₽</span>
            </div>
          </div>
        </div>
      )}

      {editingFrag && (
        <NoirModal
          isOpen={Boolean(editingFrag)}
          onClose={() => setEditingFrag(null)}
          title={`Редактирование фрагмента: ${editingFrag.title}`}
          maxWidth="max-w-3xl"
        >
          <div className="flex flex-col gap-3 text-white font-['PT_Serif',serif]">
            <NoirVoiceInput
              value={editFragTitle}
              onValueChange={setEditFragTitle}
              voiceContext="edit_fragment_title"
              placeholder="Название фрагмента..."
            />
            <NoirVoiceTextarea
              value={editFragContent}
              onValueChange={setEditFragContent}
              voiceContext="edit_fragment_body"
              minRows={10}
              maxRows={20}
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-zinc-800">
              <NoirButton variant="subtle" onClick={() => setEditingFrag(null)}>
                Отмена
              </NoirButton>
              <NoirButton
                variant="primary"
                onClick={saveEditModal}
                icon={<Save className="w-4 h-4 text-black" />}
              >
                Сохранить фрагмент
              </NoirButton>
            </div>
          </div>
        </NoirModal>
      )}
    </div>
  );
};
