import { DEFAULT_BACKGROUND, type CreativeBackground } from '@core/creative/CreativeBackground';
import { analyzeReelColors } from '@core/creative/AutoColorGrade';
import { UiText, useTranslation } from '@ui/i18n/Locale';
import { ContentFormatGallery } from '@ui/pages/editor/features/creative/ContentFormatGallery';
import '@ui/pages/editor/features/creative/CreativeStudio.css';
import { ReadyMadeReels } from '@ui/pages/editor/features/creative/ReadyMadeReels';
import { assembleReelTemplate, type ReelTemplate } from '@core/creative/ReelTemplates';
import { createTemplateMusic } from '@core/creative/ReelTemplateMusic';
import { buildPhotoVideo, isReelPhoto } from '@core/creative/PhotoVideoBuilder';
import { StudioTimeline } from '@ui/pages/editor/features/creative/StudioTimeline';
import { AutoEditPanel } from '@ui/pages/editor/features/creative/AutoEditPanel';
import { sameAutoEditInputs, type AutoEditDraft } from '@core/creative/AutoEdit';
import { MotionEffectsGallery } from '@ui/pages/editor/features/creative/MotionEffectsGallery';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { Clapperboard, Sparkles, Film, Layers, Music2, Palette, Timer, Wand2, Captions } from 'lucide-react';
import { CutRegistry } from '@core/cuts/domain/CutRegistry';
import type { EditorState } from '@core/editor/domain/EditorState';
import { CreativeAssetRepository } from '@core/creative/CreativeAssetRepository';
import { compositionSpans, newCreativeProject, type BRoll, type CreativeAsset, type CreativeClip, type CreativeProject } from '@core/creative/CreativeProject';
import type { CreativeSession } from '@core/creative/CreativeRenderer';
import { toAudioBuffer } from '@core/creative/CreativeAudio';
import { findSilences, LOOKS, type CreativeSettings, type Motion } from '@core/creative/creativeModel';
import { useVideos } from '@ui/_shared/contexts/modules/VideosContext';
import { useEditor } from '@ui/_shared/contexts/modules/EditorContext';
import { useProjects } from '@ui/_shared/contexts/modules/ProjectsContext';
import { useExport } from '@ui/_shared/contexts/modules/ExportContext';
import { usePlayback } from '@ui/pages/editor/contexts/PlaybackContext';
import { Slider } from '@ui/_shared/components/controls/fields/Slider';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

const INPUT = 'w-full min-w-0 bg-surface-1 border border-edge-medium rounded-sm p-2 text-sm text-fg-primary';
const previewPositions = new WeakMap<object, { projectId: string; time: number }>();
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The edit could not be completed.';

export function CreativeStudio({ state, onDraftPreviewChange, captionControls }: { state: EditorState; onDraftPreviewChange: (active: boolean) => void; captionControls: ReactNode }) {
  const { t } = useTranslation();
  const videos = useVideos(), playback = usePlayback(), editor = useEditor(), projects = useProjects();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState('');
  async function launch() {
    setLoading(true); setError(''); playback.pause();
    try {
      let source = await videos.resolver.readableFileInEditor();
      if (!source) {
        const stored = await videos.resolver.readableFileFromStorage();
        if (stored.outcome === 'found') source = stored.file;
      }
      if (!source) throw new Error('Choose the original video again to open Creative Studio.');
      if (!editor.store.snapshot().projectId) {
        await projects.actions.create.execute();
        return; // The project route remounts this surface and continues the launch.
      }
      if (!editor.store.snapshot().creative) {
        const input = new Input({ source: new BlobSource(source), formats: ALL_FORMATS });
        let duration: number;
        try { duration = await input.computeDuration(); } finally { input.dispose(); }
        editor.store.commit(); editor.store.patch({ creative: newCreativeProject(duration) });
      }
      setFile(source);
    } catch (cause) { setError(errorText(cause)); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void launch(); }, 0);
    return () => window.clearTimeout(timer);
    // Resolve source media when this workspace mounts, including after project creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="w-full flex-1 min-h-0 flex flex-col" aria-label={t("Creative workspace")}>
    {error && <div className="p-4"><p role="alert" className="text-sm text-danger"><UiText text={error} /></p><button className={BTN_SECONDARY} disabled={loading} onClick={() => void launch()}><UiText text="Retry opening editor" /></button></div>}
    {!file && !error && <p role="status" className="p-4 text-sm text-fg-muted"><UiText text="Preparing your reel editor…" /></p>}
    {file && state.creative && <StudioSession key={state.projectId} file={file} state={state} project={state.creative} captionControls={captionControls} onDraftPreviewChange={onDraftPreviewChange} />}
  </div>;
}

function NumberField({ label, value, min = 0, max, step = 0.1, change }: {
  label: string; value: number; min?: number; max?: number; step?: number; change: (value: number) => void;
}) {
  return <label className="text-xs text-fg-secondary flex flex-col gap-1 min-w-0"><UiText text={label} /><input className={INPUT} aria-label={label}
    type="number" value={Number(value.toFixed(3))} min={min} max={max} step={step}
    onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) change(Math.max(min, Math.min(max ?? Infinity, event.target.valueAsNumber))); }} /></label>;
}

