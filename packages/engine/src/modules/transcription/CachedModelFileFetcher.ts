import type { ModelFileCache } from '@modules/transcription/ModelFileCache';
import type { ModelFileFetcher } from '@modules/transcription/ModelFileFetcher';

/** Cache-first model downloads, shared by requests and same-origin tabs. */
export class CachedModelFileFetcher implements ModelFileFetcher {
  private readonly pending = new Map<string, Promise<Response>>();

  constructor(
    private readonly cache: ModelFileCache,
    private readonly fetcher: ModelFileFetcher,
  ) {}

  async fetch(url: string, init?: RequestInit): Promise<Response> {
    // Only full, public GETs are safe to share. Never reuse a ranged download
    // or interfere with a caller's cancellation/authorization semantics.
    if ((init?.method ?? 'GET').toUpperCase() !== 'GET' || init?.signal || init?.body
      || new Headers(init?.headers).has('range') || new Headers(init?.headers).has('authorization')) {
      return this.fetcher.fetch(url, init);
    }
    let attempt = this.pending.get(url);
    if (!attempt) {
      attempt = this.withDownloadLock(url, () => this.load(url, init));
      this.pending.set(url, attempt);
      void attempt.finally(() => { if (this.pending.get(url) === attempt) this.pending.delete(url); }).catch(() => undefined);
    }
    // Each consumer gets an independent body, including concurrent callers.
    return (await attempt).clone();
  }

  private async load(url: string, init?: RequestInit): Promise<Response> {
    const cached = await this.cache.match(url);
    if (cached) return cached;
    const response = await this.fetcher.fetch(url, init);
    // Never persist errors or partial bodies; a retry must reach the host.
    if (response.status === 200) await this.cache.put(url, response.clone());
    return response;
  }

  private async withDownloadLock(url: string, load: () => Promise<Response>): Promise<Response> {
    if (typeof navigator !== 'undefined' && navigator.locks) {
      // Re-check storage after taking the lock: another tab may just have
      // finished saving the model while this tab was waiting.
      return await navigator.locks.request(`tscaps-model:${url}`, load);
    }
    return load();
  }
}
