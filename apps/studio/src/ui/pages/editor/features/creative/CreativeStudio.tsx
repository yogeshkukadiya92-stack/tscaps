import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, Play, Square, Sparkles, X } from 'lucide-react';
import type { EditorState } from '@core/editor/domain/EditorState';
import { useVideos } from '@ui/_shared/contexts/modules/VideosContext';
import { usePlayback } from '@ui/pages/editor/contexts/PlaybackContext';
import { AppDialog } from '@ui/_shared/components/Dialog/AppDialog';
import { Slider } from '@ui/_shared/components/controls/fields/Slider';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SECONDARY_SM } from '@ui/_shared/styles/buttons';
import { buildCuts, DEFAULT_SETTINGS, editedDuration, findSilences, LOOKS, paintFrame, type CreativeSettings, type EditRange, type Motion } from '@ui/pages/editor/features/creative/creativeModel';

const INPUT = 'w-full bg-surface-1 border border-edge-medium rounded-sm p-2 text-sm text-fg-primary';
const MOTIONS: { id: Motion; name: string }[] = [
  { id: 'none', name: 'None' }, { id: 'push', name: 'Slow zoom' },
  { id: 'pulse', name: 'Beat zoom' }, { id: 'shake', name: 'Shake' }, { id: 'flash', name: 'Beat flash' },
];

function waitForMedia(media: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error('The media took too long to load. Try another file.')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timeout); media.removeEventListener(event, done); media.removeEventListener('error', failed);
      if (error) reject(error); else resolve();
    };
    const done = () => finish();
    const failed = () => finish(new Error('Your browser could not decode this media file.'));
    media.addEventListener(event, done, { once: true });
    media.addEventListener('error', failed, { once: true });
  });
}

function outputTime(time: number, settings: CreativeSettings, cuts: readonly EditRange[]): number {
  const removed = cuts.reduce((sum, r) => sum + Math.max(0, Math.min(time, r.end) - r.start), 0);
  return Math.max(0, time - settings.start - removed) / settings.speed;
}

