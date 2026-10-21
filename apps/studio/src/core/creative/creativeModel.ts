import type { VoiceEnhancement, HumRemoval } from '@core/creative/VoiceEnhancement';
export interface EditRange { start: number; end: number }
export type Motion = 'none' | 'push' | 'pulse' | 'shake' | 'flash';
export interface CreativeSettings {
  look: string;
  motion: Motion;
  intensity: number;
  brightness: number;
  contrast: number;
  saturation: number;
  speed: number;
  sourceVolume: number;
  musicVolume: number;
  text: string;
  textColor: string;
  textSize: number;
  textY: number;
  start: number;
  end: number;
  bpm: number;
  beatCuts: boolean;
  ducking: boolean;
  cleanup: boolean;
  voiceEnhancement?: VoiceEnhancement;
  humRemoval?: HumRemoval;
  normalize: boolean;
  portrait: boolean;
}
export const DEFAULT_SETTINGS: CreativeSettings = {
  voiceEnhancement: 'off', humRemoval: 'off',
  look: 'clean', motion: 'none', intensity: 0.4,
  brightness: 1, contrast: 1, saturation: 1, speed: 1,
  sourceVolume: 1, musicVolume: 0.25, text: '', textColor: '#ffffff',
  textSize: 6, textY: 78, start: 0, end: 0, bpm: 120, beatCuts: false, ducking: true, cleanup: false, normalize: false, portrait: false,
};
export const LOOKS = [
  { id: 'clean', name: 'Clean', filter: '', color: '#71809d' },
  { id: 'cinema', name: 'Cinema', filter: 'contrast(1.18) saturate(0.78) sepia(0.12)', color: '#718d89' },
  { id: 'warm', name: 'Golden', filter: 'sepia(0.28) saturate(1.25)', color: '#d59b62' },
  { id: 'pop', name: 'Vivid', filter: 'contrast(1.12) saturate(1.55)', color: '#b576d2' },
  { id: 'noir', name: 'Noir', filter: 'grayscale(1) contrast(1.35)', color: '#6b6b76' },
  { id: 'cool', name: 'Cool', filter: 'saturate(0.85) hue-rotate(15deg) contrast(1.1)', color: '#6095c5' },
];

export function mergeRanges(ranges: readonly EditRange[], start: number, end: number): EditRange[] {
  const sorted = ranges.map(r => ({ start: Math.max(start, r.start), end: Math.min(end, r.end) }))
    .filter(r => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start)
    .sort((a, b) => a.start - b.start);
  const result: EditRange[] = [];
  for (const range of sorted) {
    const previous = result[result.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else result.push({ ...range });
  }
  return result;
}

export function buildCuts(settings: CreativeSettings, silences: readonly EditRange[], existing: readonly EditRange[]): EditRange[] {
  const cuts = [...existing, ...silences];
  if (settings.beatCuts) {
    const interval = 60 / settings.bpm * settings.speed;
    // Small jump cuts on each beat preserve most of the spoken content.
    for (let t = settings.start + interval; t < settings.end; t += interval) {
      cuts.push({ start: t, end: t + Math.min(0.08 * settings.speed, interval * 0.15) });
    }
  }
  return mergeRanges(cuts, settings.start, settings.end);
}

export function editedDuration(settings: CreativeSettings, cuts: readonly EditRange[]): number {
  return Math.max(0, settings.end - settings.start - cuts.reduce((sum, r) => sum + r.end - r.start, 0)) / settings.speed;
}

/** Analyze all channels, retaining 100ms handles around speech. */
export function findSilences(buffer: AudioBuffer, threshold = 0.015): EditRange[] {
  const window = Math.max(1, Math.floor(buffer.sampleRate * 0.05));
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const ranges: EditRange[] = [];
  let quietStart: number | null = null;
  for (let pos = 0; pos <= buffer.length; pos += window) {
    let energy = 0;
    const count = Math.min(window, buffer.length - pos);
    for (const channel of channels) {
      let sum = 0;
      for (let j = 0; j < count; j++) sum += channel[pos + j]! ** 2;
      energy = Math.max(energy, Math.sqrt(sum / Math.max(1, count)));
    }
    const time = Math.min(pos / buffer.sampleRate, buffer.duration);
    if (pos < buffer.length && energy < threshold) quietStart ??= time;
    else if (quietStart !== null) {
      if (time - quietStart >= 0.5) ranges.push({ start: quietStart + 0.1, end: time - 0.1 });
      quietStart = null;
    }
  }
  // The final window may stop just short of the sentinel.
  if (quietStart !== null && buffer.duration - quietStart >= 0.5) {
    ranges.push({ start: quietStart + 0.1, end: buffer.duration - 0.1 });
  }
  return ranges;
}

export function paintFrame(canvas: HTMLCanvasElement, video: CanvasImageSource, settings: CreativeSettings, outputTime: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const { width: w, height: h } = canvas;
  const phase = outputTime * settings.bpm / 60;
  const pulse = Math.exp(-(phase % 1) * 10);
  let zoom = 1;
  let dx = 0;
  let dy = 0;
  if (settings.motion === 'push') zoom += settings.intensity * 0.12 * ((outputTime % 4) / 4);
  if (settings.motion === 'pulse') zoom += settings.intensity * 0.1 * pulse;
  if (settings.motion === 'shake') {
    zoom += 0.05 * settings.intensity;
    dx = Math.sin(outputTime * 47) * w * 0.012 * settings.intensity;
    dy = Math.cos(outputTime * 39) * h * 0.008 * settings.intensity;
  }
  ctx.save();
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  ctx.filter = `${LOOKS.find(l => l.id === settings.look)?.filter ?? ''} brightness(${settings.brightness}) contrast(${settings.contrast}) saturate(${settings.saturation})`.trim();
  ctx.translate(w / 2 + dx, h / 2 + dy);
  ctx.scale(zoom, zoom);
  ctx.drawImage(video, -w / 2, -h / 2, w, h);
  ctx.restore();
  if (settings.motion === 'flash') {
    ctx.fillStyle = `rgba(255,255,255,${pulse * settings.intensity * 0.5})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (settings.text.trim()) {
    ctx.save();
    const size = w * settings.textSize / 100;
    ctx.font = `800 ${size}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = '#000000b3';
    ctx.fillStyle = settings.textColor;
    const lines: string[] = [];
    for (const paragraph of settings.text.slice(0, 300).split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > w * 0.88 && line) { lines.push(line); line = word; }
        else line = next;
      }
      lines.push(line);
    }
    lines.forEach((line, i) => {
      const y = h * settings.textY / 100 + (i - (lines.length - 1) / 2) * size * 1.2;
      ctx.strokeText(line, w / 2, y, w * 0.9);
      ctx.fillText(line, w / 2, y, w * 0.9);
    });
    ctx.restore();
  }
}
