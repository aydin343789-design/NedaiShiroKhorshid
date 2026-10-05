import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { synthesizePiperMp3 } from './server/piperEngine.js';
import { synthesizeSafeWav } from './server/text2wavSafe.js';
import { wavBufferToMp3Buffer } from './server/mp3Encoder.js';
import { vocalizePersianText } from './server/persianPhonetics.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '15mb' }));

/**
 * Open-Source Neural Persian Text-to-Speech endpoint
 * Powered by Piper Neural Voice Models (Mana & Amir)
 * Completely local, zero external cloud dependencies, consistent human audio output
 */
async function handleTtsGeneration(req: Request, res: Response) {
  try {
    const { text, character = 'female', tone = 'cheerful', speed = 1.0, pitch = 1.0 } = req.body;

    if (!text || typeof text !== 'string' || !text.trim()) {
      res.status(400).json({ error: 'متن فارسی وارد نشده است.' });
      return;
    }

    const rawText = text.trim();
    let mp3Buffer: Buffer | null = null;
    let duration = 3;

    // 1. Primary Engine: Open-Source Persian Neural Piper Models (Mana & Amir)
    try {
      const piperResult = await synthesizePiperMp3(rawText, {
        character,
        tone,
        speed: Number(speed) || 1.0,
        pitch: Number(pitch) || 1.0,
      });
      mp3Buffer = piperResult.mp3Buffer;
      duration = piperResult.duration;
    } catch {
      // Piper fallback handled below
    }

    // 2. Secondary Safe Fallback Engine if needed
    if (!mp3Buffer) {
      const vocalized = vocalizePersianText(rawText);
      const isFemale = character === 'female' || character === 'child';
      const voice = isFemale ? 'fa+f3' : 'fa+m4';
      const basePitch = character === 'child' ? 90 : character === 'narrator' ? 30 : isFemale ? 64 : 42;
      const baseSpeed = character === 'child' ? 150 : character === 'narrator' ? 115 : 135;

      const wavBytes = await synthesizeSafeWav(vocalized, {
        voice,
        pitch: Math.round(basePitch * (Number(pitch) || 1.0)),
        speed: Math.round(baseSpeed * (Number(speed) || 1.0)),
        wordGap: 8,
      });

      const rawWavBuffer = Buffer.from(wavBytes);
      mp3Buffer = await wavBufferToMp3Buffer(rawWavBuffer);
      const wordCount = rawText.split(/\s+/).length;
      duration = Math.max(2, Math.round((wordCount / 2.3) * 10) / 10);
    }

    const mp3Base64 = mp3Buffer.toString('base64');

    res.json({
      success: true,
      audioBase64: mp3Base64,
      mimeType: 'audio/mp3',
      format: 'mp3',
      duration,
      character,
      tone,
    });
  } catch (err: any) {
    res.status(500).json({
      error: 'خطا در ساخت فایل صوتی MP3',
    });
  }
}

app.post('/api/tts', handleTtsGeneration);
app.post('/api/offline-tts', handleTtsGeneration);

// Configure Vite middleware in development or serve static in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nedaye Shirokhorshid Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
