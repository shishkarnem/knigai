/**
 * PostgreSQL Same-Origin Proxy Client for KnigAI
 * Routes queries through /api/db/query on our Express server so browsers never hit third-party CORS or network blocks.
 */

const LOCAL_DB_PROXY_URL = '/api/db/query';
const LOCAL_BOOTSTRAP_URL = '/api/db/bootstrap';

export interface ProxyQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export async function executePgQuery<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | boolean | null)[] = [],
  safeMode = false
): Promise<ProxyQueryResult<T>> {
  const payload = JSON.stringify({
    query: sql,
    params,
    safeMode,
  });

  const doFetch = () =>
    fetch(LOCAL_DB_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: payload,
    });

  let response: Response;
  try {
    response = await doFetch();
    if (response.status >= 500) {
      await new Promise((r) => setTimeout(r, 450));
      response = await doFetch();
    }
  } catch (firstErr) {
    await new Promise((r) => setTimeout(r, 450));
    try {
      response = await doFetch();
    } catch (secondErr) {
      console.warn('PostgreSQL Proxy network/query exception:', firstErr, secondErr);
      throw secondErr;
    }
  }

  try {
    if (!response.ok) {
      const errText = await response.text();
      console.warn(`PostgreSQL Proxy Error [${response.status}]:`, errText);
      throw new Error(`Database query failed (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return {
      rows: data.rows || [],
      rowCount: data.rowCount || (data.rows ? data.rows.length : 0),
    };
  } catch (error) {
    console.warn('PostgreSQL Proxy response/query exception:', error);
    throw error;
  }
}

let bootstrapDone = false;

export async function bootstrapDatabaseSchema(): Promise<void> {
  if (bootstrapDone) return;
  bootstrapDone = true;
  try {
    await fetch(LOCAL_BOOTSTRAP_URL, {
      method: 'POST',
      credentials: 'same-origin',
    });
  } catch {
    // Non-blocking: server initializes schema autonomously on startup
  }
}
