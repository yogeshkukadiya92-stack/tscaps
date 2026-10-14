import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThumbnailGenerator } from '@core/projects/services/ThumbnailGenerator';

describe('ThumbnailGenerator', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('releases the video and rejects when decoding never produces a thumbnail', async () => {
    vi.useFakeTimers();
    const video = Object.assign(new EventTarget(), {
      muted: false, playsInline: false, preload: '', src: '',
      removeAttribute: vi.fn(), load: vi.fn(),
    });
    vi.stubGlobal('document', { createElement: () => video });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:thumbnail');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const generating = new ThumbnailGenerator().generate(new Blob(['video']));
    const rejected = expect(generating).rejects.toThrow('Thumbnail generation timed out');
    await vi.advanceTimersByTimeAsync(5000);
    await rejected;
    expect(revoke).toHaveBeenCalledWith('blob:thumbnail');
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledTimes(1);
    video.dispatchEvent(new Event('error'));
    expect(video.load).toHaveBeenCalledTimes(1);
  });
});
