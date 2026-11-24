import { ReadingFontId } from '../../../components/reader/ReaderThemeSelector';

export type PrintFormatId = 'a5' | 'book140x200' | 'a4';
export type PrintBindingType = 'soft_kbs' | 'hard_7bc';
export type PrintPaperStyle = 'white' | 'cream' | 'noir';

export interface PrintFormatPreset {
  id: PrintFormatId;
  label: string;
  widthMm: number;
  heightMm: number;
  innerMarginMm: number;
  outerMarginMm: number;
  topMarginMm: number;
  bottomMarginMm: number;
}

export const PRINT_FORMAT_PRESETS: Record<PrintFormatId, PrintFormatPreset> = {
  a5: {
    id: 'a5',
    label: 'A5 (148 × 210 мм)',
    widthMm: 148,
    heightMm: 210,
    innerMarginMm: 19,
    outerMarginMm: 13,
    topMarginMm: 16,
    bottomMarginMm: 17,
  },
  book140x200: {
    id: 'book140x200',
    label: 'Книжный стандарт (140 × 200 мм)',
    widthMm: 140,
    heightMm: 200,
    innerMarginMm: 18,
    outerMarginMm: 12,
    topMarginMm: 15,
    bottomMarginMm: 16,
  },
  a4: {
    id: 'a4',
    label: 'A4 (210 × 297 мм)',
    widthMm: 210,
    heightMm: 297,
    innerMarginMm: 22,
    outerMarginMm: 16,
    topMarginMm: 18,
    bottomMarginMm: 20,
  },
};

export interface PrintExportOptions {
  format: PrintFormatId;
  binding: PrintBindingType;
  paperStyle: PrintPaperStyle;
  includeBleed: boolean;
  includeCropMarks: boolean;
  startChaptersOnOddPage: boolean;
  includeFrontCoverPage: boolean;
  includeCharactersPage: boolean;
  includeToc: boolean;
  noirTitleAccents: boolean;
  fontId: ReadingFontId;
  fontSizePt: number;
  lineSpacing: 'compact' | 'normal' | 'relaxed';
}

export const DEFAULT_PRINT_EXPORT_OPTIONS: PrintExportOptions = {
  format: 'a5',
  binding: 'soft_kbs',
  paperStyle: 'cream',
  includeBleed: true,
  includeCropMarks: true,
  startChaptersOnOddPage: true,
  includeFrontCoverPage: true,
  includeCharactersPage: true,
  includeToc: true,
  noirTitleAccents: true,
  fontId: 'pt-serif',
  fontSizePt: 10.5,
  lineSpacing: 'normal',
};

export interface PrintCoverSpecs {
  format: PrintFormatId;
  binding: PrintBindingType;
  paperStyle: PrintPaperStyle;
  pageCount: number;
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  slugMm: number;
  hingeMm: number;
  spineWidthMm: number;
  boardOverhangMm: number;
  totalTrimWidthMm: number;
  totalTrimHeightMm: number;
  totalDocWidthMm: number;
  totalDocHeightMm: number;
}

export function computePrintCoverSpecs(
  pageCount: number,
  paperType: 'cream' | 'white',
  format: PrintFormatId = 'a5',
  binding: PrintBindingType = 'soft_kbs',
  includeBleed = true,
  includeCropMarks = true
): PrintCoverSpecs {
  const preset = PRINT_FORMAT_PRESETS[format] || PRINT_FORMAT_PRESETS.a5;
  const safePages = Math.max(24, pageCount % 2 === 0 ? pageCount : pageCount + 1);
  // 2 pages per sheet: standard 80gsm offset (~0.105mm sheet -> 0.0525mm/page) or cream bulky (~0.127mm -> 0.0635mm/page)
  const thicknessPerPageMm = paperType === 'cream' ? 0.0635 : 0.0572;
  const blockThicknessMm = safePages * thicknessPerPageMm;

  const isHardcover = binding === 'hard_7bc';
  // Hardcover (7БЦ) adds ~3mm board thickness + 3mm board overhang per edge & 16mm wrap bleed
  const spineWidthMm = parseFloat(
    Math.max(isHardcover ? 8.0 : 5.0, blockThicknessMm + (isHardcover ? 3.2 : 0.5)).toFixed(2)
  );
  const boardOverhangMm = isHardcover ? 3.0 : 0;
  const hingeMm = isHardcover ? 7.0 : 0;
  const trimWidthMm = preset.widthMm + (isHardcover ? 2 : 0);
  const trimHeightMm = preset.heightMm + boardOverhangMm * 2;

  const bleedMm = includeBleed ? (isHardcover ? 16.0 : 3.2) : 0;
  const slugMm = includeCropMarks ? 6.0 : 0;

  const totalTrimWidthMm = parseFloat((trimWidthMm * 2 + spineWidthMm + hingeMm * 2).toFixed(2));
  const totalTrimHeightMm = parseFloat(trimHeightMm.toFixed(2));
  const totalDocWidthMm = parseFloat((totalTrimWidthMm + (bleedMm + slugMm) * 2).toFixed(2));
  const totalDocHeightMm = parseFloat((totalTrimHeightMm + (bleedMm + slugMm) * 2).toFixed(2));

  return {
    format,
    binding,
    paperStyle: paperType,
    pageCount: safePages,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    slugMm,
    hingeMm,
    spineWidthMm,
    boardOverhangMm,
    totalTrimWidthMm,
    totalTrimHeightMm,
    totalDocWidthMm,
    totalDocHeightMm,
  };
}

export interface DpiCheckWarning {
  label: string;
  url: string;
  actualDpi: number;
  recommendedDpi: number;
  naturalWidth: number;
  naturalHeight: number;
}

export interface PrintExportProgress {
  stage: string;
  percent: number;
}
