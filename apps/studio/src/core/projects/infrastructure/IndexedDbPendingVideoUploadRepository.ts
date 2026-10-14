import { IndexedDbClient } from '@core/_shared/infrastructure/IndexedDbClient';
import type { PendingVideoUploadRepository, PendingVideoUpload, UploadCheckpoint } from '@core/projects/domain/PendingVideoUploadRepository';

/** Source bytes are written once; offset/draft checkpoints never rewrite the large Blob. */
export class IndexedDbPendingVideoUploadRepository implements PendingVideoUploadRepository {
  private readonly db = new IndexedDbClient({ dbName: 'reelstudio-pending-uploads', dbVersion: 1,
    stores: [{ name: 'sources', keyPath: 'id' }, { name: 'checkpoints', keyPath: 'id' }] });
  constructor(private readonly scope: string) {}
  private id(key: string): string { return `${this.scope}:${key}`; }

  async add(record: PendingVideoUpload): Promise<void> {
    const { blob, ...checkpoint } = record;
    const db = await this.db.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['sources', 'checkpoints'], 'readwrite');
      tx.objectStore('sources').put({ id: this.id(record.key), blob });
      tx.objectStore('checkpoints').put({ id: this.id(record.key), scope: this.scope, ...checkpoint });
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not keep the pending upload.'));
    });
  }

  async checkpoint(record: UploadCheckpoint): Promise<void> {
    await this.db.writeOne('checkpoints', { id: this.id(record.key), scope: this.scope, ...record });
  }

  async list(owner: string): Promise<PendingVideoUpload[]> {
    const checkpoints = await this.db.readAll<UploadCheckpoint & { scope: string }>('checkpoints');
    const records: PendingVideoUpload[] = [];
    for (const checkpoint of checkpoints) {
      if (checkpoint.scope !== this.scope || checkpoint.owner !== owner) continue;
      const source = await this.db.readOne<{ blob: Blob }>('sources', this.id(checkpoint.key));
      if (source) records.push({ ...checkpoint, blob: source.blob });
    }
    return records;
  }

  async remove(key: string, createdAt?: number): Promise<void> {
    const db = await this.db.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['sources', 'checkpoints'], 'readwrite');
      const request = tx.objectStore('checkpoints').get(this.id(key));
      request.onsuccess = () => {
        // A delayed cleanup for a completed source must not erase its replacement.
        if (createdAt !== undefined && request.result?.createdAt !== createdAt) return;
        tx.objectStore('sources').delete(this.id(key));
        tx.objectStore('checkpoints').delete(this.id(key));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not clear the pending upload.'));
    });
  }
}
