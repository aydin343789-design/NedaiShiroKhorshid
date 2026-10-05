/**
 * ندای شیروخورشید - موتور تولید صوت و لحن کاملاً آفلاین و درون‌برنامه‌ای
 * این موتور بدون نیاز به هیچ API خارجی یا اینترنت، سیگنال صوتی را با کدنویسی خالص
 * و فرمانت‌های آکوستیک، لحن‌گذاری عاطفی و زیروبم‌سازی در قالب فایل استاندارد WAV تولید می‌کند.
 */

// Acoustic formant profiles for Persian vowel sounds (F1, F2, F3 frequencies in Hz)
const VOWEL_FORMANTS: Record<string, [number, number, number]> = {
  // آ (aa)
  'aa': [750, 1150, 2400],
  // اَ (a)
  'a': [700, 1300, 2450],
  // اِ (e)
  'e': [500, 1850, 2600],
  // اُ (o)
  'o': [500, 900, 2350],
  // ای (i)
  'i': [320, 2200, 2900],
  // او (u)
  'u': [350, 800, 2250],
};

// Base fundamental frequencies (F0) for characters
const CHARACTER_PITCH: Record<string, { f0: number; formantShift: number }> = {
  male: { f0: 125, formantShift: 0.9 },      // مرد: صدای بم و پرطنین
  female: { f0: 220, formantShift: 1.15 },   // زن: صدای شفاف و زیر
  child: { f0: 310, formantShift: 1.35 },    // کودک: صدای نازک و شیرین
  narrator: { f0: 105, formantShift: 0.85 }, // راوی: صدای عمیق و حماسی
};

// Emotional tone profiles for pitch trajectory, tempo, and vibrato
interface ToneProfile {
  pitchMultiplier: number;
  cadenceSpeed: number;
  pitchTrajectory: 'rising' | 'falling' | 'stable' | 'dynamic' | 'warm';
  vibratoRate: number;
  vibratoDepth: number;
  harmonicWarmth: number;
}

const TONE_PROFILES: Record<string, ToneProfile> = {
  cheerful: { // شاد و پرانرژی
    pitchMultiplier: 1.18,
    cadenceSpeed: 1.15,
    pitchTrajectory: 'rising',
    vibratoRate: 6.2,
    vibratoDepth: 8,
    harmonicWarmth: 0.3,
  },
  intimate: { // صمیمی و دوستانه
    pitchMultiplier: 0.98,
    cadenceSpeed: 0.95,
    pitchTrajectory: 'warm',
    vibratoRate: 4.8,
    vibratoDepth: 5,
    harmonicWarmth: 0.5,
  },
  sad: { // غمگین و احساسی
    pitchMultiplier: 0.88,
    cadenceSpeed: 0.82,
    pitchTrajectory: 'falling',
    vibratoRate: 3.5,
    vibratoDepth: 4,
    harmonicWarmth: 0.25,
  },
  formal: { // رسمی و خبری
    pitchMultiplier: 1.0,
    cadenceSpeed: 1.02,
    pitchTrajectory: 'stable',
    vibratoRate: 0,
    vibratoDepth: 0,
    harmonicWarmth: 0.2,
  },
  professional: { // حرفه‌ای و تجاری
    pitchMultiplier: 1.05,
    cadenceSpeed: 1.05,
    pitchTrajectory: 'dynamic',
    vibratoRate: 4.0,
    vibratoDepth: 3,
    harmonicWarmth: 0.35,
  },
  epic: { // حماسی و ملی
    pitchMultiplier: 0.95,
    cadenceSpeed: 0.92,
    pitchTrajectory: 'dynamic',
    vibratoRate: 5.0,
    vibratoDepth: 6,
    harmonicWarmth: 0.6,
  },
};

/**
 * Encodes an AudioBuffer into a binary RIFF WAV format (16-bit PCM, 44.1kHz / 24kHz)
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const length = buffer.length * blockAlign;
  const bufferSize = 44 + length;
  const arrayBuffer = new ArrayBuffer(bufferSize);
  const view = new DataView(arrayBuffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // SubChunk1Size (16 for PCM)
  view.setUint16(20, format, true); // AudioFormat
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * blockAlign, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitDepth, true); // BitsPerSample

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  // Write PCM audio samples
  let offset = 44;
  const channelData = buffer.getChannelData(0); // Mono channel
  for (let i = 0; i < buffer.length; i++) {
    let sample = channelData[i];
    // Clamp to [-1, 1]
    sample = Math.max(-1, Math.min(1, sample));
    // Convert float to 16-bit signed integer
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    view.setInt16(offset, intSample, true);
    offset += 2;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Break Persian text into phonetic syllable sequence for acoustic synthesis
 */
