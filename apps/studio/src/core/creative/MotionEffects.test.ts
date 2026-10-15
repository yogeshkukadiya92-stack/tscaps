import { describe, expect, it } from 'vitest';
import { chartRows, MOTION_EFFECTS, newMotionEffect, readMotionEffects, transitionBoundary } from '@core/creative/MotionEffects';
import { newCreativeProject, readCreativeProject } from '@core/creative/CreativeProject';
import { EditorStore } from '@core/editor/store/EditorStore';

describe('Motion effects', () => {
  it('round-trips all effects and keeps older projects compatible', () => {
    const project = newCreativeProject(10);
    expect(readCreativeProject(project)?.effects).toBeUndefined();
    project.effects = MOTION_EFFECTS.map(p => newMotionEffect(p.kind, 1, 4));
    expect(readCreativeProject(JSON.parse(JSON.stringify(project)))?.effects).toEqual(project.effects);
    const store = new EditorStore(); store.patch({ creative: project }); store.commit();
    store.patch({ creative: { ...project, effects: [] } });
    store.undo(); expect(store.snapshot().creative?.effects).toHaveLength(8);
    store.redo(); expect(store.snapshot().creative?.effects).toEqual([]);
  });
  it('rejects malformed timing, duplicated IDs and unbounded input', () => {
    const e = newMotionEffect('checklist', 1, 4);
    for (const patch of [{ start: NaN }, { end: 1 }, { x: 2 }, { intensity: Infinity }, { kind: 'unknown' }, { color: 'red' }, { title: 'x'.repeat(81) }]) {
      expect(() => readMotionEffects([{ ...e, ...patch }])).toThrow();
    }
    expect(() => readMotionEffects([e, e])).toThrow();
    expect(() => readMotionEffects(Array(41).fill(e))).toThrow();
  });
  it('uses real cut boundaries and rejects cuts outside the interval', () => {
    expect(transitionBoundary(1, 3, [0, 2, 4])).toBe(2);
    expect(transitionBoundary(1, 3, [1, 3])).toBeUndefined();
    expect(transitionBoundary(1, 5, [2, 3.2, 4])).toBe(3.2);
  });
  it('accepts Gujarati labels, zero and decimals, ignores invalid chart data', () => {
    expect(chartRows('વેચાણ | 12.5\nZero | 0\nBad\nNegative | -2\nNaN | nope')).toEqual([{ label: 'વેચાણ', value: 12.5 }, { label: 'Zero', value: 0 }]);
  });
});
