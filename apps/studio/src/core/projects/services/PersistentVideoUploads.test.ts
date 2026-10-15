import { describe, expect, it, vi } from 'vitest';
import { CloudVideoUploadManager } from '@core/projects/services/CloudVideoUploadManager';
import { VideoUploadStore } from '@core/projects/store/VideoUploadStore';
import type { PendingVideoUpload, UploadCheckpoint, PendingVideoUploadRepository } from '@core/projects/domain/PendingVideoUploadRepository';
import type { VideoUploadRequest } from '@core/projects/domain/VideoUploadTransport';

function persistence(): PendingVideoUploadRepository {
  const records = new Map<string, PendingVideoUpload>();
  return {
    add: vi.fn(async record => { records.set(record.key, record); }),
    checkpoint: vi.fn(async (record: UploadCheckpoint) => {
      const previous = records.get(record.key);
      if (previous) records.set(record.key, { ...record, blob: previous.blob });
    }),
    list: vi.fn(async owner => [...records.values()].filter(record => record.owner === owner)),
    remove: vi.fn(async key => { records.delete(key); }),
  };
}

function transfer() {
  const attempts: VideoUploadRequest[] = [];
  const transport = { upload: vi.fn((request: VideoUploadRequest) => {
    attempts.push(request);
    return new Promise<void>((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
    });
  }) };
  return { attempts, transport };
}

