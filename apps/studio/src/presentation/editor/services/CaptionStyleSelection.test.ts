import { expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Template } from '@core/templates/domain/Template';
import { TemplateGalleryLayout } from '@presentation/editor/services/TemplateGalleryLayout';
import { RECOMMENDED_CAPTION_STYLE_IDS, RETIRED_CAPTION_STYLES } from '@presentation/editor/services/CaptionStyleSelection';

it('keeps retired assets and their distinct replacements loadable for existing projects', () => {
  for (const id of [...Object.keys(RETIRED_CAPTION_STYLES), ...Object.values(RETIRED_CAPTION_STYLES), ...RECOMMENDED_CAPTION_STYLE_IDS]) {
    expect(existsSync(resolve('../../templates', id, 'style.build.css')), id).toBe(true);
    expect(JSON.parse(readFileSync(resolve('../../templates', id, 'template.json'), 'utf8')).name).toBeTruthy();
  }
  expect(RECOMMENDED_CAPTION_STYLE_IDS.every(id => !Object.hasOwn(RETIRED_CAPTION_STYLES, id))).toBe(true);
});

it('removes repeats from browsing, favorites and search while retaining user-created styles', () => {
  const make = (id: string) => ({ metadata: { id, name: 'Smooth', category: 'premium-captions' } }) as unknown as Template;
  const original = make('premium-smooth'), repeat = make('premium-smooth-fusion'), saved = make('my-smooth');
  const input = { builtins: [original, repeat], userTemplates: [saved], favoriteIds: new Set([repeat.metadata.id]) };
  const layout = new TemplateGalleryLayout();
  expect(layout.build(input).flatMap(s => s.templates)).toEqual([saved, original]);
  expect(layout.search(input, 'smooth')).toEqual([saved, original]);
});
