import { INSTAGRAM_TEMPLATE_AUDIO, type InstagramAudioReference } from '@core/creative/InstagramReelAudio';
import { newCreativeProject, type CreativeAsset, type CreativeProject } from '@core/creative/CreativeProject';
import { newMotionEffect, type MotionEffectKind } from '@core/creative/MotionEffects';
import type { Motion } from '@core/creative/creativeModel';

export const REEL_TEMPLATE_CATEGORIES = ['All', 'Travel', 'Celebration', 'Business', 'Lifestyle', 'Creator', 'Fashion', 'Gujarati / Hindi'] as const;
export type MusicMood = 'sunrise' | 'celebrate' | 'minimal' | 'dream' | 'drive' | 'runway';
export interface ReelTemplate {
  id: string; name: string; category: string; description: string; color: string;
  bpm: number; beats: readonly number[]; look: string; motion: Motion; intensity: number;
  effect: MotionEffectKind; music: MusicMood;
  instagram?: InstagramAudioReference;
}
// Each arrangement defines its own pacing; durations and all boundaries derive from the music tempo.
type TemplateRow = [string, string, string, string, string, number, number[], string, Motion, number, MotionEffectKind, MusicMood];
const rows: TemplateRow[] = [
  ['travel-postcard', 'Travel Postcard', 'Travel', 'Warm highlights with a slow opening and quick memories.', '#f7b267', 104, [8,4,4,4,4,8], 'warm', 'push', .45, 'light-leak', 'sunrise'],
  ['weekend-escape', 'Weekend Escape', 'Travel', 'Six snapshots, bright rhythm and zoom-through cuts.', '#64d8cb', 120, [4,4,4,4,8,8], 'pop', 'pulse', .35, 'zoom-through', 'sunrise'],
  ['cinematic-journey', 'Cinematic Journey', 'Travel', 'Long cinematic shots and subtle focus moves.', '#8ea6bf', 80, [8,8,4,4,8], 'cinema', 'push', .3, 'digital-zoom', 'dream'],
  ['city-lights', 'City Lights', 'Travel', 'Cool urban frames with an accelerating middle.', '#829cff', 128, [8,4,2,2,4,4,8], 'cool', 'pulse', .4, 'zoom-through', 'drive'],
  ['nature-diary', 'Nature Diary', 'Travel', 'Gentle motion and soft light for landscapes.', '#9bc391', 88, [8,4,8,4,8], 'clean', 'push', .25, 'light-leak', 'dream'],
  ['birthday-confetti', 'Birthday Confetti', 'Celebration', 'Colourful beat cuts for your favourite moments.', '#fb8dba', 120, [8,4,4,2,2,4,8], 'pop', 'pulse', .55, 'light-leak', 'celebrate'],
  ['wedding-memories', 'Wedding Memories', 'Celebration', 'A romantic slow reveal with golden light.', '#eac4a1', 80, [8,8,8,8], 'warm', 'push', .2, 'light-leak', 'dream'],
  ['festival-glow', 'Festival Glow', 'Celebration', 'Vibrant festive moments with energetic focus changes.', '#ffa84d', 112, [8,4,4,4,4,8], 'warm', 'pulse', .5, 'digital-zoom', 'celebrate'],
  ['family-album', 'Family Album', 'Celebration', 'Comfortable photo holds and warm memories.', '#edb8a9', 96, [8,8,4,4,8], 'warm', 'push', .25, 'light-leak', 'sunrise'],
  ['party-recap', 'Party Recap', 'Celebration', 'Fast snapshots, bold colour and rhythmic zooms.', '#c78aff', 136, [4,4,2,2,4,4,4,8], 'pop', 'pulse', .6, 'zoom-through', 'celebrate'],
  ['product-drop', 'Product Drop', 'Business', 'A hero opening, detail shots and a final reveal.', '#80e4d1', 120, [8,4,4,4,4,8], 'clean', 'push', .4, 'spotlight', 'minimal'],
  ['property-tour', 'Property Tour', 'Business', 'Elegant room reveals and a spacious final shot.', '#d6bb86', 96, [8,8,4,4,8], 'warm', 'push', .3, 'zoom-through', 'minimal'],
  ['cafe-menu', 'Café Menu', 'Business', 'Warm food details with a lively middle.', '#e6aa77', 104, [8,4,4,4,4,8], 'warm', 'push', .35, 'light-leak', 'sunrise'],
  ['brand-story', 'Brand Story', 'Business', 'Quiet opening, steady details and confident finish.', '#a5b9d5', 100, [8,4,8,4,8], 'cinema', 'push', .25, 'spotlight', 'minimal'],
  ['sale-showcase', 'Sale Showcase', 'Business', 'Quick product changes with bold zoom transitions.', '#fd9e8e', 128, [4,4,4,2,2,4,4,8], 'pop', 'pulse', .45, 'zoom-through', 'drive'],
  ['morning-routine', 'Morning Routine', 'Lifestyle', 'Soft morning colours and relaxed rhythm.', '#efd49a', 88, [8,4,4,8,8], 'warm', 'push', .2, 'light-leak', 'sunrise'],
  ['food-journal', 'Food Journal', 'Lifestyle', 'Appetising close-ups with gentle focus moves.', '#e8a079', 108, [8,4,4,4,4,8], 'warm', 'push', .35, 'digital-zoom', 'minimal'],
  ['fitness-drive', 'Fitness Drive', 'Lifestyle', 'Punchy training montage with a strong final hold.', '#a3e878', 140, [8,4,2,2,4,4,8], 'cool', 'pulse', .65, 'zoom-through', 'drive'],
  ['slow-sunday', 'Slow Sunday', 'Lifestyle', 'Long peaceful holds and understated lighting.', '#bbafdc', 72, [8,8,4,4,8], 'cinema', 'push', .15, 'light-leak', 'dream'],
  ['daily-diary', 'Daily Diary', 'Lifestyle', 'A warm visual journal for everyday moments.', '#d6b49c', 100, [8,4,4,8,8], 'clean', 'push', .3, 'digital-zoom', 'sunrise'],
  ['beat-montage', 'Beat Montage', 'Creator', 'A quick hook followed by escalating beat cuts.', '#b5a2ff', 128, [4,4,4,2,2,4,4,8], 'pop', 'pulse', .5, 'zoom-through', 'drive'],
  ['before-after', 'Before / After', 'Creator', 'Two long reveals with a zoom at the change.', '#7fd5e7', 120, [16,16], 'clean', 'push', .3, 'zoom-through', 'minimal'],
  ['portfolio-reel', 'Portfolio Reel', 'Creator', 'Five cinematic highlights with controlled focus.', '#94accc', 104, [8,8,4,4,8], 'cinema', 'push', .35, 'spotlight', 'minimal'],
  ['behind-scenes', 'Behind the Scenes', 'Creator', 'A lively process reel ending on your finished work.', '#e8c06a', 112, [8,4,4,2,2,4,8], 'warm', 'pulse', .3, 'digital-zoom', 'sunrise'],
  ['monthly-recap', 'Monthly Recap', 'Creator', 'Eight favourite moments on a consistent beat.', '#cc9bd6', 120, [4,4,4,4,4,4,4,4], 'pop', 'push', .35, 'light-leak', 'celebrate'],
  ['outfit-check', 'Outfit Check', 'Fashion', 'A full look followed by quick detail reveals.', '#f1aac4', 120, [8,4,4,4,4,8], 'clean', 'push', .4, 'zoom-through', 'runway'],
  ['editorial-noir', 'Editorial Noir', 'Fashion', 'Monochrome frames with dramatic spotlight accents.', '#b8bdc9', 96, [8,8,4,4,8], 'noir', 'push', .3, 'spotlight', 'runway'],
  ['beauty-details', 'Beauty Details', 'Fashion', 'Soft light and close-up focus for beauty looks.', '#e5c1d9', 100, [8,4,8,4,8], 'warm', 'push', .2, 'light-leak', 'dream'],
  ['runway-cuts', 'Runway Cuts', 'Fashion', 'Fast outfit changes and a final hero frame.', '#a98bdf', 132, [8,2,2,4,4,4,8], 'cool', 'pulse', .5, 'zoom-through', 'runway'],
  ['jewellery-glow', 'Jewellery Glow', 'Fashion', 'Golden detail shots with slow focus and light.', '#e6c77b', 88, [8,8,4,4,8], 'warm', 'push', .2, 'spotlight', 'dream'],
  ['desi-garba-recap', 'ગરબાની રમઝટ · Garba Recap', 'Gujarati / Hindi', 'Outfit detail, friends, twirls and a group finale. Inspired by current Surat Garba recaps.', '#f4aa56', 128, [4,2,2,4,2,2,4,4,8], 'warm', 'pulse', .45, 'zoom-through', 'celebrate'],
  ['desi-mela-memories', 'મેળાની યાદો · Mela Memories', 'Gujarati / Hindi', 'A bright opening, quick festival details and a gentle memory hold. Inspired by observed fairground reels.', '#ffd080', 100, [4,2,2,4,4,8], 'warm', 'push', .3, 'light-leak', 'celebrate'],
  ['desi-raat-bhar-glow', 'Raat Bhar · Festive Glow', 'Gujarati / Hindi', 'Soft couple portraits, festive light and a warm final reveal. Add the suggested song inside Instagram.', '#efa4c4', 96, [4,4,2,2,4,8], 'warm', 'push', .25, 'light-leak', 'dream'],
  ['desi-gujju-portrait', 'મારી મજા · Gujju Portrait', 'Gujarati / Hindi', 'Four portrait moments with a confident opening and clean focus changes.', '#efc375', 120, [4,4,4,4], 'clean', 'push', .3, 'digital-zoom', 'minimal'],
  ['desi-manzar-journey', 'નવી સફર · Manzar Journey', 'Gujarati / Hindi', 'Open on your starting point, show the process, then hold on your progress.', '#88d6c2', 112, [8,4,4,2,2,4,8], 'cinema', 'push', .35, 'zoom-through', 'sunrise'],
  ['desi-late-night-diary', 'રાતની યાદો · Night Diary', 'Gujarati / Hindi', 'Quiet night-time memories with long holds and subtle light. A format reference rather than a verified viral trend.', '#a8b8de', 80, [8,4,4,8], 'cool', 'push', .2, 'light-leak', 'dream'],
];
export const REEL_TEMPLATES: readonly ReelTemplate[] = rows.map(([id, name, category, description, color, bpm, beats, look, motion, intensity, effect, music]) => ({
  id, name, category, description, color, bpm, beats, look, motion, intensity, effect, music,
  ...(INSTAGRAM_TEMPLATE_AUDIO[id] ? { instagram: INSTAGRAM_TEMPLATE_AUDIO[id] } : {}),
}));

