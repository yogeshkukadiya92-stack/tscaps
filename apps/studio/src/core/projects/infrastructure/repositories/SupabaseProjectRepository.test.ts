import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@core/projects/domain/Project';
import type { ProjectSerializer } from '@core/projects/services/ProjectSerializer';
import { SupabaseProjectRepository } from '@core/projects/infrastructure/repositories/SupabaseProjectRepository';
import { CloudVideoUploadManager } from '@core/projects/services/CloudVideoUploadManager';
import type { VideoUploadRequest } from '@core/projects/domain/VideoUploadTransport';

describe('Cloud project failure and account boundaries', () => {
  it('retries a failed video upload before saving metadata, and refuses to mark an unsynced video saved', async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error('Storage offline') });
    const from = vi.fn();
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      storage: { from: () => ({ upload }) }, from } as unknown as SupabaseClient;
    const repository = new SupabaseProjectRepository(client, {} as ProjectSerializer);
    await expect(repository.cacheVideoBlob('project', new Blob(['video']))).rejects.toThrow('Storage offline');
    await expect(repository.save({ id: 'project' } as Project)).rejects.toThrow('Storage offline');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalled();
  });
  it('discards a response when the signed-in account changes during the request', async () => {
    const auth = vi.fn().mockResolvedValueOnce({ data: { session: { user: { id: 'first' } } } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'second' } } } });
    const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain);
    const client = { auth: { getSession: auth }, from: () => chain } as unknown as SupabaseClient;
    const repository = new SupabaseProjectRepository(client, {} as ProjectSerializer);
    await expect(repository.list()).rejects.toThrow('Your account changed');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'first');
  });
  it('blocks access before making any database call when signed out', async () => {
    const from = vi.fn();
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }, from } as unknown as SupabaseClient;
    await expect(new SupabaseProjectRepository(client, {} as ProjectSerializer).load('project')).rejects.toThrow('Sign in');
    expect(from).not.toHaveBeenCalled();
  });
});

