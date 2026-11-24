import { TokenCostEstimation } from '../../types';

export const BASE_LETTERS_PACK = 100000;
export const BASE_LETTERS_PRICE_RUB = 15;
export const IMAGE_GENERATION_BASE_LETTERS = 60000; // Фиксированная стоимость генерации арта = 60 000 букв + токены входа/выхода промпта
export const IMAGE_PROMPT_OUTPUT_EST_TOKENS = 1500; // Средний выход токенов промпта при генерации арта в ProTalk Flux-3

export function estimateImageGenerationLetters(promptChars: number): number {
  const estIn = Math.ceil(Math.max(0, promptChars) / 2.5);
  return IMAGE_GENERATION_BASE_LETTERS + estIn + IMAGE_PROMPT_OUTPUT_EST_TOKENS;
}

export function lettersToRubles(letters: number): number {
  return Number(((Math.abs(letters) / BASE_LETTERS_PACK) * BASE_LETTERS_PRICE_RUB).toFixed(2));
}

export function formatLettersCount(letters: number): string {
  return Math.round(letters).toLocaleString('ru-RU');
}

export type DecisionModelId =
  | '~typesafe/jev-latest'
  | 'perplexity/pplx-decider-v1-27b'
  | 'openai/gpt-6-luna-decisions';

export const DECISION_EST_OUTPUT_TOKENS = 40;

export const DECISION_MODEL_CONFIGS: Record<
  DecisionModelId,
  { label: string; maxTextChars: number; multiplier: number; minLetters: number; perImageLetters: number }
> = {
  '~typesafe/jev-latest': {
    label: 'Jev Latest (до 30k симв.)',
    maxTextChars: 30000,
    multiplier: 0.25,
    minLetters: 25,
    perImageLetters: 350,
  },
  'perplexity/pplx-decider-v1-27b': {
    label: 'PPLX Decider 27B (до 250k / фото)',
    maxTextChars: 250000,
    multiplier: 0.55,
    minLetters: 100,
    perImageLetters: 350,
  },
  'openai/gpt-6-luna-decisions': {
    label: 'GPT-6 Luna Decisions (до 1M)',
    maxTextChars: 1000000,
    multiplier: 1.0,
    minLetters: 250,
    perImageLetters: 500,
  },
};

export function resolveDecisionModel(
  textChars: number,
  imagesCount = 0,
  explicitModel?: DecisionModelId
): DecisionModelId {
  const safeChars = Math.max(0, textChars);
  const hasImages = imagesCount > 0;

  if (safeChars > 250000) {
    return 'openai/gpt-6-luna-decisions';
  }
  if (explicitModel === 'openai/gpt-6-luna-decisions') {
    return 'openai/gpt-6-luna-decisions';
  }
  if (hasImages || safeChars > 30000 || explicitModel === 'perplexity/pplx-decider-v1-27b') {
    return 'perplexity/pplx-decider-v1-27b';
  }
  return '~typesafe/jev-latest';
}

export function estimateDecisionLetters(params: {
  textChars: number;
  instructionChars?: number;
  optionsChars?: number;
  imagesCount?: number;
  model?: DecisionModelId;
}): {
  totalLetters: number;
  rubles: number;
  resolvedModel: DecisionModelId;
  savingsPercent: number;
} {
  const imgCount = Math.min(4, Math.max(0, Math.round(params.imagesCount || 0)));
  const resolvedModel = resolveDecisionModel(params.textChars, imgCount, params.model);
  const cfg = DECISION_MODEL_CONFIGS[resolvedModel];

  const cappedTextChars = Math.min(Math.max(0, params.textChars), cfg.maxTextChars);
  const totalInputChars =
    cappedTextChars + (params.instructionChars || 180) + (params.optionsChars || 240);
  const estInTokens = Math.ceil(totalInputChars / 2.5);

  const scaledTokens = Math.ceil((estInTokens + DECISION_EST_OUTPUT_TOKENS) * cfg.multiplier);
  const imagesLetters = imgCount * cfg.perImageLetters;
  const totalLetters = Math.max(cfg.minLetters, scaledTokens + imagesLetters);

  // Comparison baseline against a classic full LLM call + 450-token JSON response
  const classicBaseline = Math.max(100, estInTokens + 450 + imgCount * 1500);
  const savingsPercent = Math.max(
    10,
    Math.min(94, Math.round((1 - totalLetters / classicBaseline) * 100))
  );

  return {
    totalLetters,
    rubles: lettersToRubles(totalLetters),
    resolvedModel,
    savingsPercent,
  };
}

