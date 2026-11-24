import { Book, Chapter } from '../../types';
import { PlatformPublishingPackage, PlatformMetadata, PublishingPlatformId } from './types';
import { buildFlibustaPackage, buildLibrusecPackage } from './russianOpdsPlatforms';
import { buildSamlibPackage } from './samlibService';
import { buildYandexBooksPackage } from './yandexBooksService';

export * from './types';
export * from './russianOpdsPlatforms';
export * from './samlibService';
export * from './yandexBooksService';

export const SUPPORTED_PUBLISHING_PLATFORMS: PlatformMetadata[] = [
  {
    id: 'flibusta',
    name: 'Флибуста (Flibusta)',
    tagline: 'Крупнейший открытый книжный каталог и OPDS-библиотека',
    supportedFormats: ['FB2', 'EPUB', 'OPDS'],
    audience: 'Миллионы читателей русскоязычной литературы',
    directUrl: 'https://flibusta.is',
    description: 'Прямая публикация в открытый каталог FB2 с автоматической генерацией дескрипторов и структуры оглавления.',
  },
  {
    id: 'samlib',
    name: 'Самиздат Мошкова (zhurnal.lib.ru)',
    tagline: 'Легендарный русскоязычный портал самиздата',
    supportedFormats: ['HTML', 'TXT', 'ZIP'],
    audience: 'Активное сообщество авторов и рецензентов СИ',
    directUrl: 'http://zhurnal.lib.ru/',
    description: 'Пакет с авторской разметкой абзацев <dd>, аннотацией и жанровыми тегами для авторского раздела.',
  },
  {
    id: 'librusec',
    name: 'Либрусек (Librusec)',
    tagline: 'Классическая электронная библиотека и архив',
    supportedFormats: ['FB2', 'EPUB'],
    audience: 'Читатели классической и современной прозы',
    directUrl: 'http://lib.is/',
    description: 'Формирование индексируемого FB2 файла с сохранением прав автора и полиграфических данных.',
  },
  {
    id: 'yandex_books',
    name: 'Яндекс Книги (Букмейт / Bookmate)',
    tagline: 'Ведущий стриминговый книжный сервис с подпиской Яндекс Плюс',
    supportedFormats: ['EPUB 3.0', 'OPF'],
    audience: 'Миллионная аудитория Яндекс Плюс и подписчиков Букмейт',
    directUrl: 'https://books.yandex.ru/publisher',
    description: 'Сборка валидного EPUB 3.0 архива по спецификациям Bookmate с навигацией и типографикой.',
  },
];

export async function generatePublishingPackage(
  platformId: PublishingPlatformId,
  book: Book,
  chapters: Chapter[]
): Promise<PlatformPublishingPackage> {
  switch (platformId) {
    case 'flibusta':
      return buildFlibustaPackage(book, chapters);
    case 'samlib':
      return buildSamlibPackage(book, chapters);
    case 'librusec':
      return buildLibrusecPackage(book, chapters);
    case 'yandex_books':
      return buildYandexBooksPackage(book, chapters);
    default:
      throw new Error(`Неизвестная платформа для публикации: ${platformId}`);
  }
}
