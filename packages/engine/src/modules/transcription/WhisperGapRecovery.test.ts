import { describe, expect, it, vi } from 'vitest';
import { WhisperTranscriber, WHISPER_SAMPLE_RATE } from '@modules/transcription/WhisperTranscriber';
import type { CoverageGap } from '@modules/transcription/WhisperWindowCoverage';
import type { WhisperChunk } from '@modules/transcription/WhisperChunkStitcher';

describe('failed Whisper window recovery', () => {
  function setup() {
    const transcriber = new WhisperTranscriber({ decode: vi.fn() });
    const recovery = transcriber as unknown as {
      rescueGap: (...args: unknown[]) => Promise<WhisperChunk[]>;
      redecodeGaps: (pipeline: unknown, pcm: Float32Array, main: WhisperChunk[], gaps: CoverageGap[], options: { language: string }) => Promise<WhisperChunk[]>;
    };
    const rescue = vi.spyOn(recovery, 'rescueGap').mockResolvedValue([]);
    return { recovery, rescue };
  }

  it('retries failed long windows once in bounded short slices, preserving language', async () => {
    const { recovery, rescue } = setup();
    const pcm = new Float32Array(25 * WHISPER_SAMPLE_RATE).fill(0.1);
    await recovery.redecodeGaps({}, pcm, [], [{ startSeconds: 0, endSeconds: 25, rescuable: false }], { language: 'hi' });
    expect(rescue.mock.calls.map(call => call[2])).toEqual([
      { startSeconds: 0, endSeconds: 10, rescuable: false },
      { startSeconds: 10, endSeconds: 20, rescuable: false },
      { startSeconds: 20, endSeconds: 25, rescuable: false },
    ]);
    expect(rescue.mock.calls.every(call => (call[3] as { language: string }).language === 'hi' && call[4] === true)).toBe(true);
  });

  it('does not retry digital silence or retain failed-window words', async () => {
    const { recovery, rescue } = setup();
    const result = await recovery.redecodeGaps({}, new Float32Array(20 * WHISPER_SAMPLE_RATE), [
      { text: 'valid', timestamp: [0, 1] }, { text: 'loop', timestamp: [12, 13] },
    ], [{ startSeconds: 10, endSeconds: 20, rescuable: false }], { language: 'gu' });
    expect(rescue).not.toHaveBeenCalled();
    expect(result.map(chunk => chunk.text)).toEqual(['valid']);
  });
});
