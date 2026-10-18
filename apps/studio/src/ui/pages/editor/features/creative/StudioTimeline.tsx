import type { Document } from '@tscaps/engine';
import type { CreativeProject, CreativeSpan } from '@core/creative/CreativeProject';

export function StudioTimeline({ spans, project, document, time, duration, disabled, onSeek }: {
  spans: readonly CreativeSpan[]; project: CreativeProject; document: Document | null;
  time: number; duration: number; disabled: boolean; onSeek: (time: number) => void;
}) {
  const words = document?.getWords() ?? [];
  const position = (start: number, end: number) => ({ left: `${start / Math.max(duration, 0.001) * 100}%`, width: `${(end - start) / Math.max(duration, 0.001) * 100}%` });
  return <section className="studio-timeline" aria-label="Creative timeline">
    <div className="studio-timeline-heading"><strong>Timeline</strong><span>{spans.length} video segments</span><span>{duration.toFixed(1)} seconds</span></div>
    <div className="studio-time-ruler"><span>Time</span><div>{Array.from({ length: 6 }, (_, i) => <span key={i}>{(duration * i / 5).toFixed(1)}s</span>)}</div></div>
    <label className="studio-timeline-scrubber"><span className="sr-only">Timeline playhead</span><input aria-label="Timeline playhead" type="range" min={0} max={Math.max(0, duration - 0.001)} step={0.033333} value={Math.min(time, Math.max(0, duration - 0.001))} disabled={disabled} onChange={e => onSeek(Number(e.target.value))} /></label>
    <div className="studio-track"><span>Video</span><div className="studio-track-lane">
      {spans.map((span, i) => <button type="button" key={`${span.clip.id}-${i}`} disabled={disabled} style={position(span.outputStart, span.outputEnd)} title={`${span.clip.asset?.name ?? 'Original video'} · ${span.outputStart.toFixed(1)}–${span.outputEnd.toFixed(1)}s`} onClick={() => onSeek(span.outputStart)}>{span.clip.asset?.name ?? 'Original clip'} · {i + 1}</button>)}
      <i className="studio-track-playhead" style={{ left: `${Math.min(100, time / Math.max(duration, 0.001) * 100)}%` }} />
    </div></div>
    <div className="studio-track studio-track-captions"><span>Captions</span><div className="studio-track-lane">
      {spans.filter(span => !span.clip.asset).map((span, i) => {
        const visible = words.filter(word => word.time.end > span.sourceStart && word.time.start < span.sourceEnd);
        if (!visible.length) return null;
        const start = span.outputStart + (Math.max(span.sourceStart, visible[0]!.time.start) - span.sourceStart) / project.settings.speed;
        const end = span.outputStart + (Math.min(span.sourceEnd, visible.at(-1)!.time.end) - span.sourceStart) / project.settings.speed;
        const text = visible.map(word => word.text).join(' ');
        return <button type="button" disabled={disabled} key={`${span.clip.id}-${i}`} style={position(start, end)} title={text} onClick={() => onSeek(start)}>{text}</button>;
      })}
      {!words.length && <small>No captions yet</small>}
    </div></div>
    <div className="studio-track studio-track-audio"><span>Audio</span><div className="studio-track-lane"><button type="button" disabled={disabled || duration <= 0} style={{ width: '100%' }} onClick={() => onSeek(0)}>Original audio · {project.settings.sourceVolume === 0 ? 'Muted' : project.settings.cleanup ? 'Voice cleanup enabled' : 'Source mix'}{project.music ? ` + ${project.music.name}` : ''}</button></div></div>
    <footer><span>30 fps</span><span>{project.settings.portrait ? '1080 × 1920' : 'Original aspect ratio'}</span><span>All edits are reversible</span></footer>
  </section>;
}
