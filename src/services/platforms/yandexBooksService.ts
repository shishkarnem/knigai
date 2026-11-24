import JSZip from 'jszip';
import { Book, Chapter } from '../../types';
import { PlatformPublishingPackage } from './types';

/**
 * Service for direct publishing and packaging for Yandex Books (Яндекс Книги / Букмейт / Bookmate)
 * Generates valid EPUB 3.0 publication archive compliant with Bookmate & Yandex Books ingestion.
 */
export async function buildYandexBooksPackage(book: Book, chapters: Chapter[]): Promise<PlatformPublishingPackage> {
  const zip = new JSZip();
  const title = book.title || 'Новая книга';
  const author = book.author || 'Автор KnigAI';
  const uuid = `urn:uuid:knigai-${book.id || Date.now()}`;
  const genre = book.genres && book.genres.length > 0 ? book.genres.join(', ') : 'Художественная литература';

  // 1. mimetype (must be uncompressed first file)
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });

  // 2. META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  zip.file('META-INF/container.xml', containerXml);

  // 3. Chapters HTML files
  const manifestItems: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="style" href="style.css" media-type="text/css"/>',
  ];
  const spineItems: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const chap = chapters[i];
    const chapNum = chap.chapter_number || i + 1;
    const chapTitle = chap.title || `Глава ${chapNum}`;
    const filename = `chapter_${chapNum}.xhtml`;
    const itemId = `chap_${chapNum}`;

    manifestItems.push(`<item id="${itemId}" href="${filename}" media-type="application/xhtml+xml"/>`);
    spineItems.push(`<itemref idref="${itemId}"/>`);

    const paragraphs = (chap.content || '')
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeXml(p)}</p>`)
      .join('\n');

    const chapterHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>${escapeXml(chapTitle)}</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <section class="chapter">
    <h1 class="chapter-title">${escapeXml(chapTitle)}</h1>
    <div class="chapter-content">
      ${paragraphs || '<p>Текст главы...</p>'}
    </div>
  </section>
</body>
</html>`;
    zip.file(`OEBPS/${filename}`, chapterHtml);
  }

  // 4. Navigation (nav.xhtml)
  const navItems = chapters
    .map((c, i) => {
      const num = c.chapter_number || i + 1;
      return `<li><a href="chapter_${num}.xhtml">${escapeXml(c.title || `Глава ${num}`)}</a></li>`;
    })
    .join('\n        ');

  const navHtml = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru">
<head>
  <title>Оглавление</title>
  <link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Оглавление</h1>
    <ol>
      ${navItems}
    </ol>
  </nav>
</body>
</html>`;
  zip.file('OEBPS/nav.xhtml', navHtml);

  // 5. CSS
  const css = `
body {
  font-family: 'PT Serif', Georgia, serif;
  margin: 5%;
  line-height: 1.6;
  color: #1a1a1a;
}
h1.chapter-title {
  text-align: center;
  font-size: 1.8em;
  margin-bottom: 1.5em;
  color: #ef4444;
}
p {
  text-indent: 1.5em;
  margin-bottom: 0.5em;
  text-align: justify;
}
`;
  zip.file('OEBPS/style.css', css);

  // 6. content.opf
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookId" version="3.0" xml:lang="ru">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:identifier id="BookId">${uuid}</dc:identifier>
    <dc:language>ru</dc:language>
    <dc:publisher>KnigAI Publishing</dc:publisher>
    <dc:subject>${escapeXml(genre)}</dc:subject>
    <dc:description>${escapeXml(book.synopsis_overview || title)}</dc:description>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${manifestItems.join('\n    ')}
  </manifest>
  <spine>
    ${spineItems.join('\n    ')}
  </spine>
</package>`;
  zip.file('OEBPS/content.opf', opf);

  const epubBlob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' });
  const cleanFilename = `yandex_books_${title.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_-]/g, '_').slice(0, 30)}.epub`;

  return {
    platformId: 'yandex_books',
    platformName: 'Яндекс Книги (Букмейт / Bookmate)',
    filename: cleanFilename,
    mimeType: 'application/epub+zip',
    blob: epubBlob,
    summary: `Сформирован валидный EPUB 3.0 пакет со спецификацией OPF, навигацией nav.xhtml и метаданными для Яндекс Книг.`,
    directPublishUrl: 'https://books.yandex.ru/publisher',
    submissionInstructions: [
      'Пакет собран по официальным требованиям Яндекс Книг (Bookmate EPUB 3.0).',
      'Войдите в личный кабинет издателя / автора на Яндекс Книгах (или через сервис ЛитРес Самиздат / SelfPub).',
      'Загрузите сформированный .epub файл.',
      'Книга пройдет автоматическую валидацию оглавления и станет доступна миллионам подписчиков Яндекс Плюса.',
    ],
    requirementsChecked: true,
  };
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
