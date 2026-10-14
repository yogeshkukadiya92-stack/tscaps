import type { BlobDownloadProgressCallback } from '@core/_shared/domain/BlobDownloader';
import { getSupabaseClient } from '@core/auth/infrastructure/SupabaseClient';

interface ProjectCache<T> {
  load(id: string, progress?: BlobDownloadProgressCallback): Promise<T | null>;
  store(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
}
/** Local media optimizations must follow the same account boundary as cloud records. */
export function scopeProjectCache<T>(repository: ProjectCache<T>): ProjectCache<T> {
  const client = getSupabaseClient();
  if (!client) return repository;
  async function owner() {
    const { data, error } = await client!.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('Sign in to access your cached media.');
    return data.session.user.id;
  }
  return {
    async load(id, progress) {
      const user = await owner();
      const value = await repository.load(`${user}/${id}`, progress);
      if (await owner() !== user) throw new Error('Your account changed. Please reopen the project.');
      return value;
    },
    async store(id, value) { await repository.store(`${await owner()}/${id}`, value); },
    async delete(id) { await repository.delete(`${await owner()}/${id}`); },
  };
}
