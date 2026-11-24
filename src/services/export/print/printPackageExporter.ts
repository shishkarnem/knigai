import JSZip from 'jszip';
import { Book, Chapter, Character } from '../../../types';
import { getUploadService } from '../../upload/FileUploadService';
import { getOrCreateBookFolder } from '../../db/fileStorageRepository';
import { buildBookInteriorPdfDoc } from './pdfMarkdownBookRenderer';
import { buildPrintCoverPdfDoc } from '../pdfCoverExport';
import {
  DpiCheckWarning,
  PRINT_FORMAT_PRESETS,
  PrintExportOptions,
  PrintExportProgress,
} from './printTypes';

export interface PrintPackageExportResult {
  zipFilename: string;
  blockFilename: string;
  coverFilename: string;
  downloadUrl?: string;
  totalPages: number;
  spineWidthMm: number;
  coverSizeMm: string;
  dpiWarnings: DpiCheckWarning[];
}

function buildTypographyPassportText(params: {
  book: Book;
  totalPages: number;
  options: PrintExportOptions;
  spineWidthMm: number;
  totalTrimW: number;
  totalTrimH: number;
  totalDocW: number;
  totalDocH: number;
  bleedMm: number;
  hingeMm: number;
  dpiWarnings: DpiCheckWarning[];
  blockFilename: string;
  coverFilename: string;
}): string {
  const preset = PRINT_FORMAT_PRESETS[params.options.format] || PRINT_FORMAT_PRESETS.a5;
  const bindingLabel =
    params.options.binding === 'hard_7bc'
      ? 'Твёрдый переплёт 7БЦ (с загибом 16 мм и расставом 7 мм)'
      : 'Мягкая обложка КБС (термоклеевое бесшвейное скрепление)';
  const paperLabel =
    params.options.paperStyle === 'noir'
      ? 'Нуар-издание (чёрный фон страниц с вылетами 3 мм)'
      : params.options.paperStyle === 'cream'
      ? 'Кремовая / пухлая офсетная бумага (80 г/м2)'
      : 'Белая офсетная бумага (80 г/м2)';

  const lines = [
    '============================================================',
    'ТЕХНИЧЕСКИЙ ПАСПОРТ ПЕЧАТИ ДЛЯ ТИПОГРАФИИ (KnigAI Prepress)',
    '============================================================',
    `Книга: ${params.book.title}`,
    `Автор: ${params.book.author || 'Автор KnigAI'}`,
    `ISBN: ${params.book.cover_config?.isbn || 'Не присвоен'}`,
    `Дата сборки: ${new Date().toLocaleString('ru-RU')}`,
    '',
    '1. ВНУТРЕННИЙ КНИЖНЫЙ БЛОК',
    `   Файл: ${params.blockFilename}`,
    `   Обрезной формат страницы: ${preset.widthMm} × ${preset.heightMm} мм (${preset.id.toUpperCase()})`,
    `   Количество страниц (полос): ${params.totalPages} (выровнено по чётности)`,
    `   Бумага блока: ${paperLabel}`,
    `   Поля (зеркальные): внутреннее у корешка ${preset.innerMarginMm} мм, внешнее ${preset.outerMarginMm} мм, верх ${preset.topMarginMm} мм, низ ${preset.bottomMarginMm} мм`,
    `   Вылеты (Bleed): ${params.options.includeBleed ? '3.0 мм' : 'Нет'}`,
    `   Метки реза (Crop marks): ${params.options.includeCropMarks ? 'Вынесены за линию реза (в slug)' : 'Нет'}`,
    '   Шрифты: полностью встроены в PDF (векторная кириллица)',
    '',
    '2. РАЗВЁРТКА ОБЛОЖКИ',
    `   Файл: ${params.coverFilename}`,
    `   Тип переплёта: ${bindingLabel}`,
    `   Точная ширина корешка: ${params.spineWidthMm} мм (рассчитано строго под ${params.totalPages} полос)`,
    `   Обрезной формат разворота: ${params.totalTrimW} × ${params.totalTrimH} мм`,
    `   Полный размер документа с вылетами и метками: ${params.totalDocW} × ${params.totalDocH} мм`,
    `   Вылет под обрез / загиб: ${params.bleedMm} мм${params.hingeMm > 0 ? `, расстав 7БЦ: ${params.hingeMm} мм` : ''}`,
    '   Метки биговки и реза: вынесены строго за пределы обреза',
    '   Штрих-код EAN-13: векторный',
    '',
    '3. ПРОВЕРКА РАЗРЕШЕНИЯ ИЗОБРАЖЕНИЙ (РЕКОМЕНДУЕТСЯ >= 220-300 DPI)',
    params.dpiWarnings.length === 0
      ? '   Все изображения соответствуют стандартам печатного качества.'
      : params.dpiWarnings
          .map(
            (w) =>
              `   [Внимание] ${w.label}: фактическое ~${w.actualDpi} DPI (${w.naturalWidth}×${w.naturalHeight} px), желательно 300 DPI`
          )
          .join('\n'),
    '============================================================',
  ];

  return lines.join('\n');
}

