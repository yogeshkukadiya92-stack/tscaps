import { AUTO_SETTING_KEYS, type AutoEditGeneration, type AutoSettings } from '@core/creative/AutoEditGeneration';
import { REEL_PRESETS, type ReelPresetId } from '@core/creative/ReelPresets';
import type { Template } from '@core/templates/domain/Template';
import { StyleValues } from '@core/sheets/domain/StyleValues';
import type { Document } from '@tscaps/engine';
import type { Sheet } from '@core/sheets/domain/Sheet';
import { compositionSpans, type CreativeProject } from '@core/creative/CreativeProject';
import { DEFAULT_SETTINGS, mergeRanges, type EditRange } from '@core/creative/creativeModel';
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


const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function captionStyle(sheet: Sheet): string {
  return JSON.stringify({ template: sheet.template.metadata?.id, variant: sheet.variantIndex, typography: sheet.typographyConfig,
    values: sheet.styleValues.values, alignment: sheet.alignmentConfig, rotation: sheet.rotationConfig,
    splitters: sheet.segmentSplitterConfigs, lines: sheet.lineSplitterConfig, effects: sheet.effectConfigs,
    animations: sheet.animations.toSnapshot(), css: sheet.cssOverride, filters: sheet.filtersSvgOverride, link: sheet.linkGroupId, role: sheet.role });
}
/** Reverse only unchanged auto-owned values. Manual changes and removals become protected. */
function prepareAnotherStyle(project: CreativeProject, sheets: readonly Sheet[], templates: readonly Template[]) {
  const history = project.autoEdit?.generation;
  const protectedSettings = [...(history?.protectedSettings ?? [])];
  const protectedCaptions = [...(history?.protectedCaptions ?? [])];
  const protectedEffects = [...(history?.protectedEffects ?? [])];
  const protectedSilences = [...(history?.protectedSilences ?? [])];
  const settings = { ...project.settings };
  if (!history) {
    // Older saved projects have no ownership history; preserve their effects and cuts.
    const oldStyle = AUTO_EDIT_STYLES.find(s => s.id === project.autoEdit?.style);
    if (oldStyle) {
      if (settings.contrast === oldStyle.contrast) settings.contrast = DEFAULT_SETTINGS.contrast;
      if (settings.saturation === oldStyle.saturation) settings.saturation = DEFAULT_SETTINGS.saturation;
    }
    return { project: { ...project, settings }, sheets: sheets.map(sheet => {
      if (oldStyle && !project.autoEdit?.preset && sheet.typographyConfig.fontSize === oldStyle.fontSize && sheet.typographyConfig.fontWeight === oldStyle.fontWeight) {
        return sheet.with({ typographyConfig: { ...sheet.typographyConfig, fontSize: sheet.template.typography.fontSize, fontWeight: sheet.template.typography.fontWeight } });
      }
      return sheet;
    }), protectedSettings, protectedCaptions, protectedEffects, protectedSilences };
  }
  const effects = (project.effects ?? []).filter(effect => {
    const generated = history.effects.find(e => e.id === effect.id);
    return !generated || !same(effect, generated);
  });
  for (const generated of history.effects) {
    const current = project.effects?.find(e => e.id === generated.id);
    if (!same(current, generated)) {
      protectedEffects.push({ start: generated.start, end: generated.end });
      if (current) protectedEffects.push({ start: current.start, end: current.end });
    }
  }
  const silences = project.overlays.length || effects.length ? project.silences : project.silences.filter(cut => !history.silences.some(g => same(g, cut)));
  for (const cut of history.silences) if (!project.silences.some(c => same(c, cut))) protectedSilences.push(cut);
  for (const key of AUTO_SETTING_KEYS) {
    if (history.settings.after[key] !== undefined) {
      if (settings[key] === history.settings.after[key]) Object.assign(settings, { [key]: history.settings.before[key] });
      else if (!protectedSettings.includes(key)) protectedSettings.push(key);
    }
  }
  const restored = sheets.map(sheet => {
    const c = history.captions.find(change => change.sheetId === sheet.id);
    if (!c) return sheet;
    if ((sheet.template.metadata?.id ?? '') !== c.afterTemplate || sheet.typographyConfig.fontSize !== c.afterSize || sheet.typographyConfig.fontWeight !== c.afterWeight || (c.recipeStyle && captionStyle(sheet) !== c.recipeStyle)) {
      if (!protectedCaptions.includes(sheet.id)) protectedCaptions.push(sheet.id);
      return sheet;
    }
    if (c.recipeStyle) {
      const template = templates.find(t => t.metadata.id === c.beforeTemplate);
      return template && captionStyle(sheet) === c.recipeStyle ? sheet.withTemplate(template).with({ typographyConfig: { ...template.typography, fontSize: c.beforeSize, fontWeight: c.beforeWeight } }) : sheet;
    }
    return sheet.with({ typographyConfig: { ...sheet.typographyConfig,
      fontSize: sheet.typographyConfig.fontSize === c.afterSize ? c.beforeSize : sheet.typographyConfig.fontSize,
      fontWeight: sheet.typographyConfig.fontWeight === c.afterWeight ? c.beforeWeight : sheet.typographyConfig.fontWeight } });
  });
  return { project: { ...project, settings, effects, silences }, sheets: restored, protectedSettings, protectedCaptions,
    protectedEffects: mergeRanges(protectedEffects, 0, Infinity), protectedSilences: mergeRanges(protectedSilences, 0, Infinity) };
}

