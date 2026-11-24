import React from 'react';
import { getBasicPlotsByIds, BasicPlotDefinition } from '../../constants/basicPlots';

interface BasicPlotBadgeProps {
  plotIds?: string[];
  size?: 'sm' | 'md';
  showDetails?: boolean;
}

export const BasicPlotBadge: React.FC<BasicPlotBadgeProps> = ({
  plotIds,
  size = 'md',
}) => {
  const plots = getBasicPlotsByIds(plotIds);
  if (plots.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {plots.map((plot: BasicPlotDefinition) => (
        <span
          key={plot.id}
          title={`${plot.title} (${plot.englishTitle}): ${plot.essence}`}
          className={`inline-flex items-center gap-1 border border-rose-600/70 bg-zinc-950 text-rose-300 font-medium ${
            size === 'sm' ? 'px-2 py-0.5 text-[14px]' : 'px-2.5 py-1 text-[14px]'
          }`}
        >
          <span className="w-1.5 h-1.5 bg-rose-500 shrink-0" />
          <span>{plot.title}</span>
        </span>
      ))}
    </div>
  );
};
