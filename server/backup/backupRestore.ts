import JSZip from 'jszip';
import {
  ColumnSchema,
  InspectedBackupInfo,
  QueryPgFn,
  RestoreExecutionResult,
  RestoreMode,
  TableSchemaInfo,
} from './backupTypes';
import { introspectDatabaseSchema } from './backupGenerator';

interface ParsedBackupBundle {
  detectedFormat: 'dump' | 'sql' | 'json' | 'multi-zip';
  isZip: boolean;
  platformVersion: string | null;
  createdAtMsk: string | null;
  snapshot?: {
    meta?: Record<string, unknown>;
    schemas?: TableSchemaInfo[];
    tables?: Record<string, Record<string, unknown>[]>;
  };
  schemaSql?: string;
  dataSql?: string;
  fullSql?: string;
}

function isZipSignature(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05);
}

function quoteIdent(name: string): string {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1] || '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += '/';
        i++;
        inBlockComment = false;
      }
      continue;
    }

    if (dollarTag) {
      current += ch;
      if (sql.startsWith(dollarTag, i)) {
        current += dollarTag.slice(1);
        i += dollarTag.length - 1;
        dollarTag = null;
      }
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === "'" && next === "'") {
        current += "'";
        i++;
      } else if (ch === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      continue;
    }

    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      continue;
    }

    if (ch === '$') {
      const rest = sql.slice(i);
      const match = rest.match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        i += dollarTag.length - 1;
        continue;
      }
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function summarizeSqlTables(sql: string): Array<{ name: string; rowCount: number; hasSchema: boolean }> {
  const tableMap = new Map<string, { name: string; rowCount: number; hasSchema: boolean }>();
  const createMatches = sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|([a-zA-Z0-9_]+))/gi);
  for (const m of createMatches) {
    const name = m[1] || m[2];
    if (name) {
      const prev = tableMap.get(name) || { name, rowCount: 0, hasSchema: false };
      prev.hasSchema = true;
      tableMap.set(name, prev);
    }
  }

  const stmts = splitSqlStatements(sql);
  for (const st of stmts) {
    const insMatch = st.match(/^INSERT\s+INTO\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))/i);
    if (insMatch) {
      const name = insMatch[1] || insMatch[2];
      if (name) {
        const prev = tableMap.get(name) || { name, rowCount: 0, hasSchema: false };
        // Approximate row count from line tuple starts inside multi-row INSERT
        const valuesIdx = st.search(/\bVALUES\b/i);
        if (valuesIdx !== -1) {
          const valBody = st.slice(valuesIdx);
          const tuples = valBody.match(/\n\s*\(/g);
          prev.rowCount += tuples ? tuples.length : 1;
        } else {
          prev.rowCount += 1;
        }
        tableMap.set(name, prev);
      }
    }
  }

  return Array.from(tableMap.values());
}

