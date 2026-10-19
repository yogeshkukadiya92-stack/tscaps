import type { MusicMood } from '@core/creative/ReelTemplates';

const MOODS: Record<MusicMood, { root: number; chords: number[]; melody: number[]; kick: number }> = {
  sunrise: { root: 48, chords: [0, 5, 7, 5], melody: [0, 4, 7, 12, 7, 4, 9, 7], kick: .12 },
  celebrate: { root: 50, chords: [0, 7, 9, 5], melody: [12, 7, 4, 7, 12, 14, 16, 7], kick: .2 },
  minimal: { root: 45, chords: [0, 3, 7, 5], melody: [0, 7, 10, 7, 3, 7, 12, 10], kick: .12 },
  dream: { root: 48, chords: [0, 9, 5, 7], melody: [12, 16, 19, 16, 14, 12, 7, 4], kick: .05 },
  drive: { root: 40, chords: [0, 3, 7, 5], melody: [0, 0, 7, 12, 0, 10, 7, 3], kick: .24 },
  runway: { root: 43, chords: [0, 5, 3, 7], melody: [0, 7, 12, 10, 7, 3, 10, 7], kick: .19 },
};

/** Original deterministic instrumental loops; no third-party recording or network request. */
export function createTemplateMusic(mood: MusicMood, bpm: number): File {
  if (!MOODS[mood] || !Number.isFinite(bpm) || bpm < 40 || bpm > 240) throw new Error('Invalid template music.');
  const rate = 24000, beat = 60 / bpm, duration = 32 * beat;
  const count = Math.ceil(duration * rate), data = new ArrayBuffer(44 + count * 2), view = new DataView(data);
  const ascii = (offset: number, value: string) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, 'RIFF'); view.setUint32(4, 36 + count * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, count * 2, true);
  const arrangement = MOODS[mood], tau = 2 * Math.PI;
  const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);
  let seed = 12345;
  for (let i = 0; i < count; i++) {
    const time = i / rate, index = Math.floor(time / beat), phase = time % beat;
    const chord = arrangement.root + arrangement.chords[Math.floor(index / 8) % 4]!;
    const chordTime = time % (beat * 8), chordFade = Math.min(1, chordTime / .04, (beat * 8 - chordTime) / .15);
    const pad = [0, mood === 'drive' || mood === 'minimal' ? 3 : 4, 7].reduce((sum, n) => sum + Math.sin(tau * frequency(chord + n + 12) * chordTime), 0) * .045 * chordFade;
    const note = arrangement.root + 24 + arrangement.melody[index % 8]!;
    const melody = Math.sin(tau * frequency(note) * phase) * Math.exp(-phase * 9) * Math.min(1, phase / .008) * .12;
    const bass = Math.sin(tau * frequency(chord - 12) * phase) * .12 * Math.exp(-phase * 4) * Math.min(1, phase / .008);
    const kick = Math.sin(tau * (48 * phase + 5 * (1 - Math.exp(-phase * 30)))) * Math.exp(-phase * 24) * arrangement.kick;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const hat = ((seed / 4294967296) * 2 - 1) * Math.exp(-(time % (beat / 2)) * 100) * .025;
    const fade = Math.min(1, time / .02, (duration - time) / .04);
    view.setInt16(44 + i * 2, Math.round(Math.max(-.95, Math.min(.95, (pad + melody + bass + kick + hat) * fade)) * 32767), true);
  }
  return new File([data], `ReelStudio-${mood}-${bpm}bpm.wav`, { type: 'audio/wav' });
}