function textToPersianSyllables(text: string): Array<{
  vowel: string;
  duration: number;
  consonant: boolean;
  pause: boolean;
}> {
  const clean = text
    .replace(/[«»"'\(\)\[\]\{\}]/g, '')
    .trim();

  const words = clean.split(/\s+/);
  const syllables: Array<{
    vowel: string;
    duration: number;
    consonant: boolean;
    pause: boolean;
  }> = [];

  const vowelKeys = Object.keys(VOWEL_FORMANTS);

  for (let w = 0; w < words.length; w++) {
    const word = words[w];
    if (!word) continue;

    // Detect punctuation for pauses
    const hasComma = word.includes('،') || word.includes(',');
    const hasPeriod = word.includes('.') || word.includes('!') || word.includes('؟');

    // Approximate syllable chunks
    const len = Math.max(1, Math.min(6, Math.ceil(word.length / 2)));
    for (let s = 0; s < len; s++) {
      // Pick phonetic vowel profile based on letter sounds
      const char = word[s % word.length];
      let vKey = 'a';
      if (char === 'ا' || char === 'آ') vKey = 'aa';
      else if (char === 'و') vKey = 'u';
      else if (char === 'ی') vKey = 'i';
      else if (char === 'ه' || char === 'ء') vKey = 'e';
      else {
        vKey = vowelKeys[(char.charCodeAt(0) + s) % vowelKeys.length];
      }

      syllables.push({
        vowel: vKey,
        duration: 0.14 + (s % 2 === 0 ? 0.04 : 0.01),
        consonant: s % 2 === 1,
        pause: false,
      });
    }

    // Add natural breath / word pause
    syllables.push({
      vowel: 'a',
      duration: hasPeriod ? 0.35 : hasComma ? 0.22 : 0.08,
      consonant: false,
      pause: true,
    });
  }

  return syllables;
}

/**
 * Synthesizes 100% offline audio using OfflineAudioContext with acoustic formant resonators
 */
export async function synthesizeOfflineAudio(
  text: string,
  character: string = 'female',
  tone: string = 'cheerful',
  userSpeed: number = 1.0,
  userPitch: number = 1.0
): Promise<{ blob: Blob; audioUrl: string; duration: number }> {
  const charConfig = CHARACTER_PITCH[character] || CHARACTER_PITCH.female;
  const toneConfig = TONES_PROFILES_LOOKUP(tone);

  const baseF0 = charConfig.f0 * toneConfig.pitchMultiplier * userPitch;
  const formantShift = charConfig.formantShift;
  const effectiveTempo = toneConfig.cadenceSpeed * userSpeed;

  const syllables = textToPersianSyllables(text);

  // Calculate total audio duration
  let totalDuration = 0.2; // initial silence
  for (const syl of syllables) {
    totalDuration += syl.duration / effectiveTempo;
  }
  totalDuration = Math.max(1.5, totalDuration + 0.3); // add trailing reverb decay

  const sampleRate = 44100;
  const offlineCtx = new (window.OfflineAudioContext || (window as any).webkitOfflineAudioContext)(
    1,
    Math.ceil(totalDuration * sampleRate),
    sampleRate
  );

  // Master Gain & Limiter
  const masterGain = offlineCtx.createGain();
  masterGain.gain.setValueAtTime(0.7, 0);

  // Reverb/Room impulse simulation for luxury acoustic depth
  const convolver = offlineCtx.createConvolver();
  convolver.buffer = createImpulseResponse(offlineCtx, 1.2, 2.0);
  const wetGain = offlineCtx.createGain();
  wetGain.gain.setValueAtTime(toneConfig.harmonicWarmth * 0.35, 0);
  const dryGain = offlineCtx.createGain();
  dryGain.gain.setValueAtTime(0.85, 0);

  masterGain.connect(dryGain);
  dryGain.connect(offlineCtx.destination);
  masterGain.connect(wetGain);
  wetGain.connect(convolver);
  convolver.connect(offlineCtx.destination);

  // Render each syllable
  let currentTime = 0.1;

  for (let i = 0; i < syllables.length; i++) {
    const syl = syllables[i];
    const sylDuration = syl.duration / effectiveTempo;

    if (syl.pause) {
      currentTime += sylDuration;
      continue;
    }

    const formants = VOWEL_FORMANTS[syl.vowel] || VOWEL_FORMANTS.aa;

    // Pitch trajectory calculation for Persian tone
    let f0AtSyl = baseF0;
    const progress = i / syllables.length;

    if (toneConfig.pitchTrajectory === 'rising') {
      f0AtSyl += (progress * 15) + (Math.sin(i * 0.8) * 6);
    } else if (toneConfig.pitchTrajectory === 'falling') {
      f0AtSyl -= (progress * 18) - (Math.sin(i * 0.5) * 4);
    } else if (toneConfig.pitchTrajectory === 'warm') {
      f0AtSyl += Math.sin(i * 0.6) * 5;
    } else if (toneConfig.pitchTrajectory === 'dynamic') {
      f0AtSyl += Math.sin(i * 1.2) * 12;
    }

    // Voice Source: Fundamental Oscillator (Sawtooth rich in harmonics)
    const osc = offlineCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f0AtSyl, currentTime);

    // Subtle natural vibrato
    if (toneConfig.vibratoDepth > 0) {
      const vibrato = offlineCtx.createOscillator();
      vibrato.frequency.value = toneConfig.vibratoRate;
      const vibratoGain = offlineCtx.createGain();
      vibratoGain.gain.value = toneConfig.vibratoDepth;
      vibrato.connect(osc.frequency);
      vibrato.start(currentTime);
      vibrato.stop(currentTime + sylDuration);
    }

    // Consonant aspiration/fricative noise for realistic diction
    let noiseSource: AudioNode | null = null;
    if (syl.consonant) {
      noiseSource = createNoiseNode(offlineCtx, 0.04);
    }

    // Three Formant Bandpass Filters (F1, F2, F3)
    const f1Filter = offlineCtx.createBiquadFilter();
    f1Filter.type = 'bandpass';
    f1Filter.frequency.value = formants[0] * formantShift;
    f1Filter.Q.value = 5.0;

    const f2Filter = offlineCtx.createBiquadFilter();
    f2Filter.type = 'bandpass';
    f2Filter.frequency.value = formants[1] * formantShift;
    f2Filter.Q.value = 7.0;

    const f3Filter = offlineCtx.createBiquadFilter();
    f3Filter.type = 'bandpass';
    f3Filter.frequency.value = formants[2] * formantShift;
    f3Filter.Q.value = 9.0;

    // Formant amplitude gains
    const f1Gain = offlineCtx.createGain();
    f1Gain.gain.value = 1.0;
    const f2Gain = offlineCtx.createGain();
    f2Gain.gain.value = 0.6;
    const f3Gain = offlineCtx.createGain();
    f3Gain.gain.value = 0.3;

    osc.connect(f1Filter);
    osc.connect(f2Filter);
    osc.connect(f3Filter);

    f1Filter.connect(f1Gain);
    f2Filter.connect(f2Gain);
    f3Filter.connect(f3Gain);

    // Envelope Generator (Attack, Decay, Sustain, Release)
    const envGain = offlineCtx.createGain();
    const attack = 0.02;
    const release = 0.04;
    envGain.gain.setValueAtTime(0.001, currentTime);
    envGain.gain.exponentialRampToValueAtTime(0.85, currentTime + attack);
    envGain.gain.exponentialRampToValueAtTime(0.001, currentTime + sylDuration);

    f1Gain.connect(envGain);
    f2Gain.connect(envGain);
    f3Gain.connect(envGain);

    if (noiseSource) {
      noiseSource.connect(envGain);
    }

    envGain.connect(masterGain);

    osc.start(currentTime);
    osc.stop(currentTime + sylDuration + release);

    currentTime += sylDuration;
  }

  // Render buffer
  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = audioBufferToWavBlob(renderedBuffer);
  const audioUrl = URL.createObjectURL(wavBlob);

  return {
    blob: wavBlob,
    audioUrl,
    duration: totalDuration,
  };
}

function TONES_PROFILES_LOOKUP(tone: string): ToneProfile {
  return TONE_PROFILES[tone] || TONE_PROFILES.formal;
}

/**
 * Creates noise buffer for consonant friction
 */
function createNoiseNode(ctx: OfflineAudioContext, duration: number): AudioNode {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.15;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 3000;
  noise.connect(filter);
  noise.start();
  return filter;
}

/**
 * Creates room impulse response for luxury natural vocal warmth
 */
function createImpulseResponse(ctx: OfflineAudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(1, length, sampleRate);
  const impulseData = impulse.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const n = length - i;
    impulseData[i] = ((Math.random() * 2) - 1) * Math.pow(n / length, decay);
  }

  return impulse;
}

/**
 * Synchronized Offline Speech vocalization with Web Speech API
 */
export function speakPersianUtterance(
  text: string,
  character: string,
  tone: string,
  speed: number = 1.0,
  pitch: number = 1.0,
  onEnd?: () => void
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (onEnd) onEnd();
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fa-IR';

  const voices = window.speechSynthesis.getVoices();
  const farsiVoice = voices.find(
    (v) => v.lang.includes('fa') || v.lang.includes('IR') || v.name.includes('Persian') || v.name.includes('Farsi')
  );

  if (farsiVoice) {
    utterance.voice = farsiVoice;
  }

  // Set character base pitch
  let p = pitch;
  if (character === 'female') p *= 1.25;
  else if (character === 'child') p *= 1.6;
  else if (character === 'narrator') p *= 0.8;
  else if (character === 'male') p *= 0.9;

  // Set tone adjustment
  if (tone === 'cheerful') p *= 1.15;
  else if (tone === 'sad') p *= 0.85;

  utterance.pitch = Math.max(0.5, Math.min(2.0, p));
  utterance.rate = Math.max(0.5, Math.min(2.0, speed));

  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = () => onEnd();
  }

  window.speechSynthesis.speak(utterance);
}

export function stopPersianUtterance(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}