async function parseBackupBuffer(buffer: Buffer, filename: string): Promise<ParsedBackupBundle> {
  const lower = filename.toLowerCase();

  if (isZipSignature(buffer)) {
    const zip = await JSZip.loadAsync(buffer);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);

    // Case A: Direct .dump container (manifest.json + snapshot.json + schema.sql + data.sql)
    if (names.includes('manifest.json') && names.includes('snapshot.json')) {
      const manifestRaw = await zip.files['manifest.json'].async('string');
      const snapshotRaw = await zip.files['snapshot.json'].async('string');
      const schemaSql = names.includes('schema.sql') ? await zip.files['schema.sql'].async('string') : undefined;
      const dataSql = names.includes('data.sql') ? await zip.files['data.sql'].async('string') : undefined;

      const manifest = JSON.parse(manifestRaw);
      const snapshot = JSON.parse(snapshotRaw);

      return {
        detectedFormat: 'dump',
        isZip: lower.endsWith('.zip'),
        platformVersion: String(manifest.version || snapshot?.meta?.version || '') || null,
        createdAtMsk: String(manifest.createdAtMsk || snapshot?.meta?.createdAtMsk || '') || null,
        snapshot,
        schemaSql,
        dataSql,
      };
    }

    // Case B: Outer ZIP containing inner .dump, .json, or .sql
    const dumpEntry = names.find((n) => n.toLowerCase().endsWith('.dump'));
    const jsonEntry = names.find((n) => n.toLowerCase().endsWith('.json'));
    const sqlEntry = names.find((n) => n.toLowerCase().endsWith('.sql'));

    if (dumpEntry && !jsonEntry && !sqlEntry) {
      const innerBuf = await zip.files[dumpEntry].async('nodebuffer');
      const inner = await parseBackupBuffer(innerBuf, dumpEntry);
      return { ...inner, isZip: true };
    }

    if (dumpEntry && jsonEntry && sqlEntry) {
      // Multi-format bundle ('all') — prefer JSON snapshot for exact typed restore + keep SQL fallback
      const jsonStr = await zip.files[jsonEntry].async('string');
      const sqlStr = await zip.files[sqlEntry].async('string');
      const snapshot = JSON.parse(jsonStr);
      return {
        detectedFormat: 'multi-zip',
        isZip: true,
        platformVersion: String(snapshot?.meta?.version || '') || null,
        createdAtMsk: String(snapshot?.meta?.createdAtMsk || '') || null,
        snapshot,
        fullSql: sqlStr,
      };
    }

    if (jsonEntry) {
      const jsonStr = await zip.files[jsonEntry].async('string');
      const snapshot = JSON.parse(jsonStr);
      return {
        detectedFormat: 'json',
        isZip: true,
        platformVersion: String(snapshot?.meta?.version || '') || null,
        createdAtMsk: String(snapshot?.meta?.createdAtMsk || '') || null,
        snapshot,
        fullSql: sqlEntry ? await zip.files[sqlEntry].async('string') : undefined,
      };
    }

    if (sqlEntry) {
      const sqlStr = await zip.files[sqlEntry].async('string');
      return {
        detectedFormat: 'sql',
        isZip: true,
        platformVersion: null,
        createdAtMsk: null,
        fullSql: sqlStr,
      };
    }

    throw new Error('ZIP-архив не содержит распознаваемых файлов (.dump, .sql, .json)');
  }

  // Case C: Plain UTF-8 JSON or SQL
  const text = buffer.toString('utf8').trim();
  if (text.startsWith('{') || lower.endsWith('.json')) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.tables) {
      throw new Error('JSON-файл не соответствует формату резервной копии KnigAI');
    }
    return {
      detectedFormat: 'json',
      isZip: false,
      platformVersion: String(parsed?.meta?.version || '') || null,
      createdAtMsk: String(parsed?.meta?.createdAtMsk || '') || null,
      snapshot: parsed,
    };
  }

  if (
    lower.endsWith('.sql') ||
    /\b(CREATE TABLE|INSERT INTO|SET statement_timeout)/i.test(text.slice(0, 4000))
  ) {
    const verMatch = text.match(/Версия платформы:\s*([^\r\n]+)/);
    const timeMatch = text.match(/Дата \(МСК\):\s*([^\r\n]+)/);
    return {
      detectedFormat: 'sql',
      isZip: false,
      platformVersion: verMatch?.[1]?.trim() || null,
      createdAtMsk: timeMatch?.[1]?.trim() || null,
      fullSql: text,
    };
  }

  throw new Error('Неподдерживаемый формат файла. Поддерживаются .dump, .sql, .json и .zip');
}

export async function inspectBackupBuffer(
  buffer: Buffer,
  filename: string
): Promise<InspectedBackupInfo> {
  const parsed = await parseBackupBuffer(buffer, filename);

  if (parsed.snapshot?.tables) {
    const schemaNames = new Set((parsed.snapshot.schemas || []).map((s) => s.name));
    const tables = Object.entries(parsed.snapshot.tables).map(([name, rows]) => ({
      name,
      rowCount: Array.isArray(rows) ? rows.length : 0,
      hasSchema: schemaNames.has(name),
    }));
    const totalRows = tables.reduce((acc, t) => acc + t.rowCount, 0);
    return {
      filename,
      detectedFormat: parsed.detectedFormat,
      isZip: parsed.isZip,
      platformVersion: parsed.platformVersion,
      createdAtMsk: parsed.createdAtMsk,
      totalTables: tables.length,
      totalRows,
      tables,
      hasSqlScript: Boolean(parsed.schemaSql || parsed.dataSql || parsed.fullSql),
      hasJsonSnapshot: true,
    };
  }

  const sqlText = parsed.fullSql || `${parsed.schemaSql || ''}\n${parsed.dataSql || ''}`;
  const sqlTables = summarizeSqlTables(sqlText);
  const totalRows = sqlTables.reduce((acc, t) => acc + t.rowCount, 0);

  return {
    filename,
    detectedFormat: parsed.detectedFormat,
    isZip: parsed.isZip,
    platformVersion: parsed.platformVersion,
    createdAtMsk: parsed.createdAtMsk,
    totalTables: sqlTables.length,
    totalRows,
    tables: sqlTables,
    hasSqlScript: true,
    hasJsonSnapshot: false,
  };
}

