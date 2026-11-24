/**
 * ProTalk Flux-3 Image Generation Service
 */
import { getCurrentUser } from '../auth/authService';
import { executePgQuery } from '../db/pgProxy';
import { maskApiKey, recordAiLog } from './aiLogsService';
import { recordAiUsage } from '../billing/transactionService';
import {
  GenerationAbortedError,
  getActiveGenerationSignal,
  updateGenerationStatus,
} from './session/generationSession';

const FUNCTION_API_URL = 'https://api.pro-talk.ru/api/v1.0/run_function';
const BOT_ID = 74803;
const BOT_TOKEN = 'GNEMaM7RHVmkmnBtAucqZBILKkYl4PJM';
const FUNCTIONS_BASE_ID = 'appkq3HrzrxYxoAV8';
const FUNCTION_ID = 784;
export const DEFAULT_IMAGE_LOG_URL =
  'https://docs.google.com/spreadsheets/d/1AmthoKydM2cUdXOv8vkID1e4HA6jDXBVmvz0svxr7Ho/edit?usp=sharing';

export interface GenerateImageOptions {
  prompt: string;
  aspectRatio?: '3:4' | '9:16' | '1:1' | '16:9';
  referenceImageUrl?: string;
  chatId?: string;
  userUid?: number;
  abortSignal?: AbortSignal;
}

export interface ImageGenerationResult {
  url: string;
  aspectRatio: string;
  model?: string;
  tokensTotal: number;
  tokensIn: number;
  tokensOut: number;
}

export function isUsablePublicUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }
  if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1') || /\/file\/\d+/i.test(trimmed) || trimmed.includes('/file/')) {
    return false;
  }
  return true;
}