describe('Persistent video uploads', () => {
  it('does not start a competing transfer when the same upload is active in another tab', async () => {
    const { transport } = transfer();
    vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_key, _options, work) => work(null)) } });
    try {
      const manager = new CloudVideoUploadManager(transport, new VideoUploadStore(), { scope: 'endpoint' });
      await expect(manager.upload('owner', 'project', new Blob(['video']))).rejects.toThrow('another tab');
      expect(transport.upload).not.toHaveBeenCalled();
      expect(manager.store.statuses[0]).toMatchObject({ phase: 'failed', error: expect.stringContaining('another tab') });
    } finally { vi.unstubAllGlobals(); }
  });
  it('starts the upload before a slow recovery write finishes and retains its early URL', async () => {
    const disk = persistence(); const { attempts, transport } = transfer();
    let release!: () => void;
    const add = vi.mocked(disk.add).getMockImplementation()!;
    vi.mocked(disk.add).mockImplementationOnce(async record => {
      await new Promise<void>(resolve => { release = resolve; });
      await add(record);
    });
    const manager = new CloudVideoUploadManager(transport, new VideoUploadStore(), { persistence: disk });
    const running = manager.upload('owner', 'project', new Blob(['video']));
    expect(attempts).toHaveLength(1);
    expect(manager.store.statuses[0]?.persisted).toBeUndefined();
    attempts[0]!.onUrl('https://storage.test/resumable/early');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    release();
    await manager.flush('owner', 'project');
    expect(manager.store.statuses[0]?.persisted).toBe(true);
    expect((await disk.list('owner'))[0]?.resumeUrl).toBe('https://storage.test/resumable/early');
    manager.reset();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('waits for initial recovery storage before completing a fast network upload', async () => {
    const disk = persistence();
    let release!: () => void;
    const add = vi.mocked(disk.add).getMockImplementation()!;
    vi.mocked(disk.add).mockImplementationOnce(async record => {
      await new Promise<void>(resolve => { release = resolve; });
      await add(record);
    });
    const manager = new CloudVideoUploadManager({ upload: vi.fn().mockResolvedValue(undefined) }, new VideoUploadStore(), { persistence: disk });
    const running = manager.upload('owner', 'project', new Blob(['video']));
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(manager.store.statuses[0]?.phase).toBe('uploading');
    release();
    await running;
    expect(manager.store.statuses[0]).toMatchObject({ phase: 'ready', persisted: true });
    manager.complete('owner/project');
    await vi.waitFor(async () => expect(await disk.list('owner')).toEqual([]));
  });

  it('writes the source once, restores its server URL after refresh and retains Cancel', async () => {
    const disk = persistence(); const { attempts, transport } = transfer();
    const first = new CloudVideoUploadManager(transport, new VideoUploadStore(), { persistence: disk });
    const blob = new File(['original'], 'holiday.mp4');
    const running = first.upload('owner', 'project', blob);
    await vi.waitFor(() => expect(attempts.length).toBe(1));
    attempts[0]!.onUrl('https://storage.test/resumable/partial');
    attempts[0]!.onProgress(4, 8);
    first.cancel('owner/project');
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    await first.flush('owner', 'project');
    expect(disk.add).toHaveBeenCalledTimes(1);
    const second = new CloudVideoUploadManager(transport, new VideoUploadStore(), { persistence: disk });
    await second.restore('owner');
    expect(second.store.statuses[0]).toMatchObject({ phase: 'cancelled', sent: 4, persisted: true });
    expect(second.source('owner', 'project')).toBe(blob);
    expect(second.autoResumeProjects('owner')).toEqual([]);
    const resumed = second.retry('owner', 'project');
    expect(attempts[1]!.resumeUrl).toBe('https://storage.test/resumable/partial');
    second.reset();
    await expect(resumed).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('restores active uploads as auto-resumable without exposing another account sources', async () => {
    const disk = persistence(); const { attempts, transport } = transfer();
    const first = new CloudVideoUploadManager(transport, new VideoUploadStore(), { persistence: disk });
    const running = first.upload('first', 'project', new File(['private'], 'private.mp4'));
    await vi.waitFor(() => expect(attempts.length).toBe(1));
    await first.flush('first', 'project');
    first.reset();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
    const second = new CloudVideoUploadManager(transport, new VideoUploadStore(), { persistence: disk });
    await second.restore('other');
    expect(second.store.statuses).toEqual([]);
    expect(second.source('first', 'project')).toBeNull();
    second.reset();
    await second.restore('first');
    expect(second.autoResumeProjects('first')).toEqual(['project']);
  });

  it('pauses offline, resets estimates and does not auto-resume a user cancellation', async () => {
    const { attempts, transport } = transfer();
    let now = 0;
    const manager = new CloudVideoUploadManager(transport, new VideoUploadStore(), { now: () => now });
    const running = manager.upload('owner', 'project', new Blob(['abcdefghij']));
    attempts[0]!.onProgress(0, 10); now = 1000; attempts[0]!.onProgress(2, 10);
    expect(manager.store.statuses[0]).toMatchObject({ speedBps: 2, remainingSeconds: 4 });
    manager.pauseOffline();
    await expect(running).rejects.toThrow('Connection lost');
    expect(manager.store.statuses[0]).toMatchObject({ phase: 'paused', speedBps: null, remainingSeconds: null });
    expect(manager.autoResumeProjects('owner')).toEqual(['project']);
    manager.cancel('owner/project');
    expect(manager.autoResumeProjects('owner')).toEqual([]);
    await expect(manager.retry('owner', 'project', true)).rejects.toMatchObject({ name: 'AbortError' });
    expect(transport.upload).toHaveBeenCalledTimes(1);
  });

  it('continues uploading on a quota error and explicitly reports that refresh recovery is unavailable', async () => {
    const disk = persistence(); const { attempts, transport } = transfer();
    vi.mocked(disk.add).mockRejectedValue(new DOMException('No space', 'QuotaExceededError'));
    const manager = new CloudVideoUploadManager(transport, new VideoUploadStore(), { persistence: disk });
    const running = manager.upload('owner', 'project', new Blob(['video']));
    await vi.waitFor(() => expect(attempts.length).toBe(1));
    await vi.waitFor(() => expect(manager.store.statuses[0]!.persisted).toBe(false));
    manager.reset();
    await expect(running).rejects.toMatchObject({ name: 'AbortError' });
  });
});
