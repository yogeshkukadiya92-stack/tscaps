/**
 * Family a built-in template belongs to. A template is in exactly one:
 * the gallery lists it once, and a look that could be argued into two
 * is filed where someone would go looking for it first.
 */
export type TemplateCategory = 'key-moments' | 'modern' | 'viral' | 'classic' | 'lab'
  | 'studio-treatments' | 'real-estate' | 'perspective' | 'behind-person'
  | 'playful' | 'multiline' | 'dynamic' | 'editorial' | 'neon-fx'
  | 'creators' | 'desi' | 'social' | 'retro' | 'premium-captions';

/**
 * How the gallery shows a family. `clip` plays a burned-in sample over
 * the footage; `tile` renders the template's own DOM over a neutral
 * swatch.
 */
export type TemplateCategoryPreview = 'clip' | 'tile';

export interface TemplateCategoryDefinition {
  readonly label: string;
  /**
   * A family is `clip` when a caption on its own does not carry the
   * look — either it composes against the footage, or what it does
   * with the words is the point and a still frame misses it.
   */
  readonly preview: TemplateCategoryPreview;
  /** Rows the gallery shows before the family's *View all* link. */
  readonly previewRows: number;
}

/**
 * The families the gallery ships, in the order it lists them. Key order
 * is the display order, so moving a section is moving its entry.
 *
 * Modern uses live caption tiles, including language samples and hover
 * motion. Only Key moments keeps footage to demonstrate video compositing.
 *
 * `key-moments` is the one a template does not choose on looks: it holds
 * the ones composed against the whole frame — blended, cut behind the
 * actor, or reading the video's own pixels — which are unusable as body
 * captions whatever their styling.
 *
 * Rows follow how much each family is used: modern most, key moments
 * least.
 */
export const TEMPLATE_CATEGORIES: Readonly<Record<TemplateCategory, TemplateCategoryDefinition>> = {
  'premium-captions': { label: 'Premium captions', preview: 'tile', previewRows: 3 },
  modern: { label: 'Modern', preview: 'tile', previewRows: 3 },
  'key-moments': { label: 'Key moments', preview: 'clip', previewRows: 1 },
  viral: { label: 'Viral', preview: 'tile', previewRows: 2 },
  classic: { label: 'Classic', preview: 'tile', previewRows: 2 },
  lab: { label: 'Lab', preview: 'tile', previewRows: 2 },
  'studio-treatments': { label: 'Studio treatments', preview: 'tile', previewRows: 1 },
  'real-estate': { label: 'Real estate', preview: 'tile', previewRows: 1 },
  perspective: { label: 'Perspective', preview: 'tile', previewRows: 1 },
  'behind-person': { label: 'Behind person', preview: 'tile', previewRows: 1 },
  playful: { label: 'Playful', preview: 'tile', previewRows: 1 },
  multiline: { label: 'Multiline', preview: 'tile', previewRows: 1 },
  dynamic: { label: 'Dynamic', preview: 'tile', previewRows: 1 },
  editorial: { label: 'Editorial', preview: 'tile', previewRows: 1 },
  'neon-fx': { label: 'Neon & effects', preview: 'tile', previewRows: 1 },
  creators: { label: 'Creators', preview: 'tile', previewRows: 1 },
  desi: { label: 'Desi / Hinglish', preview: 'tile', previewRows: 1 },
  social: { label: 'Social', preview: 'tile', previewRows: 1 },
  retro: { label: 'Retro', preview: 'tile', previewRows: 1 },
};

export const TEMPLATE_CATEGORY_NAMES = Object.keys(TEMPLATE_CATEGORIES) as TemplateCategory[];
