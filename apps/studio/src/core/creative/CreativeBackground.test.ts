import { describe, expect, it } from 'vitest';
import { confidenceToAlpha, DEFAULT_BACKGROUND } from '@core/creative/CreativeBackground';
import { newCreativeProject, readCreativeProject } from '@core/creative/CreativeProject';

describe('creative backgrounds', () => {
  it('keeps soft edges and bounds invalid mask values', () => {
    const rgba = confidenceToAlpha(new Float32Array([0, .1, .5, .9, 1, NaN, -1, 2]));
    expect(Array.from(rgba).filter((_, i) => i % 4 === 3)).toEqual([0, 0, 128, 255, 255, 0, 0, 255]);
  });
  it('round trips background choices without changing old projects', () => {
    const project = newCreativeProject(4);
    expect(readCreativeProject(project)?.background).toBeUndefined();
    project.background = { ...DEFAULT_BACKGROUND, mode: 'color', color: '#ff0000' };
    expect(readCreativeProject(JSON.parse(JSON.stringify(project)))?.background).toEqual(project.background);
  });
  it('rejects invalid background settings and unowned image paths', () => {
    const project = newCreativeProject(4);
    for (const invalid of [{ mode: 'unknown' }, { blur: -1 }, { color: 'url(x)' }, { mode: 'image' }, { image: { key: 'https://example.com' } }]) {
      expect(() => readCreativeProject({ ...project, background: { ...DEFAULT_BACKGROUND, ...invalid } })).toThrow('Invalid creative background');
    }
  });
});
