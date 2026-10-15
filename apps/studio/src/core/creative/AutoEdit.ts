import { REEL_PRESETS, type ReelPresetId } from '@core/creative/ReelPresets';
import type { Template } from '@core/templates/domain/Template';
import { StyleValues } from '@core/sheets/domain/StyleValues';
import type { Document } from '@tscaps/engine';
import type { Sheet } from '@core/sheets/domain/Sheet';
import { compositionSpans, type CreativeProject } from '@core/creative/CreativeProject';
import { DEFAULT_SETTINGS, mergeRanges, type CreativeSettings, type EditRange } from '@core/creative/creativeModel';
import { newMotionEffect } from '@core/creative/MotionEffects';

export const AUTO_EDIT_STYLES = [
  { id: 'clean', name: 'Clean', description: 'Natural pacing, readable captions and gentle zooms.', minPause: 0.7, handle: 0.18, interval: 12, zoom: 0.12, zoomLength: 3, fontSize: 3.4, fontWeight: 600, contrast: 1, saturation: 1 },
  { id: 'energetic', name: 'Energetic', description: 'Tighter pauses, bold captions and frequent punch-ins.', minPause: 0.5, handle: 0.12, interval: 5, zoom: 0.3, zoomLength: 1.8, fontSize: 4.2, fontWeight: 800, contrast: 1.08, saturation: 1.12 },
  { id: 'professional', name: 'Professional', description: 'Measured pacing, balanced colour and subtle emphasis.', minPause: 1, handle: 0.24, interval: 18, zoom: 0.08, zoomLength: 3.5, fontSize: 3.13, fontWeight: 600, contrast: 1.03, saturation: 0.96 },
] as const;
export type AutoEditStyle = typeof AUTO_EDIT_STYLES[number]['id'];
export interface QuietWindow { start: number; end: number; rms: number }
export interface AutoEditOptions { pauses: boolean; zooms: boolean; polish: boolean; captions: boolean }
export const DEFAULT_AUTO_EDIT_OPTIONS: AutoEditOptions = { pauses: true, zooms: true, polish: true, captions: true };
export interface AutoEditDraft {
  project: CreativeProject;
  sheets: Sheet[];
  removedSeconds: number;
  cutsAdded: number;
  zoomsAdded: number;
  captionsStyled: number;
  notes: string[];
}

/** Only measured quiet audio is cut; transcript intervals and breathing handles are protected. */
export function autoPauseCuts(windows: readonly QuietWindow[], words: readonly EditRange[], duration: number, styleId: AutoEditStyle): EditRange[] {
  const style = AUTO_EDIT_STYLES.find(s => s.id === styleId)!;
  const speech = mergeRanges(words.map(w => ({ start: w.start - style.handle, end: w.end + style.handle })), 0, duration);
  const quiet: EditRange[] = [];
  for (const w of windows) {
    if (!Number.isFinite(w.rms) || w.rms >= 0.012 || w.end <= w.start) continue;
    const previous = quiet.at(-1);
    if (previous && Math.abs(previous.end - w.start) < 0.002) previous.end = w.end;
    else quiet.push({ start: w.start, end: w.end });
  }
  // A silent recording has no reliable speech boundaries. Keep it intact.
  if (!windows.some(w => Number.isFinite(w.rms) && w.rms >= 0.012)) return [];
  const result: EditRange[] = [];
  for (const gap of quiet) {
    if (gap.end - gap.start < style.minPause) continue;
    let cursor = Math.max(0, gap.start + style.handle);
    const end = Math.min(duration, gap.end - style.handle);
    for (const word of speech) {
      if (word.end <= cursor) continue;
      if (word.start >= end) break;
      if (word.start - cursor >= 0.18) result.push({ start: cursor, end: Math.min(word.start, end) });
      cursor = Math.max(cursor, word.end);
      if (cursor >= end) break;
    }
    if (end - cursor >= 0.18) result.push({ start: cursor, end });
  }
  return mergeRanges(result, 0, duration);
}

