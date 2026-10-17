/** Output-timeline effects. Rendering depends only on time, never playback history. */
export const MOTION_EFFECTS = [
  { kind: 'light-leak', name: 'Light Leak', hint: 'A soft wash of coloured light', icon: '☀' },
  { kind: 'spotlight', name: 'Spotlight', hint: 'Soft light with shaded edges', icon: '◉' },
  { kind: 'digital-zoom', name: 'Digital Zoom', hint: 'Smooth focus on a detail', icon: '↗' },
  { kind: 'checklist', name: 'Checklist', hint: 'Reveal points one by one', icon: '☑' },
  { kind: 'phone-mockup', name: 'Phone Mockup', hint: 'Your reel inside a phone', icon: '▯' },
  { kind: 'headline-wall', name: 'Headline Wall', hint: 'Animated headline cards', icon: '▤' },
  { kind: 'chart-grow', name: 'Chart Grow', hint: 'Animate your own numbers', icon: '▥' },
  { kind: 'pull-back', name: 'Pull-back Reveal', hint: 'Reveal a page around your reel', icon: '↙' },
  { kind: 'cover-story', name: 'Cover Story', hint: 'An editorial magazine cover', icon: '▣' },
  { kind: 'zoom-through', name: 'Zoom-through Cut', hint: 'Zoom across a clip boundary', icon: '»' },
] as const;
export type MotionEffectKind = typeof MOTION_EFFECTS[number]['kind'];
export interface MotionEffect {
  id: string;
  kind: MotionEffectKind;
  start: number;
  end: number;
  title: string;
  lines: string;
  color: string;
  intensity: number;
  x: number;
  y: number;
}
export function newMotionEffect(kind: MotionEffectKind, start: number, end: number): MotionEffect {
  return { id: crypto.randomUUID(), kind, start, end, title: kind === 'cover-story' ? 'YOUR STORY' : kind === 'chart-grow' ? 'Growth' : 'Your headline',
    lines: kind === 'chart-grow' ? 'Start | 25\nToday | 60\nGoal | 100' : 'Your first point\nYour second point\nYour third point',
    color: '#ffe66d', intensity: 0.6, x: 0.5, y: 0.5 };
}
export function readMotionEffects(value: unknown): MotionEffect[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 40) throw new Error('Invalid motion effects.');
  const ids = new Set<string>();
  for (const e of value as MotionEffect[]) {
    if (!e || typeof e.id !== 'string' || ids.has(e.id) || !MOTION_EFFECTS.some(p => p.kind === e.kind)
      || !Number.isFinite(e.start) || e.start < 0 || !Number.isFinite(e.end) || e.end <= e.start
      || typeof e.title !== 'string' || e.title.length > 80 || typeof e.lines !== 'string' || e.lines.length > 600
      || !/^#[0-9a-f]{6}$/i.test(e.color) || ![e.intensity, e.x, e.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw new Error('Invalid motion effect.');
    ids.add(e.id);
  }
  return value as MotionEffect[];
}
export function chartRows(text: string) {
  return text.split('\n').slice(0, 6).map(line => {
    const [label, raw] = line.split('|');
    const value = raw?.trim() ? Number(raw.trim()) : NaN;
    return { label: label?.trim() ?? '', value };
  }).filter(row => row.label && Number.isFinite(row.value) && row.value >= 0);
}
export function transitionBoundary(start: number, end: number, boundaries: readonly number[]): number | undefined {
  const middle = (start + end) / 2;
  return boundaries.filter(t => t > start && t < end).sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0];
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const ease = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };

