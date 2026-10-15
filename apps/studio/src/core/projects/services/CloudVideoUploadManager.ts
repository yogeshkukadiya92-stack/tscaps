import type { VideoUploadTransport } from '@core/projects/domain/VideoUploadTransport';
import { VideoUploadStore, type VideoUploadStatus } from '@core/projects/store/VideoUploadStore';
import type { PendingVideoUploadRepository, UploadDraft } from '@core/projects/domain/PendingVideoUploadRepository';
import { UploadSpeedEstimator } from '@core/projects/services/UploadSpeedEstimator';
import { VideoUploadNetworkError } from '@core/projects/domain/VideoUploadNetworkError';
import { VideoUploadBusyError } from '@core/projects/domain/VideoUploadBusyError';

interface UploadJob {
  readonly owner: string;
  readonly blob: Blob;
  status: VideoUploadStatus;
  resumeUrl: string | null;
  controller: AbortController | null;
  running: Promise<void> | null;
  failure: unknown;
  createdAt: number;
  draft: UploadDraft | null;
  draftSignature: string;
  autoResume: boolean;
  writes: Promise<void>;
  lastCheckpoint: number;
  speed: UploadSpeedEstimator;
}

interface UploadManagerOptions {
  readonly persistence?: PendingVideoUploadRepository;
  readonly captureDraft?: (projectId: string, blob: Blob, createdAt: number) => UploadDraft | null;
  readonly now?: () => number;
  readonly scope?: string;
}

/** Keeps source bytes, draft and server URL available across reloads. */
export class CloudVideoUploadManager {
  private readonly jobs = new Map<string, UploadJob>();
  private restoration: { owner: string; running: Promise<void> } | null = null;
  private generation = 0;

  constructor(private readonly transport: VideoUploadTransport, readonly store = new VideoUploadStore(),
    private readonly options: UploadManagerOptions = {}) {}

  restore(owner: string): Promise<void> {
    if (this.restoration?.owner === owner) return this.restoration.running;
    const generation = this.generation;
    const running = (this.options.persistence?.list(owner) ?? Promise.resolve([])).then(records => {
      if (generation !== this.generation) return;
      for (const record of records) {
        if (this.jobs.has(record.key)) continue;
        const job = this.makeJob(record.owner, record.status.projectId, record.blob, record.createdAt);
        Object.assign(job, { resumeUrl: record.resumeUrl, draft: record.draft, autoResume: record.autoResume });
        job.status = { ...record.status, persisted: true, speedBps: null, remainingSeconds: null,
          phase: record.autoResume ? 'paused' : 'cancelled', error: null };
        this.jobs.set(record.key, job);
        this.store.publish(job.status);
      }
    });
    this.restoration = { owner, running };
    void running.catch(() => { if (this.restoration?.running === running) this.restoration = null; });
    return running;
  }

  source(owner: string, projectId: string): Blob | null { return this.jobs.get(`${owner}/${projectId}`)?.blob ?? null; }
  draft(owner: string, projectId: string): UploadDraft | null { return this.jobs.get(`${owner}/${projectId}`)?.draft ?? null; }
  flush(owner: string, projectId: string): Promise<void> { return this.jobs.get(`${owner}/${projectId}`)?.writes ?? Promise.resolve(); }
  autoResumeProjects(owner: string): string[] {
    return [...this.jobs.values()].filter(job => job.owner === owner && job.autoResume && job.status.phase === 'paused')
      .map(job => job.status.projectId);
  }

  checkpoint(): void {
    for (const job of this.jobs.values()) {
      const draft = this.options.captureDraft?.(job.status.projectId, job.blob, job.createdAt);
      if (draft) this.setDraft(job.owner, job.status.projectId, draft);
    }
  }

  setDraft(owner: string, projectId: string, draft: UploadDraft): void {
    const job = this.jobs.get(`${owner}/${projectId}`);
    if (!job) return;
    const { updatedAt: _updatedAt, ...content } = draft.payload;
    const signature = JSON.stringify(content);
    if (signature === job.draftSignature && job.draft?.thumbnail === draft.thumbnail) return;
    job.draft = draft; job.draftSignature = signature;
    void this.persist(job);
  }