export interface AiUsageCostBreakdown {
  inputChars: number;
  outputChars: number;
  inputLetters: number;
  outputLetters: number;
  totalLetters: number;
  tokensTotal: number;
  tokensIn: number;
  tokensOut: number;
  rubles: number;
}

export function estimateTextOperationLetters(
  inputChars: number,
  expectedOutputChars: number,
  inputMultiplier = 1.0,
  outputMultiplier = 1.0
): number {
  const estInTokens = Math.ceil(Math.max(0, inputChars) / 2.5);
  const estOutTokens = Math.ceil(Math.max(0, expectedOutputChars) / 2.5);
  return Math.max(10, Math.ceil(estInTokens * inputMultiplier) + Math.ceil(estOutTokens * outputMultiplier));
}

export function calculateAiUsageCost(params: {
  inputChars: number;
  outputChars: number;
  inputMultiplier?: number;
  outputMultiplier?: number;
  isImage?: boolean;
  isDecision?: boolean;
  decisionModel?: DecisionModelId;
  imagesCount?: number;
  exactTokens?: number;
  tokensIn?: number;
  tokensOut?: number;
}): AiUsageCostBreakdown {
  const inputMult = params.inputMultiplier ?? 1.0;
  const outputMult = params.outputMultiplier ?? 1.0;

  const inputChars = Math.max(0, Math.round(params.inputChars));
  const outputChars = Math.max(0, Math.round(params.outputChars));

  // Decisions API (function 763): lightweight decision billing scaled by model tier & visual count
  if (params.isDecision) {
    const imgCount = Math.min(4, Math.max(0, Math.round(params.imagesCount || 0)));
    const resolvedModel = resolveDecisionModel(inputChars, imgCount, params.decisionModel);
    const cfg = DECISION_MODEL_CONFIGS[resolvedModel];

    if (typeof params.exactTokens === 'number' && params.exactTokens > 0) {
      const rawTotal = Math.round(params.exactTokens);
      const rawIn =
        typeof params.tokensIn === 'number' && params.tokensIn >= 0
          ? Math.round(params.tokensIn)
          : Math.ceil(inputChars / 2.5);
      const rawOut =
        typeof params.tokensOut === 'number' && params.tokensOut >= 0
          ? Math.round(params.tokensOut)
          : Math.max(0, rawTotal - rawIn);

      const effectiveMult = inputMult !== 1.0 ? inputMult : cfg.multiplier;
      const inputLetters = Math.ceil(rawIn * effectiveMult);
      const outputLetters = Math.ceil(rawOut * (outputMult !== 1.0 ? outputMult : cfg.multiplier));
      const visualSurcharge = imgCount > 0 && rawIn < 350 ? imgCount * cfg.perImageLetters : 0;
      const totalLetters = Math.max(cfg.minLetters, inputLetters + outputLetters + visualSurcharge);

      return {
        inputChars,
        outputChars,
        inputLetters,
        outputLetters,
        totalLetters,
        tokensTotal: rawTotal,
        tokensIn: rawIn,
        tokensOut: rawOut,
        rubles: lettersToRubles(totalLetters),
      };
    }

    const est = estimateDecisionLetters({
      textChars: inputChars,
      instructionChars: 0,
      optionsChars: 0,
      imagesCount: imgCount,
      model: resolvedModel,
    });
    const estIn = Math.ceil(inputChars / 2.5);
    const estOut = DECISION_EST_OUTPUT_TOKENS;
    return {
      inputChars,
      outputChars,
      inputLetters: Math.max(1, est.totalLetters - imgCount * cfg.perImageLetters),
      outputLetters: estOut,
      totalLetters: est.totalLetters,
      tokensTotal: estIn + estOut,
      tokensIn: estIn,
      tokensOut: estOut,
      rubles: est.rubles,
    };
  }

  // Image generation billing: fixed 60 000 Letters per generated image + prompt input & output tokens
  if (params.isImage) {
    const rawIn =
      typeof params.tokensIn === 'number' && params.tokensIn >= 0
        ? Math.round(params.tokensIn)
        : Math.ceil(inputChars / 2.5);
    const rawOut =
      typeof params.tokensOut === 'number' && params.tokensOut >= 0
        ? Math.round(params.tokensOut)
        : IMAGE_PROMPT_OUTPUT_EST_TOKENS;
    // Prevent double-counting 60k if upstream mirrored the base cost into tokensOut
    const promptOutTokens = rawOut >= IMAGE_GENERATION_BASE_LETTERS ? 0 : rawOut;

    const inputLetters = Math.ceil(rawIn * inputMult);
    const outputLetters = Math.ceil(promptOutTokens * outputMult);
    const totalLetters = IMAGE_GENERATION_BASE_LETTERS + inputLetters + outputLetters;
    const tokensTotal =
      typeof params.exactTokens === 'number' && params.exactTokens > 0
        ? Math.max(totalLetters, Math.round(params.exactTokens))
        : totalLetters;

    return {
      inputChars,
      outputChars,
      inputLetters,
      outputLetters,
      totalLetters,
      tokensTotal,
      tokensIn: rawIn,
      tokensOut: promptOutTokens,
      rubles: lettersToRubles(totalLetters),
    };
  }

  // When ProTalk returns real token telemetry, 1 AI token = 1 Letter
  if (typeof params.exactTokens === 'number' && params.exactTokens > 0) {
    const rawTotal = Math.round(params.exactTokens);
    const rawIn =
      typeof params.tokensIn === 'number' && params.tokensIn >= 0
        ? Math.round(params.tokensIn)
        : Math.ceil(inputChars / 2.5);
    const rawOut =
      typeof params.tokensOut === 'number' && params.tokensOut >= 0
        ? Math.round(params.tokensOut)
        : Math.max(0, rawTotal - rawIn);

    const inputLetters = Math.ceil(rawIn * inputMult);
    const outputLetters = Math.ceil(rawOut * outputMult);
    const totalLetters =
      inputMult === 1.0 && outputMult === 1.0
        ? Math.max(10, rawTotal)
        : Math.max(10, inputLetters + outputLetters);

    return {
      inputChars,
      outputChars,
      inputLetters,
      outputLetters,
      totalLetters,
      tokensTotal: rawTotal,
      tokensIn: rawIn,
      tokensOut: rawOut,
      rubles: lettersToRubles(totalLetters),
    };
  }

  // Pre-flight estimate mode (1 AI token ~= 2.5 chars -> 1 Letter)
  const estInTokens = Math.ceil(inputChars / 2.5);
  const estOutTokens = Math.ceil(outputChars / 2.5);

  const inputLetters = Math.ceil(estInTokens * inputMult);
  const outputLetters = Math.ceil(estOutTokens * outputMult);
  const totalLetters = Math.max(10, inputLetters + outputLetters);

  return {
    inputChars,
    outputChars,
    inputLetters,
    outputLetters,
    totalLetters,
    tokensTotal: estInTokens + estOutTokens,
    tokensIn: estInTokens,
    tokensOut: estOutTokens,
    rubles: lettersToRubles(totalLetters),
  };
}

