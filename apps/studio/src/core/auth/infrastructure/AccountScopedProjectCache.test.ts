import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopeProjectCache } from '@core/auth/infrastructure/AccountScopedProjectCache';
const auth = vi.hoisted(() => ({ user: 'first' as string | null }));
vi.mock('@core/auth/infrastructure/SupabaseClient', () => ({ getSupabaseClient: () => ({ auth: { getSession: async () => ({ data: { session: auth.user ? { user: { id: auth.user } } : null } }) } }) }));

describe('Account-scoped local media cache', () => {
  beforeEach(() => { auth.user = 'first'; });
  it('never reuses another account preview, even with the same project id', async () => {
    const entries = new Map<string, string>();
    const cache = scopeProjectCache({ load: async (id: string) => entries.get(id) ?? null,
      store: async (id: string, value: string) => { entries.set(id, value); }, delete: async (id: string) => { entries.delete(id); } });
    await cache.store('same-project', 'private video');
    auth.user = 'second';
    expect(await cache.load('same-project')).toBeNull();
    auth.user = 'first';
    expect(await cache.load('same-project')).toBe('private video');
  });
  it('rejects an old account response after switching during a read', async () => {
    const cache = scopeProjectCache({ load: async () => { auth.user = 'second'; return 'old preview'; }, store: async () => {}, delete: async () => {} });
    await expect(cache.load('project')).rejects.toThrow('Your account changed');
  });
});
