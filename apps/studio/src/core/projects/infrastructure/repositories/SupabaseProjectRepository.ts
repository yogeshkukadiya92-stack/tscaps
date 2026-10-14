import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectRepository, LoadVideoBlobProgressCallback } from '@core/projects/domain/ProjectRepository';
import type { Project } from '@core/projects/domain/Project';
import { ProjectMetadata } from '@core/projects/domain/ProjectMetadata';
import type { ProjectSerializer, SerializedProject } from '@core/projects/services/ProjectSerializer';
import type { VideoBlobLookup } from '@core/videos/domain/VideoBlobLookup';

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
  constructor(private readonly client: SupabaseClient, private readonly serializer: ProjectSerializer) {}

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
    const { data, error } = await this.client.from(TABLE).select('*').eq('user_id', owner).eq('id', id).is('deleted_at', null).maybeSingle();
    if (error) throw error;
    await this.assertOwner(owner);
    if (!data) return null;
    const row = data as CloudProjectRow;
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
  }
  async delete(id: string): Promise<void> {
    const owner = await this.owner();
    // Soft deletion preserves a recovery path and retains its private video.
    const { error } = await this.client.from(TABLE).update({ deleted_at: new Date().toISOString() }).eq('user_id', owner).eq('id', id);
    if (error) throw error;
    this.pendingVideos.delete(this.path(owner, id));
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
    this.pendingVideos.set(this.path(owner, projectId), blob);
    await this.upload(owner, projectId, blob);
  }
  private async upload(owner: string, projectId: string, blob: Blob): Promise<void> {
    if (blob.size > 536870912) throw new Error('Account video uploads support files up to 512 MB.');
    await this.assertOwner(owner);
    const path = this.path(owner, projectId);
    const { error } = await this.client.storage.from(BUCKET).upload(path, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
    if (error) throw error;
    await this.assertOwner(owner);
    if (this.pendingVideos.get(path) === blob) this.pendingVideos.delete(path);
  }
  async loadVideoBlob(projectId: string, onProgress?: LoadVideoBlobProgressCallback, signal?: AbortSignal): Promise<VideoBlobLookup> {
    const owner = await this.owner();
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
    return { outcome: 'found', blob: new Blob(chunks, { type: response.headers.get('content-type') ?? 'application/octet-stream' }), source: 'server' };
  }
}