  pauseOffline(): void {
    for (const job of this.jobs.values()) {
      if (job.status.phase !== 'uploading' && job.status.phase !== 'retrying') continue;
      job.controller?.abort(new VideoUploadNetworkError());
      this.publish(job, { phase: 'paused', speedBps: null, remainingSeconds: null });
      void this.persist(job);
    }
  }

  upload(owner: string, projectId: string, blob: Blob): Promise<void> {
    const key = `${owner}/${projectId}`;
    const previous = this.jobs.get(key);
    if (previous?.blob === blob) {
      if (previous.status.phase === 'ready') return Promise.resolve();
      if (previous.running && !previous.controller?.signal.aborted) return previous.running;
      // A save after cancellation or failure must not silently restart the transfer.
      return Promise.reject(previous.failure ?? new Error('Resume the video upload before saving.'));
    }
    if (previous?.status.phase === 'ready') this.discard(key);
    else if (previous) {
      // Do not race two sources into the same storage object.
      return Promise.reject(new Error('Finish or discard the previous video upload before replacing it.'));
    }
    const job = this.makeJob(owner, projectId, blob, Date.now());
    this.jobs.set(key, job);
    const preparing = this.options.persistence ? this.persist(job, true) : undefined;
    return this.start(job, preparing);
  }

  async retry(owner: string, projectId: string, automatic = false): Promise<void> {
    const job = this.jobs.get(`${owner}/${projectId}`);
    if (!job) throw new Error('This upload is no longer available. Choose the file again.');
    if (automatic && !job.autoResume) throw new DOMException('Upload cancelled', 'AbortError');
    if (job.running) {
      if (!job.controller?.signal.aborted) return job.running;
      // Abort must finish before starting a HEAD / PATCH against the same upload URL.
      await job.running.catch(() => {});
    }
    if (this.jobs.get(job.status.key) !== job) throw new Error('This upload is no longer available.');
    if (automatic && !job.autoResume) throw new DOMException('Upload cancelled', 'AbortError');
    if (job.status.phase === 'ready') return;
    if (job.running) return job.running;
    return this.start(job);
  }

  cancel(key: string): void {
    const job = this.jobs.get(key);
    if (!job || job.status.phase === 'ready' || job.status.phase === 'cancelled') return;
    job.failure = new DOMException('Video upload cancelled. Resume it before saving.', 'AbortError');
    job.autoResume = false;
    job.controller?.abort(job.failure);
    this.publish(job, { phase: 'cancelled', error: null, speedBps: null, remainingSeconds: null });
    void this.persist(job);
  }

  /** Deletion/account changes also release retained source bytes. */
  discard(key: string): void {
    const job = this.jobs.get(key);
    this.cancel(key);
    this.jobs.delete(key);
    this.store.remove(key);
    void (job?.writes ?? Promise.resolve()).then(() => this.options.persistence?.remove(key, job?.createdAt)).catch(() => {});
  }

  complete(key: string): void {
    const job = this.jobs.get(key);
    if (job?.status.phase !== 'ready') return;
    this.jobs.delete(key);
    this.store.remove(key);
    this.store.dispatchEvent(new Event('completed'));
    void job.writes.then(() => this.options.persistence?.remove(key, job.createdAt)).catch(() => {});
  }

  reset(): void {
    // Signing out hides/stops transfers but retains owner-scoped recovery for the next sign-in.
    this.generation++;
    for (const job of this.jobs.values()) job.controller?.abort(new DOMException('Account changed', 'AbortError'));
    this.jobs.clear();
    this.restoration = null;
    this.store.reset();
  }

