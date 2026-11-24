import JSZip from 'jszip';
import {
  BackupFormat,
  ColumnSchema,
  GeneratedBackupArtifact,
  PLATFORM_DB_LABEL,
  PLATFORM_VERSION,
  QueryPgFn,
  TableSchemaInfo,
  formatMskDateTime,
  getFormatLabel,
} from './backupTypes';
import { getAppVersion } from '../db/appVersionService';

const PRIORITY_TABLE_ORDER = [
  'users',
  'genres',
  'ai_prompts',
  'file_folders',
  'file_storage',
  'books',
  'chapters',
  'chapter_revisions',
  'book_drafts',
  'characters',
  'world_entities',
  'reading_progress',
  'gallery',
  'voice_transcriptions',
  'transactions',
  'notifications',
  'logs',
  'backup_settings',
  'backup_history',
];

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function escapeSqlStringLiteral(val: string): string {
  // Strip null bytes which PostgreSQL rejects in text literals
  const cleaned = val.replace(/\u0000/g, '');
  return `'${cleaned.replace(/'/g, "''")}'`;
}

function formatSqlValue(value: unknown, col?: ColumnSchema): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  const udt = (col?.udt_name || '').toLowerCase();
  const dataType = (col?.data_type || '').toLowerCase();

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'NULL';
    return String(value);
  }

  if (value instanceof Date) {
    return `${escapeSqlStringLiteral(value.toISOString())}::timestamptz`;
  }

  if (udt === 'jsonb' || udt === 'json' || dataType === 'jsonb' || dataType === 'json') {
    const jsonStr = typeof value === 'string' ? value : JSON.stringify(value);
    return `${escapeSqlStringLiteral(jsonStr)}::${udt === 'json' ? 'json' : 'jsonb'}`;
  }

  if (Array.isArray(value)) {
    if (udt.startsWith('_')) {
      const baseType = udt.slice(1) || 'text';
      if (value.length === 0) return `'{}'::${baseType}[]`;
      const items = value.map((item) => formatSqlValue(item));
      return `ARRAY[${items.join(', ')}]::${baseType}[]`;
    }
    return `${escapeSqlStringLiteral(JSON.stringify(value))}::jsonb`;
  }

  if (typeof value === 'object') {
    return `${escapeSqlStringLiteral(JSON.stringify(value))}::jsonb`;
  }

  const str = String(value);
  if (udt === 'timestamptz' || dataType === 'timestamp with time zone') {
    return `${escapeSqlStringLiteral(str)}::timestamptz`;
  }
  if (udt === 'timestamp' || dataType === 'timestamp without time zone') {
    return `${escapeSqlStringLiteral(str)}::timestamp`;
  }
  return escapeSqlStringLiteral(str);
}

function mapColumnSqlType(col: ColumnSchema): string {
  const udt = col.udt_name.toLowerCase();
  const dt = col.data_type.toLowerCase();

  if (col.is_identity === 'YES') {
    const base = udt === 'int8' ? 'BIGINT' : udt === 'int4' ? 'INTEGER' : 'BIGINT';
    const gen = col.identity_generation === 'BY DEFAULT' ? 'BY DEFAULT' : 'ALWAYS';
    return `${base} GENERATED ${gen} AS IDENTITY`;
  }

  if (udt === 'int8' && col.column_default?.includes('nextval')) return 'BIGSERIAL';
  if (udt === 'int4' && col.column_default?.includes('nextval')) return 'SERIAL';
  if (udt === 'int8') return 'BIGINT';
  if (udt === 'int4') return 'INTEGER';
  if (udt === 'int2') return 'SMALLINT';
  if (udt === 'bool') return 'BOOLEAN';
  if (udt === 'numeric') return 'NUMERIC';
  if (udt === 'float8') return 'DOUBLE PRECISION';
  if (udt === 'float4') return 'REAL';
  if (udt === 'jsonb') return 'JSONB';
  if (udt === 'json') return 'JSON';
  if (udt === 'timestamptz') return 'TIMESTAMPTZ';
  if (udt === 'timestamp') return 'TIMESTAMP';
  if (udt === 'uuid') return 'UUID';
  if (udt === '_text' || dt === 'array') {
    const base = udt.startsWith('_') ? udt.slice(1).toUpperCase() : 'TEXT';
    return `${base}[]`;
  }
  if (udt === 'varchar' && col.character_maximum_length) {
    return `VARCHAR(${col.character_maximum_length})`;
  }
  return 'TEXT';
}

