/**
 * Core domain types for KnigAI Noir Edition v2
 */

export type NotificationCategoryKey =
  | 'billing'
  | 'generation'
  | 'import'
  | 'remix'
  | 'bonus'
  | 'system';

export interface NotificationChannelPref {
  bell: boolean;
  telegram: boolean;
  push: boolean;
}

export type NotificationPreferences = Record<NotificationCategoryKey, NotificationChannelPref>;

export interface AppUser {
  uid: number; // 11-digit unique KnigAI number (Truth ID #1)
  email: string;
  name?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  is_admin?: boolean;
  created_at?: string;
  letters_balance?: number; // Internal currency: 1 000 букв = 1 рубль. Default 1 000 000
  referred_by_uid?: number | null;
  // Telegram & Mini App fields (Truth ID #2 = telegram_id)
  telegram_id?: string | null;
  telegram_verified?: boolean;
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
  photo_url?: string | null;
  profile_link?: string | null;
  is_premium?: boolean;
  language_code?: string | null;
  allows_write_to_pm?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  referred_by?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referral_reward_balance?: number;
  notification_prefs?: NotificationPreferences;
  last_login?: string;
}

export type BookCreationMode = 'scratch' | 'drafts' | 'full-book';

export interface DraftFragment {
  id: string;
  title: string;
  content: string;
  order: number;
  filename?: string;
  charCount: number;
  sourceType?: 'manual' | 'file' | 'ocr_image' | 'voice';
  sourceImageUrl?: string;
}

export type BookDraftType = 'book_note' | 'chapter_draft' | 'unattached' | 'ocr_scan' | 'voice_note';
export type BookDraftStatus = 'idea' | 'in_work' | 'included' | 'archive';
export type BookDraftSourceType = 'manual' | 'file' | 'ocr_image' | 'voice';

