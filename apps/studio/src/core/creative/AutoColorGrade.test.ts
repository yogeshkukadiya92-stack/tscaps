import { describe, expect, it } from 'vitest';
import { correctionFromPixels } from '@core/creative/AutoColorGrade';
import { newCreativeProject, readCreativeProject } from '@core/creative/CreativeProject';

function ramp(low: number, high: number) {
  return Uint8ClampedArray.from(Array.from({ length: 256 }, (_, i) => {
    const value = low + (high - low) * i / 255;
    return [value, value, value, 255];
  }).flat());
}
describe('automatic color correction', () => {
  it('brightens underexposed detail and reduces overexposure conservatively', () => {
    const dark = correctionFromPixels([ramp(15, 110)]);
    const bright = correctionFromPixels([ramp(120, 245)]);
    expect(dark.brightness).toBeGreaterThan(1);
    expect(dark.brightness).toBeLessThanOrEqual(1.25);
    expect(bright.brightness).toBeLessThan(1);
    expect(bright.brightness).toBeGreaterThanOrEqual(.8);
    expect(dark.saturation).toBe(1);
  });
  it('leaves blank, clipped and flat frames neutral', () => {
    for (const frame of [new Uint8ClampedArray(), ramp(0, 0), ramp(255, 255), ramp(80, 80)]) {
      expect(correctionFromPixels([frame])).toEqual({ look: 'clean', brightness: 1, contrast: 1, saturation: 1 });
    }
  });
  it('limits saturated footage and ignores transparent pixels', () => {
    const colorful = ramp(20, 200);
    for (let i = 0; i < colorful.length; i += 4) colorful[i] = 255;
    expect(correctionFromPixels([colorful]).saturation).toBeLessThanOrEqual(1);
    for (let i = 3; i < colorful.length; i += 4) colorful[i] = 0;
    expect(correctionFromPixels([colorful]).brightness).toBe(1);
  });
  it('saves correction in the existing preview/export settings without changing other edits', () => {
    const project = newCreativeProject(10);
    project.settings.text = 'મારી રીલ'; project.settings.speed = 1.2;
    Object.assign(project.settings, correctionFromPixels([ramp(15, 110)]));
    const loaded = readCreativeProject(JSON.parse(JSON.stringify(project)));
    expect(loaded?.settings).toEqual(project.settings);
  });
});
