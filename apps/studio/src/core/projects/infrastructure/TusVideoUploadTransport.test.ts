import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, Upload } from 'tus-js-client';
import type { SupabaseClient } from '@supabase/supabase-js';
import { TusVideoUploadTransport, resumableUploadEndpoint } from '@core/projects/infrastructure/TusVideoUploadTransport';

type TusOptions = ConstructorParameters<typeof Upload>[1];
const fakeTus = vi.hoisted(() => ({ options: null as ConstructorParameters<typeof Upload>[1] | null,
  start: vi.fn(), abort: vi.fn().mockResolvedValue(undefined) }));
vi.mock('tus-js-client', () => ({ Upload: class {
  url = 'https://storage.test/storage/v1/upload/resumable/retained';
  constructor(_blob: Blob, options: ConstructorParameters<typeof Upload>[1]) { fakeTus.options = options; }
  start = fakeTus.start;
  abort = fakeTus.abort;
} }));

function setup() {
  const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' }, access_token: 'token' } } });
  const client = { auth: { getSession } } as unknown as SupabaseClient;
  const transport = new TusVideoUploadTransport(client, 'https://storage.test/storage/v1/upload/resumable', 'public-test-key');
  const controller = new AbortController();
  const onProgress = vi.fn(); const onUrl = vi.fn(); const onRetry = vi.fn();
  const run = transport.upload({ owner: 'owner', projectId: 'project', blob: new Blob(['video']),
    resumeUrl: 'https://storage.test/storage/v1/upload/resumable/retained',
    signal: controller.signal, onProgress, onUrl, onRetry });
  return { run, controller, getSession, onProgress, onUrl, onRetry };
}

describe('TusVideoUploadTransport', () => {
  afterEach(() => { fakeTus.options = null; vi.clearAllMocks(); });

  it('uses direct hosted storage and preserves self-hosted gateway origins and paths', () => {
    expect(resumableUploadEndpoint('https://abc.supabase.co')).toBe('https://abc.storage.supabase.co/storage/v1/upload/resumable');
    expect(resumableUploadEndpoint('https://gateway.example/supabase/')).toBe('https://gateway.example/supabase/storage/v1/upload/resumable');
  });

  it('resumes the exact private object with 6 MB chunks and fresh authorization per request', async () => {
    const { run, getSession, onProgress, onUrl } = setup();
    await vi.waitFor(() => expect(fakeTus.start).toHaveBeenCalled());
    const options = fakeTus.options!;
    expect(options).toMatchObject({ uploadUrl: 'https://storage.test/storage/v1/upload/resumable/retained',
      chunkSize: 6 * 1024 * 1024, storeFingerprintForResuming: false,
      headers: { 'x-upsert': 'true' }, metadata: { bucketName: 'reelstudio-videos', objectName: 'owner/project/original' } });
    const setHeader = vi.fn();
    const req = { getURL: () => options.uploadUrl!, setHeader } as unknown as HttpRequest;
    await options.onBeforeRequest!(req);
    expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer token');
    expect(setHeader).toHaveBeenCalledWith('apikey', 'public-test-key');
    getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' }, access_token: 'refreshed' } } });
    await options.onBeforeRequest!(req);
    expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer refreshed');
    options.onProgress!(2, 5);
    options.onUploadUrlAvailable!();
    expect(onProgress).toHaveBeenCalledWith(2, 5);
    expect(onUrl).toHaveBeenCalledWith(options.uploadUrl);
    options.onSuccess!({} as Parameters<NonNullable<typeof options.onSuccess>>[0]);
    await run;
  });

  it('rejects a changed account and never sends its token to another origin', async () => {
    const { run, getSession, controller } = setup();
    await vi.waitFor(() => expect(fakeTus.start).toHaveBeenCalled());
    const setHeader = vi.fn();
    const req = { getURL: () => 'https://foreign.test/storage/v1/upload/resumable/id', setHeader } as unknown as HttpRequest;
    await expect(fakeTus.options!.onBeforeRequest!(req)).rejects.toThrow('Invalid video upload URL');
    expect(setHeader).not.toHaveBeenCalled();
    getSession.mockResolvedValue({ data: { session: { user: { id: 'other' }, access_token: 'other-token' } } });
    await expect(fakeTus.options!.onBeforeRequest!(req)).rejects.toThrow('account changed');
    expect(setHeader).not.toHaveBeenCalled();
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('waits for abort to complete without terminating the server upload', async () => {
    const { run, controller } = setup();
    await vi.waitFor(() => expect(fakeTus.start).toHaveBeenCalled());
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(fakeTus.abort).toHaveBeenCalledWith();
  });

  it('retries transient failures but leaves authorization failures for the user', async () => {
    const { run, controller, onRetry } = setup();
    await vi.waitFor(() => expect(fakeTus.start).toHaveBeenCalled());
    const retry = (status: number) => fakeTus.options!.onShouldRetry!(
      { originalResponse: { getStatus: () => status } } as Parameters<NonNullable<TusOptions['onShouldRetry']>>[0], 0, fakeTus.options!);
    expect(retry(503)).toBe(true);
    expect(retry(0)).toBe(true);
    expect(retry(403)).toBe(false);
    expect(onRetry).toHaveBeenCalledTimes(2);
    controller.abort();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
  });
});
