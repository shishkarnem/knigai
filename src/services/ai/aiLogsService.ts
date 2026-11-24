import { executePgQuery } from '../db/pgProxy';
import { AiLogRecord } from '../../types';

export const TOKENS_PER_RUB_PACK = 10_000_000;
export const RUB_PER_TOKEN_PACK = 300;
export const AI_LOG_CREATED_EVENT = 'knigai_ai_log_created';

export function calculateTokensCostRub(tokensTotal: number | string | null | undefined): number {
  const num = Number(tokensTotal);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Number(((num / TOKENS_PER_RUB_PACK) * RUB_PER_TOKEN_PACK).toFixed(6));
}

export function formatRubCost(rub: number | string | null | undefined): string {
  const num = Number(rub) || 0;
  if (num === 0) return '0.00 ₽';
  if (num < 0.01) return `${num.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} ₽`;
  return `${num.toFixed(2)} ₽`;
}

export function maskApiKey(key?: string | null): string {
  if (!key) return '';
  const s = String(key).trim();
  if (s.length <= 8) return '***';
  return `${s.slice(0, 4)}***${s.slice(-4)}`;
}

export interface CreateAiLogInput {
  channel_id?: string | null;
  user_social_id?: string | null;
  user_message?: string | null;
  bot_reply?: string | null;
  channel_name?: string | null;
  bot_id?: string | null;
  llm?: string | null;
  api_key?: string | null;
  tokens_total?: number | null;
  tokens_in_source?: number | null;
  tokens_out_source?: number | null;
  function_error?: string | null;
  function_call_params?: string | null;
  server_name?: string | null;
  tokens_user?: number | null;
}

export async function recordAiLog(entry: CreateAiLogInput): Promise<void> {
  try {
    const insertSql = `
      INSERT INTO logs (
        channel_id, user_social_id, user_message, bot_reply, channel_name,
        bot_id, llm, api_key, tokens_total, tokens_in_source, tokens_out_source,
        function_error, function_call_params, server_name, tokens_user
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING id;
    `;
    await executePgQuery(insertSql, [
      entry.channel_id ?? null,
      entry.user_social_id ?? null,
      entry.user_message ?? null,
      entry.bot_reply ?? null,
      entry.channel_name ?? null,
      entry.bot_id ?? null,
      entry.llm ?? null,
      entry.api_key ?? null,
      entry.tokens_total ?? null,
      entry.tokens_in_source ?? null,
      entry.tokens_out_source ?? null,
      entry.function_error ?? null,
      entry.function_call_params ?? null,
      entry.server_name ?? null,
      entry.tokens_user ?? null,
    ]);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(AI_LOG_CREATED_EVENT));
    }
  } catch (err) {
    console.warn('[recordAiLog] Failed to insert into logs table via proxy, trying /api/logs:', err);
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(AI_LOG_CREATED_EVENT));
      }
    } catch {
      // non-fatal logging failure
    }
  }
}

export interface FetchAiLogsResult {
  rows: AiLogRecord[];
  summary: {
    totalCount: number;
    totalTokens: number;
    totalRub: number;
    errorCount: number;
  };
  syncedAt: string;
}

