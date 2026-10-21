import { UiText, useTranslation } from '@ui/i18n/Locale';
import type { Document } from '@tscaps/engine';
import type { CreativeProject, CreativeSpan } from '@core/creative/CreativeProject';

export function StudioTimeline({ spans, project, document, time, duration, disabled, onSeek }: {
  spans: readonly CreativeSpan[]; project: CreativeProject; document: Document | null;
  time: number; duration: number; disabled: boolean; onSeek: (time: number) => void;
}) {
  const { t } = useTranslation();
  const words = document?.getWords() ?? [];
  const position = (start: number, end: number) => ({ left: `${start / Math.max(duration, 0.001) * 100}%`, width: `${(end - start) / Math.max(duration, 0.001) * 100}%` });
  return <section className="studio-timeline" aria-label={t("Creative timeline")}>
    <div className="studio-timeline-heading"><strong><UiText text="Timeline" /></strong><span>{spans.length}<UiText text=" video segments" /></span><span>{duration.toFixed(1)}<UiText text=" seconds" /></span></div>
    <div className="studio-time-ruler"><span><UiText text="Time" /></span><div>{Array.from({ length: 6 }, (_, i) => <span key={i}>{(duration * i / 5).toFixed(1)}s</span>)}</div></div>
    <label className="studio-timeline-scrubber"><span className="sr-only"><UiText text="Timeline playhead" /></span><input aria-label={t("Timeline playhead")} type="range" min={0} max={Math.max(0, duration - 0.001)} step={0.033333} value={Math.min(time, Math.max(0, duration - 0.001))} disabled={disabled} onChange={e => onSeek(Number(e.target.value))} /></label>
    <div className="studio-track"><span><UiText text="Video" /></span><div className="studio-track-lane">
      {spans.map((span, i) => <button type="button" key={`${span.clip.id}-${i}`} disabled={disabled} style={position(span.outputStart, span.outputEnd)} title={`${span.clip.asset?.name ?? 'Original video'} · ${span.outputStart.toFixed(1)}–${span.outputEnd.toFixed(1)}s`} onClick={() => onSeek(span.outputStart)}>{span.clip.asset?.name ?? t('Original clip')} · {i + 1}</button>)}
      <i className="studio-track-playhead" style={{ left: `${Math.min(100, time / Math.max(duration, 0.001) * 100)}%` }} />
    </div></div>
    <div className="studio-track studio-track-captions"><span><UiText text="Captions" /></span><div className="studio-track-lane">
      {spans.filter(span => !span.clip.asset).map((span, i) => {
        const visible = words.filter(word => word.time.end > span.sourceStart && word.time.start < span.sourceEnd);
        if (!visible.length) return null;
        const start = span.outputStart + (Math.max(span.sourceStart, visible[0]!.time.start) - span.sourceStart) / project.settings.speed;
        const end = span.outputStart + (Math.min(span.sourceEnd, visible.at(-1)!.time.end) - span.sourceStart) / project.settings.speed;
        const text = visible.map(word => word.text).join(' ');
        return <button type="button" disabled={disabled} key={`${span.clip.id}-${i}`} style={position(start, end)} title={text} onClick={() => onSeek(start)}>{text}</button>;
      })}
      {!words.length && <small><UiText text="No captions yet" /></small>}
    </div></div>
    <div className="studio-track studio-track-audio"><span><UiText text="Audio" /></span><div className="studio-track-lane"><button type="button" disabled={disabled || duration <= 0} style={{ width: '100%' }} onClick={() => onSeek(0)}><UiText text="Original audio · " />{project.settings.sourceVolume === 0 ? t('Muted') : project.settings.cleanup ? t('Voice cleanup enabled') : t('Source mix')}{project.music ? ` + ${project.music.name}` : ''}</button></div></div>
    <footer><span><UiText text="30 fps" /></span><span>{project.settings.portrait ? '1080 × 1920' : t('Original aspect ratio')}</span><span><UiText text="All edits are reversible" /></span></footer>
  </section>;
}