function normalizeParamForColumn(val: unknown, col?: ColumnSchema): string | number | boolean | null {
  if (val === undefined || val === null) return null;
  const udt = (col?.udt_name || '').toLowerCase();

  if (udt === 'jsonb' || udt === 'json') {
    return typeof val === 'string' ? val : JSON.stringify(val);
  }
  if (typeof val === 'boolean' || typeof val === 'number' || typeof val === 'string') {
    return val;
  }
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val) && udt.startsWith('_')) {
    // PostgreSQL array text literal syntax e.g. {"a","b"}
    const escaped = val.map((item) =>
      item === null || item === undefined
        ? 'NULL'
        : `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
    );
    return `{${escaped.join(',')}}`;
  }
  return JSON.stringify(val);
}

export async function restoreFromBackupBuffer(params: {
  queryPg: QueryPgFn;
  buffer: Buffer;
  filename: string;
  mode: RestoreMode;
  includeSystemTables?: boolean;
  tablesFilter?: string[];
}): Promise<RestoreExecutionResult> {
  const startedAt = Date.now();
  const { queryPg, buffer, filename, mode, includeSystemTables = false, tablesFilter } = params;
  const parsed = await parseBackupBuffer(buffer, filename);
  const errors: string[] = [];
  const restoredTables: RestoreExecutionResult['restoredTables'] = [];

  const systemExcluded = new Set(
    includeSystemTables ? [] : ['backup_settings', 'backup_history']
  );
  const filterSet = tablesFilter && tablesFilter.length > 0 ? new Set(tablesFilter) : null;

  // Path 1: Structured Snapshot Restore (exact parameterized batch upserts)
  if (parsed.snapshot?.tables) {
    // Ensure schema exists first if SQL schema is available
    if (parsed.schemaSql) {
      for (const stmt of splitSqlStatements(parsed.schemaSql)) {
        try {
          await queryPg(stmt);
        } catch (err) {
          errors.push(`Schema SQL notice: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const liveSchemas = await introspectDatabaseSchema(queryPg);
    const liveSchemaMap = new Map(liveSchemas.map((s) => [s.name, s]));
    const backupSchemaMap = new Map((parsed.snapshot.schemas || []).map((s) => [s.name, s]));

    const tableNames = Object.keys(parsed.snapshot.tables);

    // For replace mode, clear selected non-system tables in reverse order first
    if (mode === 'replace') {
      for (const tName of [...tableNames].reverse()) {
        if (systemExcluded.has(tName)) continue;
        if (filterSet && !filterSet.has(tName)) continue;
        if (!liveSchemaMap.has(tName)) continue;
        try {
          await queryPg(`DELETE FROM ${quoteIdent(tName)};`);
        } catch (err) {
          errors.push(`Очистка ${tName}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    let totalRowsRestored = 0;

    for (const tName of tableNames) {
      const rows = parsed.snapshot.tables[tName] || [];
      if (systemExcluded.has(tName) || (filterSet && !filterSet.has(tName))) {
        restoredTables.push({
          name: tName,
          rowsAttempted: rows.length,
          rowsAfter: liveSchemaMap.get(tName)?.rowCount ?? 0,
          status: 'skipped',
        });
        continue;
      }

      const targetSchema = liveSchemaMap.get(tName) || backupSchemaMap.get(tName);
      if (!targetSchema) {
        restoredTables.push({
          name: tName,
          rowsAttempted: rows.length,
          rowsAfter: 0,
          status: 'error',
          error: 'Таблица отсутствует в базе данных',
        });
        continue;
      }

      if (rows.length === 0) {
        restoredTables.push({
          name: tName,
          rowsAttempted: 0,
          rowsAfter: 0,
          status: 'ok',
        });
        continue;
      }

      try {
        const liveColNames = new Set(targetSchema.columns.map((c) => c.column_name));
        const colSchemaMap = new Map(targetSchema.columns.map((c) => [c.column_name, c]));
        const hasAlwaysIdentity = targetSchema.columns.some(
          (c) => c.is_identity === 'YES' && c.identity_generation === 'ALWAYS'
        );
        const overrideClause = hasAlwaysIdentity ? ' OVERRIDING SYSTEM VALUE' : '';

        // Collect all keys present across rows that also exist in live schema
        const activeCols = targetSchema.columns
          .map((c) => c.column_name)
          .filter((colName) => liveColNames.has(colName));

        const pks = targetSchema.primaryKeys.filter((pk) => activeCols.includes(pk));
        const nonPks = activeCols.filter((c) => !pks.includes(c));
        const conflictClause =
          pks.length > 0
            ? nonPks.length > 0
              ? ` ON CONFLICT (${pks.map(quoteIdent).join(', ')}) DO UPDATE SET ${nonPks
                  .map((c) => `${quoteIdent(c)} = EXCLUDED.${quoteIdent(c)}`)
                  .join(', ')}`
              : ` ON CONFLICT (${pks.map(quoteIdent).join(', ')}) DO NOTHING`
            : '';

        const batchSize = 20;
        for (let i = 0; i < rows.length; i += batchSize) {
          const batch = rows.slice(i, i + batchSize);
          const allParams: (string | number | boolean | null)[] = [];
          const valuePlaceholders: string[] = [];

          for (const row of batch) {
            const rowPlaceholders: string[] = [];
            for (const colName of activeCols) {
              const colMeta = colSchemaMap.get(colName);
              const udt = (colMeta?.udt_name || '').toLowerCase();
              allParams.push(normalizeParamForColumn(row[colName], colMeta));
              const idx = allParams.length;
              if (udt === 'jsonb') {
                rowPlaceholders.push(`$${idx}::jsonb`);
              } else if (udt === 'json') {
                rowPlaceholders.push(`$${idx}::json`);
              } else if (udt.startsWith('_')) {
                rowPlaceholders.push(`$${idx}::${udt.slice(1)}[]`);
              } else {
                rowPlaceholders.push(`$${idx}`);
              }
            }
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
          }

          const insertSql = `INSERT INTO ${quoteIdent(tName)} (${activeCols
            .map(quoteIdent)
            .join(', ')})${overrideClause} VALUES ${valuePlaceholders.join(', ')}${conflictClause};`;
          await queryPg(insertSql, allParams);
        }

        // Sync identity/serial sequence
        const seqCols = targetSchema.columns.filter(
          (c) =>
            c.is_identity === 'YES' ||
            (c.column_default && c.column_default.includes('nextval'))
        );
        for (const sc of seqCols) {
          try {
            await queryPg(
              `SELECT setval(pg_get_serial_sequence('${tName}', '${sc.column_name}'), COALESCE((SELECT MAX(${quoteIdent(
                sc.column_name
              )}) FROM ${quoteIdent(tName)}), 1), true);`
            );
          } catch {
            // ignore non-serial sequence edges
          }
        }

        const countRes = await queryPg<{ cnt: string | number }>(
          `SELECT COUNT(*)::bigint AS cnt FROM ${quoteIdent(tName)};`
        );
        const rowsAfter = Number(countRes.rows[0]?.cnt || 0);
        totalRowsRestored += rows.length;

        restoredTables.push({
          name: tName,
          rowsAttempted: rows.length,
          rowsAfter,
          status: 'ok',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Таблица ${tName}: ${msg}`);
        restoredTables.push({
          name: tName,
          rowsAttempted: rows.length,
          rowsAfter: liveSchemaMap.get(tName)?.rowCount ?? 0,
          status: 'error',
          error: msg,
        });
      }
    }

    return {
      success: errors.length === 0,
      mode,
      restoredTables,
      totalRowsRestored,
      durationMs: Date.now() - startedAt,
      errors,
    };
  }

  // Path 2: Raw Plain Text SQL Restore (.sql)
  const rawSql = parsed.fullSql || `${parsed.schemaSql || ''}\n${parsed.dataSql || ''}`;
  const statements = splitSqlStatements(rawSql);

  if (mode === 'replace') {
    const liveSchemas = await introspectDatabaseSchema(queryPg);
    for (const t of [...liveSchemas].reverse()) {
      if (systemExcluded.has(t.name)) continue;
      if (filterSet && !filterSet.has(t.name)) continue;
      try {
        await queryPg(`DELETE FROM ${quoteIdent(t.name)};`);
      } catch {
        // ignore delete failures
      }
    }
  }

  let executedCount = 0;
  const tableTouchCounts = new Map<string, number>();

  for (const stmt of statements) {
    if (/^SET\s+/i.test(stmt)) continue;

    const targetMatch = stmt.match(
      /^(?:INSERT\s+INTO|CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+(?:"([^"]+)"|([a-zA-Z0-9_]+))/i
    );
    const targetTable = targetMatch?.[1] || targetMatch?.[2];

    if (targetTable && (systemExcluded.has(targetTable) || (filterSet && !filterSet.has(targetTable)))) {
      continue;
    }

    try {
      await queryPg(stmt);
      executedCount += 1;
      if (targetTable) {
        tableTouchCounts.set(targetTable, (tableTouchCounts.get(targetTable) || 0) + 1);
      }
    } catch (err) {
      errors.push(
        `SQL (${targetTable || 'query'}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const finalSchemas = await introspectDatabaseSchema(queryPg);
  for (const [tName, ops] of tableTouchCounts.entries()) {
    const meta = finalSchemas.find((s) => s.name === tName);
    restoredTables.push({
      name: tName,
      rowsAttempted: ops,
      rowsAfter: meta?.rowCount ?? 0,
      status: 'ok',
    });
  }

  return {
    success: errors.length === 0,
    mode,
    restoredTables,
    totalRowsRestored: executedCount,
    durationMs: Date.now() - startedAt,
    errors,
  };
}