export const reelTemplateBeats = (template: ReelTemplate, mediaCount = 0): readonly number[] =>
  Array.from({ length: Math.max(template.beats.length, mediaCount) }, (_, i) => template.beats[i % template.beats.length]!);
export const reelTemplateDuration = (template: ReelTemplate, mediaCount = 0) => reelTemplateBeats(template, mediaCount).reduce((a, b) => a + b, 0) * 60 / template.bpm;

/** Creates ordinary editable clips/effects. Short clips repeat rather than leaving blank frames. */
export function assembleReelTemplate(template: ReelTemplate, media: readonly { asset: CreativeAsset | null; duration: number }[], music: CreativeAsset | null, title: string): CreativeProject {
  if (media.length > 30) throw new Error('Choose up to 30 photos or videos per reel.');
  if (!media.length || media.some(item => !Number.isFinite(item.duration) || item.duration < .1)) throw new Error('Add at least one playable photo or video.');
  const duration = reelTemplateDuration(template, media.length);
  const project = newCreativeProject(Math.max(...media.map(item => item.duration)));
  project.settings = { ...project.settings, portrait: true, look: template.look, motion: template.motion, intensity: template.intensity,
    bpm: template.bpm, sourceVolume: 0, musicVolume: .65, text: title.trim().slice(0, 300), textColor: template.color, textY: 82, textSize: 6 };
  project.clips = []; project.effects = []; project.useTimelineCuts = false;
  let position = 0;
  reelTemplateBeats(template, media.length).forEach((beats, index) => {
    const item = media[index % media.length]!;
    let remaining = beats * 60 / template.bpm;
    while (remaining > 0.00001) {
      const length = Math.min(remaining, item.duration);
      project.clips.push({ id: crypto.randomUUID(), asset: item.asset, start: 0, end: length, volume: 1 });
      remaining -= length;
    }
    if (index > 0) {
      const effect = newMotionEffect(template.effect, Math.max(0, position - .25), Math.min(duration, position + .45));
      project.effects!.push({ ...effect, title: '', lines: '', color: template.color, intensity: template.intensity });
    }
    position += beats * 60 / template.bpm;
  });
  project.music = music;
  return project;
}
