/**
 * Anna's Archive & Shadow Libraries Driver (Librarr-compatible parser)
 * Searches shadow libraries (Libgen, Z-Library) with Russian language prioritization
 */
import { ParsedBookSearchResult } from '../../types';
import { ParserSearchOptions, ParserDriver } from './types';

export class AnnasDriver implements ParserDriver {
  id = 'annas';
  name = 'Архив книг и рукописей (Anna\'s Archive & Libgen)';

  async search(options: ParserSearchOptions): Promise<ParsedBookSearchResult[]> {
    const { query, category = 'all', language = 'ru' } = options;
    if (category === 'audio') {
      return []; // Primarily text books
    }

    if (!query.trim()) return [];

    const results: ParsedBookSearchResult[] = [];

    // Query server-side proxy route or direct mirror
    try {
      const searchParams = new URLSearchParams({
        q: query.trim(),
        lang: language === 'ru' ? 'ru' : '',
        ext: 'epub,fb2,pdf',
      });

      // We call our server route `/api/parser/annas` to avoid CORS and parse HTML/JSON safely
      const response = await fetch(`/api/parser/annas?${searchParams.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.items)) {
          return data.items;
        }
      }
    } catch (e) {
      console.warn('[AnnasDriver] Search notice:', e);
    }

    return results;
  }
}
