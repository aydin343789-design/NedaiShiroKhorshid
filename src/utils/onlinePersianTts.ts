import { audioBufferToMp3 } from './neuralPersianTts';
import type { NeuralAudioResult, SynthesisProgress } from './neuralPersianTts';

/**
 * Free online Persian neural TTS using the public Ava Persian TTS Space.
 * No API key, paid API, or user-owned server is required.
 *
 * The provider is intentionally isolated here so it can be replaced without
 * touching the rest of the app if a better free Persian provider appears.
 */
const AVA_SPACE = 'https://xmanii-ava-persian-tts.hf.space';
const GENERATE_ENDPOINT = `${AVA_SPACE}/gradio_api/call/generate`;
const REQUEST_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
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

async function waitForGradioResult(eventId: string): Promise<unknown> {
  const response = await fetchWithTimeout(`${GENERATE_ENDPOINT}/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) {
    throw new Error(`سرویس آنلاین پاسخ مناسبی نداد (${response.status}).`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  let lastEvent = '';
  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value || new Uint8Array());

    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        lastEvent = line.slice(6).trim();
        continue;
      }
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;

      if (payload === '[DONE]') continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }

      if (Array.isArray(parsed) && parsed[0] === null) {
        throw new Error('سرویس آنلاین نتوانست متن را تولید کند.');
      }

      // Only resolve on Gradio's terminal event. This prevents heartbeat and
      // intermediate queue events from being mistaken for the finished audio.
      const serialized = JSON.stringify(parsed);
      if (lastEvent === 'complete' && (serialized.includes('path') || serialized.includes('url') || serialized.includes('data'))) {
        return parsed;
      }
      if (lastEvent === 'error') {
        const message = parsed && typeof parsed === 'object' && 'message' in parsed
          ? String((parsed as { message?: unknown }).message ?? '')
          : '';
        throw new Error(message || 'تولید صدای آنلاین با خطا متوقف شد.');
      }
    }

    if (done) break;
  }

  throw new Error('پاسخ صوتی سرویس آنلاین ناقص بود.');
}

function absoluteFileUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return `${AVA_SPACE}${value}`;
  return `${AVA_SPACE}/${value}`;
}

async function responseToBlob(result: unknown): Promise<Blob> {
  // Typical Gradio output: [{ path, url, meta }] or [{ path }].
  const candidate = Array.isArray(result) ? result[0] : result;
  if (candidate && typeof candidate === 'object') {
    const item = candidate as Record<string, unknown>;
    const url = typeof item.url === 'string' ? item.url : undefined;
    const path = typeof item.path === 'string' ? item.path : undefined;
    if (url || path) {
      const response = await fetch(absoluteFileUrl(url || path!));
      if (!response.ok) throw new Error('دریافت فایل صوتی آنلاین ناموفق بود.');
      return await response.blob();
    }
  }

  // Some Gradio versions may return a nested value.
  if (Array.isArray(candidate) && candidate.length >= 2 && typeof candidate[0] === 'number') {
    const sampleRate = candidate[0] as number;
    const samples = candidate[1] as number[];
    return float32ToWavBlob(samples, sampleRate);
  }

  throw new Error('فرمت خروجی صوتی سرویس آنلاین ناشناخته است.');
}

function float32ToWavBlob(samples: number[], sampleRate: number): Blob {
  const pcm = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, Number(samples[i]) || 0));
    pcm[i] = value < 0 ? value * 0x8000 : value * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const write = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + pcm.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, pcm.length * 2, true);
  new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Generate Persian speech online with Ava. Ava currently exposes one Persian
 * speaker; character selection is therefore deliberately not used to fake a
 * male/child voice. Offline mode remains available for those voices.
 */
export async function synthesizePersianOnlineAudio(
  text: string,
  speed = 1,
  callback?: (progress: SynthesisProgress) => void,
): Promise<NeuralAudioResult> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('متنی برای خوانش وارد نشده است.');

  report(callback, 0, 3, 'اتصال به موتور آنلاین فارسی…');

  const clampedSpeed = Math.max(0.5, Math.min(2.0, speed));
  let response: Response;
  try {
    response = await fetchWithTimeout(GENERATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [cleanText, clampedSpeed, true, 120] }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('زمان پاسخ موتور آنلاین تمام شد؛ لطفاً دوباره تلاش کنید یا حالت آفلاین را انتخاب کنید.');
    }
    throw new Error('اتصال به موتور آنلاین برقرار نشد؛ اینترنت یا وضعیت سرویس را بررسی کنید.');
  }

  if (!response.ok) {
    throw new Error(`سرویس آنلاین در دسترس نیست (${response.status}).`);
  }

  const { event_id: eventId } = (await response.json()) as { event_id?: string };
  if (!eventId) throw new Error('شناسهٔ تولید صوت آنلاین دریافت نشد.');

  report(callback, 1, 3, 'در حال ساخت صدای طبیعی با موتور آنلاین…');
  const result = await waitForGradioResult(eventId);
  report(callback, 2, 3, 'دریافت و آماده‌سازی فایل صوتی…');

  const rawBlob = await responseToBlob(result);
  const blob = rawBlob.type === 'audio/mpeg'
    ? rawBlob
    : await (async () => {
        const decoder = new OfflineAudioContext(1, 1, 24000);
        const audio = await decoder.decodeAudioData(await rawBlob.arrayBuffer());
        return await audioBufferToMp3(audio);
      })();
  const audioUrl = URL.createObjectURL(blob);
  let duration = 0;
  try {
    const audio = new Audio(audioUrl);
    await new Promise<void>((resolve) => {
      audio.onloadedmetadata = () => {
        duration = Number.isFinite(audio.duration) ? audio.duration : 0;
        resolve();
      };
      audio.onerror = () => resolve();
      window.setTimeout(resolve, 1500);
    });
  } catch {
    duration = 0;
  }

  report(callback, 3, 3, 'فایل صوتی آنلاین آماده است.');
  return {
    blob,
    audioUrl,
    duration,
    mimeType: 'audio/mpeg',
  };
}
