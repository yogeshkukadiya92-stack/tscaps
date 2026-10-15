import { AutoEditPanel } from '@ui/pages/editor/features/creative/AutoEditPanel';
import type { AutoEditDraft } from '@core/creative/AutoEdit';
import { MotionEffectsGallery } from '@ui/pages/editor/features/creative/MotionEffectsGallery';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import { Clapperboard } from 'lucide-react';
import { CutRegistry } from '@core/cuts/domain/CutRegistry';
import type { EditorState } from '@core/editor/domain/EditorState';
import { CreativeAssetRepository } from '@core/creative/CreativeAssetRepository';
import { compositionSpans, newCreativeProject, type BRoll, type CreativeClip, type CreativeProject } from '@core/creative/CreativeProject';
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
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The edit could not be completed.';

export function CreativeStudio({ state }: { state: EditorState }) {
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
  return <div className="w-full flex-1 min-h-0 flex flex-col" aria-label="Creative workspace">
    {error && <div className="p-4"><p role="alert" className="text-sm text-danger">{error}</p><button className={BTN_SECONDARY} disabled={loading} onClick={() => void launch()}>Retry opening editor</button></div>}
    {!file && !error && <p role="status" className="p-4 text-sm text-fg-muted">Preparing your reel editor…</p>}
    {file && state.creative && <StudioSession key={state.projectId} file={file} state={state} project={state.creative} />}
  </div>;
}

function NumberField({ label, value, min = 0, max, step = 0.1, change }: {
  label: string; value: number; min?: number; max?: number; step?: number; change: (value: number) => void;
}) {
  return <label className="text-xs text-fg-secondary flex flex-col gap-1 min-w-0">{label}<input className={INPUT} aria-label={label}
    type="number" value={Number(value.toFixed(3))} min={min} max={max} step={step}
    onChange={event => { if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber)) change(Math.max(min, Math.min(max ?? Infinity, event.target.valueAsNumber))); }} /></label>;
}

