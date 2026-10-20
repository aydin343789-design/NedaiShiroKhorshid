import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { audioBufferToMp3, type NeuralAudioResult, type SynthesisProgress } from './neuralPersianTts';
import { MossOfflineTts } from './mossOfflineTts';
import type { LanguageId } from '../types';

const SPACE = 'https://openmoss-team-moss-tts-nano.hf.space';
const MAX_TEXT_CHARS = 1800;
type FileData = { path: string; url?: string; orig_name?: string; mime_type?: string; meta?: { _type: string } };

function report(callback: ((progress: SynthesisProgress) => void) | undefined, completed: number, total: number, message: string) {
  callback?.({ completed, total, message });
}

async function postGradio(endpoint: string, data: unknown[]): Promise<string> {
  const url = `${SPACE}/gradio_api/call/${endpoint}`;
  // Gradio creates and tracks its own queue session. Supplying a custom session_hash
  // makes the public Space return a 404 for the resulting event stream.
  const body = { data };
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers: { 'Content-Type': 'application/json' },
      data: body,
      connectTimeout: 25000,
      readTimeout: 90000,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`درخواست موتور آنلاین ناموفق بود (${response.status}).`);
    const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (!payload?.event_id) throw new Error('موتور آنلاین درخواست را نپذیرفت.');
    return String(payload.event_id);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`درخواست موتور آنلاین ناموفق بود (${response.status}).`);
  const payload = await response.json() as { event_id?: string };
  if (!payload.event_id) throw new Error('موتور آنلاین درخواست را نپذیرفت.');
  return payload.event_id;
}

async function readGradioEvent(endpoint: string, eventId: string): Promise<unknown[]> {
  const url = `${SPACE}/gradio_api/call/${endpoint}/${encodeURIComponent(eventId)}`;
  let raw: string;
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url,
      headers: { Accept: 'text/event-stream' },
      connectTimeout: 25000,
      readTimeout: 270000,
    });
    raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    if (response.status < 200 || response.status >= 300) throw new Error(`دریافت پاسخ موتور آنلاین ناموفق بود (${response.status}).`);
  } else {
    const response = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: AbortSignal.timeout(270000) });
    if (!response.ok) throw new Error(`دریافت پاسخ موتور آنلاین ناموفق بود (${response.status}).`);
    raw = await response.text();
  }
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const dataLine = block.split(/\r?\n/).find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const content = dataLine.slice(5).trim();
    if (eventName === 'error') {
      if (!content || content === 'null') {
        throw new Error('موتور آنلاین این درخواست را کامل نکرد؛ کمی بعد دوباره تلاش کنید.');
      }
      throw new Error(content);
    }
    if (eventName === 'complete') {
      try {
        const result = JSON.parse(content);
        if (Array.isArray(result)) return result;
      } catch { /* wait for a complete JSON data event */ }
    }
  }
  throw new Error('پاسخ کامل از موتور آنلاین دریافت نشد؛ کمی بعد دوباره تلاش کنید.');
}

async function downloadWave(url: string): Promise<Blob> {
  let bytes: Uint8Array;
  if (Capacitor.isNativePlatform()) {
    const result = await MossOfflineTts.downloadAudio({ url });
    const raw = atob(result.base64);
    bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  } else {
    const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`Could not download generated audio (${response.status}).`);
    bytes = new Uint8Array(await response.arrayBuffer());
  }
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type: 'audio/wav' });
}

function fileUrl(file: FileData | undefined): string {
  if (!file) throw new Error('موتور آنلاین فایل صوتی برنگرداند.');
  if (file.url) return file.url.startsWith('http') ? file.url : `${SPACE}${file.url}`;
  if (file.path) return `${SPACE}/gradio_api/file=${encodeURIComponent(file.path)}`;
  throw new Error('نشانی فایل صوتی نامعتبر است.');
}

/** Online MOSS path; the demo endpoints select language-matched test text and its reference audio. */
export async function synthesizePersianOnlineAudio(
  text: string,
  language: LanguageId,
  callback?: (progress: SynthesisProgress) => void,
): Promise<NeuralAudioResult> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('متنی برای خوانش وارد نشده است.');
  if (cleanText.length > MAX_TEXT_CHARS) throw new Error(`برای این آزمون آنلاین، متن را به حداکثر ${MAX_TEXT_CHARS} نویسه تقسیم کنید.`);
  try {
    report(callback, 0, 3, language === 'fa' ? 'آماده‌سازی صدای فارسی…' : 'Preparing English voice…');
    const demoId = language === 'fa' ? 'demo-21' : 'demo-9';
    const selectId = await postGradio('apply_demo_case_selection', [demoId, null]);
    const selection = await readGradioEvent('apply_demo_case_selection', selectId);
    const referenceAudio = selection[1] as FileData | undefined;
    if (!referenceAudio?.path && !referenceAudio?.url) throw new Error('صدای مرجع انتخاب‌شده دریافت نشد.');

    report(callback, 1, 3, language === 'fa' ? 'تولید گفتار فارسی…' : 'Generating English speech…');
    const runId = await postGradio('run_inference', [
      cleanText,
      referenceAudio,
      true,
      true,
      300,
      75,
      true,
      1.0,
      1.0,
      50,
      0.8,
      0.95,
      25,
      1.2,
      0,
    ]);
    const generated = await readGradioEvent('run_inference', runId);
    const audioFile = generated[0] as FileData | undefined;
    report(callback, 2, 3, 'دریافت خروجی WAV و آماده‌سازی MP3…');
    const wavBlob = await downloadWave(fileUrl(audioFile));
    const context = new OfflineAudioContext(1, 1, 24000);
    const decoded = await context.decodeAudioData(await wavBlob.arrayBuffer());
    const blob = await audioBufferToMp3(decoded);
    report(callback, 3, 3, 'گفتار MOSS آماده شد.');
    return { blob, audioUrl: URL.createObjectURL(blob), duration: decoded.duration, mimeType: 'audio/mpeg' };
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'خطای ناشناخته';
    if (/failed to fetch|network|timeout|connection/i.test(detail)) {
      throw new Error(`اتصال به موتور آنلاین برقرار نشد: ${detail.slice(0, 110)}`);
    }
    throw new Error(detail);
  }
}
