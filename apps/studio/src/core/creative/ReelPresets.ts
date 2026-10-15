import type { AutoEditStyle } from '@core/creative/AutoEdit';

/** Curated editing recipes, not rankings or promises of reach. Caption looks remain editable. */
export const REEL_PRESETS = [
  { id: 'bold-talk', name: 'Bold Talking Head', templateId: 'scene-boldface', style: 'energetic', description: 'Bold word plates, tighter pauses and punch-in zooms.', bestFor: 'Advice · Motivation' },
  { id: 'podcast', name: 'Podcast Clip', templateId: 'scene-podcast-cutout', style: 'clean', description: 'Outlined captions, natural pauses and gentle emphasis.', bestFor: 'Interviews · Podcasts' },
  { id: 'storytelling', name: 'Storytelling', templateId: 'scene-storyline', style: 'clean', description: 'Editorial captions and relaxed pacing for a spoken story.', bestFor: 'Personal stories · Voiceovers' },
  { id: 'quick-tips', name: 'Quick Tips', templateId: 'scene-karaoke', style: 'energetic', description: 'Active-word highlights and a brisk editing rhythm.', bestFor: 'How-to · Tips · Lists' },
  { id: 'business', name: 'Business & Education', templateId: 'scene-swiss', style: 'professional', description: 'Clean editorial type and restrained movement.', bestFor: 'Explainers · Business' },
] as const satisfies readonly { id: string; name: string; templateId: string; style: AutoEditStyle; description: string; bestFor: string }[];
export type ReelPresetId = typeof REEL_PRESETS[number]['id'];
export function isReelPresetId(id: unknown): id is ReelPresetId {
  return REEL_PRESETS.some(preset => preset.id === id);
}
