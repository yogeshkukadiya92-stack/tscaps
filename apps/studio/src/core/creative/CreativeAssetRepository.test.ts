import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreativeAssetRepository } from '@core/creative/CreativeAssetRepository';
const mocks = vi.hoisted(() => ({ client: null as unknown, url: 'https://example.test' }));
vi.mock('@core/auth/infrastructure/SupabaseClient', () => ({ getSupabaseClient: () => mocks.client, getSupabaseUrl: () => mocks.url }));
function client(owner = 'owner') {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const download = vi.fn().mockResolvedValue({ data: new Blob(['music']), error: null });
  return { auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: owner } } }, error: null }) },
    storage: { from: vi.fn().mockReturnValue({ upload, download }) }, upload, download };
}
beforeEach(() => { mocks.client = null; });
describe('Creative cloud media persistence', () => {
  it('uploads private owner-scoped media before publishing a durable reference', async () => {
    const cloud = client(); mocks.client = cloud;
    const repository = new CreativeAssetRepository();
    const asset = await repository.put(new File(['music'], 'music.wav', { type: 'audio/wav' }), 1, 'project');
    expect(asset.remote).toBe(true); expect(asset.key).toMatch(/^owner\/project\/creative\//);
    expect(cloud.upload).toHaveBeenCalledWith(asset.key, expect.any(Blob), { contentType: 'audio/wav' });
    const loaded = await repository.get(asset);
    expect(await loaded.text()).toBe('music'); expect(cloud.download).toHaveBeenCalledWith(asset.key);
  });
  it('does not report failed uploads as saved and blocks cross-account references', async () => {
    const cloud = client(); mocks.client = cloud;
    cloud.upload.mockResolvedValueOnce({ error: new Error('Upload failed') });
    const repository = new CreativeAssetRepository();
    await expect(repository.put(new File(['x'], 'x.wav'), 1, 'project')).rejects.toThrow('Upload failed');
    await expect(repository.get({ id: 'id', key: 'someone-else/project/creative/id', name: 'x', mimeType: 'audio/wav', remote: true, duration: 1 })).rejects.toThrow('another account');
    expect(cloud.download).not.toHaveBeenCalled();
  });
  it('rejects an account change during a successful upload', async () => {
    const cloud = client(); mocks.client = cloud;
    cloud.auth.getSession.mockResolvedValueOnce({ data: { session: { user: { id: 'first' } } }, error: null });
    await expect(new CreativeAssetRepository().put(new File(['x'], 'x.wav'), 1, 'project')).rejects.toThrow('account changed');
  });
});