describe('Cloud video reuse', () => {
  function setup() {
    const session = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' } } } });
    const row = { updated_at: '2026-10-14T00:00:00.000Z', payload: { video: { size: 5 } }, thumbnail_data: null };
    const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: row }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain);
    const signed = vi.fn().mockResolvedValue({ data: { signedUrl: 'https://storage.example/video' } });
    const client = { auth: { getSession: session }, from: () => chain, storage: { from: () => ({ createSignedUrl: signed }) } } as unknown as SupabaseClient;
    const cache = { load: vi.fn().mockResolvedValue({ outcome: 'missing', reason: 'absent' }), store: vi.fn().mockResolvedValue(undefined), delete: vi.fn() };
    const serializer = { deserialize: vi.fn().mockResolvedValue({}) } as unknown as ProjectSerializer;
    return { repository: new SupabaseProjectRepository(client, serializer, cache), session, row, signed, cache };
  }
  it('reopens cached video without signing or downloading, keyed by owner and remote revision', async () => {
    const { repository, cache, signed, row } = setup();
    const blob = new Blob(['video']);
    cache.load.mockResolvedValue({ outcome: 'found', blob, source: 'device' });
    await repository.load('project');
    expect(await repository.loadVideoBlob('project')).toEqual({ outcome: 'found', blob, source: 'device' });
    expect(cache.load).toHaveBeenCalledWith('cloud/owner/project/2026-10-14T00:00:00.000Z');
    expect(signed).not.toHaveBeenCalled();
    row.updated_at = '2026-10-14T01:00:00.000Z';
    await repository.load('project');
    await repository.loadVideoBlob('project');
    expect(cache.load).toHaveBeenLastCalledWith('cloud/owner/project/2026-10-14T01:00:00.000Z');
  });
  it('rejects cached bytes if the account changes while reading them', async () => {
    const { repository, cache, session } = setup();
    await repository.load('project');
    cache.load.mockImplementation(async () => {
      session.mockResolvedValue({ data: { session: { user: { id: 'other' } } } });
      return { outcome: 'found', blob: new Blob(['private']), source: 'device' };
    });
    await expect(repository.loadVideoBlob('project')).rejects.toThrow('Your account changed');
  });
  it('downloads and retains video when local cache reads fail', async () => {
    const { repository, cache } = setup();
    await repository.load('project');
    cache.load.mockRejectedValue(new Error('Unavailable storage'));
    const fetchMock = vi.fn().mockResolvedValue(new Response('video', { headers: { 'content-type': 'video/mp4' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const progress = vi.fn();
      const result = await repository.loadVideoBlob('project', progress);
      expect(progress).toHaveBeenCalledWith(0);
      expect(progress).toHaveBeenCalledWith(1);
      expect(result.outcome).toBe('found');
      expect(cache.store).toHaveBeenCalledWith('cloud/owner/project/2026-10-14T00:00:00.000Z', expect.any(Blob));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('falls back to cloud when a device cache read never settles', async () => {
    vi.useFakeTimers();
    const { repository, cache } = setup();
    await repository.load('project');
    cache.load.mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('video')));
    try {
      const loading = repository.loadVideoBlob('project');
      await vi.advanceTimersByTimeAsync(10001);
      expect((await loading).outcome).toBe('found');
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('aborts a stalled video response rather than leaving the project loading forever', async () => {
    vi.useFakeTimers();
    const { repository } = setup();
    let downloadSignal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, options) => {
      downloadSignal = options.signal;
      return new Promise(() => {});
    }));
    try {
      const loading = repository.loadVideoBlob('project');
      const rejected = expect(loading).rejects.toThrow('Video loading timed out');
      await vi.advanceTimersByTimeAsync(45001);
      await rejected;
      expect(downloadSignal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); vi.unstubAllGlobals(); }
  });
  it('does not start a download for an aborted project open', async () => {
    const { repository, signed } = setup();
    const controller = new AbortController(); controller.abort();
    await expect(repository.loadVideoBlob('project', undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(signed).not.toHaveBeenCalled();
  });
});

describe('Resumable cloud saves', () => {
  it('never writes metadata for a cancelled video; explicit Resume shares its transfer with Save', async () => {
    const attempts: VideoUploadRequest[] = [];
    let finish!: () => void;
    const transport = { upload: vi.fn((request: VideoUploadRequest) => {
      attempts.push(request);
      return new Promise<void>((resolve, reject) => {
        finish = resolve;
        request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
      });
    }) };
    const uploads = new CloudVideoUploadManager(transport);
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const standardUpload = vi.fn();
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' } } } }) },
      storage: { from: () => ({ upload: standardUpload }) }, from: () => ({ upsert }) } as unknown as SupabaseClient;
    const serializer = { serialize: vi.fn().mockReturnValue({}) } as unknown as ProjectSerializer;
    const repository = new SupabaseProjectRepository(client, serializer, undefined, uploads);
    const project = { id: 'project', name: 'Holiday', createdAt: new Date(), updatedAt: new Date(),
      document: null, thumbnail: null, video: {} } as Project;
    const caching = repository.cacheVideoBlob('project', new Blob(['source']));
    await vi.waitFor(() => expect(attempts.length).toBe(1));
    attempts[0]!.onUrl('https://storage.test/resumable/retained');
    uploads.cancel('owner/project');
    await expect(caching).rejects.toMatchObject({ name: 'AbortError' });
    await expect(repository.save(project)).rejects.toMatchObject({ name: 'AbortError' });
    expect(upsert).not.toHaveBeenCalled();
    expect(transport.upload).toHaveBeenCalledTimes(1);
    const retry = repository.retryVideoUpload('project');
    await vi.waitFor(() => expect(attempts.length).toBe(2));
    const saving = repository.save(project);
    expect(attempts[1]!.resumeUrl).toBe('https://storage.test/resumable/retained');
    finish();
    await Promise.all([retry, saving]);
    expect(transport.upload).toHaveBeenCalledTimes(2);
    expect(standardUpload).not.toHaveBeenCalled();
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(uploads.store.statuses).toEqual([]);
  });
});
