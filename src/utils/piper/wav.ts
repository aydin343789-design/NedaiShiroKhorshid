/** WAV encoding helpers + gentle pitch/tempo shaping for offline voices. */

export function pcmToWavBlob(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Re-render PCM at a different playback rate (changes pitch + tempo
 * together, like speeding up a tape). Used to give each offline
 * character/tone its own colour. Tempo-only changes are handled by
 * Piper's length_scale before this step.
 */
export async function shapePitchToWav(
  samples: Float32Array,
  sampleRate: number,
  playbackRate: number,
): Promise<{ blob: Blob; durationSec: number }> {
  if (Math.abs(playbackRate - 1) < 0.005) {
    return {
      blob: pcmToWavBlob(samples, sampleRate),
      durationSec: samples.length / sampleRate,
    };
  }
  const outLength = Math.max(1, Math.ceil(samples.length / playbackRate));
  const ctx = new OfflineAudioContext(1, outLength, sampleRate);
  const buffer = ctx.createBuffer(1, samples.length, sampleRate);
  buffer.getChannelData(0).set(samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = playbackRate;
  source.connect(ctx.destination);
  source.start();
  const rendered = await ctx.startRendering();
  const out = rendered.getChannelData(0);
  return {
    blob: pcmToWavBlob(out, sampleRate),
    durationSec: out.length / sampleRate,
  };
}
