import React from 'react';
import { Loader2 } from 'lucide-react';

interface NoirButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'outline' | 'subtle' | 'danger';
  loading?: boolean;
  icon?: React.ReactNode;
  showTail?: boolean;
}

export const NoirButton: React.FC<NoirButtonProps> = ({
  children,
  variant = 'primary',
  loading = false,
  icon,
  className = '',
  disabled,
  showTail = true,
  ...props
}) => {
  // Base message bubble classes: zero rounded corners, angular speech bubble silhouette
  const baseClasses =
    'relative min-h-[44px] px-5 py-2.5 text-[14px] font-bold transition-all inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none text-center rounded-none shadow-md group';

  // SVG Speech Bubble Tail Helper: no top border, matching fill and outline stroke
  const renderBubbleTail = (fillClass: string, strokeClass: string) => {
    if (!showTail) return null;
    return (
      <svg
        aria-hidden="true"
        className="absolute -bottom-[7.5px] left-3.5 w-[14px] h-[8px] overflow-visible pointer-events-none z-10"
        viewBox="0 0 14 8"
      >
        {/* Triangle fill matches button background */}
        <polygon points="0,0 3.5,8 14,0" className={`${fillClass} transition-colors`} />
        {/* Triangle left and right edges match button border (NO top edge) */}
        <polyline
          points="0,0 3.5,8 14,0"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="square"
          className={`${strokeClass} transition-colors`}
        />
      </svg>
    );
  };

  if (variant === 'primary') {
    return (
      <button
        disabled={disabled || loading}
        className={`${baseClasses} noir-btn-primary ${className}`}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-black" /> : icon}
        <span>{children}</span>
        {renderBubbleTail('fill-white group-hover:fill-zinc-200', 'stroke-white group-hover:stroke-zinc-200')}
      </button>
    );
  }

  if (variant === 'outline') {
    return (
      <button
        disabled={disabled || loading}
        className={`${baseClasses} noir-btn-outline bg-black/80 hover:bg-white hover:text-black border border-white/50 hover:border-white ${className}`}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-white" /> : icon}
        <span>{children}</span>
        {renderBubbleTail(
          'fill-black group-hover:fill-white',
          'stroke-white/50 group-hover:stroke-white'
        )}
      </button>
    );
  }

  if (variant === 'danger') {
    return (
      <button
        disabled={disabled || loading}
        className={`${baseClasses} bg-rose-950/80 text-rose-200 border border-rose-500 hover:bg-rose-900 ${className}`}
        {...props}
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-rose-200" /> : icon}
        <span>{children}</span>
        {renderBubbleTail('fill-rose-950 group-hover:fill-rose-900', 'stroke-rose-500')}
      </button>
    );
  }

  // Subtle
  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} noir-btn-subtle bg-zinc-950 hover:bg-zinc-900 border border-zinc-700 hover:border-zinc-500 ${className}`}
      {...props}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin text-zinc-300" /> : icon}
      <span>{children}</span>
      {renderBubbleTail(
        'fill-zinc-950 group-hover:fill-zinc-900',
        'stroke-zinc-700 group-hover:stroke-zinc-500'
      )}
    </button>
  );
};

