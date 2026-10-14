import type { SupabaseClient } from '@supabase/supabase-js';
import type { Upload } from 'tus-js-client';
import type { VideoUploadRequest, VideoUploadTransport } from '@core/projects/domain/VideoUploadTransport';
import { VideoUploadNetworkError } from '@core/projects/domain/VideoUploadNetworkError';

/** Uses the same configured API origin on self-hosted Supabase installations. */
export function resumableUploadEndpoint(supabaseUrl: string): string {
  const url = new URL(supabaseUrl);
  if (/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname)) {
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co');
  }
  return `${url.href.replace(/\/$/, '')}/storage/v1/upload/resumable`;
}

export class TusVideoUploadTransport implements VideoUploadTransport {
  constructor(private readonly client: SupabaseClient, private readonly endpoint: string, private readonly publicKey?: string) {}

  async upload(request: VideoUploadRequest): Promise<void> {
    const { Upload: TusUpload } = await import('tus-js-client');
    request.signal.throwIfAborted();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: unknown) => {
        if (settled) return;
        settled = true;
        request.signal.removeEventListener('abort', abort);
        if (error) reject(error); else resolve();
      };
      const abort = () => {
        // Keep the server's completed chunks for an explicit Resume.
        void upload.abort().then(() => finish(request.signal.reason), () => finish(request.signal.reason));
      };
      const upload: Upload = new TusUpload(request.blob, {
        endpoint: this.endpoint,
        uploadUrl: request.resumeUrl,
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 1000, 3000, 5000, 10000],
        uploadDataDuringCreation: true,
        // The manager retains the URL with its exact Blob and owner. Avoid
        // guessing a fingerprint for different same-sized source files.
        storeFingerprintForResuming: false,
        headers: { 'x-upsert': 'true' },
        metadata: {
          bucketName: 'reelstudio-videos', objectName: `${request.owner}/${request.projectId}/original`,
          contentType: request.blob.type || 'application/octet-stream', cacheControl: '3600',
        },
        onBeforeRequest: async req => {
          request.signal.throwIfAborted();
          // Refresh credentials for every chunk, including resumed transfers.
          const { data, error } = await this.client.auth.getSession();
          request.signal.throwIfAborted();
          if (error) throw error;
          if (!data.session || data.session.user.id !== request.owner) {
            throw new Error('Your account changed. Please reopen the project.');
          }
          // A resume URL must belong to this configured storage endpoint.
          const target = new URL(req.getURL());
          const endpoint = new URL(this.endpoint);
          if (target.origin !== endpoint.origin || !target.pathname.startsWith(`${endpoint.pathname}/`) && target.pathname !== endpoint.pathname) {
            throw new Error('Invalid video upload URL.');
          }
          req.setHeader('Authorization', `Bearer ${data.session.access_token}`);
          if (this.publicKey) req.setHeader('apikey', this.publicKey);
        },
        onUploadUrlAvailable: () => { if (upload.url) request.onUrl(upload.url); },
        onProgress: request.onProgress,
        onShouldRetry: error => {
          if (request.signal.aborted) return false;
          const status = error.originalResponse?.getStatus() ?? 0;
          const retry = status === 0 || status === 409 || status === 423 || status === 429 || status >= 500;
          if (retry) request.onRetry();
          return retry;
        },
        onError: error => finish('originalRequest' in error && !error.originalResponse ? new VideoUploadNetworkError() : error),
        onSuccess: () => finish(),
      });
      request.signal.addEventListener('abort', abort, { once: true });
      upload.start();
    });
  }
}
