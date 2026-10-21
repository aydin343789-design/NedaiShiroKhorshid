import type { CharacterId, ToneId } from '../types';
import {
  checkPiperSupport,
  downloadPiperVoice,
  piperSynthesize,
  storedPiperVoices,
  warmRuntimeCache,
} from './piper/engine';
import { OFFLINE_TONE_PARAMS, PIPER_VOICES, piperByCharacter, voiceById } from './piper/voices';
import { humanizeForSpeech } from './piper/text';
import { shapePitchToWav } from './piper/wav';
import { audioBufferToMp3 } from './audioOutput';

export interface VoicePackProgress {
  stage: 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
  completed: number;
  total: number;
  message: string;
  error?: string;
}

export interface OfflineAudioResult {
  blob: Blob;
  audioUrl: string;
  duration: number;
  mimeType: 'audio/mpeg';
}

const toneMap: Record<ToneId, 'happy' | 'friendly' | 'news' | 'story' | 'emotional'> = {
  cheerful: 'happy',
  intimate: 'friendly',
  sad: 'emotional',
  formal: 'news',
  professional: 'friendly',
  newscast: 'news',
  epic: 'story',
};

export async function checkPiperVoice(character: CharacterId): Promise<boolean> {
  const support = checkPiperSupport();
  if (!support.ok) return false;
  const voice = piperByCharacter(character);
  const stored = await storedPiperVoices(PIPER_VOICES);
  return stored.has(voice.piperId);
}

export async function preparePiperVoice(
  character: CharacterId,
  callback?: (progress: VoicePackProgress) => void,
): Promise<void> {
  const report = (progress: VoicePackProgress) => callback?.(progress);
  report({ stage: 'checking', completed: 0, total: 100, message: 'بررسی صدای Piper…' });
  if (!checkPiperSupport().ok) {
    const message = 'این دستگاه از ذخیره‌سازی امن موردنیاز موتور آفلاین پشتیبانی نمی‌کند.';
    report({ stage: 'error', completed: 0, total: 100, message, error: message });
    throw new Error(message);
  }
  const voice = piperByCharacter(character);
  const stored = await storedPiperVoices(PIPER_VOICES);
  if (!stored.has(voice.piperId)) {
    try {
      report({ stage: 'downloading', completed: 0, total: 100, message: `دریافت صدای ${voiceById(character).name} (حدود ${voice.sizeMB} مگابایت)…` });
      await downloadPiperVoice(voice, (percent) => {
        report({ stage: 'downloading', completed: Math.min(99, percent), total: 100, message: `دریافت صدای ${voiceById(character).name}…` });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'دانلود صدای آفلاین ناموفق بود.';
      report({ stage: 'error', completed: 0, total: 100, message, error: message });
      throw error;
    }
  }
  await warmRuntimeCache();
  report({ stage: 'ready', completed: 100, total: 100, message: `صدای ${voiceById(character).name} آماده است.` });
}

export async function synthesizePiperOfflineAudio(
  text: string,
  character: CharacterId,
  tone: ToneId,
  callback?: (progress: { completed: number; total: number; message: string }) => void,
): Promise<OfflineAudioResult> {
  if (!text.trim()) throw new Error('متنی برای خوانش وارد نشده است.');
  const voice = piperByCharacter(character);
  const stored = await storedPiperVoices(PIPER_VOICES);
  if (!stored.has(voice.piperId)) throw new Error(`ابتدا صدای آفلاین ${voiceById(character).name} را دانلود کنید.`);
  callback?.({ completed: 0, total: 3, message: 'آماده‌سازی متن گفتار…' });
  const selectedTone = toneMap[tone];
  const toneParams = OFFLINE_TONE_PARAMS[selectedTone];
  const { samples, sampleRate } = await piperSynthesize(humanizeForSpeech(text), voice, {
    lengthScaleFactor: toneParams.lengthScale,
    onChunk: (done, total) => callback?.({
      completed: Math.max(1, Math.round((done / total) * 2)),
      total: 3,
      message: total > 1 ? `ساخت صدا روی دستگاه… بخش ${done} از ${total}` : 'ساخت صدا روی دستگاه…',
    }),
  });
  callback?.({ completed: 2, total: 3, message: 'آماده‌سازی خروجی صوتی…' });
  const { blob: wavBlob, durationSec } = await shapePitchToWav(samples, sampleRate, voice.pitchRate * toneParams.pitchRate);
  const context = new OfflineAudioContext(1, 1, sampleRate);
  const decoded = await context.decodeAudioData(await wavBlob.arrayBuffer());
  const blob = await audioBufferToMp3(decoded);
  callback?.({ completed: 3, total: 3, message: 'فایل صوتی آماده شد.' });
  return { blob, audioUrl: URL.createObjectURL(blob), duration: durationSec, mimeType: 'audio/mpeg' };
}
