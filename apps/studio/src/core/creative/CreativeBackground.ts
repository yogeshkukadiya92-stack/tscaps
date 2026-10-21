import type { ImageSegmenter } from '@mediapipe/tasks-vision';
import { PersonSegmenterModelUrls } from '@core/person-segmentation/infrastructure/PersonSegmenterModelUrls';
import type { CreativeAsset } from '@core/creative/CreativeProject';

export interface CreativeBackground {
  mode: 'original' | 'blur' | 'color' | 'image';
  color: string;
  blur: number;
  image: CreativeAsset | null;
}
export const DEFAULT_BACKGROUND: CreativeBackground = { mode: 'original', color: '#19243b', blur: 16, image: null };

/** Convert confidence to a soft matte without destroying hair-edge transparency. */
export function confidenceToAlpha(confidence: Float32Array): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(confidence.length * 4);
  for (let i = 0; i < confidence.length; i++) {
    const value = Number.isFinite(confidence[i]) ? confidence[i]! : 0;
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = 255;
    pixels[i * 4 + 3] = Math.round(Math.max(0, Math.min(1, (value - .1) / .8)) * 255);
  }
  return pixels;
}

/** One model per render session. The same compositor serves previews and exports. */
export class CreativeBackgroundPainter {
  private model: ImageSegmenter | null = null;
  private image: ImageBitmap | null = null;
  private readonly small = document.createElement('canvas');
  private readonly matte = document.createElement('canvas');
  private readonly foreground = document.createElement('canvas');
  constructor(private readonly settings: CreativeBackground) {}

  async open(loadAsset: (asset: CreativeAsset) => Promise<Blob>, signal?: AbortSignal) {
    try {
      if (this.settings.mode === 'image') {
        if (!this.settings.image) throw new Error('Choose a background image first.');
        this.image = await createImageBitmap(await loadAsset(this.settings.image));
      }
      signal?.throwIfAborted();
      const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision');
      const wasm = await FilesetResolver.isSimdSupported() ? PersonSegmenterModelUrls.WASM_SIMD : PersonSegmenterModelUrls.WASM_NO_SIMD;
      this.model = await ImageSegmenter.createFromOptions({ wasmLoaderPath: wasm.loaderUrl, wasmBinaryPath: wasm.binaryUrl }, {
        baseOptions: { modelAssetPath: PersonSegmenterModelUrls.SELFIE_SEGMENTER, delegate: 'CPU' },
        runningMode: 'IMAGE', outputConfidenceMasks: true, outputCategoryMask: false,
      });
      signal?.throwIfAborted();
    } catch (error) {
      this.close();
      if (signal?.aborted) throw error;
      throw new Error('Background removal could not load. Check your connection and try again.', { cause: error });
    }
  }

  paint(target: HTMLCanvasElement, source: HTMLCanvasElement | OffscreenCanvas) {
    if (!this.model) throw new Error('Background removal is not ready.');
    const scale = Math.min(1, 384 / Math.max(source.width, source.height));
    this.small.width = Math.max(1, Math.round(source.width * scale));
    this.small.height = Math.max(1, Math.round(source.height * scale));
    this.small.getContext('2d')!.drawImage(source, 0, 0, this.small.width, this.small.height);
    const result = this.model.segment(this.small);
    try {
      const mask = result.confidenceMasks?.[0];
      if (!mask) throw new Error('Background removal did not return a person mask.');
      this.matte.width = mask.width; this.matte.height = mask.height;
      const data = this.matte.getContext('2d')!.createImageData(mask.width, mask.height);
      data.data.set(confidenceToAlpha(mask.getAsFloat32Array()));
      this.matte.getContext('2d')!.putImageData(data, 0, 0);
    } finally { result.close(); }
    this.foreground.width = target.width; this.foreground.height = target.height;
    const fg = this.foreground.getContext('2d')!;
    // Match the existing contain fit, including portrait canvas letterboxing.
    const fit = Math.min(target.width / source.width, target.height / source.height);
    const w = source.width * fit, h = source.height * fit, x = (target.width - w) / 2, y = (target.height - h) / 2;
    fg.drawImage(source, x, y, w, h);
    fg.globalCompositeOperation = 'destination-in'; fg.drawImage(this.matte, x, y, w, h);
    fg.globalCompositeOperation = 'source-over';
    const ctx = target.getContext('2d')!;
    ctx.save(); ctx.fillStyle = this.settings.color; ctx.fillRect(0, 0, target.width, target.height);
    if (this.settings.mode === 'image' && this.image) {
      const cover = Math.max(target.width / this.image.width, target.height / this.image.height);
      ctx.drawImage(this.image, (target.width - this.image.width * cover) / 2, (target.height - this.image.height * cover) / 2, this.image.width * cover, this.image.height * cover);
    } else if (this.settings.mode === 'blur') {
      const blur = this.settings.blur * Math.min(target.width, target.height) / 1080;
      ctx.filter = `blur(${blur}px)`;
      const cover = Math.max((target.width + blur * 6) / source.width, (target.height + blur * 6) / source.height);
      ctx.drawImage(source, (target.width - source.width * cover) / 2, (target.height - source.height * cover) / 2, source.width * cover, source.height * cover);
      ctx.filter = 'none';
    }
    ctx.drawImage(this.foreground, 0, 0); ctx.restore();
  }
  close() { this.model?.close(); this.model = null; this.image?.close(); this.image = null; }
}