function StudioSession({ file, state, project }: { file: File; state: EditorState; project: CreativeProject }) {
  const editor = useEditor(), projects = useProjects(), exporter = useExport();
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0), [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [result, setResult] = useState<Blob | null>(null);
  const previewHost = useRef<HTMLDivElement>(null), session = useRef<CreativeSession | null>(null);
  const playingRef = useRef(false), audioContext = useRef<AudioContext | null>(null), audioNode = useRef<AudioBufferSourceNode | null>(null);
  const exportAbort = useRef<AbortController | null>(null), generation = useRef(0);
  const saveChain = useRef(Promise.resolve());
  const projectId = state.projectId!;
  const settings = project.settings;
  const cuts = useMemo(() => state.cuts.list().map(r => ({ start: r.startSec, end: r.endSec })), [state.cuts]);
  const spans = useMemo(() => compositionSpans(project, cuts), [project, cuts]);
  const duration = spans.at(-1)?.outputEnd ?? 0;
  const [previewRevision, setPreviewRevision] = useState(0);

  function stop() {
    playingRef.current = false; setPlaying(false);
    try { audioNode.current?.stop(); } catch { /* already stopped */ }
    audioNode.current = null;
  }
  function change(next: CreativeProject, key?: string) {
    stop(); setReady(false); setResult(null); setNotice(''); setError('');
    editor.store.commit(key); editor.store.patch({ creative: next });
  }
  function patch(values: Partial<CreativeSettings>) { change({ ...project, settings: { ...settings, ...values } }, `creative:${Object.keys(values).join(',')}`); }
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
  async function plan() {
    const current = editor.store.snapshot();
    if (!current.document || !current.sheets.length) return null;
    return exporter.planner.plan({ document: current.document, sheets: current.sheets, elementStyles: current.elementStyles,
      decorationOverrides: current.decorationOverrides, cuts: CutRegistry.empty(), behindActorOverrides: current.behindActorOverrides,
      projectId: current.projectId, videoLayout: current.video.layout });
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
        prepared = exporter.creativeRenderer.session({ original: file, project, cuts, plan: await plan() });
        await prepared.open(360, abort.signal);
        await prepared.paint(0);
        if (!active || token !== generation.current) return;
        session.current = prepared;
        prepared.canvas.className = 'block w-full max-h-[52vh] object-contain rounded-lg bg-black';
        prepared.canvas.setAttribute('aria-label', 'Full reel preview');
        previewHost.current?.replaceChildren(prepared.canvas);
        setTime(0); setReady(true);
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
    // The project object includes every visual/audio edit; caption state is refreshed when this workspace opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, cuts, file, busy, previewRevision]);
  useEffect(() => () => { exportAbort.current?.abort(); void audioContext.current?.close(); }, []);

  async function preview() {
    const current = session.current;
    if (!current) return;
    stop(); setError('');
    try {
      const context = audioContext.current ??= new AudioContext();
      await context.resume();
      const pcm = await current.prepareAudio();
      if (session.current !== current) return;
      const node = context.createBufferSource(); node.buffer = toAudioBuffer(pcm); node.connect(context.destination);
      const start = time >= duration - 0.04 ? 0 : time;
      const origin = context.currentTime - start;
      audioNode.current = node; node.start(0, start); playingRef.current = true; setPlaying(true);
      const tick = async () => {
        if (!playingRef.current || session.current !== current) return;
        const position = Math.min(duration - 0.00001, context.currentTime - origin);
        try { await current.paint(position); }
        catch (cause) { if (session.current === current && playingRef.current) setError(errorText(cause)); stop(); return; }
        setTime(position);
        if (position >= duration - 0.04) { stop(); return; }
        requestAnimationFrame(() => void tick());
      };
      await tick();
    } catch (cause) { if (session.current === current) setError(errorText(cause)); stop(); }
  }
  async function seek(value: number) {
    stop(); setTime(value);
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
      const silences = findSilences(buffer); change({ ...project, silences }); setNotice(`${silences.length} quiet gaps found. Preview before saving.`);
    } catch { setError('Could not analyze this audio. Use Timeline silence removal or choose an MP4 with AAC audio.'); }
    finally { await context.close(); setUploading(false); }
  }
  async function render() {
    stop(); setBusy(true); setResult(null); setProgress(0); setError('');
    const abort = new AbortController(); exportAbort.current = abort;
    try {
      await saveChain.current.catch(() => {});
      await projects.actions.save.execute();
      const blob = await exporter.creativeRenderer.render({ original: file, project, cuts, plan: await plan() },
        { format, signal: abort.signal, onProgress: setProgress });
      if (!abort.signal.aborted) setResult(blob);
    } catch (cause) { if (!abort.signal.aborted) setError(errorText(cause)); }
    finally { setBusy(false); exportAbort.current = null; }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(result), anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${file.name.replace(/\.[^.]+$/, '')}-reelstudio.${format}`; anchor.click();
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
  const locked = busy || uploading || saving || analyzing;
  return <section aria-label="Creative Studio" className="flex flex-col flex-1 min-h-0 w-full gap-3 overflow-y-auto lg:overflow-hidden">
    <div className="flex items-center gap-3 shrink-0"><Clapperboard size={20} className="text-accent" /><div><h2 className="text-base font-semibold m-0">Creative Studio</h2><p className="text-xs text-fg-muted m-0">Clips, effects, audio and captions. One finished reel.</p></div></div>
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(360px,1fr)] gap-5 min-h-0 lg:flex-1">
      <div className="flex flex-col gap-3 min-w-0 lg:overflow-y-auto lg:pr-2">
        <div ref={previewHost} className="bg-black rounded-lg min-h-40 shrink-0" />
        {!ready && !busy && <p className="text-xs text-fg-muted">Preparing full reel preview…</p>}
        <input aria-label="Reel playhead" type="range" min="0" max={Math.max(0, duration - 0.001)} step="0.033333" value={time}
          disabled={!ready || locked} onChange={event => void seek(Number(event.target.value))} />
        <p className="text-xs text-fg-muted m-0">{time.toFixed(1)} / {duration.toFixed(1)}s · 30 fps · {settings.portrait ? '1080 × 1920' : 'Original ratio, up to 1080 on the short side'}</p>
        <div className="flex gap-2 flex-wrap">
          <button className={BTN_SECONDARY} disabled={!ready || locked} onClick={() => playing ? stop() : void preview()}>{playing ? 'Stop preview' : 'Preview'}</button>
          <button className={BTN_SECONDARY} disabled={locked} onClick={() => { stop(); editor.store.undo(); setPreviewRevision(v => v + 1); }}>Undo</button>
          <button className={BTN_SECONDARY} disabled={locked} onClick={() => { stop(); editor.store.redo(); setPreviewRevision(v => v + 1); }}>Redo</button>
          <button className={BTN_SECONDARY} disabled={locked} onClick={() => void save()}>Save creative changes</button>
        </div>
        <p className="text-xs text-fg-muted m-0">Captions stay linked to the original clips through cuts, speed and reordering. Added clips keep their own audio; B-roll is muted.</p>
        {settings.speed !== 1 && <p className="text-xs text-fg-muted m-0">Speed changes also change voice pitch in the mixed reel.</p>}
        {error && <p role="alert" className="text-sm text-danger break-words">{error}</p>}
        {notice && <p role="status" className="text-xs text-fg-secondary">{notice}</p>}
        {uploading && <p role="status" className="text-xs">Preparing and saving media…</p>}
        <label className="text-xs">Export format<select aria-label="Export format" className={INPUT} value={format} disabled={locked} onChange={event => { setFormat(event.target.value as 'mp4' | 'webm'); setResult(null); }}><option value="mp4">MP4 · H.264 / AAC</option><option value="webm">WebM · VP9 / Opus</option></select></label>
        {busy ? <><p role="status">Rendering {progress.toFixed(0)}%</p><button className={BTN_SECONDARY} onClick={() => exportAbort.current?.abort()}>Cancel export</button></>
          : <button className={BTN_PRIMARY} disabled={locked || duration < 0.1} onClick={() => void render()}>Render edited reel</button>}
        {result && <button className={BTN_PRIMARY} onClick={download}>Download reel</button>}
      </div>
      <div className="flex flex-col min-h-0 min-w-0 gap-3">
      <nav aria-label="Creative tools" className="flex flex-wrap gap-2 shrink-0">
        {['Auto', 'Effects', 'Clips', 'B-roll', 'Audio', 'Look', 'Timing'].map(label => <button key={label} className={BTN_SECONDARY} onClick={() => document.getElementById(`creative-${label}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })}>{label === 'Auto' ? 'Auto Edit' : label}</button>)}
      </nav>
      <div className="flex flex-col gap-5 min-w-0 lg:overflow-y-auto lg:pr-2">
      <AutoEditPanel file={file} state={state} locked={locked} onStart={stop} onBusy={setAnalyzing} onApply={applyAutoEdit} />
      <fieldset disabled={locked} className="flex flex-col gap-5 min-w-0 border-0 p-0 m-0">
        <div id="creative-Effects" className="rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2">
        <MotionEffectsGallery effects={project.effects ?? []} duration={duration} time={time} boundaries={spans.slice(1).map(s => s.outputStart)} ready={ready}
          onSeek={value => void seek(value)} onChange={effects => change({ ...project, effects })} /></div>

        <section id="creative-Clips" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0">Clips</h3>
          <label className="text-xs">Add clips<input aria-label="Add clips" type="file" accept="video/*" multiple className="block w-full mt-1 text-xs" onChange={event => { void upload(event.target.files, 'clip'); event.target.value = ''; }} /></label>
          {project.clips.map((clip, index) => <div key={clip.id} className="rounded border border-edge-medium p-3 flex flex-col gap-2" data-testid="creative-clip">
            <span className="text-sm break-words">{index + 1}. {clip.asset?.name ?? 'Original video · captions'}</span>
            <div className="grid grid-cols-2 gap-2"><NumberField label={`Clip ${index + 1} start`} value={clip.start} max={clip.end - 0.05} change={start => clipChange(clip.id, { start })} />
              <NumberField label={`Clip ${index + 1} end`} value={clip.end} min={clip.start + 0.05} max={clip.asset?.duration ?? state.video.duration} change={end => clipChange(clip.id, { end })} /></div>
            <NumberField label={`Clip ${index + 1} volume`} value={clip.volume} max={1} change={volume => clipChange(clip.id, { volume })} />
            <div className="flex flex-wrap gap-2"><button className={BTN_SECONDARY} disabled={index === 0} onClick={() => move(index, -1)}>Move up</button><button className={BTN_SECONDARY} disabled={index === project.clips.length - 1} onClick={() => move(index, 1)}>Move down</button><button className={BTN_SECONDARY} onClick={() => split(clip)}>Split</button><button className={BTN_SECONDARY} onClick={() => change({ ...project, clips: project.clips.filter(c => c.id !== clip.id) })}>Remove clip</button></div>
            {clip.asset && <label className="text-xs">Replace clip<input aria-label={`Replace clip ${index + 1}`} type="file" accept="video/*" onChange={event => void upload(event.target.files, 'clip', clip.id)} /></label>}
          </div>)}
          <button className={BTN_SECONDARY} onClick={() => change({ ...project, clips: [...project.clips, { id: crypto.randomUUID(), asset: null, start: settings.start, end: settings.end, volume: 1 }] })}>Add original clip</button>
        </section>
        <section id="creative-B-roll" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0">B-roll / picture-in-picture</h3>
          <label className="text-xs">Add B-roll<input aria-label="Add B-roll" type="file" accept="video/*" multiple className="block w-full text-xs" disabled={duration < 0.1} onChange={event => { void upload(event.target.files, 'overlay'); event.target.value = ''; }} /></label>
          {project.overlays.map((overlay, index) => <div key={overlay.id} className="rounded border border-edge-medium p-3 flex flex-col gap-2" data-testid="creative-overlay">
            <span className="text-sm break-words">{overlay.asset.name}</span>
            <div className="grid grid-cols-2 gap-2"><NumberField label={`B-roll ${index + 1} start`} value={overlay.start} max={overlay.end - 0.05} change={start => overlayChange(overlay.id, { start })} /><NumberField label={`B-roll ${index + 1} end`} value={overlay.end} min={overlay.start + 0.05} max={Math.min(duration, overlay.start + overlay.asset.duration - overlay.sourceStart)} change={end => overlayChange(overlay.id, { end })} />
              <NumberField label={`B-roll ${index + 1} source offset`} value={overlay.sourceStart} max={Math.max(0, overlay.asset.duration - (overlay.end - overlay.start))} change={sourceStart => overlayChange(overlay.id, { sourceStart })} />
              <NumberField label={`B-roll ${index + 1} size %`} value={overlay.width * 100} min={10} max={100} step={1} change={size => overlayChange(overlay.id, { width: size / 100, height: size / 100, x: Math.min(overlay.x, 1 - size / 100), y: Math.min(overlay.y, 1 - size / 100) })} />
              <NumberField label={`B-roll ${index + 1} X %`} value={overlay.x * 100} max={(1 - overlay.width) * 100} step={1} change={x => overlayChange(overlay.id, { x: x / 100 })} /><NumberField label={`B-roll ${index + 1} Y %`} value={overlay.y * 100} max={(1 - overlay.height) * 100} step={1} change={y => overlayChange(overlay.id, { y: y / 100 })} /></div>
            <div className="flex flex-wrap gap-2"><button className={BTN_SECONDARY} onClick={() => overlayChange(overlay.id, { width: 0.35, height: 0.35, x: 0.6, y: 0.05 })}>Picture-in-picture</button><button className={BTN_SECONDARY} onClick={() => overlayChange(overlay.id, { width: 1, height: 1, x: 0, y: 0 })}>Full frame</button><button className={BTN_SECONDARY} onClick={() => change({ ...project, overlays: project.overlays.filter(o => o.id !== overlay.id) })}>Remove B-roll</button></div>
            <label className="text-xs">Replace B-roll<input aria-label={`Replace B-roll ${index + 1}`} type="file" accept="video/*" onChange={event => void upload(event.target.files, 'overlay', overlay.id)} /></label>
          </div>)}
        </section>
        <section id="creative-Audio" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0">Voice & music</h3>
          <label className="text-xs">Upload music<input aria-label="Upload music" type="file" accept="audio/*" className="block w-full text-xs" onChange={event => { void upload(event.target.files, 'music'); event.target.value = ''; }} /></label>
          {project.music && <><span className="text-xs break-words">{project.music.name}</span><button className={BTN_SECONDARY} onClick={() => change({ ...project, music: null })}>Remove music</button><NumberField label="Music start offset" value={project.musicOffset} max={project.music.duration} change={musicOffset => change({ ...project, musicOffset })} /></>}
          <Slider label="Original audio" value={settings.sourceVolume} min={0} max={1} step={0.05} onChange={sourceVolume => patch({ sourceVolume })} />
          <Slider label="Music volume" value={settings.musicVolume} min={0} max={1} step={0.05} onChange={musicVolume => patch({ musicVolume })} />
          <label className="text-sm"><input type="checkbox" checked={settings.ducking} onChange={event => patch({ ducking: event.target.checked })} /> Lower music during speech</label>
          <label className="text-sm"><input type="checkbox" checked={settings.cleanup} onChange={event => patch({ cleanup: event.target.checked })} /> Voice cleanup · rumble filter & noise gate</label>
          <label className="text-sm"><input type="checkbox" checked={settings.normalize} onChange={event => patch({ normalize: event.target.checked })} /> Normalize voice level</label>
        </section>
        <section id="creative-Look" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0">Look & motion</h3>
          <label className="text-sm"><input type="checkbox" checked={settings.portrait} onChange={event => patch({ portrait: event.target.checked })} /> Portrait canvas · 1080 × 1920</label>
          <div className="flex flex-wrap gap-2">{LOOKS.map(look => <button key={look.id} aria-pressed={settings.look === look.id} className={settings.look === look.id ? BTN_PRIMARY : BTN_SECONDARY} onClick={() => patch({ look: look.id })}>{look.name}</button>)}</div>
          <Slider label="Brightness" value={settings.brightness} min={0.5} max={1.5} step={0.05} onChange={brightness => patch({ brightness })} />
          <Slider label="Contrast" value={settings.contrast} min={0.5} max={1.5} step={0.05} onChange={contrast => patch({ contrast })} />
          <Slider label="Saturation" value={settings.saturation} min={0} max={2} step={0.05} onChange={saturation => patch({ saturation })} />
          <label className="text-xs">Motion<select aria-label="Motion" className={INPUT} value={settings.motion} onChange={event => patch({ motion: event.target.value as Motion })}><option value="none">None</option><option value="push">Slow zoom</option><option value="pulse">Beat zoom</option><option value="shake">Shake</option><option value="flash">Beat flash</option></select></label>
          <Slider label="Intensity" value={settings.intensity} min={0} max={1} step={0.05} onChange={intensity => patch({ intensity })} />
          <Slider label="BPM" value={settings.bpm} min={40} max={240} step={1} onChange={bpm => patch({ bpm })} />
          <label className="text-xs">Text<textarea aria-label="Text" className={INPUT} value={settings.text} maxLength={300} onChange={event => patch({ text: event.target.value })} /></label>
          <label className="text-xs">Text colour<input type="color" aria-label="Text colour" value={settings.textColor} onChange={event => patch({ textColor: event.target.value })} /></label>
          <Slider label="Text size" value={settings.textSize} min={2} max={15} step={0.5} onChange={textSize => patch({ textSize })} />
          <Slider label="Text position" value={settings.textY} min={10} max={90} step={1} onChange={textY => patch({ textY })} />
        </section>
        <section id="creative-Timing" className="flex flex-col gap-3 rounded-lg border border-edge-medium bg-surface-1 p-4 scroll-mt-2"><h3 className="font-semibold m-0">Timing</h3>
          <Slider label="Start" value={settings.start} min={0} max={Math.max(0, settings.end - 0.1)} step={0.1} onChange={start => patch({ start })} />
          <Slider label="End" value={settings.end} min={settings.start + 0.1} max={Math.max(settings.end, state.video.duration)} step={0.1} onChange={end => patch({ end })} />
          <Slider label="Speed" value={settings.speed} min={0.5} max={2} step={0.1} onChange={speed => patch({ speed })} />
          <label className="text-sm"><input type="checkbox" checked={project.useTimelineCuts} onChange={event => change({ ...project, useTimelineCuts: event.target.checked })} /> Include Timeline cuts</label>
          <label className="text-sm"><input type="checkbox" checked={settings.beatCuts} onChange={event => patch({ beatCuts: event.target.checked })} /> Beat jump cuts</label>
          <p className="text-xs text-fg-muted m-0">Beat cuts use the BPM grid and may cut speech. Preview before exporting.</p>
          <button className={BTN_SECONDARY} onClick={() => void analyze()}>Detect & remove silences</button>
          {!!project.silences.length && <div className="flex flex-col gap-3" aria-label="Editable pause cuts"><p className="text-xs text-fg-muted m-0">Pause cuts use original video seconds. Change their boundaries or restore any cut.</p>
            {project.silences.map((range, index) => <div key={index} className="border border-edge-medium rounded-md p-3 flex flex-col gap-2" data-testid="pause-cut">
              <div className="grid grid-cols-2 gap-2"><NumberField label={`Pause cut ${index + 1} start`} value={range.start} max={range.end - 0.05} change={start => change({ ...project, silences: project.silences.map((r, i) => i === index ? { ...r, start } : r) })} /><NumberField label={`Pause cut ${index + 1} end`} value={range.end} min={range.start + 0.05} max={state.video.duration || settings.end} change={end => change({ ...project, silences: project.silences.map((r, i) => i === index ? { ...r, end } : r) })} /></div>
              <button className={BTN_SECONDARY} onClick={() => change({ ...project, silences: project.silences.filter((_, i) => i !== index) })}>Restore pause cut {index + 1}</button>
            </div>)}
          </div>}
          {!!project.silences.length && <button className={BTN_SECONDARY} onClick={() => change({ ...project, silences: [] })}>Restore detected silences</button>}
        </section>
      </fieldset>
      </div>
      </div>
    </div>
  </section>;
}
