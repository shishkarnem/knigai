import { getCurrentUser } from '../auth/authService';
import { AI_LOG_CREATED_EVENT } from '../ai/aiLogsService';
import { generateProTalkTextWithUsage } from '../ai/protalkText';
import { getPromptConfig, renderPrompt } from '../db/promptRepository';
import { checkSufficientBalance, recordAiUsage } from '../billing/transactionService';
import { estimateTextOperationLetters } from '../billing/costCalculator';
import { callProTalkDecision } from '../ai/decision/protalkDecision';

export interface VoiceSttResult {
  success: boolean;
  text: string;
  fileUrl: string;
  shortUrl: string;
  fileId: number | null;
  transcriptionId: number | null;
  durationSec: number;
}

export function pickSupportedAudioMime(): string {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return 'audio/webm';
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const mime of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) {
        return mime;
      }
    } catch {
      // ignore unsupported query
    }
  }
  return '';
}

export function getExtensionFromMime(mime: string): string {
  const lower = (mime || '').toLowerCase();
  if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
  if (lower.includes('ogg')) return 'ogg';
  if (lower.includes('wav')) return 'wav';
  if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
  return 'webm';
}

export async function transcribeVoiceBlob(params: {
  blob: Blob;
  durationSec: number;
  fieldContext?: string;
  userUid?: number;
}): Promise<VoiceSttResult> {
  const effectiveUid = params.userUid ?? getCurrentUser()?.uid ?? 10000000001;
  const mimeType = params.blob.type || pickSupportedAudioMime() || 'audio/webm';
  const ext = getExtensionFromMime(mimeType);

  const formData = new FormData();
  formData.append('audio', params.blob, `voice_message.${ext}`);
  formData.append('mime_type', mimeType);
  formData.append('user_uid', String(effectiveUid));
  formData.append('duration_sec', String(Number(params.durationSec.toFixed(1))));
  formData.append('field_context', params.fieldContext || 'text_field');

  const res = await fetch('/api/voice/stt', {
    method: 'POST',
    body: formData,
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    text?: string;
    file_url?: string;
    short_url?: string;
    file_id?: number | null;
    transcription_id?: number | null;
    duration_sec?: number;
    error?: string;
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AI_LOG_CREATED_EVENT));
  }

  if (!res.ok || !data.success) {
    throw new Error(data.error || `Ошибка распознавания речи (${res.status})`);
  }

  return {
    success: true,
    text: String(data.text || '').trim(),
    fileUrl: String(data.file_url || ''),
    shortUrl: String(data.short_url || data.file_url || ''),
    fileId: data.file_id ?? null,
    transcriptionId: data.transcription_id ?? null,
    durationSec: Number(data.duration_sec ?? params.durationSec) || params.durationSec,
  };
}

/**
 * Optional ProTalk LLM punctuation & paragraph restoration for dictated text.
 * Bills strictly 1 AI token = 1 Letter (while basic STT above is 100% free).
 */
export async function polishVoiceTextWithAi(params: {
  rawText: string;
  fieldContext?: string;
  userUid?: number;
}): Promise<{ text: string; costLetters: number }> {
  const cleanRaw = params.rawText.trim();
  if (!cleanRaw) {
    throw new Error('Нет текста для литературной корректуры.');
  }

  const effectiveUid = params.userUid ?? getCurrentUser()?.uid;

  // Quick 763 gate (~typesafe/jev-latest 0.25x): skip full LLM pass if punctuation & formatting already look clean
  if (cleanRaw.length >= 20) {
    try {
      const checkRes = await callProTalkDecision({
        text: cleanRaw,
        instruction:
          'Проверь текст голосовой диктовки: есть ли в нём пропущенные знаки препинания, слова-паразиты или ошибки оформления, требующие корректуры?',
        options: 'true::Да, нужна корректура пунктуации и текста;;false::Нет, текст уже грамотно оформлен',
        decisionType: 'noul',
        aiModel: '~typesafe/jev-latest',
        userUid: effectiveUid,
        promptKey: 'voice_punctuation_editor',
        operationDescription: `Проверка диктовки 763 (${params.fieldContext || 'текст'})`,
        alertLink: 'profile',
      });
      if (!checkRes.boolResult && checkRes.probability <= 0.4) {
        return {
          text: cleanRaw,
          costLetters: checkRes.costLetters,
        };
      }
    } catch {
      // fallback to full LLM editing if 763 pre-check fails
    }
  }

  const cfg = await getPromptConfig('voice_punctuation_editor');
  const fullPrompt = renderPrompt(
    cfg.template,
    {
      raw_text: cleanRaw,
      field_context: params.fieldContext || 'текстовое поле',
    },
    cfg.system_instruction
  );

  const estimatedLetters = estimateTextOperationLetters(
    fullPrompt.length,
    cleanRaw.length,
    cfg.input_cost_multiplier ?? 1.0,
    cfg.output_cost_multiplier ?? 1.0
  );

  const balCheck = await checkSufficientBalance(effectiveUid, estimatedLetters);
  if (!balCheck.ok) {
    throw new Error(
      `Недостаточно букв для ИИ-корректуры: требуется ~${estimatedLetters}, доступно ${balCheck.currentBalance}.`
    );
  }

  const result = await generateProTalkTextWithUsage(fullPrompt, undefined, 45, effectiveUid);
  const polished = (result.text || '').trim() || cleanRaw;

  const usage = await recordAiUsage({
    userUid: effectiveUid,
    promptKey: 'voice_punctuation_editor',
    inputChars: fullPrompt.length,
    outputChars: polished.length,
    inputMultiplier: cfg.input_cost_multiplier ?? 1.0,
    outputMultiplier: cfg.output_cost_multiplier ?? 1.0,
    exactTokens: result.tokensTotal,
    tokensIn: result.tokensIn,
    tokensOut: result.tokensOut,
    operationType: 'ai_generation',
    description: `ИИ-пунктуация голосовой диктовки (${params.fieldContext || 'текст'})`,
  });

  return {
    text: polished,
    costLetters: usage.costLetters,
  };
}
