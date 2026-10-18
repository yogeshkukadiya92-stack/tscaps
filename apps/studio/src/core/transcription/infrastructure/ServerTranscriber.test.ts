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
  it('preserves Gujarati language metadata and mixed English words', async () => {
    const { transcriber, request } = setup({ language: 'hi', words: [
      { text: 'ગુજરાતી', start: 0, end: 0.4 }, { text: 'video', start: 0.4, end: 0.8 },
    ] });
    const document = await transcriber.transcribe(new Blob(), { language: 'gu' });
    expect(request.mock.calls[0]![0].searchParams.get('language')).toBe('gu');
    expect(document.language).toBe('gu');
    expect(document.getWords().map(word => word.text)).toEqual(['ગુજરાતી', 'video']);
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
    null,
    { words: [{ text: 'bad', start: 0, end: 10 }] },
    { words: [{ text: 'bad', start: -1, end: 0 }] },
    { words: [null] }, { words: [] },
  ])('rejects invalid or empty server output', async payload => {
    await expect(setup(payload).transcriber.transcribe(new Blob())).rejects.toMatchObject({ name: 'ServerTranscriptionFailedError' });
  });
  it('does not silently replace server errors with local inference', async () => {
    await expect(setup({}, 429).transcriber.transcribe(new Blob())).rejects.toMatchObject({ name: 'ServerTranscriptionFailedError' });
  });
  it('keeps the complete reel when Whisper returns a slightly earlier next word', async () => {
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ words: [
      { text: 'first', start: 21.34, end: 21.5 },
      { text: 'उसे', start: 21.1, end: 22.82 },
      { text: 'next', start: 22.82, end: 23 },
    ] })));
    const transcriber = new ServerTranscriber('https://processing.test',
      { decode: async () => new Float32Array(24 * 16000) }, new PreprocessingProgressStore(), async () => 'token', request);
    const words = (await transcriber.transcribe(new Blob())).getWords();
    expect(words.map(word => word.text)).toEqual(['first', 'उसे', 'next']);
    expect(words.map(word => word.time.start)).toEqual([21.34, 21.34, 22.82]);
    expect(words[1]?.time.end).toBe(22.82);
  });
  it('still rejects large backward timestamp jumps', async () => {
    const { transcriber } = setup({ words: [
      { text: 'first', start: 0.8, end: 0.9 }, { text: 'bad', start: 0.1, end: 0.5 },
    ] });
    await expect(transcriber.transcribe(new Blob())).rejects.toMatchObject({ reason: 'invalid-response' });
  });
  it('refreshes an expired session once before retrying the same extracted audio', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ words: [{ text: 'hello', start: 0, end: 0.5 }] })));
    const refresh = vi.fn().mockResolvedValue('fresh-token');
    const decoder = { decode: vi.fn().mockResolvedValue(new Float32Array(16000)) };
    const transcriber = new ServerTranscriber('https://processing.test', decoder,
      new PreprocessingProgressStore(), async () => 'expired-token', request, refresh);
    expect((await transcriber.transcribe(new Blob())).getWords()[0]?.text).toBe('hello');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(decoder.decode).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[1]![1].headers.Authorization).toBe('Bearer fresh-token');
    expect(request.mock.calls[1]![1].body).toBe(request.mock.calls[0]![1].body);
  });
  it('stops after one authentication retry', async () => {
    const request = vi.fn().mockImplementation(() => Promise.resolve(new Response('{}', { status: 401 })));
    const transcriber = new ServerTranscriber('https://processing.test',
      { decode: async () => new Float32Array(16000) }, new PreprocessingProgressStore(),
      async () => 'token', request, async () => 'fresh-token');
    await expect(transcriber.transcribe(new Blob())).rejects.toMatchObject({ reason: 'session', status: 401 });
    expect(request).toHaveBeenCalledTimes(2);
  });
  it.each([
    [403, {}, 'forbidden'], [429, { detail: 'Monthly transcription budget reached' }, 'budget'],
    [429, {}, 'busy'], [503, {}, 'unavailable'], [413, {}, 'too-long'], [524, {}, 'timeout'],
  ])('preserves an actionable reason for HTTP %s without retrying inference', async (status, body, reason) => {
    const { transcriber, request } = setup(body, status as number);
    await expect(transcriber.transcribe(new Blob())).rejects.toMatchObject({ reason, status });
    expect(request).toHaveBeenCalledTimes(1);
  });
});
