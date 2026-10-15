import type { AutoEditStyle } from '@core/creative/AutoEdit';

/** Curated editing recipes, not rankings or promises of reach. Caption looks remain editable. */
export const REEL_PRESETS = [
  { id: 'bold-talk', name: 'Bold Talking Head', templateId: 'scene-boldface', style: 'energetic', description: 'Bold word plates, tighter pauses and punch-in zooms.', category: 'Creator', bestFor: 'Advice · Motivation' },
  { id: 'podcast', name: 'Podcast Clip', templateId: 'scene-podcast-cutout', style: 'clean', description: 'Outlined captions, natural pauses and gentle emphasis.', category: 'Creator', bestFor: 'Interviews · Podcasts' },
  { id: 'storytelling', name: 'Storytelling', templateId: 'scene-storyline', style: 'clean', description: 'Editorial captions and relaxed pacing for a spoken story.', category: 'Lifestyle', bestFor: 'Personal stories · Voiceovers' },
  { id: 'quick-tips', name: 'Quick Tips', templateId: 'scene-karaoke', style: 'energetic', description: 'Active-word highlights and a brisk editing rhythm.', category: 'Education', bestFor: 'How-to · Tips · Lists' },
  { id: 'business', name: 'Business & Education', templateId: 'scene-swiss', style: 'professional', description: 'Clean editorial type and restrained movement.', category: 'Business', bestFor: 'Explainers · Business' },
  { id: 'glass-creator', name: 'Glass Creator', templateId: 'scene-liquid-glass', style: 'clean', category: 'Creator', description: 'Translucent caption plates with gentle focus zooms.', bestFor: 'Talking head · Creator updates', cadence: 0.8 },
  { id: 'chrome-hook', name: 'Chrome Hook', templateId: 'scene-chrome', style: 'energetic', category: 'Bold', description: 'Oversized metallic type with sharp punch-ins.', bestFor: 'Hooks · Product reveals', cadence: 1.15 },
  { id: 'riso-pop', name: 'Riso Pop', templateId: 'scene-riso', style: 'energetic', category: 'Bold', description: 'Print-inspired lettering and lively emphasis.', bestFor: 'Opinions · Creative reels', cadence: 1.35 },
  { id: 'linen-life', name: 'Linen Lifestyle', templateId: 'scene-linen', style: 'clean', category: 'Lifestyle', description: 'Soft editorial lettering with relaxed movement.', bestFor: 'Daily life · Wellness', cadence: 1 },
  { id: 'neon-social', name: 'Neon Social', templateId: 'scene-pink-neon', style: 'energetic', category: 'Bold', description: 'Bright neon captions and fast visual emphasis.', bestFor: 'Social updates · Entertainment', cadence: 0.8 },
  { id: 'darkroom-tech', name: 'Darkroom Tech', templateId: 'scene-darkroom', style: 'professional', category: 'Business', description: 'Compact mono typography with subtle zooms.', bestFor: 'Tech · Software explainers', cadence: 1.15 },
  { id: 'study-notes', name: 'Study Notes', templateId: 'scene-grid-notes', style: 'professional', category: 'Education', description: 'Notebook-inspired lettering with measured pacing.', bestFor: 'Study · Lessons', cadence: 1.35 },
  { id: 'soft-story', name: 'Soft Story', templateId: 'scene-soft-script', style: 'clean', category: 'Lifestyle', description: 'Expressive editorial captions and gentle motion.', bestFor: 'Personal stories · Reflections', cadence: 1 },
  { id: 'overclock', name: 'Overclock', templateId: 'scene-overclock', style: 'energetic', category: 'Bold', description: 'High-impact uppercase captions with brisk zooms.', bestFor: 'Fitness · Motivation', cadence: 0.8 },
  { id: 'cutout-diary', name: 'Cutout Diary', templateId: 'scene-cutout-board', style: 'clean', category: 'Lifestyle', description: 'Collage-style captions for a spoken diary.', bestFor: 'Daily journal · Behind the scenes', cadence: 1.15 },
  { id: 'pop-review', name: 'Pop Review', templateId: 'scene-pop-bold', style: 'energetic', category: 'Creator', description: 'Playful bold captions with quick punch-ins.', bestFor: 'Reviews · UGC', cadence: 1.35 },
  { id: 'blackboard-lesson', name: 'Blackboard Lesson', templateId: 'scene-blackboard', style: 'professional', category: 'Education', description: 'Handwritten lesson captions and restrained movement.', bestFor: 'Teaching · Coaching', cadence: 1 },
  { id: 'film-story', name: 'Film Story', templateId: 'scene-filmstrip', style: 'clean', category: 'Lifestyle', description: 'Film-inspired caption frames and natural pacing.', bestFor: 'Travel stories · Voiceovers', cadence: 0.8 },
  { id: 'desi-creator', name: 'Desi Creator', templateId: 'scene-desi-bold', style: 'energetic', category: 'Creator', description: 'Bold highlighted captions for spoken creator reels.', bestFor: 'Hindi · Gujarati · Hinglish', cadence: 1.15 },
  { id: 'moodboard', name: 'Moodboard Diary', templateId: 'scene-moodboard', style: 'clean', category: 'Lifestyle', description: 'Layered editorial captions and a calm rhythm.', bestFor: 'Design · Lifestyle', cadence: 1.35 },
  { id: 'arcade', name: 'Arcade Pop', templateId: 'scene-arcade', style: 'energetic', category: 'Bold', description: 'Chunky neon lettering and playful zooms.', bestFor: 'Gaming · Entertainment', cadence: 1 },
  { id: 'focus-explainer', name: 'Focus Explainer', templateId: 'scene-deep-focus', style: 'professional', category: 'Education', description: 'Focused readable captions with minimal movement.', bestFor: 'Tutorials · Concepts', cadence: 0.8 },
  { id: 'brand-studio', name: 'Brand Studio', templateId: 'scene-studio', style: 'professional', category: 'Business', description: 'Studio-style typography with polished emphasis.', bestFor: 'Brand stories · Services', cadence: 1.15 },
  { id: 'margin-notes', name: 'Margin Notes', templateId: 'scene-margin-note', style: 'professional', category: 'Education', description: 'Editorial note captions and unhurried emphasis.', bestFor: 'Book notes · Learning', cadence: 1.35 },
  { id: 'headline-update', name: 'Headline Update', templateId: 'scene-masthead', style: 'professional', category: 'Business', description: 'Magazine-style captions with clear visual hierarchy.', bestFor: 'News commentary · Updates', cadence: 1 },
] as const satisfies readonly { id: string; name: string; templateId: string; style: AutoEditStyle; description: string; bestFor: string; category: string; cadence?: number }[];
export type ReelPresetId = typeof REEL_PRESETS[number]['id'];
export function isReelPresetId(id: unknown): id is ReelPresetId {
  return REEL_PRESETS.some(preset => preset.id === id);
}

export const REEL_PRESET_CATEGORIES = ['All', 'Creator', 'Business', 'Education', 'Lifestyle', 'Bold'] as const;
export function filterReelPresets(query: string, category: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return REEL_PRESETS.filter(p => (category === 'All' || p.category === category) && terms.every(term => `${p.name} ${p.description} ${p.bestFor} ${p.style} ${p.category}`.toLowerCase().includes(term)));
}