  private start(job: UploadJob, preparing?: Promise<void>): Promise<void> {
    const controller = new AbortController();
    job.controller = controller;
    job.failure = null;
    job.autoResume = true;
    job.speed.reset();
    this.publish(job, { phase: 'uploading', error: null, speedBps: null, remainingSeconds: null });
    void this.persist(job);
    const transfer = () => {
      controller.signal.throwIfAborted();
      return this.transport.upload({
      owner: job.owner, projectId: job.status.projectId, blob: job.blob,
      resumeUrl: job.resumeUrl, signal: controller.signal,
      onUrl: url => { if (!controller.signal.aborted) { job.resumeUrl = url; void this.persist(job); } },
      onProgress: (sent, total) => {
        if (controller.signal.aborted) return;
        const now = this.now();
        job.speed.sample(sent, now);
        this.publish(job, { phase: 'uploading', sent: Math.max(0, Math.min(total, sent)), total,
          ...job.speed.estimate(total, now) });
        if (now - job.lastCheckpoint >= 1000) { job.lastCheckpoint = now; void this.persist(job); }
      },
      onRetry: () => { if (!controller.signal.aborted) this.publish(job, { phase: 'retrying', speedBps: null, remainingSeconds: null }); },
    });
    };
    const clock = setInterval(() => {
      if (!controller.signal.aborted && job.status.phase === 'uploading') {
        this.publish(job, job.speed.estimate(job.status.total, this.now()));
      }
    }, 1000);
    const protectedTransfer = async (): Promise<void> => {
      // Avoid two live tabs sending PATCH requests for the same private upload.
      if (this.options.scope && typeof navigator !== 'undefined' && navigator.locks) {
        await navigator.locks.request(`reelstudio-upload:${this.options.scope}:${job.status.key}`,
          { ifAvailable: true }, async lock => {
            if (!lock) throw new VideoUploadBusyError();
            await transfer();
          });
        return;
      }
      return transfer();
    };
    // Start the network transfer while IndexedDB retains the source. Keep
    // completion behind that initial write so cleanup cannot race recovery.
    const running = protectedTransfer().then(async () => {
      await preparing;
      controller.signal.throwIfAborted();
      this.publish(job, { phase: 'ready', sent: job.blob.size, speedBps: null, remainingSeconds: null });
      void this.persist(job);
    }).catch((error: unknown) => {
      job.failure = error;
      if (!controller.signal.aborted) this.publish(job, {
        phase: error instanceof VideoUploadNetworkError ? 'paused' : 'failed', speedBps: null, remainingSeconds: null,
        error: error instanceof VideoUploadBusyError ? error.message : 'Upload interrupted — Retry to resume',
      });
      void this.persist(job);
      throw error;
    }).finally(() => {
      clearInterval(clock);
      if (job.running === running) job.running = null;
    });
    job.running = running;
    // Cancellation can reject before a caller gets to await the transfer.
    void running.catch(() => {});
    return running;
  }

  private now(): number { return this.options.now?.() ?? performance.now(); }

  private makeJob(owner: string, projectId: string, blob: Blob, createdAt: number): UploadJob {
    return { owner, blob, createdAt, resumeUrl: null, controller: null, running: null, failure: null,
      draft: this.options.captureDraft?.(projectId, blob, createdAt) ?? null,
      draftSignature: '', autoResume: true, writes: Promise.resolve(), lastCheckpoint: 0,
      speed: new UploadSpeedEstimator(),
      status: { key: `${owner}/${projectId}`, projectId,
        fileName: blob instanceof File ? blob.name : 'Source video', phase: 'uploading', sent: 0,
        total: blob.size, error: null } };
  }

  private persist(job: UploadJob, initial = false): Promise<void> {
    const persistence = this.options.persistence;
    if (!persistence) return Promise.resolve();
    const checkpoint = { key: job.status.key, owner: job.owner, resumeUrl: job.resumeUrl,
      createdAt: job.createdAt, autoResume: job.autoResume, status: job.status, draft: job.draft };
    job.writes = job.writes.then(async () => {
      if (initial) {
        await persistence.add({ ...checkpoint, blob: job.blob });
        this.publish(job, { persisted: true });
      }
      else if (job.status.persisted) await persistence.checkpoint(checkpoint);
    }).catch(() => this.publish(job, { persisted: false }));
    return job.writes;
  }

  private publish(job: UploadJob, patch: Partial<VideoUploadStatus>): void {
    job.status = { ...job.status, ...patch };
    if (this.jobs.get(job.status.key) === job) this.store.publish(job.status);
  }
}
