import React, { useMemo, useState } from 'react';
import {
  Archive,
  AlertTriangle,
  BookOpen,
  Check,
  Download,
  FileText,
  Palette,
  Printer,
  Scissors,
} from 'lucide-react';
import { Book, Chapter, Character } from '../../../types';
import { NoirModal } from '../../common/NoirModal';
import { NoirStatus } from '../../common/NoirStatus';
import { READING_FONTS, ReadingFontId } from '../../reader/ReaderThemeSelector';
import { exportBookToPdf, resolveReaderPrintDefaults } from '../../../services/export/pdfBookExport';
import { exportCoverToPdf } from '../../../services/export/pdfCoverExport';
import { exportManuscriptText } from '../../../services/export/txtPublishingExport';
import { exportTypographyZipPackage } from '../../../services/export/print/printPackageExporter';
import {
  DEFAULT_PRINT_EXPORT_OPTIONS,
  DpiCheckWarning,
  PRINT_FORMAT_PRESETS,
  PrintBindingType,
  PrintExportOptions,
  PrintExportProgress,
  PrintFormatId,
  PrintPaperStyle,
  computePrintCoverSpecs,
} from '../../../services/export/print/printTypes';

interface PrintExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  chapters: Chapter[];
  characters: Character[];
  userUid?: number;
}

