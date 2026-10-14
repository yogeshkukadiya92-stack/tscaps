import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Project } from '@core/projects/domain/Project';
import type { ProjectSerializer } from '@core/projects/services/ProjectSerializer';
import { SupabaseProjectRepository } from '@core/projects/infrastructure/repositories/SupabaseProjectRepository';

describe('Cloud project failure and account boundaries', () => {
  it('retries a failed video upload before saving metadata, and refuses to mark an unsynced video saved', async () => {
    const upload = vi.fn().mockResolvedValue({ error: new Error('Storage offline') });
    const from = vi.fn();
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: 'owner' } } }, error: null }) },
      storage: { from: () => ({ upload }) }, from } as unknown as SupabaseClient;
    const repository = new SupabaseProjectRepository(client, {} as ProjectSerializer);
    await expect(repository.cacheVideoBlob('project', new Blob(['video']))).rejects.toThrow('Storage offline');
    await expect(repository.save({ id: 'project' } as Project)).rejects.toThrow('Storage offline');
    expect(upload).toHaveBeenCalledTimes(2);
    expect(from).not.toHaveBeenCalled();
  });
  it('discards a response when the signed-in account changes during the request', async () => {
    const auth = vi.fn().mockResolvedValueOnce({ data: { session: { user: { id: 'first' } } } })
      .mockResolvedValueOnce({ data: { session: { user: { id: 'second' } } } });
    const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), order: vi.fn().mockResolvedValue({ data: [], error: null }) };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain);
    const client = { auth: { getSession: auth }, from: () => chain } as unknown as SupabaseClient;
    const repository = new SupabaseProjectRepository(client, {} as ProjectSerializer);
    await expect(repository.list()).rejects.toThrow('Your account changed');
    expect(chain.eq).toHaveBeenCalledWith('user_id', 'first');
  });
  it('blocks access before making any database call when signed out', async () => {
    const from = vi.fn();
    const client = { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) }, from } as unknown as SupabaseClient;
    await expect(new SupabaseProjectRepository(client, {} as ProjectSerializer).load('project')).rejects.toThrow('Sign in');
    expect(from).not.toHaveBeenCalled();
  });
});
