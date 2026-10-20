import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { audioBufferToMp3, type NeuralAudioResult, type SynthesisProgress } from './neuralPersianTts';
import { MossOfflineTts } from './mossOfflineTts';

const SPACE = 'https://openmoss-team-moss-tts-nano.hf.space';
const MAX_TEXT_CHARS = 1800;
type FileData = { path: string; url?: string; orig_name?: string; mime_type?: string; meta?: { _type: string } };

function report(callback: ((progress: SynthesisProgress) => void) | undefined, completed: number, total: number, message: string) {
  callback?.({ completed, total, message });
}

async function postGradio(endpoint: string, data: unknown[], sessionHash: string): Promise<string> {
  const url = `${SPACE}/gradio_api/call/${endpoint}`;
  const body = { data, session_hash: sessionHash };
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.post({
      url,
      headers: { 'Content-Type': 'application/json' },
      data: body,
      connectTimeout: 25000,
      readTimeout: 90000,
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Space rejected request (${response.status}).`);
    const payload = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    if (!payload?.event_id) throw new Error('Space did not return a job id.');
    return String(payload.event_id);
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Space rejected request (${response.status}).`);
  const payload = await response.json() as { event_id?: string };
  if (!payload.event_id) throw new Error('Space did not return a job id.');
  return payload.event_id;
}

async function readGradioEvent(endpoint: string, eventId: string, sessionHash: string): Promise<unknown[]> {
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
    if (response.status < 200 || response.status >= 300) throw new Error(`Space job failed (${response.status}).`);
  } else {
    const response = await fetch(url, { headers: { Accept: 'text/event-stream' }, signal: AbortSignal.timeout(270000) });
    if (!response.ok) throw new Error(`Space job failed (${response.status}).`);
    raw = await response.text();
  }
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const eventName = block.match(/^event:\s*(.+)$/m)?.[1]?.trim();
    const dataLine = block.split(/\r?\n/).find((line) => line.startsWith('data:'));
    if (!dataLine) continue;
    const content = dataLine.slice(5).trim();
    if (eventName === 'error') throw new Error(content || 'Space failed to process the request.');
    if (eventName === 'complete') {
      try {
        const result = JSON.parse(content);
        if (Array.isArray(result)) return result;
      } catch { /* wait for a complete JSON data event */ }
    }
  }
  throw new Error('Space did not return a completed result. It may be sleeping, busy, or unavailable; please retry.');
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
  if (!file) throw new Error('MOSS Space did not return an audio file.');
  if (file.url) return file.url.startsWith('http') ? file.url : `${SPACE}${file.url}`;
  if (file.path) return `${SPACE}/gradio_api/file=${encodeURIComponent(file.path)}`;
  throw new Error('MOSS Space returned an invalid audio-file reference.');
}

/** Public MOSS Space online path; Persian demo-21 provides the preset Farsi reference speaker. */
export async function synthesizePersianOnlineAudio(
  text: string,
  _character: string,
  _tone: string,
  _speed = 1,
  callback?: (progress: SynthesisProgress) => void,
): Promise<NeuralAudioResult> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error('متنی برای خوانش وارد نشده است.');
  if (cleanText.length > MAX_TEXT_CHARS) throw new Error(`برای این آزمون آنلاین، متن را به حداکثر ${MAX_TEXT_CHARS} نویسه تقسیم کنید.`);
  const sessionHash = `nedaye-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    report(callback, 0, 3, 'اتصال به MOSS Space و بارگیری مرجع فارسی…');
    const selectId = await postGradio('apply_demo_case_selection', ['demo-21', null], sessionHash);
    const selection = await readGradioEvent('apply_demo_case_selection', selectId, sessionHash);
    const referenceAudio = selection[1] as FileData | undefined;
    if (!referenceAudio?.path && !referenceAudio?.url) throw new Error('صدای مرجع فارسی از Space دریافت نشد.');

    report(callback, 1, 3, 'ارسال متن به MOSS برای تولید گفتار…');
    const runId = await postGradio('run_inference', [
      cleanText,
      referenceAudio,
      selection[2] ?? null,
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
    ], sessionHash);
    const generated = await readGradioEvent('run_inference', runId, sessionHash);
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
      throw new Error(`اتصال به MOSS Space برقرار نشد: ${detail.slice(0, 110)}`);
    }
    throw new Error(detail);
  }
}
