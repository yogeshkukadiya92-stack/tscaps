import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerTranscriber } from '@core/transcription/infrastructure/ServerTranscriber';
import { encodeTranscriptionAudio } from '@core/transcription/infrastructure/PcmWaveEncoder';
import { PreprocessingProgressStore } from '@core/preprocessing/store/PreprocessingProgressStore';

describe('audio-only server transcription', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('invokes native fetch with the global receiver rather than the transcriber instance', async () => {
    vi.stubGlobal('fetch', function (this: unknown) {
      expect(this).toBe(globalThis);
      return Promise.resolve(new Response(JSON.stringify({ words: [{ text: 'ગુજરાતી', start: 0, end: 0.5 }] })));
    });
    const transcriber = new ServerTranscriber('https://processing.test',
      { decode: async () => new Float32Array(16000) }, new PreprocessingProgressStore(), async () => 'token');
    expect((await transcriber.transcribe(new Blob(), { language: 'gu' })).getWords()[0]?.text).toBe('ગુજરાતી');
  });
  it('encodes mono PCM16 with bounded samples and a WAV header', async () => {
    const view = new DataView(await encodeTranscriptionAudio(new Float32Array([-2, 0, 2, NaN])).arrayBuffer());
    expect(view.byteLength).toBe(52);
    expect(view.getUint32(24, true)).toBe(16000);
    expect([0, 1, 2, 3].map(i => view.getInt16(44 + i * 2, true))).toEqual([-32768, 0, 32767, 0]);
    expect(() => encodeTranscriptionAudio(new Float32Array())).toThrow();
  });
  function setup(payload: unknown, status = 200) {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status }));
    const decoder = { decode: vi.fn().mockResolvedValue(new Float32Array(16000)) };
    const transcriber = new ServerTranscriber('https://processing.test', decoder, new PreprocessingProgressStore(), async () => 'user-token', request);
    return { transcriber, request };
  }
  it('sends only extracted audio with the selected language and caller authorization', async () => {
    const { transcriber, request } = setup({ words: [{ text: 'hello', start: 0, end: 0.5 }] });
    const source = new Blob(['original video']);
    const document = await transcriber.transcribe(source, { language: 'hi' });
    expect(request.mock.calls[0]![0].href).toBe('https://processing.test/transcribe?language=hi');
    const options = request.mock.calls[0]![1];
    expect(options.headers.Authorization).toBe('Bearer user-token');
    expect(options.body.type).toBe('audio/wav');
    expect(options.body).not.toBe(source);
    expect(document.getWords()[0]?.text).toBe('hello');
    expect(document.getWords()[0]?.time.end).toBe(0.5);
  });
  it.each([
    { words: [{ text: 'bad', start: 0, end: 10 }] },
    { words: [{ text: 'bad', start: -1, end: 0 }] },
    { words: [null] }, { words: [] },
  ])('rejects invalid or empty server output', async payload => {
    await expect(setup(payload).transcriber.transcribe(new Blob())).rejects.toMatchObject({ name: 'ServerTranscriptionFailedError' });
  });
  it('does not silently replace server errors with local inference', async () => {
    await expect(setup({}, 429).transcriber.transcribe(new Blob())).rejects.toMatchObject({ name: 'ServerTranscriptionFailedError' });
  });
});
