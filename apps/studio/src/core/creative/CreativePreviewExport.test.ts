import { describe, expect, it, vi } from 'vitest';
import { CreativeRenderer } from '@core/creative/CreativeRenderer';
import { newCreativeProject } from '@core/creative/CreativeProject';

describe('Creative preview/export source separation', () => {
  it('never passes the low-resolution preview source into final export', async () => {
    const renderer = new CreativeRenderer(vi.fn());
    const close = vi.fn();
    const session = vi.spyOn(renderer, 'session').mockReturnValue({
      open: vi.fn().mockRejectedValue(new Error('stop before encoding')), close,
    } as never);
    const original = new File(['original'], 'original.mp4');
    await expect(renderer.render({ original, previewOriginal: new Blob(['proxy']), project: newCreativeProject(1), cuts: [], plan: null })).rejects.toThrow('stop before encoding');
    expect(session.mock.calls[0]?.[0].original).toBe(original);
    expect(session.mock.calls[0]?.[0].previewOriginal).toBeUndefined();
    expect(close).toHaveBeenCalled();
  });
});