export interface BookDraft {
  id: number;
  user_uid?: number | null;
  book_id?: number | null;
  chapter_id?: number | null;
  chapter_number?: number | null;
  draft_type: BookDraftType;
  title: string;
  content: string;
  source_type: BookDraftSourceType;
  source_image_url?: string | null;
  status: BookDraftStatus;
  include_in_ai: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface BookPermissions {
  isOwner: boolean;
  isParsedBook: boolean;
  isForeignBook: boolean;
  canEditContent: boolean;
  canEditHeadersOnly: boolean;
  canCreateRemix: boolean;
  canCreateSequel: boolean;
  canPublishOrDelete: boolean;
}

export interface ParsedChapter {
  chapterNumber: number;
  title: string;
  content: string;
  wordCount: number;
  synopsis?: string;
  illustration_url?: string;
}

export interface TokenCostEstimation {
  charCount: number;
  wordCount: number;
  estimatedTokens: number;
  lettersCost: number;
  rublesCost: number;
}

export interface GenreRecord {
  id: number;
  name: string;
  category: string;
  description: string;
  is_custom?: boolean;
  user_uid?: number | null;
}

export interface GenreWeight {
  genre: string;
  weight: number; // 0 to 100
}

export interface DraggableBlockConfig {
  id: string;
  type: 'title' | 'subtitle' | 'author' | 'badge';
  text: string;
  x: number; // percentage or pixels
  y: number;
  fontSize: number;
  visible: boolean;
}

export interface CoverTextLayout {
  titleOffsetX?: number; // in pixels (negative or positive)
  titleOffsetY?: number;
  titleFontSize?: number;
  titleContainerWidth?: number; // in percent
  titleContainerHeight?: number; // in pixels
  titleAlignV?: 'top' | 'center' | 'bottom' | 'space-between';
  titleAlignH?: 'left' | 'center' | 'right' | 'justify';
  titleHidden?: boolean;
  subtitleOffsetX?: number;
  subtitleOffsetY?: number;
  subtitleFontSize?: number;
  subtitleContainerWidth?: number;
  subtitleContainerHeight?: number;
  subtitleAlignV?: 'top' | 'center' | 'bottom';
  subtitleAlignH?: 'left' | 'center' | 'right' | 'justify';
  subtitleHidden?: boolean;
  authorOffsetX?: number;
  authorOffsetY?: number;
  authorFontSize?: number;
  authorContainerWidth?: number;
  authorContainerHeight?: number;
  authorAlignV?: 'top' | 'center' | 'bottom' | 'space-between';
  authorAlignH?: 'left' | 'center' | 'right' | 'justify';
  authorHidden?: boolean;
  genreOffsetX?: number;
  genreOffsetY?: number;
  genreFontSize?: number;
  genreContainerWidth?: number;
  genreContainerHeight?: number;
  genreAlignV?: 'top' | 'center' | 'bottom';
  genreAlignH?: 'left' | 'center' | 'right' | 'justify';
  genreHidden?: boolean;
  backGenreOffsetX?: number;
  backGenreOffsetY?: number;
  backGenreFontSize?: number;
  backGenreContainerWidth?: number;
  backGenreContainerHeight?: number;
  backGenreAlignV?: 'top' | 'center' | 'bottom';
  backGenreAlignH?: 'left' | 'center' | 'right' | 'justify';
  backGenreHidden?: boolean;
  spineOffsetY?: number;
  spineFontSize?: number;
  spineTitleOffsetX?: number;
  spineTitleOffsetY?: number;
  spineTitleFontSize?: number;
  spineTitleWidth?: number;
  spineTitleHeight?: number;
  spineTitleAlignV?: 'top' | 'center' | 'bottom' | 'space-between';
  spineTitleAlignH?: 'left' | 'center' | 'right';
  spineTitleHidden?: boolean;
  spineAuthorOffsetX?: number;
  spineAuthorOffsetY?: number;
  spineAuthorFontSize?: number;
  spineAuthorWidth?: number;
  spineAuthorHeight?: number;
  spineAuthorAlignV?: 'top' | 'center' | 'bottom' | 'space-between';
  spineAuthorAlignH?: 'left' | 'center' | 'right';
  spineAuthorHidden?: boolean;
  spineSwapOrder?: boolean;
  blurbOffsetX?: number;
  blurbOffsetY?: number;
  blurbFontSize?: number;
  blurbContainerWidth?: number;
  blurbContainerHeight?: number;
  blurbAlignV?: 'top' | 'center' | 'bottom' | 'space-between';
  blurbAlignH?: 'left' | 'center' | 'right' | 'justify';
  blurbHidden?: boolean;
}

export interface CoverImageTransform {
  posX?: number; // 0 to 100 object-position X (%)
  posY?: number; // 0 to 100 object-position Y (%)
  zoom?: number; // 100 to 220 (%)
}

export interface CoverImageLayer {
  id: string;
  name: string;
  url: string;
  x: number; // px offset from wrap canvas center
  y: number; // px offset from wrap canvas center
  widthPx: number; // base width in px
  scale: number; // percent 10..300
  rotation: number; // degrees -180..180
  opacity: number; // percent 5..100
  zIndex: number; // <20 behind text, >=20 above text
  visible: boolean;
  locked?: boolean;
  flipX?: boolean;
  blendMode?: 'normal' | 'multiply' | 'screen' | 'overlay';
  filter?: 'normal' | 'grayscale' | 'contrast' | 'sepia' | 'invert';
}

export interface BookCoverConfig {
  frontTitle: string;
  frontSubtitle: string;
  authorName: string;
  spineText: string;
  backBlurb: string;
  genreLabel: string;
  frontImageUrl: string;
  backImageUrl?: string;
  fullWrapImageUrl?: string; // Panoramic horizontal spread across back + spine + front
  frontImagePos?: CoverImageTransform;
  backImagePos?: CoverImageTransform;
  fullWrapImagePos?: CoverImageTransform;
  layers?: CoverImageLayer[]; // Mini-Photoshop transparent PNG & overlay layers
  backColor?: string;
  spineColor: string;
  paperType: 'cream' | 'white';
  pageCountEstimate: number;
  isbn: string;
  barcodeText: string;
  // Customization & draggable elements
  hideBranding?: boolean; // hides KnigAI and A5 labels if user desires
  showBlockGuides?: boolean; // show/hide text block bounding box borders and drag handles
  imageFilter?: 'normal' | 'grayscale' | 'contrast' | 'sepia' | 'invert';
  colorTint?: string;
  draggableBlocks?: DraggableBlockConfig[];
  textLayout?: CoverTextLayout;
}

export type BookRelationType = 'sequel' | 'prequel' | 'spinoff' | 'reboot' | 'standalone';
export type BookReworkMode = 'edit' | 'remake';
export type BookReworkScope = 'current' | 'from_current' | 'all';

export interface BookMeta {
  year?: string;
  translator?: string;
  publisher?: string;
  isbn?: string;
  keywords?: string[];
  language?: string;
  originalLanguage?: string;
  tags?: string[];
  flibustaBookId?: string;
  pageCountEstimate?: number;
  sizeText?: string;
  sourceUrl?: string;
}

export interface ChapterRevision {
  id: number;
  book_id: number;
  chapter_id?: number | null;
  chapter_number: number;
  title: string;
  synopsis?: string;
  content: string;
  revision_note?: string;
  mode?: BookReworkMode | string;
  created_at: string;
}

export interface Book {
  id: number;
  user_uid?: number;
  title: string;
  slug?: string;
  subtitle: string;
  author: string;
  genres: string[];
  genre_weights?: GenreWeight[];
  basic_plots?: string[]; // Christopher Booker's 7 Basic Plots IDs
  style_config?: BookStyleConfig;
  target_chapters: number;
  status: 'draft' | 'in_progress' | 'completed';
  is_published?: boolean;
  cover_config: BookCoverConfig;
  synopsis_overview: string;
  setting?: string;
  tone?: string;
  audience?: string;
  running_header?: string; // custom running header for book pages
  table_of_contents_title?: string;
  audio_tracks?: AudioTrack[];
  original_file_url?: string;
  file_storage_id?: number;
  format?: 'fb2' | 'epub' | 'pdf' | 'mp3' | 'txt' | 'm4b' | 'm4a' | 'html' | 'cbz' | 'cbr' | string;
  content_type?: 'book' | 'audiobook' | 'hybrid' | 'manga' | 'comic' | string;
  has_voice_tracks?: boolean;
  voice_tracks_count?: number;
  parent_book_id?: number | null;
  relation_type?: BookRelationType | null;
  series_name?: string | null;
  series_order?: number | null;
  book_meta?: BookMeta | null;
  author_instructions?: string;
  is_parsed_source?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AudioTrack {
  id: string;
  title: string;
  url: string;
  duration?: number; // seconds
  chapter_number?: number;
  chapter_id?: number | null;
  narrator_name?: string;
  source_type?: 'voice_record' | 'dictation_stt' | 'uploaded_file' | string;
  file_id?: number | null;
  is_primary?: boolean;
  track_db_id?: number;
}

export interface BookAudioTrack {
  id: number;
  book_id: number;
  chapter_id?: number | null;
  chapter_number?: number | null;
  file_id?: number | null;
  folder_id?: number | null;
  user_uid?: number | null;
  title: string;
  narrator_name: string;
  source_type: 'voice_record' | 'dictation_stt' | 'uploaded_file' | string;
  audio_url: string;
  mime_type?: string;
  file_size?: number;
  duration_sec?: number;
  is_primary: boolean;
  sort_order?: number;
  created_at?: string;
}

export interface BookDownloadFormatOption {
  format: 'fb2.zip' | 'epub' | 'mobi' | 'txt.zip' | 'rtf.zip' | 'a4.pdf' | 'html' | 'fb2' | 'txt' | 'pdf' | 'mp3';
  label: string;
  downloadUrl?: string;
  isPrimary?: boolean;
}

export interface ParsedBookSearchResult {
  id: string;
  bookId?: string;
  source: 'opds' | 'annas' | 'librivox' | 'archive' | 'openlibrary' | 'flibusta' | 'samlib' | 'librusec' | 'yandex_books';
  sourceName: string;
  title: string;
  author: string;
  series?: string;
  seriesNumber?: number;
  year?: string;
  genres?: string[];
  translator?: string;
  publisher?: string;
  isbn?: string;
  originalLanguage?: string;
  tags?: string[];
  a5PagesEstimate?: number;
  language: string;
  format: 'fb2' | 'epub' | 'pdf' | 'mp3' | 'txt' | 'm4b' | 'html' | 'cbz' | 'cbr';
  contentType: 'book' | 'audiobook';
  sizeFormatted?: string;
  coverUrl?: string;
  highResCoverUrl?: string;
  description?: string;
  downloadUrl: string;
  audioTracks?: AudioTrack[];
  availableFormats?: BookDownloadFormatOption[];
  bookMeta?: BookMeta;
}

export interface BookStyleConfig {
  styleName: string;
  proseVoice: string;
  pacing: string;
  vocabulary: string;
  visualAesthetic: string;
  customGuidelines?: string;
}

export type WorldEntityType = 'character' | 'location' | 'item' | 'faction' | 'law';

export interface WorldEntity {
  id: number;
  book_id: number;
  user_uid?: number;
  entity_type: WorldEntityType;
  name: string;
  subtitle_or_role: string;
  description: string;
  attributes: Record<string, string | string[]>;
  visual_prompt: string;
  image_url: string;
  created_at?: string;
}

export interface Character {
  id: number;
  book_id: number;
  user_uid?: number;
  name: string;
  role: 'главный герой' | 'антагонист' | 'наставник' | 'спутник' | 'второстепенный' | 'таинственный союзник';
  description: string;
  visual_card_url: string;
  visual_prompt: string;
  traits: string[];
  created_at?: string;
}

export interface FootnoteItem {
  id: string;
  number: number;
  term: string;
  text: string;
}

export type ImagePlacementMode =
  | 'full-width'
  | 'wrap-left'
  | 'wrap-right'
  | 'header-break'
  | 'page-bg'
  | 'gradient-blend'
  | 'graphic-panel'
  | 'photo-polaroid'
  | 'split-vertical';

export type ImagePageZone =
  | 'auto'
  | 'page-start'
  | 'page-middle'
  | 'page-end'
  | 'full-page';

export interface ImageLayoutConfig {
  mode: ImagePlacementMode;
  scale: number; // 30 to 100 percent
  filter: 'normal' | 'grayscale' | 'contrast' | 'sepia' | 'invert';
  colorTint?: string;
  offsetX?: number;
  offsetY?: number;
  pageZone?: ImagePageZone;
  targetPageInChapter?: number; // 1-based page index inside chapter
  bgOpacity?: number; // 15 to 90 percent for background / gradient overlay
  gradientDirection?: 'bottom' | 'top' | 'left' | 'right';
  caption?: string;
}

export interface Chapter {
  id: number;
  book_id: number;
  user_uid?: number;
  chapter_number: number;
  title: string;
  synopsis: string;
  content: string;
  illustration_url: string;
  illustration_prompt: string;
  status: 'planned' | 'draft' | 'ready';
  footnotes?: FootnoteItem[];
  image_layout?: ImageLayoutConfig;
  entity_ids?: number[];
  continuity_summary?: string;
  author_comment?: string;
  audio_url?: string;
  audio_file_id?: number | null;
  audio_duration_sec?: number | null;
  created_at?: string;
}

export interface PromptTemplate {
  id?: number;
  key: string;
  name: string;
  title?: string;
  template: string;
  system_instruction?: string;
  macro_description?: string;
  input_cost_multiplier?: number;
  output_cost_multiplier?: number;
  category: 'synopsis' | 'characters' | 'chapters' | 'visuals' | 'covers' | 'lore' | 'import' | 'style' | 'voice';
  updated_at?: string;
}

export interface TransactionRecord {
  id: number;
  user_uid: number;
  amount: number; // positive for credit, negative for debit
  balance_after: number;
  operation_type: 'ai_generation' | 'book_import' | 'image_generation' | 'topup' | 'welcome_bonus' | 'referral_bonus' | 'other';
  description: string;
  details?: {
    input_chars?: number;
    output_chars?: number;
    input_letters?: number;
    output_letters?: number;
    tokens_total?: number;
    tokens_in_source?: number;
    tokens_out_source?: number;
    prompt_key?: string;
    book_id?: number;
    book_title?: string;
    chapter_number?: number;
    rubles?: number;
    [key: string]: unknown;
  };
  created_at: string;
}

export interface NotificationItem {
  id: number;
  user_uid: number;
  type: 'billing' | 'generation' | 'import' | 'bonus' | 'remix' | 'system';
  title: string;
  message: string;
  is_read: boolean;
  link?: AppRoute | string | null;
  created_at: string;
}

export interface GalleryItem {
  id: number;
  book_id?: number;
  user_uid?: number;
  image_url: string;
  prompt: string;
  aspect_ratio: string;
  created_at?: string;
}

export interface FileRecord {
  id: number;
  file_key: string;
  user_uid?: number;
  name: string;
  original_url: string;
  short_url?: string;
  mime_type: string;
  file_size: number;
  folder_id: number | null;
  created_at: string;
}

export interface FileFolder {
  id: number;
  user_uid?: number;
  name: string;
  color: string;
  created_at: string;
}

export interface ReadingProgress {
  user_uid: number;
  book_id: number;
  current_chapter: number;
  current_page: number;
  updated_at?: string;
}

export type AppRoute =
  | 'landing'
  | 'profile'
  | 'balance'
  | 'notifications'
  | 'library'
  | 'constructor'
  | 'chapters'
  | 'characters'
  | 'cover'
  | 'reader'
  | 'gallery'
  | 'admin'
  | 'public-read'
  | 'oferta'
  | 'privacy'
  | 'agreement'
  | 'consent'
  | 'payment-success'
  | 'payment-fail'
  | 'blog'
  | 'blog-post';

export interface AiLogRecord {
  id: number;
  channel_id: string | null;
  user_social_id: string | null;
  user_message: string | null;
  bot_reply: string | null;
  channel_name: string | null;
  bot_id: string | null;
  llm: string | null;
  api_key: string | null;
  tokens_total: number | null;
  tokens_in_source: number | null;
  tokens_out_source: number | null;
  function_error: string | null;
  function_call_params: string | null;
  server_name: string | null;
  tokens_user: number | null;
  created_at: string;
  rub: number;
}