export async function exportTypographyZipPackage(
  book: Book,
  chapters: Chapter[],
  characters: Character[],
  options: PrintExportOptions,
  userUid?: number,
  onProgress?: (p: PrintExportProgress) => void
): Promise<PrintPackageExportResult> {
  const safeBase = (book.title || 'KnigAI_Book').replace(/[^\w\u0400-\u04FF]/gi, '_');
  const formatTag = options.format.toUpperCase();
  const bindingTag = options.binding === 'hard_7bc' ? '7BC' : 'KBS';

  // Step 1: Render Book Interior & capture exact page count
  const builtBlock = await buildBookInteriorPdfDoc(book, chapters, characters, options, (p) => {
    onProgress?.({ stage: p.stage, percent: Math.round(p.percent * 0.65) });
  });

  // Step 2: Render Cover Spread matched to exact block page count
  onProgress?.({
    stage: `Сборка обложки 300 DPI под ${builtBlock.totalPages} полос...`,
    percent: 72,
  });

  const paperForSpine: 'cream' | 'white' =
    options.paperStyle === 'white' ? 'white' : 'cream';
  const coverConfig = {
    ...(book.cover_config || {}),
    frontTitle: book.cover_config?.frontTitle || book.title,
    authorName: book.cover_config?.authorName || book.author,
    paperType: paperForSpine,
    spineColor: book.cover_config?.spineColor || '#18181b',
    genreLabel: book.cover_config?.genreLabel || (book.genres || []).join(' / '),
    backBlurb: book.cover_config?.backBlurb || book.synopsis_overview || '',
    frontSubtitle: book.cover_config?.frontSubtitle || book.subtitle || '',
    spineText: book.cover_config?.spineText || book.title,
    frontImageUrl: book.cover_config?.frontImageUrl || '',
    pageCountEstimate: builtBlock.totalPages,
  };

  const builtCover = await buildPrintCoverPdfDoc(
    coverConfig,
    book.title,
    book.author || 'Автор KnigAI',
    builtBlock.totalPages,
    {
      format: options.format,
      binding: options.binding,
      includeBleed: options.includeBleed,
      includeCropMarks: options.includeCropMarks,
    }
  );

  const allWarnings = [...builtBlock.dpiWarnings, ...builtCover.dpiWarnings];
  const blockFilename = `01_${safeBase}_Block_${formatTag}.pdf`;
  const coverFilename = `02_${safeBase}_Cover_${formatTag}_${bindingTag}.pdf`;
  const zipFilename = `${safeBase}_Tipografiya_${formatTag}_${bindingTag}.zip`;

  onProgress?.({ stage: 'Упаковка ZIP-комплекта для типографии...', percent: 88 });

  const passportTxt = buildTypographyPassportText({
    book,
    totalPages: builtBlock.totalPages,
    options,
    spineWidthMm: builtCover.specs.spineWidthMm,
    totalTrimW: builtCover.specs.totalTrimWidthMm,
    totalTrimH: builtCover.specs.totalTrimHeightMm,
    totalDocW: builtCover.specs.totalDocWidthMm,
    totalDocH: builtCover.specs.totalDocHeightMm,
    bleedMm: builtCover.specs.bleedMm,
    hingeMm: builtCover.specs.hingeMm,
    dpiWarnings: allWarnings,
    blockFilename,
    coverFilename,
  });

  const zip = new JSZip();
  zip.file(blockFilename, builtBlock.doc.output('arraybuffer'));
  zip.file(coverFilename, builtCover.doc.output('arraybuffer'));
  zip.file('00_Технический_паспорт_печати.txt', passportTxt);

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const blobUrl = URL.createObjectURL(zipBlob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = zipFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);

  let downloadUrl: string | undefined;
  try {
    onProgress?.({ stage: 'Сохранение архива в облачную папку книги...', percent: 94 });
    const uploader = getUploadService();
    const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
    const fileRecord = await uploader.uploadFromBlob(zipBlob, zipFilename, folder.id);
    downloadUrl = fileRecord.original_url || fileRecord.short_url;
  } catch (err) {
    console.warn('Auto upload print ZIP to gallery warning:', err);
  }

  onProgress?.({ stage: 'Комплект для типографии готов!', percent: 100 });
  return {
    zipFilename,
    blockFilename,
    coverFilename,
    downloadUrl,
    totalPages: builtBlock.totalPages,
    spineWidthMm: builtCover.specs.spineWidthMm,
    coverSizeMm: `${builtCover.specs.totalDocWidthMm} × ${builtCover.specs.totalDocHeightMm} мм`,
    dpiWarnings: allWarnings,
  };
}
