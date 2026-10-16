import { describe, expect, it } from 'vitest';
import { SvgFilterDefinitionsParser, TagConditionParser } from '@tscaps/engine';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuiltinTemplateAssetsBuilder } from '@core/templates/infrastructure/BuiltinTemplateAssetsBuilder';

// Read the actual build artifacts: Vitest's CSS transform stubs CSS imports.
const templateRoot = resolve('../../templates');
const folders = readdirSync(templateRoot).filter((id) => id.startsWith('premium-'));
const modules = (file: string, json = false) => Object.fromEntries(folders.flatMap((id) => {
  const path = resolve(templateRoot, id, file);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  return [[`/templates/${id}/${file}`, json ? JSON.parse(raw) : raw]];
}));
const BUILTIN_TEMPLATE_ASSETS = new BuiltinTemplateAssetsBuilder(
  modules('style.build.css'), modules('template.json', true), {},
  modules('controls.build.json', true), modules('animations.build.json', true),
  modules('fonts.build.json', true),
).build();
import { LocalFileTemplateLoader } from '@core/templates/infrastructure/LocalFileTemplateLoader';
import { BuiltinAssetRepository } from '@core/assets/infrastructure/repositories/BuiltinAssetRepository';
import { CssAssetReferenceResolver } from '@core/templates/services/CssAssetReferenceResolver';
import { SegmentSplitterRegistry } from '@core/segment-splitter/services/SegmentSplitterRegistry';
import { LineSplitterRegistry } from '@core/line-splitter/services/LineSplitterRegistry';
import { EffectRegistry } from '@core/effect/services/EffectRegistry';
import { BoxEdgesShorthandParser } from '@core/templates/services/BoxEdgesShorthandParser';
import { CalendarDateParser } from '@core/templates/domain/CalendarDateParser';
import { StyleControlResolver } from '@core/templates/services/controls/StyleControlResolver';
import { StyleControlCatalog } from '@core/templates/domain/definition/StyleControlCatalog';
import { SimilarNameFinder } from '@core/_shared/services/SimilarNameFinder';
import { FontStackLibrary } from '@core/fonts/domain/FontStackLibrary';
import { TemplateGalleryLayout } from '@presentation/editor/services/TemplateGalleryLayout';

const fonts = new FontStackLibrary();
const loader = new LocalFileTemplateLoader(
  BUILTIN_TEMPLATE_ASSETS, new CssAssetReferenceResolver(new BuiltinAssetRepository([])),
  new SegmentSplitterRegistry(), new LineSplitterRegistry(), new EffectRegistry(),
  new SvgFilterDefinitionsParser(), new BoxEdgesShorthandParser(), new TagConditionParser(),
  new StyleControlResolver(new StyleControlCatalog(new SimilarNameFinder()), fonts), fonts,
  new CalendarDateParser(),
);
const ids = Object.keys(BUILTIN_TEMPLATE_ASSETS).filter((id) => id.startsWith('premium-'));

describe('premium caption library', () => {
  it('loads all presets through the editor loader and groups them into one tile gallery', async () => {
    expect(ids).toHaveLength(58);
    const templates = await Promise.all(ids.map((id) => loader.load(id)));
    const sections = new TemplateGalleryLayout().build({
      builtins: templates, userTemplates: [], favoriteIds: new Set(),
    });
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe('premium-captions');
    expect(sections[0]?.templates).toHaveLength(58);
    for (const id of ids) {
      const config = BUILTIN_TEMPLATE_ASSETS[id]!.config;
      expect(fonts.knows(config.typography!.fontStack!), id).toBe(true);
      expect(BUILTIN_TEMPLATE_ASSETS[id]!.css.length, id).toBeGreaterThan(100);
    }
  });

  it('uses the bundled Hind face for Devanagari', () => {
    expect(fonts.stackFor('hind').familyFor('devanagari')).toBe('Hind');
  });
});
