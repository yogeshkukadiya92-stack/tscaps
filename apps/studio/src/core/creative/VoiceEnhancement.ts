import type { PCM } from '@core/creative/CreativeAudio';
export type VoiceEnhancement = 'off' | 'natural' | 'strong';
export type HumRemoval = 'off' | '50' | '60';

/** In-place biquad; channels share coefficients but keep independent filter histories. */
function filter(channels: Float32Array[], rate: number, frequency: number, kind: 'highpass' | 'notch' | 'presence') {
  const omega = 2 * Math.PI * frequency / rate, cos = Math.cos(omega), sin = Math.sin(omega);
  const q = kind === 'notch' ? 20 : .707, alpha = sin / (2 * q), a = 10 ** (1.8 / 40);
  const b = kind === 'highpass' ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2]
    : kind === 'notch' ? [1, -2 * cos, 1] : [1 + alpha * a, -2 * cos, 1 - alpha * a];
  const denominator = kind === 'presence' ? [1 + alpha / a, -2 * cos, 1 - alpha / a] : [1 + alpha, -2 * cos, 1 - alpha];
  const a0 = denominator[0]!;
  for (const channel of channels) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < channel.length; i++) {
      const x = Number.isFinite(channel[i]) ? channel[i]! : 0;
      const y = (b[0]! * x + b[1]! * x1 + b[2]! * x2 - denominator[1]! * y1 - denominator[2]! * y2) / a0;
      channel[i] = y; x2 = x1; x1 = x; y2 = y1; y1 = y;
    }
  }
}

/** Stereo-linked look-ahead peak limiter, without shifting timing or flat-clipping peaks. */
export function limitAudio(channels: Float32Array[], rate: number, ceiling = .98): void {
  const length = channels[0]?.length ?? 0, ahead = Math.max(1, Math.round(rate * .003));
  const capacity = ahead + 2;
  const indices = new Int32Array(capacity), peaks = new Float32Array(capacity);
  let head = 0, size = 0, added = 0, gain = 1;
  const release = 1 - Math.exp(-1 / (rate * .08));
  for (let i = 0; i < length; i++) {
    while (size && indices[head]! < i) { head = (head + 1) % capacity; size--; }
    while (added < length && added <= i + ahead) {
      let peak = 0;
      for (const channel of channels) peak = Math.max(peak, Math.abs(channel[added] ?? 0));
      while (size && peaks[(head + size - 1) % capacity]! <= peak) size--;
      const slot = (head + size) % capacity;
      indices[slot] = added++; peaks[slot] = peak; size++;
    }
    const target = Math.min(1, ceiling / Math.max(ceiling, peaks[head]!));
    gain = target < gain ? target : gain + (target - gain) * release;
    for (const channel of channels) channel[i]! *= gain;
  }
}

export function enhanceVoice(pcm: PCM, mode: VoiceEnhancement, hum: HumRemoval, cleanup: boolean, normalize: boolean): PCM {
  const channels = pcm.channels.map(channel => channel.slice());
  const rate = pcm.sampleRate, length = channels[0]?.length ?? 0;
  if (!length || !channels.length) return { channels, sampleRate: rate };
  if (cleanup) filter(channels, rate, mode === 'strong' ? 90 : 70, 'highpass');
  if (hum !== 'off') { filter(channels, rate, Number(hum), 'notch'); filter(channels, rate, Number(hum) * 2, 'notch'); }
  if (mode !== 'off') filter(channels, rate, 2500, 'presence');
  const block = Math.max(1, Math.round(rate * .02));
  const levels: number[] = [];
  for (let start = 0; start < length; start += block) {
    let sum = 0;
    for (let i = start; i < Math.min(length, start + block); i++) {
      let peak = 0; for (const channel of channels) peak = Math.max(peak, Math.abs(channel[i]!));
      sum += peak * peak;
    }
    levels.push(Math.sqrt(sum / Math.min(block, length - start)));
  }
  levels.sort((a, b) => a - b);
  const floor = levels[Math.floor(levels.length * .15)] ?? 0;
  const threshold = Math.max(.0005, Math.min(mode === 'strong' ? .012 : .006, floor * 1.5));
  const attack = 1 - Math.exp(-1 / (rate * .005)), release = 1 - Math.exp(-1 / (rate * .12));
  let envelope = 0, gate = 1, compression = 1;
  for (let i = 0; i < length; i++) {
    let peak = 0; for (const channel of channels) peak = Math.max(peak, Math.abs(channel[i]!));
    envelope += (peak - envelope) * (peak > envelope ? attack : release);
    const targetGate = cleanup ? Math.max(mode === 'strong' ? .08 : .2, Math.min(1, (envelope / threshold) ** 2)) : 1;
    gate += (targetGate - gate) * (targetGate > gate ? attack : release);
    const ratio = mode === 'strong' ? 3 : 2;
    const targetCompression = mode !== 'off' && envelope > .18 ? (.18 * (envelope / .18) ** (1 / ratio)) / envelope : 1;
    compression += (targetCompression - compression) * (targetCompression < compression ? attack : release);
    for (const channel of channels) channel[i]! *= gate * compression;
  }
  if (normalize) {
    let sum = 0, count = 0;
    for (const channel of channels) for (const value of channel) if (Math.abs(value) > Math.max(.004, threshold * 2)) { sum += value * value; count++; }
    const rms = count ? Math.sqrt(sum / count) : 0;
    const gain = rms > .001 ? Math.max(.25, Math.min(4, .14 / rms)) : 1;
    for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i]! *= gain;
  }
  limitAudio(channels, rate, .92);
  return { channels, sampleRate: rate };
}
