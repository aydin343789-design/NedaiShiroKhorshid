let cachedEncoderCls: any = null;

async function getEncoderCls(): Promise<any> {
  if (cachedEncoderCls) return cachedEncoderCls;
  try {
    const mod = await import('@breezystack/lamejs');
    cachedEncoderCls = mod.Mp3Encoder || (mod.default as any)?.Mp3Encoder;
    return cachedEncoderCls;
  } catch (err) {
    console.error('Failed to import @breezystack/lamejs:', err);
    throw err;
  }
}

export async function wavBufferToMp3Buffer(wavBuf: Buffer): Promise<Buffer> {
  const Mp3Encoder = await getEncoderCls();
  if (!Mp3Encoder) {
    throw new Error('Mp3Encoder is not available');
  }

  const view = new DataView(wavBuf.buffer, wavBuf.byteOffset, wavBuf.byteLength);

  let cursor = 12;
  let sampleRate = 24000;
  let channels = 1;
  let dataOffset = 44;
  let dataSize = wavBuf.byteLength - 44;

  while (cursor + 8 <= view.byteLength) {
    const id = String.fromCharCode(
      view.getUint8(cursor),
      view.getUint8(cursor + 1),
      view.getUint8(cursor + 2),
      view.getUint8(cursor + 3)
    );
    const size = view.getUint32(cursor + 4, true);
    const start = cursor + 8;

    if (id === 'fmt ') {
      channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true);
    } else if (id === 'data') {
      dataOffset = start;
      dataSize = size;
      break;
    }
    cursor = start + size + (size & 1);
  }

  const sampleCount = Math.floor(dataSize / (2 * channels));
  const monoSamples = new Int16Array(sampleCount);

  for (let i = 0; i < sampleCount; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const idx = dataOffset + (i * channels + c) * 2;
      if (idx + 1 < view.byteLength) {
        sum += view.getInt16(idx, true);
      }
    }
    monoSamples[i] = Math.round(sum / channels);
  }

  const encoder = new Mp3Encoder(1, sampleRate, 128);
  const chunks: Buffer[] = [];
  const blockSize = 1152;

  for (let i = 0; i < monoSamples.length; i += blockSize) {
    const chunk = monoSamples.subarray(i, Math.min(i + blockSize, monoSamples.length));
    const mp3Part = encoder.encodeBuffer(chunk);
    if (mp3Part && mp3Part.length > 0) {
      chunks.push(Buffer.from(mp3Part));
    }
  }

  const tail = encoder.flush();
  if (tail && tail.length > 0) {
    chunks.push(Buffer.from(tail));
  }

  return Buffer.concat(chunks);
}
