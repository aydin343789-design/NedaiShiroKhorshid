/**
 * Offline Persian TTS engine — Piper (open-source, MIT) running 100%
 * locally in the browser/WebView via WebAssembly + ONNX Runtime Web.
 *
 * Runtime JS is vendored in /public/piper (see scripts/fetch-piper-assets.mjs).
 * The large WASM binaries (eSpeak-NG phonemizer data + ONNX kernels) are
 * fetched once from public CDNs and then served from the Service Worker
 * cache, so after the first download everything — including the voice
 * models stored in OPFS — works fully offline.
 *
 * Voice models (real Persian Piper voices, rhasspy/piper-voices):
 *   fa_IR-ganji-medium (زن) · fa_IR-amir-medium (مرد) · fa_IR-gyro-medium (راوی)
 */

import { buildSpeechChunks } from "./text";
import type { PiperVoiceDef } from "./voices";

/* eslint-disable @typescript-eslint/no-explicit-any */

const PHONEMIZE_JS = "/piper/piper_phonemize.js";
const ORT_JS = "/piper/ort.wasm.min.js";
const PIPER_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize";
const ORT_WASM_BASE =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/";
const HF_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/main";
const PIPER_CACHE = "avasaz-piper-v1";

/** Assets to warm into the cache during the explicit engine download. */
export const PIPER_RUNTIME_ASSETS = [
  `${PIPER_WASM_BASE}.wasm`,
  `${PIPER_WASM_BASE}.data`,
  `${ORT_WASM_BASE}ort-wasm-simd-threaded.wasm`,
  `${ORT_WASM_BASE}ort-wasm-simd.wasm`,
];

export interface PiperSupport {
  opfs: boolean;
  wasm: boolean;
  ok: boolean;
}

export function checkPiperSupport(): PiperSupport {
  const opfs =
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof (navigator.storage as any)?.getDirectory === "function";
  const wasm = typeof WebAssembly !== "undefined";
  return { opfs, wasm, ok: opfs && wasm };
}

/* ------------------------------------------------------------------ */
/* OPFS model storage                                                  */
/* ------------------------------------------------------------------ */

async function modelsDir(create = true): Promise<any> {
  const root = await (navigator.storage as any).getDirectory();
  return root.getDirectoryHandle("avasaz-piper", { create });
}

async function readModelFile(name: string): Promise<ArrayBuffer | null> {
  try {
    const dir = await modelsDir(false);
    const handle = await dir.getFileHandle(name);
    const file = await handle.getFile();
    if (!file || file.size === 0) return null;
    return await file.arrayBuffer();
  } catch {
    return null;
  }
}

async function writeModelFile(name: string, blob: Blob): Promise<void> {
  const dir = await modelsDir(true);
  const handle = await dir.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

/** Piper voice ids whose model files are already downloaded. */
export async function storedPiperVoices(
  voices: PiperVoiceDef[],
): Promise<Set<string>> {
  const stored = new Set<string>();
  try {
    const dir = await modelsDir(false);
    const names = new Map<string, number>();
    for await (const entry of dir.values()) {
      if (entry.kind === "file") {
        const file = await entry.getFile();
        names.set(entry.name, file.size);
      }
    }
    for (const v of voices) {
      const modelSize = names.get(`${v.piperId}.onnx`) ?? 0;
      const cfgSize = names.get(`${v.piperId}.onnx.json`) ?? 0;
      if (modelSize > 1_000_000 && cfgSize > 100) stored.add(v.piperId);
    }
  } catch {
    /* directory does not exist yet */
  }
  return stored;
}

export async function removePiperVoice(voice: PiperVoiceDef): Promise<void> {
  sessions.delete(voice.piperId);
  try {
    const dir = await modelsDir(false);
    await dir.removeEntry(`${voice.piperId}.onnx`).catch(() => {});
    await dir.removeEntry(`${voice.piperId}.onnx.json`).catch(() => {});
  } catch {
    /* nothing stored */
  }
}

/* ------------------------------------------------------------------ */
/* Downloading (with progress)                                         */
/* ------------------------------------------------------------------ */

async function fetchWithProgress(
  url: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`دانلود ناموفق بود (HTTP ${res.status})`);
  const total = Number(res.headers.get("Content-Length") ?? 0);
  if (!res.body || !onProgress) return await res.blob();
  const reader = res.body.getReader();
  const parts: BlobPart[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value as BlobPart);
    loaded += value.length;
    onProgress(loaded, total);
  }
  return new Blob(parts, {
    type: res.headers.get("Content-Type") ?? "application/octet-stream",
  });
}

