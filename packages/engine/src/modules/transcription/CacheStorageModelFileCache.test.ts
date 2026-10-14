import { afterEach, describe, expect, it, vi } from 'vitest';
import { CacheStorageModelFileCache } from '@modules/transcription/CacheStorageModelFileCache';
import { ModelFileCacheUnavailableError } from '@modules/transcription/ModelFileCacheUnavailableError';

/**
 * In-memory stand-in for one Cache Storage bucket. `refusal` makes
 * every write fail the way a browser out of room does.
 */
class FakeCache {
  private readonly entries = new Map<string, Response>();

  constructor(private readonly refusal: Error | null = null) {}

  async match(key: string): Promise<Response | undefined> {
    return this.entries.get(key)?.clone();
  }

  async put(key: string, response: Response): Promise<void> {
    if (this.refusal) throw this.refusal;
    this.entries.set(key, response.clone());
  }
}

function installCacheStorage(cache: FakeCache | null): void {
  vi.stubGlobal('caches', {
    open: async () => {
      if (!cache) throw new Error('refused to open');
      return cache;
    },
  });
}

function quotaExceeded(): Error {
  const error = new Error('quota exceeded');
  error.name = 'QuotaExceededError';
  return error;
}

describe('CacheStorageModelFileCache', () => {

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads back a file it kept', async () => {
    installCacheStorage(new FakeCache());
    const cache = new CacheStorageModelFileCache(() => undefined);

    await cache.put('https://host/model.onnx', new Response('weights'));

    expect(await (await cache.match('https://host/model.onnx'))?.text()).toBe('weights');
  });

  it('reports a miss for a file it never kept', async () => {
    installCacheStorage(new FakeCache());
    const cache = new CacheStorageModelFileCache(() => undefined);

    expect(await cache.match('https://host/model.onnx')).toBeUndefined();
  });

  it('announces the refusal that stopped a file from being kept', async () => {
    installCacheStorage(new FakeCache(quotaExceeded()));
    const announced: unknown[] = [];
    const cache = new CacheStorageModelFileCache((error) => announced.push(error));

    await cache.put('https://host/model.onnx', new Response('weights'));

    expect((announced[0] as Error).name).toBe('QuotaExceededError');
  });

  it('announces only the first refusal, since a model is several files', async () => {
    installCacheStorage(new FakeCache(quotaExceeded()));
    const announced: unknown[] = [];
    const cache = new CacheStorageModelFileCache((error) => announced.push(error));

    await cache.put('https://host/encoder.onnx', new Response('weights'));
    await cache.put('https://host/decoder.onnx', new Response('weights'));
    await cache.put('https://host/tokenizer.json', new Response('{}'));

    expect(announced).toHaveLength(1);
  });

  it('announces that there is nowhere to keep files when the runtime has no cache storage', async () => {
    vi.stubGlobal('caches', undefined);
    const announced: unknown[] = [];
    const cache = new CacheStorageModelFileCache((error) => announced.push(error));

    await cache.put('https://host/model.onnx', new Response('weights'));

    expect((announced[0] as Error).name).toBe(ModelFileCacheUnavailableError.ERROR_NAME);
  });

  it('reports a miss instead of failing when the cache cannot be opened', async () => {
    installCacheStorage(null);
    const cache = new CacheStorageModelFileCache(() => undefined);

    expect(await cache.match('https://host/model.onnx')).toBeUndefined();
  });

  it('keeps model bytes in the fallback after Cache Storage refuses a write', async () => {
    installCacheStorage(new FakeCache(quotaExceeded()));
    const fallback = new FakeCache();
    const announce = vi.fn();
    await new CacheStorageModelFileCache(announce, fallback)
      .put('https://host/model.onnx', new Response('saved weights'));

    // A fresh owner represents reopening the editor or restarting its worker.
    const nextSession = new CacheStorageModelFileCache(announce, fallback);
    expect(await (await nextSession.match('https://host/model.onnx'))?.text()).toBe('saved weights');
    expect(announce).not.toHaveBeenCalled();
  });

  it('reads fallback files even after the primary store becomes available again', async () => {
    installCacheStorage(null);
    const fallback = new FakeCache();
    const announce = vi.fn();
    await new CacheStorageModelFileCache(announce, fallback)
      .put('https://host/model.onnx', new Response('weights'));
    installCacheStorage(new FakeCache());
    expect(await (await new CacheStorageModelFileCache(announce, fallback)
      .match('https://host/model.onnx'))?.text()).toBe('weights');
    expect(announce).not.toHaveBeenCalled();
  });

  it('still reports failure if neither persistent store kept the download', async () => {
    installCacheStorage(null);
    const announce = vi.fn();
    const fallback = { match: async () => undefined, put: async () => undefined };
    await new CacheStorageModelFileCache(announce, fallback)
      .put('https://host/model.onnx', new Response('weights'));
    expect(announce).toHaveBeenCalledOnce();
  });
});
