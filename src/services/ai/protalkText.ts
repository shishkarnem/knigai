/**
 * ProTalk Asynchronous Text Generation Service with polling
 */
import { getCurrentUser } from '../auth/authService';
import { maskApiKey, recordAiLog } from './aiLogsService';
import { recordAiUsage } from '../billing/transactionService';
import {
  GenerationAbortedError,
  getActiveGenerationSignal,
  updateGenerationStatus,
} from './session/generationSession';

const SEND_URL = 'https://eu1.api.pro-talk.ru/api/v1.0/send_message_async';
const REPLY_URL = 'https://eu1.api.pro-talk.ru/api/v1.0/get_last_reply';
const BOT_ID = 74803;
const BOT_TOKEN = 'GNEMaM7RHVmkmnBtAucqZBILKkYl4PJM';

export interface ProTalkTextResult {
  text: string;
  tokensTotal: number;
  tokensIn: number;
  tokensOut: number;
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return new Promise((r) => setTimeout(r, ms));
  }
  if (signal.aborted) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function generateProTalkTextWithUsage(
  prompt: string,
  onProgress?: (status: string) => void,
  maxWaitSeconds = 60,
  userUid?: number,
  chatIdOverride?: string,
  abortSignal?: AbortSignal
): Promise<ProTalkTextResult> {
  const effectiveSignal = abortSignal || getActiveGenerationSignal();
  if (effectiveSignal?.aborted) {
    throw new GenerationAbortedError('Операция остановлена до отправки запроса');
  }

  const effectiveUid = userUid ?? getCurrentUser()?.uid;
  const randomSuffix = Math.floor(Math.random() * 90000 + 10000);
  const chatId =
    chatIdOverride ||
    `knigai_${effectiveUid ?? 'anon'}_${Date.now()}_${randomSuffix}`;

  const callParamsJson = JSON.stringify({
    bot_id: BOT_ID,
    bot_chat_id: chatId,
    max_wait_seconds: maxWaitSeconds,
    message_length: prompt.length,
  });
  const estimatedInTokens = Math.ceil(prompt.length / 2.5);

  const emitStatus = (text: string) => {
    if (onProgress) onProgress(text);
    updateGenerationStatus(text);
  };

  emitStatus('Отправка запроса в нейросеть...');

  let sendRes: Response;
  try {
    sendRes = await fetch(SEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: effectiveSignal,
      body: JSON.stringify({
        bot_id: BOT_ID,
        bot_token: BOT_TOKEN,
        bot_chat_id: chatId,
        message: prompt,
      }),
    });
  } catch (err) {
    if (effectiveSignal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      throw new GenerationAbortedError('Операция остановлена во время отправки запроса');
    }
    throw err;
  }

  if (!sendRes.ok) {
    const err = await sendRes.text();
    console.warn('ProTalk send_message_async error:', sendRes.status, err);
    const errMsg = `Ошибка отправки запроса к нейросети (${sendRes.status}): ${err}`;
    await recordAiLog({
      channel_id: chatId,
      user_social_id: effectiveUid ? String(effectiveUid) : chatId,
      user_message: prompt,
      bot_reply: err,
      channel_name: 'protalk_text_async',
      bot_id: String(BOT_ID),
      llm: 'protalk-llm',
      api_key: maskApiKey(BOT_TOKEN),
      tokens_total: estimatedInTokens,
      tokens_in_source: estimatedInTokens,
      tokens_out_source: 0,
      function_error: errMsg,
      function_call_params: callParamsJson,
      server_name: 'eu1.api.pro-talk.ru',
      tokens_user: estimatedInTokens,
    });
    throw new Error(errMsg);
  }

  const checkLastReplyOnce = async (): Promise<ProTalkTextResult | null> => {
    try {
      const replyRes = await fetch(REPLY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bot_id: BOT_ID,
          bot_token: BOT_TOKEN,
          bot_chat_id: chatId,
        }),
      });

      if (replyRes.ok) {
        const data = await replyRes.json();
        if (data && data.message && typeof data.message === 'string' && data.message.trim().length > 0) {
          const replyText = data.message.trim();
          const tokensIn =
            Number(data.tokens_in_source ?? data.usage?.prompt_tokens ?? data.input_tokens) || estimatedInTokens;
          const tokensOut =
            Number(data.tokens_out_source ?? data.usage?.completion_tokens ?? data.output_tokens) ||
            Math.ceil(replyText.length / 2.5);
          const tokensTotal =
            Number(data.tokens_total ?? data.usage?.total_tokens ?? data.total_tokens) || tokensIn + tokensOut;
          const tokensUser = Number(data.tokens_user) || tokensTotal;

          await recordAiLog({
            channel_id: String(data.channel_id || chatId),
            user_social_id: effectiveUid ? String(effectiveUid) : String(data.user_social_id || chatId),
            user_message: prompt,
            bot_reply: replyText,
            channel_name: String(data.channel_name || 'protalk_text_async'),
            bot_id: String(data.bot_id || BOT_ID),
            llm: String(data.llm || data.model || 'protalk-llm'),
            api_key: maskApiKey(BOT_TOKEN),
            tokens_total: tokensTotal,
            tokens_in_source: tokensIn,
            tokens_out_source: tokensOut,
            function_error: data.function_error ? String(data.function_error) : null,
            function_call_params: callParamsJson,
            server_name: String(data.server_name || 'eu1.api.pro-talk.ru'),
            tokens_user: tokensUser,
          });

          return {
            text: replyText,
            tokensTotal,
            tokensIn,
            tokensOut,
          };
        }
      }
    } catch {
      // transient network poll failure
    }
    return null;
  };

  // Poll for reply
  const startTime = Date.now();
  const pollInterval = 3500;

  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    if (effectiveSignal?.aborted) {
      // Perform one quick check to rescue an already completed reply
      const ready = await checkLastReplyOnce();
      if (ready) return ready;

      // Otherwise charge ONLY the prompt input tokens actually sent
      const partialBill = await recordAiUsage({
        userUid: effectiveUid,
        inputChars: prompt.length,
        outputChars: 0,
        exactTokens: estimatedInTokens,
        tokensIn: estimatedInTokens,
        tokensOut: 0,
        description: 'Частичное списание за отправленный промпт при остановке генерации',
        alertLink: 'balance',
      }).catch(() => ({ costLetters: estimatedInTokens }));

      await recordAiLog({
        channel_id: chatId,
        user_social_id: effectiveUid ? String(effectiveUid) : chatId,
        user_message: prompt,
        bot_reply: null,
        channel_name: 'protalk_text_async',
        bot_id: String(BOT_ID),
        llm: 'protalk-llm',
        api_key: maskApiKey(BOT_TOKEN),
        tokens_total: estimatedInTokens,
        tokens_in_source: estimatedInTokens,
        tokens_out_source: 0,
        function_error: 'Остановлено пользователем до получения ответа (списан только вход)',
        function_call_params: callParamsJson,
        server_name: 'eu1.api.pro-talk.ru',
        tokens_user: estimatedInTokens,
      });

      throw new GenerationAbortedError('Операция остановлена пользователем', {
        partialCharged: true,
        spentLetters: partialBill.costLetters,
      });
    }

    await sleepWithSignal(pollInterval, effectiveSignal);
    if (effectiveSignal?.aborted) continue;

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    emitStatus(`Ожидание ответа нейросети (${elapsed} сек)...`);

    const reply = await checkLastReplyOnce();
    if (reply) return reply;
  }

  const timeoutErr = `Время ожидания ответа нейросети истекло (таймаут ${maxWaitSeconds} сек)`;
  await recordAiLog({
    channel_id: chatId,
    user_social_id: effectiveUid ? String(effectiveUid) : chatId,
    user_message: prompt,
    bot_reply: null,
    channel_name: 'protalk_text_async',
    bot_id: String(BOT_ID),
    llm: 'protalk-llm',
    api_key: maskApiKey(BOT_TOKEN),
    tokens_total: estimatedInTokens,
    tokens_in_source: estimatedInTokens,
    tokens_out_source: 0,
    function_error: timeoutErr,
    function_call_params: callParamsJson,
    server_name: 'eu1.api.pro-talk.ru',
    tokens_user: estimatedInTokens,
  });

  throw new Error(timeoutErr);
}

export async function generateProTalkText(
  prompt: string,
  onProgress?: (status: string) => void,
  maxWaitSeconds = 60,
  userUid?: number,
  chatIdOverride?: string,
  abortSignal?: AbortSignal
): Promise<string> {
  const res = await generateProTalkTextWithUsage(
    prompt,
    onProgress,
    maxWaitSeconds,
    userUid,
    chatIdOverride,
    abortSignal
  );
  return res.text;
}
