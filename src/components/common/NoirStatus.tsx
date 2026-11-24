import React from 'react';
import { AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';

interface NoirStatusProps {
  type?: 'info' | 'success' | 'error' | 'loading';
  message: string;
}

export const NoirStatus: React.FC<NoirStatusProps> = ({
  type = 'info',
  message,
}) => {
  if (!message) return null;

  // STRICT RULE: No green or blue tones! Noir black, white, zinc, and amber
  const styles = {
    info: 'bg-zinc-900 border-zinc-500 text-zinc-100',
    success: 'bg-zinc-950 border-white text-white',
    error: 'bg-rose-950/80 border-rose-500 text-rose-100',
    loading: 'bg-zinc-900 border-amber-400 text-amber-200',
  };

  const icons = {
    info: <Info className="w-5 h-5 text-zinc-300 shrink-0" />,
    success: <CheckCircle2 className="w-5 h-5 text-white shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    loading: <Loader2 className="w-5 h-5 text-amber-400 animate-spin shrink-0" />,
  };

  return (
    <div className={`w-full p-3.5 border-2 flex items-center gap-3 shadow-md rounded-none ${styles[type]}`}>
      {icons[type]}
      <p className="text-[14px] font-semibold leading-snug break-words flex-1">
        {message}
      </p>
    </div>
  );
};
