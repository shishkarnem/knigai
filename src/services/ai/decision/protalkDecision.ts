/**
 * ProTalk Decisions API Client (Function 763: protalk_ai_decision)
 * High-speed, ultra-economical classification, boolean probability (noul), and scoring (2..10).
 */
import { AppRoute } from '../../../types';
import { getCurrentUser } from '../../auth/authService';
import { maskApiKey, recordAiLog } from '../aiLogsService';
import { isUsablePublicUrl, resolvePublicUrlMap } from '../protalkImage';
import { checkSufficientBalance, recordAiUsage } from '../../billing/transactionService';
import {
  DECISION_EST_OUTPUT_TOKENS,
  DECISION_MODEL_CONFIGS,
  DecisionModelId,
  estimateDecisionLetters,
  formatLettersCount,
  resolveDecisionModel,
} from '../../billing/costCalculator';
import {
  GenerationAbortedError,
  getActiveGenerationSignal,
  updateGenerationStatus,
} from '../session/generationSession';

const FUNCTION_API_URL = 'https://api.pro-talk.ru/api/v1.0/run_function';
const BOT_ID = 74803;
const BOT_TOKEN = 'GNEMaM7RHVmkmnBtAucqZBILKkYl4PJM';
const FUNCTIONS_BASE_ID = 'appkq3HrzrxYxoAV8';
export const DECISION_FUNCTION_ID = 763;
export const DEFAULT_DECISION_LOG_URL =
  'https://docs.google.com/spreadsheets/d/1AmthoKydM2cUdXOv8vkID1e4HA6jDXBVmvz0svxr7Ho/edit?usp=sharing';

export type DecisionType = 'choice' | 'noul' | 'score';

export interface ProTalkDecisionParams {
  text: string;
  instruction: string;
  options: string;
  decisionType?: DecisionType;
  imagesUrls?: string[];
  aiModel?: DecisionModelId;
  debug?: boolean;
  userUid?: number;
  promptKey?: string;
  operationDescription?: string;
  bookId?: number;
  bookTitle?: string;
  chapterNumber?: number;
  alertLink?: AppRoute;
  chargeBalance?: boolean;
  abortSignal?: AbortSignal;
  statusMessage?: string;
}

export interface ProTalkDecisionResult {
  raw: Record<string, unknown>;
  decision: string;
  boolResult: boolean;
  probability: number;
  scoreNumber: number;
  modelUsed: DecisionModelId;
  tokensTotal: number;
  tokensIn: number;
  tokensOut: number;
  costLetters: number;
}

function normalizeImageList(raw?: string[]): string[] {
  if (!raw || raw.length === 0) return [];
  return raw
    .map((u) => (u || '').trim())
    .filter((u) => isUsablePublicUrl(u))
    .slice(0, 4);
}

function parseDecisionPayload(
  raw: Record<string, unknown>,
  decisionType: DecisionType,
  options: string
): { decision: string; boolResult: boolean; probability: number; scoreNumber: number } {
  const candidates = [
    raw.decision,
    raw.choice,
    raw.result,
    raw.answer,
    raw.selected,
    raw.key,
    raw.label,
    raw.output,
    raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>).decision : undefined,
    raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>).result : undefined,
  ];

  const probCandidate =
    raw.probability ??
    raw.noul ??
    raw.confidence ??
    (raw.data && typeof raw.data === 'object' ? (raw.data as Record<string, unknown>).probability : undefined);

  let rawStr = '';
  for (const c of candidates) {
    if (c !== undefined && c !== null && String(c).trim() !== '') {
      rawStr = String(c).trim();
      break;
    }
  }

  if (!rawStr && typeof raw.message === 'string') {
    rawStr = raw.message.trim();
  }

  // Extract key from "key::description" if API echoed full option
  const cleanKey = rawStr.includes('::') ? rawStr.split('::')[0].trim() : rawStr;
  const optionKeys = options
    .split(';;')
    .map((part) => part.split('::')[0].trim())
    .filter(Boolean);

  let matchedKey = cleanKey;
  if (optionKeys.length > 0 && cleanKey) {
    const exact = optionKeys.find((k) => k.toLowerCase() === cleanKey.toLowerCase());
    if (exact) {
      matchedKey = exact;
    } else {
      const partial = optionKeys.find(
        (k) => cleanKey.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(cleanKey.toLowerCase())
      );
      if (partial) matchedKey = partial;
    }
  }

  // Noul probability (0..1) and boolean interpretation
  let probability = 0.5;
  if (typeof probCandidate === 'number' && Number.isFinite(probCandidate)) {
    probability = probCandidate > 1 ? Math.min(1, probCandidate / 100) : Math.max(0, probCandidate);
  } else {
    const numInStr = Number(cleanKey);
    if (decisionType === 'noul' && Number.isFinite(numInStr) && cleanKey !== '') {
      probability = numInStr > 1 ? Math.min(1, numInStr / 100) : Math.max(0, numInStr);
    } else if (/^(true|yes|1|да)$/i.test(matchedKey)) {
      probability = 0.92;
    } else if (/^(false|no|0|нет)$/i.test(matchedKey)) {
      probability = 0.08;
    }
  }

  const boolResult =
    decisionType === 'noul'
      ? /^true$/i.test(matchedKey) || probability >= 0.6
      : Boolean(matchedKey) && !/^(false|no|none|0)$/i.test(matchedKey);

  // Score interpretation (1..10)
  let scoreNumber = 0;
  if (decisionType === 'score') {
    const numMatch = matchedKey.match(/\d+/);
    if (numMatch) {
      scoreNumber = Number(numMatch[0]);
    } else {
      const idx = optionKeys.findIndex((k) => k.toLowerCase() === matchedKey.toLowerCase());
      scoreNumber = idx >= 0 ? idx + 1 : 0;
    }
  }

  return {
    decision: matchedKey,
    boolResult,
    probability,
    scoreNumber,
  };
}

