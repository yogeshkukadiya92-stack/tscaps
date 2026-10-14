import { afterEach, describe, expect, it, vi } from 'vitest';
import { CachedModelFileFetcher } from '@modules/transcription/CachedModelFileFetcher';
import type { ModelFileCache } from '@modules/transcription/ModelFileCache';

function storedFiles(): ModelFileCache {
  const entries = new Map<string, Response>();
  return {
    match: async key => entries.get(key)?.clone(),
    put: async (key, response) => { entries.set(key, response.clone()); },
  };
}

const URL = 'https://models.example/v1/person.tflite';

describe('CachedModelFileFetcher', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('downloads once and reuses bytes with a new loader while offline', async () => {
    const cache = storedFiles();
    const download = vi.fn(async () => new Response('model weights'));
    const first = new CachedModelFileFetcher(cache, { fetch: download });
    expect(await (await first.fetch(URL)).text()).toBe('model weights');
    const offline = vi.fn(async () => { throw new Error('offline'); });
    const nextSession = new CachedModelFileFetcher(cache, { fetch: offline });
    expect(await (await nextSession.fetch(URL)).text()).toBe('model weights');
    expect(download).toHaveBeenCalledOnce();
    expect(offline).not.toHaveBeenCalled();
  });

  it('shares a concurrent download without sharing a consumed response body', async () => {
    const download = vi.fn(async () => new Response('weights'));
    const loader = new CachedModelFileFetcher(storedFiles(), { fetch: download });
    const responses = await Promise.all([loader.fetch(URL), loader.fetch(URL), loader.fetch(URL)]);
    expect(await Promise.all(responses.map(response => response.text()))).toEqual(['weights', 'weights', 'weights']);
    expect(download).toHaveBeenCalledOnce();
  });

  it('checks the cache inside a cross-tab download lock', async () => {
    let queue = Promise.resolve();
    const request = vi.fn((_key: string, load: () => Promise<Response>) => {
      const result = queue.then(load);
      queue = result.then(() => undefined, () => undefined);
      return result;
    });
    vi.stubGlobal('navigator', { locks: { request } });
    const cache = storedFiles();
    const download = vi.fn(async () => new Response('weights'));
    const firstTab = new CachedModelFileFetcher(cache, { fetch: download });
    const secondTab = new CachedModelFileFetcher(cache, { fetch: download });
    const responses = await Promise.all([firstTab.fetch(URL), secondTab.fetch(URL)]);
    expect(await Promise.all(responses.map(response => response.text()))).toEqual(['weights', 'weights']);
    expect(download).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('keeps different model versions separate', async () => {
    const download = vi.fn(async () => new Response('weights'));
    const loader = new CachedModelFileFetcher(storedFiles(), { fetch: download });
    await loader.fetch(URL);
    await loader.fetch(URL.replace('/v1/', '/v2/'));
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('does not cache HTTP errors and allows retry after a network failure', async () => {
    const download = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('weights'));
    const loader = new CachedModelFileFetcher(storedFiles(), { fetch: download });
    await expect(loader.fetch(URL)).rejects.toThrow('offline');
    expect((await loader.fetch(URL)).status).toBe(503);
    expect(await (await loader.fetch(URL)).text()).toBe('weights');
    expect(await (await loader.fetch(URL)).text()).toBe('weights');
    expect(download).toHaveBeenCalledTimes(3);
  });

  it.each([
    { headers: { Range: 'bytes=0-10' } },
    { headers: { Authorization: 'Bearer user-token' } },
    { signal: new AbortController().signal },
    { method: 'POST' },
  ])('does not share requests with explicit request semantics: %o', async init => {
    const download = vi.fn(async () => new Response('weights'));
    const loader = new CachedModelFileFetcher(storedFiles(), { fetch: download });
    await Promise.all([loader.fetch(URL, init), loader.fetch(URL, init)]);
    expect(download).toHaveBeenCalledTimes(2);
  });
});
