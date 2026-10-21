import { describe, expect, it } from 'vitest';
import { CONTENT_FORMATS, CONTENT_LANGUAGES, buildContentEffects, contentExample, type ContentLanguage } from './ContentFormats';
import { newCreativeProject, readCreativeProject } from './CreativeProject';

describe('content format timelines', () => {
  it('preserves all 18 localized recipes across project serialization with contiguous timings', () => {
    for (const language of Object.keys(CONTENT_LANGUAGES) as ContentLanguage[]) {
      for (const format of CONTENT_FORMATS) {
        const draft = contentExample(format, language, 'My topic');
        const timings = [2, ...draft.points.map(() => 4), 2];
        const duration = timings.reduce((a, b) => a + b, 0);
        const effects = buildContentEffects(format, language, draft, timings, duration);
        const project = newCreativeProject(duration);
        project.effects = effects;
        expect(readCreativeProject(JSON.parse(JSON.stringify(project)))?.effects).toEqual(effects);
        expect(effects[0]!.title).toContain('My topic');
        expect(effects.at(-1)!.end).toBe(duration);
        effects.forEach((effect, i) => {
          expect(effect.start).toBe(i ? effects[i - 1]!.end : 0);
          expect(effect.end - effect.start).toBe(timings[i]);
          expect(effect.kind).toBe('content-card');
        });
        expect(effects.map(e => e.lines).filter(Boolean)).toEqual(draft.points);
      }
    }
  });
  it('rejects invalid or overlong timelines rather than exporting truncated scenes', () => {
    const draft = contentExample('listicle', 'en', 'Reels');
    for (const timings of [[2, 4, 4, 4, 2], [1, NaN, 1, 1, 1], [0, 1, 1, 1, 1], [1, 1]]) {
      expect(() => buildContentEffects('listicle', 'en', draft, timings, 5)).toThrow();
    }
    expect(() => buildContentEffects('listicle', 'en', { ...draft, hook: '' }, [1, 1, 1, 1, 1], 5)).toThrow();
    expect(() => buildContentEffects('listicle', 'en', { ...draft, points: [''] }, [1, 1, 1, 1, 1], 5)).toThrow();
  });
});
