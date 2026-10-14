export type VideoUploadPhase = 'uploading' | 'retrying' | 'paused' | 'cancelled' | 'failed' | 'ready';

export interface VideoUploadStatus {
  readonly key: string;
  readonly projectId: string;
  readonly fileName: string;
  readonly phase: VideoUploadPhase;
  readonly sent: number;
  readonly total: number;
  readonly error: string | null;
  readonly speedBps?: number | null;
  readonly remainingSeconds?: number | null;
  readonly persisted?: boolean;
}

/** Separate from editor state so transfer ticks do not repaint the editor. */
export class VideoUploadStore extends EventTarget {
  private snapshot: readonly VideoUploadStatus[] = [];
  get statuses(): readonly VideoUploadStatus[] { return this.snapshot; }

  publish(status: VideoUploadStatus): void {
    this.snapshot = [...this.snapshot.filter(item => item.key !== status.key), status];
    this.dispatchEvent(new Event('change'));
  }

  remove(key: string): void {
    this.snapshot = this.snapshot.filter(item => item.key !== key);
    this.dispatchEvent(new Event('change'));
  }

  reset(): void {
    this.snapshot = [];
    this.dispatchEvent(new Event('change'));
  }
}
