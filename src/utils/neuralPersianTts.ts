import * as ort from 'onnxruntime-web';
import { createPiperPhonemize } from '../vendor/piperPhonemize.js';
import type { CharacterId, ToneId } from '../types';

/**
 * Fully client-side Persian neural speech engine.
 *
 * The neural models are downloaded once, stored in Cache Storage, and then read
 * locally on every subsequent launch. No text or audio is sent to a server.
 */

const MODEL_CACHE = 'nedaye-shirokhorshid-piper-v1';
const PIPER_WASM_PATH = '/runtime/piper/piper_phonemize.wasm';
const PIPER_DATA_PATH = '/runtime/piper/piper_phonemize.data';

const ORT_WASM_PATHS = {
  'ort-wasm-simd.wasm': '/runtime/ort/ort-wasm-simd.wasm',
  'ort-wasm.wasm': '/runtime/ort/ort-wasm.wasm',
};

type VoiceModelId = 'mana' | 'amir' | 'gyro' | 'ganji';

interface ModelSource {
  id: VoiceModelId;
  label: string;
  modelUrl: string;
  configUrl: string;
}

/**
 * The three models intentionally use different speakers. Child and narrator are
 * rendered from their own neural source plus restrained timbre processing; this
 * avoids the old oscillator/browser-speech fallback that made every voice alike.
 */
const VOICE_MODELS: Record<VoiceModelId, ModelSource> = {
  mana: {
    id: 'mana',
    label: 'مانا',
    modelUrl:
      'https://huggingface.co/MahtaFetrat/Mana-Persian-Piper/resolve/main/fa_IR-mana-medium.onnx',
    configUrl:
      'https://huggingface.co/MahtaFetrat/Mana-Persian-Piper/resolve/main/fa_IR-mana-medium.onnx.json',
  },
  amir: {
    id: 'amir',
    label: 'امیر فارسی',
    modelUrl:
      'https://huggingface.co/SadeghK/persian-text-to-speech/resolve/main/farsi/amir/epoch=5261-step=2455712.onnx',
    configUrl:
      'https://huggingface.co/SadeghK/persian-text-to-speech/resolve/main/farsi/amir/epoch=5261-step=2455712.onnx.json',
  },
  gyro: {
    id: 'gyro',
    label: 'گیرو',
    modelUrl:
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx',
    configUrl:
      'https://huggingface.co/diffusionstudio/piper-voices/resolve/main/fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx.json',
  },
  ganji: {
    id: 'ganji',
    label: 'گنجی فارسی',
    modelUrl:
      'https://huggingface.co/SadeghK/persian-text-to-speech/resolve/main/farsi/ganji/epoch=5719-step=2609600-ganji.onnx',
    configUrl:
      'https://huggingface.co/SadeghK/persian-text-to-speech/resolve/main/farsi/ganji/epoch=5719-step=2609600-ganji.onnx.json',
  },
};

interface PiperConfig {
  audio: { sample_rate: number };
  espeak: { voice: string };
  inference: {
    noise_scale: number;
    length_scale: number;
    noise_w: number;
  };
  speaker_id_map?: Record<string, number>;
}

interface CharacterProfile {
  model: VoiceModelId;
  /** Used by Piper for natural pacing. */
  speechRate: number;
  /** Small pitch movement after inference, in semitones. */
  semitones: number;
  lowShelfDb: number;
  highShelfDb: number;
}

const CHARACTER_PROFILES: Record<CharacterId, CharacterProfile> = {
  female: {
    // Mana is the approved Iranian timbre from sample 3; keep its pitch
    // natural instead of forcing the brighter, less convincing Gyro voice.
    model: 'mana',
    speechRate: 0.78,
    semitones: 0.8,
    lowShelfDb: 0.2,
    highShelfDb: 1.8,
  },
  male: {
    model: 'gyro',
    speechRate: 0.84,
    semitones: -0.6,
    lowShelfDb: 1.4,
    highShelfDb: -0.5,
  },
  child: {
    // Ganji gives the child a separate neural source rather than turning the
    // approved adult Mana sample into a thin/high-pitched imitation.
    model: 'ganji',
    speechRate: 0.72,
    semitones: 1.25,
    lowShelfDb: -0.8,
    highShelfDb: 2.4,
  },
  narrator: {
    model: 'gyro',
    speechRate: 0.68,
    semitones: -1.6,
    lowShelfDb: 1.5,
    highShelfDb: -0.5,
  },
};

