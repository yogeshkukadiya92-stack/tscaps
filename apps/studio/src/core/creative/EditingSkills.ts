import type { AutoEditOptions, AutoEditStyle } from '@core/creative/AutoEdit';
import type { ReelPresetId } from '@core/creative/ReelPresets';

/** Built-in recipes execute locally; downloaded agent skills are never executed in the browser. */
export interface EditingSkill {
  id: string;
  name: string;
  description: string;
  style: AutoEditStyle;
  preset: ReelPresetId | null;
  options: AutoEditOptions;
}
const full = { pauses: true, zooms: true, polish: true, captions: true };
export const EDITING_SKILLS: readonly EditingSkill[] = [
  { id: 'complete', name: 'Complete reel', description: 'Warm lighting, pause cuts, gentle zooms, captions and voice cleanup.', style: 'clean', preset: 'golden-story', options: full },
  { id: 'cinematic', name: 'Cinematic', description: 'Amber spotlight, slow zooms, relaxed cuts and a cover opening.', style: 'clean', preset: 'cinema-diary', options: full },
  { id: 'studio', name: 'Studio lighting', description: 'Soft spotlight, balanced colour, subtle zooms and clear voice.', style: 'professional', preset: 'studio-spotlight', options: full },
  { id: 'energetic', name: 'Energetic reel', description: 'Neon lighting, tighter pauses, punch-ins and bold captions.', style: 'energetic', preset: 'neon-punch', options: full },
  { id: 'lesson', name: 'Teaching / tutorial', description: 'Cool lighting, focus zooms and a checklist from your opening words.', style: 'professional', preset: 'lesson-focus', options: full },
  { id: 'creator', name: 'Creator reveal', description: 'Blue light leaks, brisk cuts and a phone reveal opening.', style: 'energetic', preset: 'creator-reveal', options: full },
  { id: 'cuts', name: 'Quiet pause cuts', description: 'Remove measured quiet pauses with breathing room around words.', style: 'clean', preset: null, options: { pauses: true, zooms: false, polish: false, captions: false } },
  { id: 'zooms', name: 'Gentle zooms', description: 'Add subtle digital zooms while keeping the current caption look.', style: 'clean', preset: null, options: { pauses: false, zooms: true, polish: false, captions: false } },
];
