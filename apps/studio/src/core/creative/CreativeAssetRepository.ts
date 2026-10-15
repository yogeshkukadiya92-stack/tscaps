import { getSupabaseClient, getSupabaseUrl } from '@core/auth/infrastructure/SupabaseClient';
import type { CreativeAsset } from '@core/creative/CreativeProject';

/** Media is stored before a reference enters project state. Failed writes never look saved. */
export class CreativeAssetRepository {
  private async database(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('reelstudio-creative-media', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('assets');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  private async cache(key: string, blob?: Blob): Promise<Blob | undefined> {
    const db = await this.database();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction('assets', blob ? 'readwrite' : 'readonly');
        const store = transaction.objectStore('assets');
        const request = blob ? store.put(blob, key) : store.get(key);
        transaction.oncomplete = () => resolve(blob ?? request.result as Blob | undefined);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error ?? new Error('Media storage was interrupted.'));
      });
    } finally { db.close(); }
  }
  private async owner(): Promise<string | null> {
    const client = getSupabaseClient();
    if (!client) return null;
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Sign in before saving creative media.');
    return data.session.user.id;
  }
  async put(file: File, duration: number, projectId: string): Promise<CreativeAsset> {
    const owner = await this.owner();
    const id = crypto.randomUUID();
    const key = `${owner ?? 'local'}/${projectId}/creative/${id}`;
    const client = getSupabaseClient();
    if (client && owner) {
      const { error } = await client.storage.from('reelstudio-videos').upload(key, file, { contentType: file.type || 'application/octet-stream' });
      if (error) throw error;
      if (await this.owner() !== owner) throw new Error('Your account changed. Reopen this project.');
      // The remote write is durable even if the optional local cache is full.
      await this.cache(`${getSupabaseUrl()}/${key}`, file).catch(() => undefined);
    } else await this.cache(key, file);
    return { id, key, name: file.name, mimeType: file.type, remote: !!owner, duration };
  }
  async get(asset: CreativeAsset): Promise<Blob> {
    const owner = asset.remote ? await this.owner() : null;
    if (asset.remote && (!owner || !asset.key.startsWith(`${owner}/`))) throw new Error('This media belongs to another account.');
    const cacheKey = asset.remote ? `${getSupabaseUrl()}/${asset.key}` : asset.key;
    const cached = await this.cache(cacheKey).catch(() => undefined);
    if (cached) {
      if (asset.remote && await this.owner() !== owner) throw new Error('Your account changed. Reopen this project.');
      return cached;
    }
    if (asset.remote) {
      const client = getSupabaseClient();
      if (!client) throw new Error('Connect your cloud account to load this media.');
      const { data, error } = await client.storage.from('reelstudio-videos').download(asset.key);
      if (error) throw error;
      if (await this.owner() !== owner) throw new Error('Your account changed. Reopen this project.');
      await this.cache(cacheKey, data).catch(() => undefined);
      return data;
    }
    throw new Error(`Missing media: ${asset.name}. Use Replace to relink it.`);
  }
}
