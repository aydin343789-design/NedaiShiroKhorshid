import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { vocalizePersianText } from './persianPhonetics.js';

const PIPER_BIN = '/app/applet/server/piper/bin/piper';
const PIPER_DIR = '/app/applet/server/piper';

const MODELS: Record<string, { onnx: string; json: string }> = {
  mana: {
    onnx: path.join(PIPER_DIR, 'mana.onnx'),
    json: path.join(PIPER_DIR, 'mana.json'),
  },
  amir: {
    onnx: path.join(PIPER_DIR, 'amir.onnx'),
    json: path.join(PIPER_DIR, 'amir.json'),
  },
};

export interface PiperSynthesisOptions {
  character: 'female' | 'male' | 'child' | 'narrator';
  tone: 'cheerful' | 'intimate' | 'sad' | 'formal' | 'professional' | 'epic';
  speed?: number;
  pitch?: number;
}

export async function synthesizePiperMp3(
  text: string,
  options: PiperSynthesisOptions
): Promise<{ mp3Buffer: Buffer; duration: number }> {
  // 1. Phonetize and vocalize Persian text with diacritics
  const vocalizedText = vocalizePersianText(text.trim());

  // 2. Select base model and character settings
  let modelKey = 'mana';
  let ffmpegFilter = '';

  const char = options.character || 'female';
  const tone = options.tone || 'cheerful';
  const userSpeed = options.speed || 1.0;
  const userPitch = options.pitch || 1.0;

  // Base length scale (lower is faster)
  let baseLengthScale = 1.0 / userSpeed;
  let noiseScale = 0.667;
  let noiseW = 0.8;

  // Tone variations for length & expressiveness
  switch (tone) {
    case 'cheerful':
      baseLengthScale *= 0.90;
      noiseScale = 0.75;
      break;
    case 'intimate':
      baseLengthScale *= 1.15;
      noiseScale = 0.60;
      break;
    case 'sad':
      baseLengthScale *= 1.30;
      noiseScale = 0.55;
      break;
    case 'formal':
      baseLengthScale *= 1.02;
      noiseScale = 0.667;
      break;
    case 'professional':
      baseLengthScale *= 0.94;
      noiseScale = 0.65;
      break;
    case 'epic':
      baseLengthScale *= 1.10;
      noiseScale = 0.78;
      break;
  }

  // Character specific mapping
  if (char === 'female') {
    modelKey = 'mana';
    // Natural female voice
    if (userPitch !== 1.0) {
      const rateFactor = Math.max(0.6, Math.min(1.6, userPitch));
      ffmpegFilter = `-af asetrate=22050*${rateFactor.toFixed(2)},aresample=22050,atempo=1/${rateFactor.toFixed(2)}`;
    }
  } else if (char === 'male') {
    modelKey = 'amir';
    // Natural male voice
    if (userPitch !== 1.0) {
      const rateFactor = Math.max(0.6, Math.min(1.6, userPitch));
      ffmpegFilter = `-af asetrate=22050*${rateFactor.toFixed(2)},aresample=22050,atempo=1/${rateFactor.toFixed(2)}`;
    }
  } else if (char === 'child') {
    // Derived from Mana model with high-spirited childlike pitch shift
    modelKey = 'mana';
    baseLengthScale *= 0.88; // Children talk slightly faster and bouncier
    const childPitchFactor = 1.34 * userPitch;
    ffmpegFilter = `-af asetrate=22050*${childPitchFactor.toFixed(2)},aresample=22050,atempo=1/${childPitchFactor.toFixed(2)}`;
  } else if (char === 'narrator') {
    // Derived from Amir model with deep resonant baritone and majestic gravitas
    modelKey = 'amir';
    baseLengthScale *= 1.14; // Elder speaks calmly with venerable pauses
    const elderPitchFactor = 0.80 * userPitch;
    ffmpegFilter = `-af asetrate=22050*${elderPitchFactor.toFixed(2)},aresample=22050,atempo=1/${elderPitchFactor.toFixed(2)},bass=g=5`;
  }

  const modelInfo = MODELS[modelKey];
  const uniqueId = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const tmpWav = path.join(os.tmpdir(), `piper_${uniqueId}.wav`);
  const tmpMp3 = path.join(os.tmpdir(), `piper_${uniqueId}.mp3`);

  // Run Piper neural synthesis
  await new Promise<void>((resolve, reject) => {
    const args = [
      '--model', modelInfo.onnx,
      '--config', modelInfo.json,
      '--output_file', tmpWav,
      '--length_scale', baseLengthScale.toFixed(2),
      '--noise_scale', noiseScale.toFixed(2),
      '--noise_w', noiseW.toFixed(2),
    ];

    const proc = spawn(PIPER_BIN, args);
    proc.stdin.write(vocalizedText);
    proc.stdin.end();

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(tmpWav)) {
        resolve();
      } else {
        reject(new Error(`Piper execution failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', reject);
  });

  // Convert to high-quality MP3 via ffmpeg
  await new Promise<void>((resolve, reject) => {
    const ffmpegArgs = ['-y', '-i', tmpWav];
    if (ffmpegFilter) {
      const parts = ffmpegFilter.split(' ');
      ffmpegArgs.push(...parts);
    }
    ffmpegArgs.push('-codec:a', 'libmp3lame', '-b:a', '128k', tmpMp3);

    const ffProc = spawn('/usr/bin/ffmpeg', ffmpegArgs);
    ffProc.on('close', (code) => {
      if (code === 0 && fs.existsSync(tmpMp3)) {
        resolve();
      } else {
        reject(new Error(`ffmpeg conversion failed with code ${code}`));
      }
    });
    ffProc.on('error', reject);
  });

  const mp3Buffer = fs.readFileSync(tmpMp3);

  // Clean up temporary files safely
  try {
    if (fs.existsSync(tmpWav)) fs.unlinkSync(tmpWav);
    if (fs.existsSync(tmpMp3)) fs.unlinkSync(tmpMp3);
  } catch {}

  const wordCount = text.trim().split(/\s+/).length;
  const estimatedDuration = Math.max(2, Math.round((wordCount / 2.3) * 10) / 10);

  return { mp3Buffer, duration: estimatedDuration };
}