export async function introspectDatabaseSchema(queryPg: QueryPgFn): Promise<TableSchemaInfo[]> {
  const tablesRes = await queryPg<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name ASC;`
  );

  const rawTableNames = tablesRes.rows.map((r) => r.table_name).filter(Boolean);
  const sortedNames = [...rawTableNames].sort((a, b) => {
    const idxA = PRIORITY_TABLE_ORDER.indexOf(a);
    const idxB = PRIORITY_TABLE_ORDER.indexOf(b);
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    return a.localeCompare(b);
  });

  const colsRes = await queryPg<ColumnSchema & { table_name: string }>(
    `SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default,
            is_identity, identity_generation, character_maximum_length, ordinal_position
     FROM information_schema.columns
     WHERE table_schema = 'public'
     ORDER BY table_name ASC, ordinal_position ASC;`
  );

  const pkRes = await queryPg<{ table_name: string; column_name: string }>(
    `SELECT tc.table_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public' AND tc.constraint_type = 'PRIMARY KEY'
     ORDER BY tc.table_name, kcu.ordinal_position;`
  );

  const idxRes = await queryPg<{ tablename: string; indexname: string; indexdef: string }>(
    `SELECT tablename, indexname, indexdef
     FROM pg_indexes
     WHERE schemaname = 'public'
     ORDER BY tablename, indexname;`
  );

  // Count all tables in a single SQL UNION ALL round-trip
  const countMap = new Map<string, number>();
  if (sortedNames.length > 0) {
    try {
      const unionSql = sortedNames
        .map((t) => `SELECT '${t.replace(/'/g, "''")}' AS tbl, COUNT(*)::bigint AS cnt FROM ${quoteIdent(t)}`)
        .join(' UNION ALL ');
      const cntAllRes = await queryPg<{ tbl: string; cnt: string | number }>(`${unionSql};`);
      for (const r of cntAllRes.rows) {
        countMap.set(r.tbl, Number(r.cnt || 0));
      }
    } catch {
      // Fallback per-table only if UNION fails
      for (const tName of sortedNames) {
        try {
          const cntRes = await queryPg<{ cnt: string | number }>(
            `SELECT COUNT(*)::bigint AS cnt FROM ${quoteIdent(tName)};`
          );
          countMap.set(tName, Number(cntRes.rows[0]?.cnt || 0));
        } catch {
          countMap.set(tName, 0);
        }
      }
    }
  }

  const schemas: TableSchemaInfo[] = [];

  for (const tableName of sortedNames) {
    const columns = colsRes.rows
      .filter((c) => c.table_name === tableName)
      .map(({ table_name: _t, ...rest }) => rest);

    const primaryKeys = pkRes.rows
      .filter((p) => p.table_name === tableName)
      .map((p) => p.column_name);

    const indexes = idxRes.rows
      .filter((ix) => ix.tablename === tableName && !ix.indexname.endsWith('_pkey'))
      .map((ix) => ({ indexname: ix.indexname, indexdef: ix.indexdef }));

    schemas.push({
      name: tableName,
      columns,
      primaryKeys,
      indexes,
      rowCount: countMap.get(tableName) ?? 0,
    });
  }

  return schemas;
}

const HEAVY_CONTENT_TABLES = new Set([
  'chapters',
  'file_storage',
  'logs',
  'books',
  'world_entities',
  'characters',
  'gallery',
  'voice_transcriptions',
  'ai_prompts',
]);

