import { Book, Chapter, Character } from '../../types';
import { getUploadService } from '../upload/FileUploadService';
import { getOrCreateBookFolder } from '../db/fileStorageRepository';

export async function exportManuscriptText(
  book: Book,
  chapters: Chapter[],
  characters: Character[],
  userUid?: number
): Promise<{ downloadUrl?: string; filename: string }> {
  let content = `# ${book.title}\n`;
  if (book.subtitle) content += `## ${book.subtitle}\n`;
  content += `Автор: ${book.author || 'Автор KnigAI'}\n`;
  content += `Жанры: ${book.genres.join(', ')}\n`;
  content += `Формат: Amazon KDP A5 (148 x 210 мм)\n`;
  content += `Дата формирования: ${new Date().toLocaleDateString('ru-RU')}\n\n`;

  content += `===\nОПИСАНИЕ ВСЕЛЕННОЙ И СИНОПСИС\n===\n\n`;
  content += `${book.synopsis_overview || 'Синопсис книги'}\n\n`;

  content += `===\nДОСЬЕ ПЕРСОНАЖЕЙ (${characters.length})\n===\n\n`;
  characters.forEach((char, idx) => {
    content += `${idx + 1}. ${char.name} — ${char.role}\n`;
    content += `Черты: ${char.traits.join(', ')}\n`;
    content += `Описание: ${char.description}\n`;
    if (char.visual_card_url) {
      content += `Визуальная карта: ${char.visual_card_url}\n`;
    }
    content += `\n`;
  });

  content += `===\nГЛАВЫ КНИГИ (${chapters.length})\n===\n\n`;
  chapters.forEach((chap) => {
    content += `--- ГЛАВА ${chap.chapter_number}: ${chap.title} ---\n`;
    if (chap.synopsis) content += `Краткий синопсис: ${chap.synopsis}\n\n`;
    content += `${chap.content || '[Текст главы еще не сгенерирован]'}\n\n`;
    if (chap.illustration_url) {
      content += `[Иллюстрация главы]: ${chap.illustration_url}\n\n`;
    }
  });

  const filename = `${book.title.replace(/[^\w\u0400-\u04FF]/gi, '_')}_рукопись.md`;
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Upload to book's folder in file_storage gallery
  let downloadUrl: string | undefined;
  try {
    const uploader = getUploadService();
    const folder = await getOrCreateBookFolder(book.id, book.title, userUid);
    const fileRecord = await uploader.uploadFromBlob(blob, filename, folder.id);
    downloadUrl = fileRecord.original_url || fileRecord.short_url;
  } catch (err) {
    console.warn('Auto upload manuscript to gallery error:', err);
  }

  return { downloadUrl, filename };
}
