import React, { useState } from 'react';
import { HelpCircle, Check, Sparkles, ChevronDown, ChevronUp } from 'lucide-react';
import { BASIC_PLOTS, BasicPlotId, BasicPlotDefinition, getBasicPlotsByIds } from '../../constants/basicPlots';

interface BasicPlotSelectorProps {
  selectedPlotIds: string[];
  onChange: (plotIds: string[]) => void;
  maxSelections?: number;
  label?: string;
  sublabel?: string;
}

export const BasicPlotSelector: React.FC<BasicPlotSelectorProps> = ({
  selectedPlotIds,
  onChange,
  maxSelections = 3,
  label = 'Фундаментальный сюжет (7 шаблонов KnigAI):',
  sublabel = 'Выберите ведущий сюжет или скомбинируйте до 3 архетипов для глубокой драматургии книги.',
}) => {
  const [expandedPlotId, setExpandedPlotId] = useState<string | null>(null);

  const togglePlot = (id: BasicPlotId) => {
    if (selectedPlotIds.includes(id)) {
      // Don't allow unselecting if it's the only one? Or allow empty? Allow toggle off
      onChange(selectedPlotIds.filter((p) => p !== id));
    } else {
      if (selectedPlotIds.length >= maxSelections) {
        // Replace the oldest or prevent? Let's take the last (maxSelections - 1) and add new
        const trimmed = selectedPlotIds.slice(1);
        onChange([...trimmed, id]);
      } else {
        onChange([...selectedPlotIds, id]);
      }
    }
  };

  const selectedDefs = getBasicPlotsByIds(selectedPlotIds);

  return (
    <div className="w-full flex flex-col gap-2.5">
      <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
        <div>
          <label className="text-[14px] font-bold text-white flex items-center gap-1.5">
            <span>{label}</span>
            {selectedPlotIds.length > 0 && (
              <span className="text-[14px] font-bold text-rose-500">
                ({selectedPlotIds.length} из {maxSelections})
              </span>
            )}
          </label>
          {sublabel && (
            <p className="text-[14px] text-zinc-400 mt-0.5 leading-snug">
              {sublabel}
            </p>
          )}
        </div>

        {selectedDefs.length > 1 && (
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-900 border border-zinc-700 text-[14px] text-white">
            <Sparkles className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>
              комбинация:{' '}
              <strong className="text-rose-400 font-semibold">
                {selectedDefs.map((p) => p.badgeShort).join(' + ')}
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Grid of the 7 Plots formatted as Noir message-bubble cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {BASIC_PLOTS.map((plot: BasicPlotDefinition) => {
          const isSelected = selectedPlotIds.includes(plot.id);
          const isExpanded = expandedPlotId === plot.id;

          return (
            <div
              key={plot.id}
              className={`border transition-all flex flex-col justify-between ${
                isSelected
                  ? 'bg-zinc-950 border-white ring-1 ring-white shadow-[0_0_12px_rgba(255,255,255,0.15)]'
                  : 'bg-zinc-900/80 border-zinc-700 hover:border-zinc-500 hover:bg-zinc-900'
              }`}
            >
              {/* Card Header & Selection Button */}
              <button
                type="button"
                onClick={() => togglePlot(plot.id)}
                className="w-full text-left p-3 flex items-start gap-3 cursor-pointer group"
              >
                <div
                  className={`w-5 h-5 shrink-0 border flex items-center justify-center mt-0.5 transition-colors ${
                    isSelected
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-black border-zinc-600 group-hover:border-zinc-400'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[14px] font-bold text-white group-hover:text-zinc-200">
                      {plot.number}. {plot.title}
                    </span>
                    <span className="text-[14px] font-mono text-zinc-400 text-right">
                      {plot.englishTitle}
                    </span>
                  </div>
                  <p className="text-[14px] text-zinc-300 mt-1 leading-snug">
                    {plot.tagline}
                  </p>
                </div>
              </button>

              {/* Card Footer: Detail Toggle & Preview */}
              <div className="px-3 pb-2.5 pt-1 border-t border-zinc-800/80 flex items-center justify-between">
                <span className="text-[14px] text-zinc-400 italic truncate mr-2">
                  {plot.examples.slice(0, 2).join(', ')}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPlotId(isExpanded ? null : plot.id);
                  }}
                  className="text-[14px] text-zinc-400 hover:text-white inline-flex items-center gap-1 cursor-pointer shrink-0 px-1 py-0.5 bg-zinc-950 border border-zinc-800"
                >
                  <HelpCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span>{isExpanded ? 'скрыть' : 'суть'}</span>
                  {isExpanded ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                </button>
              </div>

              {/* Expanded Details Drawer */}
              {isExpanded && (
                <div className="p-3 bg-black/90 border-t border-zinc-700 text-zinc-200 flex flex-col gap-2 text-[14px] leading-relaxed">
                  <div>
                    <span className="font-bold text-rose-400">описание: </span>
                    <span className="text-zinc-300">{plot.description}</span>
                  </div>
                  <div>
                    <span className="font-bold text-white">• суть: </span>
                    <span className="text-zinc-300">{plot.essence}</span>
                  </div>
                  <div>
                    <span className="font-bold text-white">• примеры: </span>
                    <span className="text-zinc-300">{plot.examples.join(', ')}</span>
                  </div>
                  <div>
                    <span className="font-bold text-white">• сюжетные вехи: </span>
                    <ol className="list-decimal list-inside text-zinc-300 space-y-0.5 mt-1">
                      {plot.narrativeBeats.map((b, i) => (
                        <li key={i}>{b}</li>
                      ))}
                    </ol>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
