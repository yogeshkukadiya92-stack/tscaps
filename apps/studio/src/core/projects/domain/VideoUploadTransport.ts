export interface VideoUploadRequest {
  readonly owner: string;
  readonly projectId: string;
  readonly blob: Blob;
  readonly resumeUrl: string | null;
  readonly signal: AbortSignal;
  readonly onUrl: (url: string) => void;
  readonly onProgress: (sent: number, total: number) => void;
  readonly onRetry: () => void;
}

export interface VideoUploadTransport {
  upload(request: VideoUploadRequest): Promise<void>;
}
