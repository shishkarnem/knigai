export type BackupFormat = 'dump' | 'sql' | 'json' | 'all';

export type RestoreMode = 'merge' | 'replace';

export const PLATFORM_VERSION = 'v.1.07';
export const PLATFORM_DB_LABEL = 'KnigAI';
export const DEFAULT_TELEGRAM_CHAT_ID = '169262990';
export const DEFAULT_TELEGRAM_BOT_TOKEN = '8825493645:AAHFzuZGbw5TKl2HxXRwnrNPpfg7d-xqO3g';
export const DEFAULT_SCHEDULE_HOUR_MSK = 6;
export const DEFAULT_SCHEDULE_MINUTE_MSK = 0;

export type QueryPgFn = <T = Record<string, unknown>>(
  sql: string,
  params?: (string | number | boolean | null)[]
) => Promise<{ rows: T[]; rowCount: number }>;

export interface ColumnSchema {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
  is_identity: string;
  identity_generation: string | null;
  character_maximum_length: number | null;
  ordinal_position: number;
}

export interface TableSchemaInfo {
  name: string;
  columns: ColumnSchema[];
  primaryKeys: string[];
  indexes: Array<{ indexname: string; indexdef: string }>;
  rowCount: number;
}

export interface BackupSettings {
  id: number;
  enabled: boolean;
  telegram_chat_id: string;
  telegram_bot_token: string;
  schedule_hour_msk: number;
  schedule_minute_msk: number;
  default_format: BackupFormat;
  include_zip: boolean;
  last_auto_run_msk_date: string | null;
  updated_at?: string;
}

export interface BackupStats {
  totalTables: number;
  nonEmptyTables: number;
  totalRows: number;
  rawSizeBytes: number;
  zipSizeBytes: number | null;
  formatLabel: string;
  createdAtMsk: string;
  reason: string;
  platformVersion?: string;
}

export interface BackupHistoryRecord {
  id: number;
  reason: string;
  format: BackupFormat;
  is_zip: boolean;
  filename: string;
  mime_type: string;
  total_tables: number;
  non_empty_tables: number;
  total_rows: number;
  raw_size_bytes: number;
  zip_size_bytes: number | null;
  created_at_msk: string;
  telegram_sent: boolean;
  telegram_chat_id: string | null;
  telegram_message_id: number | null;
  telegram_file_id: string | null;
  telegram_caption: string | null;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
  created_at?: string;
}

export interface GeneratedBackupArtifact {
  filename: string;
  mimeType: string;
  buffer: Buffer;
  rawBuffer: Buffer;
  format: BackupFormat;
  isZip: boolean;
  stats: BackupStats;
  tablesSummary: Array<{ name: string; rowCount: number }>;
}

export interface InspectedBackupInfo {
  filename: string;
  detectedFormat: 'dump' | 'sql' | 'json' | 'multi-zip';
  isZip: boolean;
  platformVersion: string | null;
  createdAtMsk: string | null;
  totalTables: number;
  totalRows: number;
  tables: Array<{ name: string; rowCount: number; hasSchema: boolean }>;
  hasSqlScript: boolean;
  hasJsonSnapshot: boolean;
}

export interface RestoreExecutionResult {
  success: boolean;
  mode: RestoreMode;
  restoredTables: Array<{ name: string; rowsAttempted: number; rowsAfter: number; status: 'ok' | 'skipped' | 'error'; error?: string }>;
  totalRowsRestored: number;
  durationMs: number;
  errors: string[];
}

export function formatMskDateTime(date = new Date()): { dateStr: string; timeStr: string; fullMsk: string; compactStamp: string } {
  const mskMs = date.getTime() + 3 * 60 * 60 * 1000;
  const msk = new Date(mskMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = msk.getUTCFullYear();
  const m = pad(msk.getUTCMonth() + 1);
  const d = pad(msk.getUTCDate());
  const hh = pad(msk.getUTCHours());
  const mm = pad(msk.getUTCMinutes());
  const ss = pad(msk.getUTCSeconds());
  return {
    dateStr: `${y}-${m}-${d}`,
    timeStr: `${hh}:${mm}:${ss}`,
    fullMsk: `${y}-${m}-${d} ${hh}:${mm}:${ss} MSK`,
    compactStamp: `${y}${m}${d}_${hh}${mm}${ss}_MSK`,
  };
}

export function formatBytesHuman(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes <= 0) {
    return '—';
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function getFormatLabel(format: BackupFormat): string {
  switch (format) {
    case 'dump':
      return 'PostgreSQL Dump (.dump)';
    case 'sql':
      return 'Plain Text SQL (.sql)';
    case 'json':
      return 'JSON Snapshot (.json)';
    case 'all':
      return 'Полный комплект (.dump + .sql + .json)';
  }
}
