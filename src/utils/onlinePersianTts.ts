import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { audioBufferToMp3 } from './neuralPersianTts';
import type { CharacterId, ToneId } from '../types';
import type { NeuralAudioResult, SynthesisProgress } from './neuralPersianTts';

const GEMINI_TTS_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_TTS_MODEL = 'gemini-3.8-flash-lite-tts';
const MAX_TEXT_CHARS = 3500;

const VOICE_BY_CHARACTER: Record<CharacterId, string> = {
  female: 'Kore',
  male: 'Charon',
  child: 'Leda',
  narrator: 'Rasalgethi',
};

const STYLE_BY_TONE: Record<ToneId, string> = {
  cheerful: 'Speak in natural Iranian Persian (Farsi), warmly cheerful, lively and smiling, with expressive but clear intonation.',
  intimate: 'Speak in natural Iranian Persian (Farsi), warmly intimate, gentle, close and friendly, with soft measured pacing.',
  sad: 'Speak in natural Iranian Persian (Farsi), subdued, heartfelt and sad, with restrained emotion and deliberate pauses. Do not overact.',
  formal: 'Speak in natural Iranian Persian (Farsi), formal, respectful, measured and clearly articulated.',
  professional: 'Speak in natural Iranian Persian (Farsi), polished, confident, composed and clear, as for a professional presentation.',
  newscast: 'Speak in natural Iranian Persian (Farsi) as a professional news presenter: neutral, credible, precise, even-paced, crisp consonants, no theatrical emotion.',
  epic: 'Speak in natural Iranian Persian (Farsi) as a cinematic narrator: resonant, dignified, powerful and deliberate, with dramatic but controlled pauses.',
};

function characterDirection(character: CharacterId): string {
  switch (character) {
    case 'female':
      return 'Use a clearly feminine adult voice.';
    case 'male':
      return 'Use a clearly masculine adult voice.';
    case 'child':
      return 'Use a youthful, childlike, bright voice; keep the words intelligible and avoid caricature.';
    case 'narrator':
      return 'Use a mature, deep, steady narrator voice with a storytelling presence.';
  }
}

function report(
  callback: ((progress: SynthesisProgress) => void) | undefined,
  completed: number,
  total: number,
  message: string,
) {
  callback?.({ completed, total, message });
}

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function findAudioData(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const steps = (payload as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return undefined;
  for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
    const step = steps[stepIndex] as { type?: unknown; content?: unknown };
    if (step.type !== 'model_output' || !Array.isArray(step.content)) continue;
    for (let contentIndex = step.content.length - 1; contentIndex >= 0; contentIndex -= 1) {
      const content = step.content[contentIndex] as { type?: unknown; data?: unknown };
      if (content.type === 'audio' && typeof content.data === 'string') return content.data;
    }
  }
  return undefined;
}

/**
 * Expressive Persian online TTS. The user supplies their own Google AI Studio
 * key in the app; no API key is bundled into the public APK or source code.
 */
export async function synthesizePersianOnlineAudio(
  text: string,
  character: CharacterId,
  tone: ToneId,
  speed = 1,
  apiKey = '',
  callback?: (progress: SynthesisProgress) => void,
): Promise<NeuralAudioResult> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('متنی برای خوانش وارد نشده است.');
  if (cleanText.length > MAX_TEXT_CHARS) {
    throw new Error(`برای خوانش آنلاین، متن را به بخش‌های حداکثر ${MAX_TEXT_CHARS} نویسه‌ای تقسیم کنید.`);
  }
  if (!apiKey.trim()) throw new Error('برای موتور آنلاین Gemini ابتدا کلید API را در برنامه ذخیره کنید.');

  report(callback, 0, 3, 'اتصال امن به موتور گفتار Gemini…');
  const speedDirection = speed < 0.9
    ? 'Speak slowly and distinctly.'
    : speed > 1.1
      ? 'Speak briskly but keep every word intelligible.'
      : 'Use a natural conversational pace.';
  const style = `${characterDirection(character)} ${STYLE_BY_TONE[tone]} ${speedDirection} Read the supplied Persian text faithfully. Do not translate, summarize, add words, or read these instructions aloud.`;

  const requestBody = {
    model: GEMINI_TTS_MODEL,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text: cleanText,
        annotations: [{ type: 'speech_metadata', style }],
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [{ voice: VOICE_BY_CHARACTER[character] }],
    },
  };

  let responseStatus = 0;
  let payload: Record<string, unknown> = {};
  try {
    if (Capacitor.isNativePlatform()) {
      // Use Android's native HTTP bridge to avoid WebView CORS/preflight failures.
      const nativeResponse = await CapacitorHttp.post({
        url: GEMINI_TTS_ENDPOINT,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim(),
        },
        data: requestBody,
        connectTimeout: 20000,
        readTimeout: 90000,
      });
      responseStatus = nativeResponse.status;
      const raw = nativeResponse.data;
      if (typeof raw === 'string') {
        try { payload = JSON.parse(raw) as Record<string, unknown>; }
        catch { payload = { message: raw }; }
      } else if (raw && typeof raw === 'object') {
        payload = raw as Record<string, unknown>;
      }
    } else {
      const response = await fetch(GEMINI_TTS_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey.trim(),
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(90000),
      });
      responseStatus = response.status;
      payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : '';
    throw new Error(
      detail
        ? `اتصال آنلاین برقرار نشد: ${detail.slice(0, 120)}`
        : 'اتصال آنلاین برقرار نشد؛ اینترنت، دسترسی API و محدودیت شبکه را بررسی کنید.',
    );
  }

  if (responseStatus < 200 || responseStatus >= 300) {
    const errorObject = payload.error as { message?: unknown } | undefined;
    const message = typeof errorObject?.message === 'string' ? errorObject.message : '';
    if (responseStatus === 401 || responseStatus === 403) {
      throw new Error('کلید Gemini نامعتبر است یا اجازهٔ استفاده از مدل گفتار را ندارد.');
    }
    if (responseStatus === 429) {
      throw new Error('سهمیهٔ Gemini فعلاً تمام شده است؛ بعداً دوباره تلاش کنید.');
    }
    throw new Error(message || `Gemini درخواست را نپذیرفت (${responseStatus}).`);
  }

  report(callback, 1, 3, 'تولید گفتار با لحن و شخصیت انتخاب‌شده…');
  const audioBase64 = findAudioData(payload);
  if (!audioBase64) throw new Error('پاسخ Gemini فایل صوتی قابل‌استفاده نداشت.');

  report(callback, 2, 3, 'آماده‌سازی فایل صوتی MP3…');
  const wavBytes = decodeBase64(audioBase64);
  const wavCopy = new Uint8Array(wavBytes.byteLength);
  wavCopy.set(wavBytes);
  const wavBlob = new Blob([wavCopy.buffer], { type: 'audio/wav' });
  const context = new OfflineAudioContext(1, 1, 24000);
  const decoded = await context.decodeAudioData(await wavBlob.arrayBuffer());
  const blob = await audioBufferToMp3(decoded);
  const audioUrl = URL.createObjectURL(blob);
  const duration = Number.isFinite(decoded.duration) ? decoded.duration : 0;

  report(callback, 3, 3, 'فایل صوتی Gemini آماده است.');
  return { blob, audioUrl, duration, mimeType: 'audio/mpeg' };
}