/** A pre-caption editing pass: the rendered result can become a fresh caption project. */
export function CreativeStudio({ state }: { state: EditorState }) {
  const videos = useVideos();
  const playback = usePlayback();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function launch() {
    setLoading(true); setError(''); playback.pause();
    try {
      let source = await videos.resolver.readableFileInEditor();
      if (!source) {
        const stored = await videos.resolver.readableFileFromStorage();
        if (stored.outcome === 'found') source = stored.file;
      }
      if (!source) throw new Error('Choose the original video again to open Creative Studio.');
      setFile(source); setOpen(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open the video.'); }
    finally { setLoading(false); }
  }

  return <div className="h-full overflow-y-auto bg-surface-1 border border-edge-medium rounded-lg p-4 flex flex-col gap-4">
    <Clapperboard size={28} className="text-accent" />
    <h2 className="text-lg font-semibold text-fg-primary m-0">Creative Studio</h2>
    <p className="text-sm text-fg-secondary m-0 leading-relaxed">Give your reel a signature look. Mix music, add a title, cut pauses, and sync motion to your beat.</p>
    <div className="text-xs text-fg-muted leading-relaxed">6 looks · 5 motion styles · smart silence cuts · beat jump cuts · trim · speed · music · text</div>
    <button className={BTN_PRIMARY} disabled={loading} onClick={() => void launch()}><Sparkles size={16} />{loading ? 'Opening…' : 'Open Creative Studio'}</button>
    <p className="text-xs text-fg-muted m-0">Use this before adding captions. You can also choose a previously exported captioned video inside the studio to add effects to it.</p>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    {open && file && <StudioSession file={file} existingCuts={state.cuts.list().map(r => ({ start: r.startSec, end: r.endSec }))}
      onClose={() => setOpen(false)} onCaption={result => { setOpen(false); videos.actions.load.execute(result); }} />}
  </div>;
}

function StudioSession({ file: initialFile, existingCuts, onClose, onCaption }: {
  file: File; existingCuts: readonly EditRange[]; onClose: () => void; onCaption: (file: File) => void;
}) {
  const [source, setSource] = useState(initialFile);
  const sourceUrl = useMemo(() => URL.createObjectURL(source), [source]);
  const [settings, setSettings] = useState<CreativeSettings>({ ...DEFAULT_SETTINGS });
  const [silences, setSilences] = useState<EditRange[]>([]);
  const [useTimelineCuts, setUseTimelineCuts] = useState(true);
  const [music, setMusic] = useState<File | null>(null);
  const musicUrl = useMemo(() => music ? URL.createObjectURL(music) : '', [music]);
  const [ready, setReady] = useState(false);
  const [sourceDuration, setSourceDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<File | null>(null);
  const [notice, setNotice] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const cancelRef = useRef(false);
  const audioRef = useRef<{ context: AudioContext; destination: MediaStreamAudioDestinationNode; sourceGain: GainNode; musicGain: GainNode; monitor: GainNode } | null>(null);
  const cuts = useMemo(() => buildCuts(settings, silences, useTimelineCuts ? existingCuts : []), [settings, silences, existingCuts, useTimelineCuts]);
  const duration = editedDuration(settings, cuts);
  const live = useRef({ settings, cuts, busy });
  useLayoutEffect(() => { live.current = { settings, cuts, busy }; }, [settings, cuts, busy]);

  const patch = (values: Partial<CreativeSettings>) => { setResult(null); setSettings(s => ({ ...s, ...values })); };
  useEffect(() => () => URL.revokeObjectURL(sourceUrl), [sourceUrl]);
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  useEffect(() => () => {
    cancelRef.current = true;
    if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
    void audioRef.current?.context.close();
  }, []);

  // Preview and recording share the exact same canvas renderer and time mapping.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const video = videoRef.current, canvas = canvasRef.current, soundtrack = musicRef.current;
      const current = live.current;
      if (video && canvas && video.readyState >= 2) {
        const s = current.settings;
        if (!video.paused && !video.seeking) {
          const cut = current.cuts.find(r => video.currentTime >= r.start && video.currentTime < r.end);
          if (cut) video.currentTime = Math.min(cut.end, s.end);
          if (video.currentTime >= s.end - 0.015) {
            video.pause(); soundtrack?.pause(); setPlaying(false);
            if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
          }
        }
        const time = outputTime(video.currentTime, s, current.cuts);
        if (soundtrack && !video.paused && Number.isFinite(soundtrack.duration) && soundtrack.duration > 0) {
          const target = time % soundtrack.duration;
          if (Math.abs(soundtrack.currentTime - target) > 0.18) soundtrack.currentTime = target;
        }
        // Do not record a stale pre-seek frame during a jump cut.
        if (!video.seeking) paintFrame(canvas, video, s, time);
        if (current.busy) setProgress(Math.min(99, time / Math.max(0.1, editedDuration(s, current.cuts)) * 100));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = settings.speed;
    if (audioRef.current) {
      audioRef.current.sourceGain.gain.value = settings.sourceVolume;
      audioRef.current.musicGain.gain.value = settings.musicVolume;
    }
  }, [settings.speed, settings.sourceVolume, settings.musicVolume]);

  async function prepareAudio() {
    const video = videoRef.current!, soundtrack = musicRef.current!;
    if (!audioRef.current) {
      const context = new AudioContext();
      const destination = context.createMediaStreamDestination();
      const sourceGain = context.createGain(), musicGain = context.createGain(), monitor = context.createGain();
      const mix = context.createDynamicsCompressor();
      context.createMediaElementSource(video).connect(sourceGain).connect(mix);
      context.createMediaElementSource(soundtrack).connect(musicGain).connect(mix);
      mix.connect(destination); mix.connect(monitor).connect(context.destination);
      audioRef.current = { context, destination, sourceGain, musicGain, monitor };
    }
    const audio = audioRef.current;
    audio.sourceGain.gain.value = settings.sourceVolume;
    audio.musicGain.gain.value = settings.musicVolume;
    audio.monitor.gain.value = 1;
    await audio.context.resume();
    return audio;
  }

  async function play(fromStart = false) {
    const video = videoRef.current!, soundtrack = musicRef.current!;
    await prepareAudio();
    if (fromStart || video.currentTime >= settings.end || video.currentTime < settings.start) {
      if (Math.abs(video.currentTime - settings.start) > 0.001) {
        const seek = waitForMedia(video, 'seeked'); video.currentTime = settings.start; await seek;
      }
    }
    video.playbackRate = settings.speed;
    if (music) {
      if (soundtrack.readyState < 2) await waitForMedia(soundtrack, 'canplay');
      soundtrack.currentTime = outputTime(video.currentTime, settings, cuts) % soundtrack.duration;
      await soundtrack.play();
    }
    await video.play(); setPlaying(true);
  }

  const stop = useCallback(() => { videoRef.current?.pause(); musicRef.current?.pause(); setPlaying(false); }, []);

  async function analyze() {
    setAnalyzing(true); setError(''); stop();
    const context = new AudioContext();
    try {
      const buffer = await context.decodeAudioData(await source.arrayBuffer());
      const found = findSilences(buffer); setSilences(found); setResult(null);
      setNotice(found.length ? `${found.length} quiet gaps removed. Preview to check the cuts.` : 'No quiet gaps longer than half a second were found.');
    } catch { setError('This browser could not analyze the audio. Use the existing Timeline silence tool, or try an MP4 with AAC audio.'); }
    finally { await context.close(); setAnalyzing(false); }
  }

  async function render() {
    setError(''); setResult(null); setBusy(true); setProgress(0); cancelRef.current = false; stop();
    let stream: MediaStream | null = null;
    try {
      if (typeof MediaRecorder === 'undefined' || !canvasRef.current?.captureStream) throw new Error('Creative export requires a browser with canvas recording support, such as Chrome.');
      if (duration < 0.1) throw new Error('Keep at least 0.1 seconds of video.');
      const mime = ['video/mp4;codecs=avc1.42001E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus'].find(t => MediaRecorder.isTypeSupported(t));
      if (!mime) throw new Error('Your browser does not support a compatible video encoder.');
      const video = videoRef.current!, canvas = canvasRef.current!;
      const audio = await prepareAudio();
      if (cancelRef.current) return;
      if (Math.abs(video.currentTime - settings.start) > 0.001) {
        const seek = waitForMedia(video, 'seeked'); video.currentTime = settings.start; await seek;
      }
      if (cancelRef.current) return;
      paintFrame(canvas, video, settings, 0);
      stream = canvas.captureStream(30);
      for (const track of audio.destination.stream.getAudioTracks()) stream.addTrack(track.clone());
      const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      const finished = new Promise<void>((resolve, reject) => {
        recorder.onstop = () => resolve();
        recorder.onerror = () => reject(new Error('Video recording failed. Try a shorter reel.'));
      });
      recorder.start(500);
      await play(true);
      if (cancelRef.current) { stop(); if (recorder.state !== 'inactive') recorder.stop(); }
      await finished;
      if (!cancelRef.current) {
        const extension = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
        const output = new File(chunks, `${source.name.replace(/\.[^.]+$/, '')}-reelstudio.${extension}`, { type: mime.split(';')[0]! });
        if (!output.size) throw new Error('The encoder returned an empty file.');
        setResult(output); setProgress(100);
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not render the reel.'); }
    finally {
      stop();
      if (recorderRef.current?.state !== 'inactive') recorderRef.current?.stop();
      recorderRef.current = null; stream?.getTracks().forEach(t => t.stop()); setBusy(false);
    }
  }

  const cancel = useCallback(() => {
    cancelRef.current = true; stop();
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
  }, [stop]);

  // A background tab throttles canvas painting; stop instead of handing out a damaged reel.
  useEffect(() => {
    const hidden = () => { if (document.hidden && live.current.busy) { cancel(); setError('Export stopped because the tab was hidden. Keep this tab visible during export.'); } };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [cancel]);

  function download() {
    if (!result) return;
    const url = URL.createObjectURL(result);
    const a = document.createElement('a'); a.href = url; a.download = result.name; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  return <AppDialog open onClose={onClose} locked={busy || analyzing} size="xl" title="Creative Studio" showCloseButton
    description="Style your reel, then render it or continue with captions in a new project.">
    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
      <div className="flex flex-col gap-3 md:sticky md:top-0 self-start">
        <video ref={videoRef} src={sourceUrl} playsInline preload="auto" className="hidden"
          onSeeking={() => {
            if (recorderRef.current?.state === 'recording') recorderRef.current.pause();
            musicRef.current?.pause();
          }}
          onSeeked={() => {
            const video = videoRef.current!;
            if (video.paused || cancelRef.current) return;
            if (recorderRef.current?.state === 'paused') recorderRef.current.resume();
            if (music) void musicRef.current?.play().catch(() => { cancel(); setError('Music playback failed. Choose another audio file.'); });
          }}
          onError={() => { setReady(false); setError('This video cannot be decoded. Choose another video.'); cancel(); }}
          onLoadedMetadata={() => {
            const video = videoRef.current!, canvas = canvasRef.current!;
            const scale = Math.min(1, 1080 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
            canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
            setSourceDuration(video.duration);
            patch({ start: 0, end: video.duration });
          }} onLoadedData={() => setReady(true)} onEnded={() => { stop(); if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop(); }} />
        <audio ref={musicRef} src={musicUrl || undefined} loop preload="auto" onError={() => setError('This music file cannot be decoded. Choose another audio file.')} />
        <canvas ref={canvasRef} className="w-full max-h-[42vh] object-contain rounded-lg bg-black" aria-label="Creative reel preview" />
        <div className="flex items-center justify-between gap-2">
          <button className={BTN_SECONDARY_SM} disabled={!ready || busy || analyzing} onClick={() => {
            if (playing) stop(); else void play().catch(cause => { stop(); setError(String(cause)); });
          }}>{playing ? <Square size={14} /> : <Play size={14} />}{playing ? 'Pause' : 'Preview'}</button>
          <span className="text-xs text-fg-muted">{duration.toFixed(1)}s · up to 1080p · 30 fps</span>
        </div>
        <p className="text-xs text-fg-muted m-0">The preview includes these creative edits. Existing caption styles are added afterward. To keep captions already rendered, choose that exported video below.</p>
        <label className="text-xs text-fg-secondary">Choose another video
          <input type="file" accept="video/*" className="block mt-1 w-full text-xs" disabled={busy || analyzing} onChange={e => {
            const next = e.target.files?.[0]; if (!next) return;
            stop(); setReady(false); setSource(next); setSilences([]); setUseTimelineCuts(false); setResult(null); setError(''); setNotice('');
          }} />
        </label>
        {error && <p className="text-sm text-danger m-0" role="alert">{error}</p>}
        {notice && <p className="text-xs text-fg-secondary m-0" role="status">{notice}</p>}
        {busy ? <div className="flex flex-col gap-2">
          <progress max={100} value={progress} className="w-full accent-accent" aria-label="Creative export progress" />
          <span className="text-xs text-fg-muted">Rendering {Math.round(progress)}% — keep this tab visible. Export runs at playback speed.</span>
          <button className={BTN_SECONDARY} onClick={cancel}><X size={16} />Cancel export</button>
        </div> : <button className={BTN_PRIMARY} disabled={!ready || analyzing || duration < 0.1} onClick={() => void render()}><Sparkles size={16} />Render edited reel</button>}
        {result && <div className="flex flex-col gap-2" role="status">
          <span className="text-xs text-fg-secondary">Ready · {result.type === 'video/mp4' ? 'MP4' : 'WebM'} · {(result.size / 1024 / 1024).toFixed(1)} MB</span>
          <button className={BTN_PRIMARY} onClick={download}><Download size={16} />Download reel</button>
          <button className={BTN_SECONDARY} onClick={() => onCaption(result)}>Add captions in a new project</button>
        </div>}
      </div>
      <fieldset disabled={busy || analyzing} className="min-w-0 border-0 p-0 m-0 flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-fg-primary m-0">Signature looks</h3>
          <div className="grid grid-cols-3 gap-2">{LOOKS.map(look => <button key={look.id} type="button" aria-pressed={settings.look === look.id}
            className={`rounded-sm p-2 text-xs border ${settings.look === look.id ? 'border-accent text-accent bg-accent/10' : 'border-edge-medium text-fg-secondary bg-surface-1'}`} onClick={() => patch({ look: look.id })}>
            <span className="block h-5 rounded-sm mb-1" style={{ background: look.color }} />{look.name}</button>)}</div>
          <Slider label="Brightness" value={settings.brightness} min={0.5} max={1.5} step={0.05} onChange={v => patch({ brightness: v })} />
          <Slider label="Contrast" value={settings.contrast} min={0.5} max={1.8} step={0.05} onChange={v => patch({ contrast: v })} />
          <Slider label="Saturation" value={settings.saturation} min={0} max={2} step={0.05} onChange={v => patch({ saturation: v })} />
        </section>
        <section className="flex flex-col gap-3 border-t border-edge-subtle pt-4">
          <h3 className="text-sm font-semibold text-fg-primary m-0">Motion & rhythm</h3>
          <label className="text-xs text-fg-secondary">Motion<select aria-label="Motion" className={INPUT} value={settings.motion} onChange={e => patch({ motion: e.target.value as Motion })}>{MOTIONS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
          <Slider label="Intensity" value={settings.intensity} min={0} max={1} step={0.05} onChange={v => patch({ intensity: v })} />
          <Slider label="Beat BPM" value={settings.bpm} min={60} max={200} step={1} onChange={v => patch({ bpm: v })} />
          <label className="flex gap-2 text-xs text-fg-secondary"><input type="checkbox" checked={settings.beatCuts} onChange={e => patch({ beatCuts: e.target.checked })} />Beat jump cuts</label>
          <p className="text-xs text-fg-muted m-0">Set your music's BPM. Beat cuts remove small slices on that grid; preview speech before exporting.</p>
        </section>
        <section className="flex flex-col gap-3 border-t border-edge-subtle pt-4">
          <h3 className="text-sm font-semibold text-fg-primary m-0">Trim & smart cuts</h3>
          <Slider label="Start" value={settings.start} min={0} max={Math.max(0, settings.end - 0.1)} step={0.1} unit="s" onChange={v => { stop(); patch({ start: v }); if (videoRef.current) videoRef.current.currentTime = v; }} />
          <Slider label="End" value={settings.end} min={settings.start + 0.1} max={sourceDuration} step={0.1} unit="s" onChange={v => patch({ end: v })} />
          <Slider label="Speed" value={settings.speed} min={0.5} max={2} step={0.1} unit="×" onChange={v => patch({ speed: v })} />
          {existingCuts.length > 0 && source === initialFile && <label className="flex gap-2 text-xs text-fg-secondary"><input type="checkbox" checked={useTimelineCuts} onChange={e => { setUseTimelineCuts(e.target.checked); setResult(null); }} />Include {existingCuts.length} Timeline cuts</label>}
          <button className={BTN_SECONDARY_SM} disabled={!ready} onClick={() => void analyze()}>{analyzing ? 'Analyzing…' : 'Detect & remove silences'}</button>
          {silences.length > 0 && <button className={BTN_SECONDARY_SM} onClick={() => { setSilences([]); setResult(null); setNotice('Silence cuts restored.'); }}>Restore {silences.length} silence cuts</button>}
        </section>
        <section className="flex flex-col gap-3 border-t border-edge-subtle pt-4">
          <h3 className="text-sm font-semibold text-fg-primary m-0">Music mix</h3>
          <label className="text-xs text-fg-secondary">Upload music<input type="file" accept="audio/*" className="block w-full mt-1 text-xs" onChange={e => { stop(); setMusic(e.target.files?.[0] ?? null); setResult(null); }} /></label>
          {music && <div className="flex items-center justify-between gap-2 text-xs text-fg-muted"><span className="truncate">{music.name}</span><button aria-label="Remove music" onClick={() => { stop(); setMusic(null); setResult(null); }}><X size={14} /></button></div>}
          <Slider label="Original audio" value={settings.sourceVolume} min={0} max={1} step={0.05} onChange={v => patch({ sourceVolume: v })} />
          <Slider label="Music volume" value={settings.musicVolume} min={0} max={1} step={0.05} onChange={v => patch({ musicVolume: v })} />
          <p className="text-xs text-fg-muted m-0">Music loops to fit your reel and plays at its original speed.</p>
        </section>
        <section className="flex flex-col gap-3 border-t border-edge-subtle pt-4">
          <h3 className="text-sm font-semibold text-fg-primary m-0">Title overlay</h3>
          <label className="text-xs text-fg-secondary">Text<textarea className={INPUT} rows={2} maxLength={300} placeholder="Your reel's hook…" value={settings.text} onChange={e => patch({ text: e.target.value })} /></label>
          <label className="flex items-center gap-2 text-xs text-fg-secondary">Text color<input type="color" value={settings.textColor} onChange={e => patch({ textColor: e.target.value })} /></label>
          <Slider label="Text size" value={settings.textSize} min={3} max={12} step={0.5} unit="%" onChange={v => patch({ textSize: v })} />
          <Slider label="Position" value={settings.textY} min={10} max={90} step={1} unit="%" onChange={v => patch({ textY: v })} />
        </section>
        <button className={BTN_SECONDARY_SM} onClick={() => { stop(); setSettings({ ...DEFAULT_SETTINGS, end: videoRef.current?.duration ?? 0 }); setSilences([]); setUseTimelineCuts(source === initialFile); setResult(null); setNotice('Creative settings reset.'); }}>Reset creative edits</button>
      </fieldset>
    </div>
  </AppDialog>;
}
