import { describe, expect, it } from 'vitest';
import { INSTAGRAM_TEMPLATE_AUDIO, instagramAudioUrl, instagramReferenceUrl } from '@core/creative/InstagramReelAudio';
import { REEL_TEMPLATES, assembleReelTemplate } from '@core/creative/ReelTemplates';
import { readCreativeProject } from '@core/creative/CreativeProject';

describe('Instagram-inspired song guides', () => {
  it('binds six evidence-labelled references to real editable templates without bundling song media', () => {
    const templates = REEL_TEMPLATES.filter(t => t.instagram);
    expect(templates).toHaveLength(6);
    expect(Object.keys(INSTAGRAM_TEMPLATE_AUDIO).sort()).toEqual(templates.map(t => t.id).sort());
    for (const template of templates) {
      const audio = template.instagram!;
      expect(audio.audioId).toMatch(/^\d+$/);
      expect(audio.sourceReel).toMatch(/^[\w-]+$/);
      expect(instagramAudioUrl(audio)).toMatch(/^https:\/\/www\.instagram\.com\/reels\/audio\/\d+\/$/);
      expect(instagramReferenceUrl(audio)).toMatch(/^https:\/\/www\.instagram\.com\/reel\/[\w-]+\/$/);
      expect(audio.observedAt).toBe('2026-10-19');
      const project = assembleReelTemplate(template, [{ asset: null, duration: 10 }], null, '');
      expect(project.music).toBeNull();
      expect(project.settings.sourceVolume).toBe(0);
      expect(readCreativeProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    }
    expect(INSTAGRAM_TEMPLATE_AUDIO['desi-mela-memories']!.signal).toBe('recent-outlier');
    expect(INSTAGRAM_TEMPLATE_AUDIO['desi-late-night-diary']!.signal).toBe('format-reference');
  });
});
