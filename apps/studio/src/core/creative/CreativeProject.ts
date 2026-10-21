import { readContentFormatState, recoverContentFormatState, type ContentFormatState } from '@core/creative/ContentFormats';
import { readAutoEditGeneration, type AutoEditGeneration } from '@core/creative/AutoEditGeneration';
import { isReelPresetId, type ReelPresetId } from '@core/creative/ReelPresets';
import { readMotionEffects, type MotionEffect } from '@core/creative/MotionEffects';
import { buildCuts, DEFAULT_SETTINGS, type CreativeSettings, type EditRange } from '@core/creative/creativeModel';

export interface CreativeAsset {
  id: string;
  name: string;
  mimeType: string;
  /** Owner-scoped storage key; never a public or expiring URL. */
  key: string;
  remote: boolean;
  duration: number;
}
export interface CreativeClip {
  id: string;
  /** null uses the original project video and its editable captions. */
  asset: CreativeAsset | null;
  start: number;
  end: number;
  volume: number;
}
export interface BRoll {
  id: string;
  asset: CreativeAsset;
  start: number;
  end: number;
  sourceStart: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CreativeProject {
  version: 1;
  /** Present after one Auto Edit pass; all resulting edits remain ordinary editable values. */
  autoEdit?: { style: 'clean' | 'energetic' | 'professional'; preset?: ReelPresetId; generation?: AutoEditGeneration };
  effects?: MotionEffect[];
  contentFormat?: ContentFormatState;
  settings: CreativeSettings;
  clips: CreativeClip[];
  overlays: BRoll[];
  music: CreativeAsset | null;
  musicOffset: number;
  silences: EditRange[];
  useTimelineCuts: boolean;
}
export interface CreativeSpan {
  clip: CreativeClip;
  sourceStart: number;
  sourceEnd: number;
  outputStart: number;
  outputEnd: number;
}
export function newCreativeProject(duration: number): CreativeProject {
  return { version: 1, settings: { ...DEFAULT_SETTINGS, end: duration },
    clips: [{ id: crypto.randomUUID(), asset: null, start: 0, end: duration, volume: 1 }],
    overlays: [], music: null, musicOffset: 0, silences: [], useTimelineCuts: true };
}
export function compositionSpans(project: CreativeProject, timelineCuts: readonly EditRange[]): CreativeSpan[] {
  const speed = project.settings.speed;
  if (!Number.isFinite(project.settings.bpm) || project.settings.bpm < 40 || project.settings.bpm > 240) throw new Error('BPM must be between 40 and 240.');
  if (!Number.isFinite(speed) || speed < 0.5 || speed > 2) throw new Error('Speed must be between 0.5 and 2.');
  let position = 0;
  const spans: CreativeSpan[] = [];
  for (const clip of project.clips) {
    const start = Math.max(clip.start, clip.asset ? 0 : project.settings.start);
    const end = Math.min(clip.end, clip.asset ? clip.asset.duration : project.settings.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    const cuts = clip.asset ? [] : buildCuts({ ...project.settings, start, end }, project.silences,
      project.useTimelineCuts ? timelineCuts : []);
    let cursor = start;
    for (const cut of [...cuts, { start: end, end }]) {
      if (cut.start > cursor) {
        const outputEnd = position + (cut.start - cursor) / speed;
        spans.push({ clip, sourceStart: cursor, sourceEnd: cut.start, outputStart: position, outputEnd });
        position = outputEnd;
      }
      cursor = Math.max(cursor, cut.end);
    }
  }
  return spans;
}
export function spanAt(spans: readonly CreativeSpan[], time: number): CreativeSpan | undefined {
  return spans.find(span => time >= span.outputStart && time < span.outputEnd);
}
export function creativeResolution(width: number, height: number, portrait = false, shortSide = 1080) {
  if (portrait) return { width: shortSide, height: Math.round(shortSide * 16 / 9 / 2) * 2 };
  const scale = Math.min(1, shortSide / Math.min(width, height));
  return { width: Math.max(2, Math.round(width * scale / 2) * 2), height: Math.max(2, Math.round(height * scale / 2) * 2) };
}

/** Reject malformed imported projects before they reach decode loops or storage paths. */
export function readCreativeProject(value: unknown): CreativeProject | null {
  if (value == null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid creative project.');
  const project = value as CreativeProject;
  if (project.version !== 1 || !project.settings || !Array.isArray(project.clips) || !Array.isArray(project.overlays) || !Array.isArray(project.silences)) throw new Error('Unsupported creative project format.');
  const settings = { ...DEFAULT_SETTINGS, ...project.settings };
  const finite = (n: unknown, min: number, max = Infinity) => typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max;
  if (!finite(settings.speed, 0.5, 2) || !finite(settings.bpm, 40, 240) || !finite(settings.start, 0) || !finite(settings.end, settings.start)
    || !finite(settings.sourceVolume, 0, 1) || !finite(settings.musicVolume, 0, 1) || !finite(project.musicOffset, 0)
    || !finite(settings.brightness, 0.5, 1.5) || !finite(settings.contrast, 0.5, 1.5) || !finite(settings.saturation, 0, 2)
    || !finite(settings.intensity, 0, 1) || !finite(settings.textSize, 2, 15) || !finite(settings.textY, 0, 100)
    || typeof settings.text !== 'string' || settings.text.length > 300 || !/^#[0-9a-f]{6}$/i.test(settings.textColor)
    || !['none', 'push', 'pulse', 'shake', 'flash'].includes(settings.motion)) throw new Error('Invalid creative settings.');
  const assetValid = (asset: CreativeAsset) => asset && typeof asset.id === 'string' && typeof asset.name === 'string'
    && typeof asset.key === 'string' && /^[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\/creative\/[a-zA-Z0-9-]+$/.test(asset.key)
    && typeof asset.remote === 'boolean' && typeof asset.mimeType === 'string' && finite(asset.duration, 0.001, 1800);
  if (project.music && !assetValid(project.music)) throw new Error('Invalid music reference.');
  for (const clip of project.clips) {
    if (!clip || typeof clip.id !== 'string' || (clip.asset !== null && !assetValid(clip.asset)) || !finite(clip.start, 0)
      || !finite(clip.end, clip.start) || !finite(clip.volume, 0, 1)) throw new Error('Invalid clip.');
  }
  for (const overlay of project.overlays) {
    if (!overlay || !assetValid(overlay.asset) || !finite(overlay.start, 0) || !finite(overlay.end, overlay.start)
      || !finite(overlay.sourceStart, 0) || !finite(overlay.x, 0, 1) || !finite(overlay.y, 0, 1)
      || !finite(overlay.width, 0.01, 1) || !finite(overlay.height, 0.01, 1)) throw new Error('Invalid B-roll overlay.');
  }
  for (const range of project.silences) if (!range || !finite(range.start, 0) || !finite(range.end, range.start)) throw new Error('Invalid silence range.');
  if (project.autoEdit !== undefined && (!project.autoEdit || !['clean', 'energetic', 'professional'].includes(project.autoEdit.style))) throw new Error('Invalid auto edit style.');
  if (project.autoEdit?.preset !== undefined && !isReelPresetId(project.autoEdit.preset)) throw new Error('Invalid reel template.');
  readAutoEditGeneration(project.autoEdit?.generation);
  const effects = readMotionEffects(project.effects);
  const contentFormat = readContentFormatState(project.contentFormat) ?? recoverContentFormatState(effects);
  return { ...project, settings, ...(effects ? { effects } : {}), ...(contentFormat ? { contentFormat } : {}) };
}
