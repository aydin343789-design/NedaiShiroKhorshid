import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// @ts-ignore
import eSpeakNgPkg from 'text2wav/lib/espeak-ng.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const eSpeakNg = (eSpeakNgPkg as any).default || eSpeakNgPkg;

// Resolve path to the WebAssembly binary
const wasmPath = path.resolve(__dirname, '../node_modules/text2wav/lib/espeak-ng.wasm');
let wasmBinaryBuffer: Buffer | null = null;

try {
  if (fs.existsSync(wasmPath)) {
    wasmBinaryBuffer = fs.readFileSync(wasmPath);
  }
} catch (e) {
  console.warn('Could not preload espeak-ng.wasm:', e);
}

const optMap: Record<string, string> = {
  voice: '-v',
  amplitude: '-a',
  wordGap: '-g',
  capital: '-k',
  lineLength: '-l',
  pitch: '-p',
  speed: '-s',
  encoding: '-b',
  hasTags: '-m',
  noFinalPause: '-z',
  punct: '--punct',
};

export async function synthesizeSafeWav(text: string, options: Record<string, any> = {}): Promise<Uint8Array> {
  let parsedArguments = [text, '-w wav.wav'];

  for (const prop in options) {
    if (!optMap[prop]) continue;
    const val = options[prop];
    if (typeof val === 'boolean') {
      if (val === true) parsedArguments.push(optMap[prop]);
      continue;
    }
    if (optMap[prop].startsWith('--')) {
      if (val) {
        parsedArguments.push(`${optMap[prop]}="${String(val).replace(/"/g, '\\"')}"`);
      }
      continue;
    }
    parsedArguments.push(optMap[prop]);
    parsedArguments.push(String(val));
  }

  return new Promise((resolve, reject) => {
    try {
      const Module: any = {
        arguments: parsedArguments,
        wasmBinary: wasmBinaryBuffer || undefined,
        printErr: () => {}, // Suppress stderr warnings
        postRun: function () {
          try {
            Module.FS.unmount('/usr/share');
            const file = Module.FS.root.contents['wav.wav'];
            if (file && file.contents) {
              resolve(new Uint8Array(file.contents));
            } else {
              reject(new Error('WAV file not generated'));
            }
          } catch (err) {
            reject(err);
          }
        },
      };

      eSpeakNg(Module);
    } catch (err) {
      reject(err);
    }
  });
}