async function fetchAllTableRows(
  queryPg: QueryPgFn,
  table: TableSchemaInfo
): Promise<Record<string, unknown>[]> {
  if (table.rowCount === 0) return [];
  const orderCol =
    table.primaryKeys.length > 0
      ? table.primaryKeys.map(quoteIdent).join(', ')
      : table.columns[0]?.column_name
      ? quoteIdent(table.columns[0].column_name)
      : '';

  const orderClause = orderCol ? `ORDER BY ${orderCol} ASC` : '';
  const initialPageSize = HEAVY_CONTENT_TABLES.has(table.name) ? 10 : 100;

  // Build offset list and fetch with bounded concurrency (4 concurrent proxy queries)
  const offsets: number[] = [];
  for (let off = 0; off < table.rowCount; off += initialPageSize) {
    offsets.push(off);
  }

  const fetchSlice = async (off: number, lim: number): Promise<Record<string, unknown>[]> => {
    try {
      const res = await queryPg<Record<string, unknown>>(
        `SELECT * FROM ${quoteIdent(table.name)} ${orderClause} LIMIT ${lim} OFFSET ${off};`
      );
      return res.rows || [];
    } catch (err) {
      if (lim <= 1) throw err;
      const mid = Math.max(1, Math.floor(lim / 2));
      const first = await fetchSlice(off, mid);
      const second = await fetchSlice(off + mid, lim - mid);
      return [...first, ...second];
    }
  };

  const resultsByChunk: Record<string, unknown>[][] = new Array(offsets.length);
  const concurrency = 4;
  let nextIdx = 0;

  const worker = async () => {
    while (nextIdx < offsets.length) {
      const curIdx = nextIdx++;
      resultsByChunk[curIdx] = await fetchSlice(offsets[curIdx], initialPageSize);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, offsets.length) }, () => worker())
  );

  return resultsByChunk.flat();
}

function buildCreateTableSql(table: TableSchemaInfo): string {
  const colDefs = table.columns.map((col) => {
    const parts: string[] = [quoteIdent(col.column_name), mapColumnSqlType(col)];
    if (
      col.column_default &&
      col.is_identity !== 'YES' &&
      !col.column_default.includes('nextval')
    ) {
      parts.push(`DEFAULT ${col.column_default}`);
    }
    if (col.is_nullable === 'NO') {
      parts.push('NOT NULL');
    }
    return '  ' + parts.join(' ');
  });

  if (table.primaryKeys.length > 0) {
    colDefs.push(`  PRIMARY KEY (${table.primaryKeys.map(quoteIdent).join(', ')})`);
  }

  const lines: string[] = [
    `CREATE TABLE IF NOT EXISTS ${quoteIdent(table.name)} (`,
    colDefs.join(',\n'),
    `);`,
  ];

  for (const ix of table.indexes) {
    const safeDef = ix.indexdef.replace(/^CREATE (UNIQUE )?INDEX /i, 'CREATE $1INDEX IF NOT EXISTS ');
    lines.push(`${safeDef};`);
  }

  return lines.join('\n');
}

function buildDataSqlForTable(table: TableSchemaInfo, rows: Record<string, unknown>[]): string {
  if (rows.length === 0 || table.columns.length === 0) return '';

  const colNames = table.columns.map((c) => c.column_name);
  const colIdentList = colNames.map(quoteIdent).join(', ');
  const hasAlwaysIdentity = table.columns.some(
    (c) => c.is_identity === 'YES' && c.identity_generation === 'ALWAYS'
  );
  const overrideClause = hasAlwaysIdentity ? ' OVERRIDING SYSTEM VALUE' : '';

  const nonPkCols = colNames.filter((c) => !table.primaryKeys.includes(c));
  const conflictClause =
    table.primaryKeys.length > 0
      ? nonPkCols.length > 0
        ? ` ON CONFLICT (${table.primaryKeys.map(quoteIdent).join(', ')}) DO UPDATE SET ${nonPkCols
            .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
            .join(', ')}`
        : ` ON CONFLICT (${table.primaryKeys.map(quoteIdent).join(', ')}) DO NOTHING`
      : '';

  const chunks: string[] = [];
  const batchSize = 25;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const valuesRows = batch.map((row) => {
      const vals = table.columns.map((col) => formatSqlValue(row[col.column_name], col));
      return `  (${vals.join(', ')})`;
    });
    chunks.push(
      `INSERT INTO ${quoteIdent(table.name)} (${colIdentList})${overrideClause}\nVALUES\n${valuesRows.join(',\n')}${conflictClause};`
    );
  }

  const seqCols = table.columns.filter(
    (c) =>
      c.is_identity === 'YES' ||
      (c.column_default && c.column_default.includes('nextval'))
  );
  for (const sc of seqCols) {
    chunks.push(
      `SELECT setval(pg_get_serial_sequence('${table.name}', '${sc.column_name}'), COALESCE((SELECT MAX(${quoteIdent(sc.column_name)}) FROM ${quoteIdent(table.name)}), 1), true);`
    );
  }

  return chunks.join('\n\n');
}

