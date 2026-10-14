import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRepository, LoadVideoBlobProgressCallback } from '@core/projects/domain/ProjectRepository';
import type { Project } from '@core/projects/domain/Project';
import { ProjectMetadata } from '@core/projects/domain/ProjectMetadata';
import type { ProjectSerializer, SerializedProject } from '@core/projects/services/ProjectSerializer';
import type { VideoBlobLookup } from '@core/videos/domain/VideoBlobLookup';
import type { VideoBlobCache } from '@core/videos/domain/VideoBlobCache';
import type { CloudVideoUploadManager } from '@core/projects/services/CloudVideoUploadManager';

const TABLE = 'reelstudio_projects';
const BUCKET = 'reelstudio-videos';
interface CloudProjectRow {
  id: string; user_id: string; name: string; created_at: string; updated_at: string;
  has_document: boolean; thumbnail_data: string | null; payload: SerializedProject;
}

function encodeThumbnail(blob: Blob | null): Promise<string | null> {
  if (!blob) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function decodeThumbnail(value: string | null): Blob | null {
  if (!value || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)) return null;
  const [header, data] = value.split(',');
  return new Blob([Uint8Array.from(atob(data!), c => c.charCodeAt(0))], { type: header!.split(':')[1]!.split(';')[0]! });
}

/** Remote data is authoritative; failed uploads/saves never silently become local-only saves. */
export class SupabaseProjectRepository implements ProjectRepository {
  private readonly pendingVideos = new Map<string, Blob>();
  private readonly videoVersions = new Map<string, string>();
  constructor(private readonly client: SupabaseClient, private readonly serializer: ProjectSerializer,
    private readonly videoCache?: VideoBlobCache, private readonly uploads?: CloudVideoUploadManager) {}

