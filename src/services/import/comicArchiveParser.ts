/**
 * Comic and Manga Archive Parser (CBZ, CBR, ZIP)
 * Extracts sequential graphic pages for 3D reader
 */
import JSZip from 'jszip';

export interface ComicPageItem {
  pageNumber: number;
  title: string;
  imageUrl: string;
  filename: string;
}

export interface ParsedComicResult {
  title: string;
  pages: ComicPageItem[];
  coverUrl: string;
}

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'];

export async function parseComicArchive(file: File): Promise<ParsedComicResult> {
  const zip = new JSZip();
  const arrayBuffer = await file.arrayBuffer();
  
  let loadedZip: JSZip;
  try {
    loadedZip = await zip.loadAsync(arrayBuffer);
  } catch (err) {
    throw new Error('Архив комикса поврежден или использует неподдерживаемое сжатие. Рекомендуется формат CBZ или ZIP.');
  }

  const imageFiles: { name: string; fileObj: JSZip.JSZipObject }[] = [];

  loadedZip.forEach((relativePath, fileObj) => {
    if (fileObj.dir) return;
    const lower = relativePath.toLowerCase();
    // Exclude hidden mac files and metadata
    if (lower.includes('__macosx') || lower.startsWith('.')) return;

    const isImage = IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
    if (isImage) {
      imageFiles.push({ name: relativePath, fileObj });
    }
  });

  if (imageFiles.length === 0) {
    throw new Error('В архиве комикса не найдено страниц с изображениями (PNG, JPG, WEBP).');
  }

  // Natural sort (e.g. page_1, page_2, page_10)
  imageFiles.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );

  const pages: ComicPageItem[] = [];

  for (let i = 0; i < imageFiles.length; i++) {
    const item = imageFiles[i];
    const blob = await item.fileObj.async('blob');
    const imageUrl = URL.createObjectURL(blob);
    const cleanFilename = item.name.split('/').pop() || item.name;
    const pageTitle = cleanFilename.replace(/\.[^/.]+$/, '');

    pages.push({
      pageNumber: i + 1,
      title: pageTitle.length > 30 ? `Страница ${i + 1}` : pageTitle,
      imageUrl,
      filename: cleanFilename,
    });
  }

  const coverUrl = pages.length > 0 ? pages[0].imageUrl : '';
  const comicTitle = file.name.replace(/\.(cbz|cbr|zip)$/i, '').trim() || 'Графический роман';

  return {
    title: comicTitle,
    pages,
    coverUrl,
  };
}
