export type VoiceId = "female" | "male" | "narrator";
export type ToneId = "happy" | "friendly" | "news" | "story" | "emotional";

export interface VoiceDef {
  id: VoiceId;
  /** Persian display title, e.g. «صدای زن» */
  title: string;
  /** character name */
  name: string;
  desc: string;
  /** Microsoft Edge neural voice short name */
  edgeVoice: string;
  /** character base prosody — keeps characters distinct yet natural */
  basePitchHz: number;
  baseRate: number;
  image: string;
  /** short text used for the "listen to sample" preview */
  sampleText: string;
}

export const VOICES: VoiceDef[] = [
  {
    id: "female",
    title: "صدای زن",
    name: "دیلارا",
    desc: "صدایی گرم، شفاف و طبیعی؛ مناسب آموزش، تبلیغات و روایت‌های زنانه",
    edgeVoice: "fa-IR-DilaraNeural",
    basePitchHz: 0,
    baseRate: 0,
    image: "/voices/female.jpg",
    sampleText:
      "سلام! من دیلارا هستم. هر متنی را که بنویسید، با صدای طبیعی و رسا برایتان می‌خوانم.",
  },
  {
    id: "male",
    title: "صدای مرد",
    name: "فرید",
    desc: "صدایی جوان، پرانرژی و مطمئن؛ مناسب معرفی محصول، پادکست و کلیپ",
    edgeVoice: "fa-IR-FaridNeural",
    basePitchHz: 6,
    baseRate: 1,
    image: "/voices/male.jpg",
    sampleText:
      "سلام! من فرید هستم. متن شما را با انرژی و اطمینان کامل برای مخاطبانتان می‌خوانم.",
  },
  {
    id: "narrator",
    title: "راوی",
    name: "استاد راوی",
    desc: "صدایی بم، سنگین و حماسی؛ مناسب کتاب صوتی، داستان و مستند",
    edgeVoice: "fa-IR-FaridNeural",
    basePitchHz: -28,
    baseRate: -6,
    image: "/voices/narrator.jpg",
    sampleText:
      "و این‌گونه بود که قصهٔ ما آغاز شد؛ در شبی آرام، زیر نور مهتاب، کنار آتشی گرم و روشن.",
  },
];

export interface ToneDef {
  id: ToneId;
  title: string;
  desc: string;
  /**
   * Prosody deltas applied on top of the character base.
   * Kept deliberately gentle — extreme pitch/rate shifts are what makes
   * neural voices sound robotic; expression here comes mostly from
   * rhythm and breathing, like a real speaker.
   */
  rateDelta: number;
  pitchDeltaHz: number;
  volumeDelta: number;
}

export const TONES: ToneDef[] = [
  {
    id: "happy",
    title: "شاد و پرانرژی",
    desc: "کمی تندتر و سرزنده؛ پر از شور و لبخند",
    rateDelta: 6,
    pitchDeltaHz: 12,
    volumeDelta: 2,
  },
  {
    id: "friendly",
    title: "صمیمی و گرم",
    desc: "نرم و دوستانه، مثل گفت‌وگو با یک دوست",
    rateDelta: -2,
    pitchDeltaHz: 4,
    volumeDelta: 0,
  },
  {
    id: "news",
    title: "خبری و رسمی",
    desc: "متین، شمرده و جدی؛ به سبک گویندگان خبر",
    rateDelta: 3,
    pitchDeltaHz: -7,
    volumeDelta: 2,
  },
  {
    id: "story",
    title: "داستانی و نمایشی",
    desc: "آهسته و عمیق، با نفس‌گیری‌ها و مکث‌های قصه‌گو",
    rateDelta: -8,
    pitchDeltaHz: -4,
    volumeDelta: 0,
  },
  {
    id: "emotional",
    title: "احساسی و شاعرانه",
    desc: "آرام، لطیف و پراحساس؛ برای شعر و دل‌نوشته",
    rateDelta: -9,
    pitchDeltaHz: -2,
    volumeDelta: -2,
  },
];

export const voiceById = (id: string): VoiceDef =>
  VOICES.find((v) => v.id === id) ?? VOICES[0];

export const toneById = (id: string): ToneDef =>
  TONES.find((t) => t.id === id) ?? TONES[1];

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(n)));

/** Combine character base + tone + user fine-tuning into final SSML prosody. */
export function computeProsody(
  voiceId: VoiceId,
  toneId: ToneId,
  userRate: number,
  userPitchHz: number,
): { ratePercent: number; pitchHz: number; volumePercent: number } {
  const voice = voiceById(voiceId);
  const tone = toneById(toneId);
  return {
    ratePercent: clamp(voice.baseRate + tone.rateDelta + userRate, -50, 80),
    pitchHz: clamp(
      voice.basePitchHz + tone.pitchDeltaHz + userPitchHz,
      -160,
      160,
    ),
    volumePercent: clamp(tone.volumeDelta, -40, 40),
  };
}