interface ToneProfile {
  inferenceRate: number;
  noiseScale: number;
  noiseWidth: number;
  semitones: number;
  lowShelfDb: number;
  highShelfDb: number;
  reverbMix: number;
  pauseMs: number;
  breathMs: number;
}

/**
 * Piper has no emotion label. These profiles drive its inference scales,
 * cadence, pitch range and spectral colour so each tone is audibly distinct
 * while preserving intelligibility.
 */
const TONE_PROFILES: Record<ToneId, ToneProfile> = {
  cheerful: {
    inferenceRate: 0.82,
    noiseScale: 1.12,
    noiseWidth: 1.08,
    semitones: 2.0,
    lowShelfDb: -1.0,
    highShelfDb: 3.0,
    reverbMix: 0,
    pauseMs: 220,
    breathMs: 80,
  },
  intimate: {
    inferenceRate: 0.72,
    noiseScale: 0.76,
    noiseWidth: 0.70,
    semitones: -1.0,
    lowShelfDb: 2.0,
    highShelfDb: -1.8,
    reverbMix: 0.015,
    pauseMs: 360,
    breathMs: 130,
  },
  sad: {
    inferenceRate: 0.62,
    noiseScale: 0.60,
    noiseWidth: 0.54,
    semitones: -2.5,
    lowShelfDb: 2.4,
    highShelfDb: -3.6,
    reverbMix: 0.025,
    pauseMs: 520,
    breathMs: 180,
  },
  formal: {
    inferenceRate: 0.74,
    noiseScale: 0.74,
    noiseWidth: 0.76,
    semitones: -0.3,
    lowShelfDb: 0,
    highShelfDb: 0,
    reverbMix: 0,
    pauseMs: 400,
    breathMs: 120,
  },
  professional: {
    inferenceRate: 0.80,
    noiseScale: 0.86,
    noiseWidth: 0.82,
    semitones: 0.2,
    lowShelfDb: 0.35,
    highShelfDb: 0.65,
    reverbMix: 0,
    pauseMs: 280,
    breathMs: 90,
  },
  epic: {
    inferenceRate: 0.64,
    noiseScale: 1.08,
    noiseWidth: 1.08,
    semitones: -2.0,
    lowShelfDb: 3.2,
    highShelfDb: -1.4,
    reverbMix: 0.045,
    pauseMs: 460,
    breathMs: 150,
  },
};

export type VoicePackStage = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

export interface VoicePackProgress {
  stage: VoicePackStage;
  completed: number;
  total: number;
  message: string;
  error?: string;
}

export interface SynthesisProgress {
  completed: number;
  total: number;
  message: string;
}

export interface NeuralAudioResult {
  blob: Blob;
  audioUrl: string;
  duration: number;
  mimeType: 'audio/mpeg';
}

interface LoadedVoice {
  id: VoiceModelId;
  config: PiperConfig;
  session: ort.InferenceSession;
}

const preparationPromises: Partial<Record<VoiceModelId, Promise<void>>> = {};
let activeVoice: LoadedVoice | null = null;
let runtimeConfigured = false;

function reportVoicePack(
  callback: ((progress: VoicePackProgress) => void) | undefined,
  progress: VoicePackProgress
) {
  callback?.(progress);
}

function reportSynthesis(
  callback: ((progress: SynthesisProgress) => void) | undefined,
  progress: SynthesisProgress
) {
  callback?.(progress);
}

function assertSupported() {
  if (typeof window === 'undefined' || typeof caches === 'undefined') {
    throw new Error('ذخیره‌سازی آفلاین توسط این دستگاه پشتیبانی نمی‌شود.');
  }
  if (!window.WebAssembly || !window.OfflineAudioContext) {
    throw new Error('مرورگر این دستگاه از موتور گفتار عصبی پشتیبانی نمی‌کند.');
  }
}

