import { readMotionEffects, type MotionEffect } from '@core/creative/MotionEffects';
import type { EditRange, CreativeSettings } from '@core/creative/creativeModel';

export const AUTO_SETTING_KEYS = ['cleanup', 'normalize', 'ducking', 'contrast', 'saturation'] as const;
export type AutoSettings = Partial<Pick<CreativeSettings, typeof AUTO_SETTING_KEYS[number]>>;
export interface AutoCaptionChange {
  sheetId: string;
  beforeTemplate: string;
  afterTemplate: string;
  beforeSize: number;
  afterSize: number;
  beforeWeight: number;
  afterWeight: number;
  /** Full style fingerprint when a recipe replaced a default template. */
  recipeStyle?: string;
}
export interface AutoEditGeneration {
  version: 1;
  effects: MotionEffect[];
  silences: EditRange[];
  settings: { before: AutoSettings; after: AutoSettings };
  captions: AutoCaptionChange[];
  protectedSettings?: (typeof AUTO_SETTING_KEYS[number])[];
  protectedCaptions?: string[];
  protectedEffects: EditRange[];
  protectedSilences: EditRange[];
}
export function readAutoEditGeneration(value: unknown): AutoEditGeneration | undefined {
  if (value === undefined) return undefined;
  const g = value as AutoEditGeneration;
  const fail = () => { throw new Error('Invalid auto edit history.'); };
  if (!g || g.version !== 1 || !g.settings || !g.settings.before || !g.settings.after || !Array.isArray(g.captions) || g.captions.length > 200) return fail();
  if (!Array.isArray(g.effects)) return fail();
  readMotionEffects(g.effects);
  if (g.protectedSettings !== undefined && (!Array.isArray(g.protectedSettings) || g.protectedSettings.length > 5 || g.protectedSettings.some(k => !(AUTO_SETTING_KEYS as readonly string[]).includes(k)))) return fail();
  if (g.protectedCaptions !== undefined && (!Array.isArray(g.protectedCaptions) || g.protectedCaptions.length > 200 || g.protectedCaptions.some(id => typeof id !== 'string' || id.length > 200))) return fail();
  for (const ranges of [g.silences, g.protectedEffects, g.protectedSilences]) {
    if (!Array.isArray(ranges) || ranges.length > 36000 || ranges.some(r => !r || !Number.isFinite(r.start) || r.start < 0 || !Number.isFinite(r.end) || r.end <= r.start)) return fail();
  }
  if (AUTO_SETTING_KEYS.some(key => (g.settings.before[key] === undefined) !== (g.settings.after[key] === undefined))) return fail();
  for (const patch of [g.settings.before, g.settings.after]) {
    for (const [key, val] of Object.entries(patch)) {
      if (!(AUTO_SETTING_KEYS as readonly string[]).includes(key)) return fail();
      if (key === 'contrast' || key === 'saturation') {
        if (typeof val !== 'number' || !Number.isFinite(val) || val < (key === 'contrast' ? 0.5 : 0) || val > (key === 'contrast' ? 1.5 : 2)) return fail();
      } else if (typeof val !== 'boolean') return fail();
    }
  }
  for (const c of g.captions) {
    if (!c || [c.sheetId, c.beforeTemplate, c.afterTemplate].some(s => typeof s !== 'string' || s.length > 200)
      || [c.beforeSize, c.afterSize, c.beforeWeight, c.afterWeight].some(n => !Number.isFinite(n) || n < 0 || n > 1000)
      || (c.recipeStyle !== undefined && (typeof c.recipeStyle !== 'string' || c.recipeStyle.length > 20000))) return fail();
  }
  return g;
}
