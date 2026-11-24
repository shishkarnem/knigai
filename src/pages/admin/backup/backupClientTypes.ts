export type BackupFormat = 'dump' | 'sql' | 'json' | 'all';
export type RestoreMode = 'merge' | 'replace';

export interface BackupSettingsDto {
  id: number;
  enabled: boolean;
  telegram_chat_id: string;
  telegram_bot_token: string;
  schedule_hour_msk: number;
  schedule_minute_msk: number;
  default_format: BackupFormat;
  include_zip: boolean;
  last_auto_run_msk_date: string | null;
}

export interface BackupHistoryDto {
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
}

export interface BackupStatusResponse {
  success: boolean;
  platformVersion?: string;
  settings: BackupSettingsDto;
  currentMsk: string;
  nextRunMsk: string;
  liveStats: {
    totalTables: number;
    nonEmptyTables: number;
    totalRows: number;
    tables: Array<{ name: string; rowCount: number }>;
  };
  history: BackupHistoryDto[];
}

export interface InspectedBackupDto {
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

export interface RestoreResultDto {
  success: boolean;
  mode: RestoreMode;
  restoredTables: Array<{
    name: string;
    rowsAttempted: number;
    rowsAfter: number;
    status: 'ok' | 'skipped' | 'error';
    error?: string;
  }>;
  totalRowsRestored: number;
  durationMs: number;
  errors: string[];
}

export function formatBytesRu(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes <= 0) {
    return '—';
  }
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

export function getBackupFormatTitle(format: BackupFormat): string {
  switch (format) {
    case 'dump':
      return 'PostgreSQL Dump (.dump)';
    case 'sql':
      return 'Plain Text SQL (.sql)';
    case 'json':
      return 'JSON Snapshot (.json)';
    case 'all':
      return 'Все форматы (.dump + .sql + .json)';
  }
}

export function getBackupExtensionSuffix(format: BackupFormat, includeZip: boolean): string {
  if (format === 'all') return '(.zip)';
  const base = `.${format}`;
  return includeZip ? `(${base}.zip)` : `(${base})`;
}