export interface SampleText {
  title: string;
  tone: ToneId;
  voice: VoiceId;
  text: string;
}

export const SAMPLE_TEXTS: SampleText[] = [
  {
    title: "شاد و هیجانی",
    tone: "happy",
    voice: "female",
    text: "وای خدای من! بالاخره موفق شدیم! امروز بهترین روز زندگی‌مان است. بیایید همه با هم جشن بگیریم، بخندیم و از این لحظه‌های قشنگ لذت ببریم!",
  },
  {
    title: "گزارش خبری",
    tone: "news",
    voice: "male",
    text: "به گزارش خبرنگار ما از تهران، صبح امروز نمایشگاه بین‌المللی کتاب با حضور هزاران بازدیدکننده گشایش یافت. مسئولان اعلام کردند این رویداد تا پایان هفته ادامه خواهد داشت و ورود برای عموم آزاد است.",
  },
  {
    title: "قصه شب",
    tone: "story",
    voice: "narrator",
    text: "در دل شب، وقتی ماه پشت ابرهای سیاه پنهان شده بود، پیرمرد قصه‌گو چراغ نفتی را روشن کرد و با صدایی آرام گفت: [مکث] یکی بود، یکی نبود. در سرزمینی دور، پسری زندگی می‌کرد که آرزوی پرواز داشت...",
  },
  {
    title: "پیام صمیمی",
    tone: "friendly",
    voice: "female",
    text: "سلام دوست خوبم! چقدر دلم برات تنگ شده بود. امروز داشتم به خاطره‌های قشنگ‌مون فکر می‌کردم و گفتم حتماً بهت زنگ بزنم. امیدوارم همیشه سلامت و شاد باشی عزیزم.",
  },
  {
    title: "شعر احساسی",
    tone: "emotional",
    voice: "female",
    text: "امشب، زیر باران خاطره‌ها، دلم برای صدای تو تنگ شده است. کاش باد، عطر حضورت را تا پنجرهٔ اتاقم بیاورد... تا بدانم هنوز جایی در این جهان، قلبی برای من می‌تپد.",
  },
];

export const MAX_TEXT_LENGTH = 4000;

/** Rough speaking-time estimate for Persian (~13 chars/sec incl. pauses). */
export function estimateSeconds(text: string, ratePercent = 0): number {
  const chars = text.trim().length;
  if (!chars) return 0;
  const base = chars / 13;
  return Math.max(1, Math.round(base / (1 + ratePercent / 100)));
}

/* ------------------------------------------------------------------ */
/* Offline engine (Piper, open-source) — real Persian voices from the  */
/* rhasspy/piper-voices repository on HuggingFace.                     */
/* ------------------------------------------------------------------ */

export interface PiperVoiceDef {
  characterId: VoiceId;
  /** e.g. fa_IR-ganji-medium */
  piperId: string;
  /** path of the .onnx file inside rhasspy/piper-voices */
  path: string;
  /** approximate download size (MB) */
  sizeMB: number;
  /** character shaping applied on top of the base model */
  pitchRate: number;
  lengthScale: number;
}

export const PIPER_VOICES: PiperVoiceDef[] = [
  {
    characterId: "female",
    piperId: "fa_IR-ganji-medium",
    path: "fa/fa_IR/ganji/medium/fa_IR-ganji-medium.onnx",
    sizeMB: 61,
    pitchRate: 1.0,
    lengthScale: 1.0,
  },
  {
    characterId: "male",
    piperId: "fa_IR-amir-medium",
    path: "fa/fa_IR/amir/medium/fa_IR-amir-medium.onnx",
    sizeMB: 61,
    pitchRate: 1.0,
    lengthScale: 1.0,
  },
  {
    characterId: "narrator",
    piperId: "fa_IR-gyro-medium",
    path: "fa/fa_IR/gyro/medium/fa_IR-gyro-medium.onnx",
    sizeMB: 61,
    pitchRate: 0.87,
    lengthScale: 1.07,
  },
];

export const piperByCharacter = (id: string): PiperVoiceDef =>
  PIPER_VOICES.find((v) => v.characterId === id) ?? PIPER_VOICES[0];

/** Tone shaping for the offline engine (Piper has no SSML prosody). */
export const OFFLINE_TONE_PARAMS: Record<
  ToneId,
  { lengthScale: number; pitchRate: number }
> = {
  happy: { lengthScale: 0.94, pitchRate: 1.05 },
  friendly: { lengthScale: 1.02, pitchRate: 1.01 },
  news: { lengthScale: 0.97, pitchRate: 0.98 },
  story: { lengthScale: 1.12, pitchRate: 0.97 },
  emotional: { lengthScale: 1.14, pitchRate: 0.99 },
};
