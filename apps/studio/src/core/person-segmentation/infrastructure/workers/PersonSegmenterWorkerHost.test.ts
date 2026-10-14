import { afterEach, describe, expect, it, vi } from 'vitest';
import { PersonSegmenterWorkerHost } from '@core/person-segmentation/infrastructure/workers/PersonSegmenterWorkerHost';
import type { PersonSegmenterWorkerInbound } from '@core/person-segmentation/infrastructure/workers/PersonSegmenterWorkerProtocol';

const mediaPipe = vi.hoisted(() => ({
  pose: vi.fn(async () => ({ close: vi.fn() })),
  segmenter: vi.fn(async () => ({ close: vi.fn() })),
}));
vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { isSimdSupported: async () => true },
  PoseLandmarker: { createFromOptions: mediaPipe.pose },
  ImageSegmenter: { createFromOptions: mediaPipe.segmenter },
}));
vi.mock('@core/person-segmentation/services/MaskDownsampler', () => ({
  MaskDownsampler: class {},
}));

const init = {
  type: 'init' as const, requestId: 1,
  wasmSimd: { loaderUrl: '/simd.js', binaryUrl: '/simd.wasm' },
  wasmNoSimd: { loaderUrl: '/plain.js', binaryUrl: '/plain.wasm' },
  poseModelUrl: 'https://models.example/pose.task',
  segmenterModelUrl: 'https://models.example/person.tflite',
  delegate: 'CPU' as const, maskMaxSide: 256,
};

function workerHarness() {
  let receive: (message: { data: PersonSegmenterWorkerInbound }) => void = () => undefined;
  const reply = vi.fn();
  vi.stubGlobal('self', {
    addEventListener: (_event: string, listener: typeof receive) => { receive = listener; },
    postMessage: reply,
  });
  return { send: (data: PersonSegmenterWorkerInbound) => receive({ data }), reply };
}

describe('PersonSegmenterWorkerHost model loading', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

  it('passes cached binary bytes to both MediaPipe tasks instead of uncached model URLs', async () => {
    const worker = workerHarness();
    const fetch = vi.fn(async (_url: string) => new Response(new Uint8Array([1, 2, 3])));
    new PersonSegmenterWorkerHost({ fetch }).start();
    worker.send(init);
    await vi.waitFor(() => expect(worker.reply).toHaveBeenCalledWith({ type: 'ack', requestId: 1 }, []));
    expect(fetch.mock.calls.map(call => call[0])).toEqual([init.poseModelUrl, init.segmenterModelUrl]);
    for (const create of [mediaPipe.pose, mediaPipe.segmenter]) {
      const options = (create.mock.calls as unknown as [unknown, { baseOptions: { modelAssetBuffer: Uint8Array; delegate: string; modelAssetPath?: string } }][])[0]![1];
      expect(options.baseOptions.modelAssetBuffer).toEqual(new Uint8Array([1, 2, 3]));
      expect(options.baseOptions.modelAssetPath).toBeUndefined();
      expect(options.baseOptions.delegate).toBe('CPU');
    }
    worker.send({ ...init, requestId: 2 });
    await vi.waitFor(() => expect(worker.reply).toHaveBeenCalledWith({ type: 'ack', requestId: 2 }, []));
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(mediaPipe.pose).toHaveBeenCalledOnce();
    expect(mediaPipe.segmenter).toHaveBeenCalledOnce();
  });

  it('reports failed downloads without handing an error page to MediaPipe', async () => {
    const worker = workerHarness();
    new PersonSegmenterWorkerHost({ fetch: async () => new Response('unavailable', { status: 503 }) }).start();
    worker.send(init);
    await vi.waitFor(() => expect(worker.reply).toHaveBeenCalledWith({
      type: 'error', requestId: 1, message: 'Could not load person model (503)',
    }, []));
    expect(mediaPipe.pose).not.toHaveBeenCalled();
    expect(mediaPipe.segmenter).not.toHaveBeenCalled();
  });
});
