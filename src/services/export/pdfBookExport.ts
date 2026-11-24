import { Book, Chapter, Character } from '../../types';
import { getUploadService } from '../upload/FileUploadService';
import { getOrCreateBookFolder } from '../db/fileStorageRepository';
import { DEFAULT_PRINT_EXPORT_OPTIONS, DpiCheckWarning, PrintExportOptions, PrintExportProgress } from './print/printTypes';
import { buildBookInteriorPdfDoc } from './print/pdfMarkdownBookRenderer';
import { ReadingFontId } from '../../components/reader/ReaderThemeSelector';

export function resolveReaderPrintDefaults(): Partial<PrintExportOptions> {
  try {
    const raw = localStorage.getItem('knigai_reader_settings');
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    const px = typeof parsed?.fontSize === 'number' ? parsed.fontSize : 16;
    const pt = Math.max(9.5, Math.min(13, parseFloat((px * 0.66).toFixed(1))));
    return {
      fontId: (parsed?.fontId as ReadingFontId) || 'pt-serif',
      fontSizePt: pt,
      lineSpacing: parsed?.lineSpacing || 'normal',
      paperStyle: parsed?.pageStyle === 'noir' ? 'noir' : parsed?.pageStyle === 'white' ? 'white' : 'cream',
    };
  } catch {
    return {};
  }
}

export async function exportBookToPdf(
  book: Book,
  chapters: Chapter[],
  characters: Character[],
  userUid?: number,
  customOptions?: Partial<PrintExportOptions>,
  onProgress?: (p: PrintExportProgress) => void
): Promise<{
  downloadUrl?: string;
  filename: string;
  totalPages: number;
  dpiWarnings: DpiCheckWarning[];
}> {
  const mergedOptions: PrintExportOptions = {
    ...DEFAULT_PRINT_EXPORT_OPTIONS,
    ...resolveReaderPrintDefaults(),
    ...(customOptions || {}),
  };

  const built = await buildBookInteriorPdfDoc(book, chapters, characters, mergedOptions, onProgress);
  const safeBase = (book.title || 'KnigAI_Book').replace(/[^\w\u0400-\u04FF]/gi, '_');
  const formatTag = mergedOptions.format.toUpperCase();
  const safeFilename = `${safeBase}_Block_${formatTag}_Print_KnigAI.pdf`;

  onProgress?.({ stage: 'Сохранение PDF-блока...', percent: 96 });
  built.doc.save(safeFilename);

  let downloadUrl: string | undefined;
  try {
    const pdfBlob = built.doc.output('blob');
    const uploader = getUploadService();
    const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
    const fileRecord = await uploader.uploadFromBlob(pdfBlob, safeFilename, folder.id);
    downloadUrl = fileRecord.original_url || fileRecord.short_url;
  } catch (err) {
    console.warn('Auto upload PDF to gallery warning:', err);
  }

  onProgress?.({ stage: 'Готово!', percent: 100 });
  return {
    downloadUrl,
    filename: safeFilename,
    totalPages: built.totalPages,
    dpiWarnings: built.dpiWarnings,
  };
}