  private async owner(): Promise<string> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Sign in to access your projects.');
    return data.session.user.id;
  }
  private async assertOwner(id: string): Promise<void> {
    if (await this.owner() !== id) throw new Error('Your account changed. Please reopen the project.');
  }
  private path(owner: string, projectId: string): string { return `${owner}/${projectId}/original`; }

  async restoreUploads(): Promise<void> {
    const owner = await this.owner();
    await this.restorePending(owner);
  }

  private async restorePending(owner: string): Promise<void> {
    await this.uploads?.restore(owner);
    await this.assertOwner(owner);
    for (const status of this.uploads?.store.statuses ?? []) {
      if (status.key !== `${owner}/${status.projectId}` || status.phase === 'ready') continue;
      const blob = this.uploads?.source(owner, status.projectId);
      if (blob) this.pendingVideos.set(this.path(owner, status.projectId), blob);
    }
  }

  async saveUploadDraft(projectId: string): Promise<void> {
    const owner = await this.owner();
    const draft = this.uploads?.draft(owner, projectId);
    if (!draft) throw new Error('Open the project and save it to finish recovery.');
    const project = await this.serializer.deserialize(draft.payload, draft.thumbnail);
    await this.assertOwner(owner);
    await this.save(project);
  }

  async list(): Promise<ProjectMetadata[]> {
    const owner = await this.owner();
    const { data, error } = await this.client.from(TABLE).select('id,user_id,name,created_at,updated_at,has_document,thumbnail_data,video')
      .eq('user_id', owner).is('deleted_at', null).order('updated_at', { ascending: false });
    if (error) throw error;
    await this.assertOwner(owner);
    return (data ?? []).map(row => {
      const thumbnail = decodeThumbnail(row.thumbnail_data);
      return new ProjectMetadata(row.id, row.name, new Date(row.created_at), new Date(row.updated_at),
        row.video, thumbnail ? { kind: 'blob', blob: thumbnail } : null, row.has_document);
    });
  }
  async load(id: string): Promise<Project | null> {
    const owner = await this.owner();
    await this.restorePending(owner);
    const draft = this.uploads?.draft(owner, id);
    if (draft) {
      const project = await this.serializer.deserialize(draft.payload, draft.thumbnail);
      await this.assertOwner(owner);
      return project;
    }
    const { data, error } = await this.client.from(TABLE).select('*').eq('user_id', owner).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    await this.assertOwner(owner);
    if (!data) return null;
    const row = data as CloudProjectRow;
    this.videoVersions.set(this.path(owner, id), new Date(row.updated_at).toISOString());
    return this.serializer.deserialize(row.payload, decodeThumbnail(row.thumbnail_data));
  }
  async has(id: string): Promise<boolean> {
    const owner = await this.owner();
    const { data, error } = await this.client.from(TABLE).select('id').eq('user_id', owner).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    await this.assertOwner(owner);
    return data !== null;
  }
  async save(project: Project): Promise<void> {
    const owner = await this.owner();
    await this.restorePending(owner);
    // Keep the latest captions locally before waiting for a large transfer.
    this.uploads?.setDraft(owner, project.id, { payload: this.serializer.serialize(project), thumbnail: project.thumbnail });
    await this.uploads?.flush(owner, project.id);
    const pending = this.pendingVideos.get(this.path(owner, project.id));
    if (pending) await this.upload(owner, project.id, pending);
    const thumbnail = await encodeThumbnail(project.thumbnail);
    await this.assertOwner(owner);
    const { error } = await this.client.from(TABLE).upsert({
      id: project.id, user_id: owner, name: project.name, created_at: project.createdAt.toISOString(), updated_at: project.updatedAt.toISOString(),
      has_document: project.document !== null, thumbnail_data: thumbnail, payload: this.serializer.serialize(project), video: project.video,
    }, { onConflict: 'user_id,id' });
    if (error) throw error;
    await this.assertOwner(owner);
    const path = this.path(owner, project.id);
    this.uploads?.complete(`${owner}/${project.id}`);
    const previousVersion = this.videoVersions.get(path);
    const version = project.updatedAt.toISOString();
    this.videoVersions.set(path, version);
    // Caption/name saves do not replace the source video. Carry its cached
    // bytes forward to the committed revision so ordinary edits stay fast.
    if (!pending && previousVersion && previousVersion !== version && this.videoCache) {
      const cache = this.videoCache;
      const oldKey = `cloud/${owner}/${project.id}/${previousVersion}`;
      void cache.load(oldKey).then(async lookup => {
        if (lookup.outcome !== 'found') return;
        await cache.store(`cloud/${owner}/${project.id}/${version}`, lookup.blob);
        await cache.delete(oldKey);
      }).catch(() => {});
    }
  }
  async delete(id: string): Promise<void> {
    const owner = await this.owner();
    // Soft deletion preserves a recovery path and retains its private video.
    const { error } = await this.client.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('user_id', owner).eq('id', id);
    if (error) throw error;
    this.pendingVideos.delete(this.path(owner, id));
    this.uploads?.discard(`${owner}/${id}`);
  }
  async listDeleted(): Promise<{ id: string; name: string }[]> {
    const owner = await this.owner();
    const { data, error } = await this.client.from(TABLE).select('id,name').eq('user_id', owner).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    if (error) throw error;
    await this.assertOwner(owner);
    return data ?? [];
  }
  async restore(id: string): Promise<void> {
    const owner = await this.owner();
    const { error } = await this.client.from(TABLE).update({ deleted_at: null }).eq('user_id', owner).eq('id', id);
    if (error) throw error;
    await this.assertOwner(owner);
  }
  async cacheVideoBlob(projectId: string, blob: Blob): Promise<void> {
    const owner = await this.owner();
    if (blob.size > 524288000) throw new Error('Account video uploads support files up to 500 MB.');
    const previous = this.pendingVideos.get(this.path(owner, projectId));
    if (previous && previous !== blob) throw new Error('Finish the previous video upload before replacing it.');
    this.pendingVideos.set(this.path(owner, projectId), blob);
    await this.upload(owner, projectId, blob);
  }

  async retryVideoUpload(projectId: string, automatic = false): Promise<void> {
    const owner = await this.owner();
    await this.restorePending(owner);
    const blob = this.pendingVideos.get(this.path(owner, projectId));
    if (!blob) return;
    if (this.uploads) await this.uploads.retry(owner, projectId, automatic);
    await this.upload(owner, projectId, blob);
  }

  resetUploads(): void {
    this.uploads?.reset();
    this.pendingVideos.clear();
    this.videoVersions.clear();
  }
  private async upload(owner: string, projectId: string, blob: Blob): Promise<void> {
    if (blob.size > 524288000) throw new Error('Account video uploads support files up to 500 MB.');
    await this.assertOwner(owner);
    const path = this.path(owner, projectId);
    if (this.uploads) {
      await this.uploads.upload(owner, projectId, blob);
    } else {
      const { error } = await this.client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
      if (error) throw error;
    }
    await this.assertOwner(owner);
    const previousVersion = this.videoVersions.get(path);
    this.videoVersions.delete(path);
    if (previousVersion && this.videoCache) await this.videoCache.delete(`cloud/${owner}/${projectId}/${previousVersion}`).catch(() => {});
    if (this.pendingVideos.get(path) === blob) this.pendingVideos.delete(path);
  }
  async loadVideoBlob(projectId: string, onProgress?: LoadVideoBlobProgressCallback, signal?: AbortSignal): Promise<VideoBlobLookup> {
    const owner = await this.owner();
    signal?.throwIfAborted();
    await this.restorePending(owner);
    signal?.throwIfAborted();
    const pendingSource = this.uploads?.source(owner, projectId);
    if (pendingSource) { onProgress?.(1); return { outcome: 'found', blob: pendingSource, source: 'device' }; }
    const version = this.videoVersions.get(this.path(owner, projectId));
    const cacheKey = version ? `cloud/${owner}/${projectId}/${version}` : null;
    if (cacheKey && this.videoCache) {
      const cached = await this.videoCache.load(cacheKey).catch(() => null);
      signal?.throwIfAborted();
      await this.assertOwner(owner);
      if (cached?.outcome === 'found') {
        onProgress?.(1);
        return cached;
      }
    }
    onProgress?.(null);
    const { data, error } = await this.client.storage.from(BUCKET).createSignedUrl(this.path(owner, projectId), 300);
    if (error) {
      if (Number(error.statusCode) === 404 || error.message.toLowerCase().includes('not found')) return { outcome: 'missing', reason: 'remote-provider-absent' };
      throw error;
    }
    const response = await fetch(data.signedUrl, { ...(signal ? { signal } : {}) });
    if (!response.ok) throw new Error(`Video download failed (${response.status}). Try again.`);
    const length = Number(response.headers.get('content-length') ?? 0);
    onProgress?.(length ? 0 : null);
    const reader = response.body?.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let received = 0;
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(new Uint8Array(value)); received += value.byteLength;
        onProgress?.(length ? Math.min(1, received / length) : null);
      }
    } else chunks.push(new Uint8Array(await response.arrayBuffer()));
    await this.assertOwner(owner);
    onProgress?.(1);
    signal?.throwIfAborted();
    const blob = new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' });
    // Cache failure must not prevent opening a valid cloud video. Versioned,
    // owner-scoped keys prevent reuse after a remote edit or account change.
    if (cacheKey && this.videoCache) void this.videoCache.store(cacheKey, blob).catch(() => {});
    return { outcome: 'found', blob, source: 'server' };
  }
}
