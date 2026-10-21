import { enhanceVoice, limitAudio, type VoiceEnhancement, type HumRemoval } from '@core/creative/VoiceEnhancement';
import { AudioBufferSink, type Input } from 'mediabunny';
import type { CreativeProject, CreativeSpan } from '@core/creative/CreativeProject';

export const AUDIO_RATE = 48000;
export interface PCM { channels: Float32Array[]; sampleRate: number }

export async function decodeCreativeAudio(input: Input, signal?: AbortSignal): Promise<PCM | null> {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  if (!await track.canDecode()) throw new Error('An audio track cannot be decoded. Convert it to AAC or WAV and replace the file.');
  const duration = await track.computeDuration();
  if (duration > 1800) throw new Error('Use source files shorter than 30 minutes for creative editing.');
  const channels = [new Float32Array(Math.ceil(duration * AUDIO_RATE)), new Float32Array(Math.ceil(duration * AUDIO_RATE))];
  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
    signal?.throwIfAborted();
    const offset = Math.round(timestamp * AUDIO_RATE);
    const length = Math.round(buffer.duration * AUDIO_RATE);
    for (let c = 0; c < 2; c++) {
      const source = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
      const target = channels[c]!;
      for (let i = 0; i < length && offset + i < target.length; i++) {
        if (offset + i < 0) continue;
        const index = i * buffer.sampleRate / AUDIO_RATE;
        const first = Math.floor(index), fraction = index - first;
        target[offset + i] = (source[first] ?? 0) * (1 - fraction) + (source[first + 1] ?? source[first] ?? 0) * fraction;
      }
    }
  }
  return { channels, sampleRate: AUDIO_RATE };
}

/** Rumble filter + downward noise gate, followed by optional bounded peak normalization. */
export function cleanVoice(pcm: PCM, cleanup: boolean, normalize: boolean, enhancement: VoiceEnhancement = 'off', hum: HumRemoval = 'off'): PCM {
  if (enhancement !== 'off' || hum !== 'off') return enhanceVoice(pcm, enhancement, hum, cleanup, normalize);
  const channels = pcm.channels.map(source => source.slice());
  if (cleanup) {
    const alpha = Math.exp(-2 * Math.PI * 90 / pcm.sampleRate);
    const envelopeAlpha = Math.exp(-1 / (0.015 * pcm.sampleRate));
    for (const channel of channels) {
      let previous = 0, filtered = 0, envelope = 0, gain = 1;
      for (let i = 0; i < channel.length; i++) {
        const value = channel[i]!;
        filtered = alpha * (filtered + value - previous); previous = value;
        envelope = envelopeAlpha * envelope + (1 - envelopeAlpha) * Math.abs(filtered);
        const target = Math.min(1, (envelope / 0.006) ** 2);
        gain += (target - gain) * (target > gain ? 0.01 : 0.0005);
        channel[i] = filtered * gain;
      }
    }
  }
  if (normalize) {
    let peak = 0;
    for (const channel of channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
    const gain = peak > 0.001 ? Math.min(4, 0.85 / peak) : 1;
    for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i]! *= gain;
  }
  return { channels, sampleRate: pcm.sampleRate };
}
function sample(pcm: PCM | null | undefined, channel: number, time: number): number {
  if (!pcm) return 0;
  const data = pcm.channels[Math.min(channel, pcm.channels.length - 1)]!;
  const index = time * pcm.sampleRate, first = Math.floor(index), fraction = index - first;
  return (data[first] ?? 0) * (1 - fraction) + (data[first + 1] ?? 0) * fraction;
}

/** Source-derived envelope drives music only. Cut edges get 5ms fades to prevent clicks. */
export function mixCreativeAudio(project: CreativeProject, spans: readonly CreativeSpan[], sources: ReadonlyMap<string, PCM | null>, music: PCM | null): PCM {
  const duration = spans.at(-1)?.outputEnd ?? 0;
  if (duration > 600) throw new Error('Keep the edited reel under 10 minutes for browser audio mixing.');
  const channels = [new Float32Array(Math.ceil(duration * AUDIO_RATE)), new Float32Array(Math.ceil(duration * AUDIO_RATE))];
  let envelope = 0, duck = 1;
  const musicDuration = music ? music.channels[0]!.length / music.sampleRate : 0;
  const attack = 1 - Math.exp(-1 / (AUDIO_RATE * 0.025));
  const release = 1 - Math.exp(-1 / (AUDIO_RATE * 0.25));
  for (const span of spans) {
    const source = sources.get(span.clip.asset?.id ?? 'original');
    const first = Math.round(span.outputStart * AUDIO_RATE), last = Math.min(channels[0]!.length, Math.round(span.outputEnd * AUDIO_RATE));
    for (let i = first; i < last; i++) {
      const time = i / AUDIO_RATE;
      const sourceTime = span.sourceStart + (time - span.outputStart) * project.settings.speed;
      const fade = Math.min(1, Math.max(0, (time - span.outputStart) / 0.005), Math.max(0, (span.outputEnd - time) / 0.005));
      const voice = [sample(source, 0, sourceTime), sample(source, 1, sourceTime)]
        .map(v => v * project.settings.sourceVolume * span.clip.volume * fade);
      const level = Math.max(Math.abs(voice[0]!), Math.abs(voice[1]!));
      envelope += (level - envelope) * (level > envelope ? attack : release);
      const target = project.settings.ducking && envelope > 0.018 ? 0.22 : 1;
      duck += (target - duck) * (target < duck ? attack : release);
      const musicTime = musicDuration > 0 ? (time + project.musicOffset) % musicDuration : 0;
      const musicFade = Math.min(1, time / 0.04, (duration - time) / 0.08);
      for (let c = 0; c < 2; c++) {
        const mixed = voice[c]! + sample(music, c, musicTime) * project.settings.musicVolume * duck * musicFade;
        channels[c]![i] = mixed;
      }
    }
  }
  limitAudio(channels, AUDIO_RATE);
  return { channels, sampleRate: AUDIO_RATE };
}
export function toAudioBuffer(pcm: PCM, start = 0, length = pcm.channels[0]!.length): AudioBuffer {
  const buffer = new AudioBuffer({ numberOfChannels: pcm.channels.length, sampleRate: pcm.sampleRate, length });
  pcm.channels.forEach((channel, index) => buffer.getChannelData(index).set(channel.subarray(start, start + length)));
  return buffer;
}
