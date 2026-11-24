import React from 'react';
import { Chapter } from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { PageData } from '../BookFlipPage';

interface DirectPageJumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalPages: number;
  currentPage: number;
  pageJumpInput: string;
  onPageJumpInputChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onGoToCover: () => void;
}

export const DirectPageJumpModal: React.FC<DirectPageJumpModalProps> = ({
  isOpen,
  onClose,
  totalPages,
  currentPage,
  pageJumpInput,
  onPageJumpInputChange,
  onSubmit,
  onGoToCover,
}) => {
  if (!isOpen) return null;

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Быстрый переход к странице"
      maxWidth="max-w-md"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4 text-white">
        <p className="text-[14px] text-zinc-300">
          Введите номер страницы от 1 до {totalPages}:
        </p>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={totalPages}
            value={pageJumpInput}
            onChange={(e) => onPageJumpInputChange(e.target.value)}
            placeholder={`1 - ${totalPages}`}
            autoFocus
            className="flex-1 px-4 py-2 bg-zinc-900 border border-zinc-700 text-white font-mono text-[18px] font-bold focus:border-rose-500 outline-none"
          />
          <button
            type="submit"
            className="min-h-[44px] px-6 bg-white text-black font-bold text-[14px] hover:bg-zinc-200 transition cursor-pointer"
          >
            Перейти
          </button>
        </div>
        <div className="flex items-center justify-between text-[14px] text-zinc-400 pt-2 border-t border-zinc-800">
          <span>Текущая страница: <strong className="text-white font-mono">{currentPage + 1}/{totalPages}</strong></span>
          <button
            type="button"
            onClick={onGoToCover}
            className="text-rose-400 hover:text-rose-300 underline cursor-pointer"
          >
            К обложке (стр. 1)
          </button>
        </div>
      </form>
    </NoirModal>
  );
};

interface TableOfContentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  computedPages: PageData[];
  currentPage: number;
  activeChapterNumber: number;
  onSelectPage: (idx: number) => void;
}

export const TableOfContentsModal: React.FC<TableOfContentsModalProps> = ({
  isOpen,
  onClose,
  chapters,
  computedPages,
  currentPage,
  activeChapterNumber,
  onSelectPage,
}) => {
  if (!isOpen) return null;

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={onClose}
      title="Оглавление книги"
      maxWidth="max-w-2xl"
    >
      <div className="flex flex-col gap-4 text-white max-h-[70vh] overflow-y-auto pr-1">
        <p className="text-[14px] text-zinc-400">
          Выберите главу для перехода к соответствующей странице:
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              onSelectPage(0);
              onClose();
            }}
            className={`p-3 text-left border flex items-center justify-between gap-3 transition cursor-pointer ${
              currentPage === 0
                ? 'bg-white text-black border-white font-bold'
                : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-500'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="w-8 h-8 bg-zinc-900 text-white border border-zinc-700 flex items-center justify-center font-mono font-bold text-[14px]">
                ★
              </span>
              <span className="text-[15px] font-bold">Титульный лист и обложка</span>
            </div>
            <span className="font-mono text-[14px]">Обложка</span>
          </button>

          {chapters.map((ch) => {
            const targetIdx = computedPages.findIndex((p) => p.chapterNumber === ch.chapter_number);
            const pageNum = targetIdx >= 0 ? computedPages[targetIdx].pageNumber : 1;
            const isCurrent = activeChapterNumber === ch.chapter_number;

            return (
              <button
                key={ch.id || ch.chapter_number}
                type="button"
                onClick={() => {
                  if (targetIdx >= 0) {
                    onSelectPage(targetIdx);
                  }
                  onClose();
                }}
                className={`p-3 text-left border flex items-center justify-between gap-3 transition cursor-pointer ${
                  isCurrent
                    ? 'bg-white text-black border-white font-bold'
                    : 'bg-zinc-950 text-zinc-200 border-zinc-800 hover:border-zinc-500'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 bg-zinc-900 text-white border border-zinc-700 flex items-center justify-center font-mono font-bold text-[14px] shrink-0">
                    {ch.chapter_number}
                  </span>
                  <div className="truncate">
                    <span className="text-[15px] font-bold block truncate">{ch.title}</span>
                    {ch.synopsis && (
                      <span className="text-[14px] text-zinc-400 block truncate">{ch.synopsis}</span>
                    )}
                  </div>
                </div>
                <span className="font-mono text-[14px] shrink-0">Стр. {pageNum}</span>
              </button>
            );
          })}
        </div>
      </div>
    </NoirModal>
  );
};
