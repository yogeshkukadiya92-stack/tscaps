import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { REEL_TEMPLATES } from '@core/creative/ReelTemplates';

const folder = new URL('../../../public/reel-previews/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('manifest.json', folder), 'utf8'));
describe('bundled reel template samples', () => {
  it('ships a matching sample and poster for every current template', () => {
    expect(Object.keys(manifest).sort()).toEqual(REEL_TEMPLATES.map(t => t.id).sort());
    for (const template of REEL_TEMPLATES) {
      const sample = manifest[template.id];
      expect(sample.duration).toBe(8);
      expect(sample.recipe).toEqual(template);
      const movie = new URL(`${template.id}.mp4`, folder), poster = new URL(`${template.id}.jpg`, folder);
      const videoBytes = readFileSync(movie), posterBytes = readFileSync(poster);
      expect(videoBytes.toString('ascii', 4, 8)).toBe('ftyp');
      expect(posterBytes.readUInt16BE(0)).toBe(0xffd8);
      expect(statSync(fileURLToPath(movie)).size).toBe(sample.bytes);
      expect(sample.bytes).toBeGreaterThan(10000);
      expect(sample.bytes).toBeLessThan(1500000);
    }
  });
});