export async function callProTalkDecision(params: ProTalkDecisionParams): Promise<ProTalkDecisionResult> {
  const decisionType: DecisionType = params.decisionType || 'choice';
  const effectiveUid = params.userUid ?? getCurrentUser()?.uid;
  const logChatId = effectiveUid ? `jev${effectiveUid}` : `jev${Date.now()}`;

  // Resolve local /file/ paths to public URLs before sending up to 4 images
  let resolvedImages: string[] = [];
  if (params.imagesUrls && params.imagesUrls.length > 0) {
    const urlMap = await resolvePublicUrlMap(params.imagesUrls);
    const mapped = params.imagesUrls.map((u) => {
      const trimmed = (u || '').trim();
      return urlMap.get(trimmed) || trimmed;
    });
    resolvedImages = normalizeImageList(mapped);
  }

  const resolvedModel = resolveDecisionModel(
    params.text.length,
    resolvedImages.length,
    params.aiModel
  );
  const modelCfg = DECISION_MODEL_CONFIGS[resolvedModel];
  const cappedText =
    params.text.length > modelCfg.maxTextChars
      ? `${params.text.slice(0, Math.floor(modelCfg.maxTextChars * 0.72))}\n...\n${params.text.slice(
          -Math.floor(modelCfg.maxTextChars * 0.26)
        )}`
      : params.text;

  const est = estimateDecisionLetters({
    textChars: cappedText.length,
    instructionChars: params.instruction.length,
    optionsChars: params.options.length,
    imagesCount: resolvedImages.length,
    model: resolvedModel,
  });

  if (params.chargeBalance !== false && effectiveUid) {
    const check = await checkSufficientBalance(effectiveUid, est.totalLetters);
    if (!check.ok) {
      throw new Error(
        `Недостаточно букв для Decisions API (763). Требуется ≈ ${formatLettersCount(est.totalLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
      );
    }
  }

  const effectiveSignal = params.abortSignal || getActiveGenerationSignal();
  if (effectiveSignal?.aborted) {
    throw new GenerationAbortedError('Операция 763 остановлена до отправки запроса');
  }

  if (params.statusMessage) {
    updateGenerationStatus(params.statusMessage);
  }

  const argsPayload: Record<string, unknown> = {
    text: cappedText,
    instruction: params.instruction,
    options: params.options,
    decision_type: decisionType,
    ai_model: resolvedModel,
    debug: Boolean(params.debug ?? false),
    log_url: DEFAULT_DECISION_LOG_URL,
    log_chat_id: logChatId,
  };

  if (resolvedImages.length > 0) {
    argsPayload.images_urls = resolvedImages.join(';;');
  }

  const requestBody = {
    function_id: DECISION_FUNCTION_ID,
    functions_base_id: FUNCTIONS_BASE_ID,
    bot_id: BOT_ID,
    bot_token: BOT_TOKEN,
    arguments: argsPayload,
  };

  const serializedCallParams = JSON.stringify({
    function_id: DECISION_FUNCTION_ID,
    functions_base_id: FUNCTIONS_BASE_ID,
    decision_type: decisionType,
    ai_model: resolvedModel,
    images_count: resolvedImages.length,
    log_url: DEFAULT_DECISION_LOG_URL,
    log_chat_id: logChatId,
    text_chars: cappedText.length,
    instruction: params.instruction,
    options: params.options.slice(0, 400),
  });

  const estInputChars = cappedText.length + params.instruction.length + params.options.length;
  const estInTokens = Math.ceil(estInputChars / 2.5);

  try {
    const response = await fetch(FUNCTION_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: effectiveSignal,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      const errMsg = `Ошибка ИИ-анализа 763 (${response.status}): ${errorText}`;
      await recordAiLog({
        channel_id: logChatId,
        user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
        user_message: `${params.instruction}\n[options: ${params.options.slice(0, 220)}]`,
        bot_reply: errorText,
        channel_name: 'protalk_decision_763',
        bot_id: String(BOT_ID),
        llm: resolvedModel,
        api_key: maskApiKey(BOT_TOKEN),
        tokens_total: estInTokens,
        tokens_in_source: estInTokens,
        tokens_out_source: 0,
        function_error: errMsg,
        function_call_params: serializedCallParams,
        server_name: 'api.pro-talk.ru',
        tokens_user: est.totalLetters,
      });
      throw new Error(errMsg);
    }

    const result = (await response.json()) as Record<string, unknown>;
    const parsed = parseDecisionPayload(result, decisionType, params.options);

    const actualModelRaw = String(result.ai_model || result.model || resolvedModel);
    const actualModel: DecisionModelId = actualModelRaw.includes('luna')
      ? 'openai/gpt-6-luna-decisions'
      : actualModelRaw.includes('pplx')
      ? 'perplexity/pplx-decider-v1-27b'
      : '~typesafe/jev-latest';

    const usageObj = (result.usage && typeof result.usage === 'object' ? result.usage : {}) as Record<string, unknown>;
    const tokensIn =
      Number(result.tokens_in_source ?? usageObj.prompt_tokens ?? result.input_tokens) || estInTokens;
    const tokensOut =
      Number(result.tokens_out_source ?? usageObj.completion_tokens ?? result.output_tokens) ||
      DECISION_EST_OUTPUT_TOKENS;
    const tokensTotal =
      Number(result.tokens_total ?? usageObj.total_tokens ?? result.total_tokens) || tokensIn + tokensOut;

    let billedLetters = est.totalLetters;
    if (params.chargeBalance !== false && effectiveUid) {
      const billing = await recordAiUsage({
        userUid: effectiveUid,
        promptKey: params.promptKey || 'protalk_decision_763',
        inputChars: estInputChars,
        outputChars: (parsed.decision || '').length,
        isDecision: true,
        decisionModel: actualModel,
        decisionType,
        imagesCount: resolvedImages.length,
        decisionResultSummary: parsed.decision || String(parsed.probability),
        exactTokens: tokensTotal,
        tokensIn,
        tokensOut,
        bookId: params.bookId,
        bookTitle: params.bookTitle,
        chapterNumber: params.chapterNumber,
        description:
          params.operationDescription || `ИИ-решение (763 · ${actualModel.split('/').pop()})`,
        alertLink: params.alertLink || 'chapters',
      });
      billedLetters = billing.costLetters;
    }

    await recordAiLog({
      channel_id: logChatId,
      user_social_id: effectiveUid ? String(effectiveUid) : logChatId,
      user_message: `${params.instruction} [chars=${cappedText.length}, imgs=${resolvedImages.length}]`,
      bot_reply: `${parsed.decision} (p=${parsed.probability.toFixed(2)}${decisionType === 'score' ? `, score=${parsed.scoreNumber}` : ''})`,
      channel_name: 'protalk_decision_763',
      bot_id: String(BOT_ID),
      llm: actualModel,
      api_key: maskApiKey(BOT_TOKEN),
      tokens_total: tokensTotal,
      tokens_in_source: tokensIn,
      tokens_out_source: tokensOut,
      function_error: result.error ? String(result.error) : null,
      function_call_params: serializedCallParams,
      server_name: String(result.server_name || 'api.pro-talk.ru'),
      tokens_user: billedLetters,
    });

    return {
      raw: result,
      decision: parsed.decision,
      boolResult: parsed.boolResult,
      probability: parsed.probability,
      scoreNumber: parsed.scoreNumber,
      modelUsed: actualModel,
      tokensTotal,
      tokensIn,
      tokensOut,
      costLetters: billedLetters,
    };
  } catch (err: unknown) {
    if (
      effectiveSignal?.aborted ||
      (err instanceof Error && (err.name === 'AbortError' || err instanceof GenerationAbortedError))
    ) {
      const partialLetters = Math.max(
        10,
        Math.ceil(estInTokens * modelCfg.multiplier)
      );
      if (params.chargeBalance !== false && effectiveUid) {
        await recordAiUsage({
          userUid: effectiveUid,
          inputChars: estInputChars,
          outputChars: 0,
          isDecision: true,
          decisionModel: resolvedModel,
          decisionType,
          imagesCount: resolvedImages.length,
          exactTokens: estInTokens,
          tokensIn: estInTokens,
          tokensOut: 0,
          description: 'Частичное списание за отправленный контекст (остановка 763)',
          alertLink: 'balance',
        }).catch(() => {});
      }
      throw new GenerationAbortedError('Анализ 763 остановлен пользователем', {
        partialCharged: true,
        spentLetters: partialLetters,
      });
    }
    throw err;
  }
}
