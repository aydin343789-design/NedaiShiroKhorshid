import { audioBufferToMp3 } from './neuralPersianTts';
import type { NeuralAudioResult, SynthesisProgress } from './neuralPersianTts';
import { normalizePersianText } from './persianNormalizer';

/** Free online Persian neural TTS using the public Ava Persian TTS Space. */
const AVA_SPACE = 'https://xmanii-ava-persian-tts.hf.space';
const GENERATE_ENDPOINT = `${AVA_SPACE}/gradio_api/call/generate`;
const REQUEST_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS = 3;
const MAX_TEXT_CHARS = 1800;
const AUDIO_CACHE = 'nedaye-shirokhorshid-tts-audio-v1';

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function requestWithRetry(input: RequestInfo | URL, init: RequestInit = {}) {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init);
      if (response.ok || !isRetryableStatus(response.status) || attempt === MAX_ATTEMPTS - 1) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS - 1) throw error;
    }
    await wait(700 * 2 ** attempt);
  }
  throw lastError instanceof Error ? lastError : new Error('درخواست آنلاین ناموفق بود.');
}

async function cacheKey(text: string, speed: number) {
  const source = `${text}\u0000${speed}`;
  if (globalThis.crypto?.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    return `https://cache.nedaye.local/${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
  }
  return `https://cache.nedaye.local/${encodeURIComponent(source).slice(0, 180)}`;
}

async function readAudioDuration(url: string): Promise<number> {
  try {
    const audio = new Audio(url);
    return await new Promise<number>((resolve) => {
      const finish = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
      audio.onloadedmetadata = finish;
      audio.onerror = () => resolve(0);
      window.setTimeout(finish, 1500);
    });
  } catch {
    return 0;
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
  const response = await requestWithRetry(`${GENERATE_ENDPOINT}/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
  });
  if (!response.ok || !response.body) throw new Error(`سرویس آنلاین پاسخ مناسبی نداد (${response.status}).`);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastEvent = '';
  while (true) {
    const { value, done } = await Promise.race([
      reader.read(),
      wait(REQUEST_TIMEOUT_MS).then(() => { throw new Error('زمان دریافت پاسخ صوتی آنلاین تمام شد.'); }),
    ]);
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
      if (!payload || payload === '[DONE]') continue;
      let parsed: unknown;
      try { parsed = JSON.parse(payload); } catch { continue; }
      if (Array.isArray(parsed) && parsed[0] === null) throw new Error('سرویس آنلاین نتوانست متن را تولید کند.');
      const serialized = JSON.stringify(parsed);
      if (lastEvent === 'complete' && (serialized.includes('path') || serialized.includes('url') || serialized.includes('data'))) return parsed;
      if (lastEvent === 'error') {
        const message = parsed && typeof parsed === 'object' && 'message' in parsed ? String((parsed as { message?: unknown }).message ?? '') : '';
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
  const candidate = Array.isArray(result) ? result[0] : result;
  if (candidate && typeof candidate === 'object') {
    const item = candidate as Record<string, unknown>;
    const url = typeof item.url === 'string' ? item.url : undefined;
    const path = typeof item.path === 'string' ? item.path : undefined;
    if (url || path) {
      const response = await requestWithRetry(absoluteFileUrl(url || path!), {});
      if (!response.ok) throw new Error('دریافت فایل صوتی آنلاین ناموفق بود.');
      return await response.blob();
    }
  }
  if (Array.isArray(candidate) && candidate.length >= 2 && typeof candidate[0] === 'number') {
    return float32ToWavBlob(candidate[1] as number[], candidate[0] as number);
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
  const write = (offset: number, value: string) => { for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i)); };
  write(0, 'RIFF'); view.setUint32(4, 36 + pcm.length * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, pcm.length * 2, true); new Uint8Array(buffer, 44).set(new Uint8Array(pcm.buffer));
  return new Blob([buffer], { type: 'audio/wav' });
}

function normalizeLoudnessInPlace(audio: AudioBuffer): void {
  let sumSquares = 0; let count = 0; let peak = 0;
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const data = audio.getChannelData(channel);
    for (const value of data) { sumSquares += value * value; count += 1; peak = Math.max(peak, Math.abs(value)); }
  }
  if (!count || peak < 1e-5) return;
  const gain = Math.min(0.92 / peak, Math.min(3.0, 0.12 / Math.max(Math.sqrt(sumSquares / count), 1e-5)));
  for (let channel = 0; channel < audio.numberOfChannels; channel += 1) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) data[i] *= gain;
  }
}

export async function synthesizePersianOnlineAudio(
  text: string,
  speed = 1,
  callback?: (progress: SynthesisProgress) => void,
): Promise<NeuralAudioResult> {
  const cleanText = normalizePersianText(text).trim();
  if (!cleanText) throw new Error('متنی برای خوانش وارد نشده است.');
  if (cleanText.length > MAX_TEXT_CHARS) throw new Error(`برای پایداری بهتر، متن آنلاین را به بخش‌های حداکثر ${MAX_TEXT_CHARS} نویسه‌ای تقسیم کنید.`);
  report(callback, 0, 3, 'اتصال به موتور آنلاین فارسی…');

  const clampedSpeed = Math.max(0.75, Math.min(1.25, speed));
  const key = await cacheKey(cleanText, clampedSpeed);
  const audioCache = await caches.open(AUDIO_CACHE);
  const cached = await audioCache.match(key);
  if (cached) {
    const cachedBlob = await cached.blob();
    const cachedUrl = URL.createObjectURL(cachedBlob);
    report(callback, 3, 3, 'فایل صوتی از حافظهٔ محلی آماده شد.');
    return { blob: cachedBlob, audioUrl: cachedUrl, duration: await readAudioDuration(cachedUrl), mimeType: 'audio/mpeg' };
  }

  let response: Response;
  try {
    response = await requestWithRetry(GENERATE_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [cleanText, clampedSpeed, true, 120] }),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new Error('زمان پاسخ موتور آنلاین تمام شد؛ حالت آفلاین فعال می‌شود.');
    throw new Error('اتصال به موتور آنلاین برقرار نشد؛ حالت آفلاین فعال می‌شود.');
  }
  if (!response.ok) throw new Error(`سرویس آنلاین در دسترس نیست (${response.status}).`);

  const { event_id: eventId } = (await response.json()) as { event_id?: string };
  if (!eventId) throw new Error('شناسهٔ تولید صوت آنلاین دریافت نشد.');
  report(callback, 1, 3, 'در حال ساخت صدای طبیعی با موتور آنلاین…');
  const result = await waitForGradioResult(eventId);
  report(callback, 2, 3, 'دریافت و آماده‌سازی فایل صوتی…');

  const rawBlob = await responseToBlob(result);
  const blob = rawBlob.type === 'audio/mpeg' ? rawBlob : await (async () => {
    const decoder = new OfflineAudioContext(1, 1, 24000);
    const audio = await decoder.decodeAudioData(await rawBlob.arrayBuffer());
    normalizeLoudnessInPlace(audio);
    return await audioBufferToMp3(audio);
  })();
  await audioCache.put(key, new Response(blob, { headers: { 'content-type': 'audio/mpeg' } }));
  const audioUrl = URL.createObjectURL(blob);
  const duration = await readAudioDuration(audioUrl);
  report(callback, 3, 3, 'فایل صوتی آنلاین آماده است.');
  return { blob, audioUrl, duration, mimeType: 'audio/mpeg' };
}
