import { describe, expect, it } from 'vitest';
import { enhanceVoice, limitAudio } from '@core/creative/VoiceEnhancement';
import { cleanVoice, type PCM } from '@core/creative/CreativeAudio';
import { newCreativeProject, readCreativeProject } from '@core/creative/CreativeProject';
const rate = 48000;
const tone = (frequency: number, amplitude: number): PCM => ({ sampleRate: rate, channels: [Float32Array.from({ length: rate }, (_, i) => amplitude * Math.sin(2 * Math.PI * frequency * i / rate))] });
const rms = (data: Float32Array) => Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length);
const peak = (data: Float32Array) => data.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
describe('voice enhancement', () => {
  it('reduces electric hum without removing speech-band tones', () => {
    for (const hz of [50, 60] as const) {
      const hum = tone(hz, .1), speech = tone(1000, .1);
      const cleaned = enhanceVoice(hum, 'off', String(hz) as '50' | '60', false, false);
      expect(rms(cleaned.channels[0]!.slice(rate / 2))).toBeLessThan(rms(hum.channels[0]!) * .1);
      expect(rms(enhanceVoice(speech, 'off', String(hz) as '50' | '60', false, false).channels[0]!)).toBeGreaterThan(rms(speech.channels[0]!) * .95);
    }
  });
  it('lifts quiet speech, keeps silence silent and leaves source samples untouched', () => {
    const source = tone(300, .03), before = source.channels[0]!.slice();
    const result = cleanVoice(source, true, true, 'natural');
    expect(rms(result.channels[0]!)).toBeGreaterThan(rms(before) * 2);
    expect(source.channels[0]).toEqual(before);
    expect(peak(result.channels[0]!)).toBeLessThanOrEqual(.920001);
    expect(peak(enhanceVoice(tone(300, 0), 'strong', '50', true, true).channels[0]!)).toBe(0);
  });
  it('limits combined peaks with stereo-linked gain and no time shift', () => {
    const left = Float32Array.from({ length: 4800 }, (_, i) => i === 2000 ? 2 : .1);
    const right = Float32Array.from(left, value => value * .5);
    limitAudio([left, right], rate);
    expect(peak(left)).toBeLessThanOrEqual(.980001);
    expect(left.indexOf(peak(left))).toBe(2000);
    for (let i = 0; i < left.length; i++) expect(right[i]).toBeCloseTo(left[i]! * .5, 6);
  });
  it('compresses loud speech more than quiet speech and retains stereo balance', () => {
    const source = tone(400, .8);
    source.channels.push(Float32Array.from(source.channels[0]!, value => value * .5));
    const result = enhanceVoice(source, 'natural', 'off', false, false);
    expect(rms(result.channels[0]!.slice(rate / 2))).toBeLessThan(rms(source.channels[0]!) * .75);
    expect(rms(result.channels[1]!) / rms(result.channels[0]!)).toBeCloseTo(.5, 3);
  });
  it('persists choices and defaults older projects safely', () => {
    const project = newCreativeProject(2);
    project.settings.voiceEnhancement = 'strong'; project.settings.humRemoval = '50';
    expect(readCreativeProject(JSON.parse(JSON.stringify(project)))?.settings).toEqual(project.settings);
    expect(() => readCreativeProject({ ...project, settings: { ...project.settings, humRemoval: '70' } })).toThrow();
    delete project.settings.voiceEnhancement; delete project.settings.humRemoval;
    expect(readCreativeProject(project)?.settings.voiceEnhancement).toBe('off');
  });
});
