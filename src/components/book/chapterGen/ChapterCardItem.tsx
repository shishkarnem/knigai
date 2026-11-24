import React from 'react';
import { BookOpen, Edit2, Feather, Headphones, Image as ImageIcon, Maximize2, Mic } from 'lucide-react';
import { Chapter } from '../../../types';
import { estimateA5Pages } from '../../../services/ai/chapterBatchEngine';
import { NoirButton } from '../../common/NoirButton';

interface ChapterCardItemProps {
  chapter: Chapter;
  readOnly: boolean;
  chapterScore?: number;
  scoringLoading: boolean;
  chapterAudioCount?: number;
  onOpenWriter: (chap: Chapter) => void;
  onOpenArt: (chap: Chapter) => void;
  onOpenAudio?: (chap: Chapter) => void;
  onOpenInspect: (chap: Chapter) => void;
  onOpenEdit: (chap: Chapter) => void;
  onScore763: (chap: Chapter) => void;
  onOpenReader?: (chapterNumber: number) => void;
}

export const ChapterCardItem: React.FC<ChapterCardItemProps> = ({
  chapter: chap,
  readOnly,
  chapterScore,
  scoringLoading,
  chapterAudioCount = 0,
  onOpenWriter,
  onOpenArt,
  onOpenAudio,
  onOpenInspect,
  onOpenEdit,
  onScore763,
  onOpenReader,
}) => {
  const hasText = Boolean(chap.content && chap.content.trim().length > 100);
  const hasAudio = Boolean(chap.audio_url) || chapterAudioCount > 0;
  const wordCount = chap.content ? chap.content.split(/\s+/).filter(Boolean).length : 0;
  const estPages = estimateA5Pages(chap.content);

  return (
    <div className="noir-container p-4 sm:p-5 border border-zinc-700 hover:border-white transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      {/* Left info */}
      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        <div className="w-11 h-11 bg-white text-black border border-white flex items-center justify-center font-black text-[16px] tabular-nums shrink-0">
          {chap.chapter_number}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[16px] font-bold text-white break-words">
              {chap.title}
            </h3>
            {hasText ? (
              <span className="text-[14px] font-mono text-zinc-300">
                · ~{estPages} стр. А5 ({wordCount} слов)
              </span>
            ) : (
              <span className="text-[14px] text-zinc-500">
                · синопсис готов
              </span>
            )}
            {chap.illustration_url && (
              <span className="text-[14px] font-bold text-rose-400 underline">
                · арт готов
              </span>
            )}
            {hasAudio && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-black border border-rose-500 text-rose-400 text-[14px] font-mono font-bold">
                <Headphones className="w-3.5 h-3.5" />
                <span>{chapterAudioCount > 1 ? `голос (${chapterAudioCount})` : 'озвучена'}</span>
              </span>
            )}
            {chap.author_comment?.trim() && (
              <span className="text-[14px] text-rose-400">
                · указание ИИ
              </span>
            )}
          </div>
          <p className="text-[14px] text-zinc-300 mt-1 leading-relaxed line-clamp-2">
            {chap.synopsis || 'Синопсис формируется...'}
          </p>
        </div>
      </div>

      {/* Right actions */}
      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800">
        {!readOnly && (
          <>
            <button
              type="button"
              onClick={() => onOpenWriter(chap)}
              className="min-h-[44px] px-3.5 bg-rose-950/60 hover:bg-rose-600 text-white border border-rose-500 text-[14px] font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Полноэкранный редактор Блокнот / Word с диктовкой, ИИ и картинками"
            >
              <Maximize2 className="w-4 h-4 text-rose-400" />
              <span>Режим писателя</span>
            </button>

            <button
              onClick={() => onOpenArt(chap)}
              className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <ImageIcon className="w-4 h-4" />
              <span>Иллюстрация</span>
            </button>

            {onOpenAudio && (
              <button
                type="button"
                onClick={() => onOpenAudio(chap)}
                className={`min-h-[44px] px-3.5 border text-[14px] font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                  hasAudio
                    ? 'bg-black hover:bg-rose-600 text-rose-400 hover:text-white border-rose-500'
                    : 'bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border-zinc-700'
                }`}
                title="Записать чтение с суфлёром или загрузить аудиофайл главы"
              >
                <Mic className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{hasAudio ? 'Озвучка' : 'Голос'}</span>
              </button>
            )}

            <button
              onClick={() => onOpenInspect(chap)}
              className="min-h-[44px] px-3.5 bg-zinc-900 hover:bg-white hover:text-black text-zinc-200 border border-zinc-700 text-[14px] font-bold transition-colors inline-flex items-center gap-1.5 cursor-pointer"
              title="Открыть генератор с выбором сущностей и объёма, редактор текста главы"
            >
              <Edit2 className="w-4 h-4" />
              <span>Правка</span>
            </button>

            {hasText && (
              <button
                type="button"
                disabled={scoringLoading}
                onClick={() => onScore763(chap)}
                className="min-h-[44px] px-3 bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-zinc-700 text-[14px] font-bold transition cursor-pointer disabled:opacity-50"
                title="Быстрая оценка качества главы через 763 (0.25x)"
              >
                {scoringLoading
                  ? 'Оценка...'
                  : chapterScore
                  ? `763: ${chapterScore}/5`
                  : 'Оценка 763'}
              </button>
            )}

            <button
              onClick={() => onOpenEdit(chap)}
              className="min-h-[44px] px-3 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white border border-zinc-700 text-[14px] font-medium transition cursor-pointer"
              title="Свойства: название, синопсис и комментарий ИИ"
            >
              Свойства
            </button>
          </>
        )}

        {hasText ? (
          <NoirButton
            variant="primary"
            onClick={() => (onOpenReader ? onOpenReader(chap.chapter_number) : onOpenInspect(chap))}
            icon={<BookOpen className="w-4 h-4 text-black" />}
          >
            Читать текст
          </NoirButton>
        ) : !readOnly ? (
          <NoirButton
            variant="primary"
            onClick={() => onOpenInspect(chap)}
            icon={<Feather className="w-4 h-4 text-black" />}
          >
            Каскад текста
          </NoirButton>
        ) : null}
      </div>
    </div>
  );
};
