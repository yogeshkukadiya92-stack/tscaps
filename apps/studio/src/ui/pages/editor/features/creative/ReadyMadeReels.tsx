import { ReelTemplateSampleCard, ReelTemplateSampleDialog } from '@ui/pages/editor/features/creative/ReelTemplateSample';
import { useEffect, useRef, useState } from 'react';
import { REEL_TEMPLATES, REEL_TEMPLATE_CATEGORIES, reelTemplateDuration, type ReelTemplate } from '@core/creative/ReelTemplates';
import { createTemplateMusic } from '@core/creative/ReelTemplateMusic';
import { BTN_PRIMARY, BTN_SECONDARY } from '@ui/_shared/styles/buttons';

export function ReadyMadeReels({ locked, onBuild, onSamplePreview }: { locked: boolean; onSamplePreview: () => void; onBuild: (template: ReelTemplate, files: readonly File[], title: string, music: boolean) => Promise<void> }) {
  const [selected, setSelected] = useState(REEL_TEMPLATES[0]!);
  const [category, setCategory] = useState('All'), [query, setQuery] = useState('');
  const [files, setFiles] = useState<File[]>([]), [title, setTitle] = useState(''), [music, setMusic] = useState(true);
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [limit, setLimit] = useState(6);
  const [musicUrl, setMusicUrl] = useState('');
  const [hovered, setHovered] = useState<string | null>(null), [sample, setSample] = useState<ReelTemplate | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  const matches = REEL_TEMPLATES.filter(t => (category === 'All' || t.category === category) && `${t.name} ${t.description} ${t.category}`.toLowerCase().includes(query.toLowerCase()));
  useEffect(() => () => { if (musicUrl) URL.revokeObjectURL(musicUrl); }, [musicUrl]);
  async function build() {
    setWorking(true); setError('');
    try { await onBuild(selected, files, title, music); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not build this reel.'); }
    finally { setWorking(false); }
  }
  return <section aria-label="Ready-made reels" className="flex flex-col gap-3 p-4 rounded-lg border border-edge-medium bg-surface-1">
    <h3 className="font-semibold m-0">Ready-made reels</h3>
    <p className="text-xs text-fg-muted m-0">30 complete arrangements. Choose a template, add your photos or videos, then build your reel. Music, beat timing, colour and motion are included.</p>
    <fieldset disabled={locked || working} className="border-0 p-0 m-0 flex flex-col gap-3 min-w-0">
      <input type="search" aria-label="Search ready-made reels" placeholder="Travel, wedding, product, fashion…" value={query} onChange={e => { setQuery(e.target.value); setLimit(6); }} className="w-full bg-surface-2 rounded-md border border-edge-medium p-2 text-sm" />
      <div className="flex flex-wrap gap-2" role="group" aria-label="Ready-made reel categories">{REEL_TEMPLATE_CATEGORIES.map(c => <button type="button" key={c} aria-pressed={category === c} className={`text-xs border rounded-full px-3 py-1 ${category === c ? 'border-accent text-accent' : 'border-edge-medium'}`} onClick={() => { setCategory(c); setLimit(6); }}>{c}</button>)}</div>
      <p className="text-xs text-fg-muted m-0">Hover or focus to preview. Watch sample opens the video with music; selecting a template keeps your current edit until you build.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{matches.slice(0, limit).map(t => <ReelTemplateSampleCard key={t.id} template={t} selected={selected.id === t.id} active={hovered === t.id && !sample && !locked && !working}
        onActivate={active => setHovered(active ? t.id : null)}
        onSelect={() => { audio.current?.pause(); setMusicUrl(''); setSelected(t); }}
        onWatch={() => { audio.current?.pause(); setHovered(null); onSamplePreview(); setSample(t); }} />)}</div>
      {!matches.length && <p className="text-sm">No matching templates. Try another search.</p>}
      {matches.length > limit && <button type="button" className={BTN_SECONDARY} onClick={() => setLimit(n => n + 6)}>Show more templates</button>}
      <div className="border-t border-edge-medium pt-3 flex flex-col gap-3">
        <p className="text-sm m-0"><strong>{selected.name}</strong> · {selected.look} · {selected.motion} motion</p>
        <label className="text-xs">Photos & videos<input type="file" aria-label="Template photos and videos" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,.jpg,.jpeg,.png,.webp,.mp4,.webm,.mov" multiple className="block w-full mt-1" onChange={e => { setFiles(Array.from(e.target.files ?? [])); setError(''); e.target.value = ''; }} /></label>
        <p className="text-xs text-fg-muted m-0">{files.length ? `${files.length} selected · ${Math.max(files.length, selected.beats.length)} scenes · ${reelTemplateDuration(selected, files.length).toFixed(1)}s. Used in selection order; fewer files repeat, extra files extend the arrangement.` : 'No files selected: the template will use your current original video.'} Photos fill the vertical frame with a centre crop. Original clip sound is muted; change it in Audio.</p>
        {files.length > 0 && <><ol className="text-xs m-0 pl-4">{files.map((file, i) => <li key={i} className="mb-1 break-words">{file.name} <button type="button" disabled={i === 0} className="text-accent px-1" aria-label={`Move ${file.name} earlier`} onClick={() => setFiles(current => { const next = [...current]; [next[i - 1], next[i]] = [next[i]!, next[i - 1]!]; return next; })}>↑</button><button type="button" className="text-accent px-1" aria-label={`Remove ${file.name}`} onClick={() => setFiles(current => current.filter((_, n) => n !== i))}>Remove</button></li>)}</ol><button type="button" className={BTN_SECONDARY} onClick={() => setFiles([])}>Use current original video</button></>}
        <label className="text-xs">Title (optional)<input aria-label="Reel template title" maxLength={300} value={title} onChange={e => setTitle(e.target.value)} className="block w-full rounded-md bg-surface-2 border border-edge-medium p-2 mt-1" placeholder="Your story…" /></label>
        <label className="text-xs"><input type="checkbox" checked={music} onChange={e => setMusic(e.target.checked)} /> Include preset instrumental music</label>
        <p className="text-xs text-fg-muted m-0">Original synthesised instrumental · {selected.music} · {selected.bpm} BPM. Upload your own track in Audio any time.</p>
        <button type="button" className={BTN_SECONDARY} onClick={() => { try { setMusicUrl(URL.createObjectURL(createTemplateMusic(selected.music, selected.bpm))); } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not prepare music.'); } }}>Listen to preset music</button>
        {musicUrl && <audio ref={audio} controls src={musicUrl} className="w-full" />}
        <p className="text-xs text-fg-muted m-0">Build replaces the current creative arrangement. Undo restores it. Caption text and styles stay available on the original video; new media does not receive automatic subtitles.</p>
        <button type="button" className={BTN_PRIMARY} onClick={() => void build()}>{working ? 'Building your reel…' : 'Build reel automatically'}</button>
      </div>
    </fieldset>
    {sample && <ReelTemplateSampleDialog key={sample.id} template={sample} onClose={() => setSample(null)} onSelect={() => { setSelected(sample); setMusicUrl(''); setSample(null); }} />}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </section>;
}