/** Download a Piper voice model into OPFS (kept for fully-offline use). */
export async function downloadPiperVoice(
  voice: PiperVoiceDef,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const modelUrl = `${HF_BASE}/${voice.path}`;
  const cfgUrl = `${modelUrl}.json`;

  const cfgBlob = await fetchWithProgress(cfgUrl);
  await writeModelFile(`${voice.piperId}.onnx.json`, cfgBlob);

  const modelBlob = await fetchWithProgress(modelUrl, (loaded, total) => {
    if (total > 0 && onProgress) onProgress((loaded / total) * 100);
  });
  await writeModelFile(`${voice.piperId}.onnx`, modelBlob);
  onProgress?.(100);

  // also warm the runtime binaries into the SW cache (best effort)
  void warmRuntimeCache();
}

/** Prefetch WASM runtime binaries into Cache Storage for offline use. */
export async function warmRuntimeCache(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const cache = await caches.open(PIPER_CACHE);
    await Promise.allSettled(
      PIPER_RUNTIME_ASSETS.map(async (url) => {
        const hit = await cache.match(url);
        if (!hit) await cache.add(url);
      }),
    );
  } catch {
    /* best effort */
  }
}

/* ------------------------------------------------------------------ */
/* Runtime loading (vendored JS)                                       */
/* ------------------------------------------------------------------ */

let ortPromise: Promise<any> | null = null;
let phonemizeFactoryPromise: Promise<any> | null = null;

function loadClassicScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-avasaz="${src}"]`,
    );
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.avasaz = src;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("بارگذاری موتور صوتی ممکن نشد"));
    document.head.appendChild(script);
  });
}

async function ensureOrt(): Promise<any> {
  if (!ortPromise) {
    ortPromise = (async () => {
      const w = window as any;
      if (!w.ort) await loadClassicScript(ORT_JS);
      const ort = w.ort;
      if (!ort) throw new Error("موتور استنتاج صوتی بارگذاری نشد");
      if (ort.env?.wasm) {
        ort.env.wasm.wasmPaths = ORT_WASM_BASE;
        ort.env.wasm.numThreads = (globalThis as any).crossOriginIsolated
          ? Math.min(4, navigator.hardwareConcurrency || 2)
          : 1;
      }
      return ort;
    })().catch((e) => {
      ortPromise = null;
      throw e;
    });
  }
  return ortPromise;
}

const importModule = new Function("u", "return import(u)") as (
  u: string,
) => Promise<any>;

async function ensurePhonemizeFactory(): Promise<any> {
  if (!phonemizeFactoryPromise) {
    phonemizeFactoryPromise = (async () => {
      const url = new URL(PHONEMIZE_JS, window.location.origin).href;
      const mod = await importModule(url);
      const factory = mod.createPiperPhonemize ?? mod.default;
      if (typeof factory !== "function") {
        throw new Error("ماژول آوایی موتور آفلاین یافت نشد");
      }
      return factory;
    })().catch((e) => {
      phonemizeFactoryPromise = null;
      throw e;
    });
  }
  return phonemizeFactoryPromise;
}

/** Convert one text chunk to Piper phoneme ids via eSpeak-NG (WASM). */
async function phonemize(
  text: string,
  espeakVoice: string,
): Promise<number[]> {
  const createPiperPhonemize = await ensurePhonemizeFactory();
  return new Promise<number[]>((resolve, reject) => {
    let settled = false;
    const fail = (msg: unknown) => {
      if (!settled) {
        settled = true;
        reject(new Error(typeof msg === "string" ? msg : "خطای آوایی"));
      }
    };
    (async () => {
      try {
        const module = await createPiperPhonemize({
          print: (data: string) => {
            try {
              const parsed = JSON.parse(data);
              if (!settled) {
                settled = true;
                resolve(
                  Array.isArray(parsed.phoneme_ids) ? parsed.phoneme_ids : [],
                );
              }
            } catch {
              /* non-JSON output (logs) — ignore */
            }
          },
          printErr: (msg: string) => {
            // eSpeak prints harmless warnings to stderr; only fail on fatal text
            if (/error|failed|cannot|abort/i.test(String(msg))) fail(msg);
          },
          locateFile: (url: string) => {
            if (url.endsWith(".wasm")) return `${PIPER_WASM_BASE}.wasm`;
            if (url.endsWith(".data")) return `${PIPER_WASM_BASE}.data`;
            return url;
          },
        });
        module.callMain([
          "-l",
          espeakVoice,
          "--input",
          JSON.stringify([{ text: text.trim() }]),
          "--espeak_data",
          "/espeak-ng-data",
        ]);
      } catch (e) {
        fail(e instanceof Error ? e.message : e);
      }
    })();
  });
}

/* ------------------------------------------------------------------ */
/* Synthesis                                                           */
/* ------------------------------------------------------------------ */

interface LoadedVoice {
  session: any;
  config: any;
}

const sessions = new Map<string, Promise<LoadedVoice>>();

async function loadVoice(voice: PiperVoiceDef): Promise<LoadedVoice> {
  let p = sessions.get(voice.piperId);
  if (!p) {
    p = (async () => {
      const ort = await ensureOrt();
      const [modelBuf, cfgBuf] = await Promise.all([
        readModelFile(`${voice.piperId}.onnx`),
        readModelFile(`${voice.piperId}.onnx.json`),
      ]);
      if (!modelBuf || !cfgBuf) {
        throw new Error("مدل این صدا هنوز دانلود نشده است");
      }
      const config = JSON.parse(new TextDecoder().decode(cfgBuf));
      const session = await ort.InferenceSession.create(modelBuf, {
        executionProviders: ["wasm"],
      });
      return { session, config };
    })().catch((e) => {
      sessions.delete(voice.piperId);
      throw e;
    });
    sessions.set(voice.piperId, p);
  }
  return p;
}

export interface PiperSynthesisOptions {
  /** >1 = slower (multiplies the model's own length_scale) */
  lengthScaleFactor: number;
  onChunk?: (done: number, total: number) => void;
}

export interface PiperSynthesisResult {
  samples: Float32Array;
  sampleRate: number;
}

/**
 * Synthesise speech locally. Chunks are separated by real silence gaps:
 * a short breath after sentences and a longer one after paragraphs —
 * the same humanising rhythm as the online engine.
 */
export async function piperSynthesize(
  text: string,
  voice: PiperVoiceDef,
  options: PiperSynthesisOptions,
): Promise<PiperSynthesisResult> {
  const ort = await ensureOrt();
  const { session, config } = await loadVoice(voice);
  const sampleRate: number = config.audio?.sample_rate ?? 22050;
  const espeakVoice: string = config.espeak?.voice ?? "fa";
  const inference = config.inference ?? {};
  const noiseScale: number = inference.noise_scale ?? 0.667;
  const noiseW: number = inference.noise_w ?? 0.8;
  const lengthScale: number =
    (inference.length_scale ?? 1) * options.lengthScaleFactor;
  const hasSpeakers =
    config.speaker_id_map && Object.keys(config.speaker_id_map).length > 0;

  const chunks = buildSpeechChunks(text, 240);
  if (chunks.length === 0) throw new Error("متنی برای خواندن وجود ندارد");

  const parts: Float32Array[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const ids = await phonemize(chunk.text, espeakVoice);
    if (ids.length > 0) {
      const feeds: Record<string, any> = {
        input: new ort.Tensor("int64", ids, [1, ids.length]),
        input_lengths: new ort.Tensor("int64", [ids.length]),
        scales: new ort.Tensor("float32", [noiseScale, lengthScale, noiseW]),
      };
      if (hasSpeakers) feeds.sid = new ort.Tensor("int64", [0]);
      const result = await session.run(feeds);
      const pcm = result.output?.data as Float32Array | undefined;
      if (pcm && pcm.length) parts.push(Float32Array.from(pcm));
    }
    if (i < chunks.length - 1) {
      const gapSec = chunk.paragraphBreakAfter ? 0.6 : 0.3;
      parts.push(new Float32Array(Math.floor(sampleRate * gapSec)));
    }
    options.onChunk?.(i + 1, chunks.length);
  }

  const totalLength = parts.reduce((s, p) => s + p.length, 0);
  if (totalLength === 0) {
    throw new Error("صدایی تولید نشد؛ متن را بررسی کنید و دوباره تلاش کنید");
  }
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const p of parts) {
    merged.set(p, offset);
    offset += p.length;
  }
  return { samples: merged, sampleRate };
}
