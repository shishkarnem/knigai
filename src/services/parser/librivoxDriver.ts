/**
 * LibriVox Audiobook Driver for Free Audiobooks (including Russian classics)
 * Directly provides chapter-by-chapter MP3 audio streams
 */
import { ParsedBookSearchResult, AudioTrack } from '../../types';
import { ParserSearchOptions, ParserDriver } from './types';

interface LibrivoxSection {
  id?: string;
  section_number?: string;
  title?: string;
  listen_url?: string;
  playtime?: string;
}

interface LibrivoxBookItem {
  id: string;
  title: string;
  description?: string;
  url_text_source?: string;
  language?: string;
  copyright_year?: string;
  num_sections?: string;
  authors?: { id: string; first_name: string; last_name: string; dob?: string; dod?: string }[];
  sections?: LibrivoxSection[];
}

export class LibrivoxDriver implements ParserDriver {
  id = 'librivox';
  name = 'LibriVox (Открытые аудиокниги)';

  async search(options: ParserSearchOptions): Promise<ParsedBookSearchResult[]> {
    const { query, category = 'all', language = 'ru' } = options;
    if (category === 'books') {
      return []; // LibriVox is audiobooks only
    }

    if (!query.trim()) return [];

    const results: ParsedBookSearchResult[] = [];

    try {
      // LibriVox API allows searching by title or author
      const queryParam = encodeURIComponent(query.trim());
      const apiUrl = `https://librivox.org/api/feed/audiobooks/?title=^${queryParam}&format=json&extended=1`;

      const res = await fetch(apiUrl, { signal: AbortSignal.timeout(6500) });
      if (!res.ok) {
        // Fallback to simple author or keyword search
        return this.searchFallback(query, language);
      }

      const data = await res.json();
      const booksList: LibrivoxBookItem[] = Array.isArray(data.books)
        ? data.books
        : data.books
        ? Object.values(data.books)
        : [];

      for (const item of booksList.slice(0, 8)) {
        const authorObj = item.authors && item.authors.length > 0 ? item.authors[0] : null;
        const author = authorObj ? `${authorObj.first_name} ${authorObj.last_name}`.trim() : 'Классический автор';
        const isRussian = (item.language || '').toLowerCase().includes('rus') || language === 'ru';

        // Extract audio chapter tracks
        const audioTracks: AudioTrack[] = [];
        if (item.sections && Array.isArray(item.sections)) {
          item.sections.forEach((s, idx) => {
            if (s.listen_url) {
              const playtimeNum = s.playtime ? parseInt(s.playtime, 10) : undefined;
              audioTracks.push({
                id: `track_${item.id}_${s.id || idx + 1}`,
                title: s.title || `Глава ${idx + 1}`,
                url: s.listen_url,
                duration: isNaN(playtimeNum as number) ? undefined : playtimeNum,
                chapter_number: idx + 1,
              });
            }
          });
        }

        // Librivox book cover url
        const coverUrl = `https://archive.org/services/img/librivoxaudio_${item.id}`;

        results.push({
          id: `librivox_${item.id}`,
          source: 'librivox',
          sourceName: 'LibriVox Аудиокниги',
          title: item.title,
          author,
          year: item.copyright_year,
          language: isRussian ? 'русский' : (item.language || 'русский'),
          format: 'mp3',
          contentType: 'audiobook',
          sizeFormatted: `${item.num_sections || audioTracks.length || 'Несколько'} аудио-глав`,
          coverUrl,
          highResCoverUrl: coverUrl,
          description: (item.description || 'Классическое аудиоиздание в общественном достоянии.').replace(/<[^>]+>/g, '').slice(0, 180),
          downloadUrl: audioTracks.length > 0 ? audioTracks[0].url : `https://librivox.org`,
          audioTracks: audioTracks.length > 0 ? audioTracks : undefined,
        });
      }
    } catch (e) {
      console.warn('[LibrivoxDriver] Primary search notice:', e);
      return this.searchFallback(query, language);
    }

    return results;
  }

  private async searchFallback(query: string, language: string): Promise<ParsedBookSearchResult[]> {
    try {
      const url = `https://librivox.org/api/feed/audiobooks/?author=^${encodeURIComponent(query)}&format=json&extended=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return [];

      const data = await res.json();
      const list: LibrivoxBookItem[] = Array.isArray(data.books)
        ? data.books
        : data.books
        ? Object.values(data.books)
        : [];

      return list.slice(0, 5).map((item) => {
        const authorObj = item.authors && item.authors.length > 0 ? item.authors[0] : null;
        const author = authorObj ? `${authorObj.first_name} ${authorObj.last_name}`.trim() : 'Классический автор';
        const coverUrl = `https://archive.org/services/img/librivoxaudio_${item.id}`;

        const audioTracks: AudioTrack[] = [];
        if (item.sections && Array.isArray(item.sections)) {
          item.sections.forEach((s, idx) => {
            if (s.listen_url) {
              const playtimeNum = s.playtime ? parseInt(s.playtime, 10) : undefined;
              audioTracks.push({
                id: `track_${item.id}_${s.id || idx + 1}`,
                title: s.title || `Глава ${idx + 1}`,
                url: s.listen_url,
                duration: isNaN(playtimeNum as number) ? undefined : playtimeNum,
                chapter_number: idx + 1,
              });
            }
          });
        }

        return {
          id: `librivox_${item.id}`,
          source: 'librivox',
          sourceName: 'LibriVox Аудиокниги',
          title: item.title,
          author,
          year: item.copyright_year,
          language: 'русский',
          format: 'mp3',
          contentType: 'audiobook',
          sizeFormatted: `${item.num_sections || audioTracks.length || '10+'} аудио-глав`,
          coverUrl,
          highResCoverUrl: coverUrl,
          description: (item.description || 'Аудиоверсия классического произведения.').replace(/<[^>]+>/g, '').slice(0, 180),
          downloadUrl: audioTracks.length > 0 ? audioTracks[0].url : `https://librivox.org`,
          audioTracks: audioTracks.length > 0 ? audioTracks : undefined,
        };
      });
    } catch {
      return [];
    }
  }
}
