import { AudioBufferSink, type Input } from 'mediabunny';
import type { QuietWindow } from '@core/creative/AutoEdit';

/** Stream audio into 50ms energy buckets instead of retaining the whole decoded recording. */
export async function analyzeAutoEditAudio(input: Input, signal: AbortSignal, onProgress: (percent: number) => void): Promise<QuietWindow[]> {
  signal.throwIfAborted();
  const track = await input.getPrimaryAudioTrack();
  if (!track) return [];
  if (!await track.canDecode()) throw new Error('Audio cannot be decoded. Convert the video to MP4 with AAC audio and try again.');
  const duration = await track.computeDuration();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 1800) throw new Error('Auto Edit supports videos up to 30 minutes.');
  const size = 0.05, length = Math.ceil(duration / size);
  const energy = new Float64Array(length), counts = new Uint32Array(length);
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
    signal.throwIfAborted();
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    for (let i = 0; i < buffer.length; i++) {
      const bin = Math.floor((timestamp + i / buffer.sampleRate) / size);
      if (bin < 0 || bin >= length) continue;
      let peak = 0;
      for (const channel of channels) peak = Math.max(peak, Math.abs(channel[i]!));
      energy[bin]! += peak * peak; counts[bin]!++;
    }
    onProgress(Math.min(99, (timestamp + buffer.duration) / duration * 100));
  }
  signal.throwIfAborted(); onProgress(100);
  return Array.from({ length }, (_, i) => ({ start: i * size, end: Math.min(duration, (i + 1) * size), rms: counts[i] ? Math.sqrt(energy[i]! / counts[i]!) : Infinity }));
}