function responseHeaders(response: Response): Headers {
  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  if (contentType) headers.set('content-type', contentType);
  if (contentLength) headers.set('content-length', contentLength);
  return headers;
}

/** Fetches a resource once and keeps it in browser/app Cache Storage. */
async function fetchCached(
  url: string,
  onProgress?: (loaded: number, total: number) => void
): Promise<Response> {
  const cache = await caches.open(MODEL_CACHE);
  const cached = await cache.match(url);
  if (cached) {
    const contentLength = Number(cached.headers.get('content-length')) || 0;
    onProgress?.(contentLength, contentLength);
    return cached.clone();
  }

  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`دانلود مدل با خطای ${response.status} متوقف شد.`);
  }

  const total = Number(response.headers.get('content-length')) || 0;
  if (!response.body) {
    await cache.put(url, response.clone());
    onProgress?.(total, total);
    return response;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.(loaded, total);
    }
  }

  const bodyParts = chunks.map((chunk) => {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
  });
  const body = new Blob(bodyParts, { type: response.headers.get('content-type') || 'application/octet-stream' });
  const cachedResponse = new Response(body, {
    status: 200,
    headers: responseHeaders(response),
  });
  await cache.put(url, cachedResponse.clone());
  onProgress?.(loaded, total || loaded);
  return cachedResponse;
}

async function downloadModel(
  source: ModelSource,
  index: number,
  total: number,
  callback?: (progress: VoicePackProgress) => void
) {
  reportVoicePack(callback, {
    stage: 'downloading',
    completed: index,
    total,
    message: `آماده‌سازی صدای عصبی ${source.label}…`,
  });

  await fetchCached(source.configUrl);
  await fetchCached(source.modelUrl, (loaded, bytes) => {
    const fraction = bytes > 0 ? loaded / bytes : 0;
    reportVoicePack(callback, {
      stage: 'downloading',
      completed: index + fraction,
      total,
      message: `دانلود یک‌بارهٔ صدای ${source.label}… ${Math.min(100, Math.round(fraction * 100))}%`,
    });
  });
}

/**
 * Downloads all voice packs at first launch. The app refuses to use the old
 * synthetic fallback: after this succeeds, inference remains local and works
 * without any connection.
 */