export const PrintExportModal: React.FC<PrintExportModalProps> = ({
  isOpen,
  onClose,
  book,
  chapters,
  characters,
  userUid,
}) => {
  const [options, setOptions] = useState<PrintExportOptions>(() => ({
    ...DEFAULT_PRINT_EXPORT_OPTIONS,
    ...resolveReaderPrintDefaults(),
  }));
  const [busyAction, setBusyAction] = useState<'zip' | 'block' | 'cover' | 'md' | null>(null);
  const [progress, setProgress] = useState<PrintExportProgress | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ type: 'info' | 'success' | 'error'; text: string } | null>(null);
  const [actualPages, setActualPages] = useState<number | null>(null);
  const [dpiWarnings, setDpiWarnings] = useState<DpiCheckWarning[]>([]);

  const estimatedPages = useMemo(() => {
    if (actualPages && actualPages > 0) return actualPages;
    const totalChars = chapters.reduce((sum, ch) => sum + (ch.content || ch.synopsis || '').length, 0);
    const estContentPages = Math.max(12, Math.ceil(totalChars / 1550));
    const frontPages = 4 + (options.includeCharactersPage && characters.length > 0 ? 2 : 0);
    const rawTotal = frontPages + estContentPages;
    return rawTotal % 2 === 0 ? rawTotal : rawTotal + 1;
  }, [actualPages, chapters, characters.length, options.includeCharactersPage]);

  const coverSpecs = useMemo(() => {
    const paperForSpine: 'cream' | 'white' = options.paperStyle === 'white' ? 'white' : 'cream';
    return computePrintCoverSpecs(
      estimatedPages,
      paperForSpine,
      options.format,
      options.binding,
      options.includeBleed,
      options.includeCropMarks
    );
  }, [estimatedPages, options]);

  const coverConfigSafe = useMemo(
    () => ({
      ...(book.cover_config || {}),
      frontTitle: book.cover_config?.frontTitle || book.title,
      frontSubtitle: book.cover_config?.frontSubtitle || book.subtitle || '',
      authorName: book.cover_config?.authorName || book.author || 'Автор KnigAI',
      spineText: book.cover_config?.spineText || book.title,
      backBlurb: book.cover_config?.backBlurb || book.synopsis_overview || '',
      genreLabel: book.cover_config?.genreLabel || (book.genres || []).join(' / '),
      frontImageUrl: book.cover_config?.frontImageUrl || '',
      spineColor: book.cover_config?.spineColor || '#18181b',
      paperType: (options.paperStyle === 'white' ? 'white' : 'cream') as 'cream' | 'white',
      pageCountEstimate: estimatedPages,
    }),
    [book, options.paperStyle, estimatedPages]
  );

  const handleRunZipPackage = async () => {
    setBusyAction('zip');
    setStatusMsg(null);
    setDpiWarnings([]);
    try {
      const res = await exportTypographyZipPackage(
        book,
        chapters,
        characters,
        options,
        userUid,
        (p) => setProgress(p)
      );
      setActualPages(res.totalPages);
      setDpiWarnings(res.dpiWarnings);
      setStatusMsg({
        type: 'success',
        text: `Типографский ZIP-комплект собран (${res.totalPages} стр., корешок ${res.spineWidthMm} мм, развертка ${res.coverSizeMm}) и сохранён в облачную папку книги.`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Ошибка сборки комплекта: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunBlockOnly = async () => {
    setBusyAction('block');
    setStatusMsg(null);
    setDpiWarnings([]);
    try {
      const res = await exportBookToPdf(book, chapters, characters, userUid, options, (p) =>
        setProgress(p)
      );
      setActualPages(res.totalPages);
      setDpiWarnings(res.dpiWarnings);
      setStatusMsg({
        type: 'success',
        text: `Книжный блок PDF готов (${res.totalPages} полос, векторная кириллица и иллюстрации 300 DPI): ${res.filename}`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Ошибка экспорта блока: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunCoverOnly = async () => {
    setBusyAction('cover');
    setStatusMsg(null);
    try {
      setProgress({ stage: 'Рендер обложки 300 DPI с метками реза...', percent: 45 });
      const res = await exportCoverToPdf(
        coverConfigSafe,
        book.title,
        book.author || 'Автор KnigAI',
        estimatedPages,
        book.id,
        userUid,
        {
          format: options.format,
          binding: options.binding,
          includeBleed: options.includeBleed,
          includeCropMarks: options.includeCropMarks,
        }
      );
      if (res.dpiWarnings) setDpiWarnings(res.dpiWarnings);
      setProgress({ stage: 'Обложка готова!', percent: 100 });
      setStatusMsg({
        type: 'success',
        text: `Обложка-развертка сохранена (корешок ${coverSpecs.spineWidthMm} мм, размер ${coverSpecs.totalDocWidthMm}×${coverSpecs.totalDocHeightMm} мм): ${res.filename}`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Ошибка экспорта обложки: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunMarkdown = async () => {
    setBusyAction('md');
    setStatusMsg(null);
    try {
      const res = await exportManuscriptText(book, chapters, characters, userUid);
      setStatusMsg({
        type: 'success',
        text: `Рукопись в Markdown скачана и сохранена в папку книги: ${res.filename}`,
      });
    } catch (err: unknown) {
      setStatusMsg({
        type: 'error',
        text: 'Ошибка выгрузки рукописи: ' + (err instanceof Error ? err.message : String(err)),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <NoirModal
      isOpen={isOpen}
      onClose={() => !busyAction && onClose()}
      title={`Подготовка файлов в типографию: «${book.title}»`}
      maxWidth="max-w-4xl"
    >
      <div className="flex flex-col gap-4 text-white font-['PT_Serif',serif]">
        {/* Spec Summary Banner */}
        <div className="p-3.5 bg-zinc-950/80 border border-zinc-700 grid grid-cols-2 sm:grid-cols-4 gap-3 text-[14px]">
          <div>
            <span className="text-zinc-400 block font-mono">Формат обреза:</span>
            <strong className="text-white">
              {coverSpecs.trimWidthMm} × {coverSpecs.trimHeightMm} мм
            </strong>
          </div>
          <div>
            <span className="text-zinc-400 block font-mono">
              {actualPages ? 'Точно полос:' : 'Оценка полос:'}
            </span>
            <strong className="text-rose-400">{estimatedPages} стр.</strong>
          </div>
          <div>
            <span className="text-zinc-400 block font-mono">Ширина корешка:</span>
            <strong className="text-white">{coverSpecs.spineWidthMm} мм</strong>
          </div>
          <div>
            <span className="text-zinc-400 block font-mono">Обложка (с вылетами):</span>
            <strong className="text-white">
              {coverSpecs.totalDocWidthMm} × {coverSpecs.totalDocHeightMm} мм
            </strong>
          </div>
        </div>

        {/* Prepress Parameters Grid */}
        <div className="p-4 border border-zinc-800 bg-black/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label htmlFor="print-format" className="block text-[14px] text-zinc-300 font-bold mb-1">
              Формат книги
            </label>
            <select
              id="print-format"
              value={options.format}
              onChange={(e) => setOptions((prev) => ({ ...prev, format: e.target.value as PrintFormatId }))}
              className="w-full min-h-[42px] px-2.5 noir-input text-[14px]"
            >
              {Object.values(PRINT_FORMAT_PRESETS).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="print-binding" className="block text-[14px] text-zinc-300 font-bold mb-1">
              Тип переплета
            </label>
            <select
              id="print-binding"
              value={options.binding}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, binding: e.target.value as PrintBindingType }))
              }
              className="w-full min-h-[42px] px-2.5 noir-input text-[14px]"
            >
              <option value="soft_kbs">Мягкая обложка (КБС, вылет 3.2 мм)</option>
              <option value="hard_7bc">Твердый 7БЦ (загиб 16 мм + расстав)</option>
            </select>
          </div>

          <div>
            <label htmlFor="print-paper" className="block text-[14px] text-zinc-300 font-bold mb-1">
              Бумага блока
            </label>
            <select
              id="print-paper"
              value={options.paperStyle}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, paperStyle: e.target.value as PrintPaperStyle }))
              }
              className="w-full min-h-[42px] px-2.5 noir-input text-[14px]"
            >
              <option value="cream">Кремовая 80 г (для печати)</option>
              <option value="white">Белая офсет 80 г (для печати)</option>
              <option value="noir">Нуар-издание (черные листы)</option>
            </select>
          </div>

          <div>
            <label htmlFor="print-font" className="block text-[14px] text-zinc-300 font-bold mb-1">
              Шрифт блока (кириллица)
            </label>
            <select
              id="print-font"
              value={options.fontId}
              onChange={(e) =>
                setOptions((prev) => ({ ...prev, fontId: e.target.value as ReadingFontId }))
              }
              className="w-full min-h-[42px] px-2.5 noir-input text-[14px]"
            >
              {Object.values(READING_FONTS).map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.category})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Toggle Checkboxes */}
        <div className="p-3 border border-zinc-800 bg-zinc-950/60 flex flex-wrap gap-x-5 gap-y-2.5 text-[14px]">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeBleed}
              onChange={(e) => setOptions((p) => ({ ...p, includeBleed: e.target.checked }))}
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Вылеты под обрез (Bleed)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeCropMarks}
              onChange={(e) => setOptions((p) => ({ ...p, includeCropMarks: e.target.checked }))}
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span className="flex items-center gap-1">
              <Scissors className="w-3.5 h-3.5 text-rose-500" />
              <span>Метки реза и биговки снаружи</span>
            </span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.startChaptersOnOddPage}
              onChange={(e) =>
                setOptions((p) => ({ ...p, startChaptersOnOddPage: e.target.checked }))
              }
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Главы с правой полосы</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeToc}
              onChange={(e) => setOptions((p) => ({ ...p, includeToc: e.target.checked }))}
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Оглавление со стр.</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeFrontCoverPage}
              onChange={(e) =>
                setOptions((p) => ({ ...p, includeFrontCoverPage: e.target.checked }))
              }
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Арт обложки на титуле</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.includeCharactersPage}
              onChange={(e) =>
                setOptions((p) => ({ ...p, includeCharactersPage: e.target.checked }))
              }
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Персонажи с карточками</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.noirTitleAccents}
              onChange={(e) => setOptions((p) => ({ ...p, noirTitleAccents: e.target.checked }))}
              className="w-4 h-4 accent-rose-600 cursor-pointer"
            />
            <span>Красные акценты заголовков</span>
          </label>
        </div>

        {/* Live Progress */}
        {busyAction && progress && (
          <div className="p-3 bg-zinc-950 border border-rose-500 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-white font-bold">{progress.stage}</span>
              <span className="font-mono text-rose-400">{progress.percent}%</span>
            </div>
            <div className="w-full h-2 bg-zinc-900 border border-zinc-700 overflow-hidden">
              <div
                className="h-full bg-rose-600 transition-all duration-200"
                style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
              />
            </div>
          </div>
        )}

        {statusMsg && <NoirStatus type={statusMsg.type} message={statusMsg.text} />}

        {/* DPI Prepress Warnings */}
        {dpiWarnings.length > 0 && (
          <div className="p-3 bg-zinc-950 border border-rose-500/70 text-[14px] flex flex-col gap-1.5">
            <div className="font-bold text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Проверка разрешения изображений для печати (рекомендуется 300 DPI):</span>
            </div>
            <ul className="space-y-1 text-zinc-300">
              {dpiWarnings.slice(0, 5).map((w, idx) => (
                <li key={idx}>
                  • <strong>{w.label}</strong>: {w.actualDpi} DPI ({w.naturalWidth}×{w.naturalHeight} px)
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Primary ZIP Kit + Individual Export Cards */}
        <button
          type="button"
          disabled={Boolean(busyAction)}
          onClick={handleRunZipPackage}
          className="w-full p-4 bg-rose-600 hover:bg-rose-500 border-2 border-white text-left flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition cursor-pointer disabled:opacity-50"
        >
          <div className="flex items-start gap-3">
            <Archive className="w-6 h-6 text-white shrink-0 mt-0.5" />
            <div>
              <h4 className="text-[16px] font-bold text-white flex items-center gap-2">
                <span>Скачать готовый комплект для типографии (.zip)</span>
              </h4>
              <p className="text-[14px] text-zinc-100 mt-0.5">
                Внутри: блок PDF (векторная кириллица + картинки 300 DPI), обложка PDF с точным корешком под итоговое число страниц и технический паспорт печати.
              </p>
            </div>
          </div>
          <span className="min-h-[40px] px-4 bg-black text-white font-bold text-[14px] border border-white flex items-center justify-center gap-1.5 shrink-0">
            <Printer className="w-4 h-4 text-rose-500" />
            <span>{busyAction === 'zip' ? 'Сборка...' : 'Собрать ZIP →'}</span>
          </span>
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={handleRunBlockOnly}
            className="p-4 noir-container border border-zinc-700 hover:border-white text-left flex flex-col justify-between gap-3 transition cursor-pointer bg-zinc-950 disabled:opacity-50"
          >
            <div>
              <BookOpen className="w-5 h-5 text-rose-500 mb-2" />
              <h4 className="text-[15px] font-bold text-white">Только блок (PDF)</h4>
              <p className="text-[14px] text-zinc-400 mt-1">
                Зеркальные поля, оглавление, иллюстрации глав и сноски.
              </p>
            </div>
            <span className="text-[14px] font-bold text-white flex items-center gap-1">
              <Download className="w-4 h-4 text-rose-500" />
              <span>{busyAction === 'block' ? 'Сборка...' : 'Скачать блок →'}</span>
            </span>
          </button>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={handleRunCoverOnly}
            className="p-4 noir-container border border-zinc-700 hover:border-white text-left flex flex-col justify-between gap-3 transition cursor-pointer bg-zinc-950 disabled:opacity-50"
          >
            <div>
              <Palette className="w-5 h-5 text-rose-500 mb-2" />
              <h4 className="text-[15px] font-bold text-white">Только обложка (PDF)</h4>
              <p className="text-[14px] text-zinc-400 mt-1">
                Развертка 300 DPI, PNG-слои, штрих-код и внешние метки реза.
              </p>
            </div>
            <span className="text-[14px] font-bold text-white flex items-center gap-1">
              <Check className="w-4 h-4 text-rose-500" />
              <span>{busyAction === 'cover' ? 'Сборка...' : 'Скачать обложку →'}</span>
            </span>
          </button>

          <button
            type="button"
            disabled={Boolean(busyAction)}
            onClick={handleRunMarkdown}
            className="p-4 noir-container border border-zinc-700 hover:border-white text-left flex flex-col justify-between gap-3 transition cursor-pointer bg-zinc-950 disabled:opacity-50"
          >
            <div>
              <FileText className="w-5 h-5 text-rose-500 mb-2" />
              <h4 className="text-[15px] font-bold text-white">Рукопись (.md)</h4>
              <p className="text-[14px] text-zinc-400 mt-1">
                Исходный текст всех глав, синопсис и досье персонажей.
              </p>
            </div>
            <span className="text-[14px] font-bold text-white flex items-center gap-1">
              <Download className="w-4 h-4 text-rose-500" />
              <span>{busyAction === 'md' ? 'Сохранение...' : 'Скачать текст →'}</span>
            </span>
          </button>
        </div>
      </div>
    </NoirModal>
  );
};
