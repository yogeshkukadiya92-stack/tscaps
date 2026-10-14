import { describe, expect, it } from 'vitest';
import { buildCuts, DEFAULT_SETTINGS, editedDuration, findSilences, mergeRanges } from '@ui/pages/editor/features/creative/creativeModel';

describe('Creative editing time mapping', () => {
  it('clips and merges intersecting cuts so removed time is counted once', () => {
    const cuts = mergeRanges([{ start: -1, end: 2 }, { start: 1, end: 3 }, { start: 8, end: 12 }], 0, 10);
    expect(cuts).toEqual([{ start: 0, end: 3 }, { start: 8, end: 10 }]);
    expect(editedDuration({ ...DEFAULT_SETTINGS, end: 10, speed: 2 }, cuts)).toBe(2.5);
  });
  it('builds beat jumps in source time and retains speech between them', () => {
    const settings = { ...DEFAULT_SETTINGS, start: 1, end: 5, speed: 2, bpm: 120, beatCuts: true };
    const cuts = buildCuts(settings, [], []);
    expect(cuts.map(c => c.start)).toEqual([2, 3, 4]);
    expect(cuts.every(c => c.end - c.start < 0.2)).toBe(true);
    expect(editedDuration(settings, cuts)).toBeGreaterThan(1.7);
  });
  it('does not classify stereo audio as silence when one channel contains speech', () => {
    const silent = new Float32Array(1000);
    const loud = new Float32Array(1000).fill(0.2);
    const buffer = { sampleRate: 1000, length: 1000, duration: 1, numberOfChannels: 2,
      getChannelData: (index: number) => index === 0 ? silent : loud } as AudioBuffer;
    expect(findSilences(buffer)).toEqual([]);
    expect(findSilences({ ...buffer, numberOfChannels: 1 })).toEqual([{ start: 0.1, end: 0.9 }]);
  });
});
