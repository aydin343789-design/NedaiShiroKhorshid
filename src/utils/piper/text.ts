/**
 * Persian text preparation for natural, human-like speech.
 * Pure functions — used both by the server (Edge TTS) and in the
 * browser (offline Piper engine).
 */

/* ------------------------------------------------------------------ */
/* 1) Normalisation — improves pronunciation accuracy                  */
/* ------------------------------------------------------------------ */

export function normalizePersian(input: string): string {
  let t = input
    // Arabic presentation forms -> Persian letters
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/[أإٱ]/g, "ا")
    // remove kashida (tatweel)
    .replace(/ـ/g, "")
    // unify quotes
    .replace(/[“”«»]/g, " ")
    .replace(/[‘’]/g, "'")
    // ellipsis
    .replace(/\.\.\./g, "…")
    // drop characters that confuse the reader
    .replace(/[*_#~`>|\\^]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    // no space before punctuation, one space after sentence enders
    .replace(/\s+([،؛.!؟?:؛])/g, "$1")
    .replace(/([.!؟?…])(\S)/g, "$1 $2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Make sure the text ends with a sentence terminator so the voice
  // finishes the last sentence with a natural falling intonation.
  if (t && !/[.!؟?…:]$/.test(t)) t += ".";
  return t;
}

/* ------------------------------------------------------------------ */
/* 2) Explicit pause markers typed by the user                         */
/*    [مکث] / [نفس]  -> short breath pause                             */
/*    [مکث طولانی]   -> paragraph break (long pause)                   */
/* ------------------------------------------------------------------ */

export function applyPauseMarkers(input: string): string {
  return input
    .replace(/\[\s*مکث\s+طولانی\s*\]|\[\s*long\s*pause\s*\]/gi, "\n\n")
    .replace(/\[\s*(?:مکث|نفس|pause|breath)\s*\]/gi, " … ");
}

/** Replace markers with a pretty ellipsis when echoing text back in the UI. */
export function stripMarkersForDisplay(input: string): string {
  return input
    .replace(/\[\s*مکث\s+طولانی\s*\]|\[\s*long\s*pause\s*\]/gi, " … ")
    .replace(/\[\s*(?:مکث|نفس|pause|breath)\s*\]/gi, "…")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ */
/* 3) Automatic "breathing" — insert light commas inside very long,    */
/*    punctuation-less sentences at natural clause boundaries, so the  */
/*    voice takes short breaths like a human instead of rushing.       */
/* ------------------------------------------------------------------ */

const CLAUSE_WORDS = new Set([
  "و",
  "اما",
  "ولی",
  "چون",
  "زیرا",
  "که",
  "سپس",
  "بعد",
  "همچنین",
  "بنابراین",
  "درنتیجه",
  "در",
  "نتیجه",
  "یعنی",
  "مثلاً",
  "مثلا",
  "اگر",
  "وقتی",
  "هنگامی",
  "تا",
  "بلکه",
  "هرچند",
  "بااین‌حال",
  "ازطرفی",
  "نخست",
  "سرانجام",
]);

const cleanWord = (w: string) =>
  w.replace(/[ً-ٰٟ]/g, "").replace(/[،؛.!؟?:؛«»()"]/g, "");

function breatheSentence(sentence: string): string {
  const words = sentence.split(/\s+/).filter(Boolean);
  if (words.length < 16) return sentence;
  // already punctuated inside — leave the author's rhythm alone
  const core = sentence.replace(/[.!؟?…\s]+$/, "");
  if (/[،؛:]/.test(core)) return sentence;

  const out: string[] = [];
  let sinceBreak = 0;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const isLast = i === words.length - 1;
    if (
      !isLast &&
      sinceBreak >= 8 &&
      CLAUSE_WORDS.has(cleanWord(word)) &&
      out.length > 0 &&
      !/[،؛]$/.test(out[out.length - 1])
    ) {
      out[out.length - 1] += "،";
      sinceBreak = 0;
    } else if (!isLast && sinceBreak >= 15) {
      // hard breath point even without a conjunction
      out.push(word + "،");
      sinceBreak = 0;
      continue;
    }
    out.push(word);
    sinceBreak++;
  }
  return out.join(" ");
}

function breatheParagraph(paragraph: string): string {
  const sentences = paragraph.match(/[^.!؟?…]+[.!؟?…]*/g) ?? [paragraph];
  return sentences.map((s) => breatheSentence(s.trim())).join(" ").trim();
}

/**
 * Full humanising pipeline: markers → normalise → breathing commas.
 * Paragraph breaks are preserved (engines add a real pause there).
 */
export function humanizeForSpeech(input: string): string {
  const marked = applyPauseMarkers(input);
  const normalised = normalizePersian(marked);
  return normalised
    .split(/\n{2,}/)
    .map((p) => breatheParagraph(p))
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------------------------------------------ */
/* 4) Chunking — split on sentence boundaries, never across           */
/*    paragraphs, so engines insert natural pauses between clauses.   */
/* ------------------------------------------------------------------ */

export interface SpeechChunk {
  text: string;
  /** true when a paragraph (long) pause should follow this chunk */
  paragraphBreakAfter: boolean;
  /** true when the chunk ends a sentence */
  sentenceBreakAfter: boolean;
}

export function buildSpeechChunks(
  text: string,
  maxChars = 420,
): SpeechChunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: SpeechChunk[] = [];

  paragraphs.forEach((paragraph, pIdx) => {
    const sentences = paragraph
      .split(/(?<=[.!؟?…])\s+|\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const local: string[] = [];
    let current = "";

    const pushCurrent = () => {
      if (current.trim()) local.push(current.trim());
      current = "";
    };

    const pushLongSentence = (sentence: string) => {
      let rest = sentence;
      while (rest.length > maxChars) {
        let cut = rest.lastIndexOf("،", maxChars);
        if (cut < maxChars * 0.4) cut = rest.lastIndexOf("؛", maxChars);
        if (cut < maxChars * 0.4) cut = rest.lastIndexOf(" ", maxChars);
        if (cut <= 0) cut = maxChars;
        local.push(rest.slice(0, cut + 1).trim());
        rest = rest.slice(cut + 1).trim();
      }
      if (rest) {
        if (current && current.length + rest.length + 1 <= maxChars) {
          current = `${current} ${rest}`;
        } else {
          pushCurrent();
          current = rest;
        }
      }
    };

    for (const sentence of sentences) {
      if (sentence.length > maxChars) {
        pushCurrent();
        pushLongSentence(sentence);
        continue;
      }
      if (current && current.length + sentence.length + 1 > maxChars) {
        pushCurrent();
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }
    pushCurrent();

    local.forEach((chunkText, cIdx) => {
      const isLastOfParagraph = cIdx === local.length - 1;
      chunks.push({
        text: chunkText,
        paragraphBreakAfter:
          isLastOfParagraph && pIdx < paragraphs.length - 1,
        sentenceBreakAfter: true,
      });
    });
  });

  return chunks;
}
