import { describe, expect, it } from 'vitest';
import { CONTENT_FORMATS, CONTENT_LANGUAGES, buildContentEffects, contentExample, type ContentLanguage } from '@core/creative/ContentFormats';
import { newCreativeProject, readCreativeProject } from '@core/creative/CreativeProject';

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

describe('content authoring persistence', () => {
  it('round trips selected format, independent language drafts, topics and unapplied edits', () => {
    const project = newCreativeProject(60);
    project.contentFormat = { language: 'gu', format: 'listicle', topics: { gu: 'મારી વાર્તા', hi: 'मेरी कहानी' }, drafts: {} };
    for (const language of ['en', 'hi', 'gu'] as const) {
      const draft = contentExample('listicle', language, project.contentFormat.topics[language] ?? 'My story');
      project.contentFormat.drafts[`listicle:${language}`] = { draft: { ...draft, hook: `${language} custom hook`, cta: '' }, timings: [1, 2, 3, 4, 0] };
    }
    const restored = readCreativeProject(JSON.parse(JSON.stringify(project)))!;
    expect(restored.contentFormat).toEqual(project.contentFormat);
    expect(restored.effects).toBeUndefined();
  });
  it('loads older projects and rejects malformed authoring data', () => {
    const project = newCreativeProject(30);
    expect(readCreativeProject(project)?.contentFormat).toBeUndefined();
    for (const contentFormat of [null, {}, { language: 'xx', format: 'listicle', topics: {}, drafts: {} },
      { language: 'en', format: 'listicle', topics: {}, drafts: { 'listicle:en': { draft: { hook: 'a', cta: 'b', points: ['x'] }, timings: [1] } } }]) {
      expect(() => readCreativeProject({ ...project, contentFormat })).toThrow('Invalid content format draft.');
    }
  });
});


describe('legacy content cards', () => {
  it('recovers all original recipe forms and languages without changing their rendered cards', () => {
    for (const language of ['en', 'hi', 'gu'] as const) for (const format of CONTENT_FORMATS) {
      const draft = contentExample(format, language, 'My topic');
      const timings = [2, ...draft.points.map(() => 3), 2];
      const project = newCreativeProject(60);
      project.effects = buildContentEffects(format, language, draft, timings, 60);
      const restored = readCreativeProject(project)!;
      expect(restored.effects).toEqual(project.effects);
      expect(restored.contentFormat).toMatchObject({ language, format, topics: { [language]: 'My topic' }, drafts: { [`${format}:${language}`]: { draft, timings } } });
    }
  });
  it('does not guess a format for manually modified or non-contiguous cards', () => {
    const project = newCreativeProject(60);
    project.effects = buildContentEffects('talking-head', 'gu', contentExample('talking-head', 'gu', 'My topic'), [2, 3, 3, 2], 60);
    project.effects[1]!.title = 'Custom label';
    expect(readCreativeProject(project)?.contentFormat).toBeUndefined();
    expect(readCreativeProject(project)?.effects).toEqual(project.effects);
  });
});
