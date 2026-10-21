import { useState } from 'react';
import { CONTENT_COPY, CONTENT_FORMATS, CONTENT_LANGUAGES, buildContentEffects, contentExample, contentScenes, type ContentDraft, type ContentFormat, type ContentLanguage } from '@core/creative/ContentFormats';
import type { MotionEffect } from '@core/creative/MotionEffects';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

const INPUT = 'w-full rounded-md border border-edge-medium bg-surface-2 p-2 text-sm';
interface DraftState { draft: ContentDraft; timings: number[] }
export function ContentFormatGallery({ locked, duration, onApply }: { locked: boolean; duration: number; onApply: (effects: MotionEffect[]) => void }) {
  const [language, setLanguage] = useState<ContentLanguage>('en');
  const [format, setFormat] = useState<ContentFormat>('talking-head');
  const [topics, setTopics] = useState<Partial<Record<ContentLanguage, string>>>({});
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const copy = CONTENT_COPY[language], index = CONTENT_FORMATS.indexOf(format), key = `${format}:${language}`;
  const topic = topics[language] ?? copy.topicDefault;
  const fallback = contentExample(format, language, topic);
  const current = drafts[key] ?? { draft: fallback, timings: [3, ...fallback.points.map(() => 5), 3] };
  const { draft, timings } = current;
  const scenes = contentScenes(format, language, draft), total = timings.reduce((a, b) => a + b, 0);
  const valid = total <= duration + 0.001 && timings.every(t => Number.isFinite(t) && t >= 1 && t <= 120) && !!draft.hook.trim() && !!draft.cta.trim() && draft.points.every(p => !!p.trim());
  function update(value: Partial<DraftState>) { setDrafts(previous => ({ ...previous, [key]: { ...current, ...value } })); setMessage(''); setError(''); }
  function edit(value: Partial<ContentDraft>) { update({ draft: { ...draft, ...value } }); }
  return <section aria-label="Content Formats" lang={language} className="flex flex-col gap-4 p-4 mb-5 rounded-lg border border-edge-medium bg-surface-1">
    <div><h3 className="font-semibold m-0">{copy.heading}</h3><p className="text-xs text-fg-muted mt-2 mb-0">{copy.intro}</p></div>
    <fieldset disabled={locked} className="border-0 p-0 m-0 min-w-0 flex flex-col gap-4">
      <label className="text-xs flex flex-col gap-1">{copy.language}<select aria-label="Content language" className={INPUT} value={language} onChange={e => { setLanguage(e.target.value as ContentLanguage); setMessage(''); setError(''); }}>{Object.entries(CONTENT_LANGUAGES).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="group" aria-label={copy.heading}>{CONTENT_FORMATS.map((id, i) => <button key={id} type="button" aria-pressed={format === id} onClick={() => { setFormat(id); setMessage(''); setError(''); }} className={`p-3 rounded-lg border text-left ${format === id ? 'border-accent bg-surface-3' : 'border-edge-medium bg-surface-2'}`}><strong className="block text-sm">{copy.names[i]}</strong><span className="block mt-1 text-xs text-fg-muted">{copy.hints[i]}</span></button>)}</div>
      <label className="text-xs flex flex-col gap-1">{copy.topic}<input className={INPUT} maxLength={40} value={topic} onChange={e => setTopics(previous => ({ ...previous, [language]: e.target.value }))} /></label>
      <button type="button" className={BTN_SECONDARY} onClick={() => update({ draft: contentExample(format, language, topic) })}>{copy.sample}</button>
      <label className="text-xs flex flex-col gap-1">{copy.hook}<input className={INPUT} maxLength={80} value={draft.hook} onChange={e => edit({ hook: e.target.value })} /></label>
      {draft.points.map((point, i) => <label key={i} className="text-xs flex flex-col gap-1">{copy.labels[index]![i]}<textarea className={INPUT} rows={2} maxLength={240} value={point} onChange={e => edit({ points: draft.points.map((old, n) => n === i ? e.target.value : old) })} /></label>)}
      <label className="text-xs flex flex-col gap-1">{copy.cta}<input className={INPUT} maxLength={80} value={draft.cta} onChange={e => edit({ cta: e.target.value })} /></label>
      <h4 className="m-0 text-sm font-semibold">{copy.preview} · {total.toFixed(1)} / {duration.toFixed(1)}s</h4>
      <ol className="list-none p-0 m-0 flex flex-col gap-2">{scenes.map((scene, i) => <li key={i} className="rounded-lg border border-edge-medium p-3 bg-surface-2"><span className="text-xs text-fg-muted">{timings.slice(0, i).reduce((a, b) => a + b, 0).toFixed(1)}s</span><strong className="block text-sm break-words mt-1" style={{ color: scene.color }}>{scene.title}</strong>{scene.body && <p className="text-sm break-words my-2 whitespace-pre-wrap">{scene.body}</p>}<label className="text-xs flex items-center gap-2 mt-2">{copy.duration}<input aria-label={`${copy.duration} ${i + 1}`} type="number" min={1} max={120} step={0.5} className="w-20 rounded border border-edge-medium bg-surface-1 p-1" value={timings[i]} onChange={e => update({ timings: timings.map((t, n) => n === i ? Number(e.target.value) : t) })} /></label></li>)}</ol>
      <p className="text-xs text-fg-muted m-0">{copy.note}</p>
      {total > duration + 0.001 && <p role="status" className="text-xs text-fg-muted m-0">{copy.short}</p>}
      <button type="button" disabled={!valid} className={BTN_PRIMARY} onClick={() => { try { onApply(buildContentEffects(format, language, draft, timings, duration)); setMessage(copy.done); setError(''); } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); } }}>{copy.apply}</button>
    </fieldset>
    {message && <p role="status" className="text-sm text-accent m-0">{message}</p>}
    {error && <p role="alert" className="text-sm text-danger m-0">{error}</p>}
  </section>;
}
