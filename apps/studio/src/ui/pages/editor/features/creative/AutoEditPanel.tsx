import { ReelPresetGallery } from '@ui/pages/editor/features/creative/ReelPresetGallery';
import { REEL_PRESETS, type ReelPresetId } from '@core/creative/ReelPresets';
import { useEffect, useRef, useState } from 'react';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { Sparkles } from 'lucide-react';
import type { EditorState } from '@core/editor/domain/EditorState';
import { analyzeAutoEditAudio } from '@core/creative/AutoEditAudio';
import { AUTO_EDIT_STYLES, DEFAULT_AUTO_EDIT_OPTIONS, planAutoEdit, type AutoEditDraft, type AutoEditStyle } from '@core/creative/AutoEdit';
import { useEditor } from '@ui/_shared/contexts/modules/EditorContext';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

interface Props {
  file: File;
  state: EditorState;
  locked: boolean;
  onStart: () => void;
  onBusy: (busy: boolean) => void;
  onApply: (draft: AutoEditDraft) => void;
}
export function AutoEditPanel({ file, state, locked, onStart, onBusy, onApply }: Props) {
  const editor = useEditor();
  const [preset, setPreset] = useState<ReelPresetId | null>(null);
  const [style, setStyle] = useState<AutoEditStyle>('clean');
  const [options, setOptions] = useState(DEFAULT_AUTO_EDIT_OPTIONS);
  const [working, setWorking] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const [draft, setDraft] = useState<{ edit: AutoEditDraft; base: EditorState } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const isCurrent = (base: EditorState) => {
    const current = editor.store.snapshot();
    return current.projectId === base.projectId && current.creative === base.creative && current.document === base.document && current.sheets === base.sheets && current.cuts === base.cuts;
  };
  async function analyze() {
    const base = editor.store.snapshot();
    if (!base.creative || base.creative.autoEdit) return;
    onStart(); setWorking(true); onBusy(true); setError(''); setDraft(null); setProgress(0);
    const abort = new AbortController(); abortRef.current = abort;
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      const windows = options.pauses ? await analyzeAutoEditAudio(input, abort.signal, setProgress) : [];
      abort.signal.throwIfAborted();
      if (!isCurrent(base)) throw new Error('The project changed during analysis. Analyze again to use your latest edits.');
      const recipe = REEL_PRESETS.find(p => p.id === preset);
      const template = recipe ? base.availableTemplates.find(t => t.metadata.id === recipe.templateId) : undefined;
      if (recipe && !template) throw new Error('This caption template is no longer available. Choose another template.');
      const edit = planAutoEdit(base.creative, base.sheets, base.document, windows, base.cuts.list().map(c => ({ start: c.startSec, end: c.endSec })), style, options, recipe && template ? { id: recipe.id, template } : undefined);
      setDraft({ edit, base });
    } catch (cause) {
      if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Auto Edit could not analyze this video. Your edits are unchanged.');
    } finally {
      input.dispose();
      if (!abort.signal.aborted) { setWorking(false); onBusy(false); }
      if (abortRef.current === abort) abortRef.current = null;
    }
  }
  const applied = state.creative?.autoEdit;
  const currentDraft = draft && isCurrent(draft.base) ? draft : null;
  return <section id="creative-Auto" aria-label="Auto Edit" className="rounded-lg border border-accent/40 bg-surface-1 p-4 flex flex-col gap-3 scroll-mt-2">
    <div className="flex items-center gap-2"><Sparkles size={20} className="text-accent" /><h3 className="font-semibold m-0">Auto Edit</h3></div>
    {applied ? <>
      <p role="status" className="text-sm m-0">{AUTO_EDIT_STYLES.find(s => s.id === applied.style)?.name} auto edit applied. Everything is editable below.{applied.preset && ` Template: ${REEL_PRESETS.find(p => p.id === applied.preset)?.name}.`}</p>
      <p className="text-xs text-fg-muted m-0">Adjust cuts in Timing, zooms in Effects, voice in Audio and words or styling in Captions. Undo Auto Edit before making manual changes if you want to try another style.</p>
    </> : <>
      <p className="text-xs text-fg-muted m-0">Choose a style. Analyze pauses and prepare editable captions, zooms and voice settings using your current transcript.</p>
      <fieldset disabled={locked || working} className="border-0 p-0 m-0 flex flex-col gap-3">
        <legend className="sr-only">Auto Edit style and options</legend>
        <ReelPresetGallery templates={state.availableTemplates} selected={preset} onSelect={id => { setPreset(id); setDraft(null); const recipe = REEL_PRESETS.find(p => p.id === id); if (recipe) setStyle(recipe.style); }} />
        <p className="text-xs font-semibold m-0">Editing intensity</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Auto Edit style">
          {AUTO_EDIT_STYLES.map(preset => <button type="button" key={preset.id} aria-pressed={style === preset.id} onClick={() => { setStyle(preset.id); setDraft(null); }} className={`rounded-lg border p-3 text-left ${style === preset.id ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}><strong className="text-sm block">{preset.name}</strong><span className="block text-xs text-fg-muted mt-1">{preset.description}</span></button>)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {([['pauses', 'Trim quiet pauses'], ['zooms', 'Add zoom effects'], ['polish', 'Balance voice and colour'], ['captions', 'Style existing captions']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={options[key]} onChange={e => { setOptions({ ...options, [key]: e.target.checked }); setDraft(null); }} />{label}</label>)}
        </div>
        <p className="text-xs text-fg-muted m-0">Existing clips, music, words and custom formatting are kept. Reel templates change default caption looks only. No stock music or B-roll is added.</p>
        <button className={BTN_PRIMARY} disabled={!Object.values(options).some(Boolean)} onClick={() => void analyze()}><Sparkles size={16} />Analyze auto edit</button>
      </fieldset>
      {working && <div><p role="status" className="text-xs">Analyzing audio… {progress.toFixed(0)}%</p><button className={BTN_SECONDARY} onClick={() => { abortRef.current?.abort(); setWorking(false); onBusy(false); }}>Cancel analysis</button></div>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {currentDraft && <div className="rounded-md bg-surface-2 p-3 flex flex-col gap-2" aria-label="Auto Edit plan">
        <p className="text-sm font-semibold m-0">Ready to apply · {AUTO_EDIT_STYLES.find(s => s.id === style)?.name}</p>
        <p className="text-xs m-0">{currentDraft.edit.cutsAdded} pause cuts · {currentDraft.edit.removedSeconds.toFixed(1)}s shorter · {currentDraft.edit.zoomsAdded} zooms · {currentDraft.edit.captionsStyled} caption styles</p>
        {currentDraft.edit.notes.map(note => <p key={note} className="text-xs text-fg-muted m-0">{note}</p>)}
        <p className="text-xs text-fg-muted m-0">Apply once, then preview and adjust any edit manually. Undo restores the whole pass.</p>
        <button className={BTN_PRIMARY} disabled={locked || working} onClick={() => {
          if (!isCurrent(currentDraft.base)) { setDraft(null); setError('The project changed. Analyze again before applying.'); return; }
          onApply(currentDraft.edit); setDraft(null);
        }}>Apply auto edit</button>
      </div>}
    </>}
  </section>;
}
