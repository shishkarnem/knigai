import React from 'react';
import { BookOpen, Headphones, Download, Palette, Check, HardDrive, Globe, Eye } from 'lucide-react';
import { ParsedBookSearchResult } from '../../types';

interface ParserResultCardProps {
  item: ParsedBookSearchResult;
  isImporting: boolean;
  isImported: boolean;
  isAlreadyInLibrary?: boolean;
  onImport: (item: ParsedBookSearchResult, chosenFormat?: string) => void;
  onOpenCoverEditor?: (item: ParsedBookSearchResult) => void;
  onOpenReader?: () => void;
  onOpenDetails?: (item: ParsedBookSearchResult) => void;
}

export const ParserResultCard: React.FC<ParserResultCardProps> = ({
  item,
  isImporting,
  isImported,
  isAlreadyInLibrary = false,
  onImport,
  onOpenCoverEditor,
  onOpenReader,
  onOpenDetails,
}) => {
  const isAudio = item.contentType === 'audiobook';
  const coverUrl = item.highResCoverUrl || item.coverUrl;
  const isDownloaded = isImported || isAlreadyInLibrary;

  // Code-based inspection metrics
  const detectedLang = React.useMemo(() => {
    if (item.language && (item.language.toLowerCase().includes('рус') || item.language.toLowerCase().includes('rus'))) {
      return 'Русский (RU)';
    }
    const sample = `${item.title || ''} ${item.author || ''} ${item.description || ''}`;
    const cyrillic = (sample.match(/[\u0400-\u04FF]/g) || []).length;
    const latin = (sample.match(/[a-zA-Z]/g) || []).length;
    if (cyrillic > 3 || cyrillic >= latin) return 'Русский (RU)';
    if (latin > 5) return 'Английский (EN)';
    return 'Русский (RU)';
  }, [item]);

  const charCount = React.useMemo(() => {
    if (isAudio) {
      const tracks = item.audioTracks?.length || 8;
      return tracks * 22000;
    }
    const sizeStr = item.sizeFormatted || '';
    const mbMatch = sizeStr.match(/([\d.,]+)\s*МБ/i);
    if (mbMatch) {
      const mb = parseFloat(mbMatch[1].replace(',', '.'));
      if (!isNaN(mb)) return Math.max(90000, Math.round(mb * 240000));
    }
    const kbMatch = sizeStr.match(/([\d.,]+)\s*КБ/i);
    if (kbMatch) {
      const kb = parseFloat(kbMatch[1].replace(',', '.'));
      if (!isNaN(kb)) return Math.max(35000, Math.round(kb * 950));
    }
    return 340000;
  }, [item, isAudio]);

  const a5Pages = React.useMemo(() => {
    return Math.max(20, Math.round(charCount / 1850));
  }, [charCount]);

  const isComplete = React.useMemo(() => {
    if (isAudio) return true;
    return charCount >= 70000;
  }, [isAudio, charCount]);

  return (
    <div className={`w-full border p-3.5 sm:p-4 transition-all flex flex-col sm:flex-row gap-4 font-['PT_Serif',serif] relative ${
      isDownloaded ? 'bg-zinc-950/90 border-rose-500/60' : 'bg-zinc-950/70 border-zinc-700 hover:border-white'
    }`}>
      {/* Cover Image with High-Res indicator */}
      <div className="w-24 sm:w-28 h-36 shrink-0 bg-zinc-900 border border-zinc-700 overflow-hidden relative self-center sm:self-start">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={item.title}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-zinc-500 p-2 text-center">
            {isAudio ? <Headphones className="w-6 h-6 text-rose-500" /> : <BookOpen className="w-6 h-6 text-zinc-400" />}
            <span className="text-[14px] font-mono leading-tight">Обложка</span>
          </div>
        )}
        {item.highResCoverUrl && (
          <div className="absolute top-1 right-1 px-1.5 bg-black/85 border border-rose-500 text-[14px] text-rose-400 font-mono">
            HD
          </div>
        )}
      </div>

      {/* Information details */}
      <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0">
        <div className="flex flex-col gap-1.5">
          {/* Prominent Source Catalog Banner */}
          <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-mono">
            {/* Catalog Source Badge */}
            <span className="px-2.5 py-0.5 bg-zinc-900 border border-zinc-600 text-rose-300 font-bold flex items-center gap-1.5 shadow-sm">
              <Globe className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>Каталог: {item.sourceName}</span>
            </span>

            {isDownloaded && (
              <span className="px-2.5 py-0.5 bg-rose-950/90 border border-rose-500 text-rose-300 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5 text-rose-500" />
                <span>Уже скачано</span>
              </span>
            )}

            <span className="px-2 py-0.5 bg-black border border-rose-500 text-rose-400 font-bold flex items-center gap-1">
              {isAudio ? <Headphones className="w-3.5 h-3.5" /> : <BookOpen className="w-3.5 h-3.5" />}
              <span>{isAudio ? 'аудиокнига' : 'книга'}</span>
            </span>

            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300">
              {item.format}
            </span>

            {item.year && (
              <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-400">
                {item.year} г.
              </span>
            )}
          </div>

          {/* Title & Author */}
          <h4 className="text-[16px] sm:text-[18px] font-bold text-white leading-snug mt-0.5">
            {item.title}
          </h4>
          <p className="text-[14px] text-zinc-400 font-serif">
            {item.author}
          </p>

          {/* Description snippet (click opens full BookDetailsModal) */}
          {item.series && (
            <span className="text-[14px] font-mono text-rose-400">
              Серия: {item.series}{item.seriesNumber ? ` #${item.seriesNumber}` : ''}
            </span>
          )}
          {item.genres && item.genres.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {item.genres.slice(0, 3).map((g, gi) => (
                <span key={gi} className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-300 text-[14px]">
                  {g}
                </span>
              ))}
            </div>
          )}
          {item.description ? (
            <button
              type="button"
              onClick={() => onOpenDetails?.(item)}
              className="text-left text-[14px] text-zinc-300 hover:text-white line-clamp-2 leading-relaxed font-serif cursor-pointer transition-colors"
              title="Нажмите, чтобы прочитать развёрнутую аннотацию"
            >
              {item.description}
            </button>
          ) : onOpenDetails ? (
            <button
              type="button"
              onClick={() => onOpenDetails(item)}
              className="text-left text-[14px] text-rose-400 hover:text-white underline font-serif cursor-pointer"
            >
              Открыть аннотацию и паспорт книги →
            </button>
          ) : null}

          {/* Code-Based Inspection Metrics: Language, Character Count, A5 Pages, Completeness */}
          <div className="flex flex-wrap items-center gap-1.5 text-[14px] font-mono mt-1 pt-1.5 border-t border-zinc-800/80">
            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 flex items-center gap-1">
              <span className="text-zinc-400">Язык:</span>
              <span className="text-white font-bold">{detectedLang}</span>
            </span>

            <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono">
              ~{charCount.toLocaleString('ru-RU')} симв.
            </span>

            <span className="px-2 py-0.5 bg-zinc-900 border border-rose-500/70 text-rose-300 font-bold font-mono">
              ~{a5Pages} стр. А5
            </span>

            <span className={`px-2 py-0.5 border font-bold flex items-center gap-1 ${
              isComplete
                ? 'bg-zinc-950 border-white/80 text-white'
                : 'bg-zinc-950 border-rose-500/80 text-rose-400'
            }`}>
              <span>{isAudio ? '✓ Полное аудио' : isComplete ? '✓ Полная книга' : 'Фрагмент'}</span>
            </span>

            {item.sizeFormatted && (
              <span className="px-2 py-0.5 bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[14px]">
                Файл: {item.sizeFormatted}
              </span>
            )}
          </div>
          {/* Available Download Formats (Flibusta & OPDS) */}
          {item.availableFormats && item.availableFormats.length > 0 && (
            <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-800">
              <span className="text-[14px] font-mono text-zinc-400 flex items-center gap-1">
                <Download className="w-3.5 h-3.5 text-rose-500" />
                <span>Форматы для скачивания (выберите нужный):</span>
              </span>
              <div className="flex flex-wrap gap-1.5">
                {item.availableFormats.map((f) => (
                  <button
                    key={f.format}
                    type="button"
                    onClick={() => onImport(item, f.format)}
                    disabled={isImporting}
                    className={`relative px-2.5 py-1 text-[14px] font-mono font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                      f.isPrimary
                        ? 'bg-rose-950/80 border-rose-500 text-rose-200 hover:bg-rose-900'
                        : 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:border-white hover:text-white'
                    }`}
                    title={`Скачать произведение в формате ${f.label}`}
                  >
                    <span>{f.format}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons with speech bubble styling */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-800/80">
          {isDownloaded && onOpenReader ? (
            <>
              <button
                type="button"
                onClick={onOpenReader}
                className="relative min-h-[42px] px-4 py-1.5 bg-white text-black hover:bg-zinc-200 text-[14px] font-bold border-2 border-white transition-all flex items-center gap-2 cursor-pointer shadow"
              >
                {isAudio ? <Headphones className="w-4 h-4 text-black" /> : <Eye className="w-4 h-4 text-black" />}
                <span>{isAudio ? 'слушать аудиокнигу' : 'открыть в читалке'}</span>
              </button>

              <button
                type="button"
                onClick={() => onImport(item)}
                disabled={isImporting}
                className="min-h-[42px] px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                title="Обновить или скачать заново"
              >
                <Download className="w-4 h-4 text-rose-500" />
                <span>{isImporting ? 'загрузка...' : 'скачать повторно'}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => onImport(item)}
              disabled={isImporting || isImported}
              className={`relative min-h-[42px] px-4 py-1.5 text-[14px] font-bold border-2 transition-all flex items-center gap-2 cursor-pointer ${
                isImported
                  ? 'bg-zinc-900 text-rose-400 border-rose-500 cursor-default'
                  : 'bg-white text-black hover:bg-zinc-200 border-white'
              }`}
            >
              {isImporting ? (
                <>
                  <HardDrive className="w-4 h-4 text-black animate-spin" />
                  <span>загрузка книги...</span>
                </>
              ) : isImported ? (
                <>
                  <Check className="w-4 h-4 text-rose-500" />
                  <span>добавлено в библиотеку</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-black" />
                  <span>импортировать в KnigAI</span>
                </>
              )}
            </button>
          )}

          {onOpenDetails && (
            <button
              type="button"
              onClick={() => onOpenDetails(item)}
              className="min-h-[42px] px-3.5 py-1.5 bg-zinc-950 hover:bg-white hover:text-black border border-rose-500/70 text-rose-300 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer rounded-none"
              title="Развёрнутое описание, жанры, серия и параметры издания"
            >
              <Eye className="w-4 h-4 text-rose-500" />
              <span>Подробнее</span>
            </button>
          )}

          {onOpenCoverEditor && (
            <button
              type="button"
              onClick={() => onOpenCoverEditor(item)}
              className="min-h-[42px] px-3.5 py-1.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-700 hover:border-white text-zinc-200 text-[14px] font-bold transition flex items-center gap-1.5 cursor-pointer"
              title="Настроить переплет А5 и корешок под эту книгу"
            >
              <Palette className="w-4 h-4 text-rose-500" />
              <span>редактор переплета</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
