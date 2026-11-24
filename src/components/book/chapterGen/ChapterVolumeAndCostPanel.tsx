import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FileText, Layers } from 'lucide-react';
import {
  A5_WORDS_PER_PAGE,
  GPT6_LUNA_SPECS,
} from '../../../services/ai/chapterBatchEngine';
import { ChapterCostBreakdown } from '../../../services/ai/chapters/chapterCostEstimator';
import { formatLettersCount } from '../../../services/billing/costCalculator';
import { PricingInfoModalButton } from '../../billing/PricingInfoModalButton';

interface ChapterVolumeAndCostPanelProps {
  targetPages: number;
  targetWords: number;
  onChangeVolume: (nextPages: number, nextWords: number) => void;
  breakdown: ChapterCostBreakdown;
  disabled?: boolean;
  compact?: boolean;
  title?: string;
}

export const ChapterVolumeAndCostPanel: React.FC<ChapterVolumeAndCostPanelProps> = ({
  targetPages,
  targetWords,
  onChangeVolume,
  breakdown,
  disabled = false,
  compact = false,
  title = 'Объём главы и расчёт стоимости (включая контекст)',
}) => {
  const [showFactors, setShowFactors] = useState(!compact);

  const handlePagesChange = (rawPages: number) => {
    const safePages = Math.max(1, Math.min(40, Math.round(rawPages || 1)));
    const syncedWords = Math.round(safePages * A5_WORDS_PER_PAGE);
    onChangeVolume(safePages, syncedWords);
  };

  const handleWordsChange = (rawWords: number) => {
    const safeWords = Math.max(200, Math.min(8000, Math.round(rawWords || 200)));
    const syncedPages = Math.max(1, Math.min(40, Math.round(safeWords / A5_WORDS_PER_PAGE)));
    onChangeVolume(syncedPages, safeWords);
  };

  const factorRows: Array<{ label: string; chars: number }> = [
    {
      label: 'Системный промпт, стиль и сюжетные архетипы',
      chars: breakdown.factors.systemAndMetaChars,
    },
    {
      label: 'Хроника и стык предыдущих глав',
      chars: breakdown.factors.rollingHistoryChars,
    },
    {
      label: 'Выбранные персонажи, окружение и лор мира',
      chars: breakdown.factors.entitiesLoreChars,
    },
    {
      label: 'Общие указания автора к книге',
      chars: breakdown.factors.authorInstructionsChars,
    },
    {
      label: 'Комментарий автора к этой главе',
      chars: breakdown.factors.chapterCommentChars,
    },
    {
      label: 'Активные черновики и заметки для ИИ',
      chars: breakdown.factors.activeDraftsChars,
    },
  ];

  if (breakdown.factors.existingTextChars > 0) {
    factorRows.push({
      label: 'Исходный текст главы (передаётся при ИИ-правке)',
      chars: breakdown.factors.existingTextChars,
    });
  }

  return (
    <div className="p-3.5 bg-zinc-950/90 border border-zinc-700 flex flex-col gap-3 rounded-none min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="w-4 h-4 text-rose-500 shrink-0" />
          <span className="text-[14px] font-bold text-white break-words">{title}</span>
        </div>
        <PricingInfoModalButton compact />
      </div>

      {/* Pages (A5) + Words Synchronized Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* A5 Pages */}
        <div className="p-2.5 bg-black/70 border border-zinc-800 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[14px] font-bold text-zinc-200">
              Страниц (А5):
            </label>
            <input
              type="number"
              min={1}
              max={40}
              disabled={disabled}
              value={targetPages}
              onChange={(e) => handlePagesChange(Number(e.target.value))}
              className="w-24 min-h-[38px] px-2 noir-input text-center font-mono font-bold text-[15px] rounded-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GPT6_LUNA_SPECS.chapterPagePresets.map((p) => {
              const active = targetPages === p;
              return (
                <button
                  key={`pg-${p}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handlePagesChange(p)}
                  className={`min-h-[34px] px-2.5 text-[14px] font-bold border transition cursor-pointer rounded-none ${
                    active
                      ? 'bg-white text-black border-white'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
                  }`}
                >
                  {p} стр.
                </button>
              );
            })}
          </div>
        </div>

        {/* Words */}
        <div className="p-2.5 bg-black/70 border border-zinc-800 flex flex-col gap-2 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[14px] font-bold text-zinc-200">
              Количество слов:
            </label>
            <input
              type="number"
              min={200}
              max={8000}
              step={100}
              disabled={disabled}
              value={targetWords}
              onChange={(e) => handleWordsChange(Number(e.target.value))}
              className="w-28 min-h-[38px] px-2 noir-input text-center font-mono font-bold text-[15px] rounded-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {GPT6_LUNA_SPECS.chapterWordPresets.map((w) => {
              const active = Math.abs(targetWords - w) <= 40;
              return (
                <button
                  key={`wd-${w}`}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleWordsChange(w)}
                  className={`min-h-[34px] px-2.5 text-[14px] font-bold border transition cursor-pointer rounded-none ${
                    active
                      ? 'bg-rose-600 text-white border-rose-500'
                      : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-white'
                  }`}
                >
                  {w} сл.
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[14px] text-zinc-400">
        Ориентир: 1 стр. А5 ≈ 200 слов ≈ 1 320 симв. · Целевой текст:{' '}
        <strong className="text-white">
          ~{(breakdown.targetChars / (Math.max(1, breakdown.chaptersCount) || 1)).toLocaleString('ru-RU')} симв.
        </strong>
        {breakdown.chaptersCount > 1 && (
          <span className="text-rose-400 font-bold">
            {' '}
            (пакет {breakdown.chaptersCount} гл. · всего ~{breakdown.targetChars.toLocaleString('ru-RU')} симв.)
          </span>
        )}
      </p>

      {/* Letters Cost Breakdown Box: Output + Extra Context + Total */}
      <div className="p-3 bg-black/85 border border-rose-500/70 flex flex-col gap-2.5 rounded-none">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="p-2.5 bg-zinc-950/90 border border-zinc-800">
            <span className="text-[14px] text-zinc-400 block">Текст главы (выход):</span>
            <strong className="text-[16px] font-mono text-white">
              ~{formatLettersCount(breakdown.outputLetters)} б.
            </strong>
            <span className="text-[14px] text-zinc-500 block">
              ~{breakdown.targetPages} стр. / ~{breakdown.targetWords} сл.
            </span>
          </div>

          <div className="p-2.5 bg-zinc-950/90 border border-rose-500/50">
            <span className="text-[14px] text-rose-300 block">Дополнительно на контекст:</span>
            <strong className="text-[16px] font-mono text-rose-400">
              +{formatLettersCount(breakdown.contextLetters)} б.
            </strong>
            <span className="text-[14px] text-zinc-400 block">
              ~{breakdown.totalContextChars.toLocaleString('ru-RU')} симв. входа
            </span>
          </div>

          <div className="p-2.5 bg-zinc-900/90 border border-white/80">
            <span className="text-[14px] text-zinc-300 block">Итого примерно:</span>
            <strong className="text-[17px] font-mono text-white">
              ≈ {formatLettersCount(breakdown.totalEstimatedLetters)} б.
            </strong>
            <span className="text-[14px] font-mono text-rose-400 block">
              ≈ {breakdown.estimatedRubles.toFixed(2)} ₽
            </span>
          </div>
        </div>

        {/* Toggle Factor Details */}
        <button
          type="button"
          onClick={() => setShowFactors(!showFactors)}
          className="w-full min-h-[36px] px-3 bg-zinc-950 hover:bg-zinc-900 border border-zinc-800 text-[14px] text-zinc-200 font-bold flex items-center justify-between gap-2 cursor-pointer rounded-none transition"
        >
          <span className="flex items-center gap-1.5 min-w-0 text-left">
            <Layers className="w-4 h-4 text-rose-500 shrink-0" />
            <span>
              Факторы контекста ({breakdown.totalContextChars.toLocaleString('ru-RU')} симв. → +{formatLettersCount(breakdown.contextLetters)} букв)
            </span>
          </span>
          {showFactors ? (
            <ChevronUp className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-400 shrink-0" />
          )}
        </button>

        {showFactors && (
          <div className="flex flex-col gap-1.5 pt-1 border-t border-zinc-800/80 text-[14px]">
            {factorRows.map((row) => {
              const estFactorLetters = row.chars > 0 ? Math.ceil(row.chars / 2.5) : 0;
              return (
                <div
                  key={row.label}
                  className="flex flex-wrap items-center justify-between gap-2 py-1 border-b border-zinc-900 last:border-b-0"
                >
                  <span className={row.chars > 0 ? 'text-zinc-200' : 'text-zinc-500'}>
                    {row.label}:
                  </span>
                  <span className="font-mono text-zinc-300 shrink-0">
                    {row.chars > 0 ? (
                      <>
                        {row.chars.toLocaleString('ru-RU')} симв.{' '}
                        <strong className="text-rose-400">(+{formatLettersCount(estFactorLetters)} б.)</strong>
                      </>
                    ) : (
                      <span className="text-zinc-600">0 симв. (не задано)</span>
                    )}
                  </span>
                </div>
              );
            })}

            {breakdown.qa763ReserveLetters > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 py-1">
                <span className="text-zinc-200">Контроль завершённости сцены (763):</span>
                <span className="font-mono text-rose-400 font-bold shrink-0">
                  +{formatLettersCount(breakdown.qa763ReserveLetters)} б.
                </span>
              </div>
            )}

            {breakdown.chaptersCount > 1 && (
              <p className="text-[14px] text-zinc-400 pt-1">
                Для пакета из {breakdown.chaptersCount} глав контекст пересчитывается по каждой следующей главе с учётом хроники предыдущих.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
