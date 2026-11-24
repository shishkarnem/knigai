import React, { useState } from 'react';
import { Download, ExternalLink, Check, Sparkles, AlertCircle, FileText, Globe } from 'lucide-react';
import { PlatformMetadata, PlatformPublishingPackage } from '../../services/platforms/types';
import { Book, Chapter } from '../../types';
import { generatePublishingPackage } from '../../services/platforms';

interface PlatformPublishCardProps {
  platform: PlatformMetadata;
  book: Book;
  chapters: Chapter[];
}

export const PlatformPublishCard: React.FC<PlatformPublishCardProps> = ({
  platform,
  book,
  chapters,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedPackage, setGeneratedPackage] = useState<PlatformPublishingPackage | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const pkg = await generatePublishingPackage(platform.id, book, chapters);
      setGeneratedPackage(pkg);
    } catch (err: any) {
      setErrorMessage(err.message || 'Ошибка генерации пакета для публикации');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedPackage) return;
    const url = URL.createObjectURL(generatedPackage.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = generatedPackage.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="w-full bg-zinc-950/70 border border-zinc-700 hover:border-white p-4 transition-all flex flex-col justify-between gap-3 font-['PT_Serif',serif] relative">
      <div className="flex flex-col gap-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col">
            <h4 className="text-[17px] font-bold text-white flex items-center gap-2">
              <span>{platform.name}</span>
            </h4>
            <span className="text-[14px] text-zinc-400">
              {platform.tagline}
            </span>
          </div>

          <a
            href={platform.directUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-500 transition cursor-pointer shrink-0"
            title="Открыть сайт платформы"
          >
            <ExternalLink className="w-4 h-4 text-rose-500" />
          </a>
        </div>

        {/* Supported formats & audience badges */}
        <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-mono">
          <span className="px-2 py-0.5 bg-black border border-rose-500 text-rose-400 font-bold">
            {platform.supportedFormats.join(', ')}
          </span>
          <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300">
            {platform.audience}
          </span>
        </div>

        {/* Description */}
        <p className="text-[14px] text-zinc-300 leading-relaxed font-serif">
          {platform.description}
        </p>

        {/* Generated Summary if ready */}
        {generatedPackage && (
          <div className="p-3 bg-zinc-900/90 border border-rose-500 text-[14px] flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-rose-400 font-mono font-bold">
              <Check className="w-4 h-4 text-rose-500" />
              <span>Пакет успешно сформирован: {generatedPackage.filename}</span>
            </div>
            <p className="text-zinc-200">
              {generatedPackage.summary}
            </p>

            <div className="mt-1 flex flex-col gap-1 text-[14px] text-zinc-400 border-t border-zinc-800 pt-1.5">
              <span className="font-bold text-zinc-300">Инструкция по выкладыванию:</span>
              {generatedPackage.submissionInstructions.map((step, idx) => (
                <div key={idx} className="flex items-start gap-1.5">
                  <span className="text-rose-500 font-mono">{idx + 1}.</span>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="p-2.5 bg-rose-950/70 border border-rose-600 text-rose-200 text-[14px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Action buttons styled as message bubbles without rounded corners */}
      <div className="pt-2 border-t border-zinc-800 flex flex-wrap items-center gap-2">
        {!generatedPackage ? (
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating}
            className="min-h-[42px] px-4 py-1.5 bg-white text-black hover:bg-zinc-200 border-2 border-white text-[14px] font-bold flex items-center gap-2 cursor-pointer transition relative"
            style={{
              clipPath: 'polygon(0% 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 12px) 100%, 0% 100%)',
            }}
          >
            <Sparkles className="w-4 h-4 text-rose-600" />
            <span>{isGenerating ? 'Подготовка пакета...' : 'Сформировать пакет для публикации'}</span>
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleDownload}
              className="min-h-[42px] px-4 py-1.5 bg-white text-black hover:bg-zinc-200 border-2 border-white text-[14px] font-bold flex items-center gap-2 cursor-pointer transition relative"
              style={{
                clipPath: 'polygon(0% 0%, 100% 0%, 100% calc(100% - 6px), calc(100% - 12px) 100%, 0% 100%)',
              }}
            >
              <Download className="w-4 h-4 text-black" />
              <span>Скачать {generatedPackage.filename}</span>
            </button>

            <a
              href={generatedPackage.directPublishUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-rose-400 border border-rose-500 hover:border-white text-[14px] font-bold flex items-center gap-1.5 cursor-pointer transition"
            >
              <Globe className="w-4 h-4 text-rose-500" />
              <span>Перейти к загрузке</span>
            </a>
          </>
        )}
      </div>
    </div>
  );
};
