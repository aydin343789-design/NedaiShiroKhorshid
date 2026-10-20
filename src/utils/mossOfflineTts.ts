import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { SentencePieceProcessor } from '@sctg/sentencepiece-js';
import type { CharacterId, LanguageId } from '../types';
import { audioBufferToMp3, type NeuralAudioResult, type VoicePackProgress } from './neuralPersianTts';

interface MossProgressEvent { completed: number; total: number; message: string }
interface MossOfflineTtsPlugin {
  checkModels(): Promise<{ ready: boolean; missing: string[] }>;
  prepareModels(): Promise<{ ready: boolean }>;
  getTokenizerModel(): Promise<{ base64: string }>;
  synthesize(options: { textTokenIds: number[]; voice: string; maxFrames: number }): Promise<{ wavBase64: string; durationMs: number; elapsedMs: number; sampleRate: number }>;
  downloadAudio(options: { url: string }): Promise<{ base64: string }>;
  addListener(eventName: 'mossProgress', listener: (event: MossProgressEvent) => void): Promise<PluginListenerHandle>;
}

export const MossOfflineTts = registerPlugin<MossOfflineTtsPlugin>('MossOfflineTts');
let tokenizer: SentencePieceProcessor | null = null;
let tokenizerPromise: Promise<SentencePieceProcessor> | null = null;
let preparationPromise: Promise<void> | null = null;
const voiceByCharacter: Record<CharacterId, string> = {
  female: 'Bella',
  male: 'Adam',
  child: 'Xiaoyu',
  narrator: 'Weiguo',
};

export function prepareMossOfflineVoicePack(
  callback?: (progress: VoicePackProgress) => void,
): Promise<void> {
  if (preparationPromise) return preparationPromise;
  preparationPromise = prepareMossOfflineVoicePackOnce(callback);
  return preparationPromise.finally(() => { preparationPromise = null; });
}

async function prepareMossOfflineVoicePackOnce(
  callback?: (progress: VoicePackProgress) => void,
): Promise<void> {
  const report = (stage: VoicePackProgress['stage'], completed: number, total: number, message: string, error?: string) =>
    callback?.({ stage, completed, total, message, error });
  if (!Capacitor.isNativePlatform()) {
    const error = 'اجرای آفلاین MOSS فقط در APK آزمایشی Android فعال است.';
    report('error', 0, 1, error, error);
    throw new Error(error);
  }
  report('checking', 0, 1, 'بررسی مدل‌های MOSS…');
  try {
    const status = await MossOfflineTts.checkModels();
    if (!status.ready) {
      const listener = await MossOfflineTts.addListener('mossProgress', (event) => {
        report('downloading', event.completed, Math.max(event.total, 1), event.message);
      });
      try {
        report('downloading', 0, 11, 'دریافت مدل آفلاین…');
        await MossOfflineTts.prepareModels();
      } finally {
        await listener.remove();
      }
    }
    await loadTokenizer();
    report('ready', 1, 1, 'مدل آفلاین MOSS آماده است.');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'بارگیری مدل MOSS ناموفق بود.';
    report('error', 0, 1, message, message);
    throw error;
  }
}

async function loadTokenizer(): Promise<SentencePieceProcessor> {
  if (tokenizer) return tokenizer;
  if (tokenizerPromise) return tokenizerPromise;
  tokenizerPromise = (async () => {
    const model = await MossOfflineTts.getTokenizerModel();
    const instance = new SentencePieceProcessor();
    await instance.loadFromB64StringModel(model.base64);
    tokenizer = instance;
    return instance;
  })();
  try { return await tokenizerPromise; } finally { tokenizerPromise = null; }
}

export async function synthesizeMossOfflineAudio(
  text: string,
  character: CharacterId,
  language: LanguageId,
  callback?: (progress: { completed: number; total: number; message: string }) => void,
): Promise<NeuralAudioResult> {
  if (!Capacitor.isNativePlatform()) throw new Error('موتور آفلاین MOSS فقط در APK آزمایشی Android قابل اجراست.');
  const cleanText = normalizeMossText(text, language);
  if (!cleanText) throw new Error('متنی برای خوانش وارد نشده است.');
  callback?.({ completed: 0, total: 3, message: language === 'fa' ? 'آماده‌سازی متن فارسی…' : 'Preparing English text…' });
  const processor = await loadTokenizer();
  const tokenIds = Array.from(processor.encodeIds(cleanText));
  if (tokenIds.length === 0) throw new Error(language === 'fa' ? 'متن فارسی به token تبدیل نشد.' : 'Text could not be tokenized.');
  if (tokenIds.length > 100) throw new Error(language === 'fa'
    ? `متن آفلاین MOSS در این نمونه حداکثر ۱۰۰ token باشد (اکنون ${tokenIds.length} token).`
    : `Offline MOSS is limited to 100 tokens here (currently ${tokenIds.length}).`);
  callback?.({ completed: 1, total: 3, message: `تولید ONNX روی گوشی (${tokenIds.length} token)…` });
  const result = await MossOfflineTts.synthesize({
    textTokenIds: tokenIds,
    voice: voiceByCharacter[character],
    maxFrames: 300,
  });
  callback?.({ completed: 2, total: 3, message: 'تبدیل صدای MOSS به MP3…' });
  const raw = atob(result.wavBase64);
  const wavBytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) wavBytes[index] = raw.charCodeAt(index);
  const wavCopy = new Uint8Array(wavBytes.length);
  wavCopy.set(wavBytes);
  const wav = new Blob([wavCopy.buffer], { type: 'audio/wav' });
  const context = new OfflineAudioContext(1, 1, result.sampleRate || 48000);
  const decoded = await context.decodeAudioData(await wav.arrayBuffer());
  const blob = await audioBufferToMp3(decoded);
  callback?.({ completed: 3, total: 3, message: `MOSS آفلاین آماده شد (${(result.elapsedMs / 1000).toFixed(1)} ثانیه پردازش).` });
  return { blob, audioUrl: URL.createObjectURL(blob), duration: decoded.duration, mimeType: 'audio/mpeg' };
}

function normalizeMossText(text: string, language: LanguageId): string {
  const normalized = text.normalize('NFC').replace(/[\t\r\n]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  if (language === 'en') return normalized.replace(/\s+([,.;:!?])/g, '$1').replace(/([,.;:!?])(?=\S)/g, '$1 ');
  return normalized
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/ـ/g, '')
    .replace(/[٠-٩]/g, (digit) => String.fromCharCode(digit.charCodeAt(0) + 0x0090))
    .replace(/\s+([،؛؟!,.])/g, '$1')
    .replace(/([،؛؟!,.])(?=\S)/g, '$1 ');
}