export async function prepareOfflineVoicePack(
  callback?: (progress: VoicePackProgress) => void,
  preferredCharacter: CharacterId = 'female'
): Promise<void> {
  assertSupported();

  const preferredModel = CHARACTER_PROFILES[preferredCharacter]?.model || 'mana';
  if (!preparationPromises[preferredModel]) {
    preparationPromises[preferredModel] = (async () => {
      await downloadModel(VOICE_MODELS[preferredModel], 0, 1, callback);
    })().catch((error) => {
      delete preparationPromises[preferredModel];
      throw error;
    });
  }

  reportVoicePack(callback, {
    stage: 'checking',
    completed: 0,
    total: 1,
    message: 'بررسی بستهٔ صدای آفلاین انتخاب‌شده…',
  });

  try {
    await preparationPromises[preferredModel];
    reportVoicePack(callback, {
      stage: 'ready',
      completed: 1,
      total: 1,
      message: 'صدای آفلاین آماده است.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'آماده‌سازی صدا ناموفق بود.';
    reportVoicePack(callback, {
      stage: 'error',
      completed: 0,
      total: 1,
      message: 'آماده‌سازی صدای آفلاین کامل نشد.',
      error: message,
    });
    throw error;
  }
}

function configureRuntime() {
  if (runtimeConfigured) return;
  // Galaxy A04-class devices usually expose two useful browser workers. Using
  // both reduces first-generation latency without exhausting the phone's RAM.
  ort.env.wasm.numThreads = Math.max(1, Math.min(2, navigator.hardwareConcurrency || 1));
  ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
  runtimeConfigured = true;
}

async function loadVoice(id: VoiceModelId): Promise<LoadedVoice> {
  configureRuntime();
  if (activeVoice?.id === id) return activeVoice;

  if (activeVoice) {
    await activeVoice.session.release();
    activeVoice = null;
  }

  const source = VOICE_MODELS[id];
  const configResponse = await fetchCached(source.configUrl);
  const config = (await configResponse.json()) as PiperConfig;
  const modelResponse = await fetchCached(source.modelUrl);
  const model = await modelResponse.arrayBuffer();
  const session = await ort.InferenceSession.create(model, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });

  activeVoice = { id, config, session };
  return activeVoice;
}

function splitTextForPiper(text: string, maxLength = 220): string[] {
  // Keep clause punctuation in its own inference chunk. Piper otherwise tends
  // to run through Persian commas with almost no audible pause.
  const sentences = text.match(/[^.!؟!…،؛,:]+[.!؟!…،؛,:]*/g) || [text];
  const chunks: string[] = [];
  let current = '';

  const pushLongSegment = (segment: string) => {
    let remaining = segment.trim();
    while (remaining.length > maxLength) {
      const beforeLimit = remaining.slice(0, maxLength + 1);
      const cut = Math.max(beforeLimit.lastIndexOf(' '), Math.floor(maxLength * 0.65));
      chunks.push(remaining.slice(0, cut).trim());
      remaining = remaining.slice(cut).trim();
    }
    if (remaining) chunks.push(remaining);
  };

  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    if (clean.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      pushLongSegment(clean);
      continue;
    }

    const candidate = current ? `${current} ${clean}` : clean;
    if (candidate.length > maxLength && current) {
      chunks.push(current);
      current = clean;
    } else {
      current = candidate;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

/** Adds restrained, tone-specific punctuation without changing the words. */
function prepareProsodyText(text: string, toneId: ToneId): string {
  const normalized = text.replace(/[ \t]+/g, ' ').trim();
  // Keep ZWNJ (half-space) intact: «می‌روم» must stay one connected word.
  // Do not invent commas between ordinary words; only the user's punctuation
  // controls the pause plan.
  const withBreaths = normalized
    .replace(/،\s*/gu, '، ')
    .replace(/…\s*/gu, '… ')
    .replace(/؛\s*/gu, '؛ ')
    .replace(/\s+([.!؟:])/gu, '$1');

  switch (toneId) {
    case 'cheerful':
      return withBreaths.replace(/[.!؟]+$/u, '') + '!';
    case 'intimate':
      return withBreaths.replace(/[.!؟]+$/u, '') + '…';
    case 'sad':
      return withBreaths.replace(/[.!؟]+$/u, '') + '…';
    case 'formal':
      return withBreaths.replace(/[!…]+/gu, '،').replace(/،\s*$/u, '') + '۔';
    case 'professional':
      return withBreaths.replace(/[!…]+/gu, '،').replace(/،\s*$/u, '') + '۔';
    case 'epic':
      return withBreaths.replace(/[.!؟]+$/u, '') + '!';
    default:
      return normalized;
  }
}

async function phonemize(text: string, config: PiperConfig): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    let settled = false;
    let timeout: number | undefined;
    const settle = (callback: () => void) => {
      if (!settled) {
        settled = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
        callback();
      }
    };

    try {
      const module = await createPiperPhonemize({
        print: (output: string) => {
          try {
            const parsed = JSON.parse(output) as { phoneme_ids?: Array<number | string> };
            if (parsed.phoneme_ids?.length) {
              settle(() => resolve(parsed.phoneme_ids!.map(String)));
            }
          } catch {
            // Emscripten may print diagnostics before the phoneme JSON payload.
          }
        },
        // Piper/eSpeak can emit harmless diagnostics before the JSON payload.
        // Do not turn every stderr line into a synthesis failure.
        printErr: () => {},
        locateFile: (fileName: string) => {
          if (fileName.endsWith('.wasm')) return PIPER_WASM_PATH;
          if (fileName.endsWith('.data')) return PIPER_DATA_PATH;
          return fileName;
        },
      });

      module.callMain([
        '-l',
        config.espeak.voice,
        '--input',
        JSON.stringify([{ text: text.trim() }]),
        '--espeak_data',
        '/espeak-ng-data',
      ]);
      timeout = window.setTimeout(() => {
        settle(() => reject(new Error('آوانگاری متن فارسی در زمان مجاز کامل نشد.')));
      }, 12_000);
    } catch (error) {
      settle(() => reject(error));
    }
  });
}

