import { uploadBlobToCloudWithProgress } from '../storage/clipboardImageUpload';
import { getPromptConfig, renderPrompt } from '../db/promptRepository';
import { generateProTalkTextWithUsage } from '../ai/protalkText';
import { checkSufficientBalance, recordAiUsage } from '../billing/transactionService';
import { calculateAiUsageCost, formatLettersCount } from '../billing/costCalculator';

export interface OcrRecognizeResult {
  imageUrl: string;
  recognizedText: string;
  suggestedTitle: string;
  lettersCharged: number;
}

/**
 * Uploads a photo/scan of handwritten or printed notes to Telegram cloud + file_storage
 * and invokes AI text recognition (OCR) via ProTalk prompt 'draft_ocr_extract'.
 */
export async function recognizeDraftImageOcr(params: {
  file: File | Blob;
  filename?: string;
  hint?: string;
  userUid?: number;
  onProgress?: (status: string, percent?: number) => void;
}): Promise<OcrRecognizeResult> {
  const { file, filename, hint = '', userUid, onProgress } = params;
  const safeName =
    filename || (file instanceof File ? file.name : `scan_${Date.now()}.jpg`);

  onProgress?.('Загрузка фото/скана в облачное хранилище...', 15);
  const uploaded = await uploadBlobToCloudWithProgress({
    blob: file,
    filename: safeName,
    userUid,
    folderName: 'Черновики и сканы',
    caption: `📄 Скан черновика для OCR KnigAI: ${safeName}`,
    onProgress: (pct) => onProgress?.(`Загрузка скана в облако (${pct}%)...`, Math.min(50, Math.round(pct * 0.5))),
  });

  const cfg = await getPromptConfig('draft_ocr_extract');
  const prompt = renderPrompt(
    cfg.template,
    {
      image_url: uploaded.url,
      hint: hint.trim() || 'Распознай рукописный или печатный русский текст на изображении максимально точно.',
    },
    cfg.system_instruction
  );

  const est = calculateAiUsageCost({
    inputChars: prompt.length + 450,
    outputChars: 2400,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
  });

  if (userUid) {
    const check = await checkSufficientBalance(userUid, est.totalLetters);
    if (!check.ok) {
      throw new Error(
        `Недостаточно букв для распознавания фото. Требуется ≈ ${formatLettersCount(est.totalLetters)} букв.`
      );
    }
  }

  onProgress?.('ИИ распознаёт текст со скана...', 65);
  const aiRes = await generateProTalkTextWithUsage(
    prompt,
    (msg) => onProgress?.(msg, 80),
    90,
    userUid,
    `knigai_ocr_${userUid || 'anon'}_${Date.now()}`
  );

  const usage = await recordAiUsage({
    userUid,
    promptKey: cfg.key,
    inputChars: prompt.length,
    outputChars: aiRes.text.length,
    inputMultiplier: cfg.input_cost_multiplier,
    outputMultiplier: cfg.output_cost_multiplier,
    exactTokens: aiRes.tokensTotal,
    tokensIn: aiRes.tokensIn,
    tokensOut: aiRes.tokensOut,
    description: `OCR распознавание скана черновика «${safeName}»`,
    alertLink: 'constructor',
  });

  const cleanText = aiRes.text.replace(/^```[\w]*\n?|```$/g, '').trim();
  const firstLine = cleanText.split('\n').find((l) => l.trim().length > 2)?.trim() || '';
  const suggestedTitle =
    firstLine.slice(0, 64).replace(/^#+\s*/, '') ||
    safeName.replace(/\.[^/.]+$/, '');

  onProgress?.('Текст успешно распознан!', 100);

  return {
    imageUrl: uploaded.url,
    recognizedText: cleanText,
    suggestedTitle,
    lettersCharged: usage.costLetters,
  };
}