/** Builds ordinary editable project objects. Never rewrites words, source clips or uploaded media. */
export function planAutoEdit(project: CreativeProject, sheets: readonly Sheet[], document: Document | null, windows: readonly QuietWindow[], timelineCuts: readonly EditRange[], styleId: AutoEditStyle, options: AutoEditOptions, recipe?: { id: ReelPresetId; template: Template }): AutoEditDraft {
  if (project.autoEdit) throw new Error('Auto Edit is already applied. Adjust the existing edits manually, or undo Auto Edit to try another style.');
  if (recipe && !REEL_PRESETS.some(p => p.id === recipe.id && p.templateId === recipe.template.metadata.id)) throw new Error('The reel template does not match its caption look.');
  const style = AUTO_EDIT_STYLES.find(s => s.id === styleId)!;
  const notes: string[] = [];
  const before = compositionSpans(project, timelineCuts);
  const originalEnd = Math.max(project.settings.end, ...project.clips.filter(c => !c.asset).map(c => c.end));
  const words = document?.getWords().map(w => ({ start: w.time.start, end: w.time.end })) ?? [];
  const timedLayers = !!project.effects?.length || !!project.overlays.length;
  let candidates = options.pauses && !timedLayers ? autoPauseCuts(windows, words, originalEnd, styleId) : [];
  if (options.pauses && timedLayers) notes.push('Pause cuts skipped to preserve the timing of your existing effects and B-roll.');
  if (options.pauses && !windows.length) notes.push('No decodable audio was available; no pause cuts were made.');
  if (!document?.getWords().length) notes.push('No transcript is available. Existing captions are required for word protection and caption styling.');
  // Without transcript protection, leave speech editing to the user.
  if (!words.length) candidates = [];
  // Add only new removed regions, keeping existing cut controls intact.
  const existing = mergeRanges([...project.silences, ...(project.useTimelineCuts ? timelineCuts : [])], 0, originalEnd);
  const added: EditRange[] = [];
  for (const range of candidates) {
    let cursor = range.start;
    for (const cut of existing) {
      if (cut.end <= cursor) continue;
      if (cut.start >= range.end) break;
      if (cut.start > cursor) added.push({ start: cursor, end: cut.start });
      cursor = Math.max(cursor, cut.end);
    }
    if (cursor < range.end) added.push({ start: cursor, end: range.end });
  }
  const settings = { ...project.settings };
  if (options.polish) {
    const polish: Partial<CreativeSettings> = { cleanup: true, normalize: true, ducking: true, contrast: style.contrast, saturation: style.saturation };
    // Existing custom values are preserved; only untouched defaults are styled.
    for (const key of Object.keys(polish) as (keyof typeof polish)[]) {
      if (settings[key] === DEFAULT_SETTINGS[key]) Object.assign(settings, { [key]: polish[key] });
    }
  }
  let next: CreativeProject = { ...project, settings, silences: [...project.silences, ...added] };
  let after = compositionSpans(next, timelineCuts);
  if ((after.at(-1)?.outputEnd ?? 0) < 0.5) {
    added.length = 0; next = { ...next, silences: project.silences }; after = before;
    notes.push('Pause cuts skipped because too little video would remain.');
  }
  const effects = [...(project.effects ?? [])];
  const oldCount = effects.length;
  if (options.zooms) {
    const duration = after.at(-1)?.outputEnd ?? 0;
    for (let start = Math.min(1, duration / 4); start + 0.5 < duration && effects.length < 40; start += style.interval) {
      const end = Math.min(duration, start + style.zoomLength);
      if (effects.some(e => e.start < end + 0.5 && e.end > start - 0.5)) continue;
      effects.push({ ...newMotionEffect('digital-zoom', start, end), intensity: style.zoom });
    }
  }
  let captionsStyled = 0;
  const nextSheets = sheets.map(sheet => {
    if (!options.captions || !words.length || sheet.cssOverride || sheet.linkGroupId) return sheet;
    const typography = sheet.typographyConfig;
    const baseline = sheet.template.typography;
    if (typography.fontSize !== baseline.fontSize || typography.fontWeight !== baseline.fontWeight) return sheet;
    if (recipe) {
      // A recipe may replace a default sheet, but must not reset a creator's custom design.
      const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
      const baselineValues = StyleValues.fromTemplateVariant(sheet.template, sheet.variantIndex).values;
      if (sheet.filtersSvgOverride || sheet.role || Object.keys(sheet.animations.toSnapshot()).length
        || !same(typography, baseline) || !same(sheet.styleValues.values, baselineValues)
        || !same(sheet.alignmentConfig, sheet.template.alignment) || !same(sheet.rotationConfig, sheet.template.rotation)
        || !same(sheet.segmentSplitterConfigs, sheet.template.segmentSplitterConfigs)
        || !same(sheet.lineSplitterConfig, sheet.template.lineSplitter) || !same(sheet.effectConfigs, sheet.template.effectConfigs)) return sheet;
      captionsStyled++;
      return sheet.withTemplate(recipe.template);
    }
    captionsStyled++;
    return sheet.with({ typographyConfig: { ...typography, fontSize: style.fontSize, fontWeight: style.fontWeight } });
  });
  if (options.captions && captionsStyled < sheets.length) notes.push('Custom caption formatting, CSS and linked caption styles were kept.');
  next = { ...next, effects, autoEdit: { style: styleId, ...(recipe ? { preset: recipe.id } : {}) } };
  return { project: next, sheets: nextSheets, cutsAdded: added.length, removedSeconds: Math.max(0, (before.at(-1)?.outputEnd ?? 0) - (after.at(-1)?.outputEnd ?? 0)), zoomsAdded: effects.length - oldCount, captionsStyled, notes };
}
