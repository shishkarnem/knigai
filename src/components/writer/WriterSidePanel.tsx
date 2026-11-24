import React, { useState } from 'react';
import {
  Check,
  Eye,
  Layers,
  MessageSquarePlus,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { Book, Chapter, WorldEntity } from '../../types';
import { DraftsManagerPanel } from '../drafts/DraftsManagerPanel';
import { AuthorAiCommentPanel } from '../drafts/AuthorAiCommentPanel';
import { NoirVoiceInput } from '../voice/NoirVoiceInput';
import { NoirButton } from '../common/NoirButton';
import { NoirStatus } from '../common/NoirStatus';
import { orchestrateFragmentAiAction } from '../../services/ai/orchestrator';
import { estimateTextOperationLetters, formatLettersCount } from '../../services/billing/costCalculator';

type SideTab = 'drafts' | 'comment' | 'ai' | 'entities';

interface WriterSidePanelProps {
  book: Book;
  chapter: Chapter;
  allChapters: Chapter[];
  worldEntities: WorldEntity[];
  content: string;
  selectedText: string;
  selectionStart: number;
  selectionEnd: number;
  selectedEntityIds: number[];
  authorComment: string;
  userUid?: number;
  onCloseMobile?: () => void;
  onInsertAtCursor: (text: string, replaceSelection?: boolean) => void;
  onSaveAuthorComment: (nextComment: string) => Promise<void>;
  onToggleEntity: (entityId: number) => void;
}

export const WriterSidePanel: React.FC<WriterSidePanelProps> = ({
  book,
  chapter,
  allChapters,
  worldEntities,
  content,
  selectedText,
  selectionStart,
  selectionEnd,
  selectedEntityIds,
  authorComment,
  userUid,
  onCloseMobile,
  onInsertAtCursor,
  onSaveAuthorComment,
  onToggleEntity,
}) => {
  const [activeTab, setActiveTab] = useState<SideTab>('drafts');
  const [aiMode, setAiMode] = useState<'rewrite' | 'expand' | 'dialogue' | 'continue'>(
    selectedText.trim() ? 'rewrite' : 'continue'
  );
  const [aiInstruction, setAiInstruction] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiProposal, setAiProposal] = useState<{ before: string; after: string; mode: string } | null>(null);
  const [showPreviewA5, setShowPreviewA5] = useState(false);

  const handleRunTargetedAi = async () => {
    setAiLoading(true);
    setAiError('');
    setAiProposal(null);
    try {
      const targetSelected = selectedText.trim();
      const beforeCtx = content.slice(0, selectionStart);
      const afterCtx = content.slice(selectionEnd);
      const effectiveMode = !targetSelected && aiMode === 'rewrite' ? 'continue' : aiMode;

      const res = await orchestrateFragmentAiAction({
        book,
        chapter: { ...chapter, author_comment: authorComment },
        selectedText: targetSelected,
        surroundingBefore: beforeCtx,
        surroundingAfter: afterCtx,
        instruction: aiInstruction,
        mode: effectiveMode,
        userUid,
      });

      setAiProposal({
        before: targetSelected || beforeCtx.slice(-260),
        after: res.resultText,
        mode: effectiveMode,
      });
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Ошибка точечного ИИ');
    } finally {
      setAiLoading(false);
    }
  };

  const applyAiProposal = () => {
    if (!aiProposal) return;
    const isReplacing = aiProposal.mode !== 'continue' && Boolean(selectedText.trim());
    onInsertAtCursor(aiProposal.after, isReplacing);
    setAiProposal(null);
  };

  return (
    <div className="w-full h-full flex flex-col bg-black/92 border-l border-zinc-800 text-white font-['PT_Serif',serif] min-w-0">
      {/* Header */}
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between gap-2 shrink-0">
        <span className="text-[15px] font-bold text-white">Студия автора</span>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center bg-zinc-900 border border-zinc-700 text-white cursor-pointer lg:hidden"
            aria-label="Закрыть панель"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Wrapping Switcher (NO horizontal scroll) */}
      <div className="p-2.5 border-b border-zinc-800 grid grid-cols-2 gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('drafts')}
          className={`min-h-[40px] px-2.5 text-[14px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'drafts'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span>Заметки</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('comment')}
          className={`min-h-[40px] px-2.5 text-[14px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'comment'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
          }`}
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0 text-rose-500" />
          <span>Коммент. ИИ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('ai')}
          className={`min-h-[40px] px-2.5 text-[14px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'ai'
              ? 'bg-rose-600 text-white border-rose-500'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-rose-500'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Точечный ИИ</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('entities')}
          className={`min-h-[40px] px-2.5 text-[14px] font-bold border flex items-center justify-center gap-1.5 cursor-pointer ${
            activeTab === 'entities'
              ? 'bg-white text-black border-white'
              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-white'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>Лор / А5</span>
        </button>
      </div>

      {/* Body Scroll */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 min-w-0">
        {activeTab === 'drafts' && (
          <DraftsManagerPanel
            book={book}
            chapters={allChapters}
            activeChapterNumber={chapter.chapter_number}
            userUid={userUid}
            compact
            onInsertIntoChapter={(txt) => onInsertAtCursor(`\n\n${txt.trim()}\n\n`, false)}
            onAssembleChapter={(combined) => onInsertAtCursor(`\n\n${combined.trim()}\n\n`, false)}
          />
        )}

        {activeTab === 'comment' && (
          <div className="flex flex-col gap-3">
            <AuthorAiCommentPanel
              compact
              title={`Указания к главе #${chapter.chapter_number}`}
              subtitle="Нейросеть читает этот комментарий при каскаде, правках и точечной генерации этой главы."
              value={authorComment}
              onSave={onSaveAuthorComment}
            />

            {book.author_instructions && (
              <div className="p-3 bg-zinc-950/80 border border-zinc-800 text-[14px] flex flex-col gap-1">
                <span className="font-bold text-rose-400">Общие указания книги:</span>
                <p className="text-zinc-300 whitespace-pre-line leading-relaxed">
                  {book.author_instructions}
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="flex flex-col gap-3">
            <div className="p-3 bg-zinc-950 border border-zinc-800 text-[14px]">
              <strong className="text-white block mb-1">
                {selectedText.trim()
                  ? `Выделено (${selectedText.length} симв.):`
                  : 'Режим курсора (текст не выделен — продолжение от конца фрагмента):'}
              </strong>
              <p className="text-zinc-400 line-clamp-3 italic break-words">
                {selectedText.trim() || content.slice(Math.max(0, selectionStart - 220), selectionStart) || 'Начните писать или диктовать текст...'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {[
                { id: 'rewrite', label: 'Улучшить' },
                { id: 'expand', label: 'Расширить' },
                { id: 'dialogue', label: 'Диалоги' },
                { id: 'continue', label: 'Продолжить' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setAiMode(m.id as typeof aiMode)}
                  className={`min-h-[38px] px-2 text-[14px] font-bold border cursor-pointer ${
                    aiMode === m.id
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-[14px] font-bold text-white mb-1">
                Уточнение для ИИ (голосом или текстом):
              </label>
              <NoirVoiceInput
                value={aiInstruction}
                onValueChange={setAiInstruction}
                voiceContext="writer_targeted_ai"
                placeholder="Например: добавь напряжения, дождь и реплику героя..."
              />
            </div>

            <div className="text-[14px] font-mono text-zinc-400">
              Списание ≈ {formatLettersCount(estimateTextOperationLetters(1400 + (selectedText.length || 600), 1400))} букв
            </div>

            <NoirButton
              variant="primary"
              onClick={handleRunTargetedAi}
              loading={aiLoading}
              icon={<Sparkles className="w-4 h-4 text-black" />}
              className="w-full"
            >
              Запустить точечный ИИ
            </NoirButton>

            {aiError && <NoirStatus type="error" message={aiError} />}

            {aiProposal && (
              <div className="p-3 bg-zinc-950 border border-rose-500 flex flex-col gap-2.5 text-[14px]">
                <span className="font-bold text-rose-400">Предложение ИИ (Было → Стало):</span>
                {aiProposal.before && (
                  <div className="p-2 bg-black border border-zinc-800 text-zinc-400 max-h-24 overflow-y-auto">
                    <span className="block text-zinc-500 font-bold">Было:</span>
                    {aiProposal.before.slice(0, 260)}
                  </div>
                )}
                <div className="p-2 bg-zinc-900 border border-zinc-700 text-white max-h-48 overflow-y-auto whitespace-pre-line">
                  <span className="block text-rose-400 font-bold mb-1">Стало:</span>
                  {aiProposal.after}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <NoirButton variant="subtle" onClick={() => setAiProposal(null)}>
                    Отклонить
                  </NoirButton>
                  <NoirButton
                    variant="primary"
                    onClick={applyAiProposal}
                    icon={<Check className="w-4 h-4 text-black" />}
                  >
                    Применить
                  </NoirButton>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'entities' && (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => setShowPreviewA5(!showPreviewA5)}
              className="min-h-[40px] px-3 bg-zinc-900 hover:bg-white hover:text-black text-white border border-zinc-700 text-[14px] font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <Eye className="w-4 h-4 text-rose-500" />
              <span>{showPreviewA5 ? 'Показать сущности лора' : 'Предпросмотр картинок и текста А5'}</span>
            </button>

            {showPreviewA5 ? (
              <div className="p-3 bg-zinc-950 border border-zinc-700 text-[14px] leading-relaxed flex flex-col gap-2">
                {content
                  .split('\n')
                  .filter((l) => l.trim())
                  .map((line, idx) => {
                    const imgMatch = line.trim().match(/^!\[(.*?)\]\((.*?)\)$/);
                    if (imgMatch) {
                      return (
                        <div key={idx} className="my-2 border border-zinc-700 p-1 bg-black">
                          <img src={imgMatch[2]} alt={imgMatch[1]} className="max-h-48 mx-auto object-contain" />
                        </div>
                      );
                    }
                    return (
                      <p key={idx} className="text-zinc-200 whitespace-pre-wrap break-words">
                        {line}
                      </p>
                    );
                  })}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <span className="text-[14px] font-bold text-white">
                  Участвуют в главе ({selectedEntityIds.length} из {worldEntities.length}):
                </span>
                {worldEntities.length === 0 ? (
                  <p className="text-[14px] text-zinc-400">Сущности мира пока не добавлены.</p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {worldEntities.map((ent) => {
                      const active = selectedEntityIds.includes(ent.id);
                      return (
                        <button
                          key={ent.id}
                          type="button"
                          onClick={() => onToggleEntity(ent.id)}
                          className={`p-2 text-left border text-[14px] flex items-center justify-between gap-2 cursor-pointer ${
                            active
                              ? 'bg-white text-black border-white font-bold'
                              : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-500'
                          }`}
                        >
                          <span className="truncate">{ent.name}</span>
                          <span className={`text-[14px] shrink-0 ${active ? 'text-rose-600' : 'text-zinc-500'}`}>
                            {active ? '✓ в главе' : '+ добавить'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