async function synthesizeChunk(
  voice: LoadedVoice,
  text: string,
  character: CharacterProfile,
  tone: ToneProfile,
  userSpeed: number
): Promise<Float32Array> {
  const phonemeIds = await phonemize(text, voice.config);
  const rate = Math.max(0.62, Math.min(1.65, userSpeed * character.speechRate * tone.inferenceRate));
  const inference = voice.config.inference;

  const feeds: Record<string, ort.Tensor> = {
    input: new ort.Tensor('int64', BigInt64Array.from(phonemeIds, (id) => BigInt(Number(id))), [1, phonemeIds.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([phonemeIds.length], (value) => BigInt(value)), [1]),
    scales: new ort.Tensor('float32', [
      Math.max(0.2, Math.min(1.5, inference.noise_scale * tone.noiseScale)),
      Math.max(0.5, Math.min(1.75, inference.length_scale / rate)),
      Math.max(0.2, Math.min(1.5, inference.noise_w * tone.noiseWidth)),
    ]),
  };

  if (Object.keys(voice.config.speaker_id_map || {}).length > 0) {
    feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0], (value) => BigInt(value)), [1]);
  }

  const output = await voice.session.run(feeds);
  const pcm = output.output?.data;
  if (!(pcm instanceof Float32Array)) {
    throw new Error('خروجی مدل گفتار معتبر نیست.');
  }
  return pcm;
}

function joinPcm(chunks: Float32Array[], labels: string[], sampleRate: number, tone: ToneProfile): Float32Array {
  const gaps = chunks.slice(0, -1).map((_, index) => {
    const sourceText = labels[index] || '';
    const punctuation = sourceText.trim().at(-1);
    const pauseMs = punctuation === '…'
      ? tone.pauseMs * 1.8 + tone.breathMs
      : punctuation === '،'
        ? tone.pauseMs * 0.72 + tone.breathMs
        : punctuation === '؛' || punctuation === ':'
          ? tone.pauseMs * 1.15 + tone.breathMs * 0.75
          : /[.!؟!۔]/u.test(punctuation || '')
            ? tone.pauseMs * 1.35 + tone.breathMs
            : Math.min(90, tone.pauseMs * 0.28);
    return Math.floor(sampleRate * (pauseMs / 1000));
  });
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0) + gaps.reduce((sum, gap) => sum + gap, 0);
  const merged = new Float32Array(total);
  let offset = 0;

  for (let index = 0; index < chunks.length; index += 1) {
    merged.set(chunks[index], offset);
    offset += chunks[index].length;
    if (index < gaps.length) offset += gaps[index];
  }
  return merged;
}

function createImpulse(context: OfflineAudioContext, duration: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * duration));
  const impulse = context.createBuffer(1, length, context.sampleRate);
  const data = impulse.getChannelData(0);
  for (let index = 0; index < length; index += 1) {
    const envelope = Math.pow(1 - index / length, 2.4);
    data[index] = (Math.random() * 2 - 1) * envelope;
  }
  return impulse;
}

