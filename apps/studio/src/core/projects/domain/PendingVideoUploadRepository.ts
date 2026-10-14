import type { SerializedProject } from '@core/projects/services/ProjectSerializer';
import type { VideoUploadStatus } from '@core/projects/store/VideoUploadStore';

export interface UploadDraft {
  readonly payload: SerializedProject;
  readonly thumbnail: Blob | null;
}
export interface PendingVideoUpload {
  readonly key: string;
  readonly owner: string;
  readonly blob: Blob;
  readonly resumeUrl: string | null;
  readonly autoResume: boolean;
  readonly createdAt: number;
  readonly status: VideoUploadStatus;
  readonly draft: UploadDraft | null;
}
export type UploadCheckpoint = Omit<PendingVideoUpload, 'blob'>;
export interface PendingVideoUploadRepository {
  add(record: PendingVideoUpload): Promise<void>;
  checkpoint(record: UploadCheckpoint): Promise<void>;
  list(owner: string): Promise<PendingVideoUpload[]>;
  remove(key: string, createdAt?: number): Promise<void>;
}
