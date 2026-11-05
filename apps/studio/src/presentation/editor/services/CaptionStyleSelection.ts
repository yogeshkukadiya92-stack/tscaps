/**
 * Near-duplicate looks retired from the picker. Assets remain loadable so
 * existing projects and user-created styles keep their original rendering.
 * Values identify the retained look with the same visual structure.
 */
export const RETIRED_CAPTION_STYLES: Readonly<Record<string, string>> = {
  'premium-clean': 'premium-classic',
  'premium-crazy-2': 'premium-perfect',
  'premium-creator-4': 'premium-creator-3',
  'premium-estate-3': 'premium-estate-2',
  'premium-estate-4': 'premium-perfect',
  'premium-mint-punch': 'premium-master',
  'premium-solo': 'premium-master',
  'premium-smooth-fusion': 'premium-smooth',
  'premium-spotlight': 'premium-smooth',
  'dynamic-script-mix': 'dynamic-creator',
  'scene-focusline': 'scene-cool-girl',
  'scene-masala': 'scene-eclipse',
  'scene-pop-bold': 'scene-moments-pop',
};

/** Deliberately different treatments, ordered from everyday captions to expressive looks. */
export const RECOMMENDED_CAPTION_STYLE_IDS = [
  'premium-classic', 'premium-highlight', 'premium-karaoke',
  'premium-creator', 'premium-pill', 'premium-podcast',
  'premium-cursive', 'premium-glow', 'premium-ransom-note',
  'premium-torn-paper', 'dynamic-doctor', 'scene-gujarati-punch',
] as const;

export function isDistinctCaptionStyle(id: string): boolean {
  return !Object.hasOwn(RETIRED_CAPTION_STYLES, id);
}
