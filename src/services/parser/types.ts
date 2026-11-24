/**
 * Types for KnigAI Book & Audiobook Parser (Librarr-compatible architecture)
 */
import { ParsedBookSearchResult, AudioTrack } from '../../types';

export interface ParserSearchOptions {
  query: string;
  category?: 'all' | 'books' | 'audio';
  catalog?: 'flibusta' | 'samlib' | 'librusec' | 'audio' | 'all';
  searchType?: 'title' | 'author' | 'series';
  preferredFormat?: string;
  language?: 'ru' | 'all';
  limit?: number;
}

export interface ParserDriver {
  id: string;
  name: string;
  search(options: ParserSearchOptions): Promise<ParsedBookSearchResult[]>;
}

export interface ProTalkUploadResult {
  original_url: string;
  name: string;
  mime_type: string;
  file_size: number;
  short_url?: string;
  file_key: string;
}

export interface ImportParsedBookPayload {
  item: ParsedBookSearchResult;
  user_uid?: number;
  autoExtractChapters?: boolean;
  saveToGallery?: boolean;
  chosenFormat?: string;
}
