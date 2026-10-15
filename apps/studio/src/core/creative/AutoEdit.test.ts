import { describe, expect, it } from 'vitest';
import { Document, Line, Section, Segment, TimeFragment, Word } from '@tscaps/engine';
import { autoPauseCuts, planAutoEdit, sameAutoEditInputs, DEFAULT_AUTO_EDIT_OPTIONS, type QuietWindow, type AutoEditStyle } from '@core/creative/AutoEdit';
import { compositionSpans, newCreativeProject, readCreativeProject } from '@core/creative/CreativeProject';
import { newMotionEffect } from '@core/creative/MotionEffects';
import { REEL_PRESETS, filterReelPresets } from '@core/creative/ReelPresets';
import { EditorStore } from '@core/editor/store/EditorStore';
import { Sheet } from '@core/sheets/domain/Sheet';
import { TYPOGRAPHY_DEFAULTS } from '@core/sheets/domain/TypographyConfig';
import { ROTATION_DEFAULTS } from '@core/sheets/domain/RotationConfig';
import { StyleValues } from '@core/sheets/domain/StyleValues';
import type { Template } from '@core/templates/domain/Template';

const speech = [{ start: 0.2, end: 1 }, { start: 2.1, end: 2.7 }, { start: 4, end: 6 }];
const document = new Document({ sections: [new Section({ kind: 'main', segments: [new Segment({ lines: [new Line({ words: speech.map((w, i) => new Word({ text: `word${i}`, time: new TimeFragment(w.start, w.end), id: `word-${i}`, speakerId: 'speaker-1' })) })] })] })] });
const windows: QuietWindow[] = Array.from({ length: 120 }, (_, i) => ({ start: i * 0.05, end: (i + 1) * 0.05, rms: i < 5 || (i >= 20 && i < 42) || (i >= 54 && i < 80) ? 0.001 : 0.2 }));
function sheet() {
  return new Sheet({ id: 'main', name: 'Captions', color: null, variantIndex: 0,
    template: { typography: TYPOGRAPHY_DEFAULTS } as Template,
    typographyConfig: TYPOGRAPHY_DEFAULTS, rotationConfig: ROTATION_DEFAULTS,
    styleValues: new StyleValues([], {}), segmentSplitterConfigs: [], lineSplitterConfig: { type: 'balanced', maxLines: 2, minLines: 1, maxCharsPerLine: 30, minCharsPerLine: 1 },
    alignmentConfig: { verticalAlign: 'bottom', verticalOffset: 0, horizontalAlign: 'center', horizontalOffset: 0 }, effectConfigs: [] });
}
describe('Auto Edit', () => {
  it('protects every spoken word even when quiet speech falls under the audio threshold', () => {
    const cuts = autoPauseCuts(windows, [{ start: 1.5, end: 1.8 }, ...speech], 6, 'energetic');
    expect(cuts.length).toBeGreaterThan(0);
    for (const cut of cuts) for (const word of [{ start: 1.5, end: 1.8 }, ...speech]) {
      expect(cut.end <= word.start - 0.119 || cut.start >= word.end + 0.119).toBe(true);
    }
    expect(autoPauseCuts(windows.map(w => ({ ...w, rms: 0 })), speech, 6, 'clean')).toEqual([]);
    expect(autoPauseCuts(windows.map(w => ({ ...w, rms: Infinity })), speech, 6, 'clean')).toEqual([]);
  });
  it('gives Energetic tighter pacing than Clean and Professional without changing voice pitch', () => {
    const drafts = (['clean', 'energetic', 'professional'] as AutoEditStyle[]).map(style => planAutoEdit(newCreativeProject(6), [], document, windows, [], style, DEFAULT_AUTO_EDIT_OPTIONS));
    expect(drafts[1]!.removedSeconds).toBeGreaterThan(drafts[0]!.removedSeconds);
    expect(drafts[0]!.removedSeconds).toBeGreaterThan(drafts[2]!.removedSeconds);
    for (const draft of drafts) {
      expect(draft.project.settings.speed).toBe(1);
      expect(draft.project.settings.beatCuts).toBe(false);
      expect(draft.project.settings.normalize).toBe(true);
      expect(draft.project.effects?.[0]?.kind).toBe('digital-zoom');
      expect(draft.project.effects?.every(e => e.end <= compositionSpans(draft.project, []).at(-1)!.outputEnd)).toBe(true);
    }
    expect(drafts[1]!.project.effects![0]!.intensity).toBeGreaterThan(drafts[2]!.project.effects![0]!.intensity);
  });
  it('styles default captions while preserving custom captions, words and source media', () => {
    const project = newCreativeProject(6), originalSheet = sheet();
    const custom = originalSheet.with({ id: 'custom', typographyConfig: { ...TYPOGRAPHY_DEFAULTS, fontSize: 7 } });
    const draft = planAutoEdit(project, [originalSheet, custom], document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(draft.sheets[0]!.typographyConfig.fontWeight).toBe(800);
    expect(draft.sheets[0]!.typographyConfig.fontSize).toBe(4.2);
    expect(draft.sheets[1]).toBe(custom);
    expect(draft.project.clips).toBe(project.clips);
    expect(draft.project.music).toBe(project.music);
    expect(project.silences).toEqual([]);
    expect(document.getWords().map(w => [w.id, w.speakerId])).toEqual([['word-0', 'speaker-1'], ['word-1', 'speaker-1'], ['word-2', 'speaker-1']]);
  });
  it('preserves timed manual effects, custom settings and existing cuts', () => {
    const project = newCreativeProject(6);
    project.effects = [newMotionEffect('phone-mockup', 0, 2)];
    project.silences = [{ start: 3, end: 3.1 }]; project.settings.contrast = 1.4;
    const draft = planAutoEdit(project, [], document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(draft.project.silences).toEqual(project.silences);
    expect(draft.project.effects![0]).toBe(project.effects[0]);
    expect(draft.project.settings.contrast).toBe(1.4);
    expect(draft.notes.some(note => note.includes('timing'))).toBe(true);
    expect(draft.project.effects!.slice(1).every(e => e.start >= 2.5)).toBe(true);
  });
  it('does not duplicate existing cuts or analyze missing captions as silence', () => {
    const project = newCreativeProject(6);
    project.silences = [{ start: 1.2, end: 1.7 }];
    const draft = planAutoEdit(project, [], document, windows, [{ start: 3.1, end: 3.5 }], 'clean', DEFAULT_AUTO_EDIT_OPTIONS);
    for (const cut of draft.project.silences.slice(1)) expect(cut.end <= 1.2 || cut.start >= 1.7).toBe(true);
    expect(planAutoEdit(newCreativeProject(6), [], null, windows, [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS).cutsAdded).toBe(0);
    expect(planAutoEdit(newCreativeProject(6), [], document, [], [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS).cutsAdded).toBe(0);
  });
  it('survives serialization and one-step undo/redo, and prevents a second pass from overwriting manual edits', () => {
    const store = new EditorStore(), project = newCreativeProject(6), originalSheet = sheet();
    store.patch({ creative: project, sheets: [originalSheet], document });
    const draft = planAutoEdit(project, [originalSheet], document, windows, [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS);
    store.commit(); store.patch({ creative: draft.project, sheets: draft.sheets });
    expect(readCreativeProject(JSON.parse(JSON.stringify(draft.project)))?.autoEdit?.style).toBe('clean');
    expect(planAutoEdit(draft.project, draft.sheets, document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS).project.autoEdit?.style).toBe('energetic');
    store.undo(); expect(store.snapshot().creative).toBe(project); expect(store.snapshot().sheets[0]).toBe(originalSheet);
    store.redo(); expect(store.snapshot().creative).toBe(draft.project); expect(store.snapshot().sheets).toEqual(draft.sheets);
    expect(() => readCreativeProject({ ...project, autoEdit: { style: 'unknown' } })).toThrow('Invalid auto edit style');
  });
});


describe('Reel template recipes', () => {
  function baselineSheet() {
    const original = sheet();
    const template = { ...original.template, metadata: { id: 'baseline' }, styleControls: [], variants: [],
      alignment: original.alignmentConfig, rotation: original.rotationConfig,
      segmentSplitterConfigs: original.segmentSplitterConfigs, lineSplitter: original.lineSplitterConfig,
      effectConfigs: original.effectConfigs } as unknown as Template;
    return original.with({ template });
  }
  it.each(REEL_PRESETS)('$name combines its real caption look with editable auto edits', preset => {
    const original = baselineSheet();
    const template = { ...original.template, metadata: { id: preset.templateId }, typography: { ...TYPOGRAPHY_DEFAULTS, fontSize: 4 } } as Template;
    const recipe = { id: preset.id, template };
    const draft = planAutoEdit(newCreativeProject(6), [original], document, windows, [], preset.style, DEFAULT_AUTO_EDIT_OPTIONS, recipe);
    expect(draft.sheets[0]!.template).toBe(template);
    expect(draft.sheets[0]!.typographyConfig.fontSize).toBe(4);
    expect(draft.project.autoEdit).toMatchObject({ style: preset.style, preset: preset.id });
    expect(readCreativeProject(JSON.parse(JSON.stringify(draft.project)))!.autoEdit?.preset).toBe(preset.id);
    expect(draft.project.effects!.length).toBeGreaterThan(0);
  });
  it('keeps custom colours, motion and linked caption designs, and respects caption opt-out', () => {
    const original = baselineSheet(), preset = REEL_PRESETS[0]!;
    const template = { ...original.template, metadata: { id: preset.templateId } } as Template;
    const recipe = { id: preset.id, template };
    const custom = original.with({ styleValues: new StyleValues([], { ink: '#ff0000' }) });
    const linked = original.with({ id: 'linked', linkGroupId: 'group' });
    const withCss = original.with({ id: 'css', cssOverride: '.word { color: red; }' });
    const draft = planAutoEdit(newCreativeProject(6), [custom, linked, withCss], document, windows, [], preset.style, DEFAULT_AUTO_EDIT_OPTIONS, recipe);
    expect(draft.sheets).toEqual([custom, linked, withCss]);
    expect(draft.captionsStyled).toBe(0);
    const disabled = planAutoEdit(newCreativeProject(6), [original], document, windows, [], preset.style, { ...DEFAULT_AUTO_EDIT_OPTIONS, captions: false }, recipe);
    expect(disabled.sheets[0]).toBe(original);
    expect(() => planAutoEdit(newCreativeProject(6), [original], document, windows, [], preset.style, DEFAULT_AUTO_EDIT_OPTIONS, { id: preset.id, template: original.template })).toThrow('does not match');
    expect(() => readCreativeProject({ ...newCreativeProject(6), autoEdit: { style: 'clean', preset: 'missing' } })).toThrow('Invalid reel template');
  });
});


describe('Changing Auto Edit styles safely', () => {
  it('replaces auto-owned effects, cuts and caption sizes after serialization without accumulating edits', () => {
    const original = newCreativeProject(6), originalSheet = sheet();
    const first = planAutoEdit(original, [originalSheet], document, windows, [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS);
    const loaded = readCreativeProject(JSON.parse(JSON.stringify(first.project)))!;
    const second = planAutoEdit(loaded, first.sheets, document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS);
    const fresh = planAutoEdit(original, [originalSheet], document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(second.project.silences).toEqual(fresh.project.silences);
    expect(second.project.effects?.map(e => [e.start, e.end, e.intensity])).toEqual(fresh.project.effects?.map(e => [e.start, e.end, e.intensity]));
    expect(second.sheets[0]!.typographyConfig.fontSize).toBe(4.2);
    const third = planAutoEdit(readCreativeProject(JSON.parse(JSON.stringify(second.project)))!, second.sheets, document, windows, [], 'professional', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(third.sheets[0]!.typographyConfig.fontSize).toBe(3.13);
    expect(third.project.effects?.[0]?.intensity).toBe(0.08);
  });
  it('keeps manually edited and deleted auto effects, restored cuts, custom settings and caption sizes', () => {
    const first = planAutoEdit(newCreativeProject(30), [sheet()], document, windows, [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS);
    const changed = { ...first.project, effects: [{ ...first.project.effects![0]!, intensity: 0.55 }],
      silences: [], settings: { ...first.project.settings, contrast: 1.4 } };
    const customSheet = first.sheets[0]!.with({ typographyConfig: { ...first.sheets[0]!.typographyConfig, fontSize: 7 } });
    const next = planAutoEdit(readCreativeProject(JSON.parse(JSON.stringify(changed)))!, [customSheet], document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(next.project.effects!.find(e => e.id === changed.effects[0]!.id)?.intensity).toBe(0.55);
    for (const removed of first.project.effects!.slice(1)) expect(next.project.effects!.some(e => e.start < removed.end && e.end > removed.start)).toBe(false);
    expect(next.project.silences).toEqual([]);
    expect(next.project.settings.contrast).toBe(1.4);
    expect(next.sheets[0]!.typographyConfig.fontSize).toBe(7);
    expect(next.project.clips).toEqual(changed.clips);
  });
  it('keeps edits from older projects without history and still allows a different style', () => {
    const original = newCreativeProject(6);
    original.autoEdit = { style: 'clean' }; original.effects = [newMotionEffect('digital-zoom', 0, 2)];
    const next = planAutoEdit(original, [], document, windows, [], 'professional', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(next.project.effects![0]).toBe(original.effects[0]);
    expect(next.project.autoEdit?.style).toBe('professional');
    expect(next.notes.some(n => n.includes('older edit'))).toBe(true);
  });
  it('rejects malformed generation history in imported projects', () => {
    const first = planAutoEdit(newCreativeProject(6), [], document, windows, [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS);
    expect(() => readCreativeProject({ ...first.project, autoEdit: { ...first.project.autoEdit, generation: { ...first.project.autoEdit!.generation, settings: { before: { speed: 10 }, after: {} } } } })).toThrow('Invalid auto edit history');
  });
});


it('keeps drafts valid across font reflow but detects word edits and manual creative changes', () => {
  const store = new EditorStore();
  store.patch({ creative: newCreativeProject(6), document, sheets: [sheet()] });
  const before = store.snapshot();
  store.patch({ document: document.with({ sections: [...document.sections] }) });
  expect(sameAutoEditInputs(before, store.snapshot())).toBe(true);
  const section = document.sections[0]!, segment = section.segments[0]!, line = segment.lines[0]!;
  store.patch({ document: document.with({ sections: [section.with({ segments: [segment.with({ lines: [line.with({ words: line.words.map((w, i) => i === 0 ? w.with({ text: 'changed' }) : w) })] })] })] }) });
  expect(sameAutoEditInputs(before, store.snapshot())).toBe(false);
  store.patch({ document, sheets: [before.sheets[0]!.with({ name: 'Renamed captions' })] });
  expect(sameAutoEditInputs(before, store.snapshot())).toBe(false);
  store.patch({ document, creative: { ...before.creative!, settings: { ...before.creative!.settings, contrast: 1.2 } } });
  expect(sameAutoEditInputs(before, store.snapshot())).toBe(false);
});


it('preserves manual settings and caption sizes even when changed back to original defaults', () => {
  const originalSheet = sheet();
  const first = planAutoEdit(newCreativeProject(6), [originalSheet], document, windows, [], 'energetic', DEFAULT_AUTO_EDIT_OPTIONS);
  const manual = { ...first.project, settings: { ...first.project.settings, cleanup: false, normalize: false, contrast: 1 } };
  const caption = first.sheets[0]!.with({ typographyConfig: { ...first.sheets[0]!.typographyConfig, fontSize: originalSheet.typographyConfig.fontSize } });
  const second = planAutoEdit(readCreativeProject(JSON.parse(JSON.stringify(manual)))!, [caption], document, windows, [], 'professional', DEFAULT_AUTO_EDIT_OPTIONS);
  expect(second.project.settings.cleanup).toBe(false);
  expect(second.project.settings.normalize).toBe(false);
  expect(second.project.settings.contrast).toBe(1);
  expect(second.sheets[0]!.typographyConfig.fontSize).toBe(originalSheet.typographyConfig.fontSize);
  const third = planAutoEdit(second.project, second.sheets, document, windows, [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS);
  expect(third.project.settings.normalize).toBe(false);
  expect(third.project.settings.contrast).toBe(1);
  expect(third.sheets[0]!.typographyConfig.fontSize).toBe(originalSheet.typographyConfig.fontSize);
});


describe('Expanded reel catalog', () => {
  it('keeps distinct identities and finds multilingual creator topics within categories', () => {
    expect(REEL_PRESETS).toHaveLength(25);
    expect(new Set(REEL_PRESETS.map(p => p.id)).size).toBe(25);
    expect(new Set(REEL_PRESETS.map(p => p.templateId)).size).toBe(25);
    expect(filterReelPresets('  GUJARATI  ', 'Creator').map(p => p.id)).toEqual(['desi-creator']);
    expect(filterReelPresets('neon', 'Business')).toEqual([]);
    expect(filterReelPresets('neon energetic', 'All').length).toBeGreaterThan(0);
  });
  it('uses recipe cadence while keeping the selected intensity and safe source timing', () => {
    const make = (id: 'glass-creator' | 'linen-life') => {
      const preset = REEL_PRESETS.find(p => p.id === id)!;
      return planAutoEdit(newCreativeProject(60), [], null, [], [], 'clean', DEFAULT_AUTO_EDIT_OPTIONS,
        { id, template: { metadata: { id: preset.templateId } } as Template });
    };
    const brisk = make('glass-creator'), calm = make('linen-life');
    expect(brisk.zoomsAdded).toBeGreaterThan(calm.zoomsAdded);
    expect(brisk.project.effects![0]!.intensity).toBe(calm.project.effects![0]!.intensity);
    expect(brisk.project.settings.speed).toBe(1);
  });
});
