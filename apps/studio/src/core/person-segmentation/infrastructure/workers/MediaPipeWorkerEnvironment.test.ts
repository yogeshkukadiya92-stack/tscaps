import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaPipeWorkerEnvironment } from '@core/person-segmentation/infrastructure/workers/MediaPipeWorkerEnvironment';

describe('MediaPipe worker feature detection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('allows the MediaPipe Mac float-mask probe in a document-free worker', () => {
    vi.stubGlobal('self', {});
    vi.stubGlobal('navigator', { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh)' });
    // The expression used by the pinned MediaPipe float-mask readback.
    const usesTouchReadback = () => navigator.userAgent.includes('Mac') && 'ontouchend' in self.document;
    expect(usesTouchReadback).toThrow(TypeError);
    new MediaPipeWorkerEnvironment().install();
    expect(usesTouchReadback()).toBe(false);
    new MediaPipeWorkerEnvironment().install();
    expect(usesTouchReadback()).toBe(false);
  });

  it('preserves an existing document and its touch capabilities', () => {
    const document = { ontouchend: null };
    vi.stubGlobal('self', { document });
    new MediaPipeWorkerEnvironment().install();
    expect(self.document).toBe(document);
    expect('ontouchend' in self.document).toBe(true);
  });
});