/** Builds ordinary editable project objects. Never rewrites words, source clips or uploaded media. */
export function planAutoEdit(project: CreativeProject, sheets: readonly Sheet[], document: Document | null, windows: readonly QuietWindow[], timelineCuts: readonly EditRange[], styleId: AutoEditStyle, options: AutoEditOptions, recipe?: { id: ReelPresetId; template: Template }, templates: readonly Template[] = []): AutoEditDraft {
  const originalProject = project;
  const prepared = prepareAnotherStyle(project, sheets, templates);
  project = prepared.project; sheets = prepared.sheets;
  if (recipe && !REEL_PRESETS.some(p => p.id === recipe.id && p.templateId === recipe.template.metadata.id)) throw new Error('The reel template does not match its caption look.');
  const style = AUTO_EDIT_STYLES.find(s => s.id === styleId)!;
  const notes: string[] = [];
  const before = compositionSpans(originalProject, timelineCuts);
  if (originalProject.autoEdit && !originalProject.autoEdit.generation) notes.push('This older edit has no generation history. Its existing cuts and effects are kept.');
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
  const existing = mergeRanges([...project.silences, ...prepared.protectedSilences, ...(project.useTimelineCuts ? timelineCuts : [])], 0, originalEnd);
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
    const polish: AutoSettings = { cleanup: true, normalize: true, ducking: true, contrast: style.contrast, saturation: style.saturation };
    // Existing custom values are preserved; only untouched defaults are styled.
    for (const key of Object.keys(polish) as (typeof AUTO_SETTING_KEYS[number])[]) {
      if (!prepared.protectedSettings.includes(key) && settings[key] === DEFAULT_SETTINGS[key]) Object.assign(settings, { [key]: polish[key] });
    }
  }
  let next: CreativeProject = { ...project, settings, silences: [...project.silences, ...added] };
  let after = compositionSpans(next, timelineCuts);
  if ((after.at(-1)?.outputEnd ?? 0) < 0.5) {
    added.length = 0; next = { ...next, silences: project.silences }; after = compositionSpans(next, timelineCuts);
    notes.push('Pause cuts skipped because too little video would remain.');
  }
  const effects = [...(project.effects ?? [])];
  const oldCount = effects.length;
  if (options.zooms) {
    const duration = after.at(-1)?.outputEnd ?? 0;
    for (let start = Math.min(1, duration / 4); start + 0.5 < duration && effects.length < 40; start += style.interval) {
      const end = Math.min(duration, start + style.zoomLength);
      if ([...effects, ...prepared.protectedEffects].some(e => e.start < end + 0.5 && e.end > start - 0.5)) continue;
      effects.push({ ...newMotionEffect('digital-zoom', start, end), intensity: style.zoom });
    }
  }
  let captionsStyled = 0;
  const nextSheets = sheets.map(sheet => {
    if (!options.captions || !words.length || prepared.protectedCaptions.includes(sheet.id) || sheet.cssOverride || sheet.linkGroupId) return sheet;
    const typography = sheet.typographyConfig;
    const baseline = sheet.template.typography;
    if (typography.fontSize !== baseline.fontSize || typography.fontWeight !== baseline.fontWeight) return sheet;
    if (recipe) {
      // A recipe may replace a default sheet, but must not reset a creator's custom design.
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
  const generation: AutoEditGeneration = { version: 1, effects: effects.slice(oldCount), silences: added,
    settings: { before: {}, after: {} }, captions: [], protectedSettings: prepared.protectedSettings, protectedCaptions: prepared.protectedCaptions, protectedEffects: prepared.protectedEffects, protectedSilences: prepared.protectedSilences };
  for (const key of AUTO_SETTING_KEYS) if (settings[key] !== project.settings[key]) {
    Object.assign(generation.settings.before, { [key]: project.settings[key] });
    Object.assign(generation.settings.after, { [key]: settings[key] });
  }
  nextSheets.forEach((sheet, i) => {
    const beforeSheet = sheets[i]!;
    if (sheet === beforeSheet) return;
    generation.captions.push({ sheetId: sheet.id, beforeTemplate: beforeSheet.template.metadata?.id ?? '', afterTemplate: sheet.template.metadata?.id ?? '',
      beforeSize: beforeSheet.typographyConfig.fontSize, afterSize: sheet.typographyConfig.fontSize,
      beforeWeight: beforeSheet.typographyConfig.fontWeight, afterWeight: sheet.typographyConfig.fontWeight,
      ...(recipe ? { recipeStyle: captionStyle(sheet) } : {}) });
  });
  next = { ...next, effects, autoEdit: { style: styleId, ...(recipe ? { preset: recipe.id } : {}), generation } };
  return { project: next, sheets: nextSheets, cutsAdded: added.length, removedSeconds: Math.max(0, (before.at(-1)?.outputEnd ?? 0) - (after.at(-1)?.outputEnd ?? 0)), zoomsAdded: effects.length - oldCount, captionsStyled, notes };
}

/** Font loading reflows captions without editing words; it must not invalidate a draft. */
export function sameAutoEditInputs(a: import('@core/editor/domain/EditorState').EditorState, b: import('@core/editor/domain/EditorState').EditorState): boolean {
  if (a.projectId !== b.projectId || a.activeCaptionTrackId !== b.activeCaptionTrackId || a.creative !== b.creative || a.cuts !== b.cuts || a.elementStyles !== b.elementStyles
    || a.decorationOverrides !== b.decorationOverrides || a.frozenSegments !== b.frozenSegments || a.behindActorOverrides !== b.behindActorOverrides
    || a.video.file !== b.video.file || !same(a.video.layout, b.video.layout)) return false;
  if (a.sheets !== b.sheets && !same(a.sheets.map(s => [s.id, s.name, s.color, s.textDirection, captionStyle(s)]), b.sheets.map(s => [s.id, s.name, s.color, s.textDirection, captionStyle(s)]))) return false;
  if (a.document === b.document) return true;
  const words = (doc: Document | null) => doc ? { language: doc.language, sections: doc.sections.map(s => ({ kind: s.kind, words: s.getWords().map(w => ({
    id: w.id, text: w.text, display: w.displayText, time: w.time, speaker: w.speakerId, tags: [...w.semanticTags], decoration: w.decoration, metadata: w.metadata,
  })) })) } : null;
  return same(words(a.document), words(b.document));
}