async function renderStyle(
  pcm: Float32Array,
  sampleRate: number,
  character: CharacterProfile,
  tone: ToneProfile,
  userPitch: number
): Promise<AudioBuffer> {
  const semitones = character.semitones + tone.semitones;
  const timbreRate = Math.pow(2, semitones / 12) * Math.max(0.7, Math.min(1.35, userPitch));
  const tail = tone.reverbMix > 0 ? 0.28 : 0.05;
  const targetLength = Math.ceil(pcm.length / timbreRate + sampleRate * tail);
  const context = new OfflineAudioContext(1, targetLength, sampleRate);

  const sourceBuffer = context.createBuffer(1, pcm.length, sampleRate);
  const pcmCopy = new Float32Array(pcm.length);
  pcmCopy.set(pcm);
  sourceBuffer.copyToChannel(pcmCopy, 0);

  const source = context.createBufferSource();
  source.buffer = sourceBuffer;
  source.playbackRate.value = timbreRate;

  const lowShelf = context.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 190;
  lowShelf.gain.value = character.lowShelfDb + tone.lowShelfDb;

  const highShelf = context.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 3400;
  highShelf.gain.value = character.highShelfDb + tone.highShelfDb;

  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 9;
  compressor.ratio.value = 2.2;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.16;

  source.connect(lowShelf);
  lowShelf.connect(highShelf);
  highShelf.connect(compressor);
  compressor.connect(context.destination);

  if (tone.reverbMix > 0) {
    const convolver = context.createConvolver();
    convolver.buffer = createImpulse(context, 0.36);
    const wet = context.createGain();
    wet.gain.value = tone.reverbMix;
    highShelf.connect(convolver);
    convolver.connect(wet);
    wet.connect(context.destination);
  }

  source.start();
  return context.startRendering();
}

export async function audioBufferToMp3(audio: AudioBuffer): Promise<Blob> {
  const module = await import('@breezystack/lamejs');
  const Mp3Encoder = (module as { Mp3Encoder?: new (channels: number, sampleRate: number, kbps: number) => any })
    .Mp3Encoder;
  if (!Mp3Encoder) throw new Error('رمزگذار MP3 در دسترس نیست.');

  const encoder = new Mp3Encoder(1, audio.sampleRate, 128);
  const floatSamples = audio.getChannelData(0);
  const samples = new Int16Array(floatSamples.length);
  for (let index = 0; index < floatSamples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, floatSamples[index]));
    samples[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  const blocks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let offset = 0; offset < samples.length; offset += blockSize) {
    const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + blockSize));
    if (encoded?.length) blocks.push(new Uint8Array(encoded));
  }
  const finalBlock = encoder.flush();
  if (finalBlock?.length) blocks.push(new Uint8Array(finalBlock));

  const parts = blocks.map((block) => {
    const copy = new Uint8Array(block.byteLength);
    copy.set(block);
    return copy.buffer;
  });
  return new Blob(parts, { type: 'audio/mpeg' });
}

/** Produces a neural MP3 entirely on-device after first-run package download. */
export async function synthesizePersianNeuralAudio(
  text: string,
  characterId: CharacterId,
  toneId: ToneId,
  userSpeed = 1,
  userPitch = 1,
  callback?: (progress: SynthesisProgress) => void
): Promise<NeuralAudioResult> {
  if (!text.trim()) throw new Error('متنی برای خوانش وارد نشده است.');

  await prepareOfflineVoicePack(undefined, characterId);
  const character = CHARACTER_PROFILES[characterId];
  const tone = TONE_PROFILES[toneId];
  const chunks = splitTextForPiper(prepareProsodyText(text, toneId));
  const voice = await loadVoice(character.model);
  const pcmChunks: Float32Array[] = [];

  for (let index = 0; index < chunks.length; index += 1) {
    reportSynthesis(callback, {
      completed: index,
      total: chunks.length + 1,
      message: `تولید گفتار عصبی: بخش ${index + 1} از ${chunks.length}`,
    });
    pcmChunks.push(await synthesizeChunk(voice, chunks[index], character, tone, userSpeed));
  }

  reportSynthesis(callback, {
    completed: chunks.length,
    total: chunks.length + 1,
    message: 'پردازش لحن و ساخت فایل MP3…',
  });
  const merged = joinPcm(pcmChunks, chunks, voice.config.audio.sample_rate, tone);
  const styled = await renderStyle(merged, voice.config.audio.sample_rate, character, tone, userPitch);
  const blob = await audioBufferToMp3(styled);

  reportSynthesis(callback, {
    completed: chunks.length + 1,
    total: chunks.length + 1,
    message: 'فایل صوتی آماده است.',
  });

  return {
    blob,
    audioUrl: URL.createObjectURL(blob),
    duration: styled.duration,
    mimeType: 'audio/mpeg',
  };
}
