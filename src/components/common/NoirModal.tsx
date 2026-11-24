import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface NoirModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export const NoirModal: React.FC<NoirModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  maxWidth = 'max-w-2xl',
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[500] flex justify-center items-center p-2.5 sm:p-4 bg-black/55 backdrop-blur-md overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`relative w-full ${maxWidth} my-auto max-h-[90dvh] flex flex-col noir-modal p-4 sm:p-6 text-white animate-in fade-in zoom-in-95 duration-150 rounded-none shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/20 shrink-0">
          <h3 className="text-[17px] font-bold text-white break-words pr-2 tracking-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center border border-white/30 bg-zinc-900 hover:bg-white hover:text-black text-white transition-colors rounded-none shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content with vertical scrolling when overflowing */}
        <div className="text-[14px] leading-relaxed text-zinc-200 overflow-y-auto flex-1 pr-1">
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};