/** Same compositor for preview and exported frames; all geometry uses canvas proportions. */
export function paintMotionEffects(canvas: HTMLCanvasElement, scratch: HTMLCanvasElement, effects: readonly MotionEffect[], time: number, boundaries: readonly number[]) {
  const ctx = canvas.getContext('2d')!, copy = scratch.getContext('2d')!;
  const w = canvas.width, h = canvas.height, unit = Math.min(w, h);
  for (const effect of effects) {
    if (time < effect.start || time >= effect.end) continue;
    copy.clearRect(0, 0, w, h); copy.drawImage(canvas, 0, 0);
    const p = clamp((time - effect.start) / (effect.end - effect.start));
    const envelope = ease(p * 6) * ease((1 - p) * 6);
    const rows = effect.lines.split('\n').filter(s => s.trim()).slice(0, 6);
    const text = (value: string, x: number, y: number, size: number, width: number, color = '#ffffff', align: CanvasTextAlign = 'left') => {
      ctx.font = `800 ${size}px sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
      ctx.fillText(value, x, y, Math.max(1, width));
    };
    const box = (x: number, y: number, width: number, height: number, color: string, radius = unit * 0.025) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(x, y, width, height, radius); ctx.fill();
    };
    const zoom = (scale: number) => {
      ctx.translate(w * effect.x, h * effect.y); ctx.scale(scale, scale); ctx.translate(-w * effect.x, -h * effect.y);
      ctx.drawImage(scratch, 0, 0);
    };
    ctx.save();
    switch (effect.kind) {
      case 'light-leak': {
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = envelope * effect.intensity * 0.65;
        const x = w * (0.1 + p * 0.65), y = h * effect.y;
        const light = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * 0.85);
        light.addColorStop(0, effect.color); light.addColorStop(1, 'transparent');
        ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'spotlight': {
        const radius = Math.max(w, h) * 0.8;
        const light = ctx.createRadialGradient(w * effect.x, h * effect.y, radius * 0.12, w * effect.x, h * effect.y, radius);
        light.addColorStop(0, 'transparent'); light.addColorStop(1, '#000000');
        ctx.globalAlpha = envelope * effect.intensity;
        ctx.fillStyle = light; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = envelope * effect.intensity * 0.18;
        ctx.fillStyle = effect.color; ctx.fillRect(0, 0, w, h);
        break;
      }
      case 'digital-zoom': zoom(1 + envelope * effect.intensity * 0.8); break;
      case 'zoom-through': {
        const boundary = transitionBoundary(effect.start, effect.end, boundaries);
        if (boundary === undefined) break;
        const distance = time < boundary ? (boundary - time) / (boundary - effect.start) : (time - boundary) / (effect.end - boundary);
        zoom(1 + ease(1 - distance) * effect.intensity * 2.5);
        break;
      }
      case 'phone-mockup':
      case 'pull-back': {
        const reveal = effect.kind === 'pull-back' ? envelope : ease(p * 8) * ease((1 - p) * 8);
        const targetH = h * (0.78 - effect.intensity * 0.12);
        const targetW = effect.kind === 'phone-mockup' ? Math.min(w * 0.78, targetH * 9 / 16) : w * 0.78;
        const rw = w + (targetW - w) * reveal, rh = h + (targetH - h) * reveal;
        const x = (w - rw) / 2, y = (h - rh) / 2;
        ctx.fillStyle = '#101827'; ctx.fillRect(0, 0, w, h);
        text(effect.title, w / 2, h * 0.08, unit * 0.06, w * 0.9, effect.color, 'center');
        rows.slice(0, 2).forEach((line, i) => text(line, w / 2, h * (0.89 + i * 0.04), unit * 0.03, w * 0.88, '#e2e8f0', 'center'));
        box(x - unit * 0.012, y - unit * 0.012, rw + unit * 0.024, rh + unit * 0.024, '#e2e8f0', unit * 0.04);
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, rw, rh, unit * 0.03); ctx.clip();
        ctx.fillStyle = '#000'; ctx.fillRect(x, y, rw, rh);
        const scale = Math.min(rw / w, rh / h);
        ctx.drawImage(scratch, x + (rw - w * scale) / 2, y + (rh - h * scale) / 2, w * scale, h * scale); ctx.restore();
        if (effect.kind === 'phone-mockup') box(w / 2 - rw * 0.15, y + unit * 0.015, rw * 0.3, unit * 0.025, '#111827');
        break;
      }
      case 'checklist': {
        ctx.globalAlpha = envelope;
        const x = w * 0.07, width = w * 0.86, rowH = Math.min(h * 0.075, unit * 0.13);
        const y = Math.min(h - (rows.length + 1) * rowH - h * 0.04, h * effect.y);
        box(x, y, width, (rows.length + 1) * rowH, '#101827e8');
        text(effect.title, x + width * 0.05, y + rowH * 0.5, unit * 0.045, width * 0.9, effect.color);
        rows.forEach((line, i) => {
          const active = ease((p * (rows.length + 1) - i * 0.7) * 3);
          ctx.globalAlpha = envelope * (0.3 + active * 0.7);
          text(active > 0.5 ? '✓' : '○', x + width * 0.05, y + rowH * (i + 1.5), unit * 0.05, width * 0.1, effect.color);
          text(line, x + width * 0.16, y + rowH * (i + 1.5), unit * 0.037, width * 0.79);
        }); break;
      }
      case 'headline-wall': {
        ctx.globalAlpha = envelope;
        text(effect.title, w / 2, h * 0.065, unit * 0.05, w * 0.9, effect.color, 'center');
        rows.forEach((line, i) => {
          const arrival = ease(p * 7 - i * 0.35), width = w * 0.68, height = h * 0.09;
          ctx.globalAlpha = envelope * arrival;
          const x = w * (i % 2 ? 0.25 : 0.06) + (1 - arrival) * w * (i % 2 ? 1 : -1);
          const y = h * 0.12 + i * h * 0.125;
          ctx.save(); ctx.translate(x + width / 2, y + height / 2); ctx.rotate((i % 2 ? 1 : -1) * 0.035 * effect.intensity);
          box(-width / 2, -height / 2, width, height, '#f8faf0');
          box(-width / 2, -height / 2, width * 0.025, height, effect.color, 0);
          text(line, 0, 0, unit * 0.04, width * 0.9, '#111827', 'center'); ctx.restore();
        }); break;
      }
      case 'chart-grow': {
        const data = chartRows(effect.lines), maximum = Math.max(1, ...data.map(r => r.value));
        ctx.globalAlpha = envelope;
        const left = w * 0.08, top = h * 0.52, width = w * 0.84, height = h * 0.4;
        box(left, top, width, height, '#101827ed');
        text(effect.title, left + width * 0.06, top + height * 0.12, unit * 0.045, width * 0.88, effect.color);
        data.forEach((row, i) => {
          const growth = ease(p * 2.5 - i * 0.1), slot = width * 0.88 / Math.max(1, data.length);
          const x = left + width * 0.06 + i * slot, baseline = top + height * 0.79;
          const barH = height * 0.45 * row.value / maximum * growth;
          box(x + slot * 0.15, baseline - barH, slot * 0.7, Math.max(0.01, barH), effect.color, unit * 0.01);
          text(String(Math.round(row.value * growth)), x + slot / 2, baseline - barH - unit * 0.025, unit * 0.029, slot * 0.9, '#ffffff', 'center');
          text(row.label, x + slot / 2, baseline + height * 0.09, unit * 0.028, slot * 0.9, '#ffffff', 'center');
        }); break;
      }
      case 'cover-story': {
        ctx.globalAlpha = envelope;
        ctx.strokeStyle = effect.color; ctx.lineWidth = unit * 0.012; ctx.strokeRect(w * 0.04, h * 0.035, w * 0.92, h * 0.93);
        const gradient = ctx.createLinearGradient(0, h * 0.5, 0, h); gradient.addColorStop(0, '#00000000'); gradient.addColorStop(1, '#000000dd'); ctx.fillStyle = gradient; ctx.fillRect(0, 0, w, h);
        text(effect.title, w / 2, h * 0.12, unit * 0.1, w * 0.85, effect.color, 'center');
        rows.slice(0, 4).forEach((line, i) => text(line, w * 0.09, h * (0.72 + i * 0.055), unit * (i === 0 ? 0.055 : 0.035), w * 0.82));
        break;
      }
    }
    ctx.restore();
  }
}
