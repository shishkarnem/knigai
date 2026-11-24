import { BookStyleConfig } from '../../types';
import { STYLE_PRESETS, StylePresetItem } from './StylePresets';
import { generateProTalkTextWithUsage } from '../ai/protalkText';
import { getPromptConfig, renderPrompt } from '../db/promptRepository';
import { checkSufficientBalance, recordAiUsage } from '../billing/transactionService';
import { calculateAiUsageCost, formatLettersCount } from '../billing/costCalculator';

const STORAGE_KEY_CUSTOM_STYLES = 'knigai_custom_styles';

export async function getAllStyles(_userUid?: number): Promise<StylePresetItem[]> {
  const cached = localStorage.getItem(STORAGE_KEY_CUSTOM_STYLES);
  let customList: StylePresetItem[] = [];
  if (cached) {
    try {
      customList = JSON.parse(cached);
    } catch {
      customList = [];
    }
  }
  return [...STYLE_PRESETS, ...customList];
}

export async function saveCustomStyle(style: StylePresetItem): Promise<StylePresetItem> {
  const updatedItem: StylePresetItem = {
    ...style,
    id: style.id || `custom-${Date.now()}`,
    isCustom: true,
  };

  const cached = localStorage.getItem(STORAGE_KEY_CUSTOM_STYLES);
  const customList: StylePresetItem[] = cached ? JSON.parse(cached) : [];
  const cIndex = customList.findIndex((s) => s.id === updatedItem.id);
  if (cIndex >= 0) {
    customList[cIndex] = updatedItem;
  } else {
    customList.unshift(updatedItem);
  }

  localStorage.setItem(STORAGE_KEY_CUSTOM_STYLES, JSON.stringify(customList));
  return updatedItem;
}

/**
 * Uses AI with prompt from PostgreSQL `ai_prompts` (`style_builder`) to generate a literary and visual style preset
 */
export async function generateStyleWithAi(userPrompt: string, userUid?: number): Promise<BookStyleConfig> {
  const cfg = await getPromptConfig('style_builder');
  const prompt = renderPrompt(
    cfg.template,
    { user_prompt: userPrompt },
    cfg.system_instruction
  );

  if (userUid) {
    const est = calculateAiUsageCost({
      inputChars: prompt.length,
      outputChars: 1200,
      inputMultiplier: cfg.input_cost_multiplier,
      outputMultiplier: cfg.output_cost_multiplier,
    });
    const check = await checkSufficientBalance(userUid, est.totalLetters);
    if (!check.ok) {
      throw new Error(
        `Недостаточно букв на балансе. Требуется ≈ ${formatLettersCount(est.totalLetters)} букв, доступно: ${formatLettersCount(check.currentBalance)} букв.`
      );
    }
  }

  const aiRes = await generateProTalkTextWithUsage(prompt, undefined, 50, userUid);
  const reply = aiRes.text;

  await recordAiUsage({
    userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: reply.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    description: `Генерация литературного стиля по запросу автора`,
    alertLink: 'constructor',
  });

  let styleName = 'Пользовательский стиль';
  let proseVoice = 'Сдержанный и выразительный голос.';
  let pacing = 'Сбаланрованный темп с акцентом на ключевых моментах.';
  let vocabulary = 'Живой язык с характерными авторскими метафорами.';
  let visualAesthetic = 'Высококонтрастная монохромная графика с точечными алыми акцентами.';
  let customGuidelines = '';

  const lines = reply.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^название стиля/i.test(line)) {
      styleName = line.replace(/^название стиля:?\s*/i, '').replace(/["«»]/g, '').trim();
    } else if (/^голос прозы/i.test(line)) {
      proseVoice = line.replace(/^голос прозы:?\s*/i, '').trim();
    } else if (/^(ритм и темп|темп|ритм)/i.test(line)) {
      pacing = line.replace(/^(ритм и темп|темп|ритм):?\s*/i, '').trim();
    } else if (/^словарный состав/i.test(line)) {
      vocabulary = line.replace(/^словарный состав:?\s*/i, '').trim();
    } else if (/^визуальная эстетика/i.test(line)) {
      visualAesthetic = line.replace(/^визуальная эстетика:?\s*/i, '').trim();
    } else if (/^правила для ии/i.test(line)) {
      customGuidelines = line.replace(/^правила для ии:?\s*/i, '').trim();
    }
  }

  return {
    styleName,
    proseVoice,
    pacing,
    vocabulary,
    visualAesthetic,
    customGuidelines,
  };
}
