import { describe, expect, it } from 'vitest';
import { compositionSpans, creativeResolution, newCreativeProject, readCreativeProject, spanAt } from '@core/creative/CreativeProject';
import { EditorStore } from '@core/editor/store/EditorStore';
import { ProjectFromEditorStateBuilder } from '@core/projects/services/ProjectFromEditorStateBuilder';

describe('Creative project timeline', () => {
  it('keeps true vertical FHD and preserves aspect ratio without upscaling', () => {
    expect(creativeResolution(1080, 1920)).toEqual({ width: 1080, height: 1920 });
    expect(creativeResolution(2160, 3840)).toEqual({ width: 1080, height: 1920 });
    expect(creativeResolution(720, 1280)).toEqual({ width: 720, height: 1280 });
    expect(creativeResolution(1920, 1080)).toEqual({ width: 1920, height: 1080 });
    expect(creativeResolution(1920, 1080, true)).toEqual({ width: 1080, height: 1920 });
  });
  it('maps trimmed, cut, sped-up and reordered clips back to original caption timestamps', () => {
    const project = newCreativeProject(10);
    project.settings.speed = 2;
    project.clips = [{ ...project.clips[0]!, id: 'later', start: 6, end: 10 }, { ...project.clips[0]!, id: 'early', start: 0, end: 4 }];
    const spans = compositionSpans(project, [{ start: 7, end: 8 }, { start: 7.5, end: 9 }]);
    expect(spans.map(s => [s.sourceStart, s.sourceEnd, s.outputStart, s.outputEnd])).toEqual([[6, 7, 0, 0.5], [9, 10, 0.5, 1], [0, 4, 1, 3]]);
    const span = spanAt(spans, 1.5)!;
    expect(span.sourceStart + (1.5 - span.outputStart) * project.settings.speed).toBe(1);
    project.useTimelineCuts = false;
    expect(compositionSpans(project, [{ start: 0, end: 10 }]).at(-1)?.outputEnd).toBe(4);
  });
  it('does not apply original-video cuts or caption timestamps to appended media', () => {
    const project = newCreativeProject(4);
    project.clips.push({ id: 'extra', asset: { id: 'media', key: 'local/key', name: 'clip', mimeType: 'video/mp4', remote: false, duration: 2 }, start: 0, end: 2, volume: 1 });
    const spans = compositionSpans(project, [{ start: 0, end: 2 }]);
    expect(spans.map(s => [s.clip.id, s.sourceStart, s.outputEnd])).toEqual([[project.clips[0]!.id, 2, 2], ['extra', 0, 4]]);
  });
  it('rejects invalid BPM, media references and speeds before processing imported projects', () => {
    const project = newCreativeProject(2);
    expect(readCreativeProject(JSON.parse(JSON.stringify(project)))).toEqual(project);
    expect(readCreativeProject(undefined)).toBeNull();
    expect(() => readCreativeProject({ ...project, settings: { ...project.settings, bpm: 0 } })).toThrow('Invalid creative settings');
    expect(() => compositionSpans({ ...project, settings: { ...project.settings, speed: 0 } }, [])).toThrow();
    expect(() => readCreativeProject({ ...project, music: { key: '../another-owner' } })).toThrow('Invalid music reference');
  });
  it('preserves creative edits in project copies and undo/redo, clears them for a new video', () => {
    const store = new EditorStore();
    const creative = newCreativeProject(4);
    store.patch({ projectId: 'id', projectCreatedAt: new Date(), video: { fileName: 'test.mp4', mimeType: 'video/mp4', size: 12 }, creative });
    store.commit(); store.patch({ creative: { ...creative, settings: { ...creative.settings, text: 'Saved title' } } });
    expect(store.undo()).toBe(true); expect(store.snapshot().creative?.settings.text).toBe('');
    expect(store.redo()).toBe(true);
    const project = new ProjectFromEditorStateBuilder().build(store.snapshot())!;
    expect(project.creative?.settings.text).toBe('Saved title');
    expect(project.withSheets([]).creative).toEqual(project.creative);
    expect(project.withCaptionTracks([]).creative).toEqual(project.creative);
    store.reset(); expect(store.snapshot().creative).toBeNull();
  });
});
