import { EDITING_SKILLS, type EditingSkill } from '@core/creative/EditingSkills';
import { AiCredits } from '@ui/pages/billing/AiCredits';
import { useCloudAuth } from '@bootstrap/CloudAuthContext';
import { getAiEditServerUrl, requestAiEdit, requestAiQuote, type AiEditQuote, type AiEditPlan } from '@core/creative/AiEditClient';
import { ReelPresetGallery } from '@ui/pages/editor/features/creative/ReelPresetGallery';
import { REEL_PRESETS, type ReelPresetId } from '@core/creative/ReelPresets';
import { useEffect, useRef, useState } from 'react';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { Sparkles } from 'lucide-react';
import type { EditorState } from '@core/editor/domain/EditorState';
import { analyzeAutoEditAudio } from '@core/creative/AutoEditAudio';
import { AUTO_EDIT_STYLES, DEFAULT_AUTO_EDIT_OPTIONS, planAutoEdit, sameAutoEditInputs, type AutoEditDraft, type AutoEditStyle } from '@core/creative/AutoEdit';
import { useEditor } from '@ui/_shared/contexts/modules/EditorContext';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

interface Props {
  file: File;
  state: EditorState;
  locked: boolean;
  onStart: () => void;
  onBusy: (busy: boolean) => void;
  onApply: (draft: AutoEditDraft) => void;
  onPreview: (draft: AutoEditDraft | null) => void;
}
export function AutoEditPanel({ file, state, locked, onStart, onBusy, onApply, onPreview }: Props) {
  const editor = useEditor();
  const { client } = useCloudAuth();
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [quote, setQuote] = useState<AiEditQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [aiPlan, setAiPlan] = useState<AiEditPlan | null>(null);
  const [phase, setPhase] = useState('');
  const [preset, setPreset] = useState<ReelPresetId | null>(state.creative?.autoEdit?.preset ?? null);
  const [style, setStyle] = useState<AutoEditStyle>(state.creative?.autoEdit?.style ?? 'clean');
  const [options, setOptions] = useState(DEFAULT_AUTO_EDIT_OPTIONS);
  const [working, setWorking] = useState(false), [progress, setProgress] = useState(0), [error, setError] = useState('');
  const [draft, setDraft] = useState<{ edit: AutoEditDraft; base: EditorState } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const isCurrent = (base: EditorState) => {
    const current = editor.store.snapshot();
    return sameAutoEditInputs(base, current);
  };
  async function estimate() {
    if (quoting) return;
    setQuoting(true); setError(''); setQuote(null);
    try {
      const endpoint = getAiEditServerUrl();
      const base = editor.store.snapshot();
      if (!endpoint || !client || !base.projectId) throw new Error('Save and upload this project before using AI editing.');
      const { data } = await client.auth.getSession();
      if (!data.session) throw new Error('Sign in to use AI editing.');
      setQuote(await requestAiQuote(endpoint, data.session.access_token, base.projectId, quality, AbortSignal.timeout(150000)));
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not estimate credits.'); }
    finally { setQuoting(false); }
  }
  async function analyze(applyImmediately = false, fromPrompt = false, skill?: EditingSkill) {
    if (abortRef.current) return;
    const base = editor.store.snapshot();
    if (!base.creative) return;
    onPreview(null); onStart(); setWorking(true); onBusy(true); setError(''); setDraft(null); setProgress(0); setAiPlan(null); setPhase(fromPrompt ? 'Reading your instruction…' : 'Analyzing audio…');
    const abort = new AbortController(); abortRef.current = abort;
    const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
    try {
      let selectedStyle = skill?.style ?? style, selectedOptions = skill?.options ?? options, selectedPreset = skill ? skill.preset : preset;
      if (skill) { setStyle(skill.style); setOptions({ ...skill.options }); setPreset(skill.preset); }
      let plan: AiEditPlan | null = null;
      if (fromPrompt) {
        const endpoint = getAiEditServerUrl();
        if (!endpoint || !client || !base.projectId || !quote) throw new Error('Save this project and check the credits first.');
        const { data, error: sessionError } = await client.auth.getSession();
        if (sessionError || !data.session) throw new Error('Sign in to use paid AI editing.');
        plan = await requestAiEdit(endpoint, data.session.access_token, {
          prompt: prompt.trim(), transcript: base.document?.getWords().map(w => w.text).join(' ').slice(0, 16000) ?? '',
          duration: base.video.duration, project_id: base.projectId, request_id: crypto.randomUUID(), quality, source_hash: quote.source_hash, max_credits: quote.credits,
        }, AbortSignal.any([abort.signal, AbortSignal.timeout(240000)]));
        selectedStyle = plan.style; selectedOptions = plan.options; selectedPreset = plan.preset;
        setPhase('Checking pauses and preparing your preview…');
      }
      const windows = selectedOptions.pauses ? await analyzeAutoEditAudio(input, abort.signal, setProgress) : [];
      abort.signal.throwIfAborted();
      if (!isCurrent(base)) throw new Error('The project changed during analysis. Analyze again to use your latest edits.');
      const recipe = REEL_PRESETS.find(p => p.id === selectedPreset);
      const template = recipe ? base.availableTemplates.find(t => t.metadata.id === recipe.templateId) : undefined;
      if (recipe && !template) throw new Error('This caption template is no longer available. Choose another template.');
      const edit = planAutoEdit(base.creative, base.sheets, base.document, windows, base.cuts.list().map(c => ({ start: c.startSec, end: c.endSec })), selectedStyle, selectedOptions, recipe && template ? { id: recipe.id, template } : undefined, base.availableTemplates);
      if (plan) { setAiPlan(plan); setQuote(previous => previous ? { ...previous, charge: 0 } : null); setStyle(selectedStyle); setOptions(selectedOptions); setPreset(selectedPreset); }
      if (applyImmediately) { onApply(edit); setDraft(null); }
      else setDraft({ edit, base });
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
    <fieldset disabled={locked || working || quoting} className="border-0 p-0 m-0 flex flex-col gap-2">
      <legend className="text-sm font-semibold mb-2">Ready editing skills · તૈયાર એડિટિંગ</legend>
      <p className="text-xs text-fg-muted m-0">No prompt needed. Choose a skill to prepare a preview, then apply it. No AI credits used. <span lang="gu">પસંદ કરો → પ્રિવ્યૂ જુઓ → લાગુ કરો.</span></p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {EDITING_SKILLS.map(skill => <button key={skill.id} type="button" aria-label={`Preview ${skill.name}`} onClick={() => void analyze(false, false, skill)} className="rounded-lg border border-edge-medium bg-surface-2 p-3 text-left hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <strong className="block text-sm">{skill.name}</strong><span className="block text-xs text-fg-muted mt-1">{skill.description}</span>
        </button>)}
      </div>
      <p className="text-xs text-fg-muted m-0">Uses your existing footage and captions. Cuts protect transcribed speech; custom edits are preserved. Each preview replaces unchanged earlier auto edits. Music and B-roll can be added below.</p>
    </fieldset>
    <div className="rounded-md border border-edge-medium bg-surface-2 p-3 flex flex-col gap-2">
      <h4 className="text-sm font-semibold m-0">AI prompt editing · Credits</h4>
      <label className="text-sm" htmlFor="ai-edit-prompt">Tell AI how to edit · <span lang="gu">કેવી રીલ બનાવવી છે?</span></label>
      <textarea id="ai-edit-prompt" rows={3} maxLength={2000} value={prompt} disabled={locked || working}
        className="w-full min-w-0 rounded-md border border-edge-medium bg-surface-1 p-3 text-sm text-fg-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        placeholder="Pauses કાપો, bold captions અને energetic zoom સાથે reel બનાવો."
        onChange={event => { setPrompt(event.target.value); setAiPlan(null); setDraft(null); onPreview(null); }} />
      <p className="text-xs text-fg-muted m-0">AI plans pause cuts, caption styling, zooms and voice/colour polish. Your instruction and caption text are sent to the AI provider. Preview before applying; original video stays unchanged.</p>
      <label className="text-sm flex flex-col gap-1">AI quality<select aria-label="AI quality" value={quality} disabled={locked || working || quoting} className="rounded-md bg-surface-1 border border-edge-medium p-2" onChange={e => { setQuality(e.target.value as 'standard' | 'high'); setQuote(null); }}><option value="standard">Standard · 1× credits</option><option value="high">High · 2× credits</option></select></label>
      <p className="text-xs text-fg-muted m-0">Quality selects the AI planning model. Choose video resolution separately when exporting.</p>
      <button type="button" className={BTN_SECONDARY} disabled={locked || working || quoting} onClick={() => void estimate()}>{quoting ? 'Checking uploaded video…' : 'Estimate credits'}</button>
      {quote && <p role="status" className="text-sm m-0">{quote.duration.toFixed(1)} seconds · {quote.charge} credits for this AI edit</p>}
      <button type="button" className={BTN_PRIMARY} disabled={locked || working || quoting || !quote || prompt.trim().length < 3} onClick={() => void analyze(false, true)}>Create AI edit{quote ? ` · ${quote.charge} credits` : ''}</button>
      <AiCredits />
      {aiPlan && <div role="status" className="text-sm"><p className="m-0">{aiPlan.summary}</p>{aiPlan.limitations.map((note, i) => <p key={i} className="text-xs mt-2 mb-0">{note}</p>)}</div>}
    </div>
    {applied ? <>
      <p role="status" className="text-sm m-0">{AUTO_EDIT_STYLES.find(s => s.id === applied.style)?.name} auto edit applied. Everything is editable below.{applied.preset && ` Template: ${REEL_PRESETS.find(p => p.id === applied.preset)?.name}.`}</p>
      <p className="text-xs text-fg-muted m-0">Try another style below. Unchanged auto edits are replaced; manual changes are preserved. Undo restores the previous version after applying.</p>
    </> : null}
    <>
      <p className="text-xs text-fg-muted m-0">Pick a template, then Auto edit reel. Captions, quiet-pause cuts, zooms and voice settings stay editable. You can also review a draft before applying.</p>
      <fieldset disabled={locked || working} className="border-0 p-0 m-0 flex flex-col gap-3">
        <legend className="sr-only">Auto Edit style and options</legend>
        <ReelPresetGallery templates={state.availableTemplates} selected={preset} onSelect={id => { setPreset(id); setDraft(null); onPreview(null); const recipe = REEL_PRESETS.find(p => p.id === id); if (recipe) setStyle(recipe.style); }} />
        <p className="text-xs font-semibold m-0">Editing intensity</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="group" aria-label="Auto Edit style">
          {AUTO_EDIT_STYLES.map(preset => <button type="button" key={preset.id} aria-pressed={style === preset.id} onClick={() => { setStyle(preset.id); setDraft(null); onPreview(null); }} className={`rounded-lg border p-3 text-left ${style === preset.id ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}><strong className="text-sm block">{preset.name}</strong><span className="block text-xs text-fg-muted mt-1">{preset.description}</span></button>)}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {([['pauses', 'Trim quiet pauses'], ['zooms', 'Add zoom effects'], ['polish', 'Add lighting, elements and colour polish'], ['captions', 'Style existing captions']] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2"><input type="checkbox" checked={options[key]} onChange={e => { setOptions({ ...options, [key]: e.target.checked }); setDraft(null); onPreview(null); }} />{label}</label>)}
        </div>
        <p className="text-xs text-fg-muted m-0">Full editing packs add lighting and opening elements when colour polish is enabled. Quiet pauses are cut only after audio analysis. Existing clips, music, words and custom formatting are kept. Reel templates change default caption looks only. No stock music or B-roll is added.</p>
        <button className={BTN_PRIMARY} disabled={!Object.values(options).some(Boolean)} onClick={() => void analyze(true)}><Sparkles size={16} />Auto edit reel</button>
        <button className={BTN_SECONDARY} disabled={!Object.values(options).some(Boolean)} onClick={() => void analyze()}><Sparkles size={16} />Analyze auto edit</button>
      </fieldset>
      {working && <div><p role="status" className="text-xs">{phase} {progress > 0 && `${progress.toFixed(0)}%`}</p><button className={BTN_SECONDARY} onClick={() => { abortRef.current?.abort(); abortRef.current = null; setWorking(false); onBusy(false); }}>Cancel analysis</button></div>}
      {draft && !currentDraft && <p role="status" className="text-xs text-fg-muted">Your project changed. Analyze again to refresh the preview.</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {currentDraft && <div className="rounded-md bg-surface-2 p-3 flex flex-col gap-2" aria-label="Auto Edit plan">
        <p className="text-sm font-semibold m-0">Ready to apply · {AUTO_EDIT_STYLES.find(s => s.id === style)?.name}</p>
        <p className="text-xs m-0">{currentDraft.edit.cutsAdded} pause cuts · {currentDraft.edit.removedSeconds.toFixed(1)}s shorter · {currentDraft.edit.zoomsAdded} zooms · {currentDraft.edit.project.autoEdit?.generation?.effects.filter(e => e.kind !== 'digital-zoom').length ?? 0} lighting / elements · {currentDraft.edit.captionsStyled} caption styles</p>
        {currentDraft.edit.notes.map(note => <p key={note} className="text-xs text-fg-muted m-0">{note}</p>)}
        <p className="text-xs text-fg-muted m-0">Preview Before/After without changing your project. Apply when ready; Undo restores the previous version.</p>
        <div className="flex flex-wrap gap-2"><button className={BTN_SECONDARY} disabled={locked || working} onClick={() => onPreview(currentDraft.edit)}>Preview before / after</button>
        <button className={BTN_SECONDARY} disabled={locked || working} onClick={() => { onPreview(null); setDraft(null); }}>Discard draft</button></div>
        <button className={BTN_PRIMARY} disabled={locked || working} onClick={() => {
          if (!isCurrent(currentDraft.base)) { setDraft(null); setError('The project changed. Analyze again before applying.'); return; }
          onPreview(null); onApply(currentDraft.edit); setDraft(null);
        }}>Apply auto edit</button>
      </div>}
    </>
  </section>;
}
