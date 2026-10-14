import { useEffect, useState, useSyncExternalStore } from 'react';
import { Link } from 'react-router-dom';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { useEditor } from '@ui/_shared/contexts/modules/EditorContext';
import { useAppRoutes } from '@ui/_shared/hooks/useAppRoutes';
import { useProjects } from '@ui/_shared/contexts/modules/ProjectsContext';
import type { VideoUploadStore, VideoUploadStatus } from '@core/projects/store/VideoUploadStore';
import { BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';

export function VideoUploadPanel() {
  const projects = useProjects();
  const editor = useEditor();
  const { session } = useCloudAuth();
  const [recoveryError, setRecoveryError] = useState('');
  useEffect(() => {
    const uploads = projects.videoUploads;
    const owner = session?.user.id;
    if (!uploads || !owner) return;
    let active = true;
    const resuming = new Set<string>();
    const resume = () => {
      if (!active || !navigator.onLine) return;
      for (const projectId of uploads.autoResumeProjects(owner)) {
        if (resuming.has(projectId)) continue;
        resuming.add(projectId);
        void projects.actions.retryUpload(projectId, true).catch(() => {}).finally(() => resuming.delete(projectId));
      }
    };
    const offline = () => uploads.pauseOffline();
    const checkpoint = () => uploads.checkpoint();
    const initialise = async () => {
      try {
        await projects.cloudRepository!.restoreUploads();
        if (!active) return;
        setRecoveryError('');
        checkpoint(); resume();
      } catch { if (active) setRecoveryError('Could not restore pending uploads from this browser. Reload to try again.'); }
    };
    void initialise();
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    editor.store.addEventListener('change', checkpoint);
    return () => {
      active = false;
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      editor.store.removeEventListener('change', checkpoint);
    };
  }, [projects, editor.store, session?.user.id]);
  if (!projects.videoUploads) return null;
  return <>{recoveryError && <p role="alert" className="m-0 px-3 py-2 text-xs text-danger">{recoveryError}</p>}<UploadList store={projects.videoUploads.store}
    onCancel={key => projects.videoUploads!.cancel(key)}
    onRetry={projectId => projects.actions.retryUpload(projectId)} /></>;
}

interface UploadListProps {
  readonly store: VideoUploadStore;
  readonly onCancel: (key: string) => void;
  readonly onRetry: (projectId: string) => Promise<void>;
}

function UploadList({ store, onCancel, onRetry }: UploadListProps) {
  const routes = useAppRoutes();
  const statuses = useSyncExternalStore(
    listener => {
      store.addEventListener('change', listener);
      return () => store.removeEventListener('change', listener);
    },
    () => store.statuses,
  );
  if (!statuses.length) return null;
  return <section aria-label="Video uploads" className="shrink-0 max-h-[35dvh] overflow-y-auto border-b border-edge-subtle bg-surface-1 px-3 py-2 lg:px-8">
    {statuses.map(status => <div key={status.key} className="mx-auto max-w-3xl"><VideoUploadCard status={status}
      onCancel={() => onCancel(status.key)} onRetry={() => onRetry(status.projectId)} />
      {status.persisted && <Link className="text-xs text-accent underline" to={routes.project(status.projectId)}>Open project</Link>}
    </div>)}
  </section>;
}

export function VideoUploadCard({ status, onCancel, onRetry }: {
  readonly status: VideoUploadStatus;
  readonly onCancel: () => void;
  readonly onRetry: () => Promise<void>;
}) {
  const [retryError, setRetryError] = useState('');
  const [retryBusy, setRetryBusy] = useState(false);
  const active = status.phase === 'uploading' || status.phase === 'retrying' || status.phase === 'paused';
  // Bytes sent are not a server confirmation. Reserve 100% for onSuccess.
  const percent = status.phase === 'ready' ? 100 : Math.min(99, Math.floor(status.sent / Math.max(1, status.total) * 100));
  const label = status.phase === 'retrying' ? 'Connection interrupted — reconnecting…'
    : status.phase === 'paused' ? 'Waiting for connection — will resume automatically'
    : status.phase === 'cancelled' ? 'Upload cancelled — Resume to continue'
    : status.phase === 'failed' ? status.error ?? 'Upload interrupted — Retry to resume'
    : status.phase === 'ready' ? 'Video uploaded — finishing project save'
    : status.sent >= status.total ? 'Confirming upload…' : 'Uploading video';

  async function retry() {
    setRetryError(''); setRetryBusy(true);
    try { await onRetry(); }
    catch { setRetryError('Could not finish uploading or saving. Check your connection and try again.'); }
    finally { setRetryBusy(false); }
  }

  return <div className="mx-auto w-full max-w-3xl py-1 text-xs text-fg-secondary">
    <div className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-fg-primary" title={status.fileName}>{status.fileName}</span>
      <span className="font-mono tabular-nums">{percent}%</span>
      {active ? <button type="button" className={BTN_SECONDARY_SM} onClick={onCancel}>Cancel</button>
        : <button type="button" className={BTN_SECONDARY_SM} disabled={retryBusy} onClick={() => void retry()}>
          {retryBusy ? 'Working…' : status.phase === 'cancelled' ? 'Resume' : status.phase === 'ready' ? 'Save project' : 'Retry'}
        </button>}
    </div>
    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" role="progressbar"
      aria-label={`Upload progress for ${status.fileName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="h-full origin-left bg-accent transition-transform duration-base motion-reduce:transition-none"
        style={{ transform: `scaleX(${percent / 100})` }} />
    </div>
    <p className="mt-1 mb-0" role="status">{label} · {formatBytes(status.sent)} / {formatBytes(status.total)}</p>
    {status.phase === 'uploading' && <p className="mt-1 mb-0 font-mono tabular-nums" aria-label="Upload speed and time remaining">
      {status.speedBps ? formatSpeed(status.speedBps) : 'Calculating speed…'}
      {status.remainingSeconds != null && ` · About ${formatRemaining(status.remainingSeconds)} left`}
    </p>}
    {status.persisted === false && <p className="mt-1 mb-0 text-danger">This browser could not keep the file. Keep this tab open to finish uploading.</p>}
    {retryError && !active && <p className="mt-1 mb-0 text-danger" role="alert">{retryError}</p>}
  </div>;
}

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRemaining(seconds: number): string {
  const rounded = Math.max(1, Math.ceil(seconds));
  if (rounded < 60) return `${rounded}s`;
  if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
  return `${Math.floor(rounded / 3600)}h ${Math.ceil(rounded % 3600 / 60)}m`;
}

function formatSpeed(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB/s` : `${formatBytes(bytes)}/s`;
}
