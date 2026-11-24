import { Book, Chapter } from '../../types';
import { PlatformPublishingPackage } from './types';

/**
 * Service for direct publishing and packaging for Samlib (Самиздат / СИ - zhurnal.lib.ru)
 * Formats according to Samlib author server markup (<dd>&nbsp;&nbsp;, comments, copyright tags)
 */
export async function buildSamlibPackage(book: Book, chapters: Chapter[]): Promise<PlatformPublishingPackage> {
  const title = book.title || 'Произведение';
  const author = book.author || 'Автор KnigAI';
  const genre = book.genres && book.genres.length > 0 ? book.genres[0] : 'Фантастика';
  const year = new Date().getFullYear();

  // Samlib header markup
  const header = `<!------- zhurnal.lib.ru / KnigAI export ------->
<html>
<head>
<title>${escapeHtml(author)}: ${escapeHtml(title)}</title>
<meta http-equiv="Content-Type" content="text/html; charset=windows-1251">
</head>
<body bgcolor="#ffffff" text="#000000">
<center><h2>${escapeHtml(title)}</h2>
<h3>${escapeHtml(author)}</h3>
</center>
<hr size=1 width=80%>
<b>Аннотация:</b> <i>${escapeHtml(book.synopsis_overview || `Издание подготовлено в формате книжного нуара KnigAI.`)}</i><br>
<b>Жанр:</b> ${escapeHtml(genre)}<br>
<b>Количество глав:</b> ${chapters.length}<br>
<b>Год создания:</b> ${year}<br>
<hr size=1 width=80%>
`;

  // Samlib body chapters formatted with standard <dd>&nbsp;&nbsp; paragraph indentations
  const body = chapters
    .map((chap, idx) => {
      const chapNum = chap.chapter_number || idx + 1;
      const chapTitle = chap.title || `Глава ${chapNum}`;
      const paras = (chap.content || '')
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<dd>&nbsp;&nbsp;${escapeHtml(p)}</dd>`)
        .join('\n');

      return `<br><br>
<center><h4>Глава ${chapNum}. ${escapeHtml(chapTitle)}</h4></center>
<br>
${paras || '<dd>&nbsp;&nbsp;Текст главы...</dd>'}`;
    })
    .join('\n');

  const footer = `
<br><br>
<hr size=1 width=80%>
<center><small>Произведение опубликовано через платформу KnigAI. Все права принадлежат автору (${author}, ${year}).</small></center>
</body>
</html>`;

  const fullHtml = `${header}\n${body}\n${footer}`;
  const cleanFilename = `samlib_${title.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_').slice(0, 30)}.html`;
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });

  return {
    platformId: 'samlib',
    platformName: 'Самиздат Мошкова (zhurnal.lib.ru)',
    filename: cleanFilename,
    mimeType: 'text/html',
    blob,
    summary: `Сформирован HTML-файл по строгой разметке Самиздата Мошкова со служебными тегами и абзацами <dd>.`,
    directPublishUrl: 'http://zhurnal.lib.ru/',
    submissionInstructions: [
      'Файл полностью размечен под формат авторских страниц Самиздата (СИ).',
      'Войдите в личный кабинет автора на zhurnal.lib.ru.',
      'В меню выберите «Добавить новое произведение» и загрузите сформированный HTML-файл.',
      'Текст мгновенно появится на вашей странице в Самиздате с сохранением структуры глав.',
    ],
    requirementsChecked: true,
  };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
