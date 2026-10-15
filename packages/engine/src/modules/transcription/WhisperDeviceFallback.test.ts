import { afterEach, describe, expect, it, vi } from 'vitest';
import { WhisperTranscriber, type WhisperDevice } from '@modules/transcription/WhisperTranscriber';
import { TransformersRuntime } from '@modules/transcription/TransformersRuntime';

describe('automatic Whisper acceleration', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function setup(device: WhisperDevice, gpuAvailable = true) {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: vi.fn().mockResolvedValue(gpuAvailable ? {} : null) } });
    const asr = { model: { _extract_token_timestamps: vi.fn() }, tokenizer: { findLongestCommonSequence: vi.fn() } };
    const pipeline = vi.fn().mockImplementation(async (_task, _model, options) => {
      if (options.device === 'webgpu') throw new Error('GPU session unavailable');
      return asr;
    });
    vi.spyOn(TransformersRuntime.prototype, 'load').mockResolvedValue({ pipeline } as never);
    const transcriber = new WhisperTranscriber({ decode: vi.fn() }, { model: 'small', device });
    return { pipeline, asr, load: () => (transcriber as unknown as { loadPipeline: () => Promise<unknown> }).loadPipeline() };
  }

  it('falls back once to CPU when automatic GPU setup fails, then reuses the pipeline', async () => {
    const { pipeline, asr, load } = setup('auto');
    expect(await load()).toBe(asr);
    expect(pipeline.mock.calls.map(call => call[2].device)).toEqual(['webgpu', 'wasm']);
    expect(await load()).toBe(asr);
    expect(pipeline).toHaveBeenCalledTimes(2);
  });

  it('uses CPU directly when no GPU adapter is available', async () => {
    const { pipeline, load } = setup('auto', false);
    await load();
    expect(pipeline.mock.calls.map(call => call[2].device)).toEqual(['wasm']);
  });

  it('keeps an explicit GPU selection strict', async () => {
    const { pipeline, load } = setup('webgpu');
    await expect(load()).rejects.toThrow('GPU session unavailable');
    expect(pipeline).toHaveBeenCalledTimes(1);
  });
});