async function loadFullDatabaseSnapshot(queryPg: QueryPgFn, reason: string) {
  const { fullMsk, compactStamp } = formatMskDateTime(new Date());
  const platformVersion = (await getAppVersion(queryPg)) || PLATFORM_VERSION;
  const schemas = await introspectDatabaseSchema(queryPg);
  const tableRowsMap: Record<string, Record<string, unknown>[]> = {};

  let totalRows = 0;
  let nonEmptyTables = 0;

  for (const tbl of schemas) {
    const rows = await fetchAllTableRows(queryPg, tbl);
    tableRowsMap[tbl.name] = rows;
    if (rows.length > 0) {
      nonEmptyTables += 1;
      totalRows += rows.length;
    }
  }

  const schemaSqlParts = schemas.map(buildCreateTableSql);
  const dataSqlParts = schemas
    .map((tbl) => {
      const sql = buildDataSqlForTable(tbl, tableRowsMap[tbl.name] || []);
      return sql ? `-- Таблица: ${tbl.name} (${(tableRowsMap[tbl.name] || []).length} записей)\n${sql}` : '';
    })
    .filter(Boolean);

  const sqlScript = [
    `-- ============================================================================`,
    `-- ${PLATFORM_DB_LABEL} PostgreSQL Database Backup`,
    `-- Версия платформы: ${platformVersion}`,
    `-- Дата (МСК): ${fullMsk}`,
    `-- Причина: ${reason}`,
    `-- Таблиц: ${schemas.length} (с данными: ${nonEmptyTables}), Записей: ${totalRows}`,
    `-- ============================================================================`,
    '',
    'SET statement_timeout = 0;',
    `SET client_encoding = 'UTF8';`,
    'SET standard_conforming_strings = on;',
    '',
    '-- --- 1. СТРУКТУРА ТАБЛИЦ И ИНДЕКСОВ ---',
    schemaSqlParts.join('\n\n'),
    '',
    '-- --- 2. ДАННЫЕ ТАБЛИЦ И ПОСЛЕДОВАТЕЛЬНОСТИ ---',
    dataSqlParts.join('\n\n'),
    '',
  ].join('\n');

  const snapshotPayload = {
    meta: {
      platform: PLATFORM_DB_LABEL,
      version: platformVersion,
      database: 'kniga',
      createdAtMsk: fullMsk,
      createdAtIso: new Date().toISOString(),
      reason,
      totalTables: schemas.length,
      nonEmptyTables,
      totalRows,
    },
    schemas,
    tables: tableRowsMap,
  };

  const jsonBuffer = Buffer.from(JSON.stringify(snapshotPayload, null, 2), 'utf8');
  const sqlBuffer = Buffer.from(sqlScript, 'utf8');

  const dumpZip = new JSZip();
  dumpZip.file(
    'manifest.json',
    JSON.stringify(
      {
        magic: 'KNIGAI_PG_DUMP',
        formatVersion: 1,
        ...snapshotPayload.meta,
        tableCounts: schemas.map((s) => ({ name: s.name, rowCount: (tableRowsMap[s.name] || []).length })),
      },
      null,
      2
    )
  );
  dumpZip.file('schema.sql', schemaSqlParts.join('\n\n'));
  dumpZip.file('data.sql', dataSqlParts.join('\n\n'));
  dumpZip.file('snapshot.json', jsonBuffer);
  const dumpBuffer = await dumpZip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return {
    fullMsk,
    compactStamp,
    platformVersion,
    schemas,
    tableRowsMap,
    nonEmptyTables,
    totalRows,
    dumpBuffer,
    sqlBuffer,
    jsonBuffer,
    tablesSummary: schemas.map((s) => ({
      name: s.name,
      rowCount: (tableRowsMap[s.name] || []).length,
    })),
  };
}