function StudioSession({ file, state, project, onDraftPreviewChange, captionControls }: { file: File; state: EditorState; project: CreativeProject; onDraftPreviewChange: (active: boolean) => void; captionControls: ReactNode }) {
  const { t } = useTranslation();
  const editor = useEditor(), projects = useProjects(), exporter = useExport();
  const [activeTool, setActiveTool] = useState('Auto');
  const [libraryHost, setLibraryHost] = useState<HTMLDivElement | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [grading, setGrading] = useState(false);
  const gradeAbort = useRef<AbortController | null>(null);
  useEffect(() => () => gradeAbort.current?.abort(), []);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [progress, setProgress] = useState(0);
  const [time, setTime] = useState(() => { const saved = previewPositions.get(editor.store); return saved?.projectId === state.projectId ? saved.time : 0; }), [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [result, setResult] = useState<{ blob: Blob; state: EditorState; format: 'mp4' | 'webm' } | null>(null);
  const renderedResult = result && sameAutoEditInputs(result.state, state) ? result : null;
  // Reflow creates fresh document/segment identities even when layout is unchanged.
  // Rebuilding the painter for those identities reloads fonts and starts another
  // reflow, which can repeatedly cancel audio preparation.
  const previewDocumentLayout = useMemo(() => JSON.stringify(state.document, (_key, value) =>
    value instanceof Set ? [...value] : value && (Array.isArray(value.lines) || Array.isArray(value.words)) ? { ...value, id: undefined } : value), [state.document]);
  const previewSource = state.video.preview?.kind === 'proxy' ? state.video.preview.file : undefined;
  const [serverRendering, setServerRendering] = useState(false);
  const timeRef = useRef(time);
  const comparisonHost = useRef<HTMLDivElement>(null);
  const [comparison, setComparison] = useState<{ draft: AutoEditDraft; base: EditorState } | null>(null);
  const [comparisonSide, setComparisonSide] = useState<'before' | 'after'>('after');
  const validComparison = comparison && sameAutoEditInputs(comparison.base, state) ? comparison : null;
  const viewProject = validComparison && comparisonSide === 'after' ? validComparison.draft.project : project;
  // Unapplied form drafts do not change rendered pixels or require media decoding.
  const previewProjectSignature = useMemo(() => JSON.stringify({ ...viewProject, contentFormat: undefined }), [viewProject]);
  const viewSheets = validComparison && comparisonSide === 'after' ? validComparison.draft.sheets : state.sheets;
  const previewHost = useRef<HTMLDivElement>(null), session = useRef<CreativeSession | null>(null);
  const playingRef = useRef(false), audioContext = useRef<AudioContext | null>(null), audioNode = useRef<AudioBufferSourceNode | null>(null);
  const playRequested = useRef(false), playbackRequest = useRef(0);
  const exportAbort = useRef<AbortController | null>(null), generation = useRef(0);
  const saveChain = useRef(Promise.resolve());
  const projectId = state.projectId!;
  useEffect(() => () => { previewPositions.set(editor.store, { projectId, time: timeRef.current }); }, [editor.store, projectId]);
  const settings = project.settings;
  const background = project.background ?? DEFAULT_BACKGROUND;
  function setBackground(values: Partial<CreativeBackground>) { change({ ...project, background: { ...background, ...values } }); }
  const cuts = useMemo(() => state.cuts.list().map(r => ({ start: r.startSec, end: r.endSec })), [state.cuts]);
  const spans = useMemo(() => compositionSpans(viewProject, cuts), [viewProject, cuts]);
  const duration = spans.at(-1)?.outputEnd ?? 0;
  const [previewRevision, setPreviewRevision] = useState(0);

  function stop() {
    playRequested.current = false; playbackRequest.current++;
    playingRef.current = false; setPlaying(false);
    try { audioNode.current?.stop(); } catch { /* already stopped */ }
    audioNode.current = null;
  }
  function change(next: CreativeProject, key?: string) {
    stop(); setReady(false); setResult(null); setNotice(''); setError('');
    editor.store.commit(key); editor.store.patch({ creative: next });
  }
  function patch(values: Partial<CreativeSettings>) { change({ ...project, settings: { ...settings, ...values } }, `creative:${Object.keys(values).join(',')}`); }
  async function uploadBackground(selected: File | undefined) {
    if (!selected) return;
    setUploading(true); setError('');
    const base = editor.store.snapshot();
    try {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) || selected.size > 10 * 1024 * 1024) throw new Error('Choose a JPG, PNG or WebP image under 10 MB.');
      const image = await createImageBitmap(selected);
      try { if (image.width * image.height > 16000000) throw new Error('Choose a background image under 16 megapixels.'); } finally { image.close(); }
      const asset = await new CreativeAssetRepository().put(selected, 1, projectId);
      if (!sameAutoEditInputs(base, editor.store.snapshot())) throw new Error('Your edit changed. Choose the background again.');
      setBackground({ mode: 'image', image: asset });
    } catch (cause) { setError(errorText(cause)); }
    finally { setUploading(false); }
  }
  async function autoColorGrade() {
    if (gradeAbort.current) return;
    const abort = new AbortController(); gradeAbort.current = abort;
    const base = editor.store.snapshot();
    stop(); setGrading(true); setError(''); setNotice('');
    try {
      const values = await analyzeReelColors(file, project, cuts, asset => new CreativeAssetRepository().get(asset), abort.signal);
      abort.signal.throwIfAborted();
      if (!sameAutoEditInputs(base, editor.store.snapshot())) throw new Error('Your edit changed. Run color analysis again.');
      patch(values);
      setNotice('Auto color grading applied. Preview the result, adjust the sliders and save when ready.');
    } catch (cause) { if (!abort.signal.aborted) setError(errorText(cause)); }
    finally { gradeAbort.current = null; if (!abort.signal.aborted) setGrading(false); }
  }
  async function save() {
    setSaving(true); setError('');
    const operation = saveChain.current.catch(() => {}).then(async () => {
      if (editor.store.snapshot().projectId !== projectId) throw new Error('The active project changed.');
      await projects.actions.save.execute();
    });
    saveChain.current = operation;
    try { await operation; setNotice('Creative edits and media saved with this project.'); }
    catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  }
  async function plan(previewSheets = editor.store.snapshot().sheets) {
    const current = editor.store.snapshot();
    if (!current.document || !current.sheets.length) return null;
    const layout = current.video.layout;
    const document = previewSheets !== current.sheets && layout ? editor.deriver.derive(current.document, previewSheets, {
      videoWidth: layout.width, videoHeight: layout.height, videoDurationSeconds: current.video.duration,
      frozenSegments: current.frozenSegments, decorationOverrides: current.decorationOverrides,
    }) : current.document;
    return exporter.planner.plan({ document, sheets: previewSheets, elementStyles: current.elementStyles,
      decorationOverrides: current.decorationOverrides, cuts: CutRegistry.empty(), behindActorOverrides: current.behindActorOverrides,
      projectId: current.projectId, videoLayout: current.video.layout });
  }
  async function preview() {
    stop(); setError('');
    playRequested.current = true;
    const current = session.current;
    if (!current) return;
    const request = playbackRequest.current;
    try {
      const context = audioContext.current ??= new AudioContext();
      await context.resume();
      const pcm = await current.prepareAudio();
      if (session.current !== current || request !== playbackRequest.current || !playRequested.current) return;
      const node = context.createBufferSource(); node.buffer = toAudioBuffer(pcm); node.connect(context.destination);
      const start = timeRef.current >= duration - 0.04 ? 0 : timeRef.current;
      const origin = context.currentTime - start;
      audioNode.current = node; node.start(0, start); playingRef.current = true; setPlaying(true);
      const tick = async () => {
        if (!playingRef.current || session.current !== current || request !== playbackRequest.current) return;
        const position = Math.min(duration - 0.00001, context.currentTime - origin);
        try { await current.paint(position); }
        catch (cause) { if (session.current === current && request === playbackRequest.current) { setError(errorText(cause)); stop(); } return; }
        if (session.current !== current || request !== playbackRequest.current) return;
        timeRef.current = position; setTime(position);
        if (position >= duration - 0.04) { stop(); return; }
        requestAnimationFrame(() => void tick());
      };
      await tick();
    } catch (cause) { if (session.current === current && request === playbackRequest.current) { setError(errorText(cause)); stop(); } }
  }
  useEffect(() => {
    if (busy) return;
    const token = ++generation.current;
    const abort = new AbortController();
    let prepared: CreativeSession | null = null;
    let active = true;
    const timer = window.setTimeout(() => {
      setReady(false);
      void (async () => {
        prepared = exporter.creativeRenderer.session({ original: file, previewOriginal: previewSource, project: viewProject, cuts, plan: await plan(viewSheets) });
        await prepared.open(360, abort.signal);
        const position = Math.max(0, Math.min(timeRef.current, prepared.duration - 0.001));
        await prepared.paint(position);
        if (!active || token !== generation.current) return;
        session.current = prepared;
        prepared.canvas.className = 'studio-preview-canvas';
        prepared.canvas.setAttribute('aria-label', 'Full reel preview');
        previewHost.current?.replaceChildren(prepared.canvas);
        timeRef.current = position; setTime(position); setPlaying(false); setReady(true);
        // Font arrival can replace the session while audio is preparing.
        // Keep the user's play intent, but never revive an explicit stop.
        if (playRequested.current) void preview();
      })().catch(cause => { if (active && !abort.signal.aborted) setError(errorText(cause)); })
        .finally(() => { if (!active) prepared?.close(); });
    }, 250);
    return () => {
      active = false; abort.abort(); window.clearTimeout(timer); playingRef.current = false;
      try { audioNode.current?.stop(); } catch { /* already stopped */ }
      audioNode.current = null;
      // Let a pending paint settle before releasing its decoding resources.
      if (session.current === prepared) { session.current = null; prepared?.close(); }
    };
    // Rebuild the shared caption plan whenever caption styling or individual overrides change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewProjectSignature, viewSheets, cuts, file, busy, previewRevision, previewSource, previewDocumentLayout, state.elementStyles, state.decorationOverrides, state.behindActorOverrides]);
  // Compare edit content, not derived document identities: font reflow must
  // not remove a finished download. Actual edits still invalidate the result.
  useEffect(() => () => { exportAbort.current?.abort(); void audioContext.current?.close(); }, []);

  async function seek(value: number) {
    stop(); timeRef.current = value; setTime(value);
    try { await session.current?.paint(value); } catch (cause) { setError(errorText(cause)); }
  }
  async function upload(files: FileList | null, kind: 'clip' | 'overlay' | 'music', replaceId?: string) {
    if (!files?.length) return;
    stop(); setUploading(true); setError('');
    try {
      let next = project;
      for (const selected of Array.from(files)) {
        const input = new Input({ source: new BlobSource(selected), formats: ALL_FORMATS });
        let assetDuration: number;
        try {
          const track = kind === 'music' ? await input.getPrimaryAudioTrack() : await input.getPrimaryVideoTrack();
          if (!track || !await track.canDecode()) throw new Error(`Cannot decode ${selected.name}. Choose a supported ${kind === 'music' ? 'audio' : 'video'} file.`);
          assetDuration = await input.computeDuration();
          if (!Number.isFinite(assetDuration) || assetDuration <= 0 || assetDuration > 1800) throw new Error('Choose media between 0 and 30 minutes long.');
        } finally { input.dispose(); }
        const asset = await new CreativeAssetRepository().put(selected, assetDuration, projectId);
        if (editor.store.snapshot().projectId !== projectId) throw new Error('The active project changed.');
        if (kind === 'music') next = { ...next, music: asset, musicOffset: 0 };
        else if (kind === 'clip') next = { ...next, clips: replaceId ? next.clips.map(c => c.id === replaceId ? { ...c, asset, start: 0, end: assetDuration } : c)
          : [...next.clips, { id: crypto.randomUUID(), asset, start: 0, end: assetDuration, volume: 1 }] };
        else next = { ...next, overlays: replaceId ? next.overlays.map(o => o.id === replaceId ? { ...o, asset, sourceStart: 0, end: Math.min(o.end, o.start + assetDuration) } : o)
          : [...next.overlays, { id: crypto.randomUUID(), asset, start: Math.min(time, Math.max(0, duration - 0.1)), end: Math.min(duration, time + assetDuration), sourceStart: 0, x: 0, y: 0, width: 1, height: 1 }] };
      }
      change(next); await save();
    } catch (cause) { setError(errorText(cause)); }
    finally { setUploading(false); }
  }
  async function buildTemplate(template: ReelTemplate, files: readonly File[], title: string, includeMusic: boolean) {
    if (files.length > 30) throw new Error('Choose up to 30 photos or videos per reel.');
    stop(); setUploading(true); setError('');
    const base = editor.store.snapshot();
    try {
      const repository = new CreativeAssetRepository();
      const media: { asset: CreativeAsset | null; duration: number }[] = [];
      const photoDuration = Math.max(...template.beats) * 60 / template.bpm;
      for (const selected of files) {
        const prepared = isReelPhoto(selected) ? await buildPhotoVideo(selected, photoDuration) : selected;
        const input = new Input({ source: new BlobSource(prepared), formats: ALL_FORMATS });
        let length: number;
        try {
          const track = await input.getPrimaryVideoTrack();
          if (!track || !await track.canDecode()) throw new Error(`Cannot open ${selected.name}. Use JPG, PNG, WebP, MP4, WebM or MOV.`);
          length = await input.computeDuration();
          if (!Number.isFinite(length) || length < .1 || length > 1800) throw new Error('Use videos between 0.1 seconds and 30 minutes.');
        } finally { input.dispose(); }
        media.push({ asset: await repository.put(prepared, length, projectId), duration: length });
      }
      if (!media.length) media.push({ asset: null, duration: base.video.duration });
      const musicFile = includeMusic ? createTemplateMusic(template.music, template.bpm) : null;
      const music = musicFile ? await repository.put(musicFile, 32 * 60 / template.bpm, projectId) : null;
      if (!sameAutoEditInputs(base, editor.store.snapshot())) throw new Error('Your project changed while preparing media. Build the template again.');
      const next = assembleReelTemplate(template, media, music, title);
      change({ ...next, ...(project.contentFormat ? { contentFormat: project.contentFormat } : {}) }); timeRef.current = 0; setTime(0);
      setNotice(`${template.name} is ready to preview. Adjust any edit, then render and download your reel.`);
    } finally { setUploading(false); }
  }
  function clipChange(id: string, values: Partial<CreativeClip>) { change({ ...project, clips: project.clips.map(c => c.id === id ? { ...c, ...values } : c) }); }
  function overlayChange(id: string, values: Partial<BRoll>) { change({ ...project, overlays: project.overlays.map(o => o.id === id ? { ...o, ...values } : o) }); }
  function move(index: number, offset: number) {
    const clips = [...project.clips];
    [clips[index], clips[index + offset]] = [clips[index + offset]!, clips[index]!];
    change({ ...project, clips });
  }
  function split(clip: CreativeClip) {
    const span = spans.find(s => s.clip.id === clip.id && time > s.outputStart && time < s.outputEnd);
    const at = span ? span.sourceStart + (time - span.outputStart) * settings.speed : (clip.start + clip.end) / 2;
    if (at - clip.start < 0.05 || clip.end - at < 0.05) return;
    change({ ...project, clips: project.clips.flatMap(c => c.id === clip.id ? [{ ...c, end: at }, { ...c, id: crypto.randomUUID(), start: at }] : [c]) });
  }
  async function analyze() {
    setUploading(true); setError(''); stop();
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await file.arrayBuffer());
      const silences = findSilences(buffer); change({ ...project, silences }); setNotice(t("{0} quiet gaps found. Preview before saving.", { 0: silences.length }));
    } catch { setError('Could not analyze this audio. Use Timeline silence removal or choose an MP4 with AAC audio.'); }
    finally { await context.close(); setUploading(false); }
  }
  async function render(onServer = false) {
    const renderState = editor.store.snapshot();
    stop(); setBusy(true); setServerRendering(onServer); setResult(null); setProgress(0); setError('');
    const abort = new AbortController(); exportAbort.current = abort;
    try {
      await saveChain.current.catch(() => {});
      await projects.actions.save.execute();
      let blob: Blob | null;
      if (onServer) {
        if (!projects.cloudEnabled) throw new Error('Save this project to your account before server export.');
        blob = await exporter.serverReelExporter.render(projectId, format, abort.signal);
      } else {
        blob = await exporter.creativeRenderer.render({ original: file, project, cuts, plan: await plan() },
          { format, signal: abort.signal, onProgress: setProgress });
      }
      if (!abort.signal.aborted && blob) setResult({ blob, state: renderState, format });
    } catch (cause) { if (!abort.signal.aborted) setError(errorText(cause)); }
    finally { setBusy(false); setServerRendering(false); exportAbort.current = null; }
  }
  function download() {
    if (!renderedResult) return;
    const url = URL.createObjectURL(renderedResult.blob), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${file.name.replace(/\.[^.]+$/, '')}-reelstudio.${renderedResult.format}`;
    anchor.hidden = true;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function applyAutoEdit(draft: AutoEditDraft) {
    stop(); setReady(false); setResult(null); setError('');
    editor.store.commit();
    editor.store.patch({ creative: draft.project, sheets: draft.sheets });
    editor.refresh.execute();
    setPreviewRevision(v => v + 1);
    setNotice('Auto Edit applied. Preview your reel, adjust any edit and save when ready.');
  }
  function compare(draft: AutoEditDraft | null) {
    stop();
    if ((draft?.project ?? project) !== viewProject || (draft?.sheets ?? state.sheets) !== viewSheets) setReady(false);
    setComparison(draft ? { draft, base: editor.store.snapshot() } : null); setComparisonSide('after');
    if (draft) requestAnimationFrame(() => comparisonHost.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }
  const locked = busy || uploading || saving || analyzing || grading;
  const editingLocked = locked || !!validComparison;
  useEffect(() => {
    onDraftPreviewChange(!!validComparison);
    return () => onDraftPreviewChange(false);
  }, [validComparison, onDraftPreviewChange]);
  return <section data-ui="creative-studio" aria-label={t("Creative Studio")} className="professional-studio">
    <div className="studio-title"><Clapperboard size={20} className="text-accent" /><div><h2 className="text-base font-semibold m-0"><UiText text="Edit your reel" /></h2><p className="text-xs text-fg-muted m-0"><UiText text="Choose an edit below. Preview it on your reel." /></p></div></div>
    <div className="studio-workbench">
      <nav aria-label={t("Creative tools")} className="studio-tool-rail">
        {([{ id: 'Templates', label: 'Templates', icon: Clapperboard }, { id: 'Auto', label: 'Auto Edit', icon: Sparkles }, { id: 'Captions', label: 'Captions', icon: Captions }, { id: 'Effects', label: 'Effects', icon: Wand2 }, { id: 'Clips', label: 'Clips', icon: Film }, { id: 'B-roll', label: 'B-roll', icon: Layers }, { id: 'Audio', label: 'Audio', icon: Music2 }, { id: 'Background', label: 'Background', icon: Layers }, { id: 'Look', label: 'Look', icon: Palette }, { id: 'Timing', label: 'Timing', icon: Timer }]).map(({ id, label, icon: Icon }) => <button type="button" key={id} data-tool={id} aria-pressed={activeTool === id} onClick={() => setActiveTool(id)}><Icon size={18} /><span><UiText text={label} /></span></button>)}
      </nav>
      <div className="studio-monitor">
        <div className="studio-monitor-heading"><span><UiText text="Your reel" /></span><span>{viewProject.settings.portrait ? t('9:16 portrait') : t('Original ratio')}<UiText text=" · 30 fps" /></span></div>
        {validComparison && <div ref={comparisonHost} className="rounded-lg border border-accent/40 bg-surface-1 p-3 flex flex-col gap-2" aria-label={t("Before and after preview")}>
          <div className="flex gap-2" role="group" aria-label={t("Preview version")}>{(['before', 'after'] as const).map(side => <button key={side} className={comparisonSide === side ? BTN_PRIMARY : BTN_SECONDARY} aria-pressed={comparisonSide === side} disabled={locked} onClick={() => { if (side !== comparisonSide) { stop(); setReady(false); setComparisonSide(side); } }}>{side === 'before' ? t('Before') : t('After')}</button>)}</div>
          <p className="text-xs text-fg-muted m-0">{comparisonSide === 'before' ? t('Before · Your saved/current edit') : t('After · Proposed auto edit')}<UiText text=" · Draft only. Apply to save or export." /></p>
          <button className={BTN_SECONDARY} disabled={locked} data-ui="close-comparison" onClick={() => compare(null)}><UiText text="Close comparison" /></button>
        </div>}
        <div ref={previewHost} className="studio-preview-stage" />
        {!ready && !busy && <p className="text-xs text-fg-muted"><UiText text="Preparing full reel preview…" /></p>}
        <input aria-label={t("Reel playhead")} type="range" min="0" max={Math.max(0, duration - 0.001)} step="any" value={time}
          disabled={!ready || locked} onChange={event => void seek(Math.min(Math.max(0, duration - 0.001), Math.round(Number(event.target.value) * 30) / 30))} />
        <p className="text-xs text-fg-muted m-0">{time.toFixed(1)} / {duration.toFixed(1)}<UiText text="s · 30 fps · " />{viewProject.settings.portrait ? '1080 × 1920' : t('Original ratio, up to 1080 on the short side')}</p>
        <div className="flex gap-2 flex-wrap">
          <button data-ui="creative-preview" data-playing={playing} className={BTN_SECONDARY} disabled={!ready || locked} onClick={() => playing ? stop() : void preview()}>{playing ? t('Stop preview') : t('Preview')}</button>
          <button className={BTN_SECONDARY} disabled={editingLocked} onClick={() => { stop(); editor.store.undo(); setPreviewRevision(v => v + 1); }}><UiText text="Undo" /></button>
          <button className={BTN_SECONDARY} disabled={editingLocked} onClick={() => { stop(); editor.store.redo(); setPreviewRevision(v => v + 1); }}><UiText text="Redo" /></button>
          <button data-ui="creative-save" className={BTN_SECONDARY} disabled={editingLocked} onClick={() => void save()}><UiText text="Save changes" /></button>
        </div>
        <p className="text-xs text-fg-muted m-0"><UiText text="Captions stay linked to the original clips through cuts, speed and reordering. Added clips keep their own audio; B-roll is muted." /></p>
        {settings.speed !== 1 && <p className="text-xs text-fg-muted m-0"><UiText text="Speed changes also change voice pitch in the mixed reel." /></p>}
        {error && <p role="alert" className="text-sm text-danger break-words"><UiText text={error} /></p>}
        {notice && <p data-ui="creative-save-status" data-saved={notice === 'Creative edits and media saved with this project.'} role="status" className="text-xs text-fg-secondary"><UiText text={notice} /></p>}
        {uploading && <p role="status" className="text-xs"><UiText text="Preparing and saving media…" /></p>}
        <details className="studio-disclosure studio-export"><summary><UiText text="Render & download" /></summary>
        <label className="text-xs"><UiText text="Export format" /><select data-ui="creative-export-format" aria-label={t("Export format")} className={INPUT} value={format} disabled={locked} onChange={event => { setFormat(event.target.value as 'mp4' | 'webm'); setResult(null); }}><option value="mp4"><UiText text="MP4 · H.264 / AAC" /></option><option value="webm"><UiText text="WebM · VP9 / Opus" /></option></select></label>
        {busy ? <><p role="status">{serverRendering ? t('Rendering on server…') : t("Rendering {0}%", { 0: progress.toFixed(0) })}</p><button className={BTN_SECONDARY} onClick={() => exportAbort.current?.abort()}><UiText text="Cancel export" /></button></>
          : <><button data-ui="creative-render" className={BTN_PRIMARY} disabled={editingLocked || duration < 0.1} onClick={() => void render()}><UiText text="Render edited reel" /></button>
            {projects.cloudEnabled && exporter.serverReelExporter.enabled && !new URLSearchParams(window.location.search).has('serverRender') && <button className={BTN_SECONDARY} disabled={editingLocked || duration < 0.1} onClick={() => void render(true)}><UiText text="Render on server" /></button>}</>}
        {renderedResult && !validComparison && <button data-ui="creative-download" className={BTN_PRIMARY} onClick={download}><UiText text="Download reel" /></button>}
        </details>
      </div>
      <div className="studio-inspector" data-active-tool={activeTool}>
      <div hidden={activeTool !== 'Auto'} className="studio-library" ref={setLibraryHost} aria-label={t("Editing skill library")} />
      <div hidden={activeTool !== 'Auto'}>
      <AutoEditPanel libraryHost={libraryHost} file={file} state={state} locked={locked} onStart={stop} onBusy={setAnalyzing} onApply={applyAutoEdit} onPreview={compare} />
      </div>
      <div hidden={activeTool !== 'Templates'}><ContentFormatGallery value={project.contentFormat} onChange={contentFormat => { setNotice(''); setError(''); editor.store.commit('creative:content-format'); editor.store.patch({ creative: { ...project, contentFormat } }); }} locked={editingLocked} duration={duration} onApply={effects => {
        const retained = (project.effects ?? []).filter(effect => effect.kind !== 'content-card');
        if (retained.length + effects.length > 40) throw new Error('Remove some effects before applying a content format (maximum 40).');
        change({ ...project, effects: [...retained, ...effects] });
        timeRef.current = 0; setTime(0);
      }} />{activeTool === 'Templates' && <ReadyMadeReels locked={editingLocked} onBuild={buildTemplate} onSamplePreview={stop} />}</div>
      <fieldset disabled={editingLocked} className="flex flex-col gap-5 min-w-0 border-0 p-0 m-0">
        <section hidden={activeTool !== 'Captions'} aria-label={t("Customize captions")} className="rounded-lg border border-edge-medium bg-surface-1 p-4 min-w-0">{activeTool === 'Captions' && captionControls}</section>
        <div hidden={activeTool !== 'Effects'} id="creative-Effects" className="rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2">
        <MotionEffectsGallery effects={project.effects ?? []} duration={duration} time={time} boundaries={spans.slice(1).map(s => s.outputStart)} ready={ready}
          onSeek={value => void seek(value)} onChange={effects => change({ ...project, effects })} /></div>

        <section hidden={activeTool !== 'Clips'} id="creative-Clips" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0"><UiText text="Clips" /></h3>
          <label className="text-xs"><UiText text="Add clips" /><input aria-label={t("Add clips")} type="file" accept="video/*" multiple className="block w-full mt-1 text-xs" onChange={event => { void upload(event.target.files, 'clip'); event.target.value = ''; }} /></label>
          {project.clips.map((clip, index) => <div key={clip.id} className="rounded border border-edge-medium p-3 flex flex-col gap-2" data-testid="creative-clip">
            <span className="text-sm break-words">{index + 1}. {clip.asset?.name ?? t('Original video · captions')}</span>
            <div className="grid grid-cols-2 gap-2"><NumberField label={t("Clip {0} start", { 0: index + 1 })} value={clip.start} max={clip.end - 0.05} change={start => clipChange(clip.id, { start })} />
              <NumberField label={t("Clip {0} end", { 0: index + 1 })} value={clip.end} min={clip.start + 0.05} max={clip.asset?.duration ?? state.video.duration} change={end => clipChange(clip.id, { end })} /></div>
            <NumberField label={t("Clip {0} volume", { 0: index + 1 })} value={clip.volume} max={1} change={volume => clipChange(clip.id, { volume })} />
            <div className="flex flex-wrap gap-2"><button className={BTN_SECONDARY} disabled={index === 0} onClick={() => move(index, -1)}><UiText text="Move up" /></button><button className={BTN_SECONDARY} disabled={index === project.clips.length - 1} onClick={() => move(index, 1)}><UiText text="Move down" /></button><button className={BTN_SECONDARY} onClick={() => split(clip)}><UiText text="Split" /></button><button className={BTN_SECONDARY} onClick={() => change({ ...project, clips: project.clips.filter(c => c.id !== clip.id) })}><UiText text="Remove clip" /></button></div>
            {clip.asset && <label className="text-xs"><UiText text="Replace clip" /><input aria-label={t("Replace clip {0}", { 0: index + 1 })} type="file" accept="video/*" onChange={event => void upload(event.target.files, 'clip', clip.id)} /></label>}
          </div>)}
          <button className={BTN_SECONDARY} onClick={() => change({ ...project, clips: [...project.clips, { id: crypto.randomUUID(), asset: null, start: settings.start, end: settings.end, volume: 1 }] })}><UiText text="Add original clip" /></button>
        </section>
        <section hidden={activeTool !== 'B-roll'} id="creative-B-roll" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0"><UiText text="B-roll / picture-in-picture" /></h3>
          <label className="text-xs"><UiText text="Add B-roll" /><input aria-label={t("Add B-roll")} type="file" accept="video/*" multiple className="block w-full text-xs" disabled={duration < 0.1} onChange={event => { void upload(event.target.files, 'overlay'); event.target.value = ''; }} /></label>
          {project.overlays.map((overlay, index) => <div key={overlay.id} className="rounded border border-edge-medium p-3 flex flex-col gap-2" data-testid="creative-overlay">
            <span className="text-sm break-words">{overlay.asset.name}</span>
            <div className="grid grid-cols-2 gap-2"><NumberField label={t("B-roll {0} start", { 0: index + 1 })} value={overlay.start} max={overlay.end - 0.05} change={start => overlayChange(overlay.id, { start })} /><NumberField label={t("B-roll {0} end", { 0: index + 1 })} value={overlay.end} min={overlay.start + 0.05} max={Math.min(duration, overlay.start + overlay.asset.duration - overlay.sourceStart)} change={end => overlayChange(overlay.id, { end })} />
              <NumberField label={t("B-roll {0} source offset", { 0: index + 1 })} value={overlay.sourceStart} max={Math.max(0, overlay.asset.duration - (overlay.end - overlay.start))} change={sourceStart => overlayChange(overlay.id, { sourceStart })} />
              <NumberField label={t("B-roll {0} size %", { 0: index + 1 })} value={overlay.width * 100} min={10} max={100} step={1} change={size => overlayChange(overlay.id, { width: size / 100, height: size / 100, x: Math.min(overlay.x, 1 - size / 100), y: Math.min(overlay.y, 1 - size / 100) })} />
              <NumberField label={t("B-roll {0} X %", { 0: index + 1 })} value={overlay.x * 100} max={(1 - overlay.width) * 100} step={1} change={x => overlayChange(overlay.id, { x: x / 100 })} /><NumberField label={t("B-roll {0} Y %", { 0: index + 1 })} value={overlay.y * 100} max={(1 - overlay.height) * 100} step={1} change={y => overlayChange(overlay.id, { y: y / 100 })} /></div>
            <div className="flex flex-wrap gap-2"><button className={BTN_SECONDARY} onClick={() => overlayChange(overlay.id, { width: 0.35, height: 0.35, x: 0.6, y: 0.05 })}><UiText text="Picture-in-picture" /></button><button className={BTN_SECONDARY} onClick={() => overlayChange(overlay.id, { width: 1, height: 1, x: 0, y: 0 })}><UiText text="Full frame" /></button><button className={BTN_SECONDARY} onClick={() => change({ ...project, overlays: project.overlays.filter(o => o.id !== overlay.id) })}><UiText text="Remove B-roll" /></button></div>
            <label className="text-xs"><UiText text="Replace B-roll" /><input aria-label={t("Replace B-roll {0}", { 0: index + 1 })} type="file" accept="video/*" onChange={event => void upload(event.target.files, 'overlay', overlay.id)} /></label>
          </div>)}
        </section>
        <section hidden={activeTool !== 'Audio'} id="creative-Audio" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0"><UiText text="Voice & music" /></h3>
          <label className="text-xs"><UiText text="Upload music" /><input aria-label={t("Upload music")} type="file" accept="audio/*" className="block w-full text-xs" onChange={event => { void upload(event.target.files, 'music'); event.target.value = ''; }} /></label>
          {project.music && <><span className="text-xs break-words">{project.music.name}</span><button className={BTN_SECONDARY} onClick={() => change({ ...project, music: null })}><UiText text="Remove music" /></button><NumberField label={t("Music start offset")} value={project.musicOffset} max={project.music.duration} change={musicOffset => change({ ...project, musicOffset })} /></>}
          <div className="flex flex-col gap-2" data-ui="voice-enhancement">
            <h4 className="font-semibold m-0"><UiText text="Enhance voice" /></h4>
            <p className="text-xs text-fg-muted m-0"><UiText text="Reduce rumble and quiet background noise, balance speech levels and keep peaks under control. Music stays separate." /></p>
            <button type="button" className={BTN_PRIMARY} onClick={() => patch({ voiceEnhancement: 'natural', cleanup: true, normalize: true, ducking: true })}><UiText text="Enhance audio" /></button>
            <label className="text-xs"><UiText text="Voice enhancement" /><select className={INPUT} aria-label={t('Voice enhancement')} value={settings.voiceEnhancement ?? 'off'} onChange={event => patch({ voiceEnhancement: event.target.value as 'off' | 'natural' | 'strong', ...(event.target.value !== 'off' ? { cleanup: true, normalize: true } : {}) })}>
              <option value="off"><UiText text="Off" /></option><option value="natural"><UiText text="Natural voice" /></option><option value="strong"><UiText text="Stronger cleanup" /></option>
            </select></label>
            <label className="text-xs"><UiText text="Electric hum removal" /><select className={INPUT} aria-label={t('Electric hum removal')} value={settings.humRemoval ?? 'off'} onChange={event => patch({ humRemoval: event.target.value as 'off' | '50' | '60' })}>
              <option value="off"><UiText text="Off" /></option><option value="50">50 Hz</option><option value="60">60 Hz</option>
            </select></label>
            <button type="button" className={BTN_SECONDARY} onClick={() => patch({ voiceEnhancement: 'off', humRemoval: 'off', cleanup: false, normalize: false })}><UiText text="Restore original voice" /></button>
          </div>
          <Slider label={t("Original audio")} value={settings.sourceVolume} min={0} max={1} step={0.05} onChange={sourceVolume => patch({ sourceVolume })} />
          <Slider label={t("Music volume")} value={settings.musicVolume} min={0} max={1} step={0.05} onChange={musicVolume => patch({ musicVolume })} />
          <label className="text-sm"><input type="checkbox" checked={settings.ducking} onChange={event => patch({ ducking: event.target.checked })} /><UiText text=" Lower music during speech" /></label>
          <label className="text-sm"><input type="checkbox" checked={settings.cleanup} onChange={event => patch({ cleanup: event.target.checked })} /><UiText text=" Voice cleanup · rumble filter & noise gate" /></label>
          <label className="text-sm"><input type="checkbox" checked={settings.normalize} onChange={event => patch({ normalize: event.target.checked })} /><UiText text=" Normalize voice level" /></label>
        </section>
        <section hidden={activeTool !== 'Background'} id="creative-Background" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4">
          <h3 className="font-semibold m-0"><UiText text="Change background" /></h3>
          <p className="text-xs text-fg-muted"><UiText text="Keep people in front and replace the background in your clips. Works best with a clearly visible person. B-roll stays unchanged." /></p>
          <p className="text-xs text-fg-muted"><UiText text="The first use downloads the person model. Preview and export may take longer." /></p>
          <label className="text-xs"><UiText text="Background style" /><select className={INPUT} aria-label={t('Background style')} value={background.mode} onChange={event => setBackground({ mode: event.target.value as CreativeBackground['mode'] })}>
            <option value="original"><UiText text="Original background" /></option>
            <option value="blur"><UiText text="Blur background" /></option>
            <option value="color"><UiText text="Solid color" /></option>
            <option value="image" disabled={!background.image}><UiText text="Photo background" /></option>
          </select></label>
          {background.mode === 'color' && <label className="text-xs"><UiText text="Background color" /><input aria-label={t('Background color')} type="color" value={background.color} onChange={event => setBackground({ color: event.target.value })} /></label>}
          {background.mode === 'blur' && <Slider label={t('Background blur')} value={background.blur} min={0} max={40} step={1} onChange={blur => setBackground({ blur })} />}
          <label className="text-xs"><UiText text="Upload background photo" /><input aria-label={t('Upload background photo')} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { void uploadBackground(event.target.files?.[0]); event.target.value = ''; }} /></label>
          {background.image && <p className="text-xs break-words">{background.image.name}</p>}
          <button type="button" className={BTN_SECONDARY} onClick={() => setBackground({ mode: 'original' })}><UiText text="Restore original background" /></button>
        </section>
        <section hidden={activeTool !== 'Look'} id="creative-Look" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0"><UiText text="Look & motion" /></h3>
          <div className="flex flex-col gap-2" data-ui="auto-color-grading">
            <p className="text-xs text-fg-muted m-0"><UiText text="Analyze your clips to balance brightness, contrast and saturation with a natural look. Applies to the whole reel." /></p>
            <button type="button" className={BTN_PRIMARY} disabled={editingLocked} onClick={() => void autoColorGrade()}>{grading ? t('Analyzing colors…') : t('Auto color grading')}</button>
            <button type="button" className={BTN_SECONDARY} disabled={editingLocked} onClick={() => patch({ look: 'clean', brightness: 1, contrast: 1, saturation: 1 })}><UiText text="Reset colors" /></button>
          </div>
          <label className="text-sm"><input type="checkbox" checked={settings.portrait} onChange={event => patch({ portrait: event.target.checked })} /><UiText text=" Portrait canvas · 1080 × 1920" /></label>
          <div className="flex flex-wrap gap-2">{LOOKS.map(look => <button key={look.id} aria-pressed={settings.look === look.id} className={settings.look === look.id ? BTN_PRIMARY : BTN_SECONDARY} onClick={() => patch({ look: look.id })}>{look.name}</button>)}</div>
          <Slider label={t("Brightness")} value={settings.brightness} min={0.5} max={1.5} step={0.01} onChange={brightness => patch({ brightness })} />
          <Slider label={t("Contrast")} value={settings.contrast} min={0.5} max={1.5} step={0.01} onChange={contrast => patch({ contrast })} />
          <Slider label={t("Saturation")} value={settings.saturation} min={0} max={2} step={0.01} onChange={saturation => patch({ saturation })} />
          <label className="text-xs"><UiText text="Motion" /><select aria-label={t("Motion")} className={INPUT} value={settings.motion} onChange={event => patch({ motion: event.target.value as Motion })}><option value="none"><UiText text="None" /></option><option value="push"><UiText text="Slow zoom" /></option><option value="pulse"><UiText text="Beat zoom" /></option><option value="shake"><UiText text="Shake" /></option><option value="flash"><UiText text="Beat flash" /></option></select></label>
          <Slider label={t("Intensity")} value={settings.intensity} min={0} max={1} step={0.05} onChange={intensity => patch({ intensity })} />
          <Slider label={t("BPM")} value={settings.bpm} min={40} max={240} step={1} onChange={bpm => patch({ bpm })} />
          <label className="text-xs"><UiText text="Text" /><textarea aria-label={t("Text")} className={INPUT} value={settings.text} maxLength={300} onChange={event => patch({ text: event.target.value })} /></label>
          <label className="text-xs"><UiText text="Text colour" /><input type="color" aria-label={t("Text colour")} value={settings.textColor} onChange={event => patch({ textColor: event.target.value })} /></label>
          <Slider label={t("Text size")} value={settings.textSize} min={2} max={15} step={0.5} onChange={textSize => patch({ textSize })} />
          <Slider label={t("Text position")} value={settings.textY} min={10} max={90} step={1} onChange={textY => patch({ textY })} />
        </section>
        <section hidden={activeTool !== 'Timing'} id="creative-Timing" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0"><UiText text="Timing" /></h3>
          <Slider label={t("Start")} value={settings.start} min={0} max={Math.max(0, settings.end - 0.1)} step={0.1} onChange={start => patch({ start })} />
          <Slider label={t("End")} value={settings.end} min={settings.start + 0.1} max={Math.max(settings.end, state.video.duration)} step={0.1} onChange={end => patch({ end })} />
          <Slider label={t("Speed")} value={settings.speed} min={0.5} max={2} step={0.1} onChange={speed => patch({ speed })} />
          <label className="text-sm"><input type="checkbox" checked={project.useTimelineCuts} onChange={event => change({ ...project, useTimelineCuts: event.target.checked })} /><UiText text=" Include Timeline cuts" /></label>
          <label className="text-sm"><input type="checkbox" checked={settings.beatCuts} onChange={event => patch({ beatCuts: event.target.checked })} /><UiText text=" Beat jump cuts" /></label>
          <p className="text-xs text-fg-muted m-0"><UiText text="Beat cuts use the BPM grid and may cut speech. Preview before exporting." /></p>
          <button className={BTN_SECONDARY} onClick={() => void analyze()}><UiText text="Detect & remove silences" /></button>
          {!!project.silences.length && <div className="flex flex-col gap-3" aria-label={t("Editable pause cuts")}><p className="text-xs text-fg-muted m-0"><UiText text="Pause cuts use original video seconds. Change their boundaries or restore any cut." /></p>
            {project.silences.map((range, index) => <div key={index} className="border border-edge-medium rounded-md p-3 flex flex-col gap-2" data-testid="pause-cut">
              <div className="grid grid-cols-2 gap-2"><NumberField label={t("Pause cut {0} start", { 0: index + 1 })} value={range.start} max={range.end - 0.05} change={start => change({ ...project, silences: project.silences.map((r, i) => i === index ? { ...r, start } : r) })} /><NumberField label={t("Pause cut {0} end", { 0: index + 1 })} value={range.end} min={range.start + 0.05} max={state.video.duration || settings.end} change={end => change({ ...project, silences: project.silences.map((r, i) => i === index ? { ...r, end } : r) })} /></div>
              <button className={BTN_SECONDARY} onClick={() => change({ ...project, silences: project.silences.filter((_, i) => i !== index) })}><UiText text="Restore pause cut " />{index + 1}</button>
            </div>)}
          </div>}
          {!!project.silences.length && <button className={BTN_SECONDARY} onClick={() => change({ ...project, silences: [] })}><UiText text="Restore detected silences" /></button>}
        </section>
      </fieldset>
      </div>
    <details className="studio-timeline-disclosure"><summary><UiText text="Timeline " /><span><UiText text="Fine-tune clips, captions & audio" /></span></summary>
    <StudioTimeline spans={spans} project={viewProject} document={state.document} time={time} duration={duration} disabled={!ready || locked} onSeek={value => void seek(value)} />
    </details>
    </div>
  </section>;
}
