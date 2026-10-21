import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';
import { compositionSpans, type CreativeProject, type CreativeAsset } from '@core/creative/CreativeProject';
import type { CreativeSettings, EditRange } from '@core/creative/creativeModel';

export type ColorCorrection = Pick<CreativeSettings, 'brightness' | 'contrast' | 'saturation' | 'look'>;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Analyze source pixels, never the filtered preview. Bounds keep correction gentle. */
export function correctionFromPixels(frames: readonly Uint8ClampedArray[]): ColorCorrection {
  const histogram = new Uint32Array(256);
  let count = 0, saturation = 0, colored = 0;
  for (const pixels of frames) for (let i = 0; i + 3 < pixels.length; i += 4) {
    if (pixels[i + 3]! < 128) continue;
    const r = pixels[i]! / 255, g = pixels[i + 1]! / 255, b = pixels[i + 2]! / 255;
    const luminance = .2126 * r + .7152 * g + .0722 * b;
    // Ignore letterboxing and clipped whites: neither contains recoverable detail.
    if (luminance < .025 || luminance > .975) continue;
    histogram[Math.round(luminance * 255)]!++; count++;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min > .03) { saturation += (max - min) / max; colored++; }
  }
  const neutral: ColorCorrection = { brightness: 1, contrast: 1, saturation: 1, look: 'clean' };
  if (count < 64) return neutral;
  function percentile(fraction: number) {
    let cumulative = 0;
    for (let i = 0; i < 256; i++) { cumulative += histogram[i]!; if (cumulative >= count * fraction) return i / 255; }
    return 1;
  }
  const low = percentile(.05), mid = percentile(.5), high = percentile(.95);
  // Flat frames, fades and title cards are not reliable exposure references.
  if (high - low < .06) return neutral;
  const brightness = clamp(Math.min(.46 / Math.max(.08, mid), .97 / high), .8, 1.25);
  const contrast = clamp(.72 / Math.max(.1, (high - low) * brightness), .92, 1.12);
  const sat = colored < count * .05 ? 1 : clamp(.42 / (saturation / colored), .9, 1.12);
  const round = (value: number) => Math.round(value * 100) / 100;
  return { look: 'clean', brightness: round(brightness), contrast: round(contrast), saturation: round(sat) };
}

/** Eight evenly spaced samples of retained clips, with bounded decode canvas memory. */
export async function analyzeReelColors(original: Blob, project: CreativeProject, cuts: readonly EditRange[],
  loadAsset: (asset: CreativeAsset) => Promise<Blob>, signal: AbortSignal): Promise<ColorCorrection> {
  const spans = compositionSpans(project, cuts);
  const duration = spans.at(-1)?.outputEnd ?? 0;
  if (!duration) throw new Error('Add a video clip before analyzing colors.');
  const frames: Uint8ClampedArray[] = [];
  const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 90;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Color analysis is unavailable in this browser.');
  for (let index = 0; index < 8; index++) {
    signal.throwIfAborted();
    const at = duration * (index + .5) / 8;
    const span = spans.find(item => at >= item.outputStart && at < item.outputEnd)!;
    const blob = span.clip.asset ? await loadAsset(span.clip.asset) : original;
    signal.throwIfAborted();
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track || !await track.canDecode()) throw new Error('This video cannot be analyzed. Try another video.');
      const sink = new CanvasSink(track, { width: 160, height: 90, fit: 'contain', poolSize: 1 });
      const frame = await sink.getCanvas(span.sourceStart + (at - span.outputStart) * project.settings.speed);
      signal.throwIfAborted();
      if (!frame) throw new Error('This video cannot be analyzed. Try another video.');
      context.clearRect(0, 0, 160, 90); context.drawImage(frame.canvas, 0, 0, 160, 90);
      frames.push(context.getImageData(0, 0, 160, 90).data);
    } finally { input.dispose(); }
  }
  return correctionFromPixels(frames);
}