export async function fetchAiLogs(params?: {
  limit?: number;
  search?: string;
  onlyErrors?: boolean;
}): Promise<FetchAiLogsResult> {
  const limit = params?.limit ?? 100;
  const search = params?.search?.trim() || '';
  const onlyErrors = Boolean(params?.onlyErrors);

  try {
    const qs = new URLSearchParams({
      limit: String(limit),
      search,
      only_errors: String(onlyErrors),
    });
    const res = await fetch(`/api/admin/logs?${qs.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const rows: AiLogRecord[] = (data.rows || []).map((r: Record<string, unknown>) => {
        const tokensTotal = r.tokens_total !== null && r.tokens_total !== undefined ? Number(r.tokens_total) : null;
        return {
          ...(r as unknown as AiLogRecord),
          id: Number(r.id),
          tokens_total: tokensTotal,
          tokens_in_source: r.tokens_in_source !== null && r.tokens_in_source !== undefined ? Number(r.tokens_in_source) : null,
          tokens_out_source: r.tokens_out_source !== null && r.tokens_out_source !== undefined ? Number(r.tokens_out_source) : null,
          tokens_user: r.tokens_user !== null && r.tokens_user !== undefined ? Number(r.tokens_user) : null,
          rub:
            r.rub !== null && r.rub !== undefined
              ? Number(r.rub)
              : calculateTokensCostRub(tokensTotal),
        };
      });
      return {
        rows,
        summary: {
          totalCount: Number(data.summary?.totalCount || rows.length),
          totalTokens: Number(data.summary?.totalTokens || 0),
          totalRub: Number(data.summary?.totalRub || 0),
          errorCount: Number(data.summary?.errorCount || 0),
        },
        syncedAt: data.syncedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn('[fetchAiLogs] /api/admin/logs fallback to pgProxy:', err);
  }

  // Fallback direct PostgreSQL query
  const whereParts: string[] = [];
  const queryParams: (string | number | boolean | null)[] = [];
  if (search) {
    queryParams.push(`%${search}%`);
    const idx = queryParams.length;
    whereParts.push(
      `(COALESCE(channel_id,'') ILIKE $${idx} OR COALESCE(user_social_id,'') ILIKE $${idx} OR COALESCE(user_message,'') ILIKE $${idx} OR COALESCE(bot_reply,'') ILIKE $${idx} OR COALESCE(llm,'') ILIKE $${idx} OR COALESCE(function_error,'') ILIKE $${idx})`
    );
  }
  if (onlyErrors) {
    whereParts.push(`(function_error IS NOT NULL AND function_error <> '')`);
  }
  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const rowsRes = await executePgQuery<Record<string, unknown>>(
    `SELECT *, ROUND((COALESCE(tokens_total, 0)::numeric / 10000000.0) * 300.0, 6) AS rub FROM logs ${whereSql} ORDER BY id DESC LIMIT ${Math.min(500, limit)};`,
    queryParams
  );
  const sumRes = await executePgQuery<{
    total_count: string;
    total_tokens: string;
    total_rub: string;
    error_count: string;
  }>(
    `SELECT COUNT(*) AS total_count, COALESCE(SUM(tokens_total), 0) AS total_tokens, ROUND((COALESCE(SUM(tokens_total), 0)::numeric / 10000000.0) * 300.0, 6) AS total_rub, COUNT(*) FILTER (WHERE function_error IS NOT NULL AND function_error <> '') AS error_count FROM logs;`
  );

  const rows: AiLogRecord[] = (rowsRes.rows || []).map((r) => {
    const tokensTotal = r.tokens_total !== null && r.tokens_total !== undefined ? Number(r.tokens_total) : null;
    return {
      ...(r as unknown as AiLogRecord),
      id: Number(r.id),
      tokens_total: tokensTotal,
      tokens_in_source: r.tokens_in_source !== null && r.tokens_in_source !== undefined ? Number(r.tokens_in_source) : null,
      tokens_out_source: r.tokens_out_source !== null && r.tokens_out_source !== undefined ? Number(r.tokens_out_source) : null,
      tokens_user: r.tokens_user !== null && r.tokens_user !== undefined ? Number(r.tokens_user) : null,
      rub: r.rub !== null && r.rub !== undefined ? Number(r.rub) : calculateTokensCostRub(tokensTotal),
    };
  });
  const s = sumRes.rows[0];
  return {
    rows,
    summary: {
      totalCount: Number(s?.total_count || rows.length),
      totalTokens: Number(s?.total_tokens || 0),
      totalRub: Number(s?.total_rub || 0),
      errorCount: Number(s?.error_count || 0),
    },
    syncedAt: new Date().toISOString(),
  };
}
