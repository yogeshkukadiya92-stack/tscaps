import type { ModelFileCache } from '@modules/transcription/ModelFileCache';

interface StoredModelFile {
  readonly body: Blob;
  readonly status: number;
  readonly statusText: string;
  readonly headers: readonly [string, string][];
}

/** Persistent fallback for browsers that refuse Cache Storage. */
export class IndexedDbModelFileCache implements ModelFileCache {
  private connection: Promise<IDBDatabase> | null = null;

  async match(key: string): Promise<Response | undefined> {
    try {
      const db = await this.open();
      const stored = await new Promise<StoredModelFile | undefined>((resolve, reject) => {
        const transaction = db.transaction('files', 'readonly');
        const request = transaction.objectStore('files').get(key);
        request.onsuccess = () => resolve(request.result as StoredModelFile | undefined);
        request.onerror = () => reject(request.error);
        transaction.onabort = () => reject(transaction.error);
      });
      if (!stored) return undefined;
      return new Response(stored.body, {
        status: stored.status, statusText: stored.statusText, headers: [...stored.headers],
      });
    } catch {
      return undefined;
    }
  }

  async put(key: string, response: Response): Promise<void> {
    try {
      // Finish reading before opening the transaction: awaiting a blob inside
      // an IDB transaction would let the browser close it before the write.
      const stored: StoredModelFile = {
        body: await response.blob(), status: response.status,
        statusText: response.statusText, headers: [...response.headers.entries()],
      };
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('files', 'readwrite');
        transaction.objectStore('files').put(stored, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch {
      // ModelFileCache is best effort. The owner checks read-back before
      // treating this fallback as a successful persistent write.
    }
  }

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    const attempt = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB is not available'));
        return;
      }
      const request = indexedDB.open('tscaps-model-files', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Model storage is blocked by another tab'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.connection = null; };
        db.onclose = () => { this.connection = null; };
        resolve(db);
      };
    });
    this.connection = attempt;
    void attempt.catch(() => { if (this.connection === attempt) this.connection = null; });
    return attempt;
  }
}
