export async function audioBufferToMp3(audio: AudioBuffer): Promise<Blob> {
  const module = await import('@breezystack/lamejs');
  const Mp3Encoder = (module as { Mp3Encoder?: new (channels: number, sampleRate: number, kbps: number) => any }).Mp3Encoder;
  if (!Mp3Encoder) throw new Error('رمزگذار MP3 در دسترس نیست.');
  const encoder = new Mp3Encoder(1, audio.sampleRate, 128);
  const floats = audio.getChannelData(0);
  const samples = new Int16Array(floats.length);
  for (let i = 0; i < floats.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, floats[i]));
    samples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  const blocks: Uint8Array[] = [];
  for (let offset = 0; offset < samples.length; offset += 1152) {
    const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + 1152));
    if (encoded?.length) blocks.push(new Uint8Array(encoded));
  }
  const tail = encoder.flush();
  if (tail?.length) blocks.push(new Uint8Array(tail));
  return new Blob(blocks.map((block) => {
    const copy = new Uint8Array(block.byteLength);
    copy.set(block);
    return copy.buffer;
  }), { type: 'audio/mpeg' });
}
