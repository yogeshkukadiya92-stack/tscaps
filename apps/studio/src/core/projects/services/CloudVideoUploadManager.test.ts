import { describe, expect, it, vi } from 'vitest';
import { CloudVideoUploadManager } from '@core/projects/services/CloudVideoUploadManager';
import type { VideoUploadRequest } from '@core/projects/domain/VideoUploadTransport';

function setup() {
  const requests: VideoUploadRequest[] = [];
  const completions: { resolve: () => void; reject: (error: unknown) => void }[] = [];
  const upload = vi.fn((request: VideoUploadRequest) => {
    requests.push(request);
    return new Promise<void>((resolve, reject) => {
      completions.push({ resolve, reject });
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true });
    });
  });
  const manager = new CloudVideoUploadManager({ upload });
  const blob = new File(['source video'], 'holiday.mp4');
  return { manager, upload, requests, completions, blob };
}

describe('CloudVideoUploadManager', () => {
  it('shares concurrent writes, reports bytes, and confirms completion only after the server succeeds', async () => {
    const { manager, requests, completions, blob, upload } = setup();
    const first = manager.upload('owner', 'project', blob);
    expect(manager.upload('owner', 'project', blob)).toBe(first);
    requests[0]!.onProgress(blob.size, blob.size);
    expect(manager.store.statuses[0]).toMatchObject({ phase: 'uploading', sent: blob.size, total: blob.size, fileName: 'holiday.mp4' });
    completions[0]!.resolve();
    await first;
    expect(manager.store.statuses[0]!.phase).toBe('ready');
    await manager.upload('owner', 'project', blob);
    expect(upload).toHaveBeenCalledTimes(1);
    manager.complete('owner/project');
    expect(manager.store.statuses).toEqual([]);
    await expect(manager.retry('owner', 'project')).rejects.toThrow('no longer available');
  });

  it('retains the resume URL on failure and waits for explicit Retry before resending', async () => {
    const { manager, requests, completions, blob, upload } = setup();
    const first = manager.upload('owner', 'project', blob);
    requests[0]!.onUrl('https://storage.test/upload/offset');
    requests[0]!.onProgress(6, blob.size);
    requests[0]!.onRetry();
    expect(manager.store.statuses[0]!.phase).toBe('retrying');
    completions[0]!.reject(new Error('Network disconnected'));
    await expect(first).rejects.toThrow('Network disconnected');
    await expect(manager.upload('owner', 'project', blob)).rejects.toThrow('Network disconnected');
    expect(upload).toHaveBeenCalledTimes(1);
    const retry = manager.retry('owner', 'project');
    expect(requests[1]!.resumeUrl).toBe('https://storage.test/upload/offset');
    completions[1]!.resolve();
    await retry;
    expect(manager.store.statuses[0]!.phase).toBe('ready');
  });

  it('Cancel stops transfer without discarding chunks, and Resume does not overlap the abort', async () => {
    const { manager, requests, completions, blob, upload } = setup();
    const first = manager.upload('owner', 'project', blob);
    requests[0]!.onUrl('https://storage.test/upload/retained');
    manager.cancel('owner/project');
    requests[0]!.onProgress(10, blob.size);
    expect(manager.store.statuses[0]).toMatchObject({ phase: 'cancelled', sent: 0 });
    await expect(manager.upload('owner', 'project', blob)).rejects.toMatchObject({ name: 'AbortError' });
    const resumed = manager.retry('owner', 'project');
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
    expect(requests[1]!.resumeUrl).toBe('https://storage.test/upload/retained');
    completions[1]!.resolve();
    await resumed;
  });

  it('coalesces rapid Resume clicks while a cancelled request is stopping', async () => {
    const { manager, requests, completions, blob, upload } = setup();
    const first = manager.upload('owner', 'project', blob);
    manager.cancel('owner/project');
    const retries = [manager.retry('owner', 'project'), manager.retry('owner', 'project')];
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(requests.length).toBe(2));
    completions[1]!.resolve();
    await Promise.all(retries);
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it('account changes abort jobs, release state and ignore stale callbacks', async () => {
    const { manager, requests, blob } = setup();
    const first = manager.upload('first', 'project', blob);
    requests[0]!.onUrl('https://storage.test/upload/private');
    manager.reset();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    requests[0]!.onProgress(5, blob.size);
    expect(manager.store.statuses).toEqual([]);
    await expect(manager.retry('first', 'project')).rejects.toThrow('no longer available');
    void manager.upload('second', 'project', blob);
    expect(requests[1]).toMatchObject({ owner: 'second', resumeUrl: null });
    manager.reset();
  });

  it('does not reuse offsets for a different source while an upload is incomplete', async () => {
    const { manager, requests, blob } = setup();
    void manager.upload('owner', 'project', blob);
    requests[0]!.onUrl('https://storage.test/upload/old');
    await expect(manager.upload('owner', 'project', new File(['other'], 'holiday.mp4'))).rejects.toThrow('previous video upload');
    manager.reset();
  });
});
