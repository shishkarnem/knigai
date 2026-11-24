import type { Express, Request, Response } from 'express';
import type { QueryPgFn } from '../backup/backupTypes';

export const DEFAULT_APP_VERSION = 'v.1.07';

let cachedVersion: string | null = null;
let schemaInitPromise: Promise<void> | null = null;

export async function ensureAppVersionSchema(queryPg: QueryPgFn): Promise<void> {
  if (!schemaInitPromise) {
    schemaInitPromise = (async () => {
      await queryPg(`
        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT now()
        );
      `);
      await queryPg(
        `INSERT INTO app_settings (key, value, updated_at)
         VALUES ('platform_version', $1::jsonb, now())
         ON CONFLICT (key) DO NOTHING;`,
        [JSON.stringify({ version: DEFAULT_APP_VERSION })]
      );
    })().catch((err) => {
      schemaInitPromise = null;
      throw err;
    });
  }
  return schemaInitPromise;
}

export async function getAppVersion(queryPg: QueryPgFn): Promise<string> {
  if (cachedVersion) return cachedVersion;
  try {
    await ensureAppVersionSchema(queryPg);
    const { rows } = await queryPg<{ value: { version?: string } | string }>(
      `SELECT value FROM app_settings WHERE key = 'platform_version' LIMIT 1;`
    );
    const rawVal = rows[0]?.value;
    let resolved = DEFAULT_APP_VERSION;
    if (rawVal && typeof rawVal === 'object' && typeof rawVal.version === 'string' && rawVal.version.trim()) {
      resolved = rawVal.version.trim();
    } else if (typeof rawVal === 'string') {
      try {
        const parsed = JSON.parse(rawVal);
        if (parsed?.version && String(parsed.version).trim()) {
          resolved = String(parsed.version).trim();
        }
      } catch {
        if (rawVal.trim()) resolved = rawVal.trim();
      }
    }
    cachedVersion = resolved;
    return resolved;
  } catch {
    return DEFAULT_APP_VERSION;
  }
}

export async function setAppVersion(
  queryPg: QueryPgFn,
  rawVersion: string
): Promise<{ version: string; updatedAt: string }> {
  const cleanVersion = String(rawVersion || '').trim();
  if (!cleanVersion) {
    throw new Error('Версия не может быть пустой');
  }
  if (cleanVersion.length > 40) {
    throw new Error('Версия не должна превышать 40 символов');
  }

  await ensureAppVersionSchema(queryPg);
  const { rows } = await queryPg<{ updated_at: string }>(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES ('platform_version', $1::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET
       value = EXCLUDED.value,
       updated_at = now()
     RETURNING updated_at;`,
    [JSON.stringify({ version: cleanVersion })]
  );

  cachedVersion = cleanVersion;
  return {
    version: cleanVersion,
    updatedAt: rows[0]?.updated_at || new Date().toISOString(),
  };
}

export function registerAppVersionRoutes(app: Express, queryPg: QueryPgFn): void {
  app.get('/api/app-version', async (_req: Request, res: Response) => {
    try {
      const version = await getAppVersion(queryPg);
      res.json({ success: true, version });
    } catch (err: unknown) {
      res.status(500).json({
        success: false,
        version: DEFAULT_APP_VERSION,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.put('/api/admin/app-version', async (req: Request, res: Response) => {
    try {
      const nextVersion = String(req.body?.version || '').trim();
      const saved = await setAppVersion(queryPg, nextVersion);
      res.json({ success: true, ...saved });
    } catch (err: unknown) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
