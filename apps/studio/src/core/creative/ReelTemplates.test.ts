import { describe, expect, it } from 'vitest';
import { assembleReelTemplate, REEL_TEMPLATES, reelTemplateDuration } from '@core/creative/ReelTemplates';
import { compositionSpans, newCreativeProject, readCreativeProject, type CreativeAsset } from '@core/creative/CreativeProject';
import { createTemplateMusic } from '@core/creative/ReelTemplateMusic';
import { EditorStore } from '@core/editor/store/EditorStore';

const asset: CreativeAsset = { id: 'test-media', key: 'local/project/creative/test-media', remote: false, name: 'photo.webm', mimeType: 'video/webm', duration: 1.3 };
describe('ready-made reel arrangements', () => {
  it('builds every recipe on its exact music grid, including short/repeated media and reload validation', () => {
    expect(REEL_TEMPLATES).toHaveLength(30);
    expect(new Set(REEL_TEMPLATES.map(t => t.id)).size).toBe(30);
    for (const template of REEL_TEMPLATES) {
      const project = assembleReelTemplate(template, [{ asset, duration: asset.duration }, { asset: null, duration: 2 }], null, 'Our story');
      const spans = compositionSpans(project, [{ start: 0, end: 100 }]);
      expect(spans.at(-1)!.outputEnd).toBeCloseTo(reelTemplateDuration(template), 8);
      expect(spans.every((s, i) => s.outputEnd > s.outputStart && (!i || s.outputStart === spans[i - 1]!.outputEnd))).toBe(true);
      expect(project.clips.every(c => c.end <= (c.asset?.duration ?? 2))).toBe(true);
      expect(project.effects!.length).toBe(template.beats.length - 1);
      expect(project.effects!.every(e => e.start >= 0 && e.end <= reelTemplateDuration(template))).toBe(true);
      expect(readCreativeProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
      expect(project.settings.portrait).toBe(true);
      expect(project.settings.sourceVolume).toBe(0);
    }
  });
  it('extends the beat arrangement to include every selected file', () => {
    const media = Array.from({ length: 30 }, (_, i) => ({ asset: { ...asset, id: `media-${i}`, key: `local/project/creative/media-${i}` }, duration: asset.duration }));
    const project = assembleReelTemplate(REEL_TEMPLATES[0]!, media, null, '');
    expect(new Set(project.clips.map(c => c.asset?.id)).size).toBe(30);
    expect(compositionSpans(project, []).at(-1)!.outputEnd).toBeCloseTo(reelTemplateDuration(REEL_TEMPLATES[0]!, 30), 8);
    expect(readCreativeProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
  });
  it('rejects missing or invalid media and keeps source input untouched', () => {
    const media = [{ asset, duration: asset.duration }];
    const before = JSON.stringify(media);
    const template = REEL_TEMPLATES[0]!;
    expect(() => assembleReelTemplate(template, [], null, '')).toThrow();
    expect(() => assembleReelTemplate(template, [{ asset, duration: NaN }], null, '')).toThrow();
    const built = assembleReelTemplate(template, media, asset, 'x'.repeat(400));
    expect(built.settings.text).toHaveLength(300);
    expect(built.music).toEqual(asset);
    expect(JSON.stringify(media)).toBe(before);
  });
  it('supports one-step undo and redo of the entire arrangement', () => {
    const store = new EditorStore(), original = newCreativeProject(10);
    store.patch({ creative: original }); store.commit();
    const next = assembleReelTemplate(REEL_TEMPLATES[0]!, [{ asset, duration: asset.duration }], asset, 'Title');
    store.patch({ creative: next });
    store.undo(); expect(store.snapshot().creative).toEqual(original);
    store.redo(); expect(store.snapshot().creative).toEqual(next);
  });
  it('generates deterministic, audible, bounded WAV music with the advertised beat length for all moods', async () => {
    for (const mood of [...new Set(REEL_TEMPLATES.map(t => t.music))]) {
      const file = createTemplateMusic(mood, 120);
      const bytes = await file.arrayBuffer(), view = new DataView(bytes);
      expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
      expect(view.getUint32(24, true)).toBe(24000);
      expect(view.getUint32(40, true) / 2 / 24000).toBe(16);
      let square = 0, peak = 0;
      for (let i = 44; i < bytes.byteLength; i += 2) { const sample = view.getInt16(i, true) / 32767; square += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      expect(Math.sqrt(square / ((bytes.byteLength - 44) / 2))).toBeGreaterThan(.02);
      expect(peak).toBeLessThanOrEqual(.951);
      expect(new Uint8Array(await createTemplateMusic(mood, 120).arrayBuffer())).toEqual(new Uint8Array(bytes));
    }
    expect(() => createTemplateMusic('dream', 0)).toThrow();
  });
});