async function buildArtifactFromSnapshot(
  snap: Awaited<ReturnType<typeof loadFullDatabaseSnapshot>>,
  format: BackupFormat,
  includeZip: boolean,
  reason: string
): Promise<GeneratedBackupArtifact> {
  const { fullMsk, compactStamp, platformVersion, schemas, nonEmptyTables, totalRows, dumpBuffer, sqlBuffer, jsonBuffer, tablesSummary } =
    snap;

  if (format === 'all') {
    const bundleZip = new JSZip();
    bundleZip.file(`kniga_${compactStamp}.dump`, dumpBuffer);
    bundleZip.file(`kniga_${compactStamp}.sql`, sqlBuffer);
    bundleZip.file(`kniga_${compactStamp}.json`, jsonBuffer);
    const finalAllBuffer = await bundleZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    return {
      filename: `kniga_all_formats_${compactStamp}.zip`,
      mimeType: 'application/zip',
      buffer: finalAllBuffer,
      rawBuffer: sqlBuffer,
      format,
      isZip: true,
      stats: {
        totalTables: schemas.length,
        nonEmptyTables,
        totalRows,
        rawSizeBytes: dumpBuffer.byteLength + sqlBuffer.byteLength + jsonBuffer.byteLength,
        zipSizeBytes: finalAllBuffer.byteLength,
        formatLabel: getFormatLabel(format),
        createdAtMsk: fullMsk,
        reason,
        platformVersion,
      },
      tablesSummary,
    };
  }

  let rawBuffer: Buffer;
  let baseFilename: string;
  let baseMime: string;

  if (format === 'sql') {
    rawBuffer = sqlBuffer;
    baseFilename = `kniga_${compactStamp}.sql`;
    baseMime = 'application/sql';
  } else if (format === 'json') {
    rawBuffer = jsonBuffer;
    baseFilename = `kniga_${compactStamp}.json`;
    baseMime = 'application/json';
  } else {
    rawBuffer = dumpBuffer;
    baseFilename = `kniga_${compactStamp}.dump`;
    baseMime = 'application/octet-stream';
  }

  let finalBuffer = rawBuffer;
  let finalFilename = baseFilename;
  let finalMime = baseMime;
  let zipSizeBytes: number | null = null;

  if (includeZip) {
    const outerZip = new JSZip();
    outerZip.file(baseFilename, rawBuffer);
    finalBuffer = await outerZip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    finalFilename = `${baseFilename}.zip`;
    finalMime = 'application/zip';
    zipSizeBytes = finalBuffer.byteLength;
  }

  return {
    filename: finalFilename,
    mimeType: finalMime,
    buffer: finalBuffer,
    rawBuffer,
    format,
    isZip: includeZip,
    stats: {
      totalTables: schemas.length,
      nonEmptyTables,
      totalRows,
      rawSizeBytes: rawBuffer.byteLength,
      zipSizeBytes,
      formatLabel: getFormatLabel(format),
      createdAtMsk: fullMsk,
      reason,
      platformVersion,
    },
    tablesSummary,
  };
}

export async function generateDatabaseBackup(params: {
  queryPg: QueryPgFn;
  format: BackupFormat;
  includeZip: boolean;
  reason: string;
}): Promise<GeneratedBackupArtifact> {
  const snap = await loadFullDatabaseSnapshot(params.queryPg, params.reason);
  return buildArtifactFromSnapshot(snap, params.format, params.includeZip, params.reason);
}

export async function generateAllFormatsArtifacts(params: {
  queryPg: QueryPgFn;
  includeZip: boolean;
  reason: string;
}): Promise<GeneratedBackupArtifact[]> {
  const snap = await loadFullDatabaseSnapshot(params.queryPg, params.reason);
  const formats: BackupFormat[] = ['dump', 'sql', 'json'];
  return Promise.all(
    formats.map((fmt) => buildArtifactFromSnapshot(snap, fmt, params.includeZip, params.reason))
  );
}