export interface ImportVolumeEstimate extends TokenCostEstimation {
  nonSpaceCharCount: number;
  estimatedChapters: number;
  aiInputChars: number;
  aiOutputChars: number;
  aiLettersCost: number;
  aiRublesCost: number;
}

export function estimateBookImportVolume(text: string, withAiEnrichment = true): ImportVolumeEstimate {
  const clean = text.trim();
  const charCount = clean.length;
  const nonSpaceCharCount = clean.replace(/\s+/g, '').length;
  const wordCount = clean ? clean.split(/\s+/).filter(Boolean).length : 0;

  // Estimate chapters by headings or by ~1800 words per chapter
  const headingMatches = clean.match(/(?:^|\n)\s*(?:Глава|Chapter|Часть|===)\s+[0-9IVXLCDMivxlcdm]+/gi);
  const estimatedChapters = headingMatches && headingMatches.length >= 2
    ? headingMatches.length
    : Math.max(1, Math.round(wordCount / 1800));

  // AI analyzes chapter excerpts (~1400 chars per chapter + prompt wrapper) and outputs synopses + lore (~320 chars per chapter)
  const aiInputChars = clean ? Math.min(charCount + 800, estimatedChapters * 1400 + 800) : 0;
  const aiOutputChars = clean ? Math.max(800, estimatedChapters * 320 + 600) : 0;

  const aiCost = clean && withAiEnrichment
    ? calculateAiUsageCost({ inputChars: aiInputChars, outputChars: aiOutputChars })
    : { inputLetters: 0, outputLetters: 0, totalLetters: 0, rubles: 0 };

  const lettersCost = withAiEnrichment ? aiCost.totalLetters : 0;
  const rublesCost = withAiEnrichment ? aiCost.rubles : 0;

  return {
    charCount,
    nonSpaceCharCount,
    wordCount,
    estimatedChapters,
    estimatedTokens: Math.ceil(charCount / 2.5),
    lettersCost,
    rublesCost,
    aiInputChars,
    aiOutputChars,
    aiLettersCost: aiCost.totalLetters,
    aiRublesCost: aiCost.rubles,
  };
}