export async function resolvePublicUrlMap(rawUrls: Array<string | undefined | null>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const fileIdsToLookup = new Set<number>();
  const fileKeysToLookup = new Set<string>();
  const pendingPairs: Array<{ raw: string; keyOrId: string; isNumeric: boolean }> = [];

  for (const r of rawUrls) {
    const input = (r || '').trim();
    if (!input || input.startsWith('data:') || input.startsWith('blob:')) continue;
    if (isUsablePublicUrl(input)) {
      map.set(input, input);
      continue;
    }
    const fileMatch = input.match(/\/file\/([^/?#]+)/i);
    if (fileMatch && fileMatch[1]) {
      const keyOrId = decodeURIComponent(fileMatch[1]);
      const isNumeric = /^\d+$/.test(keyOrId);
      if (isNumeric) fileIdsToLookup.add(Number(keyOrId));
      else fileKeysToLookup.add(keyOrId);
      pendingPairs.push({ raw: input, keyOrId, isNumeric });
    }
  }

  if (pendingPairs.length > 0) {
    try {
      const ids = Array.from(fileIdsToLookup);
      const keys = Array.from(fileKeysToLookup);
      const idList = ids.length > 0 ? ids.join(',') : '-1';
      const rows = await executePgQuery<{ id: number; file_key: string; original_url: string }>(
        `SELECT id, file_key, COALESCE(original_url, url, '') as original_url
         FROM file_storage
         WHERE id IN (${idList}) OR ($1::text <> '' AND file_key = ANY(string_to_array($1::text, '|||')));`,
        [keys.join('|||')]
      );
      const byId = new Map<number, string>();
      const byKey = new Map<string, string>();
      for (const row of rows.rows || []) {
        if (row.original_url && isUsablePublicUrl(row.original_url)) {
          byId.set(Number(row.id), row.original_url);
          if (row.file_key) byKey.set(String(row.file_key), row.original_url);
        }
      }
      for (const p of pendingPairs) {
        const hit = p.isNumeric ? byId.get(Number(p.keyOrId)) : byKey.get(p.keyOrId);
        if (hit) map.set(p.raw, hit);
      }
    } catch {
      // fallback below if needed
    }
  }

  return map;
}

export async function resolvePublicReferenceUrl(rawUrl?: string): Promise<string> {
  const input = (rawUrl || '').trim();
  if (!input || input.startsWith('data:') || input.startsWith('blob:')) {
    return '';
  }

  if (isUsablePublicUrl(input)) {
    return input;
  }

  const map = await resolvePublicUrlMap([input]);
  const mapped = map.get(input);
  if (mapped && isUsablePublicUrl(mapped)) {
    return mapped;
  }

  const fileMatch = input.match(/\/file\/([^/?#]+)/i);
  if (fileMatch && fileMatch[1]) {
    try {
      const apiRes = await fetch(`/api/files/resolve-url?url=${encodeURIComponent(input)}`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        if (data?.resolvedUrl && isUsablePublicUrl(String(data.resolvedUrl))) {
          return String(data.resolvedUrl);
        }
      }
    } catch {
      // Ignore network resolve errors
    }
    return '';
  }

  return '';
}

export async function generateProTalkImage(options: GenerateImageOptions): Promise<ImageGenerationResult> {
  const {
    prompt,
    aspectRatio = '3:4',
    referenceImageUrl = '',
    userUid,
    chatId,
  } = options;

  const resolvedRefUrl = await resolvePublicReferenceUrl(referenceImageUrl);
  const promptWithRef =
    resolvedRefUrl && !prompt.includes(resolvedRefUrl)
      ? `${prompt}\n\nPrimary visual reference image URL (must maintain visual likeness & palette): ${resolvedRefUrl}`
      : prompt;

  const effectiveUid = userUid ?? getCurrentUser()?.uid;
  const logChatId = effectiveUid
    ? `manga${effectiveUid}`
    : chatId
    ? chatId.startsWith('manga')
      ? chatId
      : `manga${chatId}`
    : `manga${Date.now()}`;

  const payload = {
    function_id: FUNCTION_ID,
    functions_base_id: FUNCTIONS_BASE_ID,
    bot_id: BOT_ID,
    bot_token: BOT_TOKEN,
    arguments: {
      prompt: promptWithRef,
      aspect_ratio: aspectRatio,
      resolution: '1K',
      filesUrl: resolvedRefUrl,
      debug: false,
      log_url: DEFAULT_IMAGE_LOG_URL,
      log_chat_id: logChatId,
    },
  };

  const serializedCallParams = JSON.stringify({
    function_id: FUNCTION_ID,
    functions_base_id: FUNCTIONS_BASE_ID,
    ...payload.arguments,
  });

  const effectiveSignal = options.abortSignal || getActiveGenerationSignal();
  if (effectiveSignal?.aborted) {
    throw new GenerationAbortedError('Генерация изображения остановлена до отправки запроса');
  }

  const estimatedInTokens = Math.ceil(prompt.length / 2.5);
  updateGenerationStatus('Генерация изображения нейросетью...');

  try {
    const response = await fetch(FUNCTION_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: effectiveSignal,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`ProTalk image generation failed with status ${response.status}:`, errorText);
      const errMsg = `Ошибка генерации изображения (${response.status}): ${errorText}`;
      await recordAiLog({
        channel_id: logChatId,
        user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
        user_message: prompt,
        bot_reply: errorText,
        channel_name: 'protalk_image_flux3',
        bot_id: String(BOT_ID),
        llm: 'flux-3',
        api_key: maskApiKey(BOT_TOKEN),
        tokens_total: estimatedInTokens,
        tokens_in_source: estimatedInTokens,
        tokens_out_source: 0,
        function_error: errMsg,
        function_call_params: serializedCallParams,
        server_name: 'api.pro-talk.ru',
        tokens_user: estimatedInTokens,
      });
      throw new Error(errMsg);
    }

    const result = await response.json();
    const tokensIn =
      Number(result.tokens_in_source ?? result.usage?.prompt_tokens ?? result.input_tokens) || estimatedInTokens;
    const rawOut = Number(result.tokens_out_source ?? result.usage?.completion_tokens ?? result.output_tokens);
    const tokensOut = Number.isFinite(rawOut) && rawOut >= 0 && rawOut < 60000 ? rawOut : 0;
    const hasImages = Boolean(result.images && result.images.length > 0 && result.images[0].url);
    const tokensTotal = hasImages ? 60000 + tokensIn + tokensOut : tokensIn + tokensOut;
    const tokensUser = tokensTotal;
    const modelName = String(result.model || 'flux-3');
    const serverName = String(result.server_name || 'api.pro-talk.ru');

    if (result.images && result.images.length > 0 && result.images[0].url) {
      const imageUrl = String(result.images[0].url);
      await recordAiLog({
        channel_id: logChatId,
        user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
        user_message: prompt,
        bot_reply: imageUrl,
        channel_name: 'protalk_image_flux3',
        bot_id: String(BOT_ID),
        llm: modelName,
        api_key: maskApiKey(BOT_TOKEN),
        tokens_total: tokensTotal,
        tokens_in_source: tokensIn,
        tokens_out_source: tokensOut,
        function_error: null,
        function_call_params: serializedCallParams,
        server_name: serverName,
        tokens_user: tokensUser,
      });

      return {
        url: imageUrl,
        aspectRatio: result.aspect_ratio || aspectRatio,
        model: modelName,
        tokensTotal,
        tokensIn,
        tokensOut,
      };
    }

    const noImageErr = result.error || 'Изображение не получено в ответе API';
    await recordAiLog({
      channel_id: logChatId,
      user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
      user_message: prompt,
      bot_reply: JSON.stringify(result),
      channel_name: 'protalk_image_flux3',
      bot_id: String(BOT_ID),
      llm: modelName,
      api_key: maskApiKey(BOT_TOKEN),
      tokens_total: tokensTotal,
      tokens_in_source: tokensIn,
      tokens_out_source: tokensOut,
      function_error: String(noImageErr),
      function_call_params: serializedCallParams,
      server_name: serverName,
      tokens_user: tokensUser,
    });
    throw new Error(noImageErr);
  } catch (err: unknown) {
    if (effectiveSignal?.aborted || (err instanceof Error && (err.name === 'AbortError' || err instanceof GenerationAbortedError))) {
      const partialBill = await recordAiUsage({
        userUid: effectiveUid,
        inputChars: prompt.length,
        outputChars: 0,
        isImage: false,
        exactTokens: estimatedInTokens,
        tokensIn: estimatedInTokens,
        tokensOut: 0,
        description: 'Частичное списание за отправленный промпт арта при остановке генерации',
        alertLink: 'balance',
      }).catch(() => ({ costLetters: estimatedInTokens }));

      await recordAiLog({
        channel_id: logChatId,
        user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
        user_message: prompt,
        bot_reply: null,
        channel_name: 'protalk_image_flux3',
        bot_id: String(BOT_ID),
        llm: 'flux-3',
        api_key: maskApiKey(BOT_TOKEN),
        tokens_total: estimatedInTokens,
        tokens_in_source: estimatedInTokens,
        tokens_out_source: 0,
        function_error: 'Генерация изображения остановлена пользователем',
        function_call_params: serializedCallParams,
        server_name: 'api.pro-talk.ru',
        tokens_user: estimatedInTokens,
      });

      throw new GenerationAbortedError('Генерация изображения остановлена пользователем', {
        partialCharged: true,
        spentLetters: partialBill.costLetters,
      });
    }

    // Network errors before HTTP response parsed are also logged if not already logged
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('Ошибка генерации изображения') && !msg.includes('Изображение не получено')) {
      await recordAiLog({
        channel_id: logChatId,
        user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
        user_message: prompt,
        bot_reply: null,
        channel_name: 'protalk_image_flux3',
        bot_id: String(BOT_ID),
        llm: 'flux-3',
        api_key: maskApiKey(BOT_TOKEN),
        tokens_total: estimatedInTokens,
        tokens_in_source: estimatedInTokens,
        tokens_out_source: 0,
        function_error: msg,
        function_call_params: serializedCallParams,
        server_name: 'api.pro-talk.ru',
        tokens_user: estimatedInTokens,
      });
    }
    throw err;
  }
}
