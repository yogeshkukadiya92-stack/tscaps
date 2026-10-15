import { describe, expect, it } from 'vitest';
import { AUDIO_RATE, cleanVoice, mixCreativeAudio, type PCM } from '@core/creative/CreativeAudio';
import { compositionSpans, newCreativeProject } from '@core/creative/CreativeProject';
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);
const tone = (seconds: number, amplitude: number, hz = 440): PCM => ({ sampleRate: AUDIO_RATE,
  channels: [Float32Array.from({ length: AUDIO_RATE * seconds }, (_, i) => amplitude * Math.sin(i * 2 * Math.PI * hz / AUDIO_RATE))] });
describe('Creative audio processing', () => {
  it('ducks music during voice and releases in a pause without muting the voice', () => {
    const project = newCreativeProject(3); project.settings.musicVolume = 0.5;
    const source = tone(3, 0.2); source.channels[0]!.fill(0, AUDIO_RATE);
    const music = tone(3, 0.2, 220);
    const sources = new Map([['original', source]]), spans = compositionSpans(project, []);
    const ducked = mixCreativeAudio(project, spans, sources, music).channels[0]!;
    const voiceOnly = mixCreativeAudio({ ...project, settings: { ...project.settings, musicVolume: 0 } }, spans, sources, music).channels[0]!;
    const unducked = mixCreativeAudio({ ...project, settings: { ...project.settings, ducking: false } }, spans, sources, music).channels[0]!;
    const musicOnly = (mix: Float32Array, from: number, to: number) => mix.slice(from * AUDIO_RATE, to * AUDIO_RATE).map((x, i) => x - voiceOnly[from * AUDIO_RATE + i]!);
    expect(rms(musicOnly(ducked, 0.5, 0.9))).toBeLessThan(rms(musicOnly(unducked, 0.5, 0.9)) * 0.3);
    expect(rms(ducked.slice(2.5 * AUDIO_RATE, 2.8 * AUDIO_RATE))).toBeGreaterThan(0.06);
  });
  it('attenuates low rumble and quiet noise, normalizes safely, and never clips the mix', () => {
    const rumble = tone(1, 0.04, 20);
    expect(rms(cleanVoice(rumble, true, false).channels[0]!.slice(AUDIO_RATE / 2))).toBeLessThan(rms(rumble.channels[0]!) * 0.3);
    const noise = tone(1, 0.001);
    expect(rms(cleanVoice(noise, true, false).channels[0]!.slice(AUDIO_RATE / 2))).toBeLessThan(0.0001);
    expect(Math.max(...cleanVoice(tone(1, 0.1), false, true).channels[0]!)).toBeCloseTo(0.4, 3);
    const project = newCreativeProject(1); project.settings.ducking = false; project.settings.musicVolume = 1;
    const result = mixCreativeAudio(project, compositionSpans(project, []), new Map([['original', tone(1, 0.9)]]), tone(1, 0.9));
    expect(Math.max(...result.channels[0]!)).toBeLessThanOrEqual(0.980001);
  });
  it('keeps music audible with a muted source, and respects trimmed duration and speed', () => {
    const project = newCreativeProject(3); project.settings.start = 1; project.settings.end = 3; project.settings.speed = 2; project.settings.sourceVolume = 0;
    const result = mixCreativeAudio(project, compositionSpans(project, []), new Map([['original', tone(3, 0.4)]]), tone(1, 0.3));
    expect(result.channels[0]!.length).toBe(AUDIO_RATE);
    expect(rms(result.channels[0]!)).toBeGreaterThan(0.04);
  });
});
